import { useEffect, useState } from "react";
import { getAiExplanation, requestAiExplanation } from "../../lib/api.js";
import { useI18n } from "../../lib/i18n.js";
import Button from "../../components/Button.jsx";

/**
 * An AI explanation of why the invoice stopped (ADR-080). It sits below the
 * check results it summarises and never replaces them. Shown only when the
 * feature is on and the invoice is in review with a failed check; asked for
 * by a person, never generated on its own. The next step is our wording.
 */
export default function AiExplanation({ invoiceId, runNo, state, may }) {
  const { lang, t, aiStep, errorText, formatDateTime } = useI18n();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
    getAiExplanation(invoiceId, lang)
      .then(setData)
      .catch(() => setData(null));
  }, [invoiceId, lang, runNo, state]);

  if (!data?.enabled || !data.eligible) return null;

  const generate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await requestAiExplanation(invoiceId, lang);
      setData({ ...data, status: result.status, explanation: result.status === "ACCEPTED" ? result : null });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const explanation = data.explanation;
  const canAsk = may("review:decide");

  return (
    <section className="panel ai-panel" aria-label={t("aiTitle")}>
      <div className="panel-head">
        <span className="label">{t("aiTitle")}</span>
        <span className="ai-badge">{t("aiBadge")}</span>
      </div>
      <div className="panel-body">
        {explanation ? (
          <>
            <p className="ai-summary">{explanation.summary}</p>
            <p className="ai-text">{explanation.explanation}</p>
            <dl className="ai-meta">
              <dt>{t("aiRefersTo")}</dt>
              <dd>
                {explanation.cited_checks.map((code) => (
                  <code key={code} className="ev-code">
                    {code}
                  </code>
                ))}
              </dd>
              {explanation.next_step && (
                <>
                  <dt>{t("aiNextStep")}</dt>
                  <dd>{aiStep(explanation.next_step)}</dd>
                </>
              )}
            </dl>
            <p className="hint ai-foot">
              {t("aiAuthoritative")} {t("aiGeneratedBy", explanation.model, formatDateTime(explanation.created_at))}
            </p>
          </>
        ) : (
          <>
            <p className="hint">{data.status === "UNAVAILABLE" ? t("aiUnavailable") : t("aiNoneYet")}</p>
            {canAsk && (
              <Button onClick={generate} disabled={busy}>
                {busy ? t("aiGenerating") : data.status === "UNAVAILABLE" ? t("aiRetry") : t("aiGenerate")}
              </Button>
            )}
          </>
        )}
        {error && <p className="error">{error}</p>}
      </div>
    </section>
  );
}
