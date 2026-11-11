import { withTransaction } from "../../db.js";
import { NotFoundError, RuleError, TransitionError } from "../errors.js";
import { transition } from "../workflow/transitions.js";
import { applyCredits, openCreditsFor, planNetting } from "../accounting/netting.js";
import { centsToDecimal } from "../money.js";

/**
 * Simulated payment. No money moves: this records the instruction a bank
 * adapter would send and the confirmation it would return. The provider call
 * is the seam a real bank API replaces.
 */
const mockProvider = {
  submit: ({ idempotencyKey }) => ({ providerRef: `MOCK-${idempotencyKey.slice(0, 12)}`, accepted: true }),
};

/**
 * Approving and paying are separate hands: whoever signed an approval step of
 * this invoice neither sends its money nor confirms it (ADR-056).
 */
async function refuseApprover(client, invoiceId, actor) {
  const { rowCount } = await client.query(
    "select 1 from finops.approval_steps where invoice_id = $1 and status = 'APPROVED' and actor_id = $2",
    [invoiceId, actor.id],
  );
  if (rowCount)
    throw new RuleError(409, "APPROVER_CANNOT_PAY", "Wer die Rechnung freigegeben hat, darf ihre Zahlung weder anweisen noch bestätigen");
}

/**
 * The id a payment is known by at the bank, one per attempt, within SEPA's 35
 * characters. Issued by Nordwerk: the supplier's invoice number is neither
 * unique nor ours to rely on (ADR-063).
 */
async function nextEndToEndId(client) {
  const {
    rows: [row],
  } = await client.query("select nextval('finops.payment_end_to_end_seq') as n");
  return `NW-P-${String(row.n).padStart(8, "0")}`;
}

