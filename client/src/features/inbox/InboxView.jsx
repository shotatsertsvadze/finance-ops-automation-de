import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listInvoices } from "../../lib/api.js";
import { formatDate, formatMoney, REVIEW_REASON_LABELS } from "../../lib/format.js";
import StateChip from "../../components/StateChip.jsx";
import UploadPanel from "../upload/UploadPanel.jsx";

const VIEWS = {
  inbox: { title: "Posteingang", lead: "Alle eingegangenen E-Rechnungen, neueste zuerst.", state: null },
  review: { title: "Sichtprüfung", lead: "Rechnungen, die eine Entscheidung brauchen. Der Grund steht in der Liste.", state: "REVIEW_REQUIRED" },
  approval: { title: "Freigaben", lead: "Geprüft und freigabebereit. Die Stufe richtet sich nach dem Bruttobetrag.", state: "READY_FOR_APPROVAL" },
  done: { title: "Freigegeben", lead: "Automatisch oder durch Freigabe abgeschlossen.", state: "APPROVED" },
};

export default function InboxView({ view, onChanged }) {
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
          <h1>{config.title}</h1>
          <p>{config.lead}</p>
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
          <span className="label">
            {invoices.length} {invoices.length === 1 ? "Rechnung" : "Rechnungen"}
          </span>
        </div>
        {status === "error" && <p className="empty error">{error}</p>}
        {status === "ready" && invoices.length === 0 && <p className="empty">Nichts zu tun. Diese Liste ist leer.</p>}
        {invoices.length > 0 && (
          <div className="ledger-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Rechnung</th>
                <th>Lieferant</th>
                <th>Status</th>
                <th>Eingang</th>
                <th className="num">Brutto</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td>
                    <Link to={`/rechnung/${invoice.id}`} className="mono">
                      {invoice.invoice_number ?? invoice.original_filename}
                    </Link>
                    <div className="supplier-sub">{invoice.invoice_number ? invoice.original_filename : "keine Nummer gelesen"}</div>
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
  if (invoice.review_reason) {
    return <span className="blocker">{REVIEW_REASON_LABELS[invoice.review_reason] ?? invoice.review_reason}</span>;
  }
  if (invoice.pending_steps > 0) {
    return (
      <span className="blocker is-wait">
        {invoice.pending_steps} {invoice.pending_steps === 1 ? "Freigabe offen" : "Freigaben offen"}
      </span>
    );
  }
  return null;
}
