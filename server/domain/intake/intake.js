import { createHash, randomUUID } from "node:crypto";
import { NotFoundError, TransitionError } from "../errors.js";
import { withTransaction } from "../../db.js";
import { runTechnicalValidation } from "../invoice/technical-validation.js";
import { saveOfficialValidation, validateOfficially } from "../invoice/official-validation.js";
import { runBusinessChecks } from "../validation/business-checks.js";
import { loadMasterData } from "../validation/lookup.js";
import { decide } from "../routing/decide.js";
import { SYSTEM, recordEvent, transition, writeEvent } from "../workflow/transitions.js";
import { REPROCESSABLE_STATES } from "../workflow/states.js";
import { toCents, centsToDecimal } from "../money.js";
import { parseIsoDate } from "../dates.js";
import { startRound } from "../approvals/rounds.js";

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/**
 * States an invoice is in only while its first processing run has not
 * finished. Receiving and processing are separate transactions on purpose, so
 * a run that falls over leaves the arrival on the record; these are the states
 * that means (ADR-044).
 */
const UNFINISHED_INTAKE = ["RECEIVED", "VALIDATING"];

/**
 * Deps built without a validator: none configured, and required in
 * production, so a caller that forgot it fails closed there (ADR-078).
 */
const UNCONFIGURED = { client: null, required: process.env.NODE_ENV === "production" };

/**
 * Stores the upload and creates the invoice in RECEIVED, or in DUPLICATE when
 * the identical file is already live. Intake facts are written here and never
 * touched again.
 *
 * Sending the same file again while its first run never finished resumes that
 * invoice instead of recording a duplicate. A stranded row is not a live
 * invoice: counting it as one would make re-sending, the obvious thing for a
 * sender to try, the one thing that cannot work (ADR-044).
 */
export async function receiveInvoice({ pool, storage }, { buffer, originalFilename, sourceChannel, actor }) {
  const id = randomUUID();
  const fileSha256 = sha256(buffer);
  return withTransaction(pool, async (client) => {
    // `for update` rather than a plain read: a run that is processing this
    // invoice right now holds the row, so this waits and then sees where it
    // actually ended instead of racing it.
    const { rows: existing } = await client.query(
      "select id, state from finops.invoices where file_sha256 = $1 and state <> 'DUPLICATE' limit 1 for update",
      [fileSha256],
    );
    const live = existing[0] ?? null;

    if (live && UNFINISHED_INTAKE.includes(live.state)) {
      await recordEvent(client, {
        invoiceId: live.id, actor, action: "intake_resumed",
        reason: `Dieselbe Datei erneut übermittelt, Verarbeitung wird fortgesetzt (${sourceChannel})`,
        evidence: { file_sha256: fileSha256, original_filename: originalFilename, stalled_in: live.state },
      });
      return { id: live.id, state: live.state, duplicateOf: null, resumed: true };
    }

    // Written only once it is clear a row will reference it; a resumption
    // would otherwise leave a second copy of identical bytes behind.
    const filePath = await storage.writeOriginal(id, buffer);
    try {
      return await recordReceipt(client, {
        id, filePath, duplicateOf: live?.id ?? null, buffer, fileSha256, originalFilename, sourceChannel, actor,
      });
    } catch (error) {
      // Nothing committed can refer to the file yet, so it goes with the row.
      // A failed commit is not caught here: whether the row made it is then
      // uncertain, and a spare file is better than a lost original (ADR-062).
      await storage.discardUnreferenced(id);
      throw error;
    }
  });
}

async function recordReceipt(client, { id, filePath, duplicateOf, buffer, fileSha256, originalFilename, sourceChannel, actor }) {
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
    throw new TransitionError("CONCURRENT_DUPLICATE", "Gleiche Datei wurde gerade parallel verarbeitet, bitte erneut hochladen");
  }
  if (duplicateOf) {
    await writeEvent(client, { invoiceId: id, actor, action: "duplicate_file_detected", fromState: null, toState: "DUPLICATE", reason: "Identische Datei (SHA-256) bereits vorhanden", evidence: { duplicate_of: duplicateOf, file_sha256: fileSha256 } });
    await recordEvent(client, { invoiceId: duplicateOf, actor, action: "duplicate_attempt", reason: "Identische Datei erneut hochgeladen", evidence: { duplicate_invoice_id: id } });
  } else {
    await writeEvent(client, { invoiceId: id, actor, action: "received", fromState: null, toState: "RECEIVED", reason: `Eingang über ${sourceChannel}`, evidence: { file_sha256: fileSha256, original_filename: originalFilename, size_bytes: buffer.length } });
  }
  return { id, state, duplicateOf, resumed: false };
}

