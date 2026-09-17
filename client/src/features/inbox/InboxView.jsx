import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listInvoices } from "../../lib/api.js";
import { useI18n } from "../../lib/i18n.js";
import StateChip from "../../components/StateChip.jsx";
import UploadPanel from "../upload/UploadPanel.jsx";

const VIEWS = {
  inbox: { title: "navInbox", lead: "leadInbox", state: null },
  review: { title: "navReview", lead: "leadReview", state: "REVIEW_REQUIRED" },
  approval: { title: "navApprovals", lead: "leadApproval", state: "READY_FOR_APPROVAL" },
  done: { title: "navApproved", lead: "leadDone", state: "APPROVED" },
};

export default function InboxView({ view, onChanged }) {
  const { t, formatDate, formatMoney } = useI18n();
  const config = VIEWS[view];
  const [invoices, setInvoices] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  const load = () => {
    setStatus("loading");
    listInvoices(config.state)
      .then((rows) => {
        setInvoices(rows);
        setStatus("ready");
      })
      .catch((e) => {
        setError(e.message);
        setStatus("error");
      });
  };

  useEffect(load, [view]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t(config.title)}</h1>
          <p>{t(config.lead)}</p>
        </div>
      </div>

      {view === "inbox" && (
        <UploadPanel
          onUploaded={() => {
            load();
            onChanged();
          }}
        />
      )}

      <div className="panel" style={{ marginTop: view === "inbox" ? 18 : 0 }}>
        <div className="panel-head">
          <span className="label">{t("invoiceCount", invoices.length)}</span>
        </div>
        {status === "error" && <p className="empty error">{error}</p>}
        {status === "ready" && invoices.length === 0 && <p className="empty">{t("emptyList")}</p>}
        {invoices.length > 0 && (
          <div className="ledger-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>{t("colInvoice")}</th>
                <th>{t("colSupplier")}</th>
                <th>{t("colStatus")}</th>
                <th>{t("colReceived")}</th>
                <th className="num">{t("colGross")}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link to={`/rechnung/${invoice.id}`} className="mono">
                      {invoice.invoice_number ?? invoice.original_filename}
                    </Link>
                    <div className="supplier-sub">{invoice.invoice_number ? invoice.original_filename : t("noNumberRead")}</div>
                  </td>
                  <td>
                    {invoice.supplier_name ?? invoice.supplier_name_raw ?? "—"}
                    {invoice.supplier_no && <div className="supplier-sub mono">{invoice.supplier_no}</div>}
                  </td>
                  <td>
                    <StateChip state={invoice.state} />
                    <div style={{ marginTop: 4 }}>
                      <Blocker invoice={invoice} />
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 12 }}>{formatDate(invoice.received_at)}</td>
                  <td className="num">{formatMoney(invoice.gross_amount)}</td>
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

/** Why this row needs attention, shown in the list so no click is needed. */
function Blocker({ invoice }) {
  const { t, reviewReason } = useI18n();
  if (invoice.review_reason) {
    return <span className="blocker">{reviewReason(invoice.review_reason)}</span>;
  }
  if (invoice.pending_steps > 0) {
    return (
      <span className="blocker is-wait">{t("approvalsOpen", invoice.pending_steps)}</span>
    );
  }
  return null;
}
