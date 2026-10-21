// Submits one synthetic XRechnung through the n8n form of the test copy and
// prints what the form answers. Usage: node submit_form.mjs <formUrl> <file> <screenshot>
import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";

const [formUrl, file, shot] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const page = await b.newPage({ viewport: { width: 1100, height: 900 } });
await page.goto(formUrl, { waitUntil: "networkidle" });
await page.setInputFiles('input[type="file"]', file);
const t0 = Date.now();
await page.getByRole("button", { name: "Rechnung einreichen" }).click();
await page.waitForFunction(() => /Rechnung wurde verarbeitet|Problem|error|Fehler/i.test(document.body.innerText), null, { timeout: 90000 })
  .catch(() => console.log("no recognisable answer within 90 s"));
await page.waitForTimeout(500);
console.log(`answer after ${Date.now() - t0} ms:`, (await page.locator("body").innerText()).replace(/\s+/g, " ").trim().slice(0, 300));
await page.screenshot({ path: shot, fullPage: true });
await b.close();
