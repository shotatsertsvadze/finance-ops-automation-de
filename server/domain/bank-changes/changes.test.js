/**
 * Proposing, verifying and approving a new trusted bank account (ADR-077).
 * Called on the domain, against the real database: the refusals here are the
 * rules; the HTTP tests show that roles and the request body cannot get round them.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { USERS, resetBankChanges, testDeps } from "../../test-support/db.js";
import { human } from "../workflow/transitions.js";
import { approveChange, cancelChange, proposeChange, rejectChange, verifyChange } from "./changes.js";

const S1 = "10000000-0000-0000-0000-000000000001";
const S2 = "10000000-0000-0000-0000-000000000002";
const S1_IBAN = "DE89370400440532013000";
const NEW_IBAN = "DE75512108001245126199";
const clerk = human(USERS.clerk);
const finance = human(USERS.finance);
const finance2 = human(USERS.finance2);
const cfo = human(USERS.cfo);
let deps;

before(async () => {
  deps = await testDeps();
});
after(() => deps.pool.end());
beforeEach(() => resetBankChanges(deps.pool));

const propose = (overrides = {}) =>
  proposeChange(deps, {
    supplierId: S1,
    iban: NEW_IBAN,
    reason: "Neue Bankverbindung laut Lieferantenschreiben",
    actor: clerk,
    ...overrides,
  });

const confirmation = (overrides = {}) => ({
  outcome: "CONFIRMED",
  contactedRole: "Buchhaltung",
  calledAt: new Date().toISOString(),
  ibanReadBack: NEW_IBAN,
  ...overrides,
});

async function verified(overrides = {}) {
  const { change } = await propose(overrides);
  await verifyChange(deps, { changeId: change.id, actor: finance, ...confirmation() });
  return change;
}

const accounts = async (supplierId = S1) =>
  (
    await deps.pool.query(
      "select iban, status, trusted_by_change_id from finops.supplier_bank_accounts where supplier_id = $1 order by iban",
      [supplierId],
    )
  ).rows;

const events = async (changeId) =>
  (
    await deps.pool.query(
      "select action, actor_id, from_state, to_state, evidence from finops.bank_change_events where change_id = $1 order by id",
      [changeId],
    )
  ).rows;

const refusal = (code) => (error) => {
  assert.equal(error.code, code, error.message);
  return true;
};

// ------------------------------------------------------------- propose ---

test("a proposal snapshots the trusted accounts, the policy and a hash, and records who proposed", async () => {
  const { change, created } = await propose();
  assert.equal(created, true);
  assert.equal(change.state, "PROPOSED");
  assert.match(change.change_no, /^BAC-\d{6}$/);
  assert.deepEqual(change.trusted_ibans, [S1_IBAN]);
  assert.equal(change.required_distinct_actors, 3);
  assert.match(change.proposal_sha256, /^[0-9a-f]{64}$/);
  assert.deepEqual(
    (await events(change.id)).map((e) => [e.action, e.actor_id, e.to_state]),
    [["proposed", USERS.clerk, "PROPOSED"]],
  );
  assert.deepEqual(await accounts(), [{ iban: S1_IBAN, status: "ACTIVE", trusted_by_change_id: null }], "nothing is trusted yet");
});

test("an IBAN is normalised, and one with wrong check digits is refused", async () => {
  const { change } = await propose({ iban: "de75 5121 0800 1245 1261 99" });
  assert.equal(change.proposed_iban, NEW_IBAN);
  await assert.rejects(propose({ supplierId: S2, iban: "DE75512108001245126198" }), refusal("IBAN_INVALID"));
});

test("a proposal needs a reason", async () => {
  await assert.rejects(propose({ reason: "  " }), refusal("REASON_REQUIRED"));
});

test("an account already on file is not proposed again", async () => {
  await assert.rejects(propose({ iban: S1_IBAN }), refusal("IBAN_ALREADY_ON_FILE"));
});

test("proposing the same account again returns the open proposal", async () => {
  const first = await propose();
  const again = await propose({ actor: finance });
  assert.equal(again.created, false);
  assert.equal(again.change.id, first.change.id);
  assert.equal(again.change.proposed_by, USERS.clerk, "the first proposer stays the proposer");
});

test("a different account while one is open is refused, naming the open one", async () => {
  const { change } = await propose();
  await assert.rejects(propose({ iban: "DE02300209000106531065" }), (error) => {
    assert.equal(error.code, "CHANGE_ALREADY_OPEN");
    assert.equal(error.details.change_no, change.change_no);
    return true;
  });
});

test("concurrent proposals for one supplier leave exactly one open change", async () => {
  const results = await Promise.allSettled([propose(), propose({ iban: "DE02300209000106531065", actor: finance })]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.code, "CHANGE_ALREADY_OPEN");
  const { rows } = await deps.pool.query("select count(*)::int as n from finops.bank_account_changes where supplier_id = $1", [S1]);
  assert.equal(rows[0].n, 1);
});

test("an IBAN trusted for another supplier is proposed with a warning, not refused", async () => {
  // Factoring and group treasury are legitimate reasons; a fraudster reusing
  // an account is not. The approver has to see it and say so (ADR-077).
  const { change } = await proposeChange(deps, { supplierId: S2, iban: S1_IBAN, reason: "Factoring", actor: clerk });
  assert.deepEqual(
    change.shared_with.map((s) => s.supplier_no),
    ["S-1001"],
  );
});

test("a source invoice must be this supplier's and carry this IBAN", async () => {
  const {
    rows: [invoice],
  } = await deps.pool.query(
    `insert into finops.invoices (state, source_channel, original_filename, file_sha256, file_path, file_size_bytes, supplier_id, supplier_iban_raw)
     values ('REVIEW_REQUIRED', 'UPLOAD', 'x.xml', repeat('c', 64), 'x', 1, $1, $2) returning id`,
    [S1, NEW_IBAN],
  );
  await assert.rejects(propose({ supplierId: S2, sourceInvoiceId: invoice.id }), refusal("SOURCE_INVOICE_MISMATCH"));
  await assert.rejects(propose({ iban: "DE02300209000106531065", sourceInvoiceId: invoice.id }), refusal("SOURCE_INVOICE_MISMATCH"));
  const { change } = await propose({ sourceInvoiceId: invoice.id });
  assert.equal(change.source_invoice_id, invoice.id);
  await resetBankChanges(deps.pool);
  await deps.pool.query("delete from finops.invoices where id = $1", [invoice.id]);
});

test("a blocked supplier gets no new account", async () => {
  await assert.rejects(
    proposeChange(deps, { supplierId: "10000000-0000-0000-0000-000000000004", iban: NEW_IBAN, reason: "x", actor: clerk }),
    refusal("SUPPLIER_NOT_ACTIVE_FOR_CHANGE"),
  );
});

// -------------------------------------------------------------- verify ---

test("the proposer cannot verify their own proposal", async () => {
  const { change } = await propose();
  await assert.rejects(verifyChange(deps, { changeId: change.id, actor: clerk, ...confirmation() }), refusal("PROPOSER_CANNOT_VERIFY"));
});

test("a confirmed call-back records the number on file, never one the caller supplies", async () => {
  const { change } = await propose();
  const result = await verifyChange(deps, {
    changeId: change.id,
    actor: finance,
    ...confirmation(),
    contactNumber: "+49 170 0000000",
    contact_number: "+49 170 0000000",
  });
  assert.equal(result.change.state, "VERIFIED");
  const {
    rows: [v],
  } = await deps.pool.query("select * from finops.bank_change_verifications where change_id = $1", [change.id]);
  assert.equal(v.contact_number, "+49 30 23125 101");
  assert.equal(v.method, "CALLBACK_KNOWN_NUMBER");
  assert.equal(v.proposal_sha256, change.proposal_sha256);
  assert.equal(v.verified_by, USERS.finance);
});

test("confirming needs the IBAN the supplier read back, and it must match", async () => {
  const { change } = await propose();
  await assert.rejects(
    verifyChange(deps, { changeId: change.id, actor: finance, ...confirmation({ ibanReadBack: "DE02300209000106531065" }) }),
    refusal("IBAN_READ_BACK_MISMATCH"),
  );
  await assert.rejects(
    verifyChange(deps, { changeId: change.id, actor: finance, ...confirmation({ ibanReadBack: "" }) }),
    refusal("IBAN_READ_BACK_MISMATCH"),
  );
  const ok = await verifyChange(deps, {
    changeId: change.id,
    actor: finance,
    ...confirmation({ ibanReadBack: "de75 5121 0800 1245 1261 99" }),
  });
  assert.equal(ok.change.state, "VERIFIED");
});

test("a call-back is checked field by field", async () => {
  const { change } = await propose();
  const cases = [
    [{ outcome: "MAYBE" }, "outcome"],
    [{ contactedRole: "" }, "contacted_role"],
    [{ contactedRole: "x".repeat(101) }, "contacted_role"],
    [{ calledAt: "gestern" }, "called_at"],
    [{ calledAt: new Date(Date.now() + 3600_000).toISOString() }, "called_at"],
    [{ calledAt: new Date(Date.now() - 86400_000).toISOString() }, "called_at"],
    [{ reference: "x".repeat(65) }, "reference"],
  ];
  for (const [fields, field] of cases) {
    await assert.rejects(
      verifyChange(deps, { changeId: change.id, actor: finance, ...confirmation(fields) }),
      (error) => error.code === "VERIFICATION_INVALID" && error.details.field === field,
      field,
    );
  }
});

test("a supplier with no number on file cannot be verified", async () => {
  const { change } = await propose();
  await deps.pool.query("update finops.suppliers set callback_phone = null where id = $1", [S1]);
  try {
    // A number supplied with the call is not a fallback for a missing one.
    await assert.rejects(
      verifyChange(deps, { changeId: change.id, actor: finance, ...confirmation(), contactNumber: "+49 170 0000000" }),
      refusal("NO_CALLBACK_NUMBER"),
    );
    const { rows } = await deps.pool.query("select count(*)::int as n from finops.bank_change_verifications");
    assert.equal(rows[0].n, 0);
  } finally {
    await deps.pool.query("update finops.suppliers set callback_phone = '+49 30 23125 101' where id = $1", [S1]);
  }
});

test("a denied call-back rejects the change and trusts nothing", async () => {
  const { change } = await propose();
  const result = await verifyChange(deps, {
    changeId: change.id,
    actor: finance,
    outcome: "DENIED",
    contactedRole: "Buchhaltung",
    calledAt: new Date().toISOString(),
    note: "Lieferant kennt die Kontoänderung nicht",
  });
  assert.equal(result.change.state, "REJECTED");
  assert.equal(result.change.decided_by, USERS.finance);
  assert.deepEqual(
    (await accounts()).map((a) => a.iban),
    [S1_IBAN],
  );
});

test("verifying twice by the same person changes nothing; by another is refused", async () => {
  const change = await verified();
  const replay = await verifyChange(deps, { changeId: change.id, actor: finance, ...confirmation() });
  assert.equal(replay.replayed, true);
  await assert.rejects(verifyChange(deps, { changeId: change.id, actor: cfo, ...confirmation() }), refusal("CHANGE_STATE_CONFLICT"));
  const { rows } = await deps.pool.query("select count(*)::int as n from finops.bank_change_verifications where change_id = $1", [
    change.id,
  ]);
  assert.equal(rows[0].n, 1);
});

// ------------------------------------------------------------- approve ---

test("approval without verification is refused", async () => {
  const { change } = await propose();
  await assert.rejects(approveChange(deps, { changeId: change.id, actor: finance2 }), refusal("CHANGE_NOT_VERIFIED"));
});

test("the proposer cannot approve", async () => {
  const change = await verified();
  await assert.rejects(approveChange(deps, { changeId: change.id, actor: clerk }), refusal("PROPOSER_CANNOT_DECIDE"));
});

test("the verifier cannot approve under the three-person policy", async () => {
  const change = await verified();
  await assert.rejects(approveChange(deps, { changeId: change.id, actor: finance }), refusal("VERIFIER_CANNOT_APPROVE"));
});

test("a third person's approval adds the account as trusted and names the change", async () => {
  const change = await verified();
  const result = await approveChange(deps, { changeId: change.id, actor: finance2, comment: "Rückruf dokumentiert" });
  assert.equal(result.change.state, "APPROVED");
  assert.equal(result.change.decided_by, USERS.finance2);
  assert.deepEqual(
    await accounts(),
    [
      { iban: NEW_IBAN, status: "ACTIVE", trusted_by_change_id: change.id },
      { iban: S1_IBAN, status: "ACTIVE", trusted_by_change_id: null },
    ],
    "added, not replaced: the old account stays trusted",
  );
  assert.deepEqual(
    (await events(change.id)).map((e) => [e.action, e.to_state]),
    [
      ["proposed", "PROPOSED"],
      ["verified", "VERIFIED"],
      ["approved", "APPROVED"],
    ],
  );
});

test("approving twice by the same person changes nothing; by another is refused", async () => {
  const change = await verified();
  await approveChange(deps, { changeId: change.id, actor: finance2 });
  const replay = await approveChange(deps, { changeId: change.id, actor: finance2 });
  assert.equal(replay.replayed, true);
  await assert.rejects(approveChange(deps, { changeId: change.id, actor: cfo }), refusal("CHANGE_STATE_CONFLICT"));
  assert.equal((await accounts()).length, 2);
});

test("two approvers at once leave one trusted account and one approval", async () => {
  const change = await verified();
  const results = await Promise.allSettled([
    approveChange(deps, { changeId: change.id, actor: finance2 }),
    approveChange(deps, { changeId: change.id, actor: cfo }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.code, "CHANGE_STATE_CONFLICT");
  assert.equal((await accounts()).length, 2);
  assert.equal((await events(change.id)).filter((e) => e.action === "approved").length, 1);
});

test("master data that moved after the proposal invalidates the approval", async () => {
  const change = await verified();
  await deps.pool.query("insert into finops.supplier_bank_accounts (supplier_id, iban) values ($1, 'DE02300209000106531065')", [S1]);
  await assert.rejects(approveChange(deps, { changeId: change.id, actor: finance2 }), refusal("MASTER_DATA_CHANGED"));
});

test("a supplier blocked after the proposal gets no new account", async () => {
  const change = await verified();
  await deps.pool.query("update finops.suppliers set status = 'BLOCKED' where id = $1", [S1]);
  try {
    await assert.rejects(approveChange(deps, { changeId: change.id, actor: finance2 }), refusal("SUPPLIER_NOT_ACTIVE_FOR_CHANGE"));
  } finally {
    await deps.pool.query("update finops.suppliers set status = 'ACTIVE' where id = $1", [S1]);
  }
});

test("evidence bound to another proposal does not approve this one", async () => {
  const change = await verified();
  await deps.pool.query("update finops.bank_change_verifications set proposal_sha256 = repeat('b', 64) where change_id = $1", [change.id]);
  await assert.rejects(approveChange(deps, { changeId: change.id, actor: finance2 }), refusal("EVIDENCE_MISMATCH"));
});

test("a proposal altered after verification does not approve", async () => {
  const change = await verified();
  await deps.pool.query("update finops.bank_account_changes set proposed_iban = 'DE02300209000106531065' where id = $1", [change.id]);
  await assert.rejects(approveChange(deps, { changeId: change.id, actor: finance2 }), refusal("EVIDENCE_MISMATCH"));
  assert.equal((await accounts()).length, 1);
});

test("an IBAN shared with another supplier is approved only when the approver says they saw it", async () => {
  const { change } = await proposeChange(deps, { supplierId: S2, iban: S1_IBAN, reason: "Factoring über Hausbank", actor: clerk });
  await verifyChange(deps, { changeId: change.id, actor: finance, ...confirmation({ ibanReadBack: S1_IBAN }) });
  await assert.rejects(approveChange(deps, { changeId: change.id, actor: finance2 }), refusal("SHARED_IBAN_NOT_ACKNOWLEDGED"));
  const result = await approveChange(deps, { changeId: change.id, actor: finance2, acknowledgeSharedIban: true });
  assert.equal(result.change.state, "APPROVED");
  const approved = (await events(change.id)).find((e) => e.action === "approved");
  assert.deepEqual(
    approved.evidence.shared_with.map((s) => s.supplier_no),
    ["S-1001"],
  );
  assert.equal(approved.evidence.shared_iban_acknowledged, true);
});

// ------------------------------------------------------- reject, cancel ---

test("a rejected change never writes master data", async () => {
  const change = await verified();
  await assert.rejects(rejectChange(deps, { changeId: change.id, actor: finance2, comment: "" }), refusal("REASON_REQUIRED"));
  await assert.rejects(rejectChange(deps, { changeId: change.id, actor: clerk, comment: "doch nicht" }), refusal("PROPOSER_CANNOT_DECIDE"));
  const result = await rejectChange(deps, { changeId: change.id, actor: finance2, comment: "Schreiben wirkt gefälscht" });
  assert.equal(result.change.state, "REJECTED");
  await assert.rejects(approveChange(deps, { changeId: change.id, actor: cfo }), refusal("CHANGE_STATE_CONFLICT"));
  assert.deepEqual(
    (await accounts()).map((a) => a.iban),
    [S1_IBAN],
  );
});

test("only the proposer cancels, and a cancelled change never writes master data", async () => {
  const change = await verified();
  await assert.rejects(cancelChange(deps, { changeId: change.id, actor: finance2, comment: "x" }), refusal("ONLY_PROPOSER_CAN_CANCEL"));
  const result = await cancelChange(deps, { changeId: change.id, actor: clerk, comment: "Tippfehler im Vorschlag" });
  assert.equal(result.change.state, "CANCELLED");
  await assert.rejects(approveChange(deps, { changeId: change.id, actor: finance2 }), refusal("CHANGE_STATE_CONFLICT"));
  assert.deepEqual(
    (await accounts()).map((a) => a.iban),
    [S1_IBAN],
  );
  const again = await propose();
  assert.equal(again.created, true, "a cancelled change no longer blocks a corrected proposal");
});

test("an unknown change is a 404", async () => {
  await assert.rejects(
    approveChange(deps, { changeId: "00000000-0000-0000-0000-00000000dead", actor: finance2 }),
    refusal("CHANGE_NOT_FOUND"),
  );
});
