/**
 * The KoSIT adapter against a stand-in HTTP server: what each answer, or its
 * absence, becomes. The adapter interprets transport only; what a report
 * means is the domain's (official-validation.js).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createKositClient, officialValidatorFromEnv } from "./kosit.js";

let server, url;
const seen = [];
let reply = (req, res) => res.end();

before(async () => {
  server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url, type: req.headers["content-type"], body: Buffer.concat(chunks) });
      reply(req, res);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const answer = (status, body = "<report/>") => (req, res) => {
  res.writeHead(status, { "Content-Type": "application/xml" });
  res.end(body);
};
const client = (timeoutMs = 2000) => createKositClient({ url, timeoutMs });

test("the original bytes are posted as XML, named after the document", async () => {
  reply = answer(200);
  const bytes = Buffer.from("<Invoice>ä</Invoice>");
  await client().validate(bytes, "inv-1");
  const last = seen.at(-1);
  assert.deepEqual([last.method, last.path, last.type], ["POST", "/inv-1.xml", "application/xml"]);
  assert.ok(last.body.equals(bytes), "byte for byte");
});

for (const [status, outcome] of [[200, "ACCEPTED"], [406, "REJECTED"], [422, "UNPROCESSABLE"], [500, "ERROR"], [400, "ERROR"]]) {
  test(`HTTP ${status} is ${outcome}, with the body kept as the report`, async () => {
    reply = answer(status, `<r s="${status}"/>`);
    const result = await client().validate(Buffer.from("<x/>"), "d");
    assert.equal(result.outcome, outcome);
    assert.equal(result.httpStatus, status);
    assert.equal(result.report, `<r s="${status}"/>`);
    assert.ok(result.durationMs >= 0);
  });
}

test("no answer within the timeout is TIMEOUT, not a verdict", async () => {
  reply = () => {}; // never answers
  const result = await client(150).validate(Buffer.from("<x/>"), "d");
  assert.equal(result.outcome, "TIMEOUT");
  assert.equal(result.report, null);
});

test("a body that stalls after the status line is TIMEOUT as well", async () => {
  reply = (req, res) => {
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.write("<rep:report>"); // and nothing more
  };
  const result = await client(150).validate(Buffer.from("<x/>"), "d");
  assert.equal(result.outcome, "TIMEOUT");
});

test("a validator that is not running is UNAVAILABLE", async () => {
  const probe = createServer();
  await new Promise((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const closedPort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const result = await createKositClient({ url: `http://127.0.0.1:${closedPort}`, timeoutMs: 1000 }).validate(Buffer.from("<x/>"), "d");
  assert.equal(result.outcome, "UNAVAILABLE");
  assert.ok(result.error);
});

test("configuration: no KOSIT_URL means no client; production requires one", () => {
  assert.deepEqual(officialValidatorFromEnv({}), { client: null, required: false });
  assert.deepEqual(officialValidatorFromEnv({ NODE_ENV: "production" }), { client: null, required: true });
  const configured = officialValidatorFromEnv({ KOSIT_URL: "http://127.0.0.1:8081", KOSIT_TIMEOUT_MS: "3000" });
  assert.equal(configured.client.url, "http://127.0.0.1:8081");
  assert.equal(configured.client.timeoutMs, 3000);
});

test("a timeout the database transaction could not outlast stops the start", () => {
  // The call is made inside the invoice's transaction, which the database
  // ends after 30 s idle (ADR-075).
  assert.throws(() => officialValidatorFromEnv({ KOSIT_URL: "http://x", KOSIT_TIMEOUT_MS: "25000" }), /KOSIT_TIMEOUT_MS/);
  assert.throws(() => officialValidatorFromEnv({ KOSIT_URL: "http://x", KOSIT_TIMEOUT_MS: "zehn" }), /KOSIT_TIMEOUT_MS/);
});
