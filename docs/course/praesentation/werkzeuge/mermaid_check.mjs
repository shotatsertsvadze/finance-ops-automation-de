// Renders every mermaid block of a Markdown file with Mermaid 11 in Chrome,
// prints parse errors and saves one screenshot per diagram.
import { readFileSync } from "node:fs";
import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";

const [md, outPrefix] = process.argv.slice(2);
const blocks = [...readFileSync(md, "utf8").matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1]);
const html = `<!doctype html><meta charset="utf-8"><body style="background:#fff">
${blocks.map((b, i) => `<pre class="mermaid" id="d${i}">${b.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`).join("\n")}
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js"></script>
<script>mermaid.initialize({ startOnLoad: false }); mermaid.run().then(() => document.title = "done", (e) => document.title = "error: " + e.message);</script>`;
const b = await chromium.launch({ channel: "chrome" });
const page = await b.newPage({ viewport: { width: 1600, height: 1200 } });
await page.setContent(html);
await page.waitForFunction(() => document.title.length > 0, null, { timeout: 30000 });
console.log("result:", await page.title(), "| diagrams:", blocks.length);
for (let i = 0; i < blocks.length; i++) {
  const err = await page.locator(`#d${i}`).textContent();
  if (/Syntax error|Parse error/i.test(err)) console.log(`diagram ${i}: ${err.slice(0, 200)}`);
  await page.locator(`#d${i}`).screenshot({ path: `${outPrefix}_${i}.png` });
}
await b.close();
