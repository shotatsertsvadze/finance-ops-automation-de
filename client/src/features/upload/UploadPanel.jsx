import { useRef, useState } from "react";
import { uploadInvoice } from "../../lib/api.js";
import { useI18n } from "../../lib/i18n.js";

export default function UploadPanel({ onUploaded }) {
  const { t, errorText } = useI18n();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function send(file) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const invoice = await uploadInvoice(file);
      setMessage({ ok: true, text: t("uploadDone", file.name) });
      onUploaded(invoice);
    } catch (error) {
      setMessage({ ok: false, text: errorText(error) });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">{t("uploadTitle")}</span>
        <span className="hint">{t("uploadOnlyXml")}</span>
      </div>
      <div className="panel-body">
        {message && (
          <div className={`toast${message.ok ? "" : " is-error"}`} role="status">
            {message.text}
          </div>
        )}
        <div className="upload">
          <input
            ref={inputRef}
            type="file"
            accept=".xml,application/xml,text/xml"
            style={{ display: "none" }}
            onChange={(e) => send(e.target.files?.[0])}
          />
          <button className="btn" onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? t("checking") : t("uploadPick")}
          </button>
          <span className="hint">{t("uploadFixtures")}</span>
        </div>
      </div>
    </div>
  );
}
