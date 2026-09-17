export const MAX_XML_BYTES = 5 * 1024 * 1024;

/**
 * Gate before any XML parsing. Rejects DOCTYPE and entity declarations so
 * that neither external entities nor entity expansion can ever reach the
 * parser, regardless of parser configuration.
 */
export function checkXmlSafety(buffer) {
  if (!buffer || buffer.length === 0) return { ok: false, reason: "Datei ist leer" };
  if (buffer.length > MAX_XML_BYTES) return { ok: false, reason: `Datei größer als ${MAX_XML_BYTES / 1024 / 1024} MB` };
  const text = buffer.toString("utf8");
  if (text.includes("�")) return { ok: false, reason: "Datei ist kein gültiges UTF-8" };
  if (/<!DOCTYPE/i.test(text)) return { ok: false, reason: "DOCTYPE-Deklarationen sind nicht erlaubt" };
  if (/<!ENTITY/i.test(text)) return { ok: false, reason: "ENTITY-Deklarationen sind nicht erlaubt" };
  if (!/^\s*(<\?xml[^>]*\?>)?\s*</.test(text)) return { ok: false, reason: "Datei beginnt nicht mit XML" };
  return { ok: true, text };
}
