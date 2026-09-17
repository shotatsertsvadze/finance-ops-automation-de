/**
 * The accounting CSV handoff.
 *
 * The export is a machine handoff to a bookkeeping import, but people open it
 * in a spreadsheet, and a spreadsheet executes a cell that starts with `=`,
 * `+`, `-` or `@`. Quoting stops a cell breaking the row; it does nothing about
 * a cell being run. An invoice numbered `=1+1` passes intake and reaches the
 * export unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell } from "./accounting.js";

test("an ordinary value is written as it stands", () => {
  assert.equal(csvCell("BELEG-2026-00001"), "BELEG-2026-00001");
  assert.equal(csvCell("6815"), "6815");
  assert.equal(csvCell(null), "");
});

test("a negative amount is still a number, not a formula", () => {
  // Blanket-escaping anything starting with "-" would corrupt every credit.
  assert.equal(csvCell("-1240.00"), "-1240.00");
  assert.equal(csvCell("-0.01"), "-0.01");
});

test("a cell that a spreadsheet would execute is made inert", () => {
  for (const dangerous of ["=1+1", "+1+1", "@SUM(A1)", "=HYPERLINK(\"http://x\")", "-1+1"]) {
    const cell = csvCell(dangerous);
    assert.ok(!/^[=+@]/.test(cell.replace(/^"/, "")), `still executable: ${dangerous} -> ${cell}`);
    assert.ok(cell.includes(dangerous.replace(/"/g, '""')), `the value must survive: ${dangerous} -> ${cell}`);
  }
});

test("a leading control character cannot start a formula either", () => {
  for (const dangerous of ["\t=1+1", "\r=1+1"]) {
    const cell = csvCell(dangerous);
    assert.ok(!/^[\t\r]/.test(cell.replace(/^"/, "")), `still executable: ${JSON.stringify(cell)}`);
  }
});

test("separators and quotes are still escaped", () => {
  assert.equal(csvCell('Spree "IT"; Systeme'), '"Spree ""IT""; Systeme"');
  assert.equal(csvCell("zwei\nzeilen"), '"zwei\nzeilen"');
});
