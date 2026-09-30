/**
 * Generates a month of synthetic invoices so the dashboard has something
 * meaningful to show.
 *
 * Every invoice goes through the real pipeline: nothing is inserted straight
 * into a table, so the states and audit trails are genuine. Only the
 * timestamps are then shifted into the past, because a demo run otherwise
 * produces a median processing time of under a second and the cycle-time
 * figures say nothing.
 *
 * Synthetic data for a fictional company. Not a measurement of anything.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createPool } from "../server/db.js";
import { createStorage } from "../server/storage/files.js";
import { loadPolicy } from "../server/config/policy.js";
import { loadCompany } from "../server/config/company.js";
import { officialValidatorFromEnv } from "../server/integrations/kosit.js";
import { handleUpload } from "../server/domain/intake/intake.js";
import { decideApprovalStep, decideReview } from "../server/domain/approvals/approvals.js";
import { createAccountingRecord } from "../server/domain/accounting/accounting.js";
import { confirmPayment, createPaymentInstruction } from "../server/domain/payments/payments.js";
import { bookCredit } from "../server/domain/accounting/credit-notes.js";
import { settleByCredit } from "../server/domain/accounting/netting.js";
import { importStatement, runReconciliation } from "../server/domain/reconciliation/reconciliation.js";
import { human, SYSTEM } from "../server/domain/workflow/transitions.js";

const USERS = {
  clerk: "00000000-0000-0000-0000-000000000001",
  manager: "00000000-0000-0000-0000-000000000002",
  manager2: "00000000-0000-0000-0000-000000000003",
  finance: "00000000-0000-0000-0000-000000000004",
  finance2: "00000000-0000-0000-0000-000000000007",
  cfo: "00000000-0000-0000-0000-000000000005",
};

const SUPPLIERS = {
  S1: { no: "S-1001", name: "Berliner Bürobedarf GmbH", vat: "DE123456789", iban: "DE89370400440532013000", bic: "COBADEFFXXX",
    email: "rechnung@berliner-buerobedarf.example", street: "Chausseestraße 45", city: "Berlin", zip: "10115" },
  S2: { no: "S-1002", name: "Havel Logistik GmbH", vat: "DE234567890", iban: "DE02120300000000202051", bic: "BYLADEM1001",
    email: "billing@havel-logistik.example", street: "Hafenweg 3", city: "Potsdam", zip: "14467" },
  S3: { no: "S-1003", name: "Spree IT-Systeme AG", vat: "DE345678901", iban: "DE02500105170137075030", bic: "INGDDEFFXXX",
    email: "invoice@spree-it.example", street: "Friedrichstraße 200", city: "Berlin", zip: "10117" },
};

// The seeded orders are a small, readable master-data example. A month of
// invoices needs more capacity than that: invoices consume their order's
// capacity, and too little would turn every later invoice into a PO exception
// and drown out the other cases.
const ORDERS_PER_SUPPLIER = 4;
const ORDER_AMOUNT = "18000.00";
const SMALL_ORDER = "DEMO-PO-KLEIN";

async function seedDemoOrders(pool) {
  for (const [key, supplier] of Object.entries(SUPPLIERS)) {
    for (let i = 1; i <= ORDERS_PER_SUPPLIER; i += 1) {
      await pool.query(
        `insert into finops.purchase_orders (po_number, supplier_id, approved_amount, remaining_amount, cost_center, status)
         select $1, s.id, $2, $2, s.default_cost_center, 'OPEN' from finops.suppliers s where s.supplier_no = $3
         on conflict (po_number) do nothing`,
        [`DEMO-PO-${key}-${i}`, ORDER_AMOUNT, supplier.no],
      );
    }
  }
  // One deliberately small order, so the overrun case still appears.
  await pool.query(
    `insert into finops.purchase_orders (po_number, supplier_id, approved_amount, remaining_amount, cost_center, status)
     select $1, s.id, '500.00', '500.00', s.default_cost_center, 'OPEN' from finops.suppliers s where s.supplier_no = 'S-1001'
     on conflict (po_number) do nothing`,
    [SMALL_ORDER],
  );
}

const orderFor = (key, random) => `DEMO-PO-${key}-${Math.floor(random() * ORDERS_PER_SUPPLIER) + 1}`;
const WRONG_IBAN = "DE75512108001245126199";

const pad = (n, w = 5) => String(n).padStart(w, "0");
const money = (cents) => (cents / 100).toFixed(2);

function invoiceXml({ number, issueDate, dueDate, supplier, iban, netCents, po, discountCents = 0, creditNote = false, credits = null }) {
  const root = creditNote ? "CreditNote" : "Invoice";
  const rootNs = `urn:oasis:names:specification:ubl:schema:xsd:${root}-2`;
  const lineTag = creditNote ? "CreditNoteLine" : "InvoiceLine";
  const quantityTag = creditNote ? "CreditedQuantity" : "InvoicedQuantity";
  const typeTag = creditNote ? "CreditNoteTypeCode" : "InvoiceTypeCode";
  const billingReference = credits
    ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${credits}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`
    : "";
  const net = netCents - discountCents;
  const vat = Math.round(net * 0.19);
  const gross = net + vat;
  return `<?xml version="1.0" encoding="UTF-8"?>
<ubl:${root} xmlns:ubl="${rootNs}"
             xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
             xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${number}</cbc:ID>
  <cbc:IssueDate>${issueDate}</cbc:IssueDate>
  ${creditNote ? "" : `<cbc:DueDate>${dueDate}</cbc:DueDate>`}
  <cbc:${typeTag}>${creditNote ? "381" : "380"}</cbc:${typeTag}>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>NORDWERK-EINKAUF-01</cbc:BuyerReference>
  <cac:OrderReference><cbc:ID>${po}</cbc:ID></cac:OrderReference>
  ${billingReference}
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="EM">${supplier.email}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>${supplier.name}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>${supplier.street}</cbc:StreetName><cbc:CityName>${supplier.city}</cbc:CityName><cbc:PostalZone>${supplier.zip}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>${supplier.vat}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplier.name}</cbc:RegistrationName></cac:PartyLegalEntity>
    <cac:Contact><cbc:Name>Rechnungsstelle</cbc:Name><cbc:Telephone>+49 30 0000000</cbc:Telephone><cbc:ElectronicMail>${supplier.email}</cbc:ElectronicMail></cac:Contact>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="EM">rechnungen@nordwerk.example</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Nordwerk GmbH</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Industriestraße 12</cbc:StreetName><cbc:CityName>Berlin</cbc:CityName><cbc:PostalZone>12277</cbc:PostalZone><cac:Country><cbc:IdentificationCode>DE</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>DE999999999</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Nordwerk GmbH</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    ${creditNote ? `<cbc:PaymentDueDate>${dueDate}</cbc:PaymentDueDate>` : ""}
    <cbc:PaymentID>${number}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>${iban}</cbc:ID><cbc:Name>${supplier.name}</cbc:Name>
      <cac:FinancialInstitutionBranch><cbc:ID>${supplier.bic}</cbc:ID></cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:PaymentTerms><cbc:Note>Zahlbar innerhalb von 30 Tagen ohne Abzug</cbc:Note></cac:PaymentTerms>
  ${discountCents ? `<cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode>
    <cbc:AllowanceChargeReason>Skonto laut Rahmenvereinbarung</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="EUR">${money(discountCents)}</cbc:Amount>
    <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
  </cac:AllowanceCharge>` : ""}
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${money(vat)}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="EUR">${money(net)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="EUR">${money(vat)}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="EUR">${money(netCents)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="EUR">${money(net)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="EUR">${money(gross)}</cbc:TaxInclusiveAmount>
    ${discountCents ? `<cbc:AllowanceTotalAmount currencyID="EUR">${money(discountCents)}</cbc:AllowanceTotalAmount>` : ""}
    <cbc:PayableAmount currencyID="EUR">${money(gross)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:${lineTag}>
    <cbc:ID>1</cbc:ID>
    <cbc:${quantityTag} unitCode="C62">1</cbc:${quantityTag}>
    <cbc:LineExtensionAmount currencyID="EUR">${money(netCents)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Leistung laut Bestellung ${po}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">${money(netCents)}</cbc:PriceAmount></cac:Price>
  </cac:${lineTag}>
</ubl:${root}>
`;
}

/** Deterministic pseudo-random, so a demo run is reproducible. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

const iso = (date) => date.toISOString().slice(0, 10);

export async function generateDemoData(deps, { count = 70, seed = 42 } = {}) {
  const random = rng(seed);
  await seedDemoOrders(deps.pool);
  const today = new Date();
  const summary = { created: 0, auto: 0, approved: 0, exceptions: 0, paid: 0, reconciled: 0, credited: 0, netted: 0 };
  const created = [];

  for (let i = 0; i < count; i += 1) {
    const daysAgo = Math.floor(random() * 30) + 1;
    const receivedAt = new Date(today.getTime() - daysAgo * 86400000);
    const supplierKey = ["S1", "S2", "S3"][Math.floor(random() * 3)];
    const supplier = SUPPLIERS[supplierKey];
    const order = orderFor(supplierKey, random);
    const roll = random();

    // Mix chosen so the dashboard shows a believable spread, not a perfect run.
    let scenario = "auto";
    if (roll > 0.94) scenario = "iban";
    else if (roll > 0.88) scenario = "po_overrun";
    else if (roll > 0.84) scenario = "malformed";
    else if (roll > 0.60) scenario = "approval";

    const netCents = scenario === "auto" ? 8000 + Math.floor(random() * 32000)
      : scenario === "approval" ? 60000 + Math.floor(random() * 400000)
      : scenario === "po_overrun" ? 120000
      : 50000 + Math.floor(random() * 150000);

    // A supplier who over-charged sends a credit note. It runs the same checks
    // and is booked rather than paid.
    const isCreditNote = scenario === "auto" && random() > 0.85;

    // A discount is ordinary commercial practice, not an exception: these
    // should pass every check and flow through like any other invoice.
    const discountCents = scenario === "auto" || scenario === "approval"
      ? (random() > 0.8 ? Math.round(netCents * 0.03) : 0)
      : 0;

    const number = `DEMO-2026-${pad(1000 + i)}`;
    const issueDate = iso(new Date(receivedAt.getTime() - 86400000));
    const dueDate = iso(new Date(receivedAt.getTime() + 30 * 86400000));
    const xml = scenario === "malformed"
      ? invoiceXml({ number, issueDate, dueDate, supplier, iban: supplier.iban, netCents, po: supplier.po })
          .replace(/<cbc:TaxExclusiveAmount[^<]*<\/cbc:TaxExclusiveAmount>/, '<cbc:TaxExclusiveAmount currencyID="EUR">nicht-lesbar</cbc:TaxExclusiveAmount>')
      : invoiceXml({
          number, issueDate, dueDate, supplier,
          iban: scenario === "iban" ? WRONG_IBAN : supplier.iban,
          netCents, discountCents, po: scenario === "po_overrun" ? SMALL_ORDER : order,
          creditNote: isCreditNote, credits: isCreditNote ? `DEMO-2026-${pad(1000 + Math.max(0, i - 3))}` : null,
        });

    const received = await handleUpload(deps, {
      buffer: Buffer.from(xml, "utf8"),
      originalFilename: `${number}.xml`,
      sourceChannel: random() > 0.3 ? "EMAIL" : "UPLOAD",
      actor: SYSTEM,
    });
    created.push({ id: received.id, receivedAt, scenario });
    summary.created += 1;
  }

  // Advance a realistic share of the population through the human steps.
  for (const { id, scenario } of created) {
    const { rows: [invoice] } = await deps.pool.query("select state from finops.invoices where id = $1", [id]);
    if (!invoice) continue;

    if (invoice.state === "REVIEW_REQUIRED") {
      summary.exceptions += 1;
      // Most exceptions get cleared; some are still open, which is realistic.
      const cleared = random() > 0.35;
      if (cleared && scenario === "iban") {
        // A changed IBAN cannot be accepted, only verified into master data
        // (ADR-052). The realistic next step is the call-back.
        await decideReview(deps, { invoiceId: id, action: "request-info", actor: human(USERS.clerk), comment: "Rückruf beim Lieferanten zur Bankverbindung" });
        continue;
      } else if (cleared && scenario !== "malformed") {
        await decideReview(deps, { invoiceId: id, action: "accept", actor: human(USERS.clerk), comment: "Mit Lieferant geklärt" });
      } else {
        continue;
      }
    }

    const { rows: [afterReview] } = await deps.pool.query("select state from finops.invoices where id = $1", [id]);
    if (afterReview.state === "READY_FOR_APPROVAL" && random() > 0.2) {
      const { rows: steps } = await deps.pool.query(
        "select step_no, required_role from finops.approval_steps where invoice_id = $1 and status = 'PENDING' order by step_no", [id],
      );
      // Mira signs, Jonas pays: a signer may not pay (ADR-056).
      const approver = { MANAGER: USERS.manager2, FINANCE: USERS.finance2, CFO: USERS.cfo };
      for (const step of steps) {
        await decideApprovalStep(deps, {
          invoiceId: id, stepNo: step.step_no, action: "approve",
          actor: human(approver[step.required_role]), user: { role: step.required_role }, comment: null,
        });
      }
    }

    const { rows: [afterApproval] } = await deps.pool.query("select state from finops.invoices where id = $1", [id]);
    if (afterApproval.state === "APPROVED") {
      summary.approved += 1;
      const { rows: [doc] } = await deps.pool.query("select document_type from finops.invoices where id = $1", [id]);
      // A credit note always runs to the end. Leaving it to the same dice as
      // an invoice would mostly show one stranded before the booking, which is
      // not what the path looks like.
      if (doc.document_type === "CREDIT_NOTE") {
        await createAccountingRecord(deps, { invoiceId: id, actor: human(USERS.finance) });
        await bookCredit(deps, { invoiceId: id, actor: human(USERS.finance) });
        summary.credited += 1;
      } else if (random() > 0.25) {
        await createAccountingRecord(deps, { invoiceId: id, actor: human(USERS.finance) });
        if (random() > 0.2) {
          // The supplier's open credits may cover this invoice entirely, in
          // which case there is nothing to send and it is settled instead.
          const { rows: [state] } = await deps.pool.query(
            `select (i.gross_amount <= coalesce((
               select sum(c.gross_amount - coalesce((
                 select sum(a.amount) from finops.credit_applications a where a.credit_note_id = c.id
               ), 0))
               from finops.invoices c
               where c.supplier_id = i.supplier_id and c.document_type = 'CREDIT_NOTE' and c.state = 'CREDITED'
             ), 0)) as covered
             from finops.invoices i where i.id = $1`, [id],
          );
          if (state.covered) {
            await settleByCredit(deps, { invoiceId: id, actor: human(USERS.finance) });
          } else {
            await createPaymentInstruction(deps, { invoiceId: id, actor: human(USERS.finance) });
            await confirmPayment(deps, { invoiceId: id, actor: human(USERS.finance), providerRef: null });
            summary.paid += 1;
          }
        }
      }
    }
  }

  const { rows: [netting] } = await deps.pool.query(
    "select count(distinct invoice_id)::int as invoices, coalesce(sum(amount), 0)::text as total from finops.credit_applications",
  );
  summary.netted = netting.invoices;
  summary.netted_amount = netting.total;

  await backdate(deps.pool, created, random);
  Object.assign(summary, await settlePayments(deps, random));
  // Counted from the audit trail: straight-through approvals happen inside the
  // upload, where the loop above does not see them.
  const { rows: [straight] } = await deps.pool.query(
    "select count(distinct invoice_id)::int as n from finops.audit_events where action = 'auto_approved'",
  );
  summary.auto = straight.n;
  return summary;
}

/** The four transactions that belong to the hand-written fixtures A and G. */
const FIXTURE_TRANSACTIONS = [
  { external_id: "TX-2026-09-0001", value_date: "2026-09-20", amount: "-1240.00", currency: "EUR",
    counterparty_name: "Berliner Buerobedarf GmbH", counterparty_iban: "DE89370400440532013000",
    reference: "Rechnung INV-2026-00421 Nordwerk GmbH Kd-Nr 4471" },
  { external_id: "TX-2026-09-0002", value_date: "2026-09-21", amount: "-380.00", currency: "EUR",
    counterparty_name: "Berliner Buerobedarf GmbH", counterparty_iban: "DE89370400440532013000",
    reference: "Sammelzahlung September ohne Einzelbeleg" },
  { external_id: "TX-2026-09-0003", value_date: "2026-09-22", amount: "-350.00", currency: "EUR",
    counterparty_name: "Berliner Buerobedarf GmbH", counterparty_iban: "DE89370400440532013000",
    reference: "Teilzahlung zu INV-2026-00433" },
  { external_id: "TX-2026-09-0004", value_date: "2026-09-23", amount: "-980.00", currency: "EUR",
    counterparty_name: "Unbekannter Absender", counterparty_iban: "DE02300209000106531065",
    reference: "Gutschrift ohne Zuordnung" },
];

