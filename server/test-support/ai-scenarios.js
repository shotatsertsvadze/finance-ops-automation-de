import { readFileSync } from "node:fs";
import { handleUpload } from "../domain/intake/intake.js";
import { human } from "../domain/workflow/transitions.js";
import { ANSWERS, standInValidator } from "./kosit.js";
import { USERS } from "./db.js";

/**
 * The five evaluation scenarios for AI explanations (ADR-080), built through
 * the real pipeline with the KoSIT stand-in answering as the real validator
 * would. `fixtures/ai/` holds the input each one produces; a test keeps the
 * two identical.
 */
const fixture = (name) => readFileSync(new URL(`../../fixtures/xrechnung/${name}`, import.meta.url));

// B's IBAN, which no supplier has as a trusted account.
const UNTRUSTED_IBAN = "DE02300209000106531065";

export const SCENARIOS = {
  "1_iban_mismatch": { files: [["B_iban_changed_2499.xml"]] },
  "2_po_overrun": { files: [["C_po_overrun_8500.xml"]] },
  // A first: D repeats its number, and A has already used up the order.
  "3_duplicate": { files: [["A_clean_1240.xml"], ["D_duplicate_number_1240.xml"]] },
  "4_kosit_rejection": { files: [["F_malformed.xml"]], answer: ANSWERS.reject },
  "5_iban_and_po_overrun": {
    files: [["C_po_overrun_8500.xml", (xml) => xml.replace(/<cbc:ID>DE\d{2}[A-Z0-9]+<\/cbc:ID>/, `<cbc:ID>${UNTRUSTED_IBAN}</cbc:ID>`)]],
  },
};

/** Runs a scenario into an empty invoice table; returns the id of its last invoice. */
export async function runScenario(deps, name) {
  const { files, answer = ANSWERS.accept } = SCENARIOS[name];
  const scenarioDeps = { ...deps, officialValidator: standInValidator(answer) };
  await deps.pool.query("delete from finops.invoices");
  let id;
  for (const [file, change = (xml) => xml] of files) {
    const buffer = Buffer.from(change(fixture(file).toString("utf8")));
    ({ id } = await handleUpload(scenarioDeps, { buffer, originalFilename: file, sourceChannel: "UPLOAD", actor: human(USERS.clerk) }));
  }
  return id;
}

export const scenarioFixture = (name) => JSON.parse(readFileSync(new URL(`../../fixtures/ai/${name}.json`, import.meta.url), "utf8"));
