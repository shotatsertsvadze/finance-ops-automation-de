import { withTransaction } from "../../db.js";
import { NotFoundError, TransitionError, transition } from "../workflow/transitions.js";
import { RuleError } from "../approvals/approvals.js";
import { centsToDecimal, toCents } from "../money.js";

/**
 * Which booked credits reduce this payment, and by how much.
 *
 * Pure function over already-loaded rows. The ordering is part of the rule
 * rather than a detail of the query: oldest credit first, ties broken by
 * document number, so the same invoice is never paid a different amount
 * because the rows came back in a different order (ADR-050).
 *
 * Fail closed on both sides. A credit whose remaining balance cannot be read
 * is not applied, and an invoice amount that cannot be read yields no plan at
 * all rather than a payment computed from a guess.
 *
 * @param grossAmount the invoice's payable amount, as a decimal string
 * @param credits rows of `{ id, invoice_number, issue_date, open_amount }`
 */
export function planNetting(grossAmount, credits) {
  const grossCents = toCents(grossAmount);
  if (grossCents === null) return { payableCents: null, applications: [] };

  const usable = credits
    .map((credit) => ({ credit, openCents: toCents(credit.open_amount) }))
    .filter(({ openCents }) => openCents !== null && openCents > 0)
    .sort(byAgeThenNumber);

  const applications = [];
  let remaining = grossCents;
  for (const { credit, openCents } of usable) {
    if (remaining <= 0) break;
    const amountCents = Math.min(openCents, remaining);
    applications.push({ creditNoteId: credit.id, amountCents });
    remaining -= amountCents;
  }
  return { payableCents: remaining, applications };
}

/** Oldest first; two credits of the same day are ordered by their number. */
function byAgeThenNumber(a, b) {
  const dateA = String(a.credit.issue_date ?? "");
  const dateB = String(b.credit.issue_date ?? "");
  if (dateA !== dateB) return dateA < dateB ? -1 : 1;
  return String(a.credit.invoice_number ?? "").localeCompare(String(b.credit.invoice_number ?? ""));
}

/**
 * Booked credit notes of this supplier that still have something left, locked
 * for update. The lock matters: two payments to the same supplier running
 * together would otherwise both read the same open balance and both spend it.
 *
 * `excludeInvoiceId` keeps an invoice from netting against itself, which a
 * credit note would otherwise do when its own payment is instructed. The
 * invoice detail reads the same answer with `lock: false`.
 */
export async function openCreditsFor(client, supplierId, currency = "EUR", excludeInvoiceId = null, { lock = true } = {}) {
  if (!supplierId) return [];
  const { rows } = await client.query(
    `select i.id, i.invoice_number, i.issue_date,
            (i.gross_amount - coalesce((
              select sum(a.amount) from finops.credit_applications a where a.credit_note_id = i.id
            ), 0))::text as open_amount
     from finops.invoices i
     where i.supplier_id = $1
       and i.document_type = 'CREDIT_NOTE'
       and i.state = 'CREDITED'
       and coalesce(i.currency, 'EUR') = $2
       and i.id is distinct from $3
     order by i.issue_date, i.invoice_number
     ${lock ? "for update of i" : ""}`,
    [supplierId, currency, excludeInvoiceId],
  );
  return rows.filter((row) => Number(row.open_amount) > 0);
}

/**
 * Writes a netting plan to the ledger. Called inside the caller's transaction,
 * never on its own: an application that is not in the same transaction as the
 * thing it paid for is a credit spent on nothing.
 */
export async function applyCredits(client, invoiceId, applications) {
  for (const application of applications) {
    await client.query(
      "insert into finops.credit_applications (credit_note_id, invoice_id, amount) values ($1, $2, $3)",
      [application.creditNoteId, invoiceId, centsToDecimal(application.amountCents)],
    );
  }
}

/**
 * An invoice whose open credits cover it entirely. Nothing is sent to the
 * bank; the credits are consumed and the invoice ends settled against them.
 *
 * A separate action rather than a branch inside the payment instruction: a
 * person decides to settle rather than to pay, and the audit trail should say
 * which of the two they did.
 */
export async function settleByCredit({ pool }, { invoiceId, actor }) {
  return withTransaction(pool, async (client) => {
    const locked = await client.query(
      "select state, document_type, supplier_id, gross_amount, currency from finops.invoices where id = $1 for update",
      [invoiceId],
    );
    if (locked.rowCount === 0) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    const invoice = locked.rows[0];

    if (invoice.document_type === "CREDIT_NOTE") {
      throw new RuleError(422, "CREDIT_NOTE_NOT_PAYABLE", "Eine Gutschrift wird nicht bezahlt: sie mindert die Verbindlichkeit");
    }
    if (invoice.state !== "ACCOUNTING_READY") {
      throw new TransitionError("NOT_READY_FOR_PAYMENT", `Rechnung im Status ${invoice.state} kann nicht zur Zahlung gegeben werden`, { state: invoice.state });
    }

    const credits = await openCreditsFor(client, invoice.supplier_id, invoice.currency ?? "EUR", invoiceId);
    const plan = planNetting(invoice.gross_amount, credits);
    if (plan.payableCents === null) {
      throw new RuleError(422, "AMOUNTS_INCOMPLETE", "Beträge der Rechnung sind unvollständig, Zahlung nicht anweisbar");
    }
    // Anything left over is money that has to be sent, so this is not the
    // action for it. Refusing here keeps the two endings apart.
    if (plan.payableCents > 0) {
      throw new RuleError(409, "NOT_FULLY_CREDITED",
        `Die offenen Gutschriften decken die Rechnung nicht vollständig; ${centsToDecimal(plan.payableCents)} bleiben anzuweisen`);
    }

    await applyCredits(client, invoiceId, plan.applications);
    const applied = plan.applications.reduce((sum, a) => sum + a.amountCents, 0);
    await transition(client, {
      invoiceId, to: "SETTLED_BY_CREDIT", actor, action: "settled_by_credit",
      reason: `Rechnung ${invoice.gross_amount} ${invoice.currency ?? "EUR"} vollständig durch Gutschriften ausgeglichen, keine Zahlung`,
      evidence: {
        gross_amount: invoice.gross_amount,
        credit_applied: centsToDecimal(applied),
        credit_notes: plan.applications.map((a) => a.creditNoteId),
      },
    });
  });
}
