import { centsToDecimal, toCents } from "../money.js";
import { HOLDS_CAPACITY_STATES } from "../workflow/states.js";

/**
 * A purchase order is a spending limit, so what matters is the sum of every
 * invoice live against it, not each invoice on its own.
 *
 * `purchase_orders.remaining_amount` is the opening balance. Capacity now is
 * that balance minus the active commitments held by other invoices.
 */

const HOLDS_CAPACITY = new Set(HOLDS_CAPACITY_STATES);

/**
 * Capacity left on the order, ignoring what this invoice itself holds.
 *
 * Locks the order row: without it two invoices arriving together read the
 * same availability and both commit. The invoice detail reads the same answer
 * with `lock: false`.
 */
export async function availableCents(client, purchaseOrderId, excludeInvoiceId = null, { lock = true } = {}) {
  const {
    rows: [order],
  } = await client.query(`select remaining_amount from finops.purchase_orders where id = $1 ${lock ? "for update" : ""}`, [
    purchaseOrderId,
  ]);
  if (!order) return null;
  const {
    rows: [held],
  } = await client.query(
    `select coalesce(sum(amount), 0)::text as total from finops.po_commitments
     where purchase_order_id = $1 and status = 'ACTIVE' and invoice_id is distinct from $2`,
    [purchaseOrderId, excludeInvoiceId],
  );
  return toCents(order.remaining_amount) - toCents(held.total);
}

/**
 * Brings the invoice's claim on its order into line with its state. Called
 * from transition(), so a state change and the capacity it implies happen
 * together or not at all.
 */
export async function syncCommitment(client, invoiceId, toState) {
  const {
    rows: [invoice],
  } = await client.query("select purchase_order_id, net_amount, document_type from finops.invoices where id = $1", [invoiceId]);
  if (!invoice?.purchase_order_id) return;

  if (!HOLDS_CAPACITY.has(toState)) {
    await release(client, invoiceId);
    return;
  }

  const net = toCents(invoice.net_amount);
  if (net === null) return;
  // A credit note un-spends the order: its claim is negative, so capacity goes
  // back rather than being taken (ADR-049).
  const amount = centsToDecimal(invoice.document_type === "CREDIT_NOTE" ? -net : net);

  const { rowCount } = await client.query(
    `update finops.po_commitments set amount = $3
     where invoice_id = $1 and purchase_order_id = $2 and status = 'ACTIVE'`,
    [invoiceId, invoice.purchase_order_id, amount],
  );
  if (rowCount === 0) {
    await client.query("insert into finops.po_commitments (purchase_order_id, invoice_id, amount) values ($1, $2, $3)", [
      invoice.purchase_order_id,
      invoiceId,
      amount,
    ]);
  }
}

export async function release(client, invoiceId) {
  await client.query(
    "update finops.po_commitments set status = 'RELEASED', released_at = now() where invoice_id = $1 and status = 'ACTIVE'",
    [invoiceId],
  );
}
