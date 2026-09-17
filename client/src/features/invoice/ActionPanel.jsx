import { useState } from "react";
import {
  confirmPayment, createAccountingRecord, decideReview, decideStep,
  instructPayment, reportInfoReceived, reprocessInvoice, resolveReconciliation,
} from "../../lib/api.js";
import { useI18n } from "../../lib/i18n.js";

/**
 * What this person can do with this invoice right now, and what the system
 * needs from them. The server enforces every rule here; refusals are shown
 * verbatim so a blocked four-eyes check is visible rather than silent.
 */
export default function ActionPanel({ invoice, may, onDone }) {
  const { t, errorText, role } = useI18n();
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
      setError(errorText(e));
      // A refusal can still have moved the invoice: the final approval gate
      // sends it back to review and answers 409. Reloading either way keeps
      // the screen showing what the server actually holds.
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const id = invoice.id;
  const actions = [];
  let prompt = null;

  if (invoice.state === "REVIEW_REQUIRED") {
    prompt = t("hintReviewStopped");
    actions.push(
      { key: "accept", label: t("releaseFromReview"), tone: "ok", needs: "review:decide", run: () => decideReview(id, "accept", comment) },
      { key: "request-info", label: t("requestInfo"), tone: "", needsComment: true, needs: "review:decide", run: () => decideReview(id, "request-info", comment) },
      { key: "confirm-duplicate", label: t("confirmDuplicate"), tone: "", needsComment: true, needs: "review:decide", run: () => decideReview(id, "confirm-duplicate", comment) },
      { key: "reject", label: t("reject"), tone: "high", needsComment: true, needs: "review:decide", run: () => decideReview(id, "reject", comment) },
      { key: "reprocess", label: t("reprocess"), tone: "", needs: "invoice:reprocess", run: () => reprocessInvoice(id) },
    );
  } else if (invoice.state === "READY_FOR_APPROVAL" && step) {
    prompt = t("stepOf", step.step_no, invoice.approval_steps.length, role(step.required_role));
    actions.push(
      { key: "approve", label: t("approve"), tone: "ok", needs: "approval:decide", run: () => decideStep(id, step.step_no, "approve", comment) },
      { key: "step-reject", label: t("reject"), tone: "high", needsComment: true, needs: "approval:decide", run: () => decideStep(id, step.step_no, "reject", comment) },
      { key: "request-info", label: t("requestInfo"), tone: "", needsComment: true, needs: "review:decide", run: () => decideReview(id, "request-info", comment) },
    );
  } else if (invoice.state === "APPROVED") {
    prompt = t("hintApproved");
    actions.push({ key: "accounting", label: t("createBookingRecord"), tone: "ok", needs: "accounting:handoff", run: () => createAccountingRecord(id) });
  } else if (invoice.state === "ACCOUNTING_READY") {
    prompt = t("hintAccountingReady", invoice.accounting_record?.document_no ?? "");
    actions.push({ key: "pay", label: t("instructPayment"), tone: "ok", needs: "payment:instruct", run: () => instructPayment(id) });
  } else if (invoice.state === "PAYMENT_PENDING") {
    prompt = t("hintPaymentPending");
    actions.push({ key: "confirm", label: t("confirmPayment"), tone: "ok", needs: "payment:confirm", run: () => confirmPayment(id) });
  } else if (invoice.state === "RECONCILIATION_EXCEPTION") {
    prompt = t("hintReconciliationException");
    actions.push({ key: "resolve", label: t("closeReconciliation"), tone: "ok", needsComment: true, needs: "reconciliation:resolve", run: () => resolveReconciliation(id, comment) });
  } else if (invoice.state === "INFO_REQUESTED") {
    prompt = t("hintInfoRequested");
    actions.push(
      { key: "info-received", label: t("infoReceived"), tone: "ok", needs: "review:decide", run: () => reportInfoReceived(id, comment) },
      { key: "reject", label: t("reject"), tone: "high", needsComment: true, needs: "review:decide", run: () => decideReview(id, "reject", comment) },
    );
  }

  // Hide what this role may not do. The server refuses it regardless; this
  // only avoids offering a button that always fails.
  const permitted = actions.filter((action) => !action.needs || may(action.needs));
  if (permitted.length === 0) {
    return prompt ? (
      <section className="panel">
        <div className="panel-head"><span className="label">{t("status")}</span></div>
        <div className="panel-body">
          {/* The refusal that moved the invoice here is shown in this branch
              too, otherwise a click that fails and relocates the invoice
              leaves no trace of why. */}
          {error && <div className="toast is-error" role="alert">{error}</div>}
          <p className="action-prompt" style={{ marginBottom: 0 }}>{prompt}</p>
          <p className="hint" style={{ marginBottom: 0 }}>{t("otherRoleResponsible")}</p>
        </div>
      </section>
    ) : null;
  }

  const needsComment = permitted.some((a) => a.needsComment);

  return (
    <section className="panel">
      <div className="panel-head">
        <span className="label">{t("yourDecision")}</span>
        
      </div>
      <div className="panel-body">
        <p className="action-prompt">{prompt}</p>
        {error && <div className="toast is-error" role="alert">{error}</div>}
        {needsComment && (
          <label className="action-comment">
            <span className="label">{t("reason")}</span>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("reasonPlaceholder")}
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
