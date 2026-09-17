# Independent Phase 0 review

Reviewed 2026-09-17 at commit `49c967d38d7107e4db8e03a3c78598f87d5ed04b`.
Scope: domain, controls, architecture, security boundaries and test quality.
This review did not change application files, migrations, fixtures or existing ADRs.
At final verification, concurrent untracked Phase 3 work appeared in
`db/migrations/0003_accounting_payment.sql`, `fixtures/bank/`, and
`server/domain/reconciliation/`. It is outside this review's tested baseline.

**Disposition: Phase 0 needs control-design revisions before Phase 3 proceeds.**
The modular monolith is a reasonable fit. The current state machine and
validation contract do not yet justify the promises that uncertain data cannot
be approved and a supplier invoice cannot become payable twice.

This assessment accepts the synthetic-data PoC boundary, simulated payment,
trusted actor header, and deferred official validation. It does not assess
legal compliance or claim an actual bank payment occurred.

## Evidence and independent method

- Read the product, architecture, decisions, process, business case and test
  matrix, then traced their controls through routes, domain functions and SQL.
- Independently inspected selected reference code at the same recorded commits:
  DMS `da4c116409eba4d3958cef1c5eed1ece2f09d690` and Feldmark
  `6943ee6525940122c4f7a4f3a750ee3ded0eade5`. This was a targeted source review,
  not a fresh full audit or runtime test of either reference application.
- Ran the existing `npm test` command with `TEST_DATABASE_URL` overridden to a
  newly created local database: **76 passed, 0 failed, 0 skipped**.
- Exercised additional HTTP requests against the real app and PostgreSQL, with
  modified synthetic fixtures held in memory. Used domain calls for fault
  injection, simultaneous intake, and simulated future payment-state transitions.
- Removed both temporary review databases. Existing application and test
  databases were not reset. Probe scripts and raw output remain in `/tmp`:
  `finops-phase0-review.mjs`, `finops-phase0-retry-review.mjs`,
  `finops-phase0-evidence.json`, `finops-phase0-retry-evidence.json`, and
  `finops-phase0-baseline.log`.

The probes are review evidence, not regression tests registered with `npm test`.
They must not be labelled AUTO in the consolidated test matrix yet.

## Findings requiring correction

**R01 — P1: Human review can approve a technically unusable invoice.**

Upload fixture F, accept review as the clerk with an empty body, then approve
step 1 as a manager. All requests succeed. The final invoice is `APPROVED`
with `gross_amount = null`, `supplier_id = null`, and failed
`required_fields_present` and `amounts_numeric` checks. The release reason is
also null.

Root cause: [approvals.js:58](../server/domain/approvals/approvals.js) checks
only the current state before building steps. `stepsAfterReview()` treats an
unknown amount as requiring one manager, and final approval never checks data
eligibility. The nullable supplier/number columns also mean the payable unique
index cannot protect unidentified invoices.

Required outcome: distinguish non-overridable prerequisites from permitted
business exceptions. Technical validity, known payment amount and resolved
identity must remain prerequisites for entering a payable state. An override
must identify which business failures were accepted, by whom and why. Two
people clicking does not establish missing financial facts.

**R02 — P1: Reconciliation exceptions lose duplicate-payment protection.**

The partial unique index in [0001_core.sql:106](../db/migrations/0001_core.sql)
and `PAYABLE_STATES` omit `RECONCILIATION_EXCEPTION`. That state is reached
from `PAID`.

Reproduction: upload G, use the existing `transition()` function to simulate
the future accounting/payment stages through `RECONCILIATION_EXCEPTION`, then
upload a changed file with the same supplier and number. It initially reaches
review. Clerk acceptance followed by manager approval succeeds. The database
now contains the original in `RECONCILIATION_EXCEPTION` and a second invoice
in `APPROVED` for the same obligation.

Required outcome: duplicate protection must survive every state after approval,
including payment and reconciliation exceptions. Fix through a new migration;
do not edit the applied migration. Test the entire downstream state set, not
only two `APPROVED` records. This is a demonstrated schema/workflow defect;
Phase 3 payment endpoints are not implemented and were not tested.

**R03 — P1: The amount model can approve contradictory totals and invalid lines.**

Starting from G, retain line totals of 319.33 and `TaxInclusiveAmount` 380.00,
but change `TaxExclusiveAmount` to 100.00, top-level tax to 19.00 and
`PayableAmount` to 119.00. The API returns `APPROVED` for 119.00 with no failed
checks. Independently, changing one unit price to `not-a-price` still produces
`APPROVED` for 380.00.

