import { REQUESTS } from "./requests.js";

/**
 * The fixed inquiry for the given checks (ADR-084): no model, the same text for
 * the same checks. It is what a person gets when the model is off, fails or is
 * refused, and the baseline the AI drafts are measured against. Placeholders
 * are named only when the invoice has a value for them.
 */
export function templateInquiry(checks, available) {
  const has = (name) => available.includes(name);
  const subject = has("rechnungsnummer") ? "Rückfrage zu Ihrer Rechnung {{rechnungsnummer}}" : "Rückfrage zu Ihrer Rechnung";
  const invoice = ["Ihrer Rechnung", has("rechnungsnummer") && "{{rechnungsnummer}}", has("rechnungsdatum") && "vom {{rechnungsdatum}}",
    has("bruttobetrag") && "über {{bruttobetrag}}"].filter(Boolean).join(" ");
  const usable = (text) => !text.includes("{{bestellnummer}}") || has("bestellnummer");
  const issues = [...new Set(checks.map((code) => REQUESTS[code].issue))]
    .map((issue) => (usable(issue) ? issue : issue.replace(" {{bestellnummer}}", "")));
  const asks = [...new Set(checks.map((code) => REQUESTS[code].ask))];
  const body = [
    "Sehr geehrte Damen und Herren,",
    `bei der Prüfung ${invoice} ist uns Folgendes aufgefallen:`,
    issues.map((issue) => `- ${issue}`).join("\n"),
    asks.join(" "),
    "Bis zur Klärung bearbeiten wir die Rechnung nicht weiter. Vielen Dank für Ihre Unterstützung.",
    `Mit freundlichen Grüßen\nKreditorenbuchhaltung${has("unser_unternehmen") ? "\n{{unser_unternehmen}}" : ""}`,
  ].join("\n\n");
  return { subject, body };
}
