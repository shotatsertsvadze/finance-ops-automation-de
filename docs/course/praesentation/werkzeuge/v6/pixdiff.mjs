// Counts clearly different pixels between two PNG sets of the same deck.
import { chromium } from "/Users/shotatsertsvadze/Desktop/finance-ops-automation-de/node_modules/playwright/index.mjs";
import { readFileSync } from "node:fs";
const [a, b, ...ids] = process.argv.slice(2);
const br = await chromium.launch({ channel: "chrome" });
const page = await br.newPage();
for (const i of ids) {
  const n = await page.evaluate(async ([x, y]) => {
    const load = (d) => new Promise((r) => { const im = new Image(); im.onload = () => r(im); im.src = d; });
    const [ia, ib] = await Promise.all([load(x), load(y)]);
    const px = (im) => { const c = new OffscreenCanvas(im.width, im.height); const g = c.getContext("2d"); g.drawImage(im, 0, 0); return g.getImageData(0, 0, im.width, im.height).data; };
    const da = px(ia), db = px(ib);
    let n = 0;
    for (let k = 0; k < da.length; k += 4) if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 60) n++;
    return n;
  }, [`data:image/png;base64,${readFileSync(`${a}/s${i}.png`).toString("base64")}`, `data:image/png;base64,${readFileSync(`${b}/s${i}.png`).toString("base64")}`]);
  console.log(`s${i}: ${n} px`);
}
await br.close();
