/**
 * An intake that fails after its file is written (ADR-062). The original is
 * stored inside the transaction, before the invoice row; when the insert
 * failed, the rollback removed the row and left the file behind, referenced
 * by nothing.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { testDeps } from "../../test-support/db.js";
import { createStorage } from "../../storage/files.js";
import { receiveInvoice } from "./intake.js";
import { SYSTEM } from "../workflow/transitions.js";

let deps, dir;
before(async () => {
  deps = await testDeps();
  dir = mkdtempSync(path.join(tmpdir(), "finops-orphan-"));
  deps = { ...deps, storage: createStorage(dir) };
});
after(() => deps.pool.end());

const buffer = readFileSync(new URL("../../../fixtures/xrechnung/G_clean_380.xml", import.meta.url));

test("an intake that fails after writing its file leaves no file behind", async () => {
  // original_filename is not null; the insert fails after the file is written.
  await assert.rejects(() => receiveInvoice(deps, { buffer, originalFilename: null, sourceChannel: "UPLOAD", actor: SYSTEM }));
  const { rows } = await deps.pool.query("select count(*)::int as n from finops.invoices");
  assert.equal(rows[0].n, 0);
  assert.deepEqual(readdirSync(dir), [], "nothing in storage that no invoice refers to");
});

test("a successful intake keeps its file", async () => {
  const { id } = await receiveInvoice(deps, { buffer, originalFilename: "G.xml", sourceChannel: "UPLOAD", actor: SYSTEM });
  assert.deepEqual(readdirSync(path.join(dir, id)), ["original.xml"]);
});
