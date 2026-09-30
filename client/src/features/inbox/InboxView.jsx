import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listInvoices } from "../../lib/api.js";
import { STATE_TONE } from "../../lib/tones.js";
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
  const { t, errorText, formatDate, formatMoney } = useI18n();
  const config = VIEWS[view];
  const [invoices, setInvoices] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);

  // A page at a time (ADR-066); `offset` 0 starts the list again.
  const fetchPage = (offset) => {
    setStatus("loading");
    listInvoices(config.state, offset)
      .then((page) => {
        setInvoices((shown) => (offset === 0 ? page.rows : [...shown, ...page.rows]));
        setTotal(page.total);
        setStatus("ready");
      })
      .catch((e) => {
        setError(errorText(e));
        setStatus("error");
      });
  };
  const load = () => fetchPage(0);

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
          <span className="label">{t("invoiceCount", total)}</span>
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
        {invoices.length < total && (
          <div className="panel-body">
            <button className="btn btn-ghost" type="button" disabled={status === "loading"}
                    onClick={() => fetchPage(invoices.length)}>
              {t("loadMore", invoices.length, total)}
            </button>
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
    return <span className={`blocker is-${STATE_TONE[invoice.state]}`}>{reviewReason(invoice.review_reason)}</span>;
  }
  if (invoice.pending_steps > 0) {
    return (
      <span className="blocker is-wait">{t("approvalsOpen", invoice.pending_steps)}</span>
    );
  }
  return null;
}
