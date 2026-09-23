/**
 * Bad input is refused with a 400 that says what is wrong (ADR-073). A bank
 * line with a malformed amount or date reached Postgres and came back as a
 * 500, a numeric comment crashed on .trim(), and a 900 KB comment was written
 * into the audit trail whole.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "./app.js";
import { loginAs, testDeps } from "./test-support/db.js";

let deps, server, base, clients;
before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  clients = { clerk: await loginAs(base, "clerk"), finance: await loginAs(base, "finance") };
});
after(async () => {
  server.close();
  await deps.pool.end();
});

const line = (over) => ({ external_id: `TX-${Math.random()}`, value_date: "2026-09-20", amount: "-10.00", currency: "EUR", ...over });
const importLines = (transactions) => clients.finance.post("/api/bank/import", { transactions });

test("a bank line with a malformed amount or date is refused, naming the line and field", async () => {
  for (const [bad, field] of [[{ amount: "abc" }, "amount"], [{ value_date: "gestern" }, "value_date"], [{ currency: "euro" }, "currency"]]) {
    const res = await importLines([line(), line(bad)]);
    assert.equal(res.status, 400, field);
    const body = await res.json();
    assert.equal(body.code, "TRANSACTION_INVALID");
    assert.deepEqual(body.details.errors, [{ index: 1, field }]);
  }
  const { rows } = await deps.pool.query("select count(*)::int as n from finops.bank_transactions");
  assert.equal(rows[0].n, 0, "nothing of a refused statement is imported");
});

test("a comment must be text, and not longer than 1000 characters", async () => {
  const xml = readFileSync(new URL("../fixtures/xrechnung/B_iban_changed_2499.xml", import.meta.url));
  const invoice = await (await clients.clerk.upload(xml, "B.xml")).json();
  const reject = (comment) => clients.clerk.post(`/api/invoices/${invoice.id}/review/reject`, { comment });

  for (const comment of [5, { text: "x" }, "x".repeat(1001)]) {
    const res = await reject(comment);
    assert.equal(res.status, 400, JSON.stringify(comment).slice(0, 20));
    assert.equal((await res.json()).code, "COMMENT_INVALID");
  }
  assert.equal((await reject("x".repeat(1000))).status, 200, "exactly the limit is fine");
});

test("a body that is not JSON is a 400 with a code", async () => {
  const res = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "INVALID_JSON");
});
