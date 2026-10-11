/**
 * A missing invoice is a 404 with a code, not a crash. The query is faked so
 * the refusal path runs without a database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NotFoundError } from "../errors.js";
import { recordEvent, SYSTEM, transition } from "./transitions.js";

const noRows = { query: async () => ({ rows: [] }) };

test("a transition on an unknown invoice is refused as not found", async () => {
  await assert.rejects(
    transition(noRows, { invoiceId: "missing", to: "VALIDATING", actor: SYSTEM, action: "processing_started" }),
    (e) => e instanceof NotFoundError && e.status === 404 && e.code === "INVOICE_NOT_FOUND",
  );
});

test("an event on an unknown invoice is refused as not found", async () => {
  await assert.rejects(
    recordEvent(noRows, { invoiceId: "missing", actor: SYSTEM, action: "note" }),
    (e) => e instanceof NotFoundError && e.status === 404 && e.code === "INVOICE_NOT_FOUND",
  );
});
