/**
 * Purchase-order capacity as a commitment ledger.
 *
 * The defect this closes: two invoices that each fit inside the remaining
 * amount both approved, because the amount was never consumed. A purchase
 * order is a spending limit, so what matters is the sum of what is live
 * against it, not each invoice on its own.
 *
 * PO-2026-0102 opens with 500,00 EUR remaining and a tolerance of
 * max(2 %, 10,00) = 10,00, so the ceiling for all live commitments is 510,00.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../app.js";
import { loginAs, testDeps } from "../../test-support/db.js";
import { buildInvoiceXml } from "../../test-support/invoice-xml.js";

let deps, server, base, clients;

const PO = "PO-2026-0102";
let counter = 0;
const nextNumber = () => `PO-TEST-${Date.now()}-${(counter += 1)}`;

async function uploadFor(netCents, { po = PO, client } = {}) {
  const number = nextNumber();
  const xml = buildInvoiceXml({ number, netCents, po });
  const res = await (client ?? clients.clerk).upload(xml, `${number}.xml`);
  assert.equal(res.status, 201, `upload ${number}`);
  return res.json();
}

const get = (id) => clients.clerk.get(`/api/invoices/${id}`).then((r) => r.json());
const poCheck = (invoice) => invoice.validation.business.find((c) => c.check_code === "po_amount_within_tolerance");

async function activeCommitmentCents() {
  const { rows: [row] } = await deps.pool.query(
    `select coalesce(sum(c.amount), 0)::text as total
     from finops.po_commitments c
     join finops.purchase_orders p on p.id = c.purchase_order_id
     where p.po_number = $1 and c.status = 'ACTIVE'`,
    [PO],
  );
  return Math.round(Number(row.total) * 100);
}

before(async () => {
  deps = await testDeps();
  server = createApp(deps).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  clients = {
    clerk: await loginAs(base, "clerk"),
    manager: await loginAs(base, "manager"),
    manager2: await loginAs(base, "manager2"),
    finance: await loginAs(base, "finance"),
  };
});
after(async () => {
  server.close();
  await deps.pool.end();
});
beforeEach(async () => {
  await deps.pool.query("delete from finops.invoices");
});

test("a single invoice inside the remaining amount still passes", async () => {
  const invoice = await uploadFor(31933);
  assert.equal(poCheck(invoice).status, "PASSED");
  assert.notEqual(invoice.state, "REVIEW_REQUIRED");
  assert.equal(await activeCommitmentCents(), 31933, "it now holds capacity");
});

test("a second invoice that would exceed the order together with the first is stopped", async () => {
  const first = await uploadFor(31933);
  assert.equal(poCheck(first).status, "PASSED");

  const second = await uploadFor(31933);
  assert.equal(second.state, "REVIEW_REQUIRED");
  assert.equal(second.review_reason, "PO_AMOUNT_WITHIN_TOLERANCE");
  assert.equal(poCheck(second).status, "FAILED");
  assert.equal(await activeCommitmentCents(), 31933, "the stopped invoice holds nothing");
});

test("the evidence names what is still available, not the opening balance", async () => {
  await uploadFor(31933);
  const second = await uploadFor(31933);
  const check = poCheck(second);
  assert.match(check.expected, /180\.67|190\.67/, `available should be reported: ${check.expected}`);
  assert.match(check.actual, /319\.33/);
});

test("tolerance applies to the whole order, not to each invoice", async () => {
  // 260 + 260 = 520 > 510. Each invoice on its own is within tolerance, so a
  // per-invoice check would let both through and drift the order by 20,00.
  const first = await uploadFor(26000);
  assert.equal(poCheck(first).status, "PASSED");

  const second = await uploadFor(26000);
  assert.equal(poCheck(second).status, "FAILED", "tolerance must not be granted twice");
});

test("rejecting an invoice gives its capacity back", async () => {
  // 450,00 net is 535,50 gross, above the auto-approve limit, so the invoice
  // waits for a person and can still be rejected.
  const first = await uploadFor(45000);
  const blocked = await uploadFor(45000);
  assert.equal(blocked.state, "REVIEW_REQUIRED");

  const rejected = await clients.clerk.post(`/api/invoices/${first.id}/review/reject`, { comment: "doppelt beauftragt" });
  // The first invoice may already be past review, so reject it wherever it is.
  if (rejected.status !== 200) {
    const step = (await get(first.id)).approval_steps.find((s) => s.status === "PENDING");
    if (step) {
      await clients.manager.post(`/api/invoices/${first.id}/approvals/${step.step_no}/reject`, { comment: "doppelt beauftragt" });
    }
  }
  assert.equal(await activeCommitmentCents(), 0, "a rejected invoice holds no capacity");

  const third = await uploadFor(45000);
  assert.equal(poCheck(third).status, "PASSED", "the freed capacity is usable again");
});

test("requesting information releases capacity while the question is open", async () => {
  const first = await uploadFor(45000);
  assert.equal((await get(first.id)).state, "READY_FOR_APPROVAL");
  assert.equal(await activeCommitmentCents(), 45000);

  await clients.clerk.post(`/api/invoices/${first.id}/review/request-info`, { comment: "Bestellung klären" });
  assert.equal((await get(first.id)).state, "INFO_REQUESTED");
  assert.equal(await activeCommitmentCents(), 0);
});

test("re-validating an invoice does not commit its amount twice", async () => {
  const invoice = await uploadFor(45000);
  assert.equal(await activeCommitmentCents(), 45000);

  await clients.clerk.post(`/api/invoices/${invoice.id}/review/request-info`, { comment: "Rückfrage" });
  await clients.clerk.post(`/api/invoices/${invoice.id}/info-received`, { comment: "geklärt" });
  await clients.clerk.post(`/api/invoices/${invoice.id}/reprocess`, {});

  assert.equal(await activeCommitmentCents(), 45000, "one invoice, one commitment");
});

test("capacity stays held all the way through the money path", async () => {
  const invoice = await uploadFor(31933);
  const step = (await get(invoice.id)).approval_steps.find((s) => s.status === "PENDING");
  if (step) await clients.manager.post(`/api/invoices/${invoice.id}/approvals/${step.step_no}/approve`, {});

  for (const stage of ["accounting-record", "payment", "payment/confirm"]) {
    const res = await clients.finance.post(`/api/invoices/${invoice.id}/${stage}`, {});
    assert.equal(res.status, 200, stage);
  }
  assert.equal((await get(invoice.id)).state, "PAID");
  assert.equal(await activeCommitmentCents(), 31933, "a paid invoice has consumed the order, not released it");
});

test("two invoices arriving at the same time cannot both take the last of the order", async () => {
  // Each fits alone; together they do not. Without a lock on the order both
  // read the same availability and both commit.
  const [a, b] = await Promise.all([uploadFor(30000), uploadFor(30000)]);
  const states = [a.state, b.state];
  const approvedish = states.filter((s) => s !== "REVIEW_REQUIRED");

  assert.equal(approvedish.length, 1, `exactly one may proceed, got ${JSON.stringify(states)}`);
  assert.equal(await activeCommitmentCents(), 30000);
});

test("an invoice against a different order is unaffected", async () => {
  await uploadFor(31933);
  const other = await uploadFor(50000, { po: "PO-2026-0101" }); // opens with 1.500,00
  assert.equal(poCheck(other).status, "PASSED");
});

test("the invoice detail reports available capacity, not the opening balance", async () => {
  const first = await uploadFor(31933);
  const second = await uploadFor(10000);

  const detail = await get(second.id);
  assert.equal(detail.po_number, PO);
  // 500,00 opening less the 319,33 held by the first invoice, and the invoice's
  // own commitment is excluded from its own view.
  assert.equal(Number(detail.po_available_amount), 180.67);

  const firstDetail = await get(first.id);
  assert.equal(Number(firstDetail.po_available_amount), 400.00, "its own hold is not subtracted from itself");
});
