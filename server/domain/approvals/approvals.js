import { withTransaction } from "../../db.js";
import { stepsAfterReview } from "../../config/policy.js";
import { NotFoundError, TransitionError, recordEvent, transition } from "../workflow/transitions.js";
import { latestFailedChecks, payableBlockers } from "../workflow/eligibility.js";
import { toCents } from "../money.js";

/** A refusal the caller caused, distinct from a state-machine violation. */
export class RuleError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const requireComment = (comment) => {
  const text = (comment ?? "").trim();
  if (!text) throw new RuleError(400, "Für diese Entscheidung ist eine Begründung erforderlich");
  return text;
};

async function lockInvoice(client, invoiceId) {
  const { rows: [invoice] } = await client.query("select * from finops.invoices where id = $1 for update", [invoiceId]);
  if (!invoice) throw new NotFoundError("Rechnung nicht gefunden");
  return invoice;
}

const cancelAllSteps = (client, invoiceId) =>
  client.query(
    "update finops.approval_steps set status = 'CANCELLED' where invoice_id = $1 and status in ('PENDING', 'APPROVED')",
    [invoiceId],
  );

/**
 * A reviewer's decision on an invoice sitting in REVIEW_REQUIRED.
 * Accepting never approves: it always produces at least one approval step, so
 * an exception always ends up in front of a second person (ADR-010).
 */
export async function decideReview({ pool, policy }, { invoiceId, action, actor, comment }) {
  return withTransaction(pool, async (client) => {
    const invoice = await lockInvoice(client, invoiceId);

    if (action === "info-received") {
      if (invoice.state !== "INFO_REQUESTED") {
        throw new TransitionError(`Rechnung im Status ${invoice.state} wartet nicht auf eine Rückmeldung`, { state: invoice.state });
      }
      await transition(client, {
        invoiceId, to: "REVIEW_REQUIRED", actor, action: "info_received",
        reason: (comment ?? "").trim() || null,
        reviewReason: invoice.review_reason,
      });
      return;
    }

    if (invoice.state !== "REVIEW_REQUIRED") {
      throw new TransitionError(`Rechnung im Status ${invoice.state} steht nicht in der Sichtprüfung`, { state: invoice.state });
    }

    if (action === "accept") {
      // Releasing into approval is the start of the payable path, so the
      // evidence must be eligible before anyone can sign for it.
      const blockers = payableBlockers(invoice, await latestFailedChecks(client, invoiceId));
      if (blockers.length) {
        throw new RuleError(422, "Rechnung ist nicht freigabefähig: fehlende oder unlesbare Pflichtangaben", { blockers });
      }
      const steps = stepsAfterReview(policy, toCents(invoice.gross_amount));
      await client.query("delete from finops.approval_steps where invoice_id = $1", [invoiceId]);
      for (const step of steps) {
        await client.query(
          "insert into finops.approval_steps (invoice_id, step_no, required_role) values ($1, $2, $3)",
          [invoiceId, step.step_no, step.required_role],
        );
      }
      await client.query("update finops.invoices set review_accepted_by = $2 where id = $1", [invoiceId, actor.id]);
      await transition(client, {
        invoiceId, to: "READY_FOR_APPROVAL", actor, action: "review_accepted",
        reason: (comment ?? "").trim() || null,
        evidence: { cleared_reason: invoice.review_reason, required_steps: steps },
      });
      return;
    }

    if (action === "reject") {
      const reason = requireComment(comment);
      await cancelAllSteps(client, invoiceId);
      await transition(client, { invoiceId, to: "REJECTED", actor, action: "review_rejected", reason });
      return;
    }

    if (action === "request-info") {
      const reason = requireComment(comment);
      await cancelAllSteps(client, invoiceId);
      await client.query("update finops.invoices set review_accepted_by = null where id = $1", [invoiceId]);
      await transition(client, {
        invoiceId, to: "INFO_REQUESTED", actor, action: "information_requested",
        reason, reviewReason: invoice.review_reason,
      });
      return;
    }

    if (action === "confirm-duplicate") {
      const reason = requireComment(comment);
      await cancelAllSteps(client, invoiceId);
      await transition(client, { invoiceId, to: "DUPLICATE", actor, action: "duplicate_confirmed", reason });
      return;
    }

    throw new RuleError(400, "Unbekannte Entscheidung");
  });
}

