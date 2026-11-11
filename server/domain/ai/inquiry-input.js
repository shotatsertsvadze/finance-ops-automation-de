import { createHash } from "node:crypto";
import { buildExplanationInput } from "./explanation-input.js";
import { REQUESTS, inquiryScope } from "../inquiries/requests.js";

/**
 * The only data an inquiry draft is given (ADR-084): the failed checks the
 * inquiry can address, with the same allowlisted evidence an explanation gets
 * (ADR-082), the requests allowed for them, and the names of the placeholders
 * the invoice has values for. Never a value itself. What this returns is
 * stored as sent.
 */
const INQUIRY_INPUT_SCHEMA = "finops.ai-inquiry-input/1";

/** The draft's input, or why there is none. */
export function buildInquiryInput(evidence, placeholders) {
  const base = buildExplanationInput(evidence, "de");
  const scope = inquiryScope(base.failed.map((check) => check.check));
  if (!scope.eligible) return { eligible: false, code: scope.code };
  const failed = base.failed.filter((check) => scope.checks.includes(check.check));
  return {
    eligible: true,
    input: {
      schema: INQUIRY_INPUT_SCHEMA,
      language: "de",
      document: { kind: base.document.kind, run_no: base.document.run_no },
      failed,
      request_for_check: Object.fromEntries(failed.map((check) => [check.check, REQUESTS[check.check].request])),
      allowed_requests: scope.requests,
      placeholders,
    },
  };
}

export const inquiryInputSha256 = (input) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
