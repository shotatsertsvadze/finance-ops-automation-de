import { diffChars, isSingleIdentifier } from "../../lib/format.js";

/**
 * One validation result. The comparison block is the point of the product:
 * it always says what was expected and what the document actually carried.
 * For identifiers such as an IBAN the differing characters are marked, so a
 * changed bank account can be read at a glance instead of character-counted.
 */
export default function EvidenceRow({ result }) {
  const tone = result.status.toLowerCase();
  const showCompare = result.status === "FAILED" && (result.expected || result.actual);
  const markable = result.status === "FAILED" && isSingleIdentifier(result.expected) && isSingleIdentifier(result.actual);

  return (
    <div className={`ev is-${tone}`}>
      <div className="ev-bar" />
      <div className="ev-body">
        <div className="ev-head">
          <span className="ev-code">{result.check_code}</span>
          <span className="ev-status">
            {result.status}
            {result.severity !== "INFO" && result.status === "FAILED" ? ` · ${result.severity}` : ""}
          </span>
        </div>
        <p className="ev-reason">{result.reason}</p>

        {showCompare && (
          <dl className="ev-compare">
            <dt>Erwartet</dt>
            <dd>{markable ? <Grouped value={result.expected} /> : (result.expected ?? "—")}</dd>
            <dt>Gefunden</dt>
            <dd>{markable ? <Marked expected={result.expected} actual={result.actual} /> : (result.actual ?? "—")}</dd>
          </dl>
        )}

      </div>
    </div>
  );
}

/** Groups of four, so the two rows line up character for character. */
function chunk(items) {
  const groups = [];
  items.forEach((item, i) => {
    if (i % 4 === 0) groups.push([]);
    groups.at(-1).push(item);
  });
  return groups;
}

function Grouped({ value }) {
  return <span>{chunk([...(value ?? "").trim()]).map((g) => g.join("")).join(" ")}</span>;
}

function Marked({ expected, actual }) {
  const groups = chunk(diffChars(expected.trim(), actual.trim()));
  return (
    <span>
      {groups.map((group, gi) => (
        <span key={gi}>
          {group.map((c, ci) => (c.differs ? <mark key={ci}>{c.char}</mark> : <span key={ci}>{c.char}</span>))}
          {gi < groups.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}
