import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getInvoice } from "../../lib/api.js";
import { groupIban } from "../../lib/format.js";
import { useI18n } from "../../lib/i18n.js";
import StateChip from "../../components/StateChip.jsx";
import StateSpine from "./StateSpine.jsx";
import EvidenceRow from "./EvidenceRow.jsx";
import ActionPanel from "./ActionPanel.jsx";

export default function InvoiceDetail({ may, onChanged }) {
  const { t, errorText, role, action, reviewReason, auditReason, formatDate, formatDateTime, formatMoney } = useI18n();
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
  const withReasons = (amount, isCharge) => {
    const reasons = statedReasons(isCharge);
    return reasons ? `${amount} · ${reasons}` : amount;
  };

  return (
    <>
      <Link to="/" className="back">{t("backToInbox")}</Link>
      <div className="page-head" style={{ marginTop: 8 }}>
        <div>
          <h1 className="mono">{invoice.invoice_number ?? invoice.original_filename}</h1>
          <p>
            {invoice.supplier_name ?? invoice.supplier_name_raw ?? "Lieferant nicht zugeordnet"}
            {invoice.supplier_no ? ` · ${invoice.supplier_no}` : ""}
          </p>
        </div>
        <StateChip state={invoice.state} />
      </div>

      <div className="detail">
        <div className="detail-stack">
          <section className="panel">
            <div className="panel-head"><span className="label">{t("panelProgress")}</span></div>
            <div className="panel-body">
              <StateSpine state={invoice.state} reviewReason={invoice.review_reason} pendingRole={pendingRole} />
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
                {totals.prepaid ? <Fact label={t("fieldPrepaid")} value={`− ${formatMoney(totals.prepaid)}`} mono /> : null}
                <Fact label={t("fieldAmountDue")} value={formatMoney(invoice.gross_amount)} mono />
                <Fact label={t("fieldIban")} value={groupIban(invoice.supplier_iban_raw) || "—"} mono />
                <Fact label={t("fieldVatId")} value={invoice.supplier_vat_id_raw ?? "—"} mono />
                <Fact
                  label={t("fieldOrder")}
                  value={
                    invoice.po_number
                      ? `${invoice.po_number} · ${t("poAvailable", formatMoney(invoice.po_available_amount))}`
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
                <Fact label={t("fieldChannel")} value={invoice.source_channel} />
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

        <div className="detail-stack">
          <ActionPanel
            invoice={invoice}
            may={may}
            onDone={() => {
              load();
              onChanged();
            }}
          />

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
                      <Fact label={t("fieldTaxKey")} value={invoice.accounting_record.tax_key} mono />
                    </>
                  )}
                  {invoice.payment && (
                    <>
                      <Fact label={t("fieldPaymentStatus")} value={invoice.payment.status} mono />
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
                        <span className={`chip ${step.status === "PENDING" ? "chip-wait" : "chip-ok"}`}>
                          {step.status === "PENDING" ? t("stepOpen") : step.status}
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
                  {showPassed ? t("hidePassed") : t("showPassed", rest.length)}
                </button>
              </div>
            )}
            {results.length === 0 && <p className="empty">{t("notCheckedDuplicate")}</p>}
          </section>

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
                        {event.from_state ? `${event.from_state} → ${event.to_state}` : event.to_state}
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

function Fact({ label, value, mono }) {
  return (
    <div className="fact">
      <span className="label">{label}</span>
      <span className={`fact-value${mono ? " mono" : ""}`}>{value}</span>
    </div>
  );
}
