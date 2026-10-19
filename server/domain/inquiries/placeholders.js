import { formatEur, toCents } from "../money.js";

/**
 * The values an inquiry may name, filled in by the application (ADR-084). The
 * model only ever sees which of these exist, never what they are, so no
 * invoice number or amount leaves the system and none can be written wrong.
 */
export const PLACEHOLDERS = ["rechnungsnummer", "rechnungsdatum", "bruttobetrag", "bestellnummer", "lieferant", "unser_unternehmen"];
const PATTERN = /\{\{([a-z_]+)\}\}/g;

const germanDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : null);
function amount(gross, currency) {
  if (gross === null || gross === undefined) return null;
  return !currency || currency === "EUR" ? formatEur(toCents(gross)) : `${gross} ${currency}`;
}

export async function placeholderValues(pool, company, invoiceId) {
  const { rows: [row] } = await pool.query(
    `select i.invoice_number, i.issue_date, i.gross_amount, i.currency, i.po_reference_raw, s.legal_name
     from finops.invoices i left join finops.suppliers s on s.id = i.supplier_id where i.id = $1`,
    [invoiceId],
  );
  if (!row) return null;
  return {
    rechnungsnummer: row.invoice_number || null,
    rechnungsdatum: germanDate(row.issue_date),
    bruttobetrag: amount(row.gross_amount, row.currency),
    bestellnummer: row.po_reference_raw || null,
    lieferant: row.legal_name || null,
    unser_unternehmen: company.legalName,
  };
}

/** The placeholders that have a value for this invoice. */
export const availablePlaceholders = (values) => PLACEHOLDERS.filter((name) => values[name]);

export const placeholdersIn = (text) => [...String(text).matchAll(PATTERN)].map((match) => match[1]);

/** The text with every placeholder that has a value filled in; others stay as written. */
export const fill = (text, values) => String(text).replace(PATTERN, (match, name) => values[name] ?? match);
