import { useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { listInvoices } from "./lib/api.js";
import InboxView from "./features/inbox/InboxView.jsx";
import InvoiceDetail from "./features/invoice/InvoiceDetail.jsx";

export default function App() {
  const [counts, setCounts] = useState({ all: 0, REVIEW_REQUIRED: 0, READY_FOR_APPROVAL: 0, APPROVED: 0 });

  const refresh = useCallback(() => {
    listInvoices()
      .then((rows) => {
        setCounts({
          all: rows.length,
          REVIEW_REQUIRED: rows.filter((r) => r.state === "REVIEW_REQUIRED").length,
          READY_FOR_APPROVAL: rows.filter((r) => r.state === "READY_FOR_APPROVAL").length,
          APPROVED: rows.filter((r) => r.state === "APPROVED").length,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(refresh, [refresh]);

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark">Nordwerk GmbH</div>
          <div className="brand-sub">Rechnungseingang</div>
        </div>
        <nav className="nav">
          <div className="nav-group label">Arbeitsvorrat</div>
          <NavLink to="/" end>
            Posteingang <span className="nav-count">{counts.all}</span>
          </NavLink>
          <NavLink to="/sichtpruefung">
            Sichtprüfung <span className="nav-count">{counts.REVIEW_REQUIRED}</span>
          </NavLink>
          <NavLink to="/freigaben">
            Freigaben <span className="nav-count">{counts.READY_FOR_APPROVAL}</span>
          </NavLink>
          <NavLink to="/freigegeben">
            Freigegeben <span className="nav-count">{counts.APPROVED}</span>
          </NavLink>
        </nav>
        <div className="rail-foot">
          Demonstrationssystem.<br />
          Synthetische Daten, keine echten Zahlungen.
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<InboxView view="inbox" onChanged={refresh} />} />
          <Route path="/sichtpruefung" element={<InboxView view="review" onChanged={refresh} />} />
          <Route path="/freigaben" element={<InboxView view="approval" onChanged={refresh} />} />
          <Route path="/freigegeben" element={<InboxView view="done" onChanged={refresh} />} />
          <Route path="/rechnung/:id" element={<InvoiceDetail />} />
        </Routes>
      </main>
    </div>
  );
}
