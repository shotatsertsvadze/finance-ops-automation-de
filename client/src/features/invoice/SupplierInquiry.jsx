import { useEffect, useState } from "react";
import { approveSupplierInquiry, getSupplierInquiry, markSupplierInquirySent, requestSupplierInquiryDraft } from "../../lib/api.js";
import { useI18n } from "../../lib/i18n.js";
import Button from "../../components/Button.jsx";

/**
 * A supplier inquiry (ADR-084): a draft from the model or the fixed template,
 * edited and approved by a person, then sent by that person outside the
 * application. Only "sent by hand" moves the invoice. Shown only with the AI
 * features on, so the screen is unchanged with them off.
 */
export default function SupplierInquiry({ invoiceId, runNo, state, may, onChanged }) {
  const { t, errorText, formatDateTime } = useI18n();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setDraft(null);
    setError(null);
    getSupplierInquiry(invoiceId)
      .then(setData)
      .catch(() => setData(null));
  }, [invoiceId, runNo, state]);

  if (!data?.enabled) return null;
  const bankBlocked = data.code === "INQUIRY_BANK_DETAILS";
  if (!data.eligible && !bankBlocked && !data.inquiries.length) return null;
  const canAct = may("review:decide");

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const fromTemplate = () => setDraft({ source: "TEMPLATE", ...data.template });
  const fromAi = () =>
    run(async () => {
      const result = await requestSupplierInquiryDraft(invoiceId);
      if (result.status === "ACCEPTED")
        return setDraft({ source: "AI", ai_inquiry_id: result.id, subject: result.subject, body: result.body });
      fromTemplate();
      setError(t("inquiryAiUnavailable"));
    });
  const approve = () =>
    run(async () => {
      setData(await approveSupplierInquiry(invoiceId, draft));
      setDraft(null);
    });
  const markSent = (inquiry) => {
    if (!window.confirm(t("inquirySentConfirm"))) return;
    run(async () => {
      setData(await markSupplierInquirySent(invoiceId, inquiry.id));
      onChanged();
    });
  };
  const edit = (field) => (e) => setDraft({ ...draft, [field]: e.target.value });

  return (
    <section className="panel ai-panel" aria-label={t("inquiryTitle")}>
      <div className="panel-head">
        <span className="label">{t("inquiryTitle")}</span>
        <span className="ai-badge">{t("inquiryBadge")}</span>
      </div>
      <div className="panel-body">
        {bankBlocked && <p className="hint">{t("inquiryBankBlocked")}</p>}

        {data.eligible && canAct && !draft && (
          <div className="inquiry-start">
            <p className="hint">{t("inquiryIntro")}</p>
            <Button onClick={fromAi} disabled={busy}>
              {busy ? t("inquiryDrafting") : t("inquiryFromAi")}
            </Button>
            <Button variant="ghost" onClick={fromTemplate} disabled={busy}>
              {t("inquiryFromTemplate")}
            </Button>
          </div>
        )}

        {draft && (
          <div className="inquiry-editor action-comment">
            <span className="label">{draft.source === "AI" ? t("inquirySourceAi") : t("inquirySourceTemplate")}</span>
            <label className="action-comment">
              <span className="label">{t("inquirySubject")}</span>
              <input value={draft.subject} onChange={edit("subject")} />
            </label>
            <label className="action-comment">
              <span className="label">{t("inquiryBody")}</span>
              <textarea rows={12} value={draft.body} onChange={edit("body")} />
            </label>
            <div className="inquiry-actions">
              <Button onClick={approve} disabled={busy}>
                {t("inquiryApprove")}
              </Button>
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
                {t("inquiryDiscard")}
              </Button>
            </div>
          </div>
        )}

        {data.inquiries.length > 0 && (
          <ul className="inquiry-list">
            {data.inquiries.map((inquiry) => (
              <li key={inquiry.id} className="inquiry-item">
                <div className="inquiry-status">
                  <strong>{inquiry.status === "SENT" ? t("inquirySent") : t("inquiryApproved")}</strong>
                  <span className="hint">
                    {inquiry.status === "SENT"
                      ? t("inquirySentBy", inquiry.sent_by_name, formatDateTime(inquiry.sent_at))
                      : t("inquiryApprovedBy", inquiry.approved_by_name, formatDateTime(inquiry.approved_at))}
                    {" · "}
                    {inquiry.source === "AI" ? t("inquirySourceAiShort") : t("inquirySourceTemplate")}
                  </span>
                </div>
                <p className="inquiry-subject">{inquiry.subject}</p>
                <p className="inquiry-text">{inquiry.body}</p>
                <div className="inquiry-actions">
                  <Button variant="ghost" onClick={() => navigator.clipboard?.writeText(`${inquiry.subject}\n\n${inquiry.body}`)}>
                    {t("inquiryCopy")}
                  </Button>
                  {inquiry.status === "APPROVED" && canAct && data.eligible && (
                    <Button onClick={() => markSent(inquiry)} disabled={busy}>
                      {t("inquiryMarkSent")}
                    </Button>
                  )}
                </div>
                {inquiry.status === "APPROVED" && <p className="hint">{t("inquiryNotSentHere")}</p>}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}
