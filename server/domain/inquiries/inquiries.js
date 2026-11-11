import { withTransaction } from "../../db.js";
import { NotFoundError, RuleError } from "../errors.js";
import { recordEvent } from "../workflow/transitions.js";
import { decideReview } from "../approvals/approvals.js";
import { BANK_DETAILS, inquiryRefusal, inquiryScope } from "./requests.js";
import { availablePlaceholders, fill, placeholderValues, placeholdersIn } from "./placeholders.js";
import { templateInquiry } from "./template.js";

/**
 * Supplier inquiries as people handle them (ADR-084). Three states, kept
 * apart: a draft (the template here, or an AI draft in domain/ai), a text a
 * person approved (`supplier_inquiries`), and an inquiry the person says they
 * sent by hand, which is the existing review action `request-info` and so
 * the audit event that names it. Approving moves nothing.
 */
export const INQUIRY_STATES = ["REVIEW_REQUIRED"];
const LIMITS = { subject: 200, body: 4000 };

/** The invoice's state, its latest validation run and the checks that failed in it. */
async function latestRun(db, invoiceId) {
  const {
    rows: [invoice],
  } = await db.query("select state from finops.invoices where id = $1", [invoiceId]);
  if (!invoice) return null;
  const { rows } = await db.query(
    `select run_no, check_code from finops.validation_results
     where invoice_id = $1 and run_no = (select max(run_no) from finops.validation_results where invoice_id = $1) and status = 'FAILED'
     order by phase, id`,
    [invoiceId],
  );
  const {
    rows: [last],
  } = await db.query("select max(run_no) as run_no from finops.validation_results where invoice_id = $1", [invoiceId]);
  return { state: invoice.state, runNo: last.run_no, failed: rows.map((row) => row.check_code) };
}

/** Whether an inquiry is possible now, and if not, the refusal code. */
function scopeOf(run) {
  if (!INQUIRY_STATES.includes(run.state)) return { eligible: false, code: "INQUIRY_NOT_IN_REVIEW" };
  return inquiryScope(run.failed);
}

const rendered = ({ subject, body }, values) => ({ subject: fill(subject, values), body: fill(body, values) });

async function approvedInquiries(pool, invoiceId) {
  const { rows } = await pool.query(
    `select q.id, q.run_no, q.source, q.ai_inquiry_id, q.subject, q.body, q.approved_at, a.name as approved_by_name,
            e.occurred_at as sent_at, s.name as sent_by_name
     from finops.supplier_inquiries q
     join finops.users a on a.id = q.approved_by
     left join finops.audit_events e on e.invoice_id = q.invoice_id and e.action = 'information_requested'
       and e.evidence->>'supplier_inquiry_id' = q.id::text
     left join finops.users s on s.id = e.actor_id
     where q.invoice_id = $1 order by q.approved_at, q.id`,
    [invoiceId],
  );
  return rows.map((row) => ({ ...row, status: row.sent_at ? "SENT" : "APPROVED" }));
}

/** What the inquiry panel shows: whether an inquiry is possible, the template, and what was approved and sent. */
export async function inquiryOverview(deps, invoiceId) {
  const run = await latestRun(deps.pool, invoiceId);
  if (!run) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
  const values = await placeholderValues(deps.pool, deps.company, invoiceId);
  const scope = scopeOf(run);
  return {
    state: run.state,
    run_no: run.runNo,
    eligible: scope.eligible,
    code: scope.eligible ? null : scope.code,
    checks: scope.eligible ? scope.checks : [],
    template: scope.eligible ? rendered(templateInquiry(scope.checks, availablePlaceholders(values)), values) : null,
    inquiries: await approvedInquiries(deps.pool, invoiceId),
  };
}

