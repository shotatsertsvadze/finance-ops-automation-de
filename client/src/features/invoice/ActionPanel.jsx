import { useState } from "react";
import {
  confirmPayment, createAccountingRecord, decideReview, decideStep,
  instructPayment, reportInfoReceived, reprocessInvoice, resolveReconciliation,
} from "../../lib/api.js";
import { ROLE_LABELS } from "../../lib/format.js";

/**
 * What this person can do with this invoice right now, and what the system
 * needs from them. The server enforces every rule here; refusals are shown
 * verbatim so a blocked four-eyes check is visible rather than silent.
 */
export default function ActionPanel({ invoice, may, onDone }) {
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
      { key: "accept", label: "Zur Freigabe geben", tone: "ok", needs: "review:decide", run: () => decideReview(id, "accept", comment) },
      { key: "request-info", label: "Rückfrage stellen", tone: "", needsComment: true, needs: "review:decide", run: () => decideReview(id, "request-info", comment) },
      { key: "confirm-duplicate", label: "Duplikat bestätigen", tone: "", needsComment: true, needs: "review:decide", run: () => decideReview(id, "confirm-duplicate", comment) },
      { key: "reject", label: "Ablehnen", tone: "high", needsComment: true, needs: "review:decide", run: () => decideReview(id, "reject", comment) },
      { key: "reprocess", label: "Erneut prüfen", tone: "", needs: "invoice:reprocess", run: () => reprocessInvoice(id) },
    );
  } else if (invoice.state === "READY_FOR_APPROVAL" && step) {
    prompt = `Schritt ${step.step_no} von ${invoice.approval_steps.length}: Freigabe durch ${ROLE_LABELS[step.required_role] ?? step.required_role}.`;
    actions.push(
      { key: "approve", label: "Freigeben", tone: "ok", needs: "approval:decide", run: () => decideStep(id, step.step_no, "approve", comment) },
      { key: "step-reject", label: "Ablehnen", tone: "high", needsComment: true, needs: "approval:decide", run: () => decideStep(id, step.step_no, "reject", comment) },
      { key: "request-info", label: "Rückfrage stellen", tone: "", needsComment: true, needs: "review:decide", run: () => decideReview(id, "request-info", comment) },
    );
  } else if (invoice.state === "APPROVED") {
    prompt = "Freigegeben. Der Buchungssatz kann an die Buchhaltung übergeben werden.";
    actions.push({ key: "accounting", label: "Buchungssatz erzeugen", tone: "ok", needs: "accounting:handoff", run: () => createAccountingRecord(id) });
  } else if (invoice.state === "ACCOUNTING_READY") {
    prompt = `Buchungssatz ${invoice.accounting_record?.document_no ?? ""} liegt vor. Zahlung anweisen?`;
    actions.push({ key: "pay", label: "Zahlung anweisen", tone: "ok", needs: "payment:instruct", run: () => instructPayment(id) });
  } else if (invoice.state === "PAYMENT_PENDING") {
    prompt = "Zahlung ist angewiesen. Die Bestätigung käme in einem echten System vom Zahlungsdienstleister.";
    actions.push({ key: "confirm", label: "Zahlung bestätigen (Simulation)", tone: "ok", needs: "payment:confirm", run: () => confirmPayment(id) });
  } else if (invoice.state === "RECONCILIATION_EXCEPTION") {
    prompt = "Der Zahlungsabgleich ist nicht eindeutig. Prüfen Sie den Zahlungseingang und schließen Sie den Fall mit Begründung ab.";
    actions.push({ key: "resolve", label: "Abgleich abschließen", tone: "ok", needsComment: true, needs: "reconciliation:resolve", run: () => resolveReconciliation(id, comment) });
  } else if (invoice.state === "INFO_REQUESTED") {
    prompt = "Die Rechnung wartet auf eine Rückmeldung. Sobald sie vorliegt, geht sie zurück in die Sichtprüfung.";
    actions.push(
      { key: "info-received", label: "Rückmeldung eingegangen", tone: "ok", needs: "review:decide", run: () => reportInfoReceived(id, comment) },
      { key: "reject", label: "Ablehnen", tone: "high", needsComment: true, needs: "review:decide", run: () => decideReview(id, "reject", comment) },
    );
  }

  // Hide what this role may not do. The server refuses it regardless; this
  // only avoids offering a button that always fails.
  const permitted = actions.filter((action) => !action.needs || may(action.needs));
  if (permitted.length === 0) {
    return prompt ? (
      <section className="panel">
        <div className="panel-head"><span className="label">Status</span></div>
        <div className="panel-body">
          <p className="action-prompt" style={{ marginBottom: 0 }}>{prompt}</p>
          <p className="hint" style={{ marginBottom: 0 }}>Für diesen Schritt ist eine andere Rolle zuständig.</p>
        </div>
      </section>
    ) : null;
  }

  const needsComment = permitted.some((a) => a.needsComment);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">Ihre Entscheidung</span>
        
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
              placeholder="Grund angeben"
            />
          </label>
        )}
        <div className="action-row">
          {permitted.map((action) => (
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
