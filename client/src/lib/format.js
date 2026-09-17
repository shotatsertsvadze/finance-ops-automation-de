export const STATE_LABELS = {
  RECEIVED: "Eingegangen",
  VALIDATING: "In Prüfung",
  REVIEW_REQUIRED: "Sichtprüfung",
  INFO_REQUESTED: "Rückfrage offen",
  READY_FOR_APPROVAL: "Freigabe ausstehend",
  APPROVED: "Freigegeben",
  ACCOUNTING_READY: "Buchungsreif",
  PAYMENT_PENDING: "Zahlung angestoßen",
  PAID: "Bezahlt",
  RECONCILED: "Abgeglichen",
  RECONCILIATION_EXCEPTION: "Abgleich unklar",
  REJECTED: "Abgelehnt",
  DUPLICATE: "Duplikat",
};

/** Why an invoice is blocked, in the words a clerk would use. */
export const REVIEW_REASON_LABELS = {
  TECHNICAL_VALIDATION_FAILED: "Datei nicht verarbeitbar",
  SUPPLIER_IBAN_MATCH: "IBAN weicht von den Stammdaten ab",
  SUPPLIER_KNOWN: "Lieferant unbekannt",
  SUPPLIER_ACTIVE: "Lieferant gesperrt",
  DUPLICATE_INVOICE_NUMBER: "Rechnungsnummer bereits erfasst",
  PO_EXISTS: "Bestellung unbekannt",
  PO_SUPPLIER_MATCH: "Bestellung gehört anderem Lieferanten",
  PO_AMOUNT_WITHIN_TOLERANCE: "Betrag überschreitet die Bestellung",
  PO_REFERENCE_PRESENT: "Bestellreferenz fehlt",
  TOTALS_CONSISTENT: "Summen nicht konsistent",
  CURRENCY_EXPECTED: "Unerwartete Währung",
  REQUIRED_FIELDS_COMPLETE: "Pflichtangaben unvollständig",
  AMOUNT_UNKNOWN: "Betrag nicht bestimmbar",
};

export const ACTION_LABELS = {
  received: "Eingegangen",
  processing_started: "Prüfung gestartet",
  reprocessing_started: "Erneut geprüft",
  technical_validation_failed: "Technische Prüfung fehlgeschlagen",
  routed_to_review: "In Sichtprüfung geleitet",
  routed_to_approval: "Zur Freigabe geleitet",
  auto_approved: "Automatisch freigegeben",
  duplicate_file_detected: "Als Duplikat erkannt",
  duplicate_attempt: "Erneuter Upload derselben Datei",
  review_accepted: "Sichtprüfung freigegeben",
  review_rejected: "In der Sichtprüfung abgelehnt",
  information_requested: "Rückfrage gestellt",
  info_received: "Rückmeldung eingegangen",
  duplicate_confirmed: "Als Duplikat bestätigt",
  approval_step_approved: "Freigabeschritt erteilt",
  approved: "Freigegeben",
  approval_rejected: "Freigabe verweigert",
};

export const ROLE_LABELS = {
  AP_CLERK: "Kreditorenbuchhaltung",
  MANAGER: "Kostenstellenleitung",
  FINANCE: "Finanzen",
  CFO: "CFO",
  ADMIN: "Administration",
};

const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
export const formatMoney = (value) => (value === null || value === undefined ? "—" : euro.format(Number(value)));

export const formatDate = (value) =>
  value ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : "—";

export const formatDateTime = (value) =>
  value
    ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))
    : "—";

export const groupIban = (iban) => (iban ?? "").replace(/(.{4})/g, "$1 ").trim();

/**
 * Character-level comparison for identifiers. An AP clerk checking a changed
 * IBAN needs to see where it differs, not just that it differs.
 */
export function diffChars(expected, actual) {
  const a = (expected ?? "").toUpperCase();
  const b = (actual ?? "").toUpperCase();
  return [...b].map((char, i) => ({ char, differs: a[i] !== char }));
}

export const isSingleIdentifier = (value) => typeof value === "string" && /^[A-Z0-9]{10,40}$/i.test(value.trim());
