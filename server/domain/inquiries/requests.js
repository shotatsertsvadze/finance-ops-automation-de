/**
 * What a supplier may be asked about each failed check (ADR-084), as fixed
 * German sentences with placeholders. A check that is not listed gets no
 * inquiry. Two checks block an inquiry altogether: a changed IBAN, because a
 * letter to the address an invoice came from can reach whoever wrote it (the
 * account is verified by call-back, ADR-077), and an unknown supplier, because
 * there is no known party to write to.
 */
export const BLOCKING = {
  supplier_iban_match: "INQUIRY_BANK_DETAILS",
  supplier_known: "INQUIRY_SUPPLIER_UNKNOWN",
};

const CORRECTED_E_INVOICE = "Bitte senden Sie uns eine korrigierte E-Rechnung im Format XRechnung.";
const CORRECTED_INVOICE = "Bitte senden Sie uns eine korrigierte Rechnung.";

/** check code -> the request it leads to, what we noticed, and what we ask. */
export const REQUESTS = {
  po_reference_present: { request: "bestellnummer_nennen", issue: "In der Rechnung fehlt die Bestellnummer.", ask: "Bitte nennen Sie uns die Bestellnummer, auf die sich die Rechnung bezieht." },
  po_exists: { request: "bestellnummer_pruefen", issue: "Zur angegebenen Bestellnummer {{bestellnummer}} finden wir keine Bestellung.", ask: "Bitte prüfen Sie die Bestellnummer und nennen Sie uns die richtige." },
  po_supplier_match: { request: "bestellnummer_pruefen", issue: "Die angegebene Bestellnummer {{bestellnummer}} gehört bei uns zu einem anderen Lieferanten.", ask: "Bitte prüfen Sie die Bestellnummer und nennen Sie uns die richtige." },
  po_amount_within_tolerance: { request: "betrag_klaeren", issue: "Der Rechnungsbetrag liegt über dem offenen Betrag der Bestellung {{bestellnummer}}.", ask: "Bitte erläutern Sie die Differenz, zum Beispiel eine Mehrlieferung, oder senden Sie uns eine korrigierte Rechnung." },
  totals_consistent: { request: "korrigierte_rechnung", issue: "Die Summen der Rechnung lassen sich nicht nachrechnen.", ask: CORRECTED_INVOICE },
  line_amounts_consistent: { request: "korrigierte_rechnung", issue: "Mindestens eine Rechnungsposition lässt sich aus Menge und Preis nicht nachrechnen.", ask: CORRECTED_INVOICE },
  tax_breakdown_bookable: { request: "korrigierte_rechnung", issue: "Die Aufschlüsselung der Umsatzsteuer ist so nicht buchbar.", ask: CORRECTED_INVOICE },
  amounts_numeric: { request: "korrigierte_rechnung", issue: "Mindestens ein Betrag in der Rechnung ist nicht lesbar.", ask: CORRECTED_INVOICE },
  currency_expected: { request: "korrigierte_rechnung", issue: "Die Rechnung ist nicht in der vereinbarten Währung ausgestellt.", ask: CORRECTED_INVOICE },
  buyer_is_us: { request: "korrigierte_rechnung", issue: "Die Rechnung ist nicht an {{unser_unternehmen}} adressiert.", ask: CORRECTED_INVOICE },
  required_fields_complete: { request: "korrigierte_e_rechnung", issue: "In der Rechnung fehlen Pflichtangaben.", ask: CORRECTED_E_INVOICE },
  required_fields_present: { request: "korrigierte_e_rechnung", issue: "In der Rechnung fehlen Pflichtangaben.", ask: CORRECTED_E_INVOICE },
  dates_valid: { request: "korrigierte_e_rechnung", issue: "Mindestens ein Datum in der Rechnung ist ungültig.", ask: CORRECTED_E_INVOICE },
  invoice_type_code: { request: "korrigierte_e_rechnung", issue: "Die Art des Dokuments ist in der Rechnung nicht zulässig angegeben.", ask: CORRECTED_E_INVOICE },
  xrechnung_profile_declared: { request: "korrigierte_e_rechnung", issue: "Die Rechnung gibt kein gültiges XRechnung-Profil an.", ask: CORRECTED_E_INVOICE },
  xml_well_formed: { request: "korrigierte_e_rechnung", issue: "Die Rechnungsdatei lässt sich technisch nicht lesen.", ask: CORRECTED_E_INVOICE },
  format_recognised: { request: "korrigierte_e_rechnung", issue: "Die Rechnungsdatei ist keine E-Rechnung im erwarteten Format.", ask: CORRECTED_E_INVOICE },
  official_validation: { request: "korrigierte_e_rechnung", issue: "Die Rechnung besteht die offizielle Prüfung für XRechnung nicht.", ask: CORRECTED_E_INVOICE },
  duplicate_invoice_number: { request: "doppel_bestaetigen", issue: "Unter dieser Rechnungsnummer liegt uns bereits eine Rechnung von Ihnen vor.", ask: "Bitte bestätigen Sie, ob es sich um eine erneute Zusendung derselben Rechnung oder um eine neue Rechnung handelt." },
  credit_note_reference: { request: "gutschrift_bezug", issue: "In der Gutschrift fehlt der Bezug auf die gutgeschriebene Rechnung.", ask: "Bitte nennen Sie uns die Nummer der Rechnung, auf die sich die Gutschrift bezieht." },
};

/** Whether the failed checks allow an inquiry, and which of them it covers. */
export function inquiryScope(failedCodes) {
  for (const code of failedCodes) {
    if (BLOCKING[code]) return { eligible: false, code: BLOCKING[code] };
  }
  const checks = failedCodes.filter((code) => REQUESTS[code]);
  if (!checks.length) return { eligible: false, code: "INQUIRY_NOT_APPLICABLE" };
  return { eligible: true, checks, requests: [...new Set(checks.map((code) => REQUESTS[code].request))] };
}
