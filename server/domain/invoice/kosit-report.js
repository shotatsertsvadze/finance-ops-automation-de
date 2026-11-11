import { XMLParser, XMLValidator } from "fast-xml-parser";

/**
 * Reads a KoSIT validation report (VARL 1.0.0, the `rep:` namespace). The only
 * place that knows its shape: a validator version that changes the report
 * changes this file, not the rules that use it (ADR-078).
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  processEntities: false,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) => ["validationStepResult", "message"].includes(name),
});

const text = (node) => (node && typeof node === "object" ? (node["#text"] ?? null) : (node ?? null));

/**
 * The report's facts, or null when the text is not a readable report. Line
 * numbers are left in the raw report: the daemon reads the document again
 * before validating, so they do not point into the stored original.
 */
export function readReport(xml) {
  if (!xml || XMLValidator.validate(xml) !== true) return null;
  const report = parser.parse(xml).report;
  if (!report?.assessment) return null;
  const assessment = "accept" in report.assessment ? "ACCEPTED" : "reject" in report.assessment ? "REJECTED" : null;
  const matched = report.scenarioMatched ?? null;
  const hash = text(report.documentIdentification?.documentHash?.hashValue);
  return {
    assessment,
    engine: text(report.engine?.name),
    scenario: text(matched?.scenario?.name),
    documentSha256: hash ? Buffer.from(hash, "base64").toString("hex") : null,
    messages: (matched?.validationStepResult ?? []).flatMap((step) =>
      (step.message ?? []).map((m) => ({
        step: step["@_id"] ?? null,
        level: m["@_level"] ?? null,
        code: m["@_code"] ?? null,
        text: text(m),
      })),
    ),
  };
}
