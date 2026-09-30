import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidIban, normalizeIban } from "./iban.js";

test("an IBAN is compared without spaces and in capitals", () => {
  assert.equal(normalizeIban(" de89 3704 0044 0532 0130 00 "), "DE89370400440532013000");
  assert.equal(normalizeIban(null), null);
});

test("the seeded and fixture IBANs pass the ISO 13616 check digits", () => {
  for (const iban of ["DE89370400440532013000", "DE02120300000000202051", "DE75512108001245126199", "DE02300209000106531065"]) {
    assert.equal(isValidIban(iban), true, iban);
  }
});

test("one wrong digit fails the check digits", () => {
  assert.equal(isValidIban("DE89370400440532013001"), false);
});

test("anything that is not IBAN-shaped is refused, not normalised into one", () => {
  for (const value of ["", "DE89", "89DE370400440532013000", "DE89-3704-0044-0532-0130-00", "DE8937040044053201300ö"]) {
    assert.equal(isValidIban(value), false, value);
  }
});
