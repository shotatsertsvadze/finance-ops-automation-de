import { SEVERITY, failed, info, passed, skipped, warning } from "../checks.js";
import { centsToDecimal, toCents } from "../money.js";
import { approvalTierLabel } from "../../config/policy.js";

/**
 * "Does this invoice make sense for our company?" Pure function over the
 * parsed invoice and already-loaded master data:
 *   master = { supplier, bankAccounts, purchaseOrder, existingSameNumber }
 */
export function runBusinessChecks(parsed, master, policy, company) {
  const checks = [];
  const { supplier, matchedBy = null, bankAccounts = [], purchaseOrder, existingSameNumber = [] } = master;
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

    if (netCents === null) {
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

  const lineSum = parsed.lines.reduce((sum, l) => (sum === null ? null : (toCents(l.lineNet) === null ? null : sum + toCents(l.lineNet))), 0);
  const lineExtensionCents = toCents(parsed.totals.lineExtension);
  const taxInclusiveCents = toCents(parsed.totals.taxInclusive);
  const inconsistencies = [];
  if (netCents === null || vatCents === null || grossCents === null || lineSum === null) inconsistencies.push("Beträge nicht lesbar");
  else {
    // Every declared total is chained to the next. Checking only neighbouring
    // pairs let a document declare a consistent header over unrelated lines.
    if (lineExtensionCents !== null && Math.abs(lineSum - lineExtensionCents) > policy.totalsToleranceCents) {
      inconsistencies.push(`Positionen ${centsToDecimal(lineSum)} != Summe Positionen ${centsToDecimal(lineExtensionCents)}`);
    }
    if (Math.abs(lineSum - netCents) > policy.totalsToleranceCents) {
      inconsistencies.push(`Positionen ${centsToDecimal(lineSum)} != Netto ${centsToDecimal(netCents)}`);
    }
    if (Math.abs(netCents + vatCents - grossCents) > policy.totalsToleranceCents) {
      inconsistencies.push(`Netto ${centsToDecimal(netCents)} + Steuer ${centsToDecimal(vatCents)} != Brutto ${centsToDecimal(grossCents)}`);
    }
    if (taxInclusiveCents !== null && Math.abs(taxInclusiveCents - grossCents) > policy.totalsToleranceCents) {
      inconsistencies.push(`Bruttobetrag ${centsToDecimal(taxInclusiveCents)} != Zahlbetrag ${centsToDecimal(grossCents)}`);
    }
  }
  if (inconsistencies.length) {
    checks.push(failed("totals_consistent", SEVERITY.HIGH, { expected: "Positionen = Netto; Netto + Steuer = Brutto", actual: inconsistencies.join("; "), reason: "Summen sind rechnerisch nicht konsistent" }));
  } else {
    checks.push(passed("totals_consistent", SEVERITY.HIGH, { expected: "Positionen = Netto; Netto + Steuer = Brutto", actual: `${centsToDecimal(netCents)} + ${centsToDecimal(vatCents)} = ${centsToDecimal(grossCents)}`, reason: "Summen sind rechnerisch konsistent" }));
  }

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
