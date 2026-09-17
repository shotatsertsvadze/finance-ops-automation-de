# Implementation Plan

Phases as in the brief. Each phase ends with `npm test` green and the test
matrix updated. Later phases do not start before the earlier one is demoable.

## Phase 0 - Audit and design (done 2026-09-17)

Outputs: `docs/REFERENCE_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`,
this plan, product and process docs, fixtures A-G.

## Phase 1 - Walking skeleton

1. `package.json`, `.env.example`, `db/migrations/0001_core.sql`, `db/seed`,
   `scripts/migrate.js`, `scripts/seed.js`.
2. `server/domain/invoice`: XML safety, UBL parser, technical validation (tests
   against fixtures).
3. `server/domain/validation/business-checks.js` (tests with an in-memory
   master-data lookup).
4. `server/domain/routing/decide.js` (pure, tests for each scenario).
5. `server/domain/workflow`: states, transition table, `transition()` with audit
   (database tests).
6. `server/domain/intake/intake.js` + routes; `POST /api/invoices` end to end
   with fixtures A-G (integration tests against `finops_test`).
7. Client: upload, inbox, invoice detail with validation results and timeline.
8. Test matrix rows for everything above.

## Phase 2 - Approvals and exceptions (done 2026-09-17)

Review decisions (accept, reject, request-info, confirm-duplicate), the
approval chain with ordered steps, exact role matching, segregation of duties
on identity, four-eyes after review, and cancellation of every existing
approval when information is requested. Decision panel and actor picker in the
UI. 20 new tests in `server/domain/approvals/approvals.test.js`.

Deliberately not done: refused attempts are not audited (ADR-015), and there
is no delegation or substitution when an approver is absent.

## Phase 3 - Accounting and payment simulation (done 2026-09-17)

Booking record per approved invoice with a vendor-neutral shape and a CSV
formatter, a mock payment provider behind a one-object seam, synthetic bank
statement import, and reconciliation that refuses to match on amount alone.
Idempotency is carried by unique constraints rather than pre-flight checks
(ADR-017). 29 new tests.

Deliberately not done: no real bank or accounting connection, no partial
payment handling beyond raising an exception, no credit notes.

## Phase 4 - Operational BI

`GET /api/dashboard/kpis` computed from `audit_events` and `invoices`; dashboard
view; assumptions for cost figures shown next to the numbers.

## Phase 5 - Hardening

Edge cases, idempotency tests, security review, final README, demo script.

## Phase 1 status (2026-09-17)

Done and covered by `npm test` (56 tests): migrations and seed, XML safety
gate, UBL parser, technical validation, business checks, routing policy, state
machine with a single `transition()` choke point, intake orchestration,
REST API, and the React console (inbox, review, approval and done queues,
invoice detail with evidence and timeline).

Not done in Phase 1, by design: review and approval endpoints, which Phase 2
added.

## Control remediation (2026-09-17)

An independent review of Phases 0-2 (`docs/PHASE_0_INDEPENDENT_REVIEW.md`)
found nine P1 control defects that the then-passing 105-test suite did not
catch. Every claim was reproduced before any code changed.

Fixed, each with a regression test and a re-run of the original reproduction:
eligibility separated from the transition table (ADR-019), prior exceptions
always requiring a human (ADR-020), identifier agreement for supplier and buyer
(ADR-021), chained totals and unit-price validation (ADR-022), configuration
validation (ADR-023), calendar-date validation, and duplicate protection
extended to reconciliation exceptions.

Accepted as documented limitations, not fixed: cumulative PO overruns
(ADR-024), intake recovery, XML subset looseness, decision-to-version binding,
and the unauthenticated actor header.

The lesson recorded for later phases: a passing suite proved the paths it
exercised, not the absence of a bypass. Tests that only demonstrate intended
routing do not challenge a control.