/** The text as a person may approve it: complete, within bounds, and without bank details. */
function approvableText(subject, body) {
  const text = { subject: String(subject ?? "").trim(), body: String(body ?? "").trim() };
  if (!text.subject || !text.body || text.subject.length > LIMITS.subject || text.body.length > LIMITS.body) {
    throw new RuleError(400, "INQUIRY_TEXT_INVALID", "Betreff und Text der Rückfrage sind leer oder zu lang");
  }
  const all = `${text.subject}\n${text.body}`;
  if (placeholdersIn(all).length) {
    throw new RuleError(422, "INQUIRY_PLACEHOLDER_OPEN", "Die Rückfrage enthält noch Platzhalter, die nicht ersetzt sind");
  }
  if (BANK_DETAILS.test(all)) {
    throw new RuleError(
      422,
      "INQUIRY_BANK_DETAILS",
      "Eine Lieferantenrückfrage nennt keine Bankdaten; Bankverbindungen werden per Rückruf geprüft",
    );
  }
  return text;
}

/** A person approves an inquiry text. The invoice does not move; the audit trail records who approved what. */
export async function approveInquiry(deps, invoiceId, { source, aiInquiryId = null, subject, body }, actor) {
  if (!["AI", "TEMPLATE"].includes(source)) throw new RuleError(400, "INQUIRY_SOURCE_UNKNOWN", "Quelle der Rückfrage: AI oder TEMPLATE");
  const text = approvableText(subject, body);
  return withTransaction(deps.pool, async (client) => {
    const {
      rows: [locked],
    } = await client.query("select id from finops.invoices where id = $1 for update", [invoiceId]);
    if (!locked) throw new NotFoundError("INVOICE_NOT_FOUND", "Rechnung nicht gefunden");
    const run = await latestRun(client, invoiceId);
    const scope = scopeOf(run);
    if (!scope.eligible) throw inquiryRefusal(scope.code);
    if (source === "AI") {
      const {
        rows: [draft],
      } = await client.query(
        "select id from finops.ai_supplier_inquiries where id = $1 and invoice_id = $2 and run_no = $3 and status = 'ACCEPTED'",
        [aiInquiryId, invoiceId, run.runNo],
      );
      if (!draft) throw new RuleError(409, "INQUIRY_DRAFT_UNKNOWN", "Kein angenommener KI-Entwurf zu diesem Prüflauf");
    }
    const {
      rows: [row],
    } = await client.query(
      `insert into finops.supplier_inquiries (invoice_id, run_no, source, ai_inquiry_id, subject, body, approved_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id, run_no, source, ai_inquiry_id, subject, body, approved_at`,
      [invoiceId, run.runNo, source, source === "AI" ? aiInquiryId : null, text.subject, text.body, actor.id],
    );
    await recordEvent(client, {
      invoiceId,
      actor,
      action: "supplier_inquiry_approved",
      reason: text.subject,
      evidence: { supplier_inquiry_id: row.id, source, ai_inquiry_id: row.ai_inquiry_id },
    });
    return row;
  });
}

/**
 * A person says they sent an approved inquiry by hand. Only now does the
 * invoice move to INFO_REQUESTED, through the existing review action, and the
 * audit event names the inquiry.
 */
export async function markInquirySent(deps, invoiceId, inquiryId, actor) {
  const {
    rows: [inquiry],
  } = await deps.pool.query("select id, run_no, source, subject from finops.supplier_inquiries where id = $1 and invoice_id = $2", [
    inquiryId,
    invoiceId,
  ]);
  if (!inquiry) throw new NotFoundError("INQUIRY_NOT_FOUND", "Rückfrage nicht gefunden");
  const {
    rows: [sent],
  } = await deps.pool.query(
    "select 1 from finops.audit_events where invoice_id = $1 and action = 'information_requested' and evidence->>'supplier_inquiry_id' = $2",
    [invoiceId, inquiry.id],
  );
  if (sent) throw new RuleError(409, "INQUIRY_ALREADY_SENT", "Diese Rückfrage ist bereits als versendet vermerkt");
  const run = await latestRun(deps.pool, invoiceId);
  if (run.runNo !== inquiry.run_no) {
    throw new RuleError(409, "INQUIRY_OUTDATED", "Die Rechnung wurde seit der Freigabe neu geprüft; bitte die Rückfrage neu freigeben");
  }
  await decideReview(deps, {
    invoiceId,
    action: "request-info",
    actor,
    comment: `Lieferantenrückfrage von Hand versendet: ${inquiry.subject}`,
    evidence: { supplier_inquiry_id: inquiry.id, source: inquiry.source, sent_by_hand: true },
  });
}
