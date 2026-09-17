/**
 * Shared setup for the tests that need a real browser.
 *
 * Two things can only be answered by one. Whether a served document executes
 * is a decision the browser makes from the headers, not something a header
 * assertion proves. And whether a focus ring appears, or an animation is
 * suppressed, is the result of cascade and media-query evaluation, not of the
 * rule being present in a stylesheet.
 *
 * The browser is a development dependency and its binary is a separate
 * download, so these skip with a clear reason when it is missing. `npm test`
 * therefore still passes on a clean clone; `npm run test:browser` says what to
 * install. See ADR-046.
 */
import { chromium } from "playwright";

export const INSTALL_HINT = "Browser nicht installiert: npx playwright install chromium";

/**
 * A chromium instance, or null when the binary is absent. Never throws for a
 * missing browser: a skipped test has to be distinguishable from a broken one.
 */
export async function launchOrSkip(t, options = {}) {
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (/Executable doesn't exist|install/i.test(error.message)) {
      t.skip(INSTALL_HINT);
      return null;
    }
    throw error;
  }
}
