/**
 * Structured check results. Every validation returns one of these instead of
 * a boolean, so the UI and the audit trail can show what was expected, what
 * was found and what should happen next.
 */
export const STATUS = { PASSED: "PASSED", FAILED: "FAILED", WARNING: "WARNING", SKIPPED: "SKIPPED", INFO: "INFO" };
export const SEVERITY = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", INFO: "INFO" };
const ACTION = { NONE: "NONE", HUMAN_REVIEW: "HUMAN_REVIEW", APPROVAL: "APPROVAL" };

function result(check, status, severity, recommendedAction, { expected = null, actual = null, reason }) {
  return {
    check,
    status,
    severity,
    expected: expected === null || expected === undefined ? null : String(expected),
    actual: actual === null || actual === undefined ? null : String(actual),
    reason,
    recommended_action: recommendedAction,
  };
}

export const passed = (check, severity, fields) => result(check, STATUS.PASSED, severity, ACTION.NONE, fields);
export const failed = (check, severity, fields) => result(check, STATUS.FAILED, severity, ACTION.HUMAN_REVIEW, fields);
export const warning = (check, fields) => result(check, STATUS.WARNING, SEVERITY.LOW, ACTION.NONE, fields);
export const skipped = (check, fields) => result(check, STATUS.SKIPPED, SEVERITY.INFO, ACTION.NONE, fields);
export const info = (check, fields, action = ACTION.NONE) => result(check, STATUS.INFO, SEVERITY.INFO, action, fields);

const isFailed = (c) => c.status === STATUS.FAILED;
export const failedWith = (checks, severities) => checks.filter((c) => isFailed(c) && severities.includes(c.severity));
