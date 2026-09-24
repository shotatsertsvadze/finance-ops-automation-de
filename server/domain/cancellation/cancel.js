import { withTransaction } from "../../db.js";
import { NotFoundError, RuleError, TransitionError } from "../errors.js";
import { transition } from "../workflow/transitions.js";
import { reverseBooking } from "../accounting/accounting.js";

/** States from which an invoice can be stopped: approved, money not on its way (any more). */
const CANCELLABLE = ["APPROVED", "ACCOUNTING_READY", "PAYMENT_FAILED"];

/**
 * Stops an approved invoice before money moves (ADR-054). A booked invoice is
 * reversed in the same transaction, so accounting is not left holding an
 * obligation nobody will pay. The purchase-order claim is released by
 * transition(), as for any state that holds no capacity.
 */
export async function cancelInvoice({ pool }, { invoiceId, actor, comment }) {
  const reason = (comment ?? "").trim();
  if (!reason) throw new RuleError(400, "REASON_REQUIRED", "Für das Stornieren ist eine Begründung erforderlich");

  return withTransaction(pool, async (client) => {
    const { rows: [invoice] } = await client.query("select state from finops.invoices where id = $1 for update", [invoiceId]);
    if (!invoice) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    if (!CANCELLABLE.includes(invoice.state)) {
      throw new TransitionError("NOT_CANCELLABLE", `Rechnung im Status ${invoice.state} kann nicht storniert werden`, { state: invoice.state });
    }
    const reversal = await reverseBooking(client, invoiceId);
    await transition(client, {
      invoiceId, to: "CANCELLED", actor, action: "invoice_cancelled", reason,
      evidence: reversal ? { reversal_document_no: reversal.documentNo, reverses: reversal.reverses } : {},
    });
  });
}
