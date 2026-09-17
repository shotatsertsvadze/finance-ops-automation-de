import { useRef, useState } from "react";
import { uploadInvoice } from "../../lib/api.js";

export default function UploadPanel({ onUploaded }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  async function send(file) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const invoice = await uploadInvoice(file);
      setMessage({ ok: true, text: `${file.name} verarbeitet.` });
      onUploaded(invoice);
    } catch (error) {
      setMessage({ ok: false, text: error.message });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="label">XRechnung hochladen</span>
        <span className="hint">Nur XML. Die Datei wird unverändert gespeichert.</span>
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
            {busy ? "Wird geprüft…" : "Datei auswählen"}
          </button>
          <span className="hint">Beispieldateien liegen in fixtures/xrechnung/.</span>
        </div>
      </div>
    </div>
  );
}