/** Remittance text: our id first, then the invoice number, in SEPA's characters and 140 at most. */
function remittanceText(endToEndId, invoiceNumber) {
  const text = `${endToEndId} RE ${invoiceNumber ?? ""}`.trim();
  return text.replace(/[^A-Za-z0-9/?:().,'+ -]/g, ".").slice(0, 140);
}

/**
 * One key per attempt. A replay of the same attempt cannot pay twice, and at
 * most one instruction per invoice is live at a time (ADR-055).
 */
async function idempotencyKey(client, invoiceId) {
  const {
    rows: [row],
  } = await client.query("select count(*)::int as attempts from finops.payment_instructions where invoice_id = $1", [invoiceId]);
  return `pay:${invoiceId}:${row.attempts + 1}`;
}

export async function createPaymentInstruction({ pool }, { invoiceId, actor }) {
  return withTransaction(pool, async (client) => {
    // See accounting.js: the row lock is taken separately from the join.
    const locked = await client.query("select 1 from finops.invoices where id = $1 for update", [invoiceId]);
    if (locked.rowCount === 0) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    const {
      rows: [invoice],
    } = await client.query(
      `select i.*, s.legal_name as supplier_name from finops.invoices i
       left join finops.suppliers s on s.id = i.supplier_id
       where i.id = $1`,
      [invoiceId],
    );
    // Checked before the state, so the reason given is the real one: a credit
    // note is not a payment waiting for the right status.
    if (invoice.document_type === "CREDIT_NOTE") {
      throw new RuleError(422, "CREDIT_NOTE_NOT_PAYABLE", "Eine Gutschrift wird nicht bezahlt: sie mindert die Verbindlichkeit");
    }
    if (invoice.state !== "ACCOUNTING_READY") {
      throw new TransitionError("NOT_READY_FOR_PAYMENT", `Rechnung im Status ${invoice.state} kann nicht zur Zahlung gegeben werden`, {
        state: invoice.state,
      });
    }
    await refuseApprover(client, invoiceId, actor);
    if (!invoice.supplier_iban_raw) throw new RuleError(422, "NO_IBAN", "Ohne IBAN kann keine Zahlung angewiesen werden");
    const creditorIban = await verifiedCreditorIban(client, invoice);

    // Booked credits of the same supplier reduce what leaves the bank. Locked
    // first and read after the lock, inside this transaction, so two payments
    // to one supplier cannot both spend the same credit (ADR-050, ADR-083).
    const credits = await openCreditsFor(client, invoice.supplier_id, invoice.currency ?? "EUR", invoiceId);
    const plan = planNetting(invoice.gross_amount, credits);
    if (plan.payableCents === null) {
      throw new RuleError(422, "AMOUNTS_INCOMPLETE", "Beträge der Rechnung sind unvollständig, Zahlung nicht anweisbar");
    }
    // An instruction for 0.00 is not a payment. The invoice stops here for a
    // person rather than being sent to the bank as nothing.
    if (plan.payableCents === 0) {
      throw new RuleError(
        409,
        "FULLY_CREDITED",
        "Die offenen Gutschriften decken den Rechnungsbetrag vollständig; die Rechnung wird ausgeglichen statt bezahlt",
      );
    }
    const payable = centsToDecimal(plan.payableCents);
    const appliedCents = plan.applications.reduce((sum, a) => sum + a.amountCents, 0);

    const key = await idempotencyKey(client, invoiceId);
    const endToEndId = await nextEndToEndId(client);
    const inserted = await client.query(
      `insert into finops.payment_instructions
         (invoice_id, idempotency_key, amount, currency, creditor_iban, creditor_name, reference, end_to_end_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict do nothing`,
      [
        invoiceId,
        key,
        payable,
        invoice.currency ?? "EUR",
        creditorIban,
        invoice.supplier_name ?? invoice.supplier_name_raw ?? "",
        remittanceText(endToEndId, invoice.invoice_number),
        endToEndId,
      ],
    );
    if (inserted.rowCount === 0)
      throw new RuleError(409, "PAYMENT_ALREADY_INSTRUCTED", "Für diese Rechnung besteht bereits eine Zahlungsanweisung");

    // Written after the instruction, in the same transaction: the unique index
    // on (credit_note_id, invoice_id) is the second lock on the same door, so
    // a replay can consume nothing even if it got past the first.
    await applyCredits(client, invoiceId, plan.applications);

    await transition(client, {
      invoiceId,
      to: "PAYMENT_PENDING",
      actor,
      action: "payment_instructed",
      reason: `Zahlung ${payable} ${invoice.currency ?? "EUR"} angewiesen`,
      evidence: {
        idempotency_key: key,
        end_to_end_id: endToEndId,
        creditor_iban: creditorIban,
        gross_amount: invoice.gross_amount,
        // Stated even when nothing was applied: "0.00" is an answer, and its
        // absence would be ambiguous between "no credits" and "not checked".
        credit_applied: centsToDecimal(appliedCents),
        credit_notes: plan.applications.map((a) => a.creditNoteId),
      },
    });
  });
}

/**
 * The account money may go to: the invoice's IBAN, as master data holds it,
 * for a supplier that is still active. Asked again here because master data
 * can move between approval and payment, and this is the last moment before
 * money leaves (ADR-052).
 */
async function verifiedCreditorIban(client, invoice) {
  const {
    rows: [row],
  } = await client.query(
    `select s.status, b.iban
     from finops.suppliers s
     left join finops.supplier_bank_accounts b
       on b.supplier_id = s.id and b.status = 'ACTIVE'
      and upper(replace(b.iban, ' ', '')) = upper(replace($2, ' ', ''))
     where s.id = $1`,
    [invoice.supplier_id, invoice.supplier_iban_raw],
  );
  if (row?.status !== "ACTIVE") {
    throw new RuleError(409, "SUPPLIER_NOT_ACTIVE", "Lieferant ist nicht aktiv: keine Zahlung", { status: row?.status ?? null });
  }
  if (!row.iban) {
    throw new RuleError(409, "IBAN_NOT_VERIFIED", "IBAN ist keine aktive Bankverbindung des Lieferanten: keine Zahlung", {
      iban: invoice.supplier_iban_raw,
    });
  }
  return row.iban;
}

/** What a provider webhook would call. Safe to replay: the state machine refuses a second confirmation. */
export async function confirmPayment({ pool }, { invoiceId, actor, providerRef }) {
  return withTransaction(pool, async (client) => {
    const {
      rows: [invoice],
    } = await client.query("select * from finops.invoices where id = $1 for update", [invoiceId]);
    if (!invoice) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    if (invoice.state !== "PAYMENT_PENDING") {
      throw new TransitionError(
        "NOT_AWAITING_PAYMENT_CONFIRMATION",
        `Rechnung im Status ${invoice.state} wartet nicht auf eine Zahlungsbestätigung`,
        { state: invoice.state },
      );
    }
    await refuseApprover(client, invoiceId, actor);

    const {
      rows: [instruction],
    } = await client.query("select * from finops.payment_instructions where invoice_id = $1 and status = 'PENDING' for update", [
      invoiceId,
    ]);
    if (!instruction) throw new NotFoundError("PAYMENT_INSTRUCTION_NOT_FOUND", "Keine Zahlungsanweisung vorhanden");

    const ref = providerRef ?? mockProvider.submit({ idempotencyKey: instruction.idempotency_key }).providerRef;
    await client.query("update finops.payment_instructions set status = 'EXECUTED', provider_ref = $2, executed_at = now() where id = $1", [
      instruction.id,
      ref,
    ]);
    await transition(client, {
      invoiceId,
      to: "PAID",
      actor,
      action: "payment_confirmed",
      reason: `Zahlung bestätigt (${ref})`,
      evidence: { provider_ref: ref, amount: instruction.amount },
    });
  });
}

/**
 * The bank did not carry the payment out: rejected, returned, or recalled on
 * request. The instruction fails and the credits it spent are released, so the
 * next attempt nets them again (ADR-055). What a provider webhook would call.
 */
export async function failPayment({ pool }, { invoiceId, actor, comment }) {
  const reason = (comment ?? "").trim();
  if (!reason) throw new RuleError(400, "REASON_REQUIRED", "Für eine fehlgeschlagene Zahlung ist eine Begründung erforderlich");
  return withTransaction(pool, async (client) => {
    const {
      rows: [invoice],
    } = await client.query("select state from finops.invoices where id = $1 for update", [invoiceId]);
    if (!invoice) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    if (invoice.state !== "PAYMENT_PENDING") {
      throw new TransitionError(
        "NOT_AWAITING_PAYMENT_CONFIRMATION",
        `Rechnung im Status ${invoice.state} wartet nicht auf eine Zahlungsbestätigung`,
        { state: invoice.state },
      );
    }
    const {
      rows: [instruction],
    } = await client.query(
      "update finops.payment_instructions set status = 'FAILED' where invoice_id = $1 and status = 'PENDING' returning idempotency_key, amount",
      [invoiceId],
    );
    const { rows: released } = await client.query(
      "update finops.credit_applications set released_at = now() where invoice_id = $1 and released_at is null returning credit_note_id",
      [invoiceId],
    );
    await transition(client, {
      invoiceId,
      to: "PAYMENT_FAILED",
      actor,
      action: "payment_failed",
      reason,
      evidence: {
        idempotency_key: instruction?.idempotency_key,
        amount: instruction?.amount,
        released_credit_notes: released.map((r) => r.credit_note_id),
      },
    });
  });
}

/** A failed payment goes back to its booking, to be instructed or settled again. */
export async function retryPayment({ pool }, { invoiceId, actor }) {
  return withTransaction(pool, async (client) => {
    const {
      rows: [invoice],
    } = await client.query("select state from finops.invoices where id = $1 for update", [invoiceId]);
    if (!invoice) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    if (invoice.state !== "PAYMENT_FAILED") {
      throw new TransitionError("NOT_A_FAILED_PAYMENT", `Rechnung im Status ${invoice.state} hat keine fehlgeschlagene Zahlung`, {
        state: invoice.state,
      });
    }
    await transition(client, { invoiceId, to: "ACCOUNTING_READY", actor, action: "payment_reopened" });
  });
}
