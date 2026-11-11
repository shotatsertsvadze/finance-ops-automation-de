import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  approveBankChange,
  cancelBankChange,
  getBankChange,
  rejectBankChange,
  revalidateBankChange,
  verifyBankChange,
} from "../../lib/api.js";
import { groupIban } from "../../lib/format.js";
import { useI18n } from "../../lib/i18n.js";
import Fact from "../../components/Fact.jsx";
import Panel from "../../components/Panel.jsx";
import StateChip from "../../components/StateChip.jsx";
import ChangeChip from "./ChangeChip.jsx";
import VerifyForm from "./VerifyForm.jsx";
import { changeActions, changeSteps } from "./rules.js";
import Button from "../../components/Button.jsx";

export default function BankChangeDetail({ user, may }) {
  const { t, errorText } = useI18n();
  const { id } = useParams();
  const [change, setChange] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    getBankChange(id)
      .then(setChange)
      .catch((e) => setLoadError(errorText(e)));
  useEffect(() => {
    load();
  }, [id]);

  // Every step answers with the change as it now stands; a refusal reloads,
  // since someone else may have moved it.
  async function run(fn) {
    setBusy(true);
    setMessage(null);
    try {
      const next = await fn();
      setChange(next);
      const r = next.revalidation;
      if (r)
        setMessage({ ok: r.failed.length === 0, text: t("revalidationSummary", r.revalidated.length, r.waiting.length, r.failed.length) });
    } catch (e) {
      setMessage({ ok: false, text: errorText(e) });
      load();
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <p className="error">{loadError}</p>;
  if (!change) return <p className="empty">{t("loading")}</p>;
  const actions = changeActions(change, user, may);

  return (
    <>
      <Link to="/bankverbindungen" className="back">
        {t("backToBankChanges")}
      </Link>
      <div className="page-head mt-8">
        <div>
          <h1 className="mono">{change.change_no}</h1>
          <p>
            {change.supplier_name} · {change.supplier_no}
          </p>
        </div>
        <ChangeChip state={change.state} />
      </div>
      <ChangeProgress change={change} />
      <div className="detail">
        <div className="detail-stack">
          <ProposalPanel change={change} />
        </div>
        <div className="detail-stack">
          {message && (
            <div className={`toast${message.ok ? "" : " is-error"}`} role="status">
              {message.text}
            </div>
          )}
          <VerificationPanel
            change={change}
            busy={busy}
            canVerify={actions.includes("verify")}
            onVerify={(body) => run(() => verifyBankChange(id, body))}
          />
          <DecisionPanel change={change} actions={actions} busy={busy} run={run} />
          <AffectedPanel
            change={change}
            busy={busy}
            canRetry={actions.includes("revalidate")}
            onRetry={() => run(() => revalidateBankChange(id))}
          />
          <HistoryPanel events={change.events} />
        </div>
      </div>
    </>
  );
}

const STEP_NAME = { proposal: "stepProposal", callback: "stepCallback", approval: "stepApproval" };
const STEP_STATUS = { done: "stepDone", failed: "stepRefused", attention: "stepNext" };

/** Three people, three steps: who did each, when, and what is next (ADR-077). */
function ChangeProgress({ change }) {
  const { t, formatDateTime } = useI18n();
  const ended = ["APPROVED", "REJECTED", "CANCELLED"].includes(change.state);
  return (
    <>
      <ol className="change-steps" aria-label={t("changeProgress")}>
        {changeSteps(change).map((step, i) => (
          <li key={step.key} className={`change-step is-${step.tone}`}>
            <span className="change-step-no">{i + 1}</span>
            <div>
              <div className="change-step-name">
                {t(STEP_NAME[step.key])}
                <span className="change-step-status"> · {t(STEP_STATUS[step.tone] ?? (ended ? "stepNotReached" : "stepOpen"))}</span>
              </div>
              {step.actor && (
                <div className="change-step-meta">
                  {step.actor} · {formatDateTime(step.at)}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="hint change-steps-note">{t("policyPersons", change.required_distinct_actors)}</p>
    </>
  );
}

function ProposalPanel({ change }) {
  const { t, formatDateTime } = useI18n();
  const shared = change.shared_with_now.map((s) => `${s.supplier_no} ${s.legal_name}`).join(", ");
  return (
    <Panel title={t("panelProposal")}>
      {shared && (
        <p className="warning-note" role="alert">
          {t("sharedIbanWarning", shared)}
        </p>
      )}
      <div className="facts">
        <Fact label={t("fieldProposedIban")} value={groupIban(change.proposed_iban)} mono />
        <Fact
          label={t("fieldTrustedAccounts")}
          mono
          value={change.supplier_accounts
            .filter((a) => a.status === "ACTIVE")
            .map((a) => (
              <div key={a.iban}>{groupIban(a.iban)}</div>
            ))}
        />
        <Fact label={t("reason")} value={change.reason} />
        {change.source_invoice_id && (
          <Fact
            label={t("fieldSourceInvoice")}
            value={
              <Link to={`/rechnung/${change.source_invoice_id}`} className="mono">
                {change.source_invoice_number}
              </Link>
            }
          />
        )}
        <Fact label={t("fieldProposedBy")} value={`${change.proposed_by_name} · ${formatDateTime(change.proposed_at)}`} />
        <Fact label={t("fieldPolicy")} value={t("policyPersons", change.required_distinct_actors)} />
      </div>
      <p className="hint mb-0">{t("addNotReplace")}</p>
    </Panel>
  );
}

function VerificationPanel({ change, busy, canVerify, onVerify }) {
  const { t, formatDateTime } = useI18n();
  const v = change.verification;
  return (
    <Panel title={t("panelVerification")}>
      {v ? (
        <div className="facts">
          <Fact label={t("fieldOutcome")} value={t(v.outcome === "CONFIRMED" ? "outcomeConfirmed" : "outcomeDenied")} />
          <Fact label={t("fieldCalledNumber")} value={v.contact_number} mono />
          <Fact label={t("fieldContactedRole")} value={v.contacted_role} />
          <Fact label={t("fieldCalledAt")} value={formatDateTime(v.called_at)} mono />
          {v.iban_read_back && <Fact label={t("fieldIbanReadBack")} value={groupIban(v.iban_read_back)} mono />}
          {v.reference && <Fact label={t("fieldReference")} value={v.reference} />}
          {v.note && <Fact label={t("fieldNote")} value={v.note} />}
          <Fact label={t("fieldVerifiedBy")} value={v.verified_by_name} />
        </div>
      ) : canVerify ? (
        <VerifyForm change={change} busy={busy} onSubmit={onVerify} />
      ) : (
        <p className="hint m-0">{t("notVerifiedYet")}</p>
      )}
    </Panel>
  );
}

function DecisionPanel({ change, actions, busy, run }) {
  const { t, formatDateTime } = useI18n();
  const [comment, setComment] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const deciding = actions.filter((a) => ["approve", "reject", "cancel"].includes(a));

  if (change.decided_by) {
    return (
      <Panel title={t("panelChangeDecision")}>
        <div className="facts">
          <Fact label={t("fieldDecidedBy")} value={`${change.decided_by_name} · ${formatDateTime(change.decided_at)}`} />
          {change.decision_reason && <Fact label={t("reason")} value={change.decision_reason} />}
        </div>
      </Panel>
    );
  }
  if (deciding.length === 0) {
    return (
      <Panel title={t("panelChangeDecision")}>
        <p className="hint m-0">{t("nextStepOther")}</p>
      </Panel>
    );
  }
  const id = change.id;
  const buttons = {
    approve: [t("approveBankAccount"), "btn", () => approveBankChange(id, { comment, acknowledge_shared_iban: acknowledged })],
    reject: [t("reject"), "btn btn-danger", () => rejectBankChange(id, comment)],
    cancel: [t("cancelProposal"), "btn btn-ghost", () => cancelBankChange(id, comment)],
  };
  return (
    <Panel title={t("panelChangeDecision")}>
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
      {deciding.includes("approve") && change.shared_with_now.length > 0 && (
        <label className="action-check">
          <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
          <span>{t("acknowledgeShared")}</span>
        </label>
      )}
      <div className="action-row">
        {deciding.map((key) => {
          const [label, className, call] = buttons[key];
          return (
            <button key={key} className={className} disabled={busy} onClick={() => run(call)}>
              {label}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function AffectedPanel({ change, busy, canRetry, onRetry }) {
  const { t } = useI18n();
  const invoiceLink = (id, number) => (
    <Link to={`/rechnung/${id}`} className="mono">
      {number ?? id}
    </Link>
  );
  const none = change.revalidations.length === 0 && change.pending_invoices.length === 0;
  return (
    <Panel title={t("panelAffectedInvoices")}>
      {none && <p className="hint m-0">{t("noAffectedInvoices")}</p>}
      <ul className="plain-list">
        {change.revalidations.map((r) => (
          <li key={r.invoice_id}>
            {invoiceLink(r.invoice_id, r.invoice_number)} · <StateChip state={r.from_state} /> → <StateChip state={r.to_state} />
            <span className="hint"> · {t("runChange", r.from_run_no, r.to_run_no)}</span>
          </li>
        ))}
        {change.pending_invoices.map((p) => (
          <li key={p.invoice_id}>
            {invoiceLink(p.invoice_id, p.invoice_number)} · <StateChip state={p.state} />
            <span className="hint"> · {t(p.state === "INFO_REQUESTED" ? "pendingWaiting" : "pendingRetry")}</span>
          </li>
        ))}
      </ul>
      {canRetry && (
        <Button variant="ghost" disabled={busy} onClick={onRetry}>
          {t("revalidateInvoices")}
        </Button>
      )}
    </Panel>
  );
}

function HistoryPanel({ events }) {
  const { t, changeAction, formatDateTime } = useI18n();
  return (
    <Panel title={t("panelHistory")}>
      <ul className="plain-list">
        {events.map((e) => (
          <li key={e.id}>
            <strong>{changeAction(e.action)}</strong>
            <span className="hint">
              {" "}
              · {e.actor_name ?? t("actorSystem")} · {formatDateTime(e.occurred_at)}
            </span>
            {e.reason && <div className="hint">{e.reason}</div>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
