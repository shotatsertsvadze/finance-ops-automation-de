import { useState } from "react";
import { decideReview, decideStep, reportInfoReceived, reprocessInvoice } from "../../lib/api.js";
import { ROLE_LABELS } from "../../lib/format.js";

/**
 * What this person can do with this invoice right now, and what the system
 * needs from them. The server enforces every rule here; refusals are shown
 * verbatim so a blocked four-eyes check is visible rather than silent.
 */
export default function ActionPanel({ invoice, actor, onDone }) {
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const step = invoice.approval_steps.find((s) => s.status === "PENDING");

  async function run(fn) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setComment("");
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const id = invoice.id;
  const actions = [];
  let prompt = null;

  if (invoice.state === "REVIEW_REQUIRED") {
    prompt = "Die automatische Verarbeitung ist gestoppt. Entscheiden Sie auf Basis der Prüfspur.";
    actions.push(
      { key: "accept", label: "Zur Freigabe geben", tone: "ok", run: () => decideReview(id, "accept", actor?.id, comment) },
      { key: "request-info", label: "Rückfrage stellen", tone: "", needsComment: true, run: () => decideReview(id, "request-info", actor?.id, comment) },
      { key: "confirm-duplicate", label: "Duplikat bestätigen", tone: "", needsComment: true, run: () => decideReview(id, "confirm-duplicate", actor?.id, comment) },
      { key: "reject", label: "Ablehnen", tone: "high", needsComment: true, run: () => decideReview(id, "reject", actor?.id, comment) },
      { key: "reprocess", label: "Erneut prüfen", tone: "", run: () => reprocessInvoice(id, actor?.id) },
    );
  } else if (invoice.state === "READY_FOR_APPROVAL" && step) {
    prompt = `Schritt ${step.step_no} von ${invoice.approval_steps.length}: Freigabe durch ${ROLE_LABELS[step.required_role] ?? step.required_role}.`;
    actions.push(
      { key: "approve", label: "Freigeben", tone: "ok", run: () => decideStep(id, step.step_no, "approve", actor?.id, comment) },
      { key: "step-reject", label: "Ablehnen", tone: "high", needsComment: true, run: () => decideStep(id, step.step_no, "reject", actor?.id, comment) },
      { key: "request-info", label: "Rückfrage stellen", tone: "", needsComment: true, run: () => decideReview(id, "request-info", actor?.id, comment) },
    );
  } else if (invoice.state === "INFO_REQUESTED") {
    prompt = "Die Rechnung wartet auf eine Rückmeldung. Sobald sie vorliegt, geht sie zurück in die Sichtprüfung.";
    actions.push(
      { key: "info-received", label: "Rückmeldung eingegangen", tone: "ok", run: () => reportInfoReceived(id, actor?.id, comment) },
      { key: "reject", label: "Ablehnen", tone: "high", needsComment: true, run: () => decideReview(id, "reject", actor?.id, comment) },
    );
  }

  if (actions.length === 0) return null;

  const needsComment = actions.some((a) => a.needsComment);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">Ihre Entscheidung</span>
        {actor && <span className="hint">{actor.name} · {ROLE_LABELS[actor.role] ?? actor.role}</span>}
      </div>
      <div className="panel-body">
        <p className="action-prompt">{prompt}</p>
        {error && <div className="toast is-error" role="alert">{error}</div>}
        {needsComment && (
          <label className="action-comment">
            <span className="label">Begründung</span>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Pflicht bei Ablehnung, Rückfrage und Duplikat"
            />
          </label>
        )}
        <div className="action-row">
          {actions.map((action) => (
            <button
              key={action.key}
              className={`btn ${action.tone === "ok" ? "" : action.tone === "high" ? "btn-danger" : "btn-ghost"}`}
              disabled={busy}
              onClick={() => run(action.run)}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
