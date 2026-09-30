import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { importBankStatement, listBankTransactions, runReconciliation } from "../../lib/api.js";
import { useI18n } from "../../lib/i18n.js";
import { TX_TONE, chip } from "../../lib/tones.js";

/**
 * Bank side of the process: what came in, what it was matched to, and why a
 * transaction was not matched. The reason is the point, so it sits in the row.
 */
export default function PaymentsView({ may, onChanged }) {
  const { t, errorText, matchReason, formatDate, formatMoney } = useI18n();
  const statusLabel = { MATCHED: t("txMatched"), EXCEPTION: t("txException"), UNMATCHED: t("txUnmatched") };
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  // The effect must return a cleanup function or nothing; returning the
  // promise makes React try to call it as one.
  const mayRead = may("bank:read");
  const load = () => (mayRead ? listBankTransactions().then(setRows).catch(() => {}) : Promise.resolve());
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
      setMessage({ ok: false, text: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  async function importDemoStatement() {
    const statement = await fetch("/demo/statement_2026-09.json").then((r) => r.json());
    return importBankStatement(statement);
  }

  const head = (
    <div className="page-head">
      <div>
        <h1>{t("paymentsTitle")}</h1>
        <p>{t("paymentsLead")}</p>
      </div>
    </div>
  );

  // Refused by the server (ADR-064); said here rather than shown as an empty
  // statement, which would read as "nothing imported".
  if (!mayRead) {
    return (
      <>
        {head}
        <p className="empty">{t("bankFinanceOnly")}</p>
      </>
    );
  }

  return (
    <>
      {head}

      <div className="panel">
        <div className="panel-head">
          <span className="label">{t("bankStatement")}</span>
          <span className="hint">{t("transactionsImported", rows.length)}</span>
        </div>
        <div className="panel-body">
          {message && (
            <div className={`toast${message.ok ? "" : " is-error"}`} role="status">{message.text}</div>
          )}
          {!may("bank:import") && (
            <p className="action-prompt">{t("financeOnly")}</p>
          )}
          <div className="action-row">
            <button
              className="btn btn-ghost"
              disabled={busy || !may("bank:import")}
              onClick={() => act((r) => t("importResult", r.imported, r.received), importDemoStatement)}
            >
              {t("importDemoStatement")}
            </button>
            <button
              className="btn"
              disabled={busy || !may("reconciliation:run")}
              onClick={() => act((r) => t("reconcileResult", r.matched, r.exceptions, r.unmatched), () => runReconciliation())}
            >
              {t("runReconciliation")}
            </button>
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head"><span className="label">{t("transactions")}</span></div>
        {rows.length === 0 ? (
          <p className="empty">{t("noStatement")}</p>
        ) : (
          <div className="ledger-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>{t("transaction")}</th>
                  <th>{t("colReference")}</th>
                  <th>{t("colStatus")}</th>
                  <th>{t("colValueDate")}</th>
                  <th className="num">{t("colAmount")}</th>
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
                      <span className={chip(TX_TONE[tx.status])}>{statusLabel[tx.status]}</span>
                      {tx.match_reason && (
                        <div style={{ marginTop: 4 }}>
                          <span className="blocker">{matchReason(tx.match_reason)}</span>
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
