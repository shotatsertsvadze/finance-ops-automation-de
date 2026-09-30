import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listBankChanges } from "../../lib/api.js";
import { groupIban } from "../../lib/format.js";
import { useI18n } from "../../lib/i18n.js";
import ChangeChip from "./ChangeChip.jsx";

/** Open changes first, then the decided ones: the queue and its record. */
export default function BankChangesView({ may }) {
  const { t, errorText, formatDateTime } = useI18n();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const mayRead = may("bank-change:read");

  useEffect(() => {
    if (mayRead) listBankChanges().then(setRows).catch((e) => setError(errorText(e)));
  }, [mayRead]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("bankChangesTitle")}</h1>
          <p>{t("bankChangesLead")}</p>
        </div>
      </div>
      {!mayRead && <p className="empty">{t("bankChangesNoAccess")}</p>}
      {error && <p className="empty error">{error}</p>}
      {mayRead && rows && (
        <div className="panel">
          {rows.length === 0 ? <p className="empty">{t("bankChangesEmpty")}</p> : (
            <div className="ledger-scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>{t("colChange")}</th>
                    <th>{t("colSupplier")}</th>
                    <th>{t("colNewIban")}</th>
                    <th>{t("colStatus")}</th>
                    <th>{t("colProposed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/bankverbindungen/${c.id}`} className="mono">{c.change_no}</Link></td>
                      <td>
                        {c.supplier_name}
                        <div className="supplier-sub mono">{c.supplier_no}</div>
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>{groupIban(c.proposed_iban)}</td>
                      <td><ChangeChip state={c.state} /></td>
                      <td style={{ fontSize: 12 }}>
                        {c.proposed_by_name}
                        <div className="supplier-sub mono">{formatDateTime(c.proposed_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