Root cause: [business-checks.js:83](../server/domain/validation/business-checks.js)
compares lines to the declared line sum, but never connects that sum to the
tax-exclusive amount. It compares net plus VAT to payable, ignoring the parsed
tax-inclusive amount. [technical-validation.js:55](../server/domain/invoice/technical-validation.js)
does not validate unit prices; storage silently converts invalid prices to null.

The domain must distinguish line sum, allowances/charges, net, VAT, gross,
prepayments, rounding and amount due. The published invoice equations explicitly
distinguish these values; see [Peppol calculation rules](https://docs.peppol.eu/poacc/billing/3.0/bis/).
This also challenges the current use of `PayableAmount` as `gross_amount` for
approval thresholds. Define the supported subset and route unsupported monetary
features to review until implemented. Validate quantity/price/line arithmetic
within that subset. This need not wait for a full official validator.

**R04 — P1: Counterparty identity checks do not establish who owes whom.**

Two independent changes to G each auto-approve with no failed checks:

- Replace the buyer name and VAT ID with a different company.
- Replace the supplier VAT ID with an unknown VAT ID while retaining its name.

There is no buyer-identity check in
[business-checks.js](../server/domain/validation/business-checks.js).
[lookup.js:7](../server/domain/validation/lookup.js) falls back to name after a
supplied VAT ID fails to match. `supplier_known` then reports that the match was
made through VAT merely because the document contained a VAT ID. Legal names
are not unique in the schema, so ambiguous name matches also lack a defined rule.

Required outcome: validate the configured buyer identity; treat contradictory
supplier identifiers and ambiguous matches as review cases. Record the actual
matching method. A fallback for a missing identifier is a separate decision
from overriding a conflicting identifier.

**R05 — P1: Malformed dates either escape review or strand processing.**

Changing G's issue date to `2026-02-30` returns HTTP 500, PostgreSQL error
`22008`, and leaves the durable invoice in `RECEIVED`. Changing it to
`not-a-date` instead returns HTTP 201 and `APPROVED`, while the stored date is
null.

Root cause: the technical check tests presence, not calendar validity;
[intake.js:122](../server/domain/intake/intake.js) uses a shape-only regex and
writes extracted values before handling technical failure. An impossible date
throws inside the transaction, rolling back the checks and failure transition.

Required outcome: validate dates and numeric representability before typed
database writes. Invalid input should persist structured failed checks and end
in review. Test issue/due dates, numeric precision/range and duplicate scalar
elements against the real database, not only the parser.

**R06 — P1: Revalidation bypasses the promised exception approval path.**

Upload H, add its IBAN to the synthetic approved bank-account master data,
then call `/reprocess`. The invoice moves through `VALIDATING` straight to
`APPROVED`, without any human approval step. This contradicts ADR-010's stated
outcome that an exception always has two humans on it.

Separately, `INFO_REQUESTED -> REVIEW_REQUIRED` does not run validation:
the HTTP probe retained `run_no = 1` and allowed immediate review acceptance.
The architecture says revalidation runs on information received. The existing
test achieves that only by calling `/reprocess` explicitly afterward.

Root causes: [intake.js:86](../server/domain/intake/intake.js) applies ordinary
auto-approval routing without exception history, and
[approvals.js:42](../server/domain/approvals/approvals.js) only changes state.

Required outcome: specify whether any prior exception permanently requires
human approval for that document version. Enforce the agreed rule across all
entry points and require fresh validation before releasing corrected evidence.
If corrected XML is accepted later, link immutable document versions and bind
approvals to the exact version. There is currently no correction-upload link.

**R07 — P1: PO remaining value is a static comparison, not a spending control.**

Two G variants with distinct invoice numbers, each net 319.33, both auto-approve
against PO-2026-0102. Their combined net is 638.66, while the PO still reports
500.00 remaining. This fails even sequentially; concurrency is not required.

[lookup.js](../server/domain/validation/lookup.js) reads the PO, and
[business-checks.js:73](../server/domain/validation/business-checks.js) compares
each invoice independently. No reservation, consumption or release lifecycle
exists. The schema has a PO currency, but the comparison does not check it.

Required outcome before accounting/payment: define when invoice amounts reserve
PO capacity, how reservations are released, and how concurrent invoices share
the same balance. Specify whether tolerance applies per invoice or cumulatively.
Compare compatible currencies. If the PoC intentionally demonstrates only a
snapshot comparison, say so and do not claim prevention of cumulative overruns.

**R08 — P1: Duplicate detection does not provide retry recovery.**

Inject one transient failure into storage reading after intake commits. The
original remains `RECEIVED`. Restore storage and retry the same upload: it
returns `DUPLICATE`, while the original remains unprocessed. Manual reprocessing
is possible, but automatic retry does not resume the work.

Root cause: [intake.js:18](../server/domain/intake/intake.js) and
[intake.js:105](../server/domain/intake/intake.js) split receipt and processing
into separate transactions, while duplicate handling exits without recovering
the original. Files are also written before the receipt transaction; a failed
insert has no cleanup/reconciliation path. That orphan risk is inferred from
code, not observed in the concurrency run.

Eight simultaneous identical uploads produced one live invoice and seven
duplicate records in this run; no duplicate live record was observed. This is
useful safety evidence, but does not prove all schedules or crash points.

Required outcome: define request replay versus a genuine duplicate submission,
return a stable original reference, and resume or explicitly queue incomplete
processing. Specify recovery for file-write/DB-commit and DB-commit/processing
boundaries. Phase 3 needs a durable accounting/payment operation identity,
request-payload consistency, provider retry semantics and recovery after an
external success but local commit failure. Defer the adapters, not this contract.

**R09 — P1: Invalid policy configuration can silently weaken approvals.**

With both tier limits set to `bad`, `loadPolicy()` returns NaN thresholds.
The routing probe for 30,000 EUR requires only MANAGER instead of MANAGER,
FINANCE and CFO. [policy.js:5](../server/config/policy.js) converts arbitrary
strings with `Number()` without checking the result or threshold ordering.

Required outcome: reject invalid configuration at startup. Validate finite
amounts, permitted ranges and ordered tiers. The `fourEyesAfterReview` setting
is also stored but not consumed by the approval guard; resolve that documentary
contract without weakening the agreed segregation-of-duties requirement.

## Further design and assurance gaps

**R10 — P2: The declared XML subset and routing evidence are too permissive.**

Replacing G's UBL root namespace with `urn:review:not-ubl` still auto-approves.
The parser strips namespaces and recognises only the local name `Invoice`
([parse-xrechnung.js:18](../server/domain/invoice/parse-xrechnung.js)). A profile
substring match, first-element selection for repeated values, unhandled payment
means and warning-only invoice types leave the supported subset ambiguous.
Those latter issues are source findings, not individual end-to-end reproductions.

Also, calling `decide()` with both validation arrays empty and amount 380 EUR
returns `AUTO_APPROVE` with the explanation that all checks passed. The current
pipeline normally supplies checks; this is a domain-contract weakness, not a
demonstrated HTTP bypass.

Specify the recognised namespaces/profile versions, cardinalities, invoice and
payment types, and the required check set. Required checks must be positively
satisfied; an empty set is not proof. Preserve the explicit distinction between
these structural controls and official validation. When adding validated golden
fixtures, use a pinned configuration from
[KoSIT's validator configuration releases](https://github.com/itplr-kosit/validator-configuration-xrechnung/releases)
and preserve its report; the review did not run KoSIT.

**R11 — P2: Audit completeness is narrower than the design claims.**

Transition and event writes share a transaction, which is a sound foundation.
However, review acceptance recomputes steps using current policy without storing
a corresponding new policy snapshot or validation-run link. After acceptance,
the latest routing row can still describe the previous review decision.
Acceptance also permits no reason, as R01 demonstrated. Approval rows are deleted
and recreated without a cycle/version identifier.

The audit schema permits ordinary updates/deletes by an owner-level runtime
connection and cascades deletion from invoices
([0001_core.sql:174](../db/migrations/0001_core.sql)). Actor names are joined from
current user records. Local originals are protected against application overwrite
with `wx`, but their hash is not verified on reprocessing. These are source-level
limits, not claims that tampering occurred.

Required outcome: bind decisions to document hash/version, validation run,
effective policy, actor and exception rationale. Keep approval-cycle identity.
For a deployment beyond this PoC, define a separate migration/runtime privilege
model, audit retention and file-integrity verification. ADR-015's exclusion of
refused attempts is accepted as documented scope; successful decision evidence
must still be sufficient to reconstruct the decision.

**R12 — P2 for the local demo; deployment gate: trust and role boundaries need precision.**

`X-Actor-Id` is deliberately unauthenticated. Anyone with API access can select
two seeded identities, so the implementation demonstrates identity-based rules,
not independently authenticated human segregation of duties. Keep that limit
explicit. [index.js:12](../server/index.js) binds without a host restriction,
and [app.js:11](../server/app.js) enables unrestricted CORS. Actual network
reachability depends on the host; it was not penetration-tested.

The target process says review is for AP clerk / Finance, but `requireHuman`
accepts any seeded role and review handlers perform no role check. A manager
successfully released an invoice in the probe, consistent with an existing test
but inconsistent with the process table. Decide and document the review action
matrix. Restrict the unauthenticated demo's exposure; authenticated identity and
an explicit authorization matrix are prerequisites for broader deployment.

**R13 — P2: The existing tests prove narrower claims than the matrix suggests.**

The passing suite did not detect R01-R09. State-table tests establish allowed
edges, not guarded eligibility; the audit test covers its exercised transitions,
not every failure boundary. The duplicate-index test misses the reconciliation
exception. Fixture D depends on A having been loaded earlier. Fixture F is
well-formed XML with invalid/missing invoice fields; broken XML has a separate
unit test, but no equivalent persisted end-to-end fixture.

The test helper drops schema `finops` in whatever `TEST_DATABASE_URL` names,
without checking it differs from the application database
([test-support/db.js:14](../server/test-support/db.js)). The review avoided this
by creating isolated databases. Add an explicit test-database safeguard before
making the suite a shared development or CI gate.

Required regression work belongs in the existing `docs/TEST_MATRIX.md`:

1. One minimal failing case for each R01-R09, including HTTP state and audit
   assertions. Keep negative fixture mutations independent of test execution order.
2. Concurrent same-hash and same-business-key intake, concurrent final approval,
   duplicate protection in every downstream state, and cumulative/concurrent PO use.
3. Crash/retry probes at file/DB and future provider/DB boundaries, including
   unchanged payload replay versus changed payload under the same key.
4. Wrong buyer, conflicting/ambiguous supplier identity, namespace/cardinality,
   invalid dates, missing prices, totals with charges/prepayment/rounding, and
   malformed/unsupported documents persisted in review.
5. Golden fixtures with independently established expected values; label
   app-supported examples separately from officially validated examples.

## Architecture challenge and Phase 0 exit criteria

Keep Express + PostgreSQL, a single domain layer, immutable original files,
structured check results and transactionally audited transitions. Neither a
workflow engine nor AI extraction addresses these control failures. The core
problem is that a legal state edge is currently treated as sufficient authority
to advance, while evidence eligibility and irreversible financial history are
separate concerns.

The reference spot-check supports that distinction: DMS defaults authentication
off and its inspected CI does not run tests; Feldmark uses name-based four-eyes
confirmation and distributed status writes. Their reusable module and transaction
patterns are useful, but neither reference establishes finance-control correctness.

Before accepting Phase 0 and starting the payment path, the design should specify:

- The prerequisites for each money-related transition, permitted override types,
  review roles and the behavior after any prior exception.
- A supported invoice subset and complete amount/identity validation contract.
- Durable duplicate identity across all post-approval states and a PO reservation
  lifecycle.
- Receipt and external-operation idempotency, failure recovery and replay semantics.
- Evidence/version binding for every review, approval, export and payment action.
- For reconciliation: match reference, counterparty/account, currency and amount;
  ambiguous matches remain exceptions; define partial/overpayments, bank fees and
  duplicate statement imports before implementing an exact-match demo.
- A fixture/test plan that challenges the controls above rather than only showing
  the intended routing examples.

Any chosen change to an existing ADR must be recorded in a new superseding ADR;
this review does not silently replace the recorded decisions. Fixes should remain
incremental, each with its regression case and consolidated matrix update.

The business case also needs a small arithmetic correction: if exceptions fall
from 240 to 144 out of 1,200, the remaining clean population becomes 1,056,
not 960. At one minute per clean invoice and eight minutes per exception, total
touch time is 36.8 hours and labour saving is 7,164 EUR/month against 196 hours
at 45 EUR/hour. Specify the STP versus human-approval mix; these remain scenario
assumptions, not measured benefits.
