import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * A stand-in for the KoSIT daemon in tests that are about the pipeline, not
 * the validator. Its answers are the real reports captured from the pinned
 * validator, re-addressed to the document being validated, so they pass the
 * same checks a real answer must. The real validator is exercised by
 * `kosit-real.test.js`.
 */
const report = (name) => readFileSync(new URL(`../../fixtures/kosit/${name}`, import.meta.url), "utf8");
const ACCEPTED = report("A_clean_1240.accepted.xml");
const REJECTED = report("F_malformed.rejected.xml");

const addressedTo = (xml, buffer) =>
  xml.replace(/<rep:hashValue>[^<]*<\/rep:hashValue>/, `<rep:hashValue>${createHash("sha256").update(buffer).digest("base64")}</rep:hashValue>`);

export const ANSWERS = {
  accept: (buffer) => ({ outcome: "ACCEPTED", httpStatus: 200, report: addressedTo(ACCEPTED, buffer) }),
  reject: (buffer) => ({ outcome: "REJECTED", httpStatus: 406, report: addressedTo(REJECTED, buffer) }),
  unavailable: () => ({ outcome: "UNAVAILABLE", httpStatus: null, report: null, error: "connect ECONNREFUSED 127.0.0.1:8081" }),
  timeout: () => ({ outcome: "TIMEOUT", httpStatus: null, report: null }),
  unprocessable: () => ({ outcome: "UNPROCESSABLE", httpStatus: 422, report: "Fehler in der Konfiguration" }),
};

/** A required validator whose answer the test can change between calls. */
export function standInValidator(answer = ANSWERS.accept) {
  const validator = {
    required: true,
    answer,
    calls: 0,
    client: {
      async validate(buffer) {
        validator.calls += 1;
        return { durationMs: 5, ...validator.answer(buffer) };
      },
    },
  };
  return validator;
}
