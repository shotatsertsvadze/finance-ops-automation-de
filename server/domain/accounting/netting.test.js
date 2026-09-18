/**
 * Choosing which credits reduce a payment.
 *
 * The rule has to be deterministic, because the alternative is that the same
 * invoice is paid a different amount depending on row order. Oldest credit
 * first, and never more than the invoice itself.
 *
 * Pure function over already-loaded rows, so the ordering and the arithmetic
 * can be tested without a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planNetting } from "./netting.js";

const credit = (id, amount, issueDate, open = amount) =>
  ({ id, gross_amount: amount, issue_date: issueDate, invoice_number: id, open_amount: open });

test("no credits leaves the payment alone", () => {
  const plan = planNetting("1428.00", []);
  assert.equal(plan.payableCents, 142800);
  assert.deepEqual(plan.applications, []);
});

test("one credit reduces the payment by its amount", () => {
  const plan = planNetting("1428.00", [credit("GS-1", "200.00", "2026-09-01")]);
  assert.equal(plan.payableCents, 122800);
  assert.deepEqual(plan.applications, [{ creditNoteId: "GS-1", amountCents: 20000 }]);
});

test("the oldest credit is used first, whatever order the rows arrive in", () => {
  const rows = [
    credit("GS-NEW", "100.00", "2026-09-10"),
    credit("GS-OLD", "100.00", "2026-08-01"),
  ];
  assert.deepEqual(planNetting("150.00", rows).applications, [
    { creditNoteId: "GS-OLD", amountCents: 10000 },
    { creditNoteId: "GS-NEW", amountCents: 5000 },
  ]);
  // Same rows, other order: the plan must not change.
  assert.deepEqual(planNetting("150.00", [...rows].reverse()).applications,
    planNetting("150.00", rows).applications);
});

test("two credits issued the same day are ordered by number, not by chance", () => {
  const rows = [credit("GS-B", "50.00", "2026-09-01"), credit("GS-A", "50.00", "2026-09-01")];
  assert.deepEqual(planNetting("500.00", rows).applications.map((a) => a.creditNoteId), ["GS-A", "GS-B"]);
});

test("a credit larger than the invoice is only partly used", () => {
  const plan = planNetting("100.00", [credit("GS-1", "500.00", "2026-09-01")]);
  assert.equal(plan.payableCents, 0);
  assert.deepEqual(plan.applications, [{ creditNoteId: "GS-1", amountCents: 10000 }]);
});

test("a partly used credit offers only what is left of it", () => {
  const plan = planNetting("1000.00", [credit("GS-1", "500.00", "2026-09-01", "120.00")]);
  assert.equal(plan.payableCents, 88000);
  assert.deepEqual(plan.applications, [{ creditNoteId: "GS-1", amountCents: 12000 }]);
});

test("credits stop being applied once the invoice is covered", () => {
  const rows = [
    credit("GS-1", "600.00", "2026-08-01"),
    credit("GS-2", "600.00", "2026-08-02"),
    credit("GS-3", "600.00", "2026-08-03"),
  ];
  const plan = planNetting("1000.00", rows);
  assert.equal(plan.payableCents, 0);
  assert.deepEqual(plan.applications.map((a) => a.creditNoteId), ["GS-1", "GS-2"]);
  assert.equal(plan.applications[1].amountCents, 40000, "the second is used only up to what is left");
});

test("a credit with nothing left is not applied at all", () => {
  const plan = planNetting("1000.00", [credit("GS-1", "500.00", "2026-09-01", "0.00")]);
  assert.deepEqual(plan.applications, []);
  assert.equal(plan.payableCents, 100000);
});

test("an unreadable amount is not netted against", () => {
  // Fail closed: a credit whose balance cannot be read is not silently zero,
  // and not silently applied either.
  assert.deepEqual(planNetting("1000.00", [credit("GS-1", "x", "2026-09-01", "x")]).applications, []);
  assert.equal(planNetting("x", [credit("GS-1", "100.00", "2026-09-01")]).payableCents, null);
});
