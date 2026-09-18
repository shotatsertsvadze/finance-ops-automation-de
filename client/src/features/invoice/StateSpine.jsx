import { useI18n } from "../../lib/i18n.js";

/**
 * The happy path as a vertical spine, with the invoice's actual position on
 * it. Answers "where is this and what comes next" without reading the log.
 * Off-path states (review, rejection, duplicate) are shown inline at the
 * stage where the invoice actually stopped.
 */
const INVOICE_PATH = ["RECEIVED", "VALIDATING", "READY_FOR_APPROVAL", "APPROVED", "ACCOUNTING_READY", "PAYMENT_PENDING", "PAID", "RECONCILED"];
// A credit note shares the path up to the booking and then ends. Showing it
// the invoice path would promise a payment that is never coming, and leave the
// state it actually reaches off the spine altogether.
const CREDIT_NOTE_PATH = ["RECEIVED", "VALIDATING", "READY_FOR_APPROVAL", "APPROVED", "ACCOUNTING_READY", "CREDITED"];
// An invoice its open credits covered entirely. It leaves the path at the same
// point, and no money moves, so the payment stages never apply to it.
const SETTLED_PATH = ["RECEIVED", "VALIDATING", "READY_FOR_APPROVAL", "APPROVED", "ACCOUNTING_READY", "SETTLED_BY_CREDIT"];

const OFF_PATH = {
  REVIEW_REQUIRED: { after: "VALIDATING", tone: "blocked" },
  INFO_REQUESTED: { after: "VALIDATING", tone: "blocked" },
  REJECTED: { after: "VALIDATING", tone: "blocked" },
  DUPLICATE: { after: "RECEIVED", tone: "blocked" },
  RECONCILIATION_EXCEPTION: { after: "PAID", tone: "blocked" },
};

export default function StateSpine({ state, reviewReason, pendingRole, documentType = "INVOICE" }) {
  const { t, state: stateLabel, reviewReason: reasonLabel, role } = useI18n();
  const PATH = state === "SETTLED_BY_CREDIT" ? SETTLED_PATH
    : documentType === "CREDIT_NOTE" ? CREDIT_NOTE_PATH
    : INVOICE_PATH;
  const off = OFF_PATH[state];
  const reachedIndex = off ? PATH.indexOf(off.after) : PATH.indexOf(state);

  const nodes = [];
  PATH.forEach((stage, i) => {
    const isCurrent = !off && i === reachedIndex;
    // When the invoice branched off the path, the stage it branched from was
    // itself completed: an exception after payment still means it was paid.
    const isDone = off ? i <= reachedIndex : i < reachedIndex;
    nodes.push({
      key: stage,
      name: stateLabel(stage),
      className: isDone ? "done" : isCurrent ? "current" : "",
      note: isCurrent && stage === "READY_FOR_APPROVAL" && pendingRole ? t("waitingFor", role(pendingRole)) : null,
    });
    if (off && stage === off.after) {
      nodes.push({
        key: state,
        name: stateLabel(state),
        className: off.tone,
        note: reviewReason ? reasonLabel(reviewReason) : null,
      });
    }
  });

  return (
    <ol className="spine">
      {nodes.map((node) => (
        <li key={node.key} className={node.className}>
          <div className="spine-name">{node.name}</div>
          {node.note && <div className="spine-note">{node.note}</div>}
        </li>
      ))}
    </ol>
  );
}
