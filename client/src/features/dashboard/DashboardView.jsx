import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getKpis } from "../../lib/api.js";
import { useI18n } from "../../lib/i18n.js";

export default function DashboardView() {
  const { t, errorText, reviewReason, formatNumber, term, source } = useI18n();
  // Numbers follow the chosen language: decimal comma in German, point in English.
  const num = (value, digits = 1) => formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const int = (value) => formatNumber(value);
  const pct = (value) => `${num(value * 100)} %`;

  /** Hours below one are minutes; a median of "0.01 h" tells a reader nothing. */
  const duration = (hours) => {
    if (hours === null || hours === undefined) return "—";
    if (hours < 1) return `${int(Math.max(Math.round(hours * 60), 1))} ${t("unitMinutes")}`;
    if (hours < 48) return `${num(hours)} ${t("unitHours")}`;
    return `${num(hours / 24)} ${t("unitDays")}`;
  };

  const [kpi, setKpi] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getKpis().then(setKpi).catch((e) => setError(errorText(e)));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!kpi) return <p className="empty">{t("loading")}</p>;

  const { volume, automation, exceptions, risk, workload, cycle, economics, provenance } = kpi;
  const a = economics.assumptions;
  const from = (figure) => <SourceTag types={provenance.figures[figure]} />;
  const unmeasured = Object.entries(provenance.sources).filter(([, source]) => !source.available);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("kpiTitle")}</h1>
          <p>{t("kpiLead", int(volume.processed))}</p>
        </div>
      </div>
      <SourceLegend sources={provenance.sources} />

      <section className="kpi-row">
        <Stat label={t("kpiStp")} value={pct(automation.stp_rate)}
              note={t("kpiStpNote", int(automation.straight_through), int(volume.processed))} tone="ok"
              source={from("automation")} />
        <Stat label={t("kpiExceptionRate")} value={pct(exceptions.rate)}
              note={t("kpiExceptionNote", int(exceptions.count))} tone={exceptions.rate > 0.25 ? "high" : "neutral"}
              source={from("exceptions")} />
        <Stat label={t("kpiApprovalMedian")} value={duration(cycle.median_approval_hours)}
              note={t("kpiApprovalNote", int(cycle.approved_count))} source={from("cycle")} />
        <Stat label={t("kpiWaitingPerson")} value={int(workload.awaiting_review + workload.awaiting_approval)}
              note={t("kpiWaitingNote", int(workload.awaiting_review), int(workload.awaiting_approval))}
              tone={workload.awaiting_review + workload.awaiting_approval > 0 ? "medium" : "neutral"}
              source={from("workload")} />
      </section>

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head">
            <div><span className="label">{t("kpiExceptionReasons")}</span><div className="hint">{t("kpiExceptionReasonsSub")}</div></div>
            {from("exceptions")}
          </div>
          <div className="panel-body">
            {exceptions.by_reason.length === 0 ? (
              <p className="empty" style={{ padding: "10px 0" }}>{t("kpiNoExceptions")}</p>
            ) : (
              <ReasonBars data={exceptions.by_reason} label={reviewReason} format={int} />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><span className="label">{t("kpiCycleTimes")}</span>{from("cycle")}</div>
          <div className="panel-body">
            <dl className="metric-list">
              <Metric label={t("kpiIntakeToApproval")} value={duration(cycle.median_processing_hours)} />
              <Metric label={t("kpiIntakeToApprovalTouched")} value={duration(cycle.median_processing_hours_touched)} />
              <Metric label={t("kpiReviewDwell")} value={duration(cycle.median_review_hours)} />
              <Metric label={t("kpiApprovalFromSubmission")} value={duration(cycle.median_approval_hours)} />
            </dl>
            <p className="hint" style={{ marginBottom: 0 }}>
              {t("kpiMedianNote")}
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><span className="label">{t("kpiRiskSignals")}</span><div className="hint">{t("kpiRiskSub")}</div></div>
            {from("risk")}
          </div>
          <div className="panel-body">
            <dl className="metric-list">
              <Metric label={t("kpiIbanAlert")} value={risk.iban_alerts} tone={risk.iban_alerts > 0 ? "high" : null} />
              <Metric label={t("kpiPoOverrun")} value={risk.po_mismatches} tone={risk.po_mismatches > 0 ? "medium" : null} />
              <Metric label={t("kpiDuplicateNumber")} value={risk.duplicate_numbers} tone={risk.duplicate_numbers > 0 ? "medium" : null} />
              <Metric label={t("kpiDuplicateFile")} value={risk.duplicate_attempts} />
              <Metric label={t("kpiWrongRecipient")} value={risk.buyer_mismatches} tone={risk.buyer_mismatches > 0 ? "high" : null} />
            </dl>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><span className="label">{t("kpiWorkload")}</span>{from("workload")}</div>
          <div className="panel-body">
            <dl className="metric-list">
              <Metric label={t("kpiReviewOpen")} value={workload.awaiting_review} link="/sichtpruefung" />
              <Metric label={t("kpiApprovalOpen")} value={workload.awaiting_approval} link="/freigaben" />
              <Metric label={t("kpiInfoOpen")} value={workload.awaiting_information} />
              <Metric label={t("kpiReconciliationUnclear")} value={workload.reconciliation_exceptions} link="/zahlungen"
                      tone={workload.reconciliation_exceptions > 0 ? "high" : null} />
              <Metric label={t("kpiPaymentsFailed")} value={workload.failed_payments}
                      tone={workload.failed_payments > 0 ? "high" : null} />
              <Metric label={t("kpiDueIn7")} value={workload.due_within_7_days} tone={workload.due_within_7_days > 0 ? "medium" : null} />
              <Metric label={t("kpiOverdue")} value={workload.overdue} tone={workload.overdue > 0 ? "high" : null} />
            </dl>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <div><span className="label">{t("kpiEconomics")}</span><div className="hint">{t("kpiAssumption")}</div></div>
            {from("economics.hours_saved")}
        </div>
        <div className="panel-body">
          <div className="econ">
            <div>
              <div className="econ-value">{num(economics.hours_saved)} {t("unitHours")}</div>
              <div className="label">{t("kpiSavings")}</div>
            </div>
            <div>
              <div className="econ-value">{int(economics.cost_saved_eur)} €</div>
              <div className="label">{t("kpiPerHour", a.hourly_cost_eur)}</div>
            </div>
            <div>
              <div className="econ-value">{num(economics.minutes_per_invoice_now)} {t("unitMinutes")}</div>
              <div className="label">{t("kpiPerInvoice")}</div>
            </div>
          </div>
          <table className="assumptions">
            <caption className="hint">
              {t("kpiAssumptionCaption", int(economics.basis_invoices))} {from("economics.assumptions")}
            </caption>
            <tbody>
              <tr><th>{t("kpiManualClean")}</th><td className="num mono">{a.manual_minutes_clean} {t("unitMinutes")}</td>
                  <th>{t("kpiWithSystem")}</th><td className="num mono">{a.system_minutes_clean} {t("unitMinutes")}</td></tr>
              <tr><th>{t("kpiManualException")}</th><td className="num mono">{a.manual_minutes_exception} {t("unitMinutes")}</td>
                  <th>{t("kpiWithSystem")}</th><td className="num mono">{a.system_minutes_exception} {t("unitMinutes")}</td></tr>
              <tr><th>{t("kpiSource")}</th><td colSpan={3}>{term(a.source)}</td></tr>
              {unmeasured.map(([type]) => (
                <tr key={type}><th>{source(type)}</th><td colSpan={3}><NotMeasured type={type} /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/**
 * Ranked magnitude, so bars. One hue: the length already encodes the count,
 * and a second colour dimension would imply a distinction that is not there.
 * Each bar is labelled directly, so identity never depends on colour.
 */
function ReasonBars({ data, label, format }) {
  const max = Math.max(...data.map((d) => d.count));
  return (
    <ul className="bars">
      {data.map((row) => (
        <li key={row.reason}>
          <span className="bar-label">{label(row.reason)}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max((row.count / max) * 100, 2)}%` }} />
          </span>
          <span className="bar-value mono">{format(row.count)}</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, note, tone, source }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ""}`}>
      <div className="label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
      <div className="stat-source">{source}</div>
    </div>
  );
}

/**
 * The sources a figure rests on (ADR-079). A figure built on an assumption is
 * marked as modelled, so it never reads as a measurement.
 */
function SourceTag({ types }) {
  const { source, sourceExplanation } = useI18n();
  const modelled = types.includes("ASSUMPTION");
  return (
    <span className={`source-tag${modelled ? " source-modelled" : ""}`} title={types.map(sourceExplanation).join(" + ")}>
      {types.map(source).join(" + ")}
    </span>
  );
}

function NotMeasured({ type }) {
  const { t, sourceExplanation } = useI18n();
  return <span className="source-tag source-absent" title={sourceExplanation(type)}>{t("sourceNotMeasured")}</span>;
}

/** Every kind of source once, including those with nothing measured yet. */
function SourceLegend({ sources }) {
  const { t, source } = useI18n();
  return (
    <p className="source-legend">
      <span className="label">{t("sourceLegend")}</span>
      {Object.entries(sources).map(([type, { available }]) => available
        ? <SourceTag key={type} types={[type]} />
        : <span key={type} className="source-pair">{source(type)}: <NotMeasured type={type} /></span>)}
    </p>
  );
}

function Metric({ label, value, tone, link }) {
  return (
    <>
      <dt>{link ? <Link to={link}>{label}</Link> : label}</dt>
      <dd className={`num mono${tone ? ` metric-${tone}` : ""}`}>{value}</dd>
    </>
  );
}
