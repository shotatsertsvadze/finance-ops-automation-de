import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { proposeBankChange } from "../../lib/api.js";
import { useI18n } from "../../lib/i18n.js";
import ChangeChip from "./ChangeChip.jsx";
import { invoiceBankEntry } from "./rules.js";
import Button from "../../components/Button.jsx";
import Panel from "../../components/Panel.jsx";

/**
 * On an invoice stopped because its IBAN is not on file: the way on is a
 * proposal three people handle, never the invoice itself (ADR-077).
 */
export default function InvoiceBankPanel({ invoice, may }) {
  const { t, errorText } = useI18n();
  const navigate = useNavigate();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { show, canPropose } = invoiceBankEntry(invoice, may);
  if (!show) return null;

  async function propose() {
    setBusy(true);
    setError(null);
    try {
      const change = await proposeBankChange({
        supplier_id: invoice.supplier_id,
        iban: invoice.supplier_iban_raw,
        source_invoice_id: invoice.id,
        comment,
      });
      navigate(`/bankverbindungen/${change.id}`);
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Panel title={t("panelBankAccount")}>
      <p className="action-prompt">{t("bankEntryHint")}</p>
      {error && (
        <div className="toast is-error" role="alert">
          {error}
        </div>
      )}
      {invoice.bank_changes.length > 0 && (
        <ul className="plain-list">
          {invoice.bank_changes.map((c) => (
            <li key={c.id}>
              <Link to={`/bankverbindungen/${c.id}`} className="mono">
                {c.change_no}
              </Link>{" "}
              <ChangeChip state={c.state} />
            </li>
          ))}
        </ul>
      )}
      {canPropose && (
        <>
          <label className="action-comment">
            <span className="label">{t("reason")}</span>
            <textarea
              rows={2}
              maxLength={1000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("reasonPlaceholder")}
            />
          </label>
          <Button disabled={busy} onClick={propose}>
            {t("proposeBankAccount")}
          </Button>
        </>
      )}
    </Panel>
  );
}
