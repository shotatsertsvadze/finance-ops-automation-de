// The deck as a 16-page PDF at slide size, from its print view (?print).
import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`file://${process.argv[2]}?print`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: process.argv[3], width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
await browser.close();
