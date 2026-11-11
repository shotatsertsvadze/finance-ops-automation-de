/**
 * The three-minute demo, driven end to end.
 *
 * Two jobs. Rehearsal: run it headed and talk over it until the narration in
 * `docs/DEMO_VIDEO.md` fits. Recording: run it with DEMO_VIDEO=1 and Playwright
 * writes a silent .webm of exactly this path.
 *
 * It clicks only what the storyboard shows and then waits, so each beat lasts
 * as long as its narration needs. No business logic is involved: this drives
 * the same UI a person would, against the seeded demo data.
 *
 * Playwright is already a development dependency (ADR-046); nothing new is
 * added for this.
 */
import { chromium } from "playwright";
import { mkdir, rm, rename } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.DEMO_BASE ?? "http://localhost:5400";
const RECORD = process.env.DEMO_VIDEO === "1";
const OUT = process.env.DEMO_OUT ?? "demo-video";
// A rehearsal at full speed is hard to talk over; 0.5 halves every pause.
const SPEED = Number(process.env.DEMO_SPEED ?? 1);

const beats = [];
let startedAt = 0;

/**
 * Announces a beat at its real position in the recording, then holds the
 * screen for `seconds` so the narration fits. The mark is measured rather
 * than assumed: page loads and uploads add time the scripted pauses do not
 * know about, and the storyboard has to match the video a presenter talks over.
 */
async function beat(page, title, cue, seconds) {
  const at = mmss((Date.now() - startedAt) / 1000);
  beats.push({ at, title, seconds });
  process.stdout.write(`${at}  ${title}\n        ${cue}\n`);
  await page.waitForTimeout(Math.round(seconds * 1000 * SPEED));
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

async function main() {
  // A previous run's file would otherwise sit beside this one with a hashed
  // name, and picking the right one afterwards is guesswork.
  if (RECORD) {
    await rm(OUT, { recursive: true, force: true });
    await mkdir(OUT, { recursive: true });
  }

  const browser = await chromium.launch({ headless: RECORD ? true : false });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    ...(RECORD ? { recordVideo: { dir: OUT, size: { width: 1440, height: 900 } } } : {}),
  });
  const page = await context.newPage();

  // --- setup, before the recording matters -------------------------------
  startedAt = Date.now();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: "anna.berger@nordwerk.example" }).click();
  await page.locator('input[type="password"]').fill("nordwerk-demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForSelector("nav a");

  // Fixture B is only a manual-review case the first time it arrives; on a
  // second run against the same data it is a duplicate and the whole point of
  // the demo disappears. Fail here, clearly, rather than timing out later.
  // Waited for a row first: the counts arrive after the page mounts, and
  // reading them too early reports zero.
  await page.waitForSelector("table tbody tr");
  const count = (await page.locator("main").innerText()).match(/(\d+)\s+invoices/i)?.[1];
  if (count !== "70") {
    throw new Error(
      `The demo data is not in its starting state (inbox shows ${count ?? "?"} invoices, expected 70).\n` + "Run: npm run demo:reset",
    );
  }
  await page.waitForTimeout(800);

  // --- 0:00 the problem ---------------------------------------------------
  await beat(
    page,
    "Inbox — the framing",
    "70 invoices, every one arrived as an XRechnung. The counts on the left are work waiting for a person.",
    22,
  );

  // --- 0:25 a clean invoice ----------------------------------------------
  await page.locator("input[type=file]").setInputFiles("fixtures/xrechnung/G_clean_380.xml");
  await page.waitForSelector("text=/processed/", { timeout: 10000 });
  await page.waitForTimeout(600);
  await beat(
    page,
    "Upload a clean invoice — it lands Approved",
    "Straight through: validated against master data, inside the approval limit, no human step.",
    17,
  );

  await page
    .getByRole("link", { name: /INV-2026-00433/ })
    .first()
    .click();
  await page.waitForSelector("text=Check trail");
  await beat(
    page,
    "Its check trail — 23 checks, nothing to report",
    "Every check it passed is recorded, not just the ones that failed.",
    13,
  );

  // --- 1:00 the IBAN mismatch, the moment --------------------------------
  await page.getByRole("link", { name: /Inbox/ }).first().click();
  await page.waitForSelector("input[type=file]", { state: "attached" });
  await page.locator("input[type=file]").setInputFiles("fixtures/xrechnung/B_iban_changed_2499.xml");
  await page.waitForSelector("text=/processed/", { timeout: 10000 });
  await page.waitForTimeout(600);
  await beat(
    page,
    "Same control, opposite outcome — Manual review",
    "This one says pay a different bank account than our master data. It stopped itself.",
    15,
  );

  await page
    .getByRole("link", { name: /HL-2026-7731/ })
    .first()
    .click();
  await page.waitForSelector("text=What is blocking");
  await beat(page, "What is blocking", "It does not say suspicious. It says which check failed and why processing stopped.", 10);

  await page.locator(".ev.is-failed").first().scrollIntoViewIfNeeded();
  await beat(
    page,
    "The evidence — expected vs found, differing characters marked",
    "Expected the approved account, found another, with the characters that differ marked. Seconds, not an eye test.",
    18,
  );

  // --- 1:50 the human decision and the trail -----------------------------
  // The decision panel's reason; the bank-account panel has one of its own.
  await page
    .locator(".panel")
    .filter({ hasText: "Your decision" })
    .getByRole("textbox", { name: /reason/i })
    .fill("Call back the supplier on the number in our master data.");
  await beat(
    page,
    "A person decides, and states why",
    "A new bank account cannot be waved through. The way on is a call-back and verified master data.",
    8,
  );

  await page.getByRole("button", { name: "Request information" }).click();
  await page.waitForSelector("text=/waiting for an answer/i");
  await beat(
    page,
    "Fail closed on the money",
    "Verified, it is checked again, needs a second signature, and the payment re-checks the account. Enforced on the server.",
    11,
  );

  await page.locator(".panel").filter({ hasText: "History" }).first().scrollIntoViewIfNeeded();
  await beat(
    page,
    "The audit trail",
    "Every state change, who made it and on what grounds — written in the same transaction as the change.",
    11,
  );

  // --- 2:25 the numbers ---------------------------------------------------
  await page.getByRole("link", { name: "Metrics" }).click();
  await page.waitForSelector("text=Straight-through processing");
  await beat(
    page,
    "Operational KPIs",
    "Straight-through rate, exception rate, where time goes — computed from the invoices and their check trail.",
    17,
  );

  // --- 2:45 the honest close ---------------------------------------------
  await page
    .locator(".panel")
    .filter({ hasText: /Modelled savings potential/i })
    .first()
    .scrollIntoViewIfNeeded();
  await beat(
    page,
    "Limitations, on screen",
    "A scenario on stated assumptions, not a measured saving. Proof of concept, synthetic data, no compliance claim.",
    12,
  );

  await page.waitForTimeout(500);

  // The path is only final once the context closes and the file is flushed.
  const recording = RECORD ? await page.video()?.path() : null;
  await context.close();
  await browser.close();

  process.stdout.write(`\nbeats: ${beats.length}, recorded length ${mmss((Date.now() - startedAt) / 1000)}\n`);
  if (recording) {
    const named = path.join(OUT, "demo.webm");
    await rename(recording, named);
    process.stdout.write(`video: ${named}\n`);
    process.stdout.write("mp4 for sharing: npm run demo:mp4\n");
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
