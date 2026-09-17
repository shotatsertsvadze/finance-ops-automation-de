/**
 * U5: the accessibility rules, as a browser actually applies them.
 *
 * The test matrix claimed a visible focus ring and respected reduced motion on
 * the evidence that `:focus-visible` and `prefers-reduced-motion` appear in
 * `styles.css`. A rule being present is not a rule taking effect: both depend
 * on cascade and media-query evaluation, and `:focus-visible` in particular is
 * a browser heuristic about how the element was focused. Neither can be
 * checked by reading the file, which is why that row said "not yet exercised".
 *
 * The stylesheet is read from source rather than from a build, so this needs
 * no `npm run build` first and tests the file the project actually edits.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { launchOrSkip } from "./support.js";

const css = readFileSync(new URL("../client/src/styles.css", import.meta.url), "utf8");

const PAGE = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><style>${css}</style></head>
<body>
  <a href="#x" id="before">vorher</a>
  <button class="btn" id="target">Freigeben</button>
  <div class="toast" id="animated">Hinweis</div>
</body></html>`;

let browser = null;

before(async () => {
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch();
  } catch {
    browser = null; // each test skips with the reason
  }
});
after(async () => {
  await browser?.close();
});

/** A page with the real stylesheet applied, or null when there is no browser. */
async function page(t, contextOptions = {}) {
  if (!browser) {
    const started = await launchOrSkip(t);
    if (!started) return null;
    browser = started;
  }
  const context = await browser.newContext(contextOptions);
  const p = await context.newPage();
  await p.setContent(PAGE, { waitUntil: "load" });
  return p;
}

const outlineOf = (p, selector) =>
  p.$eval(selector, (el) => {
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle, offset: s.outlineOffset };
  });

test("a control focused from the keyboard shows a visible ring", async (t) => {
  const p = await page(t);
  if (!p) return;

  await p.focus("#before");
  await p.keyboard.press("Tab");
  assert.equal(await p.evaluate(() => document.activeElement?.id), "target", "the button took focus");

  const outline = await outlineOf(p, "#target");
  assert.equal(outline.style, "solid", `no ring on keyboard focus: ${JSON.stringify(outline)}`);
  assert.equal(outline.width, "2px");
  assert.equal(outline.offset, "2px", "the ring stands off the control rather than hugging it");
});

test("the same control clicked with a mouse shows no ring", async (t) => {
  // What :focus-visible is for. If a click produced the ring the rule would be
  // plain :focus, and the test above would pass without proving anything.
  const p = await page(t);
  if (!p) return;

  await p.click("#target");
  assert.equal(await p.evaluate(() => document.activeElement?.id), "target");
  const outline = await outlineOf(p, "#target");
  assert.notEqual(outline.style, "solid", `a mouse click should not draw the ring: ${JSON.stringify(outline)}`);
});

test("animation runs at its normal length by default", async (t) => {
  // The control for the next test: without it, a stylesheet with no animation
  // at all would look like one that respects the preference.
  const p = await page(t);
  if (!p) return;

  const duration = await p.$eval("#animated", (el) => getComputedStyle(el).animationDuration);
  assert.equal(duration, "0.22s", `the toast animates normally: ${duration}`);
});

test("a viewer who asks for reduced motion gets it", async (t) => {
  const p = await page(t, { reducedMotion: "reduce" });
  if (!p) return;

  const styles = await p.$eval("#animated", (el) => {
    const s = getComputedStyle(el);
    return { animation: s.animationDuration, transition: s.transitionDuration };
  });
  // Compared as a number: chromium prints 0.01ms as "1e-05s" and the exact
  // spelling is the browser's business, not the stylesheet's.
  const seconds = (value) => Number.parseFloat(value);
  assert.ok(seconds(styles.animation) <= 0.001, `animation not suppressed: ${JSON.stringify(styles)}`);
  assert.ok(seconds(styles.transition) <= 0.001, `transition not suppressed: ${JSON.stringify(styles)}`);
});
