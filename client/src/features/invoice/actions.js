/**
 * What this invoice offers a person right now, and which progress path it is
 * drawn on. No rendering, no React: these are rules, and the server enforces
 * every one of them regardless.
 *
 * They live here rather than inside the components because getting them wrong
 * means offering someone a button that sends money the wrong way, and that is
 * worth a test rather than a look in a browser.
 */

const action = (key, needs, extra = {}) => ({ key, needs, tone: "", ...extra });
const prompt = (key, ...args) => ({ key, args });

const bookingNo = (invoice) => invoice.accounting_record?.document_no ?? "";

// Offered until money is on its way: fraud found after the signature needs a
// way out that is not the payment (ADR-054).
const cancel = () => action("cancel", "invoice:cancel", { tone: "high", needsComment: true });

/**
 * @returns `{ prompt: {key, args}, step, actions: [{key, needs, tone, needsComment}] }`
 */
export function availableActions(invoice) {
  const step = (invoice.approval_steps ?? []).find((s) => s.status === "PENDING") ?? null;

  switch (invoice.state) {
    case "REVIEW_REQUIRED": {
      // A failure no reviewer may override: the server refuses the release,
      // so it is not offered, and the prompt says why (ADR-071).
      const releasable = (invoice.payable_blockers ?? []).length === 0;
      return {
        prompt: prompt(releasable ? "hintReviewStopped" : "hintNotReleasable"), step,
        actions: [
          ...(releasable ? [action("accept", "review:decide", { tone: "ok" })] : []),
          action("request-info", "review:decide", { needsComment: true }),
          action("confirm-duplicate", "review:decide", { needsComment: true }),
          action("reject", "review:decide", { tone: "high", needsComment: true }),
          action("reprocess", "invoice:reprocess"),
        ],
      };
    }

    case "READY_FOR_APPROVAL":
      // The state says waiting and the steps say otherwise: offering "approve"
      // would be a button that always fails.
      if (!step) return { prompt: prompt("hintReadyForApproval"), step, actions: [] };
      return {
        prompt: prompt("stepOf", step.step_no, (invoice.approval_steps ?? []).length, step.required_role), step,
        actions: [
          action("approve", "approval:decide", { tone: "ok" }),
          action("step-reject", "approval:decide", { tone: "high", needsComment: true }),
          action("request-info", "review:decide", { needsComment: true }),
        ],
      };

    case "APPROVED":
      return {
        prompt: prompt("hintApproved"), step,
        actions: [action("accounting", "accounting:handoff", { tone: "ok" }), cancel()],
      };

    case "ACCOUNTING_READY":
      return bookedActions(invoice, step);

    case "PAYMENT_PENDING":
      return {
        prompt: prompt("hintPaymentPending"), step,
        actions: [
          action("confirm", "payment:confirm", { tone: "ok" }),
          // The bank rejected or returned it, or confirmed a recall (ADR-055).
          action("fail", "payment:confirm", { tone: "high", needsComment: true }),
        ],
      };

    case "PAYMENT_FAILED":
      return {
        prompt: prompt("hintPaymentFailed"), step,
        actions: [action("retry", "payment:instruct", { tone: "ok" }), cancel()],
      };

    case "RECONCILIATION_EXCEPTION":
      return {
        prompt: prompt("hintReconciliationException"), step,
        actions: [action("resolve", "reconciliation:resolve", { tone: "ok", needsComment: true })],
      };

    case "INFO_REQUESTED":
      return {
        prompt: prompt("hintInfoRequested"), step,
        actions: [
          action("info-received", "review:decide", { tone: "ok" }),
          action("reject", "review:decide", { tone: "high", needsComment: true }),
        ],
      };

    default:
      return { prompt: null, step, actions: [] };
  }
}

/** The three ways out of ACCOUNTING_READY: book a credit, settle, or pay. */
function bookedActions(invoice, step) {
  // A credit note is booked, not paid. Offering "instruct payment" would offer
  // to send money in the direction the document reverses.
  if (invoice.document_type === "CREDIT_NOTE") {
    return {
      prompt: prompt("hintCreditNoteReady", bookingNo(invoice)), step,
      actions: [action("credit", "payment:instruct", { tone: "ok" }), cancel()],
    };
  }

  const credit = Number(invoice.open_credit_amount ?? 0);
  const gross = Number(invoice.gross_amount ?? 0);

  // gross > 0 guards the degenerate case: 0 >= 0 would otherwise offer to
  // settle nothing against nothing.
  if (gross > 0 && credit >= gross) {
    return {
      prompt: prompt("hintFullyCredited", bookingNo(invoice)), step,
      actions: [action("settle", "payment:instruct", { tone: "ok" }), cancel()],
    };
  }
  return {
    // Stated before the click: the amount that will actually leave the bank.
    prompt: prompt(credit > 0 ? "hintNetted" : "hintAccountingReady", bookingNo(invoice)), step,
    actions: [action("pay", "payment:instruct", { tone: "ok" }), cancel()],
  };
}

/**
 * The one button to fill among those offered: the step that moves the
 * invoice on, or, in a review that cannot be released, the step it expects
 * next. Presentation only: which actions are offered is decided above.
 */
export function primaryAction(invoice, offered) {
  const key = offered.find((a) => a.tone === "ok")?.key
    ?? (invoice.state === "REVIEW_REQUIRED"
      ? (invoice.review_reason === "DUPLICATE_INVOICE_NUMBER" ? "confirm-duplicate" : "request-info")
      : null);
  return offered.some((a) => a.key === key) ? key : null;
}

const INVOICE_PATH = ["RECEIVED", "VALIDATING", "READY_FOR_APPROVAL", "APPROVED", "ACCOUNTING_READY", "PAYMENT_PENDING", "PAID", "RECONCILED"];
// A credit note shares the path up to the booking and then ends. Showing it
// the invoice path would promise a payment that is never coming.
const CREDIT_NOTE_PATH = ["RECEIVED", "VALIDATING", "READY_FOR_APPROVAL", "APPROVED", "ACCOUNTING_READY", "CREDITED"];
// An invoice its open credits covered entirely. It leaves at the same point,
// and no money moves, so the payment stages never apply to it.
const SETTLED_PATH = ["RECEIVED", "VALIDATING", "READY_FOR_APPROVAL", "APPROVED", "ACCOUNTING_READY", "SETTLED_BY_CREDIT"];

/** The happy path this document is drawn on. */
export function pathFor(state, documentType) {
  if (state === "SETTLED_BY_CREDIT") return SETTLED_PATH;
  if (documentType === "CREDIT_NOTE") return CREDIT_NOTE_PATH;
  return INVOICE_PATH;
}
