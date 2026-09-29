/**
 * Numeric settings are checked when the process starts (ADR-073). A typo such
 * as SESSION_HOURS=zwoelf became NaN; the server started, and every sign-in
 * then failed with a 500 on an invalid expiry date.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { envNumber } from "./env.js";

test("an unset setting takes its default", () => {
  assert.equal(envNumber("SESSION_HOURS", 12, {}, {}), 12);
  assert.equal(envNumber("SESSION_HOURS", 12, {}, { SESSION_HOURS: "" }), 12);
});

test("a valid setting is used", () => {
  assert.equal(envNumber("SESSION_HOURS", 12, {}, { SESSION_HOURS: "8" }), 8);
});

test("a setting that is not a number in range stops the start, naming it", () => {
  for (const raw of ["zwoelf", "0", "-3", "1e400"]) {
    assert.throws(() => envNumber("SESSION_HOURS", 12, { min: 1 }, { SESSION_HOURS: raw }), /SESSION_HOURS/, raw);
  }
  assert.throws(() => envNumber("API_PORT", 4400, { min: 1, max: 65535 }, { API_PORT: "70000" }), /API_PORT/);
});