/**
 * Builds the bank statement that answers the demo's own payments, imports it
 * and reconciles it.
 *
 * The shipped statement names the fixture invoices, which a generated
 * population does not contain; without a statement of its own no generated
 * payment would reach RECONCILED.
 *
 * The statement is deliberately imperfect. A month of bank lines that all match
 * would demonstrate nothing: the point of the stage is what happens when one
 * does not.
 */
async function settlePayments(deps, random) {
  const { rows: payments } = await deps.pool.query(
    `select p.reference, p.amount, p.currency, p.creditor_iban, p.creditor_name, i.updated_at
     from finops.payment_instructions p
     join finops.invoices i on i.id = p.invoice_id
     where i.state = 'PAID'
     order by p.reference`,
  );

  const transactions = [];
  const valueDate = (row, days) => iso(new Date(new Date(row.updated_at).getTime() + days * 86400000));
  let n = 0;
  const id = () => `TX-DEMO-${String((n += 1)).padStart(4, "0")}`;

  payments.forEach((payment, index) => {
    // Every seventeenth payment, two in the default month, the bank has not
    // reported yet: a statement is a snapshot, not a complete ledger.
    if (index % 17 === 5) return;

    const base = {
      external_id: id(),
      value_date: valueDate(payment, 1 + Math.floor(random() * 3)),
      currency: payment.currency,
      counterparty_name: payment.creditor_name,
      counterparty_iban: payment.creditor_iban,
      reference: `Rechnung ${payment.reference}`,
    };

    if (index % 23 === 7) {
      // Short payment: the reference is right, the amount is not.
      transactions.push({ ...base, amount: `-${(Number(payment.amount) - 40).toFixed(2)}`, reference: `Teilzahlung ${payment.reference}` });
      return;
    }
    if (index % 29 === 11) {
      // Paid to an account that is not the one on the instruction.
      transactions.push({ ...base, amount: `-${payment.amount}`, counterparty_iban: "DE02300209000106531065", counterparty_name: "Abweichendes Konto" });
      return;
    }
    if (index % 31 === 13) {
      // Right amount, no invoice named: amount alone must never be enough.
      transactions.push({ ...base, amount: `-${payment.amount}`, reference: "Sammelzahlung September ohne Einzelbeleg" });
      return;
    }
    transactions.push({ ...base, amount: `-${payment.amount}` });
  });

  const statement = {
    account_iban: "DE02100500000012345678",
    account_holder: "Nordwerk GmbH",
    statement_period: "2026-09",
    note: "Synthetischer Kontoauszug, erzeugt von scripts/demo-data.js",
    transactions: [...FIXTURE_TRANSACTIONS, ...transactions],
  };
  await writeFile(
    new URL("../client/public/demo/statement_2026-09.json", import.meta.url),
    `${JSON.stringify(statement, null, 2)}\n`,
  );

  await importStatement(deps, { statement });
  const result = await runReconciliation(deps, { actor: human(USERS.finance) });
  return { statement_lines: statement.transactions.length, reconciled: result.matched, bank_exceptions: result.exceptions };
}

