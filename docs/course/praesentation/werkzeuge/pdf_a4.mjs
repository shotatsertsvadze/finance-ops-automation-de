import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
await page.goto(`file://${process.argv[2]}`, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: process.argv[3], preferCSSPageSize: true, printBackground: true });
await browser.close();
