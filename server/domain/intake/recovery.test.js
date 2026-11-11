/**
 * Recovering an intake that never finished.
 *
 * Receiving a file and processing it are separate transactions, deliberately:
 * that a document arrived is a fact worth keeping even when the run that
 * should have read it fell over. The cost was that the invoice sat in
 * RECEIVED, and re-uploading the same file answered DUPLICATE, because the
 * stranded row counted as the live one. The sender had no way back in; only an
 * operator with the reprocess endpoint could rescue it.
 *
 * Sending the file again is the obvious thing for a person to try, so it is
 * what resumes the work.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { testDeps } from "../../test-support/db.js";
import { handleUpload, receiveInvoice } from "./intake.js";
import { SYSTEM } from "../workflow/transitions.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";

let deps;
let counter = 0;

const upload = (xml, name, withDeps = deps) =>
  handleUpload(withDeps, { buffer: Buffer.from(xml, "utf8"), originalFilename: name, sourceChannel: "EMAIL", actor: SYSTEM });

/** Deps whose storage cannot be read back, as if the disk had gone away. */
const brokenStorage = () => ({
  ...deps,
  storage: {
    ...deps.storage,
    read: async () => {
      throw new Error("storage nicht erreichbar");
    },
  },
});

const stateOf = async (id) => {
  const {
    rows: [row],
  } = await deps.pool.query("select state from finops.invoices where id = $1", [id]);
  return row?.state ?? null;
};
const countFor = async (hash) => {
  const {
    rows: [row],
  } = await deps.pool.query("select count(*)::int as n from finops.invoices where file_sha256 = $1", [hash]);
  return row.n;
};

before(async () => {
  deps = await testDeps();
});
after(async () => {
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

const freshXml = () => buildInvoiceXml({ number: `REC-${Date.now()}-${(counter += 1)}`, netCents: 20000 });

test("an intake whose processing fails leaves the receipt on the record", async () => {
  const xml = freshXml();
  await assert.rejects(() => upload(xml, "stranded.xml", brokenStorage()), /storage nicht erreichbar/);

  const { rows } = await deps.pool.query("select id, state from finops.invoices");
  assert.equal(rows.length, 1, "the arrival is kept even though the run failed");
  assert.equal(rows[0].state, "RECEIVED");
});

test("sending the same file again resumes it instead of calling it a duplicate", async () => {
  const xml = freshXml();
  await assert.rejects(() => upload(xml, "stranded.xml", brokenStorage()));
  const {
    rows: [stranded],
  } = await deps.pool.query("select id, file_sha256 from finops.invoices");

  const again = await upload(xml, "stranded.xml");
  assert.equal(again.id, stranded.id, "the same invoice continues, rather than a second row appearing");
  assert.equal(again.state, "RECEIVED", "it was resumed, not received afresh");
  assert.equal(await countFor(stranded.file_sha256), 1, "no duplicate row is created");

  const state = await stateOf(stranded.id);
  assert.ok(["READY_FOR_APPROVAL", "APPROVED", "REVIEW_REQUIRED"].includes(state), `it was processed: ${state}`);
});

test("the resumed invoice keeps its original intake facts", async () => {
  // The second arrival is the same document, not a new one: the receipt must
  // not be rewritten to the later moment.
  const xml = freshXml();
  await assert.rejects(() => upload(xml, "first-name.xml", brokenStorage()));
  const {
    rows: [before_],
  } = await deps.pool.query("select id, received_at, original_filename, source_channel from finops.invoices");

  await upload(xml, "second-name.xml");
  const {
    rows: [after_],
  } = await deps.pool.query("select received_at, original_filename, source_channel from finops.invoices where id = $1", [before_.id]);
  assert.deepEqual(after_, {
    received_at: before_.received_at,
    original_filename: before_.original_filename,
    source_channel: before_.source_channel,
  });
});

test("the resumption is on the audit trail, not silent", async () => {
  const xml = freshXml();
  await assert.rejects(() => upload(xml, "stranded.xml", brokenStorage()));
  const {
    rows: [stranded],
  } = await deps.pool.query("select id from finops.invoices");

  await upload(xml, "stranded.xml");
  const { rows } = await deps.pool.query("select action from finops.audit_events where invoice_id = $1 order by occurred_at, id", [
    stranded.id,
  ]);
  const actions = rows.map((r) => r.action);
  assert.ok(actions.includes("intake_resumed"), `the second arrival is recorded: ${actions.join(", ")}`);
});

test("a file sent again after it was processed is still a duplicate", async () => {
  // Resumption is for work that never finished. An invoice that was processed
  // is a real duplicate and must stay one.
  const xml = freshXml();
  const first = await upload(xml, "clean.xml");
  assert.notEqual(first.state, "DUPLICATE");

  const second = await upload(xml, "clean.xml");
  assert.equal(second.state, "DUPLICATE");
  assert.equal(second.duplicateOf, first.id);
});

test("receiveInvoice alone reports that it resumed rather than received", async () => {
  const xml = freshXml();
  await assert.rejects(() => upload(xml, "stranded.xml", brokenStorage()));

  const received = await receiveInvoice(deps, {
    buffer: Buffer.from(xml, "utf8"),
    originalFilename: "stranded.xml",
    sourceChannel: "EMAIL",
    actor: SYSTEM,
  });
  assert.equal(received.resumed, true);
  assert.equal(received.state, "RECEIVED");
});
