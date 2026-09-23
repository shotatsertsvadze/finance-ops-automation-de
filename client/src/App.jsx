import { useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import { listInvoices } from "./lib/api.js";
import InboxView from "./features/inbox/InboxView.jsx";
import InvoiceDetail from "./features/invoice/InvoiceDetail.jsx";
import PaymentsView from "./features/payments/PaymentsView.jsx";
import DashboardView from "./features/dashboard/DashboardView.jsx";
import LoginView from "./features/auth/LoginView.jsx";
import { useSession } from "./lib/useSession.js";
import { useI18n } from "./lib/i18n.js";
import LanguageSwitch from "./components/LanguageSwitch.jsx";

export default function App() {
  const { user, may, checked, expired, login, logout } = useSession();
  const { t, role } = useI18n();
  const [counts, setCounts] = useState({ all: 0, REVIEW_REQUIRED: 0, READY_FOR_APPROVAL: 0, APPROVED: 0, openMoney: 0 });

  const refresh = useCallback(() => {
    listInvoices()
      .then((rows) => {
        setCounts({
          all: rows.length,
          REVIEW_REQUIRED: rows.filter((r) => r.state === "REVIEW_REQUIRED").length,
          READY_FOR_APPROVAL: rows.filter((r) => r.state === "READY_FOR_APPROVAL").length,
          APPROVED: rows.filter((r) => r.state === "APPROVED").length,
          openMoney: rows.filter((r) =>
            ["APPROVED", "ACCOUNTING_READY", "PAYMENT_PENDING", "PAID", "RECONCILIATION_EXCEPTION"].includes(r.state),
          ).length,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  if (!checked) return <p className="empty">{t("sessionChecking")}</p>;
  if (!user) return <LoginView onLogin={login} expired={expired} />;

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark">{t("brand")}</div>
          <div className="brand-sub">{t("brandSub")}</div>
        </div>
        <nav className="nav">
          <div className="nav-group label">{t("navOverview")}</div>
          <NavLink to="/dashboard">{t("navKpis")}</NavLink>
          <div className="nav-group label">{t("navQueue")}</div>
          <NavLink to="/" end>
            {t("navInbox")} <span className="nav-count">{counts.all}</span>
          </NavLink>
          <NavLink to="/sichtpruefung">
            {t("navReview")} <span className="nav-count">{counts.REVIEW_REQUIRED}</span>
          </NavLink>
          <NavLink to="/freigaben">
            {t("navApprovals")} <span className="nav-count">{counts.READY_FOR_APPROVAL}</span>
          </NavLink>
          <NavLink to="/freigegeben">
            {t("navApproved")} <span className="nav-count">{counts.APPROVED}</span>
          </NavLink>
          <div className="nav-group label">{t("navMoney")}</div>
          <NavLink to="/zahlungen">
            {t("navPayments")} <span className="nav-count">{counts.openMoney}</span>
          </NavLink>
        </nav>
        <div className="rail-foot">
          <LanguageSwitch />
          <div className="session">
            <div className="session-name">{user.name}</div>
            <div className="session-role">{role(user.role)}</div>
            <button type="button" className="link-button" onClick={logout}>{t("signOut")}</button>
          </div>
          <p>{t("demoDisclaimer")}</p>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<InboxView view="inbox" onChanged={refresh} />} />
          <Route path="/sichtpruefung" element={<InboxView view="review" onChanged={refresh} />} />
          <Route path="/freigaben" element={<InboxView view="approval" onChanged={refresh} />} />
          <Route path="/freigegeben" element={<InboxView view="done" onChanged={refresh} />} />
          <Route path="/dashboard" element={<DashboardView />} />
          <Route path="/zahlungen" element={<PaymentsView may={may} onChanged={refresh} />} />
          <Route path="/rechnung/:id" element={<InvoiceDetail may={may} onChanged={refresh} />} />
        </Routes>
      </main>
    </div>
  );
}
