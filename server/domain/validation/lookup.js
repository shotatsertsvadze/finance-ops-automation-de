import { availableCents } from "../purchase-orders/commitments.js";
import { DISCARDED_STATES } from "../workflow/states.js";

/** Loads the master data a business validation needs. */
export async function loadMasterData(client, parsed, { excludeInvoiceId = null } = {}) {
  // How the supplier was identified is part of the evidence, so it is reported
  // rather than inferred from whether the document happened to carry a VAT id.
  let supplier = null;
  let matchedBy = null;
  if (parsed.supplier.vatId) {
    ({
      rows: [supplier = null],
    } = await client.query("select * from finops.suppliers where upper(vat_id) = upper($1)", [parsed.supplier.vatId]));
    if (supplier) matchedBy = "VAT_ID";
    // A tax id that matches nothing is a contradiction, not a missing field:
    // falling back to the name would quietly accept the mismatch.
    else matchedBy = "VAT_ID_UNKNOWN";
  }
  if (!supplier && !parsed.supplier.vatId && parsed.supplier.name) {
    const { rows } = await client.query("select * from finops.suppliers where lower(legal_name) = lower($1)", [parsed.supplier.name]);
    if (rows.length === 1) {
      supplier = rows[0];
      matchedBy = "LEGAL_NAME";
    } else if (rows.length > 1) {
      matchedBy = "NAME_AMBIGUOUS";
    }
  }
  const bankAccounts = supplier
    ? (await client.query("select iban, bic, status from finops.supplier_bank_accounts where supplier_id = $1", [supplier.id])).rows
    : [];
  // Carry the order's supplier number: the evidence a clerk reads should name
  // the supplier, not print an internal identifier.
  const purchaseOrder = parsed.poReference
    ? ((
        await client.query(
          `select p.*, s.supplier_no as supplier_supplier_no, s.legal_name as supplier_legal_name
         from finops.purchase_orders p
         left join finops.suppliers s on s.id = p.supplier_id
         where p.po_number = $1`,
          [parsed.poReference],
        )
      ).rows[0] ?? null)
    : null;
  const existingSameNumber =
    supplier && parsed.invoiceNumber
      ? (
          await client.query(
            `select id, state from finops.invoices
         where supplier_id = $1 and invoice_number = $2 and state <> all($4::finops.invoice_state[]) and id <> $3`,
            [supplier.id, parsed.invoiceNumber, excludeInvoiceId ?? "00000000-0000-0000-0000-000000000000", DISCARDED_STATES],
          )
        ).rows
      : [];
  // Locks the order row, so two invoices arriving together cannot both read
  // the same availability and both commit.
  const poAvailableCents = purchaseOrder ? await availableCents(client, purchaseOrder.id, excludeInvoiceId) : null;

  return { supplier, matchedBy, bankAccounts, purchaseOrder, poAvailableCents, existingSameNumber };
}
