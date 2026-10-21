// Checks the v6 deck: jumps by number and V, End, the reserve labels in the
// speaker view, keys sent from the speaker view, and the speaker font size on
// the live-demo slide at two window sizes.
import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";

const file = process.argv[2];
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`file://${file}#1`);
await page.waitForTimeout(500);
const at = () => page.evaluate(() => location.hash);
const press = async (...keys) => { for (const k of keys) await page.keyboard.press(k); await page.waitForTimeout(150); };

await press("8", "Enter"); console.log("8 Enter ->", await at());
await press("v"); console.log("v ->", await at(), "| video slide:", await page.evaluate(() => !!document.querySelector(".slide.active video")));
await press("7", "Enter"); console.log("7 Enter ->", await at());
await press("End"); console.log("End ->", await at());
await press("ArrowRight"); console.log("End, Right ->", await at());
await press("1", "6", "Enter"); console.log("16 Enter ->", await at(), "| footer:", await page.evaluate(() => document.querySelector(".slide.active .pageno").textContent));
await press("1", "2", "Enter"); console.log("12 Enter ->", await at(), "| footer:", await page.evaluate(() => document.querySelector(".slide.active .pageno").textContent));

const [speaker] = await Promise.all([ctx.waitForEvent("page"), press("s")]);
await speaker.waitForTimeout(600);
const view = () => speaker.evaluate(() => ({ no: document.getElementById("no").textContent, title: document.getElementById("title").textContent, fs: getComputedStyle(document.getElementById("text")).fontSize }));
console.log("speaker on 12:", JSON.stringify(await view()));
await speaker.keyboard.press("7"); await speaker.keyboard.press("Enter"); await speaker.waitForTimeout(500);
console.log("speaker sent 7 Enter -> deck", await at(), "| view", JSON.stringify(await view()));
for (const [w, hgt] of [[1100, 720], [1440, 900]]) {
  await speaker.setViewportSize({ width: w, height: hgt }); await speaker.waitForTimeout(500);
  console.log(`live slide notes at ${w}x${hgt}:`, (await view()).fs);
}
await speaker.keyboard.press("v"); await speaker.waitForTimeout(500);
console.log("speaker sent v -> deck", await at(), "| view", JSON.stringify(await view()));
console.log("errors:", errors);
await b.close();