/**
 * Runs technical validation, business validation and routing for one invoice
 * in a single transaction. Allowed from RECEIVED, VALIDATING and
 * REVIEW_REQUIRED (re-validation). Everything else is a 409.
 */
export async function processInvoice(deps, invoiceId, actor = SYSTEM) {
  return withTransaction(deps.pool, (client) => processInTransaction(client, deps, invoiceId, actor));
}

/**
 * The same run inside the caller's transaction, so a caller that must record
 * something about the run commits both or neither. `cause` goes into the
 * start event's evidence: what asked for this run.
 */
export async function processInTransaction(client, { storage, policy, company, officialValidator = UNCONFIGURED }, invoiceId, actor = SYSTEM, cause = {}) {
  const { rows: [invoice] } = await client.query("select * from finops.invoices where id = $1 for update", [invoiceId]);
  if (!invoice) throw new NotFoundError("INVOICE_NOT_FOUND", `Rechnung ${invoiceId} nicht gefunden`);
  if (!REPROCESSABLE_STATES.includes(invoice.state)) {
    throw new TransitionError("NOT_REPROCESSABLE", `Rechnung im Status ${invoice.state} kann nicht erneut verarbeitet werden`, { state: invoice.state });
  }
  if (invoice.state !== "VALIDATING") {
    await transition(client, {
      invoiceId, to: "VALIDATING", actor, action: invoice.state === "RECEIVED" ? "processing_started" : "reprocessing_started", evidence: cause,
    });
  }
  const { rows: [{ run_no: runNo }] } = await client.query(
    "select coalesce(max(run_no), 0) + 1 as run_no from finops.validation_results where invoice_id = $1", [invoiceId],
  );

  const buffer = await storage.read(invoice.file_path);
  const technical = runTechnicalValidation(buffer);
  // After the parser, before the business checks: only a document the parser
  // could read is sent, and a FAILED answer is a technical failure (ADR-078).
  const official = await validateOfficially(officialValidator, {
    buffer, name: invoiceId, documentSha256: invoice.file_sha256, readable: Boolean(technical.parsed),
  });
  const technicalChecks = [...technical.checks, official.check];
  await saveChecks(client, invoiceId, runNo, "TECHNICAL", technicalChecks);
  if (official.record) await saveOfficialValidation(client, invoiceId, runNo, official.record);
  if (technical.parsed) await saveExtractedFields(client, invoiceId, technical.parsed);

  if (!technical.passed || official.check.status === "FAILED") {
    const decision = decide({ technicalChecks, businessChecks: [], grossCents: null, policy, hadException: invoice.had_exception });
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
    technicalChecks, businessChecks: business.checks,
    grossCents: business.grossCents, policy, hadException: invoice.had_exception,
  });
  await saveDecision(client, invoiceId, runNo, decision, policy);
  await client.query("update finops.approval_steps set status = 'CANCELLED' where invoice_id = $1 and status = 'PENDING'", [invoiceId]);
  await startRound(client, invoiceId, decision.requiredSteps);
  await markException(client, invoiceId, decision.targetState);
  const action = { REVIEW: "routed_to_review", APPROVAL: "routed_to_approval", AUTO_APPROVE: "auto_approved" }[decision.decision];
  await transition(client, {
    invoiceId, to: decision.targetState, actor: SYSTEM, action,
    reason: decision.reviewReason ?? decision.reasons[0],
    reviewReason: decision.reviewReason,
    evidence: { run_no: runNo, decision: decision.decision, reasons: decision.reasons, required_steps: decision.requiredSteps, gross_amount: centsToDecimal(business.grossCents) },
  });
  return finalState(client, invoiceId);
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
       currency = $12, net_amount = $13, vat_amount = $14, gross_amount = $15, payment_terms_raw = $16, parsed = $17,
       document_type = $18, credits_invoice_raw = $19, updated_at = now()
     where id = $1`,
    [invoiceId, parsed.format, parsed.invoiceNumber, date(parsed.issueDate), date(parsed.dueDate), parsed.supplier.name,
      parsed.supplier.vatId, parsed.payment.iban, parsed.buyer.name, parsed.buyerReference, parsed.poReference,
      parsed.currency, amount(parsed.totals.taxExclusive), amount(parsed.totals.taxAmount), amount(parsed.totals.payable),
      parsed.payment.terms, JSON.stringify(parsed), parsed.documentType ?? "INVOICE", parsed.creditedInvoice ?? null],
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
