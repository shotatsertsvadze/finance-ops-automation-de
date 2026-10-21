// Checks the two v7 files. Main deck: 12 slides, no video, V does nothing,
// jumps by number, End, speaker view and keys sent from it. Reserve deck:
// labels R1-R4 and B1-B8, starts on the video, Space plays it, no jumps by
// number, End, speaker view with labels.
// Usage: nav_test_v7.mjs praesentation_v7.html reserve_v7.html
import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";

const [mainFile, reserveFile] = process.argv.slice(2);
const b = await chromium.launch({ channel: "chrome" });

async function open(file) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`file://${file}#1`);
  await page.waitForTimeout(500);
  const at = () => page.evaluate(() => location.hash);
  const foot = () => page.evaluate(() => document.querySelector(".slide.active .pageno").textContent);
  const press = async (...keys) => { for (const k of keys) await page.keyboard.press(k); await page.waitForTimeout(150); };
  const speaker = async () => {
    const [sp] = await Promise.all([ctx.waitForEvent("page"), press("s")]);
    await sp.waitForTimeout(600);
    return sp;
  };
  const view = (sp) => sp.evaluate(() => ({ no: document.getElementById("no").textContent, title: document.getElementById("title").textContent, next: document.getElementById("next").textContent, hint: document.querySelector(".bar.bottom span:last-child").textContent }));
  return { page, errors, at, foot, press, speaker, view };
}

const m = await open(mainFile);
console.log("MAIN slides:", await m.page.evaluate(() => document.querySelectorAll("section.slide").length),
  "| videos:", await m.page.evaluate(() => document.querySelectorAll("video").length),
  "| Backup slides:", await m.page.evaluate(() => document.querySelectorAll('[data-chapter="Backup"]').length));
await m.press("v"); console.log("v ->", await m.at());
await m.press("8", "Enter"); console.log("8 Enter ->", await m.at(), await m.foot());
await m.press("End"); console.log("End ->", await m.at(), await m.foot());
await m.press("ArrowRight"); console.log("End, Right ->", await m.at());
await m.press("1", "3", "Enter"); console.log("13 Enter ->", await m.at());
await m.press("7", "Enter");
const ms = await m.speaker();
console.log("speaker on 7:", JSON.stringify(await m.view(ms)));
await ms.keyboard.press("8"); await ms.keyboard.press("Enter"); await ms.waitForTimeout(500);
console.log("speaker sent 8 Enter -> deck", await m.at(), "| view no:", (await m.view(ms)).no);
await ms.keyboard.press("v"); await ms.waitForTimeout(400);
console.log("speaker sent v -> deck", await m.at());
console.log("MAIN errors:", m.errors);

const r = await open(reserveFile);
console.log("RESERVE labels:", (await r.page.evaluate(() => [...document.querySelectorAll(".slide .pageno")].map((p) => p.textContent))).join(" "));
console.log("start ->", await r.at(), await r.foot(), "| video here:", await r.page.evaluate(() => !!document.querySelector(".slide.active video")));
await r.press(" "); await r.page.waitForTimeout(800);
console.log("Space -> playing:", await r.page.evaluate(() => !document.querySelector(".slide.active video").paused), "| still", await r.foot());
await r.press("k"); console.log("K -> paused:", await r.page.evaluate(() => document.querySelector(".slide.active video").paused));
await r.press("8", "Enter"); console.log("8 Enter ->", await r.foot());
await r.press("ArrowRight"); console.log("Right ->", await r.foot(), "| video paused:", await r.page.evaluate(() => document.querySelector("video").paused));
await r.press("End"); console.log("End ->", await r.foot());
await r.press("Home");
const rs = await r.speaker();
console.log("speaker on R1:", JSON.stringify(await r.view(rs)));
await rs.keyboard.press("ArrowRight"); await rs.waitForTimeout(500);
console.log("speaker sent Right ->", await r.foot(), "| view", JSON.stringify(await r.view(rs)));
await rs.keyboard.press("End"); await rs.waitForTimeout(500);
console.log("speaker sent End ->", await r.foot(), "| view no:", (await r.view(rs)).no);
console.log("RESERVE errors:", r.errors);
await b.close();
