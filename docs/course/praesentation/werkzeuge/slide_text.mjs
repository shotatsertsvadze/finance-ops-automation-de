import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await p.goto(`file://${process.argv[2]}?print`);
const t = await p.evaluate(() => [...document.querySelectorAll(".slide")].map((s, i) => `=== FOLIE ${i + 1}\n` + s.innerText.replace(/\n{2,}/g, "\n").trim() + ([...s.querySelectorAll("img")].length ? `\n[Bilder: ${[...s.querySelectorAll("img")].map(i => i.alt || "ohne alt").join(" | ")}]` : "")));
console.log(t.join("\n"));
await b.close();
