// Renders every slide of a deck to PNG at 1920x1080 and warns when text in a
// slide reaches into the bottom band where the chapter progress sits.
import { mkdirSync } from "node:fs";
import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";

const [file, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const b = await chromium.launch({ channel: "chrome" });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`file://${file}#1`);
await page.waitForTimeout(800);
const count = await page.locator("section.slide").count();
for (let i = 1; i <= count; i++) {
  await page.keyboard.press(i === 1 ? "Home" : "ArrowRight");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${outDir}/s${String(i).padStart(2, "0")}.png` });
  const low = await page.evaluate(() => {
    const slide = document.querySelector("section.slide.active");
    const out = [];
    for (const el of slide.querySelectorAll("*")) {
      if (el.closest(".foot")) continue;
      if (![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
      const r = el.getBoundingClientRect();
      if (r.height && r.bottom > 980) out.push(`"${el.textContent.trim().slice(0, 40)}" bottom=${Math.round(r.bottom)}`);
    }
    return out;
  });
  for (const l of low) console.log(`slide ${i}: low/overflow ${l}`);
}
console.log("slides:", count);
await b.close();
