/**
 * What of a check's evidence may be sent to the AI provider (ADR-082). An
 * allowlist, not a filter: `expected`, `actual` and `reason` leave only when
 * they are named here for their check, either as they are (SEND), as a fixed
 * text in their place, or through a function that makes them safe. Any other
 * value is replaced by WITHHELD, so a check added later sends none of its
 * evidence until someone decides here what it may send.
 *
 * SEND is only for text the application composes itself: fixed sentences,
 * field labels, status codes, amounts it computed, validator rule codes.
 * A value read from the document can be anything, a name or a phone number
 * included, and no pattern recognises every such value; so it is not sent.
 * Only the FAILED and WARNING forms of a check are sent, and the entries
 * describe those.
 */
export const SEND = true;
export const WITHHELD = "(Wert aus dem Dokument, nicht übermittelt)";

const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;

/** An IBAN as its first and last four characters; anything else is withheld. */
const maskedIban = (value) => {
  const compact = value.replace(/\s/g, "").toUpperCase();
  return IBAN.test(compact) ? `${compact.slice(0, 4)} **** ${compact.slice(-4)}` : WITHHELD;
};
const maskedIbans = (value) => value.split(",").map((v) => v.trim()).filter(Boolean).map(maskedIban).join(", ");

const ALL = { expected: SEND, actual: SEND, reason: SEND };

export const OUTBOUND = {
  // Technical. Parser errors and most found values repeat the document.
  xml_well_formed: { expected: SEND, actual: "Dokument nicht wohlgeformt oder nicht zulässig", reason: "Dokument nicht wohlgeformt oder nicht zulässig" },
  format_recognised: { expected: SEND, actual: "kein UBL-Rechnungsdokument", reason: "Dokument nicht als UBL-Rechnung erkannt" },
  xrechnung_profile_declared: { expected: SEND, reason: SEND },
  required_fields_present: ALL, // field labels only
  amounts_numeric: { expected: SEND, reason: SEND },
  dates_valid: { expected: SEND, reason: SEND },
  invoice_type_code: { expected: SEND, reason: SEND },
  // The verdict and its rule codes; the validator's message quotes the document.
  official_validation: {
    expected: SEND, actual: SEND,
    reason: "Der KoSIT-Validator hat das Dokument nicht angenommen oder keine verwertbare Antwort gegeben",
  },

  // Business. Which supplier it is: the relationship, never the identity.
  supplier_known: { expected: "Lieferant im Stammdatenbestand", actual: "keine eindeutige Zuordnung", reason: SEND },
  supplier_active: ALL, // a master-data status
  buyer_is_us: { expected: "das eigene Unternehmen", actual: "ein anderer oder kein Rechnungsempfänger", reason: SEND },
  supplier_iban_match: { expected: maskedIbans, actual: maskedIban, reason: SEND },
  duplicate_invoice_number: { expected: SEND, actual: "Rechnungsnummer desselben Lieferanten bereits im Bestand", reason: SEND },
  credit_note_reference: ALL, // FAILED says "(keiner)"
  po_reference_present: ALL, // FAILED and WARNING say "(keine)"
  po_exists: ALL, // an order status or "nicht gefunden"
  po_supplier_match: { expected: "Bestellung des Rechnungsstellers", actual: "Bestellung eines anderen Lieferanten", reason: SEND },
  po_amount_within_tolerance: ALL, // computed amounts
  line_amounts_consistent: { expected: SEND, reason: SEND }, // lines are named by the document's own ids
  totals_consistent: ALL, // computed amounts and fixed labels
  tax_breakdown_bookable: { expected: SEND, reason: "Die Steueraufschlüsselung ist so nicht buchbar" },
  currency_expected: { expected: SEND, reason: SEND },
  required_fields_complete: ALL, // field labels only
  payment_terms_match: ALL, // numbers of days
};

/**
 * One field of a check as it may be sent. `clean` is applied to what is sent
 * as it is, as a second line: it masks IBANs, e-mail addresses and known names
 * and cuts the text short.
 */
export function outboundValue(check, field, clean) {
  const value = check[field];
  if (value === null || value === undefined) return null;
  const rule = OUTBOUND[check.check_code]?.[field];
  if (rule === SEND) return clean(value);
  if (typeof rule === "function") return rule(value);
  return rule ?? WITHHELD;
}
