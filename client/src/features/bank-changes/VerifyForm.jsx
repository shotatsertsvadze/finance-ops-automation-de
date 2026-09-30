import { useState } from "react";
import { useI18n } from "../../lib/i18n.js";

/** Now, to the minute, as a datetime-local input expects it: local time, no zone. */
function localNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/**
 * The call-back record. The number to call is shown, not entered: it is the
 * one on file, and the server records that one whatever is sent (ADR-077).
 */
export default function VerifyForm({ change, busy, onSubmit }) {
  const { t } = useI18n();
  const [role, setRole] = useState("");
  const [calledAt, setCalledAt] = useState(localNow);
  const [readBack, setReadBack] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  if (!change.callback_phone) return <p className="error">{t("noCallbackNumber")}</p>;

  const submit = (outcome) => onSubmit({
    outcome,
    contacted_role: role,
    called_at: calledAt ? new Date(calledAt).toISOString() : "",
    iban_read_back: readBack,
    reference: reference || null,
    comment: note || null,
  });
  const field = (label, input) => (
    <label className="action-comment">
      <span className="label">{label}</span>
      {input}
    </label>
  );

  return (
    <>
      <p className="action-prompt">{t("callNumberOnFile", change.callback_phone)}</p>
      {field(t("fieldContactedRole"), <input value={role} maxLength={100} onChange={(e) => setRole(e.target.value)} />)}
      {field(t("fieldCalledAt"), <input type="datetime-local" value={calledAt} onChange={(e) => setCalledAt(e.target.value)} />)}
      {field(t("fieldIbanReadBack"), <input className="mono" value={readBack} onChange={(e) => setReadBack(e.target.value)} />)}
      {field(t("fieldReferenceOptional"), <input value={reference} maxLength={64} onChange={(e) => setReference(e.target.value)} />)}
      {field(t("fieldNote"), <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />)}
      <div className="action-row">
        <button className="btn" disabled={busy} onClick={() => submit("CONFIRMED")}>{t("verifyConfirmed")}</button>
        <button className="btn btn-danger" disabled={busy} onClick={() => submit("DENIED")}>{t("verifyDenied")}</button>
      </div>
    </>
  );
}
