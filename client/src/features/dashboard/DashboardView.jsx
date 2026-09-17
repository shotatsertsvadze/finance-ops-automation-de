import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getKpis } from "../../lib/api.js";
import { REVIEW_REASON_LABELS } from "../../lib/format.js";

// German UI: decimal comma and thousands point, everywhere.
const de = (value, digits = 1) =>
  new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const deInt = (value) => new Intl.NumberFormat("de-DE").format(value);

const pct = (value) => `${de(value * 100)} %`;

/** Hours below one are minutes; a median of "0,01 Std." tells a reader nothing. */
function duration(hours) {
  if (hours === null || hours === undefined) return "—";
  if (hours < 1) return `${deInt(Math.max(Math.round(hours * 60), 1))} Min.`;
  if (hours < 48) return `${de(hours)} Std.`;
  return `${de(hours / 24)} Tage`;
}

export default function DashboardView() {
  const [kpi, setKpi] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getKpis().then(setKpi).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error">{error}</p>;
  if (!kpi) return <p className="empty">Wird geladen…</p>;

  const { volume, automation, exceptions, risk, workload, cycle, economics } = kpi;
  const a = economics.assumptions;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Betriebskennzahlen</h1>
          <p>
            Alle Werte sind aus den Rechnungen und ihrem Prüfprotokoll berechnet, nicht separat gezählt.
            Grundlage: {deInt(volume.processed)} verarbeitete Rechnungen (synthetische Demodaten).
          </p>
        </div>
      </div>

      <section className="kpi-row">
        <Stat label="Dunkelverarbeitung" value={pct(automation.stp_rate)}
              note={`${deInt(automation.straight_through)} von ${deInt(volume.processed)} ohne menschlichen Eingriff`} tone="ok" />
        <Stat label="Ausnahmequote" value={pct(exceptions.rate)}
              note={`${deInt(exceptions.count)} Rechnungen mit Sichtprüfung`} tone={exceptions.rate > 0.25 ? "high" : "neutral"} />
        <Stat label="Freigabedauer (Median)" value={duration(cycle.median_approval_hours)}
              note={`über ${deInt(cycle.approved_count)} Freigaben`} />
        <Stat label="Wartet auf eine Person" value={deInt(workload.awaiting_review + workload.awaiting_approval)}
              note={`${deInt(workload.awaiting_review)} Sichtprüfung, ${deInt(workload.awaiting_approval)} Freigabe`}
              tone={workload.awaiting_review + workload.awaiting_approval > 0 ? "medium" : "neutral"} />
      </section>

      <div className="dash-grid">
        <section className="panel">
          <div className="panel-head">
            <span className="label">Ausnahmegründe</span>
            <span className="hint">warum Rechnungen angehalten wurden</span>
          </div>
          <div className="panel-body">
            {exceptions.by_reason.length === 0 ? (
              <p className="empty" style={{ padding: "10px 0" }}>Keine Ausnahmen.</p>
            ) : (
              <ReasonBars data={exceptions.by_reason} />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><span className="label">Durchlaufzeiten</span></div>
          <div className="panel-body">
            <dl className="metric-list">
              <Metric label="Eingang bis Freigabe, gesamt" value={duration(cycle.median_processing_hours)} />
              <Metric label="Eingang bis Freigabe, mit menschlichem Schritt" value={duration(cycle.median_processing_hours_touched)} />
              <Metric label="Liegezeit in der Sichtprüfung" value={duration(cycle.median_review_hours)} />
              <Metric label="Freigabe ab Vorlage" value={duration(cycle.median_approval_hours)} />
            </dl>
            <p className="hint" style={{ marginBottom: 0 }}>
              Mediane, keine Mittelwerte: eine über das Wochenende liegengebliebene Rechnung soll die Kennzahl nicht verschieben.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <span className="label">Risikosignale</span>
            <span className="hint">Rechnungen, die das Signal ausgelöst haben, auch wenn später geklärt</span>
          </div>
          <div className="panel-body">
            <dl className="metric-list">
              <Metric label="IBAN weicht von den Stammdaten ab" value={risk.iban_alerts} tone={risk.iban_alerts > 0 ? "high" : null} />
              <Metric label="Betrag überschreitet die Bestellung" value={risk.po_mismatches} tone={risk.po_mismatches > 0 ? "medium" : null} />
              <Metric label="Rechnungsnummer doppelt" value={risk.duplicate_numbers} tone={risk.duplicate_numbers > 0 ? "medium" : null} />
              <Metric label="Identische Datei erneut hochgeladen" value={risk.duplicate_attempts} />
              <Metric label="Falscher Rechnungsempfänger" value={risk.buyer_mismatches} tone={risk.buyer_mismatches > 0 ? "high" : null} />
            </dl>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head"><span className="label">Arbeitsvorrat und Fälligkeiten</span></div>
          <div className="panel-body">
            <dl className="metric-list">
              <Metric label="Sichtprüfung offen" value={workload.awaiting_review} link="/sichtpruefung" />
              <Metric label="Freigabe offen" value={workload.awaiting_approval} link="/freigaben" />
              <Metric label="Rückfrage offen" value={workload.awaiting_information} />
              <Metric label="Abgleich unklar" value={workload.reconciliation_exceptions} link="/zahlungen"
                      tone={workload.reconciliation_exceptions > 0 ? "high" : null} />
              <Metric label="Fällig in 7 Tagen" value={workload.due_within_7_days} tone={workload.due_within_7_days > 0 ? "medium" : null} />
              <Metric label="Überfällig" value={workload.overdue} tone={workload.overdue > 0 ? "high" : null} />
            </dl>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <span className="label">Modellrechnung Entlastung</span>
          <span className="hint">Szenario auf offengelegten Annahmen, keine Messung</span>
        </div>
        <div className="panel-body">
          <div className="econ">
            <div>
              <div className="econ-value">{de(economics.hours_saved)} Std.</div>
              <div className="label">Rechnerische Entlastung</div>
            </div>
            <div>
              <div className="econ-value">{deInt(economics.cost_saved_eur)} €</div>
              <div className="label">bei {a.hourly_cost_eur} € je Stunde</div>
            </div>
            <div>
              <div className="econ-value">{de(economics.minutes_per_invoice_now)} Min.</div>
              <div className="label">Bearbeitungszeit je Rechnung</div>
            </div>
          </div>
          <table className="assumptions">
            <caption className="hint">
              Diese Zahlen folgen aus den Annahmen unten, angewendet auf {deInt(economics.basis_invoices)} Rechnungen dieser Demo.
              Sie sind kein gemessener Kundennutzen.
            </caption>
            <tbody>
              <tr><th>Manuell je saubere Rechnung</th><td className="num mono">{a.manual_minutes_clean} Min.</td>
                  <th>mit System</th><td className="num mono">{a.system_minutes_clean} Min.</td></tr>
              <tr><th>Manuell je Ausnahme</th><td className="num mono">{a.manual_minutes_exception} Min.</td>
                  <th>mit System</th><td className="num mono">{a.system_minutes_exception} Min.</td></tr>
              <tr><th>Quelle</th><td colSpan={3}>{a.source}</td></tr>
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
function ReasonBars({ data }) {
  const max = Math.max(...data.map((d) => d.count));
  return (
    <ul className="bars">
      {data.map((row) => (
        <li key={row.reason}>
          <span className="bar-label">{REVIEW_REASON_LABELS[row.reason] ?? row.reason}</span>
          <span className="bar-track">
            <span className="bar-fill" style={{ width: `${Math.max((row.count / max) * 100, 2)}%` }} />
          </span>
          <span className="bar-value mono">{deInt(row.count)}</span>
        </li>
      ))}
    </ul>
  );
}

function Stat({ label, value, note, tone }) {
  return (
    <div className={`stat${tone ? ` stat-${tone}` : ""}`}>
      <div className="label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note">{note}</div>}
    </div>
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
