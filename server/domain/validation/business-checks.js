import { SEVERITY, failed, info, passed, skipped, warning } from "../checks.js";
import { centsToDecimal, productToCents, toCents } from "../money.js";
import { approvalTierLabel } from "../../config/policy.js";
import { checkTaxBreakdown } from "./tax-breakdown.js";

/**
 * "Does this invoice make sense for our company?" Pure function over the
 * parsed invoice and already-loaded master data:
 *   master = { supplier, bankAccounts, purchaseOrder, existingSameNumber }
 */
export function runBusinessChecks(parsed, master, policy, company) {
  const checks = [];
  const { supplier, matchedBy = null, bankAccounts = [], purchaseOrder, existingSameNumber = [] } = master;
  const isCreditNote = parsed.documentType === "CREDIT_NOTE";
  const netCents = toCents(parsed.totals.taxExclusive);
  const vatCents = toCents(parsed.totals.taxAmount);
  const grossCents = toCents(parsed.totals.payable);

  if (supplier) {
    const how = matchedBy === "VAT_ID" ? "USt-IdNr." : "Namen";
    checks.push(passed("supplier_known", SEVERITY.HIGH, { expected: "Lieferant im Stammdatenbestand", actual: `${supplier.supplier_no} ${supplier.legal_name}`, reason: `Lieferant über ${how} zugeordnet` }));
    if (supplier.status === "ACTIVE") {
      checks.push(passed("supplier_active", SEVERITY.HIGH, { expected: "ACTIVE", actual: supplier.status, reason: "Lieferant ist aktiv" }));
    } else {
      checks.push(failed("supplier_active", SEVERITY.HIGH, { expected: "ACTIVE", actual: supplier.status, reason: `Lieferant ist ${supplier.status}` }));
    }
  } else {
    const reason = {
      VAT_ID_UNKNOWN: "USt-IdNr. der Rechnung ist keinem Lieferanten zugeordnet; eine Zuordnung über den Namen wäre eine Vermutung",
      NAME_AMBIGUOUS: "Firmenname trifft auf mehrere Lieferanten zu",
    }[matchedBy] ?? "Lieferant nicht im Stammdatenbestand";
    checks.push(failed("supplier_known", SEVERITY.HIGH, { expected: "bekannte USt-IdNr. oder eindeutiger Firmenname", actual: `${parsed.supplier.vatId ?? "(keine USt-IdNr.)"} / ${parsed.supplier.name ?? "(kein Name)"}`, reason }));
    checks.push(skipped("supplier_active", { reason: "Lieferant unbekannt" }));
  }

  // Whose debt is this? An invoice made out to another company is not ours to
  // pay, however well it validates otherwise.
  // Every identifier the document carries must agree. One matching field does
  // not excuse another that names a different company.
  const normalise = (value) => (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const buyerVat = (parsed.buyer.vatId ?? "").toUpperCase();
  const buyerName = parsed.buyer.name ?? "";
  const mismatches = [];
  if (buyerVat && buyerVat !== company.vatId) mismatches.push(`USt-IdNr. ${buyerVat}`);
  if (buyerName && normalise(buyerName) !== normalise(company.legalName)) mismatches.push(`Name "${buyerName}"`);
  if (!buyerVat && !buyerName) mismatches.push("kein Rechnungsempfänger angegeben");
  const buyerMatches = mismatches.length === 0;
  if (buyerMatches) {
    checks.push(passed("buyer_is_us", SEVERITY.HIGH, { expected: `${company.legalName} / ${company.vatId}`, actual: `${parsed.buyer.name ?? "-"} / ${parsed.buyer.vatId ?? "-"}`, reason: "Rechnung ist an das eigene Unternehmen adressiert" }));
  } else {
    checks.push(failed("buyer_is_us", SEVERITY.HIGH, { expected: `${company.legalName} / ${company.vatId}`, actual: mismatches.join(", "), reason: "Rechnungsempfänger stimmt nicht mit dem eigenen Unternehmen überein" }));
  }

  const activeIbans = bankAccounts.filter((a) => a.status === "ACTIVE").map((a) => a.iban.replace(/\s+/g, "").toUpperCase());
  const invoiceIban = parsed.payment.iban;
  if (!supplier) {
    checks.push(skipped("supplier_iban_match", { actual: invoiceIban, reason: "Lieferant unbekannt, IBAN nicht prüfbar" }));
  } else if (!invoiceIban) {
    checks.push(failed("supplier_iban_match", SEVERITY.HIGH, { expected: activeIbans.join(", "), actual: "(keine IBAN)", reason: "Rechnung enthält keine IBAN" }));
  } else if (activeIbans.includes(invoiceIban)) {
    checks.push(passed("supplier_iban_match", SEVERITY.HIGH, { expected: activeIbans.join(", "), actual: invoiceIban, reason: "IBAN stimmt mit freigegebener Bankverbindung überein" }));
  } else {
    checks.push(failed("supplier_iban_match", SEVERITY.HIGH, { expected: activeIbans.join(", "), actual: invoiceIban, reason: "IBAN weicht von den freigegebenen Bankverbindungen des Lieferanten ab (Betrugsrisiko)" }));
  }

  if (!supplier) {
    checks.push(skipped("duplicate_invoice_number", { reason: "Lieferant unbekannt" }));
  } else if (existingSameNumber.length) {
    checks.push(failed("duplicate_invoice_number", SEVERITY.HIGH, { expected: "Rechnungsnummer noch nicht erfasst", actual: `${parsed.invoiceNumber} bereits als ${existingSameNumber.map((e) => e.state).join(", ")}`, reason: "Gleiche Rechnungsnummer desselben Lieferanten bereits im Bestand" }));
  } else {
    checks.push(passed("duplicate_invoice_number", SEVERITY.HIGH, { expected: "keine", actual: "keine", reason: "Rechnungsnummer für diesen Lieferanten neu" }));
  }

  // Asked only of a credit note. On an invoice it would be SKIPPED every time,
  // which is noise in the one panel a reviewer actually reads.
  if (isCreditNote) {
    if (parsed.creditedInvoice) {
      checks.push(passed("credit_note_reference", SEVERITY.MEDIUM, {
        expected: "Bezug auf die gutgeschriebene Rechnung",
        actual: parsed.creditedInvoice,
        reason: "Die Gutschrift nennt die Rechnung, auf die sie sich bezieht",
      }));
    } else {
      checks.push(failed("credit_note_reference", SEVERITY.MEDIUM, {
        expected: "Bezug auf die gutgeschriebene Rechnung",
        actual: "(keiner)",
        reason: "Die Gutschrift nennt keine Rechnung; welche Verbindlichkeit sie mindert, ist offen",
      }));
    }
  }

  const poRequired = grossCents !== null && grossCents > policy.poRequiredAboveCents;
  if (parsed.poReference) {
    checks.push(passed("po_reference_present", SEVERITY.MEDIUM, { expected: "Bestellreferenz", actual: parsed.poReference, reason: "Bestellreferenz vorhanden" }));
  } else if (poRequired) {
    checks.push(failed("po_reference_present", SEVERITY.MEDIUM, { expected: `Bestellreferenz ab ${centsToDecimal(policy.poRequiredAboveCents)} EUR`, actual: "(keine)", reason: "Bestellreferenz fehlt, obwohl die Richtlinie sie verlangt" }));
  } else {
    checks.push(warning("po_reference_present", { expected: "Bestellreferenz", actual: "(keine)", reason: "Keine Bestellreferenz; unterhalb der Pflichtgrenze" }));
  }

  if (!parsed.poReference) {
    checks.push(skipped("po_exists", { reason: "keine Bestellreferenz" }));
    checks.push(skipped("po_supplier_match", { reason: "keine Bestellreferenz" }));
    checks.push(skipped("po_amount_within_tolerance", { reason: "keine Bestellreferenz" }));
  } else if (!purchaseOrder || purchaseOrder.status !== "OPEN") {
    checks.push(failed("po_exists", SEVERITY.HIGH, { expected: "offene Bestellung", actual: purchaseOrder ? `Status ${purchaseOrder.status}` : "nicht gefunden", reason: purchaseOrder ? "Bestellung ist nicht offen" : "Bestellreferenz unbekannt" }));
    checks.push(skipped("po_supplier_match", { reason: "Bestellung nicht verwendbar" }));
    checks.push(skipped("po_amount_within_tolerance", { reason: "Bestellung nicht verwendbar" }));
  } else {
    checks.push(passed("po_exists", SEVERITY.HIGH, { expected: "offene Bestellung", actual: purchaseOrder.po_number, reason: "Bestellung gefunden" }));
    if (supplier && purchaseOrder.supplier_id === supplier.id) {
      checks.push(passed("po_supplier_match", SEVERITY.HIGH, { expected: `${supplier.supplier_no} ${supplier.legal_name}`, actual: `${purchaseOrder.po_number} gehört zu ${supplier.supplier_no}`, reason: "Bestellung gehört zum Rechnungssteller" }));
    } else {
      const orderSupplier = purchaseOrder.supplier_supplier_no
        ? `${purchaseOrder.supplier_supplier_no} ${purchaseOrder.supplier_legal_name ?? ""}`.trim()
        : "(unbekannter Lieferant)";
      checks.push(failed("po_supplier_match", SEVERITY.HIGH, {
        expected: supplier ? `${supplier.supplier_no} ${supplier.legal_name}` : "(Lieferant unbekannt)",
        actual: `${purchaseOrder.po_number} gehört zu ${orderSupplier}`,
        reason: "Bestellung gehört zu einem anderen Lieferanten",
      }));
    }
    // Available capacity, not the opening balance: other live invoices already
    // hold part of this order. Tolerance is granted once per order, not once
    // per invoice, or several invoices each "within tolerance" drift the total.
    const openingCents = toCents(purchaseOrder.remaining_amount);
    const availableCents = master.poAvailableCents ?? openingCents;
    const toleranceCents = Math.max(Math.round((openingCents * policy.poTolerancePct) / 100), policy.poToleranceMinCents);
    const ceilingCents = availableCents + toleranceCents;
    const committedCents = openingCents - availableCents;
    const held = committedCents > 0 ? `, davon ${centsToDecimal(committedCents)} EUR durch andere Rechnungen gebunden` : "";

    if (isCreditNote) {
      // It gives capacity back rather than taking it, so measuring it against
      // the ceiling would refuse exactly the credit notes that matter most.
      checks.push(skipped("po_amount_within_tolerance", {
        expected: `verfügbar ${centsToDecimal(availableCents)} EUR`,
        actual: `${centsToDecimal(netCents ?? 0)} EUR Gutschrift`,
        reason: "Eine Gutschrift verbraucht die Bestellung nicht, sondern gibt Betrag frei",
      }));
    } else if (netCents === null) {
      checks.push(skipped("po_amount_within_tolerance", { reason: "Nettobetrag nicht lesbar" }));
    } else if (netCents <= ceilingCents) {
      checks.push(passed("po_amount_within_tolerance", SEVERITY.HIGH, {
        expected: `<= ${centsToDecimal(ceilingCents)} EUR (verfügbar ${centsToDecimal(availableCents)} + Toleranz${held})`,
        actual: `${centsToDecimal(netCents)} EUR`,
        reason: "Nettobetrag innerhalb der verfügbaren Bestellsumme",
      }));
    } else {
      checks.push(failed("po_amount_within_tolerance", SEVERITY.HIGH, {
        expected: `<= ${centsToDecimal(ceilingCents)} EUR (verfügbar ${centsToDecimal(availableCents)} + Toleranz ${policy.poTolerancePct} %${held})`,
        actual: `${centsToDecimal(netCents)} EUR`,
        reason: committedCents > 0
          ? "Nettobetrag überschreitet zusammen mit bereits gebundenen Rechnungen den Bestellwert"
          : "Nettobetrag überschreitet den offenen Bestellwert",
      }));
    }
  }

  const sumOf = (values) => values.reduce((sum, v) => {
    const cents = toCents(v);
    return sum === null || cents === null ? null : sum + cents;
  }, 0);

  // A line's declared amount is the one number the chain below trusts without
  // deriving it, because the chain sums exactly those declared amounts. A line
  // reading "10 x 5.00 = 500.00" leaves every total consistent and overpays by
  // a factor of ten, so each line is recomputed from what it states (ADR-048).
  // A line that cannot be recomputed is an issue too: nothing anchors its
  // amount, and routing does not stop on a SKIPPED check (ADR-081).
  const lineIssues = [];
  for (const line of parsed.lines) {
    const label = `Position ${line.lineNo}`;
    const adjustments = line.allowanceCharges ?? [];
    if (adjustments.some((a) => a.isCharge === null)) {
      lineIssues.push(`${label}: Betrag ohne Kennzeichen (cbc:ChargeIndicator)`);
      continue;
    }
    const declared = toCents(line.lineNet);
    const priced = productToCents(line.quantity, line.unitPrice, line.baseQuantity ?? "1");
    const off = sumOf(adjustments.filter((a) => a.isCharge === false).map((a) => a.amount));
    const on = sumOf(adjustments.filter((a) => a.isCharge === true).map((a) => a.amount));
    if (declared === null || priced === null || off === null || on === null) {
      lineIssues.push(`${label}: Menge oder Einzelpreis nicht lesbar`);
      continue;
    }
    const computed = priced - off + on;
    if (Math.abs(computed - declared) > policy.totalsToleranceCents) {
      lineIssues.push(`${label}: ${centsToDecimal(computed)} != ${centsToDecimal(declared)}`);
    }
  }

  const lineRule = "Menge x Einzelpreis - Nachlässe + Zuschläge = Positionsbetrag";
  if (lineIssues.length) {
    checks.push(failed("line_amounts_consistent", SEVERITY.HIGH, {
      expected: lineRule, actual: lineIssues.join("; "),
      reason: "Positionsbeträge folgen nicht aus Menge und Einzelpreis",
    }));
  } else {
    checks.push(passed("line_amounts_consistent", SEVERITY.HIGH, {
      expected: lineRule,
      actual: `${parsed.lines.length} ${parsed.lines.length === 1 ? "Position" : "Positionen"} nachgerechnet`,
      reason: "Positionsbeträge folgen aus Menge und Einzelpreis",
    }));
  }

  // EN 16931 chains the declared totals from the line amounts to the amount
  // due, and every link is checked. A document can declare a plausible payable
  // amount over lines, discounts or a prepayment that do not produce it, so
  // checking only neighbouring pairs is not enough (ADR-047).
  // An amount the document leaves out is zero. One it states but we cannot
  // read is unknown, and unknown is not zero.
  const optional = (value) => (value === null || value === undefined || value === "" ? 0 : toCents(value));

  const entries = parsed.allowanceCharges ?? [];
  const undecided = entries.filter((a) => a.isCharge === null).length;
  const allowanceSum = sumOf(entries.filter((a) => a.isCharge === false).map((a) => a.amount));
  const chargeSum = sumOf(entries.filter((a) => a.isCharge === true).map((a) => a.amount));
  const lineSum = sumOf(parsed.lines.map((l) => l.lineNet));
  const lineExtensionCents = toCents(parsed.totals.lineExtension);
  const taxInclusiveCents = toCents(parsed.totals.taxInclusive);
  const allowanceTotalCents = optional(parsed.totals.allowanceTotal);
  const chargeTotalCents = optional(parsed.totals.chargeTotal);
  const prepaidCents = optional(parsed.totals.prepaid);
  const roundingCents = optional(parsed.totals.rounding);

  // Listed as pairs rather than an object: an allowance total and the
  // individual allowances are both reported as "Nachlässe" when unreadable,
  // which a key can only say once.
  const known = [
    ["Positionen", lineSum], ["Netto", netCents], ["Steuer", vatCents], ["Zahlbetrag", grossCents],
    ["Nachlässe", allowanceTotalCents], ["Nachlässe", allowanceSum],
    ["Zuschläge", chargeTotalCents], ["Zuschläge", chargeSum],
    ["Anzahlung", prepaidCents], ["Rundung", roundingCents],
  ];
  const unreadable = [...new Set(known.filter(([, v]) => v === null).map(([label]) => label))];

  const chain = "Positionen - Nachlässe + Zuschläge = Netto; Netto + Steuer - Anzahlung = Zahlbetrag";
  if (unreadable.length) {
    checks.push(failed("totals_consistent", SEVERITY.HIGH, {
      expected: chain,
      actual: `Beträge nicht lesbar: ${unreadable.join(", ")}`,
      reason: "Summen sind rechnerisch nicht konsistent",
    }));
  } else if (undecided > 0) {
    // The indicator decides whether an amount is added or subtracted.
    // Guessing it would be guessing at the amount due.
    checks.push(failed("totals_consistent", SEVERITY.HIGH, {
      expected: chain,
      actual: `${undecided} Betrag/Beträge ohne Kennzeichen (cbc:ChargeIndicator)`,
      reason: "Ein Betrag ist weder als Nachlass oder Zuschlag gekennzeichnet; die Summen sind damit nicht nachrechenbar",
    }));
  } else {
    const grossComputed = netCents + vatCents;
    const inconsistencies = [];
    const link = (label, computed, declared) => {
      if (declared === null) return;
      if (Math.abs(computed - declared) > policy.totalsToleranceCents) {
        inconsistencies.push(`${label}: ${centsToDecimal(computed)} != ${centsToDecimal(declared)}`);
      }
    };
    link("Positionen = Summe der Positionen", lineSum, lineExtensionCents);
    link("Nachlässe einzeln = Nachlässe gesamt", allowanceSum, allowanceTotalCents);
    link("Zuschläge einzeln = Zuschläge gesamt", chargeSum, chargeTotalCents);
    link("Positionen - Nachlässe + Zuschläge = Netto",
      (lineExtensionCents ?? lineSum) - allowanceTotalCents + chargeTotalCents, netCents);
    link("Netto + Steuer = Bruttobetrag", grossComputed, taxInclusiveCents);
    link("Bruttobetrag - Anzahlung + Rundung = Zahlbetrag",
      (taxInclusiveCents ?? grossComputed) - prepaidCents + roundingCents, grossCents);

    if (inconsistencies.length) {
      checks.push(failed("totals_consistent", SEVERITY.HIGH, { expected: chain, actual: inconsistencies.join("; "), reason: "Summen sind rechnerisch nicht konsistent" }));
    } else {
      const parts = [`${centsToDecimal(lineSum)} Positionen`];
      if (allowanceTotalCents) parts.push(`- ${centsToDecimal(allowanceTotalCents)} Nachlässe`);
      if (chargeTotalCents) parts.push(`+ ${centsToDecimal(chargeTotalCents)} Zuschläge`);
      parts.push(`+ ${centsToDecimal(vatCents)} Steuer`);
      if (prepaidCents) parts.push(`- ${centsToDecimal(prepaidCents)} Anzahlung`);
      checks.push(passed("totals_consistent", SEVERITY.HIGH, {
        expected: chain,
        actual: `${parts.join(" ")} = ${centsToDecimal(grossCents)} Zahlbetrag`,
        reason: "Summen sind rechnerisch konsistent",
      }));
    }
  }

  // What the booking will be built from: the document's breakdown per rate.
  checks.push(checkTaxBreakdown(parsed, policy));

  if (policy.allowedCurrencies.includes(parsed.currency)) {
    checks.push(passed("currency_expected", SEVERITY.MEDIUM, { expected: policy.allowedCurrencies.join(", "), actual: parsed.currency, reason: "Währung erwartet" }));
  } else {
    checks.push(failed("currency_expected", SEVERITY.MEDIUM, { expected: policy.allowedCurrencies.join(", "), actual: parsed.currency ?? "(keine)", reason: "Unerwartete Währung" }));
  }

  const completeness = { "Fälligkeitsdatum": parsed.dueDate, "IBAN": invoiceIban, "Käuferreferenz": parsed.buyerReference, "USt-IdNr. Lieferant": parsed.supplier.vatId };
  const missing = Object.entries(completeness).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    checks.push(failed("required_fields_complete", SEVERITY.MEDIUM, { expected: Object.keys(completeness).join(", "), actual: `fehlt: ${missing.join(", ")}`, reason: `Für die Verarbeitung erwartete Angaben fehlen: ${missing.join(", ")}` }));
  } else {
    checks.push(passed("required_fields_complete", SEVERITY.MEDIUM, { expected: Object.keys(completeness).join(", "), actual: "vollständig", reason: "Alle erwarteten Angaben vorhanden" }));
  }

  if (supplier?.payment_terms_days && parsed.issueDate && parsed.dueDate) {
    const days = Math.round((Date.parse(parsed.dueDate) - Date.parse(parsed.issueDate)) / 86400000);
    if (days === supplier.payment_terms_days) {
      checks.push(passed("payment_terms_match", SEVERITY.LOW, { expected: `${supplier.payment_terms_days} Tage`, actual: `${days} Tage`, reason: "Zahlungsziel entspricht den Stammdaten" }));
    } else {
      checks.push(warning("payment_terms_match", { expected: `${supplier.payment_terms_days} Tage`, actual: `${days} Tage`, reason: "Zahlungsziel weicht von den Stammdaten ab (Hinweis)" }));
    }
  } else {
    checks.push(skipped("payment_terms_match", { reason: "Zahlungsziel nicht vergleichbar" }));
  }

  if (grossCents !== null) {
    checks.push(info("approval_threshold", { expected: `Auto bis ${centsToDecimal(policy.autoApproveLimitCents)} EUR`, actual: `${centsToDecimal(grossCents)} EUR -> ${approvalTierLabel(policy, grossCents)}`, reason: "Freigabestufe laut Richtlinie" }));
  }

  return { checks, supplierId: supplier?.id ?? null, purchaseOrderId: purchaseOrder?.id ?? null, grossCents };
}
