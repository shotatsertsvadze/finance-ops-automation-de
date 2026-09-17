import { useState } from "react";
import { ROLE_LABELS } from "../../lib/format.js";

const DEMO_ACCOUNTS = [
  { email: "anna.berger@nordwerk.example", role: "AP_CLERK" },
  { email: "tim.kessler@nordwerk.example", role: "MANAGER" },
  { email: "jonas.weber@nordwerk.example", role: "FINANCE" },
  { email: "sabine.vogt@nordwerk.example", role: "CFO" },
];

export default function LoginView({ onLogin }) {
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
          <div className="brand-mark">Nordwerk GmbH</div>
          <div className="brand-sub">Rechnungseingang</div>
        </div>

        <form onSubmit={submit}>
          <label className="login-field">
            <span className="label">E-Mail</span>
            <input type="email" value={email} autoComplete="username" required
                   onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="login-field">
            <span className="label">Passwort</span>
            <input type="password" value={password} autoComplete="current-password" required
                   onChange={(e) => setPassword(e.target.value)} />
          </label>

          {error && <div className="toast is-error" role="alert">{error}</div>}

          <button className="btn login-submit" type="submit" disabled={busy}>
            {busy ? "Wird geprüft…" : "Anmelden"}
          </button>
        </form>

        <div className="login-demo">
          <div className="label">Demokonten</div>
          <ul>
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email}>
                <button type="button" className="link-button mono" onClick={() => setEmail(account.email)}>
                  {account.email}
                </button>
                <span className="hint">{ROLE_LABELS[account.role]}</span>
              </li>
            ))}
          </ul>
          <p className="hint">
            Demonstrationssystem mit synthetischen Daten. Das gemeinsame Passwort der Demokonten steht in der README.
          </p>
        </div>
      </div>
    </div>
  );
}
