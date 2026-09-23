/**
 * An expired session, as the client sees it. Every page caught its own errors,
 * so a request the server refused for want of a session showed as empty data
 * ("Noch kein Kontoauszug importiert") rather than as being signed out.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { getInvoice, login, onSignedOut } from "./api.js";

globalThis.document = { cookie: "" };
const answer = (status, body) => {
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status });
};

let calls;
beforeEach(() => {
  calls = 0;
  onSignedOut(() => calls++);
});

test("a request refused for want of a session reports that the user is signed out", async () => {
  answer(401, { error: "Nicht angemeldet", code: "NOT_SIGNED_IN" });
  await assert.rejects(() => getInvoice("x"), { code: "NOT_SIGNED_IN" });
  assert.equal(calls, 1);
});

test("a wrong password is a refused sign-in, not an ended session", async () => {
  answer(401, { error: "E-Mail-Adresse oder Passwort ist falsch", code: "SIGN_IN_REFUSED" });
  await assert.rejects(() => login("a@b", "x"), { code: "SIGN_IN_REFUSED" });
  assert.equal(calls, 0);
});

test("any other refusal leaves the session alone", async () => {
  answer(403, { error: "Rolle darf das nicht", code: "ROLE_NOT_PERMITTED" });
  await assert.rejects(() => getInvoice("x"), { code: "ROLE_NOT_PERMITTED" });
  assert.equal(calls, 0);
});
