import { RuleError } from "../errors.js";
import { normalizeIban } from "./iban.js";

const invalid = (field, message) => new RuleError(400, "VERIFICATION_INVALID", message, { field });
const optionalText = (value, max) => value === undefined || value === null || (typeof value === "string" && value.length <= max);

// A call is entered to the minute, so one made in the minute of the proposal
// must not read as earlier than it.
const MINUTE_MS = 60_000;

/**
 * What the verifier records about the call-back, checked field by field. The
 * number called is not among them: it is read from master data.
 */
export function checkCallback(change, { outcome, contactedRole, calledAt, ibanReadBack, reference, note }) {
  if (!["CONFIRMED", "DENIED"].includes(outcome)) throw invalid("outcome", "Ergebnis des Rückrufs muss CONFIRMED oder DENIED sein");
  const role = typeof contactedRole === "string" ? contactedRole.trim() : "";
  if (!role || role.length > 100) throw invalid("contacted_role", "Gesprächspartner (Funktion) fehlt oder ist länger als 100 Zeichen");
  const at = typeof calledAt === "string" ? new Date(calledAt) : null;
  if (!at || Number.isNaN(at.getTime())) throw invalid("called_at", "Zeitpunkt des Rückrufs fehlt oder ist ungültig");
  if (at > new Date() || at < new Date(change.proposed_at.getTime() - MINUTE_MS)) {
    throw invalid("called_at", "Der Rückruf muss nach dem Vorschlag und nicht in der Zukunft liegen");
  }
  if (!optionalText(reference, 64)) throw invalid("reference", "Referenz darf höchstens 64 Zeichen haben");
  if (!optionalText(note, 1000)) throw invalid("note", "Notiz darf höchstens 1000 Zeichen haben");

  const readBack = normalizeIban(ibanReadBack) || null;
  if (outcome === "CONFIRMED" && readBack !== change.proposed_iban) {
    throw new RuleError(409, "IBAN_READ_BACK_MISMATCH",
      "Die vom Lieferanten genannte IBAN stimmt nicht mit dem Vorschlag überein; als nicht bestätigt erfassen", { read_back: readBack });
  }
  return { outcome, contactedRole: role, calledAt: at, ibanReadBack: readBack, reference: reference || null, note: note?.trim() || null };
}