/**
 * Shifts each invoice's timeline into the past, preserving event order and
 * inserting plausible gaps between stages. Without this every cycle-time
 * measurement is a fraction of a second.
 *
 * Uses the seeded generator, not Math.random: the timings decide the statement
 * value dates, and a demo the module calls reproducible must not rewrite a
 * committed file on every run.
 */
async function backdate(pool, created, random) {
  for (const { id, receivedAt } of created) {
    const { rows: events } = await pool.query(
      "select id, action from finops.audit_events where invoice_id = $1 order by occurred_at, id", [id],
    );
    if (events.length === 0) continue;

    let cursor = new Date(receivedAt);
    for (const event of events) {
      // Machine steps follow within seconds; human steps take hours or days.
      const gapMinutes = {
        received: 0,
        processing_started: 0.2,
        reprocessing_started: 0.2,
        routed_to_review: 0.1,
        routed_to_approval: 0.1,
        auto_approved: 0.1,
        technical_validation_failed: 0.1,
        duplicate_file_detected: 0.1,
        review_accepted: 60 * (4 + random() * 40),
        approval_step_approved: 60 * (6 + random() * 48),
        approved: 60 * (6 + random() * 48),
        accounting_record_created: 60 * (2 + random() * 20),
        payment_instructed: 60 * (12 + random() * 36),
        payment_confirmed: 60 * (12 + random() * 24),
      }[event.action] ?? 30;
      cursor = new Date(cursor.getTime() + gapMinutes * 60000);
      await pool.query("update finops.audit_events set occurred_at = $2 where id = $1", [event.id, cursor]);
    }
    await pool.query("update finops.invoices set received_at = $2, updated_at = $3 where id = $1", [id, receivedAt, cursor]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // The same storage the API reads. Writing demo originals to a temp directory
  // left every generated invoice with a file_path the running app could not
  // open, so "Original-XML ansehen" answered 500 for the whole demo set.
  const deps = {
    pool: createPool(),
    storage: createStorage(process.env.STORAGE_DIR ?? "./storage"),
    policy: loadPolicy(),
    company: loadCompany(),
    officialValidator: officialValidatorFromEnv(),
  };
  generateDemoData(deps, { count: Number(process.env.DEMO_COUNT ?? 70) })
    .then((summary) => {
      console.log("demo data generated (synthetic):", summary);
      return deps.pool.end();
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
