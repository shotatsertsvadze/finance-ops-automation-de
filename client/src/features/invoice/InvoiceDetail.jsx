import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getInvoice } from "../../lib/api.js";
import { ACTION_LABELS, formatDate, formatDateTime, formatMoney, groupIban, REVIEW_REASON_LABELS } from "../../lib/format.js";
import StateChip from "../../components/StateChip.jsx";
import StateSpine from "./StateSpine.jsx";
import EvidenceRow from "./EvidenceRow.jsx";
import ActionPanel from "./ActionPanel.jsx";

export default function InvoiceDetail({ may, onChanged }) {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState(null);
  const [showPassed, setShowPassed] = useState(false);

  const load = () => getInvoice(id).then(setInvoice).catch((e) => setError(e.message));

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!invoice) return <p className="empty">Wird geladen…</p>;

  const results = [...invoice.validation.technical, ...invoice.validation.business];
  const failed = results.filter((r) => r.status === "FAILED");
  const rest = results.filter((r) => r.status !== "FAILED");
  const pendingRole = invoice.approval_steps.find((s) => s.status === "PENDING")?.required_role;

  return (
    <>
      <Link to="/" className="back">← Posteingang</Link>
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
            <div className="panel-head"><span className="label">Bearbeitungsstand</span></div>
            <div className="panel-body">
              <StateSpine state={invoice.state} reviewReason={invoice.review_reason} pendingRole={pendingRole} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><span className="label">Rechnungsdaten</span></div>
            <div className="panel-body">
              <div className="facts">
                <div className="facts facts-split">
                  <Fact label="Rechnungsdatum" value={formatDate(invoice.issue_date)} mono />
                  <Fact label="Fällig am" value={formatDate(invoice.due_date)} mono />
                  <Fact label="Netto" value={formatMoney(invoice.net_amount)} mono />
                  <Fact label="Steuer" value={formatMoney(invoice.vat_amount)} mono />
                </div>
                <Fact label="Brutto" value={formatMoney(invoice.gross_amount)} mono />
                <Fact label="IBAN" value={groupIban(invoice.supplier_iban_raw) || "—"} mono />
                <Fact label="USt-IdNr." value={invoice.supplier_vat_id_raw ?? "—"} mono />
                <Fact
                  label="Bestellung"
                  value={
                    invoice.po_number
                      ? `${invoice.po_number} · Rest ${formatMoney(invoice.po_remaining_amount)}`
                      : invoice.po_reference_raw ?? "—"
                  }
                  mono
                />
                <Fact label="Zahlungsziel" value={invoice.payment_terms_raw ?? "—"} />
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><span className="label">Eingang</span></div>
            <div className="panel-body">
              <div className="facts">
                <Fact label="Empfangen" value={formatDateTime(invoice.received_at)} mono />
                <Fact label="Kanal" value={invoice.source_channel} />
                <Fact label="Datei" value={invoice.original_filename} />
                <Fact label="SHA-256" value={invoice.file_sha256.slice(0, 32) + "…"} mono />
              </div>
              <p style={{ marginBottom: 0, marginTop: 12 }}>
                <a className="mono" style={{ fontSize: 12 }} href={`/api/invoices/${invoice.id}/file`} target="_blank" rel="noreferrer">
                  Original-XML ansehen
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
                <span className="label">Was blockiert</span>
              </div>
              <div className="panel-body" style={{ paddingBottom: 10 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>
                  {REVIEW_REASON_LABELS[invoice.review_reason] ?? invoice.review_reason}
                </p>
                <p className="hint" style={{ marginBottom: 0 }}>
                  Automatische Weiterverarbeitung ist gestoppt. Die Belege dafür stehen unten.
                </p>
              </div>
            </section>
          )}

          {(invoice.accounting_record || invoice.payment) && (
            <section className="panel">
              <div className="panel-head"><span className="label">Buchung und Zahlung</span></div>
              <div className="panel-body">
                <div className="facts facts-split">
                  {invoice.accounting_record && (
                    <>
                      <Fact label="Belegnummer" value={invoice.accounting_record.document_no} mono />
                      <Fact label="Buchungsdatum" value={formatDate(invoice.accounting_record.booking_date)} mono />
                      <Fact label="Kreditorenkonto" value={invoice.accounting_record.creditor_account} mono />
                      <Fact label="Aufwandskonto" value={invoice.accounting_record.expense_account} mono />
                      <Fact label="Kostenstelle" value={invoice.accounting_record.cost_center ?? "—"} mono />
                      <Fact label="Steuerschlüssel" value={invoice.accounting_record.tax_key} mono />
                    </>
                  )}
                  {invoice.payment && (
                    <>
                      <Fact label="Zahlstatus" value={invoice.payment.status} mono />
                      <Fact label="Referenz" value={invoice.payment.provider_ref ?? "—"} mono />
                    </>
                  )}
                </div>
                {invoice.accounting_record && (
                  <p className="hint" style={{ marginBottom: 0, marginTop: 10 }}>
                    Kontonummern und Steuerschlüssel sind Demo-Zuordnungen, keine geprüfte SKR-Zuordnung.
                  </p>
                )}
              </div>
            </section>
          )}

          {invoice.bank_transactions?.length > 0 && (
            <section className="panel">
              <div className="panel-head"><span className="label">Zahlungseingang</span></div>
              <div className="panel-body">
                {invoice.bank_transactions.map((tx) => (
                  <div key={tx.id} className="facts" style={{ marginBottom: 6 }}>
                    <Fact label={tx.external_id} value={`${formatMoney(tx.amount)} · ${tx.reference ?? "ohne Verwendungszweck"}`} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {invoice.approval_steps.length > 0 && (
            <section className="panel">
              <div className="panel-head"><span className="label">Freigabestufen</span></div>
              <div className="panel-body">
                <ol className="steps">
                  {invoice.approval_steps.map((step) => (
                    <li key={step.step_no}>
                      <span className="step-no">{step.step_no}</span>
                      <span>{step.required_role}</span>
                      <span className={`chip ${step.status === "PENDING" ? "chip-wait" : "chip-ok"}`}>
                        {step.status === "PENDING" ? "offen" : step.status}
                      </span>
                      {step.actor_name && <span className="hint">{step.actor_name}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="panel-head">
              <span className="label">Prüfspur</span>
              <span className="hint">
                {failed.length > 0 ? `${failed.length} von ${results.length} Prüfungen fehlgeschlagen` : `${results.length} Prüfungen, keine Beanstandung`}
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
                  {showPassed ? "Bestandene Prüfungen ausblenden" : `Alle ${rest.length} bestandenen Prüfungen anzeigen`}
                </button>
              </div>
            )}
            {results.length === 0 && <p className="empty">Diese Rechnung wurde nicht geprüft (Duplikat).</p>}
          </section>

          <section className="panel">
            <div className="panel-head"><span className="label">Verlauf</span></div>
            <div className="panel-body">
              <ul className="timeline">
                {invoice.audit_events.map((event) => (
                  <li key={event.id}>
                    <time dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time>
                    <div>
                      <div className="timeline-action">{ACTION_LABELS[event.action] ?? event.action}</div>
                      <div className="timeline-meta">
                        <span className={`actor actor-${event.actor_type.toLowerCase()}`}>
                          {event.actor_type === "SYSTEM" ? "System" : event.actor_name ?? "Person"}
                        </span>{" "}
                        {event.from_state ? `${event.from_state} → ${event.to_state}` : event.to_state}
                        {event.reason ? ` · ${REVIEW_REASON_LABELS[event.reason] ?? event.reason}` : ""}
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
