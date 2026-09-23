import { useI18n } from "../../lib/i18n.js";
import { pathFor } from "./actions.js";

/**
 * The happy path as a vertical spine, with the invoice's actual position on
 * it. Answers "where is this and what comes next" without reading the log.
 * Off-path states (review, rejection, duplicate) are shown inline at the
 * stage where the invoice actually stopped.
 */
const OFF_PATH = {
  REVIEW_REQUIRED: { after: "VALIDATING", tone: "blocked" },
  INFO_REQUESTED: { after: "VALIDATING", tone: "blocked" },
  REJECTED: { after: "VALIDATING", tone: "blocked" },
  DUPLICATE: { after: "RECEIVED", tone: "blocked" },
  RECONCILIATION_EXCEPTION: { after: "PAID", tone: "blocked" },
  CANCELLED: { after: "APPROVED", tone: "blocked" },
};

export default function StateSpine({ state, reviewReason, pendingRole, documentType = "INVOICE" }) {
  const { t, state: stateLabel, reviewReason: reasonLabel, role } = useI18n();
  const PATH = pathFor(state, documentType);
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
