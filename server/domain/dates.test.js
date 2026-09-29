/**
 * The business date (ADR-072). Bookings took their date from UTC, so between
 * midnight and 02:00 German summer time they were dated the day before, and
 * on New Year's night the year before.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { businessDate } from "./dates.js";

test("the business date is the date in Germany, not in UTC", () => {
  assert.equal(businessDate(new Date("2026-09-23T23:30:00Z")), "2026-09-24", "01:30 CEST");
  assert.equal(businessDate(new Date("2026-12-31T23:30:00Z")), "2027-01-01", "00:30 CET, a new year");
  assert.equal(businessDate(new Date("2026-09-23T21:59:00Z")), "2026-09-23", "23:59 CEST is still the same day");
});
