import { NotFoundError, RuleError } from "../errors.js";

/** Locked, so a proposal and an approval for one supplier take turns. */
export async function lockActiveSupplier(client, supplierId) {
  const {
    rows: [supplier],
  } = await client.query("select id, supplier_no, status, callback_phone from finops.suppliers where id = $1 for update", [supplierId]);
  if (!supplier) throw new NotFoundError("SUPPLIER_NOT_FOUND", "Lieferant nicht gefunden");
  if (supplier.status !== "ACTIVE") {
    throw new RuleError(409, "SUPPLIER_NOT_ACTIVE_FOR_CHANGE", "Lieferant ist nicht aktiv: keine neue Bankverbindung", {
      status: supplier.status,
    });
  }
  return supplier;
}

export async function trustedIbansOf(client, supplierId) {
  const { rows } = await client.query(
    "select iban from finops.supplier_bank_accounts where supplier_id = $1 and status = 'ACTIVE' order by iban",
    [supplierId],
  );
  return rows.map((r) => r.iban);
}

/** Other suppliers this IBAN is trusted for: a warning, not a refusal (ADR-077). */
export async function sharedWith(client, supplierId, iban) {
  const { rows } = await client.query(
    `select s.supplier_no, s.legal_name from finops.supplier_bank_accounts b join finops.suppliers s on s.id = b.supplier_id
     where b.iban = $1 and b.status = 'ACTIVE' and b.supplier_id <> $2 order by s.supplier_no`,
    [iban, supplierId],
  );
  return rows;
}

/** An account on file, trusted or retired, is not added a second time. */
export async function refuseKnownAccount(client, supplierId, iban) {
  const {
    rows: [known],
  } = await client.query("select status from finops.supplier_bank_accounts where supplier_id = $1 and iban = $2", [supplierId, iban]);
  if (known)
    throw new RuleError(409, "IBAN_ALREADY_ON_FILE", "Diese IBAN ist für den Lieferanten bereits hinterlegt", { status: known.status });
}

/** The invoice a proposal cites must be this supplier's and carry this IBAN. */
export async function checkSourceInvoice(client, invoiceId, supplierId, iban) {
  const {
    rows: [invoice],
  } = await client.query("select supplier_id, supplier_iban_raw from finops.invoices where id = $1", [invoiceId]);
  if (!invoice || invoice.supplier_id !== supplierId || invoice.supplier_iban_raw !== iban) {
    throw new RuleError(
      400,
      "SOURCE_INVOICE_MISMATCH",
      "Die genannte Rechnung gehört nicht zu diesem Lieferanten oder trägt eine andere IBAN",
    );
  }
}
