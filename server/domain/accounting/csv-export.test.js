/**
 * The accounting CSV handoff, and who is reading it.
 *
 * Two consumers want incompatible things. A bookkeeping import wants the
 * identifier the supplier sent, byte for byte. A spreadsheet executes any cell
 * beginning `=`, `+`, `-` or `@`, so an invoice numbered `=1+1` becomes a live
 * formula in front of whoever opens the file.
 *
 * Quoting solves neither: it keeps a value inside its column and does nothing
 * about it being run. Prefixing solves the second and breaks the first, which
 * is why the earlier fix was recorded as a trade-off rather than a fix.
 *
 * The export now asks which consumer it is for (ADR-045).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell } from "./accounting.js";

const machine = (value) => csvCell(value, "machine");
const sheet = (value) => csvCell(value, "spreadsheet");

test("an ordinary value is identical for both consumers", () => {
  for (const value of ["BELEG-2026-00001", "6815", "-1240.00", ""]) {
    assert.equal(machine(value), sheet(value), `${value} needs no defending`);
  }
  assert.equal(machine("BELEG-2026-00001"), "BELEG-2026-00001");
  assert.equal(machine(null), "");
});

test("the machine profile returns the identifier exactly as it arrived", () => {
  // This is the half the previous fix broke: an importer matching on the
  // invoice number must see the number, not an apostrophe and the number.
  assert.equal(machine("=1+1"), "=1+1");
  assert.equal(machine("@SUM(A1)"), "@SUM(A1)");
  assert.equal(machine("+49-BESTELLUNG"), "+49-BESTELLUNG");
});

test("the spreadsheet profile makes an executable cell inert", () => {
  for (const dangerous of ["=1+1", "+1+1", "@SUM(A1)", '=HYPERLINK("http://x")', "-1+1"]) {
    const cell = sheet(dangerous);
    assert.ok(!/^[=+@-]/.test(cell.replace(/^"/, "")), `still executable: ${dangerous} -> ${cell}`);
    assert.ok(cell.includes(dangerous.replace(/"/g, '""')), `the value must survive: ${dangerous} -> ${cell}`);
  }
});

test("a negative amount is a number, not a formula, in either profile", () => {
  // Blanket-escaping anything starting with "-" would corrupt every credit.
  for (const amount of ["-1240.00", "-0.01", "-1"]) {
    assert.equal(machine(amount), amount);
    assert.equal(sheet(amount), amount);
  }
});

test("a leading control character cannot start a formula for a spreadsheet", () => {
  for (const dangerous of ["\t=1+1", "\r=1+1"]) {
    const cell = sheet(dangerous);
    assert.ok(!/^[\t\r]/.test(cell.replace(/^"/, "")), `still executable: ${JSON.stringify(cell)}`);
  }
});

test("separators and quotes are escaped for both", () => {
  for (const cell of [machine, sheet]) {
    assert.equal(cell('Spree "IT"; Systeme'), '"Spree ""IT""; Systeme"');
    assert.equal(cell("zwei\nzeilen"), '"zwei\nzeilen"');
  }
});

test("the machine profile is the default, so nothing is altered unasked", () => {
  assert.equal(csvCell("=1+1"), "=1+1");
});
