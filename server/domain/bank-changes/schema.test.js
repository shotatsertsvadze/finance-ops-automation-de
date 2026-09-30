/**
 * What the database itself refuses for a bank-account change (ADR-077), so a
 * bug in the domain, or a hand-written statement, cannot seat the proposer as
 * verifier or approve without a second and third person.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { USERS, testDeps } from "../../test-support/db.js";

const S1 = "10000000-0000-0000-0000-000000000001";
const S2 = "10000000-0000-0000-0000-000000000002";
const NEW_IBAN = "DE75512108001245126199";
let deps;

before(async () => {
  deps = await testDeps();
});
after(() => deps.pool.end());
beforeEach(async () => {
  await deps.pool.query("update finops.supplier_bank_accounts set trusted_by_change_id = null");
  await deps.pool.query("delete from finops.bank_account_changes");
});

function insertChange(fields = {}) {
  const row = {
    supplier_id: S1, proposed_iban: NEW_IBAN, trusted_ibans: ["DE89370400440532013000"], reason: "Neue Bankverbindung",
    proposal_sha256: "a".repeat(64), required_distinct_actors: 3, proposed_by: USERS.clerk, ...fields,
  };
  const columns = Object.keys(row);
  return deps.pool.query(
    `insert into finops.bank_account_changes (${columns.join(", ")}) values (${columns.map((_, i) => `$${i + 1}`).join(", ")}) returning *`,
    Object.values(row),
  );
}

const anyAccount = async (supplierId) =>
  (await deps.pool.query("select id from finops.supplier_bank_accounts where supplier_id = $1 limit 1", [supplierId])).rows[0].id;

test("the proposer cannot be recorded as verifier", async () => {
  await assert.rejects(
    insertChange({ state: "VERIFIED", verified_by: USERS.clerk, verified_at: new Date() }),
    /bank_change_verifier_not_proposer/,
  );
});

test("an approval by the verifier is refused under the three-person policy", async () => {
  await assert.rejects(
    insertChange({
      state: "APPROVED", verified_by: USERS.finance, verified_at: new Date(),
      decided_by: USERS.finance, decided_at: new Date(), bank_account_id: await anyAccount(S1),
    }),
    /bank_change_state_fields/,
  );
});

test("an approval by the proposer is refused", async () => {
  await assert.rejects(
    insertChange({
      state: "APPROVED", verified_by: USERS.finance, verified_at: new Date(),
      decided_by: USERS.clerk, decided_at: new Date(), bank_account_id: await anyAccount(S1),
    }),
    /bank_change_state_fields/,
  );
});

test("an approval without verification, or without the account it added, is refused", async () => {
  const approved = { state: "APPROVED", decided_by: USERS.finance2, decided_at: new Date() };
  await assert.rejects(insertChange({ ...approved, bank_account_id: await anyAccount(S1) }), /bank_change_state_fields/);
  await assert.rejects(
    insertChange({ ...approved, verified_by: USERS.finance, verified_at: new Date() }),
    /bank_change_state_fields/,
  );
});

test("a rejection needs a reason and someone other than the proposer", async () => {
  const rejected = { state: "REJECTED", decided_at: new Date() };
  await assert.rejects(insertChange({ ...rejected, decided_by: USERS.clerk, decision_reason: "nein" }), /bank_change_state_fields/);
  await assert.rejects(insertChange({ ...rejected, decided_by: USERS.finance }), /bank_change_state_fields/);
  await insertChange({ ...rejected, decided_by: USERS.finance, decision_reason: "Rückruf negativ" });
});

test("a supplier has at most one open change", async () => {
  await insertChange();
  await assert.rejects(insertChange({ proposed_iban: "DE02300209000106531065" }), /one_open_per_supplier/);
  await insertChange({ supplier_id: S2 });
});

test("a decided change no longer blocks a new proposal", async () => {
  const { rows: [first] } = await insertChange();
  await deps.pool.query(
    "update finops.bank_account_changes set state = 'CANCELLED', decided_by = proposed_by, decided_at = now(), decision_reason = 'Tippfehler' where id = $1",
    [first.id],
  );
  await insertChange();
});

test("one IBAN may be trusted for two suppliers, but only once per supplier", async () => {
  // Factoring and group treasury pay several suppliers into one account, so
  // cross-supplier uniqueness is a warning in the domain, not an invariant.
  const shared = "DE89370400440532013000";
  await deps.pool.query("insert into finops.supplier_bank_accounts (supplier_id, iban) values ($1, $2)", [S2, shared]);
  await assert.rejects(
    deps.pool.query("insert into finops.supplier_bank_accounts (supplier_id, iban) values ($1, $2)", [S1, shared]),
    /supplier_bank_accounts_supplier_id_iban_key/,
  );
  await deps.pool.query("delete from finops.supplier_bank_accounts where supplier_id = $1 and iban = $2", [S2, shared]);
});
