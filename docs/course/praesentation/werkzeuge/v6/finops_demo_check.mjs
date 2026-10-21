// Walks the Finance-Ops part of the live demo on the demo instance exactly as
// in LIVE_DEMO_DE.md: the three invoices arrive as from n8n (channel FORM),
// Spree IT is prepared beforehand, then Jonas and Tim click through.
// Prints states, labels and step times; saves screenshots. Never prints draft text.
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";

const [ui, api, out] = process.argv.slice(2);
const FIX = "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/fixtures/xrechnung/";
mkdirSync(out, { recursive: true });
process.on("uncaughtException", (e) => { console.log("Abbruch:", String(e.message).split("\n")[0].slice(0, 140)); process.exit(1); });

// Preparation through the API, as n8n (FORM) and as the morning preparation (UPLOAD).
const r = await fetch(`${api}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "anna.berger@nordwerk.example", password: "nordwerk-demo" }) });
const cookies = r.headers.getSetCookie().map((c) => c.split(";")[0]);
const csrf = cookies.find((c) => c.startsWith("finops_csrf=")).split("=")[1];
const upload = async (name, channel) => {
  const f = new FormData();
  f.append("file", new Blob([readFileSync(FIX + name)], { type: "application/xml" }), name);
  f.append("source_channel", channel);
  const res = await fetch(`${api}/api/invoices`, { method: "POST", headers: { cookie: cookies.join("; "), "x-csrf-token": csrf }, body: f });
  const j = await res.json();
  console.log(`prepared ${name.padEnd(26)} ${channel.padEnd(6)} -> ${j.invoice_number} ${j.state} ${j.routing?.decision ?? ""}`);
};
await upload("C_po_overrun_8500.xml", "UPLOAD");
for (const n of ["G_clean_380.xml", "A_clean_1240.xml", "B_iban_changed_2499.xml"]) await upload(n, "FORM");

const b = await chromium.launch({ channel: "chrome" });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => { console.log("   dialog:", d.message().slice(0, 80)); d.accept(); });
const t = () => Date.now();
const login = async (email) => {
  await page.goto(ui);
  await page.getByRole("button", { name: email }).click();
  await page.locator('input[type="password"]').fill("nordwerk-demo");
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.getByRole("link", { name: "Posteingang" }).first().waitFor();
};
const panel = page.locator('section[aria-label="Lieferantenrückfrage"]');

let t0 = t();
await login("jonas.weber@nordwerk.example");
console.log(`Jonas angemeldet (${t() - t0} ms)`);

t0 = t();
await page.getByText("HL-2026-7731").first().click();
await panel.waitFor();
await panel.scrollIntoViewIfNeeded();
console.log(`6 Havel geöffnet (${t() - t0} ms) | Knöpfe im Rückfrage-Panel: ${await panel.getByRole("button").count()} | Rückruf-Hinweis: ${(await panel.textContent()).includes("Rückruf unter der hinterlegten Nummer")}`);
await page.screenshot({ path: `${out}/6_havel.png` });

t0 = t();
await page.getByRole("link", { name: "Posteingang" }).first().click();
await page.getByText("SIT-2026-0918").first().click();
await panel.waitFor();
await panel.scrollIntoViewIfNeeded();
await page.getByRole("button", { name: "KI-Entwurf erstellen" }).click();
await panel.locator("textarea").waitFor({ timeout: 30000 });
const label = await panel.locator(".inquiry-editor .label").first().textContent();
console.log(`7 KI-Entwurf da (${t() - t0} ms) | Quelle: ${label} | offene Platzhalter: ${/\{\{/.test(await panel.locator("textarea").inputValue())}`);
await page.screenshot({ path: `${out}/7_ki_entwurf.png` });
const body = await panel.locator("textarea").inputValue();
await panel.locator("textarea").fill(`${body}\n\nVielen Dank für eine kurze Rückmeldung bis Freitag.`);
await page.getByRole("button", { name: "Text freigeben" }).click();
await panel.getByText("Freigegeben, noch nicht versendet").waitFor();
console.log(`7 freigegeben, noch nicht versendet (${t() - t0} ms gesamt)`);

t0 = t();
await page.getByRole("button", { name: "Abmelden" }).click();
await login("tim.kessler@nordwerk.example");
await page.getByRole("link", { name: /Freigaben/ }).first().click();
await page.getByText("INV-2026-00421").first().click();
await page.getByRole("button", { name: "Freigeben", exact: true }).click();
await page.getByText("Freigegeben").first().waitFor();
await page.waitForTimeout(800);
const state = await page.locator(".state, .badge-state, [class*=state]").first().textContent().catch(() => "?");
console.log(`8 Tim hat freigegeben (${t() - t0} ms) | Statusanzeige: ${state.trim()}`);
await page.screenshot({ path: `${out}/8_tim.png` });

console.log("Fehler im Browser:", errors);
await b.close();
