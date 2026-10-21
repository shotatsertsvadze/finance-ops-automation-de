// Screenshots slide 6 shortly after it becomes active, to see the branches draw in.
import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";
const [file, out] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`file://${file}#5`);
await page.waitForTimeout(800);
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(330);
await page.screenshot({ path: out });
console.log("active:", await page.evaluate(() => document.querySelector("section.slide.active h1").textContent));
await b.close();
