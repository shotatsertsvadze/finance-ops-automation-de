const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

/** Where lines go. Replaceable in tests, whose runner reports on stdout. */
export const logOutput = {
  write: (line, level) => (LEVELS[level] >= LEVELS.warn ? process.stderr : process.stdout).write(`${line}\n`),
};

/**
 * One JSON object per line, so a log collector can search by field
 * (`request_id`, `status`) instead of parsing prose (ADR-060). LOG_LEVEL is
 * read on every call; the test script sets it to warn.
 */
export function log(level, msg, fields = {}) {
  if (LEVELS[level] < (LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info)) return;
  logOutput.write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields }), level);
}
