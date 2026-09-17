import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { importBankStatement, listBankTransactions, runReconciliation } from "../../lib/api.js";
import { formatDate, formatMoney, MATCH_REASON_LABELS } from "../../lib/format.js";

const STATUS_LABELS = { MATCHED: "Zugeordnet", EXCEPTION: "Unklar", UNMATCHED: "Offen" };
const STATUS_TONE = { MATCHED: "chip-ok", EXCEPTION: "chip-review", UNMATCHED: "chip-neutral" };

/**
 * Bank side of the process: what came in, what it was matched to, and why a
 * transaction was not matched. The reason is the point, so it sits in the row.
 */
export default function PaymentsView({ actor, onChanged }) {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  // The effect must return a cleanup function or nothing; returning the
  // promise makes React try to call it as one.
  const load = () => listBankTransactions().then(setRows).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  async function act(label, fn) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fn();
      setMessage({ ok: true, text: label(result) });
      await load();
      onChanged();
    } catch (error) {
      setMessage({ ok: false, text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function importDemoStatement() {
    const statement = await fetch("/demo/statement_2026-09.json").then((r) => r.json());
    return importBankStatement(statement, actor?.id);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Zahlungen und Abgleich</h1>
          <p>
            Synthetische Kontoumsätze. Ein Umsatz wird nur zugeordnet, wenn der Verwendungszweck eine
            Rechnung benennt und der Betrag übereinstimmt. Betragsgleichheit allein reicht nie.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <span className="label">Kontoauszug</span>
          <span className="hint">{rows.length} Umsätze importiert</span>
        </div>
        <div className="panel-body">
          {message && (
            <div className={`toast${message.ok ? "" : " is-error"}`} role="status">{message.text}</div>
          )}
          <div className="action-row">
            <button
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => act((r) => `${r.imported} neue Umsätze übernommen (${r.received} gelesen).`, importDemoStatement)}
            >
              Demo-Kontoauszug importieren
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => act((r) => `${r.matched} zugeordnet, ${r.exceptions} unklar, ${r.unmatched} offen.`, () => runReconciliation(actor?.id))}
            >
              Abgleich starten
            </button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><span className="label">Umsätze</span></div>
        {rows.length === 0 ? (
          <p className="empty">Noch kein Kontoauszug importiert.</p>
        ) : (
          <div className="ledger-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Umsatz</th>
                  <th>Verwendungszweck</th>
                  <th>Status</th>
                  <th>Wertstellung</th>
                  <th className="num">Betrag</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((tx) => (
                  <tr key={tx.id}>
                    <td>
                      <span className="mono">{tx.external_id}</span>
                      <div className="supplier-sub">{tx.counterparty_name ?? "—"}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 12 }}>{tx.reference ?? "—"}</span>
                      {tx.invoice_number && (
                        <div className="supplier-sub mono">
                          <Link to={`/rechnung/${tx.matched_invoice_id}`}>{tx.invoice_number}</Link>
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`chip ${STATUS_TONE[tx.status]}`}>{STATUS_LABELS[tx.status]}</span>
                      {tx.match_reason && (
                        <div style={{ marginTop: 4 }}>
                          <span className="blocker">{MATCH_REASON_LABELS[tx.match_reason] ?? tx.match_reason}</span>
                        </div>
                      )}
                    </td>
                    <td className="mono" style={{ fontSize: 12 }}>{formatDate(tx.value_date)}</td>
                    <td className="num">{formatMoney(tx.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
