import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getInvoice } from "../../lib/api.js";
import { groupIban } from "../../lib/format.js";
import { useI18n } from "../../lib/i18n.js";
import StateChip from "../../components/StateChip.jsx";
import Fact from "../../components/Fact.jsx";
import StateSpine from "./StateSpine.jsx";
import EvidenceRow from "./EvidenceRow.jsx";
import ActionPanel from "./ActionPanel.jsx";
import InvoiceBankPanel from "../bank-changes/InvoiceBankPanel.jsx";
import AiExplanation from "./AiExplanation.jsx";
import SupplierInquiry from "./SupplierInquiry.jsx";
import { STEP_TONE, chip } from "../../lib/tones.js";

export default function InvoiceDetail({ may, onChanged }) {
  const {
    t, errorText, role, action, reviewReason, auditReason, formatDate, formatDateTime, formatMoney,
    state: stateLabel, stepStatus, paymentStatus, channel,
  } = useI18n();
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState(null);
  const [showPassed, setShowPassed] = useState(false);

  const load = () => getInvoice(id).then(setInvoice).catch((e) => setError(errorText(e)));

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!invoice) return <p className="empty">{t("loading")}</p>;

  const results = [...invoice.validation.technical, ...invoice.validation.business];
  const failed = results.filter((r) => r.status === "FAILED");
  const rest = results.filter((r) => r.status !== "FAILED");
  const pendingRole = invoice.approval_steps.find((s) => s.status === "PENDING")?.required_role;

  // How the amount due was arrived at. Shown only when the document says
  // something beyond lines and tax, so an ordinary invoice stays a short list.
  const totals = invoice.parsed?.totals ?? {};
  const statedReasons = (isCharge) => (invoice.parsed?.allowanceCharges ?? [])
    .filter((a) => a.isCharge === isCharge).map((a) => a.reason).filter(Boolean).join(", ");
  const adjusted = Boolean(totals.allowanceTotal || totals.chargeTotal);
  // Capacity left on the order, or the amount by which reviewers have taken it
  // past its value. The second is a real state, not an error, so it is named.
  const poCapacity = (available) => {
    const cents = Number(available);
    return cents < 0
      ? t("poOvercommitted", formatMoney(Math.abs(cents)))
      : t("poAvailable", formatMoney(available));
  };
  const withReasons = (amount, isCharge) => {
    const reasons = statedReasons(isCharge);
    return reasons ? `${amount} · ${reasons}` : amount;
  };

  return (
    <>
      <Link to="/" className="back">{t("backToInbox")}</Link>
      {/* What it is, how much, by when, and where it stands, before anything else. */}
      <div className="page-head summary" style={{ marginTop: 8 }}>
        <div>
          <h1 className="mono">{invoice.invoice_number ?? invoice.original_filename}</h1>
          <p>
            {invoice.document_type === "CREDIT_NOTE" ? `${t("documentCreditNote")} · ` : ""}
            {invoice.supplier_name ?? invoice.supplier_name_raw ?? t("supplierUnassigned")}
            {invoice.supplier_no ? ` · ${invoice.supplier_no}` : ""}
          </p>
        </div>
        <dl className="summary-facts">
          <div>
            <dt className="label">{t(invoice.document_type === "CREDIT_NOTE" ? "fieldCreditAmount" : "fieldAmountDue")}</dt>
            <dd className="summary-amount mono">{formatMoney(invoice.gross_amount)}</dd>
          </div>
          <div>
            <dt className="label">{t("fieldDueDate")}</dt>
            <dd className="mono">{formatDate(invoice.due_date)}</dd>
          </div>
          <div>
            <dt className="label">{t("status")}</dt>
            <dd><StateChip state={invoice.state} /></dd>
          </div>
        </dl>
      </div>

      <div className="detail">
        <div className="detail-stack">
          <section className="panel">
            <div className="panel-head"><span className="label">{t("panelProgress")}</span></div>
            <div className="panel-body">
              <StateSpine state={invoice.state} reviewReason={invoice.review_reason} pendingRole={pendingRole} documentType={invoice.document_type} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><span className="label">{t("panelInvoiceData")}</span></div>
            <div className="panel-body">
              <div className="facts">
                <div className="facts facts-split">
                  <Fact label={t("fieldIssueDate")} value={formatDate(invoice.issue_date)} mono />
                  <Fact label={t("fieldDueDate")} value={formatDate(invoice.due_date)} mono />
                </div>
                {adjusted ? <Fact label={t("fieldLineTotal")} value={formatMoney(totals.lineExtension)} mono /> : null}
                {totals.allowanceTotal
                  ? <Fact label={t("fieldAllowances")} value={withReasons(`− ${formatMoney(totals.allowanceTotal)}`, false)} mono />
                  : null}
                {totals.chargeTotal
                  ? <Fact label={t("fieldCharges")} value={withReasons(`+ ${formatMoney(totals.chargeTotal)}`, true)} mono />
                  : null}
                <div className="facts facts-split">
                  <Fact label={t("fieldNet")} value={formatMoney(invoice.net_amount)} mono />
                  <Fact label={t("fieldVat")} value={formatMoney(invoice.vat_amount)} mono />
                </div>
                {Number(invoice.open_credit_amount ?? 0) > 0 && invoice.state === "ACCOUNTING_READY"
                  && invoice.document_type !== "CREDIT_NOTE"
                  ? <Fact label={t("fieldOpenCredit")} value={`− ${formatMoney(invoice.open_credit_amount)}`} mono />
                  : null}
                {invoice.credits_invoice_raw
                  ? <Fact label={t("fieldCredits")} value={invoice.credits_invoice_raw} mono />
                  : null}
                {totals.prepaid ? <Fact label={t("fieldPrepaid")} value={`− ${formatMoney(totals.prepaid)}`} mono /> : null}
                <Fact label={t(invoice.document_type === "CREDIT_NOTE" ? "fieldCreditAmount" : "fieldAmountDue")} value={formatMoney(invoice.gross_amount)} mono />
                <Fact label={t("fieldIban")} value={groupIban(invoice.supplier_iban_raw) || "—"} mono />
                <Fact label={t("fieldVatId")} value={invoice.supplier_vat_id_raw ?? "—"} mono />
                <Fact
                  label={t("fieldOrder")}
                  value={
                    invoice.po_number
                      ? `${invoice.po_number} · ${poCapacity(invoice.po_available_amount)}`
                      : invoice.po_reference_raw ?? "—"
                  }
                  mono
                />
                <Fact label={t("fieldPaymentTerms")} value={invoice.payment_terms_raw ?? "—"} />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><span className="label">{t("panelIntake")}</span></div>
            <div className="panel-body">
              <div className="facts">
                <Fact label={t("fieldReceivedAt")} value={formatDateTime(invoice.received_at)} mono />
                <Fact label={t("fieldChannel")} value={channel(invoice.source_channel)} />
                <Fact label={t("fieldFile")} value={invoice.original_filename} />
                <Fact label="SHA-256" value={invoice.file_sha256.slice(0, 32) + "…"} mono />
              </div>
              <p style={{ marginBottom: 0, marginTop: 12 }}>
                <a className="mono" style={{ fontSize: 12 }} href={`/api/invoices/${invoice.id}/file`} target="_blank" rel="noreferrer">
                  {t("viewOriginalXml")}
                </a>
              </p>
            </div>
          </section>
        </div>

        {/* Why it stopped, the evidence for it, then what can be done: the
            order a reviewer reads in. Everything else follows. */}
        <div className="detail-stack">
          {invoice.review_reason && (
            <section className="panel">
              <div className="panel-head">
                <span className="label">{t("panelBlocking")}</span>
              </div>
              <div className="panel-body" style={{ paddingBottom: 10 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {reviewReason(invoice.review_reason)}
                </p>
                <p className="hint" style={{ marginBottom: 0 }}>
                  {t("blockingHint")}
                </p>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <span className="label">{t("panelEvidence")}</span>
              <span className="hint">
                {failed.length > 0 ? t("evidenceFailed", failed.length, results.length) : t("evidenceAllPassed", results.length)}
              </span>
            </div>
            <div className="evidence">
              {failed.map((result) => (
                <EvidenceRow key={result.id} result={result} />
              ))}
              {showPassed && rest.map((result) => <EvidenceRow key={result.id} result={result} />)}
            </div>
            {rest.length > 0 && (
              <div className="panel-body" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, paddingBottom: 10 }}>
                <button className="ev-toggle" onClick={() => setShowPassed((v) => !v)}>
                  {showPassed ? t("hidePassed") : t("showPassed", rest.length, rest.filter((r) => r.status === "PASSED").length)}
                </button>
              </div>
            )}
            {results.length === 0 && <p className="empty">{t("notCheckedDuplicate")}</p>}
          </section>

          {/* A changed IBAN has one way on, and it is not a review decision:
              it sits right under the evidence that asks for it. */}
          <InvoiceBankPanel invoice={invoice} may={may} />

          <ActionPanel
            invoice={invoice}
            may={may}
            onDone={() => {
              load();
              onChanged();
            }}
          />

          <AiExplanation invoiceId={invoice.id} runNo={results[0]?.run_no} state={invoice.state} may={may} />

          <SupplierInquiry
            invoiceId={invoice.id}
            runNo={results[0]?.run_no}
            state={invoice.state}
            may={may}
            onChanged={() => {
              load();
              onChanged();
            }}
          />

          {(invoice.accounting_record || invoice.payment) && (
            <section className="panel">
              <div className="panel-head"><span className="label">{t("panelBooking")}</span></div>
              <div className="panel-body">
                <div className="facts facts-split">
                  {invoice.accounting_record && (
                    <>
                      <Fact label={t("fieldDocumentNo")} value={invoice.accounting_record.document_no} mono />
                      <Fact label={t("fieldBookingDate")} value={formatDate(invoice.accounting_record.booking_date)} mono />
                      <Fact label={t("fieldCreditorAccount")} value={invoice.accounting_record.creditor_account} mono />
                      <Fact label={t("fieldExpenseAccount")} value={invoice.accounting_record.expense_account} mono />
                      <Fact label={t("fieldCostCentre")} value={invoice.accounting_record.cost_center ?? "—"} mono />
                      <Fact label={t("fieldTaxKey")} value={(invoice.accounting_lines ?? []).map((l) => l.tax_key).join(", ")} mono />
                      {invoice.accounting_reversal?.length > 0 && (
                        <Fact label={t("fieldReversal")} value={invoice.accounting_reversal[0].document_no} mono />
                      )}
                    </>
                  )}
                  {invoice.payment && (
                    <>
                      <Fact label={t("fieldPaymentStatus")} value={paymentStatus(invoice.payment.status)} />
                      <Fact label={t("fieldReference")} value={invoice.payment.provider_ref ?? "—"} mono />
                    </>
                  )}
                </div>
                {invoice.accounting_record && (
                  <p className="hint" style={{ marginBottom: 0, marginTop: 10 }}>
                    {t("accountsDemoHint")}
                  </p>
                )}
              </div>
            </section>
          )}

          {invoice.bank_transactions?.length > 0 && (
            <section className="panel">
              <div className="panel-head"><span className="label">{t("panelIncomingPayment")}</span></div>
              <div className="panel-body">
                {invoice.bank_transactions.map((tx) => (
                  <div key={tx.id} className="facts" style={{ marginBottom: 6 }}>
                    <Fact label={tx.external_id} value={`${formatMoney(tx.amount)} · ${tx.reference ?? t("noReference")}`} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {invoice.approval_steps.length > 0 && (
            <section className="panel">
              <div className="panel-head"><span className="label">{t("panelApprovalSteps")}</span></div>
              <div className="panel-body">
                <ol className="steps">
                  {invoice.approval_steps.map((step) => (
                    <li key={step.step_no}>
                      <div className="step-line">
                        <span className="step-no">{step.step_no}</span>
                        <span>{role(step.required_role)}</span>
                        <span className={chip(STEP_TONE[step.status])}>
                          {stepStatus(step.status)}
                        </span>
                        {step.actor_name && <span className="hint">{step.actor_name}</span>}
                      </div>
                      {step.document_sha256 && (
                        <div className="step-binding hint mono">
                          {t("signedFor", step.document_sha256.slice(0, 12), step.validation_run_no)}
                          {step.decided_gross ? ` · ${formatMoney(step.decided_gross)}` : ""}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
                {(invoice.approval_history ?? []).length > 0 && (
                  // Rounds cancelled by a question or a re-check, kept as the
                  // record of who had signed what (ADR-067).
                  <div className="step-history">
                    <div className="label">{t("earlierRounds")}</div>
                    <ul>
                      {invoice.approval_history.map((step) => (
                        <li key={step.id} className="hint">
                          {t("roundStep", step.round, step.step_no, role(step.required_role))}
                          {step.actor_name && ` · ${step.actor_name}, ${formatDateTime(step.decided_at)}`}
                          {` · ${t("stepCancelled")}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><span className="label">{t("panelHistory")}</span></div>
            <div className="panel-body">
              <ul className="timeline">
                {invoice.audit_events.map((event) => (
                  <li key={event.id}>
                    <time dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time>
                    <div>
                      <div className="timeline-action">{action(event.action)}</div>
                      <div className="timeline-meta">
                        <span className={`actor actor-${event.actor_type.toLowerCase()}`}>
                          {event.actor_type === "SYSTEM" ? t("actorSystem") : event.actor_name ?? t("actorPerson")}
                        </span>{" "}
                        {event.from_state ? `${stateLabel(event.from_state)} → ${stateLabel(event.to_state)}` : stateLabel(event.to_state)}
                        {event.reason ? ` · ${auditReason(event.reason)}` : ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
