import { useState } from "react";
import {
  cancelInvoice,
  confirmPayment,
  createAccountingRecord,
  decideReview,
  decideStep,
  failPayment,
  retryPayment,
  instructPayment,
  bookCredit,
  settleByCredit,
  reportInfoReceived,
  reprocessInvoice,
  resolveReconciliation,
} from "../../lib/api.js";
import { useI18n } from "../../lib/i18n.js";
import { availableActions, primaryAction } from "./actions.js";
import { invoiceBankEntry } from "../bank-changes/rules.js";
import Panel from "../../components/Panel.jsx";

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
  const { prompt: promptSpec, step, actions: available } = availableActions(invoice);

  // key -> what pressing it does. The decision of which keys to offer is in
  // actions.js; this is only the wiring.
  const handlers = {
    accept: () => decideReview(id, "accept", comment),
    "request-info": () => decideReview(id, "request-info", comment),
    "confirm-duplicate": () => decideReview(id, "confirm-duplicate", comment),
    reject: () => decideReview(id, "reject", comment),
    reprocess: () => reprocessInvoice(id),
    approve: () => decideStep(id, step.step_no, "approve", comment),
    "step-reject": () => decideStep(id, step.step_no, "reject", comment),
    accounting: () => createAccountingRecord(id),
    credit: () => bookCredit(id),
    settle: () => settleByCredit(id),
    pay: () => instructPayment(id),
    confirm: () => confirmPayment(id),
    resolve: () => resolveReconciliation(id, comment),
    "info-received": () => reportInfoReceived(id, comment),
    cancel: () => cancelInvoice(id, comment),
    fail: () => failPayment(id, comment),
    retry: () => retryPayment(id),
  };
  const LABELS = {
    accept: "releaseFromReview",
    "request-info": "requestInfo",
    "confirm-duplicate": "confirmDuplicate",
    reject: "reject",
    reprocess: "reprocess",
    approve: "approve",
    "step-reject": "reject",
    accounting: "createBookingRecord",
    credit: "bookCredit",
    settle: "settleByCredit",
    pay: "instructPayment",
    confirm: "confirmPayment",
    resolve: "closeReconciliation",
    "info-received": "infoReceived",
    cancel: "cancelInvoice",
    fail: "failPayment",
    retry: "retryPayment",
  };

  const actions = available.map((a) => ({ ...a, label: t(LABELS[a.key]), run: handlers[a.key] }));
  // The step prompt names a role, which has its own dictionary.
  const prompt = promptSpec
    ? promptSpec.key === "stepOf"
      ? t("stepOf", promptSpec.args[0], promptSpec.args[1], role(promptSpec.args[2]))
      : t(promptSpec.key, ...promptSpec.args)
    : null;

  // Hide what this role may not do. The server refuses it regardless; this
  // only avoids offering a button that always fails.
  const permitted = actions.filter((action) => !action.needs || may(action.needs));
  if (permitted.length === 0) {
    return prompt ? (
      <Panel title={t("status")}>
        {/* The refusal that moved the invoice here is shown in this branch
              too, otherwise a click that fails and relocates the invoice
              leaves no trace of why. */}
        {error && (
          <div className="toast is-error" role="alert">
            {error}
          </div>
        )}
        <p className="action-prompt mb-0">{prompt}</p>
        <p className="hint mb-0">{t("otherRoleResponsible")}</p>
      </Panel>
    ) : null;
  }

  const needsComment = permitted.some((a) => a.needsComment);
  const primary = primaryAction(invoice, permitted, { bankProposalOffered: invoiceBankEntry(invoice, may).canPropose });

  return (
    <Panel title={t("yourDecision")}>
      <p className="action-prompt">{prompt}</p>
      {error && (
        <div className="toast is-error" role="alert">
          {error}
        </div>
      )}
      {needsComment && (
        <label className="action-comment">
          <span className="label">{t("reason")}</span>
          <textarea
            rows={2}
            maxLength={1000}
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
            className={`btn ${action.key === primary ? "" : action.tone === "high" ? "btn-danger" : "btn-ghost"}`}
            disabled={busy}
            onClick={() => run(action.run)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </Panel>
  );
}