/**
 * Requesting information is also reachable from READY_FOR_APPROVAL, where it
 * must invalidate approvals already given rather than leave them to be
 * inherited by the next validation run.
 */
export async function requestInfoFromApproval({ pool }, { invoiceId, actor, comment }) {
  return withTransaction(pool, async (client) => {
    const invoice = await lockInvoice(client, invoiceId);
    if (invoice.state !== "READY_FOR_APPROVAL") {
      throw new TransitionError(`Rechnung im Status ${invoice.state} steht nicht zur Freigabe`, { state: invoice.state });
    }
    const reason = requireComment(comment);
    await cancelAllSteps(client, invoiceId);
    await client.query("update finops.invoices set review_accepted_by = null where id = $1", [invoiceId]);
    await transition(client, {
      invoiceId, to: "INFO_REQUESTED", actor, action: "information_requested", reason,
    });
  });
}

/**
 * One approver's decision on one step. Enforces, in this order: the invoice is
 * still open for approval, the step exists and is undecided, steps run in
 * order, the actor holds the required role, and segregation of duties.
 */
export async function decideApprovalStep({ pool }, { invoiceId, stepNo, action, actor, user, comment }) {
  return withTransaction(pool, async (client) => {
    const invoice = await lockInvoice(client, invoiceId);
    if (invoice.state !== "READY_FOR_APPROVAL") {
      throw new TransitionError(`Rechnung im Status ${invoice.state} kann nicht freigegeben werden`, { state: invoice.state });
    }

    const { rows: steps } = await client.query(
      "select * from finops.approval_steps where invoice_id = $1 order by step_no for update",
      [invoiceId],
    );
    const step = steps.find((s) => s.step_no === stepNo);
    if (!step) throw new NotFoundError(`Freigabeschritt ${stepNo} existiert nicht`);
    if (step.status !== "PENDING") {
      throw new RuleError(409, `Freigabeschritt ${stepNo} wurde bereits entschieden (${step.status})`);
    }

    const firstPending = steps.find((s) => s.status === "PENDING");
    if (firstPending.step_no !== stepNo) {
      throw new RuleError(409, `Freigabeschritt ${firstPending.step_no} ist zuerst an der Reihe`);
    }

    if (user.role !== step.required_role) {
      throw new RuleError(403, `Dieser Schritt verlangt die Rolle ${step.required_role}, nicht ${user.role}`);
    }

    if (steps.some((s) => s.actor_id === actor.id && s.step_no !== stepNo)) {
      throw new RuleError(409, "Dieselbe Person darf nicht zwei Freigabeschritte derselben Rechnung entscheiden");
    }
    if (invoice.review_accepted_by === actor.id) {
      throw new RuleError(409, "Wer die Rechnung aus der Sichtprüfung freigegeben hat, darf sie nicht auch fachlich freigeben");
    }

    // Checked again at the last gate: master data or a re-validation may have
    // changed since the release from review.
    if (action === "approve") {
      const blockers = payableBlockers(invoice, await latestFailedChecks(client, invoiceId));
      if (blockers.length) {
        throw new RuleError(422, "Rechnung ist nicht freigabefähig: fehlende oder unlesbare Pflichtangaben", { blockers });
      }
    }

    const decided = action === "approve" ? "APPROVED" : "REJECTED";
    const reason = action === "reject" ? requireComment(comment) : (comment ?? "").trim() || null;
    await client.query(
      "update finops.approval_steps set status = $3, actor_id = $4, decided_at = now(), comment = $5 where invoice_id = $1 and step_no = $2",
      [invoiceId, stepNo, decided, actor.id, reason],
    );

    if (action === "reject") {
      await client.query(
        "update finops.approval_steps set status = 'CANCELLED' where invoice_id = $1 and status = 'PENDING'",
        [invoiceId],
      );
      await transition(client, {
        invoiceId, to: "REJECTED", actor, action: "approval_rejected", reason,
        evidence: { step_no: stepNo, role: step.required_role },
      });
      return;
    }

    const stillPending = steps.some((s) => s.status === "PENDING" && s.step_no !== stepNo);
    if (stillPending) {
      await recordEvent(client, {
        invoiceId, actor, action: "approval_step_approved", reason,
        evidence: { step_no: stepNo, role: step.required_role },
      });
      return;
    }
    await transition(client, {
      invoiceId, to: "APPROVED", actor, action: "approved", reason,
      evidence: { step_no: stepNo, role: step.required_role },
    });
  });
}
