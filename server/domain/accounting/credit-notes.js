import { withTransaction } from "../../db.js";
import { NotFoundError, TransitionError } from "../errors.js";
import { transition } from "../workflow/transitions.js";

/**
 * Closing a credit note.
 *
 * An invoice leaves ACCOUNTING_READY by being paid. A credit note leaves it by
 * being booked: the supplier owes us, so there is no instruction to send. How
 * the balance actually comes back - netted against a later payment run, or
 * refunded - is outside this system and documented as such (ADR-049).
 */
export async function bookCredit({ pool }, { invoiceId, actor }) {
  return withTransaction(pool, async (client) => {
    const locked = await client.query("select state, document_type, gross_amount, currency from finops.invoices where id = $1 for update", [
      invoiceId,
    ]);
    if (locked.rowCount === 0) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    const invoice = locked.rows[0];

    // Without this an invoice could reach a terminal state without ever being
    // paid, and would disappear from the payment queue as if it had been.
    if (invoice.document_type !== "CREDIT_NOTE") {
      throw new TransitionError("NOT_A_CREDIT_NOTE", "Nur eine Gutschrift kann als gutgeschrieben abgeschlossen werden", {
        document_type: invoice.document_type,
      });
    }
    if (invoice.state !== "ACCOUNTING_READY") {
      throw new TransitionError("NOT_READY_TO_CREDIT", `Gutschrift im Status ${invoice.state} kann nicht abgeschlossen werden`, {
        state: invoice.state,
      });
    }

    await transition(client, {
      invoiceId,
      to: "CREDITED",
      actor,
      action: "credit_booked",
      reason: `Gutschrift ${invoice.gross_amount} ${invoice.currency ?? "EUR"} gebucht, keine Zahlung`,
    });
  });
}
