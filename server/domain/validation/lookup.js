/** Loads the master data a business validation needs. Read-only. */
export async function loadMasterData(client, parsed, { excludeInvoiceId = null } = {}) {
  let supplier = null;
  if (parsed.supplier.vatId) {
    ({ rows: [supplier = null] } = await client.query("select * from finops.suppliers where upper(vat_id) = upper($1)", [parsed.supplier.vatId]));
  }
  if (!supplier && parsed.supplier.name) {
    ({ rows: [supplier = null] } = await client.query("select * from finops.suppliers where lower(legal_name) = lower($1)", [parsed.supplier.name]));
  }
  const bankAccounts = supplier
    ? (await client.query("select iban, bic, status from finops.supplier_bank_accounts where supplier_id = $1", [supplier.id])).rows
    : [];
  const purchaseOrder = parsed.poReference
    ? (await client.query("select * from finops.purchase_orders where po_number = $1", [parsed.poReference])).rows[0] ?? null
    : null;
  const existingSameNumber = supplier && parsed.invoiceNumber
    ? (await client.query(
        `select id, state from finops.invoices
         where supplier_id = $1 and invoice_number = $2 and state not in ('DUPLICATE', 'REJECTED') and id <> $3`,
        [supplier.id, parsed.invoiceNumber, excludeInvoiceId ?? "00000000-0000-0000-0000-000000000000"],
      )).rows
    : [];
  return { supplier, bankAccounts, purchaseOrder, existingSameNumber };
}
