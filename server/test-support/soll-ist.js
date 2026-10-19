import { readFileSync } from "node:fs";
import { handleUpload } from "../domain/intake/intake.js";
import { getInvoiceDetail } from "../domain/invoice/queries.js";
import { SYSTEM } from "../domain/workflow/transitions.js";
import { buildInvoiceXml } from "./invoice-xml.js";

/**
 * The fixed Soll/Ist set (docs/course/SOLL_IST_DE.md): 20 synthetic invoices,
 * each with its expected outcome, run one at a time through the real pipeline
 * against the seeded master data. 16 should go through without a factual
 * review and 4 must stop. That mix copies the assumption in the project brief
 * (8 of 10), so the share that goes through is chosen, not measured; what the
 * set measures is whether every invoice ends where it should, with the right
 * reason or the right approvers.
 */
const fixture = (name) => readFileSync(new URL(`../../fixtures/xrechnung/${name}`, import.meta.url), "utf8");
const HAVEL = { supplierName: "Havel Logistik GmbH", supplierVat: "DE234567890", iban: "DE02120300000000202051" };
const SPREE = { supplierName: "Spree IT-Systeme AG", supplierVat: "DE345678901", iban: "DE02500105170137075030" };
const withoutOrder = (xml) => xml.replace(/<cac:OrderReference>.*?<\/cac:OrderReference>/, "");

const through = (approvers) => ({ state: approvers.length ? "READY_FOR_APPROVAL" : "APPROVED", reason: null, approvers });
const stopped = (reason) => ({ state: "REVIEW_REQUIRED", reason, approvers: [] });

export const SOLL_IST_CASES = [
  { no: 1, case: "Bürobedarf 380,00 €, Bestellung passt", files: [fixture("G_clean_380.xml")], soll: through([]) },
  { no: 2, case: "Rabatt auf Rechnungsebene, 499,80 €", files: [fixture("I_discount_499.xml")], soll: through([]) },
  { no: 3, case: "Gutschrift 214,20 €", files: [fixture("J_credit_note_214.xml")], soll: through([]) },
  { no: 4, case: "Zwei Steuersätze (19 % und 7 %), 113,00 €", files: [buildInvoiceXml({ number: "SI-04", netCents: 5000, reducedNetCents: 5000, po: "PO-2026-0101" })], soll: through([]) },
  { no: 5, case: "Genau an der Freigabegrenze, 500,00 €", files: [buildInvoiceXml({ number: "SI-05", netCents: 42017, po: "PO-2026-0102" })], soll: through([]) },
  { no: 6, case: "Kleinbetrag ohne Bestellung, 238,00 € (unter der Bestellpflicht)", files: [withoutOrder(buildInvoiceXml({ number: "SI-06", netCents: 20000 }))], soll: through([]) },
  { no: 7, case: "Bürobedarf 1.240,00 €", files: [fixture("A_clean_1240.xml")], soll: through(["MANAGER"]) },
  { no: 8, case: "1 Cent über der Freigabegrenze, 500,01 €", files: [buildInvoiceXml({ number: "SI-08", netCents: 42018, po: "PO-2026-0101" })], soll: through(["MANAGER"]) },
  { no: 9, case: "Bestellung um 5,00 € überschritten, innerhalb der Toleranz", files: [buildInvoiceXml({ number: "SI-09", netCents: 42437, po: "PO-2026-0102" })], soll: through(["MANAGER"]) },
  { no: 10, case: "Anzahlung verrechnet, Zahlbetrag 1.000,00 €", files: [buildInvoiceXml({ number: "SI-10", netCents: 100000, prepaidCents: 19000, po: "PO-2026-0101" })], soll: through(["MANAGER"]) },
  { no: 11, case: "Logistik 1.190,00 €", files: [buildInvoiceXml({ number: "SI-11", netCents: 100000, po: "PO-2026-0201", ...HAVEL })], soll: through(["MANAGER"]) },
  { no: 12, case: "Logistik mit Frachtzuschlag, 1.309,00 €", files: [buildInvoiceXml({ number: "SI-12", netCents: 100000, allowances: [{ charge: true, amountCents: 10000, reason: "Fracht" }], po: "PO-2026-0201", ...HAVEL })], soll: through(["MANAGER"]) },
  { no: 13, case: "IT 4.760,00 €", files: [buildInvoiceXml({ number: "SI-13", netCents: 400000, po: "PO-2026-0303", ...SPREE })], soll: through(["MANAGER"]) },
  { no: 14, case: "IT 5.950,00 €, zweite Freigabestufe", files: [buildInvoiceXml({ number: "SI-14", netCents: 500000, po: "PO-2026-0305", ...SPREE })], soll: through(["MANAGER", "FINANCE"]) },
  { no: 15, case: "Genau an der zweiten Grenze, 25.000,00 €", files: [buildInvoiceXml({ number: "SI-15", netCents: 2100840, po: "PO-2026-0305", ...SPREE })], soll: through(["MANAGER", "FINANCE"]) },
  { no: 16, case: "IT 30.000,00 €, dritte Freigabestufe", files: [fixture("E_high_value_30000.xml")], soll: through(["MANAGER", "FINANCE", "CFO"]) },
  { no: 17, case: "Fremde IBAN, 2.499,00 € (Havel Logistik)", files: [fixture("B_iban_changed_2499.xml")], soll: stopped("SUPPLIER_IBAN_MATCH") },
  { no: 18, case: "Fremde IBAN bei Kleinbetrag, 380,00 €", files: [fixture("H_small_iban_changed_380.xml")], soll: stopped("SUPPLIER_IBAN_MATCH") },
  { no: 19, case: "Bestellung deutlich überschritten, 10.115,00 €", files: [fixture("C_po_overrun_8500.xml")], soll: stopped("PO_AMOUNT_WITHIN_TOLERANCE") },
  { no: 20, case: "Rechnungsnummer doppelt (nach Nr. 7)", files: [fixture("A_clean_1240.xml"), fixture("D_duplicate_number_1240.xml")], soll: stopped("DUPLICATE_INVOICE_NUMBER") },
];

/** Runs every case into an empty invoice table; returns each case with what actually happened. */
export async function runSollIst(deps) {
  const rows = [];
  for (const c of SOLL_IST_CASES) {
    await deps.pool.query("delete from finops.invoices");
    let id;
    for (const [i, xml] of c.files.entries()) {
      ({ id } = await handleUpload(deps, { buffer: Buffer.from(xml), originalFilename: `soll-ist-${c.no}-${i}.xml`, sourceChannel: "UPLOAD", actor: SYSTEM }));
    }
    const d = await getInvoiceDetail(deps.pool, id);
    const ist = { state: d.state, reason: d.review_reason, approvers: d.approval_steps.map((s) => s.required_role) };
    rows.push({ ...c, gross: d.gross_amount, ist });
  }
  return rows;
}
