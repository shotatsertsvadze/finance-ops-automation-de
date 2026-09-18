import { withTransaction } from "../../db.js";
import { NotFoundError, TransitionError, transition } from "../workflow/transitions.js";
import { RuleError } from "../approvals/approvals.js";
import { applyCredits, openCreditsFor, planNetting } from "../accounting/netting.js";
import { centsToDecimal } from "../money.js";

/**
 * Simulated payment. No money moves: this records the instruction a bank
 * adapter would send and the confirmation it would return. The provider call
 * is the seam a real bank API replaces.
 */
export const mockProvider = {
  submit: ({ idempotencyKey }) => ({ providerRef: `MOCK-${idempotencyKey.slice(0, 12)}`, accepted: true }),
};

/** The instruction is keyed by invoice, so a replay cannot pay twice. */
const idempotencyKey = (invoice) => `pay:${invoice.id}`;

export async function createPaymentInstruction({ pool }, { invoiceId, actor }) {
  return withTransaction(pool, async (client) => {
    // See accounting.js: the row lock is taken separately from the join.
    const locked = await client.query("select 1 from finops.invoices where id = $1 for update", [invoiceId]);
    if (locked.rowCount === 0) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    const { rows: [invoice] } = await client.query(
      `select i.*, s.legal_name as supplier_name from finops.invoices i
       left join finops.suppliers s on s.id = i.supplier_id
       where i.id = $1`,
      [invoiceId],
    );
    // Checked before the state, so the reason given is the real one: a credit
    // note is not a payment waiting for the right status.
    if (invoice.document_type === "CREDIT_NOTE") {
      throw new RuleError(422, "CREDIT_NOTE_NOT_PAYABLE",
        "Eine Gutschrift wird nicht bezahlt: sie mindert die Verbindlichkeit");
    }
    if (invoice.state !== "ACCOUNTING_READY") {
      throw new TransitionError("NOT_READY_FOR_PAYMENT", `Rechnung im Status ${invoice.state} kann nicht zur Zahlung gegeben werden`, { state: invoice.state });
    }
    if (!invoice.supplier_iban_raw) throw new RuleError(422, "NO_IBAN", "Ohne IBAN kann keine Zahlung angewiesen werden");

    // Booked credits of the same supplier reduce what leaves the bank. Read
    // and locked inside this transaction, so two payments to one supplier
    // cannot both spend the same credit (ADR-050).
    const credits = await openCreditsFor(client, invoice.supplier_id, invoice.currency ?? "EUR", invoiceId);
    const plan = planNetting(invoice.gross_amount, credits);
    if (plan.payableCents === null) {
      throw new RuleError(422, "AMOUNTS_INCOMPLETE", "Beträge der Rechnung sind unvollständig, Zahlung nicht anweisbar");
    }
    // An instruction for 0.00 is not a payment. The invoice stops here for a
    // person rather than being sent to the bank as nothing.
    if (plan.payableCents === 0) {
      throw new RuleError(409, "FULLY_CREDITED",
        "Die offenen Gutschriften decken den Rechnungsbetrag vollständig; die Rechnung wird ausgeglichen statt bezahlt");
    }
    const payable = centsToDecimal(plan.payableCents);
    const appliedCents = plan.applications.reduce((sum, a) => sum + a.amountCents, 0);

    const key = idempotencyKey(invoice);
    const inserted = await client.query(
      `insert into finops.payment_instructions
         (invoice_id, idempotency_key, amount, currency, creditor_iban, creditor_name, reference)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (idempotency_key) do nothing`,
      [invoiceId, key, payable, invoice.currency ?? "EUR", invoice.supplier_iban_raw,
        invoice.supplier_name ?? invoice.supplier_name_raw ?? "", invoice.invoice_number ?? ""],
    );
    if (inserted.rowCount === 0) throw new RuleError(409, "PAYMENT_ALREADY_INSTRUCTED", "Für diese Rechnung besteht bereits eine Zahlungsanweisung");

    // Written after the instruction, in the same transaction: the unique index
    // on (credit_note_id, invoice_id) is the second lock on the same door, so
    // a replay can consume nothing even if it got past the first.
    await applyCredits(client, invoiceId, plan.applications);

    await transition(client, {
      invoiceId, to: "PAYMENT_PENDING", actor, action: "payment_instructed",
      reason: `Zahlung ${payable} ${invoice.currency ?? "EUR"} angewiesen`,
      evidence: {
        idempotency_key: key,
        creditor_iban: invoice.supplier_iban_raw,
        gross_amount: invoice.gross_amount,
        // Stated even when nothing was applied: "0.00" is an answer, and its
        // absence would be ambiguous between "no credits" and "not checked".
        credit_applied: centsToDecimal(appliedCents),
        credit_notes: plan.applications.map((a) => a.creditNoteId),
      },
    });
  });
}

/** What a provider webhook would call. Safe to replay: the state machine refuses a second confirmation. */
export async function confirmPayment({ pool }, { invoiceId, actor, providerRef }) {
  return withTransaction(pool, async (client) => {
    const { rows: [invoice] } = await client.query("select * from finops.invoices where id = $1 for update", [invoiceId]);
    if (!invoice) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    if (invoice.state !== "PAYMENT_PENDING") {
      throw new TransitionError("NOT_AWAITING_PAYMENT_CONFIRMATION", `Rechnung im Status ${invoice.state} wartet nicht auf eine Zahlungsbestätigung`, { state: invoice.state });
    }

    const { rows: [instruction] } = await client.query(
      "select * from finops.payment_instructions where invoice_id = $1 for update", [invoiceId],
    );
    if (!instruction) throw new NotFoundError("PAYMENT_INSTRUCTION_NOT_FOUND", "Keine Zahlungsanweisung vorhanden");

    const ref = providerRef ?? mockProvider.submit({ idempotencyKey: instruction.idempotency_key }).providerRef;
    await client.query(
      "update finops.payment_instructions set status = 'EXECUTED', provider_ref = $2, executed_at = now() where id = $1",
      [instruction.id, ref],
    );
    await transition(client, {
      invoiceId, to: "PAID", actor, action: "payment_confirmed",
      reason: `Zahlung bestätigt (${ref})`,
      evidence: { provider_ref: ref, amount: instruction.amount },
    });
  });
}
