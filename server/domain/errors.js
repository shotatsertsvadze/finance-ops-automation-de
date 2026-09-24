/**
 * Refusals the domain throws and the API turns into a status and a body.
 *
 * Each carries a stable `code` as well as its German sentence. The sentence is
 * what a non-UI caller reads; the code is what lets the client say it in the
 * reader's language, the way a check is rendered from its check_code (ADR-042).
 */

/** A move the state machine does not allow from where the invoice is. */
export class TransitionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.status = 409;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.status = 404;
    this.code = code;
    this.details = details;
  }
}

/** A refusal the caller caused, distinct from a state-machine violation. */
export class RuleError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
