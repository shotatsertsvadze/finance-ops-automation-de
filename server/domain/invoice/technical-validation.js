import { SEVERITY, failed, passed, warning } from "../checks.js";
import { toCents } from "../money.js";
import { isValidIsoDate } from "../dates.js";
import { checkXmlSafety } from "./xml-safety.js";
import { InvoiceParseError, parseInvoiceXml } from "./parse-xrechnung.js";

const XRECHNUNG_MARKER = /xrechnung/i;

/**
 * "Can this be processed as a structured invoice?" Structure only; whether
 * the invoice makes sense for the company is business validation.
 */
export function runTechnicalValidation(buffer) {
  const checks = [];
  const safety = checkXmlSafety(buffer);
  if (!safety.ok) {
    checks.push(failed("xml_well_formed", SEVERITY.HIGH, { expected: "XML ohne DOCTYPE/ENTITY, UTF-8, max. 5 MB", actual: safety.reason, reason: safety.reason }));
    return { checks, parsed: null, passed: false };
  }

  let parsed;
  try {
    parsed = parseInvoiceXml(safety.text);
  } catch (error) {
    if (!(error instanceof InvoiceParseError)) throw error;
    const check = error.code === "NOT_WELL_FORMED" ? "xml_well_formed" : "format_recognised";
    checks.push(failed(check, SEVERITY.HIGH, { expected: "UBL 2.1 Invoice (XRechnung)", actual: error.message, reason: error.message }));
    return { checks, parsed: null, passed: false };
  }
  checks.push(passed("xml_well_formed", SEVERITY.HIGH, { expected: "wohlgeformtes XML", actual: "ok", reason: "XML ist wohlgeformt" }));
  checks.push(passed("format_recognised", SEVERITY.HIGH, { expected: "UBL 2.1 Invoice", actual: parsed.format, reason: "UBL-Invoice-Dokument erkannt" }));

  if (parsed.customizationId && XRECHNUNG_MARKER.test(parsed.customizationId)) {
    checks.push(passed("xrechnung_profile_declared", SEVERITY.MEDIUM, { expected: "CustomizationID mit XRechnung-Kennung", actual: parsed.customizationId, reason: "XRechnung-Profil deklariert (keine Konformitätsprüfung)" }));
  } else {
    checks.push(failed("xrechnung_profile_declared", SEVERITY.MEDIUM, { expected: "CustomizationID mit XRechnung-Kennung", actual: parsed.customizationId ?? "(fehlt)", reason: "Dokument deklariert kein XRechnung-Profil" }));
  }

  const required = {
    "Rechnungsnummer (cbc:ID)": parsed.invoiceNumber,
    "Rechnungsdatum (cbc:IssueDate)": parsed.issueDate,
    "Lieferantenname": parsed.supplier.name,
    "Währung (cbc:DocumentCurrencyCode)": parsed.currency,
    "Zahlbetrag (cbc:PayableAmount)": parsed.totals.payable,
    "Nettobetrag (cbc:TaxExclusiveAmount)": parsed.totals.taxExclusive,
    "Steuerbetrag (cbc:TaxAmount)": parsed.totals.taxAmount,
    "Rechnungspositionen": parsed.lines.length > 0 ? "ok" : null,
  };
  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    checks.push(failed("required_fields_present", SEVERITY.HIGH, { expected: Object.keys(required).join(", "), actual: `fehlt: ${missing.join(", ")}`, reason: `Pflichtfelder fehlen: ${missing.join(", ")}` }));
  } else {
    checks.push(passed("required_fields_present", SEVERITY.HIGH, { expected: "alle Pflichtfelder", actual: "vollständig", reason: "Alle für die Verarbeitung nötigen Felder vorhanden" }));
  }

  const amounts = {
    payable: parsed.totals.payable,
    taxExclusive: parsed.totals.taxExclusive,
    taxAmount: parsed.totals.taxAmount,
    lineExtension: parsed.totals.lineExtension,
    ...Object.fromEntries(parsed.lines.map((l) => [`line ${l.lineNo} net`, l.lineNet])),
    ...Object.fromEntries(parsed.lines.map((l) => [`line ${l.lineNo} quantity`, l.quantity])),
    // A price we cannot read is a line we cannot verify, so it belongs here.
    ...Object.fromEntries(parsed.lines.map((l) => [`line ${l.lineNo} unit price`, l.unitPrice])),
  };
  const badAmounts = Object.entries(amounts).filter(([, v]) => v !== null && v !== undefined && toCents(v) === null && !/^-?\d+(\.\d+)?$/.test(String(v)));
  if (badAmounts.length) {
    checks.push(failed("amounts_numeric", SEVERITY.HIGH, { expected: "Dezimalzahlen mit Punkt", actual: badAmounts.map(([k, v]) => `${k}=${v}`).join(", "), reason: "Beträge oder Mengen sind nicht numerisch" }));
  } else {
    checks.push(passed("amounts_numeric", SEVERITY.HIGH, { expected: "Dezimalzahlen", actual: "ok", reason: "Alle Beträge sind numerisch" }));
  }

  // A date must be a real calendar date, not merely the right shape: 2026-02-30
  // passes a regex and then breaks the database insert.
  const dateFields = { "Rechnungsdatum": parsed.issueDate, "Fälligkeitsdatum": parsed.dueDate };
  const badDates = Object.entries(dateFields).filter(([, v]) => v !== null && v !== undefined && !isValidIsoDate(v));
  if (badDates.length) {
    checks.push(failed("dates_valid", SEVERITY.HIGH, {
      expected: "JJJJ-MM-TT, gültiges Kalenderdatum",
      actual: badDates.map(([k, v]) => `${k}=${v}`).join(", "),
      reason: "Datumsangabe ist kein gültiges Kalenderdatum",
    }));
  } else {
    checks.push(passed("dates_valid", SEVERITY.HIGH, {
      expected: "gültige Kalenderdaten", actual: "ok", reason: "Datumsangaben sind gültige Kalenderdaten",
    }));
  }

  // 380 is an invoice and 381 a credit note; both are documents this system
  // models, so neither is an anomaly. Anything else still is.
  if (parsed.typeCode && !["380", "381"].includes(parsed.typeCode)) {
    checks.push(warning("invoice_type_code", { expected: "380 (Rechnung)", actual: parsed.typeCode, reason: "Abweichender Rechnungstyp, wird als Hinweis geführt" }));
  }

  return { checks, parsed, passed: !checks.some((c) => c.status === "FAILED") };
}
