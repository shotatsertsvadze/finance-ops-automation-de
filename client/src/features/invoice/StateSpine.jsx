import { STATE_LABELS, REVIEW_REASON_LABELS } from "../../lib/format.js";

/**
 * The happy path as a vertical spine, with the invoice's actual position on
 * it. Answers "where is this and what comes next" without reading the log.
 * Off-path states (review, rejection, duplicate) are shown inline at the
 * stage where the invoice actually stopped.
 */
const PATH = ["RECEIVED", "VALIDATING", "READY_FOR_APPROVAL", "APPROVED", "ACCOUNTING_READY", "PAYMENT_PENDING", "PAID", "RECONCILED"];

const OFF_PATH = {
  REVIEW_REQUIRED: { after: "VALIDATING", tone: "blocked" },
  INFO_REQUESTED: { after: "VALIDATING", tone: "blocked" },
  REJECTED: { after: "VALIDATING", tone: "blocked" },
  DUPLICATE: { after: "RECEIVED", tone: "blocked" },
  RECONCILIATION_EXCEPTION: { after: "PAID", tone: "blocked" },
};

export default function StateSpine({ state, reviewReason, pendingRole }) {
  const off = OFF_PATH[state];
  const reachedIndex = off ? PATH.indexOf(off.after) : PATH.indexOf(state);

  const nodes = [];
  PATH.forEach((stage, i) => {
    const isCurrent = !off && i === reachedIndex;
    nodes.push({
      key: stage,
      name: STATE_LABELS[stage],
      className: i < reachedIndex ? "done" : isCurrent ? "current" : "",
      note: isCurrent && stage === "READY_FOR_APPROVAL" && pendingRole ? `Wartet auf ${pendingRole}` : null,
    });
    if (off && stage === off.after) {
      nodes.push({
        key: state,
        name: STATE_LABELS[state],
        className: off.tone,
        note: reviewReason ? (REVIEW_REASON_LABELS[reviewReason] ?? reviewReason) : null,
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
