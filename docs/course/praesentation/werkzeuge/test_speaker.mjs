import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";
const b = await chromium.launch({ channel: "chrome" });
const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
const deck = await ctx.newPage();
const errs = []; deck.on("pageerror", e => errs.push("deck: " + e.message));
await deck.goto(`file://${process.argv[2]}#1`); await deck.waitForTimeout(500);
const [sp] = await Promise.all([deck.waitForEvent("popup"), deck.keyboard.press("s")]);
sp.on("pageerror", e => errs.push("speaker: " + e.message));
await sp.setViewportSize({ width: 1100, height: 720 }); await sp.waitForTimeout(500);
const st = () => sp.evaluate(() => ({ no: no.textContent, title: title.textContent, clock: slideClock.textContent, fs: getComputedStyle(text).fontSize, fits: document.getElementById("body").scrollHeight <= document.getElementById("body").clientHeight, first: text.textContent.slice(0, 50), now: document.querySelector("p.now")?.textContent.slice(0, 30) ?? null }));
console.log("open", JSON.stringify(await st()));
await sp.screenshot({ path: process.env.S + "/sp_1.png" });
await sp.keyboard.press("ArrowRight"); await sp.waitForTimeout(400);
console.log("right in speaker -> deck", deck.url().split("#")[1], JSON.stringify(await st()));
await deck.keyboard.press("ArrowRight"); await sp.waitForTimeout(400);
console.log("right in deck -> speaker", deck.url().split("#")[1], JSON.stringify(await st()));
// all slides fit?
for (let i = 0; i < 16; i++) {
  await deck.evaluate((i) => { location.hash = ""; }, i);
  await deck.keyboard.press("Home"); for (let k = 0; k < i; k++) await deck.keyboard.press("ArrowRight");
  await sp.waitForTimeout(350); const s = await st(); console.log("slide", s.no, s.fs, s.fits ? "fits" : "SCROLLS");
}
await deck.keyboard.press("Home"); for (let k = 0; k < 8; k++) await sp.keyboard.press("ArrowRight");
await sp.waitForTimeout(400);
await sp.keyboard.press(" "); await sp.waitForTimeout(1500);
const vt = () => deck.evaluate(() => { const v = document.querySelector(".slide.active video"); return [v.paused, +v.currentTime.toFixed(1)]; });
console.log("space in speaker plays video", JSON.stringify(await vt()), JSON.stringify(await st()));
await deck.evaluate(() => { document.querySelector(".slide.active video").currentTime = 50; }); await sp.waitForTimeout(1200);
console.log("video at 50s", JSON.stringify(await st()));
await sp.screenshot({ path: process.env.S + "/sp_9.png" });
await deck.evaluate(() => { document.querySelector(".slide.active video").currentTime = 200; }); await sp.waitForTimeout(1200);
console.log("video at 200s", JSON.stringify(await st()));
await sp.keyboard.press("k"); await sp.waitForTimeout(300); console.log("k pauses", JSON.stringify(await vt()));
await deck.keyboard.press("s"); await deck.waitForTimeout(300); console.log("s again: pages", ctx.pages().length);
console.log("errors", errs);
await b.close();
