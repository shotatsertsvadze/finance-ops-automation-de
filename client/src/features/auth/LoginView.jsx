import { useState } from "react";
import { useI18n } from "../../lib/i18n.js";
import LanguageSwitch from "../../components/LanguageSwitch.jsx";

const DEMO_ACCOUNTS = [
  { email: "anna.berger@nordwerk.example", role: "AP_CLERK" },
  { email: "tim.kessler@nordwerk.example", role: "MANAGER" },
  { email: "jonas.weber@nordwerk.example", role: "FINANCE" },
  { email: "sabine.vogt@nordwerk.example", role: "CFO" },
];

export default function LoginView({ onLogin }) {
  const { t, role } = useI18n();
  const [email, setEmail] = useState(DEMO_ACCOUNTS[0].email);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onLogin(email, password);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-brand">
          <LanguageSwitch />
          <div className="brand-mark">{t("brand")}</div>
          <div className="brand-sub">{t("brandSub")}</div>
        </div>

        <form onSubmit={submit}>
          <label className="login-field">
            <span className="label">{t("email")}</span>
            <input type="email" value={email} autoComplete="username" required
                   onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="login-field">
            <span className="label">{t("password")}</span>
            <input type="password" value={password} autoComplete="current-password" required
                   onChange={(e) => setPassword(e.target.value)} />
          </label>

          {error && <div className="toast is-error" role="alert">{error}</div>}

          <button className="btn login-submit" type="submit" disabled={busy}>
            {busy ? t("checking") : t("login")}
          </button>
        </form>

        <div className="login-demo">
          <div className="label">{t("demoAccounts")}</div>
          <ul>
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button type="button" className="link-button mono" onClick={() => setEmail(account.email)}>
                  {account.email}
                </button>
                <span className="hint">{role(account.role)}</span>
              </li>
            ))}
          </ul>
          <p className="hint">{t("loginHint")}</p>
        </div>
      </div>
    </div>
  );
}
