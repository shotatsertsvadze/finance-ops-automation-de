import { createHash, randomUUID } from "node:crypto";
import { withTransaction } from "../../db.js";
import { runTechnicalValidation } from "../invoice/technical-validation.js";
import { runBusinessChecks } from "../validation/business-checks.js";
import { loadMasterData } from "../validation/lookup.js";
import { decide } from "../routing/decide.js";
import { SYSTEM, TransitionError, NotFoundError, recordEvent, transition, writeEvent } from "../workflow/transitions.js";
import { REPROCESSABLE_STATES } from "../workflow/states.js";
import { toCents, centsToDecimal } from "../money.js";
import { parseIsoDate } from "../dates.js";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/**
 * Stores the upload and creates the invoice in RECEIVED, or in DUPLICATE when
 * the identical file is already live. Intake facts are written here and never
 * touched again.
 */
export async function receiveInvoice({ pool, storage }, { buffer, originalFilename, sourceChannel, actor }) {
  const id = randomUUID();
  const fileSha256 = sha256(buffer);
  const filePath = await storage.writeOriginal(id, buffer);
  return withTransaction(pool, async (client) => {
    const { rows: existing } = await client.query(
      "select id from finops.invoices where file_sha256 = $1 and state <> 'DUPLICATE' limit 1",
      [fileSha256],
    );
    const duplicateOf = existing[0]?.id ?? null;
    const state = duplicateOf ? "DUPLICATE" : "RECEIVED";
    try {
      await client.query(
        `insert into finops.invoices (id, state, source_channel, original_filename, file_sha256, file_path, file_size_bytes, duplicate_of)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [id, state, sourceChannel, originalFilename, fileSha256, filePath, buffer.length, duplicateOf],
      );
    } catch (error) {
      if (error.code !== "23505") throw error;
      // Lost a race against an identical upload: record this one as the duplicate.
      throw new TransitionError("Gleiche Datei wurde gerade parallel verarbeitet, bitte erneut hochladen", { code: "CONCURRENT_DUPLICATE" });
    }
    if (duplicateOf) {
      await writeEvent(client, { invoiceId: id, actor, action: "duplicate_file_detected", fromState: null, toState: "DUPLICATE", reason: "Identische Datei (SHA-256) bereits vorhanden", evidence: { duplicate_of: duplicateOf, file_sha256: fileSha256 } });
      await recordEvent(client, { invoiceId: duplicateOf, actor, action: "duplicate_attempt", reason: "Identische Datei erneut hochgeladen", evidence: { duplicate_invoice_id: id } });
    } else {
      await writeEvent(client, { invoiceId: id, actor, action: "received", fromState: null, toState: "RECEIVED", reason: `Eingang über ${sourceChannel}`, evidence: { file_sha256: fileSha256, original_filename: originalFilename, size_bytes: buffer.length } });
    }
    return { id, state, duplicateOf };
  });
}

/**
 * Runs technical validation, business validation and routing for one invoice
 * in a single transaction. Allowed from RECEIVED, VALIDATING and
 * REVIEW_REQUIRED (re-validation). Everything else is a 409.
 */
export async function processInvoice({ pool, storage, policy, company }, invoiceId, actor = SYSTEM) {
  return withTransaction(pool, async (client) => {
    const { rows: [invoice] } = await client.query("select * from finops.invoices where id = $1 for update", [invoiceId]);
    if (!invoice) throw new NotFoundError(`Rechnung ${invoiceId} nicht gefunden`);
    if (!REPROCESSABLE_STATES.includes(invoice.state)) {
      throw new TransitionError(`Rechnung im Status ${invoice.state} kann nicht erneut verarbeitet werden`, { state: invoice.state });
    }
    if (invoice.state !== "VALIDATING") {
      await transition(client, { invoiceId, to: "VALIDATING", actor, action: invoice.state === "RECEIVED" ? "processing_started" : "reprocessing_started" });
    }
    const { rows: [{ run_no: runNo }] } = await client.query(
      "select coalesce(max(run_no), 0) + 1 as run_no from finops.validation_results where invoice_id = $1", [invoiceId],
    );

    const buffer = await storage.read(invoice.file_path);
    const technical = runTechnicalValidation(buffer);
    await saveChecks(client, invoiceId, runNo, "TECHNICAL", technical.checks);
    if (technical.parsed) await saveExtractedFields(client, invoiceId, technical.parsed);

    if (!technical.passed) {
      const decision = decide({ technicalChecks: technical.checks, businessChecks: [], grossCents: null, policy, hadException: invoice.had_exception });
      await saveDecision(client, invoiceId, runNo, decision, policy);
      await markException(client, invoiceId, decision.targetState);
      await transition(client, { invoiceId, to: decision.targetState, actor: SYSTEM, action: "technical_validation_failed", reason: decision.reviewReason, reviewReason: decision.reviewReason, evidence: { run_no: runNo, reasons: decision.reasons } });
      return finalState(client, invoiceId);
    }

    const master = await loadMasterData(client, technical.parsed, { excludeInvoiceId: invoiceId });
    const business = runBusinessChecks(technical.parsed, master, policy, company);
    await saveChecks(client, invoiceId, runNo, "BUSINESS", business.checks);
    await client.query("update finops.invoices set supplier_id = $2, purchase_order_id = $3 where id = $1", [invoiceId, business.supplierId, business.purchaseOrderId]);

    const decision = decide({
      technicalChecks: technical.checks, businessChecks: business.checks,
      grossCents: business.grossCents, policy, hadException: invoice.had_exception,
    });
    await saveDecision(client, invoiceId, runNo, decision, policy);
    await client.query("update finops.approval_steps set status = 'CANCELLED' where invoice_id = $1 and status = 'PENDING'", [invoiceId]);
    await client.query("delete from finops.approval_steps where invoice_id = $1 and status = 'CANCELLED'", [invoiceId]);
    for (const step of decision.requiredSteps) {
      await client.query("insert into finops.approval_steps (invoice_id, step_no, required_role) values ($1, $2, $3)", [invoiceId, step.step_no, step.required_role]);
    }
    await markException(client, invoiceId, decision.targetState);
    const action = { REVIEW: "routed_to_review", APPROVAL: "routed_to_approval", AUTO_APPROVE: "auto_approved" }[decision.decision];
    await transition(client, {
      invoiceId, to: decision.targetState, actor: SYSTEM, action,
      reason: decision.reviewReason ?? decision.reasons[0],
      reviewReason: decision.reviewReason,
      evidence: { run_no: runNo, decision: decision.decision, reasons: decision.reasons, required_steps: decision.requiredSteps, gross_amount: centsToDecimal(business.grossCents) },
    });
    return finalState(client, invoiceId);
  });
}

/** Upload entry point: receive, then process unless it was a duplicate. */
export async function handleUpload(deps, input) {
  const received = await receiveInvoice(deps, input);
  if (received.state === "DUPLICATE") return received;
  await processInvoice(deps, received.id, SYSTEM);
  return received;
}

/** Once an invoice has been an exception it stays flagged, for good. */
async function markException(client, invoiceId, targetState) {
  if (targetState !== "REVIEW_REQUIRED") return;
  await client.query("update finops.invoices set had_exception = true where id = $1", [invoiceId]);
}

async function saveChecks(client, invoiceId, runNo, phase, checks) {
  for (const c of checks) {
    await client.query(
      `insert into finops.validation_results (invoice_id, run_no, phase, check_code, status, severity, expected, actual, reason, recommended_action)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [invoiceId, runNo, phase, c.check, c.status, c.severity, c.expected, c.actual, c.reason, c.recommended_action],
    );
  }
}

async function saveExtractedFields(client, invoiceId, parsed) {
  const amount = (value) => (toCents(value) === null ? null : centsToDecimal(toCents(value)));
  // parseIsoDate, not a shape regex: an impossible date must become null here
  // rather than throwing inside the transaction and rolling back the checks.
  const date = (value) => parseIsoDate(value);
  await client.query(
    `update finops.invoices set format = $2, invoice_number = $3, issue_date = $4, due_date = $5, supplier_name_raw = $6,
       supplier_vat_id_raw = $7, supplier_iban_raw = $8, buyer_name_raw = $9, buyer_reference = $10, po_reference_raw = $11,
       currency = $12, net_amount = $13, vat_amount = $14, gross_amount = $15, payment_terms_raw = $16, parsed = $17, updated_at = now()
     where id = $1`,
    [invoiceId, parsed.format, parsed.invoiceNumber, date(parsed.issueDate), date(parsed.dueDate), parsed.supplier.name,
      parsed.supplier.vatId, parsed.payment.iban, parsed.buyer.name, parsed.buyerReference, parsed.poReference,
      parsed.currency, amount(parsed.totals.taxExclusive), amount(parsed.totals.taxAmount), amount(parsed.totals.payable),
      parsed.payment.terms, JSON.stringify(parsed)],
  );
  await client.query("delete from finops.invoice_lines where invoice_id = $1", [invoiceId]);
  const numeric = (value) => (/^-?\d+(\.\d+)?$/.test(value ?? "") ? value : null);
  for (const [i, line] of parsed.lines.entries()) {
    await client.query(
      `insert into finops.invoice_lines (invoice_id, line_no, description, quantity, unit_code, unit_price, line_net)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [invoiceId, i + 1, line.description, numeric(line.quantity), line.unitCode, numeric(line.unitPrice), amount(line.lineNet)],
    );
  }
}

async function saveDecision(client, invoiceId, runNo, decision, policy) {
  await client.query(
    `insert into finops.routing_decisions (invoice_id, run_no, decision, target_state, review_reason, required_steps, reasons, policy)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [invoiceId, runNo, decision.decision, decision.targetState, decision.reviewReason, JSON.stringify(decision.requiredSteps), JSON.stringify(decision.reasons), JSON.stringify(policy)],
  );
}

async function finalState(client, invoiceId) {
  const { rows: [row] } = await client.query("select id, state, review_reason from finops.invoices where id = $1", [invoiceId]);
  return row;
}
