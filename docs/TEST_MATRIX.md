# Test Matrix

One consolidated matrix. Update rows in place; never start a second matrix.

Legend:
- **AUTO** verified by an automated test (`npm test`), test file named
- **MANUAL** verified by hand, date and method named
- **CODE** inferred from reading the code only, never executed
- **OPEN** not yet tested, a real gap

Run: `npm test` (165 tests, all passing as of 2026-09-17). Database tests need
`TEST_DATABASE_URL` and rebuild the `finops` schema in that database.

## High-priority business risks

| # | Risk / behaviour | Expected | Status | Evidence |
|---|---|---|---|---|
| R1 | Changed IBAN never auto-passes | HIGH failure, REVIEW_REQUIRED | AUTO | `intake.test.js` "B: changed IBAN never auto-passes"; `business-checks.test.js` also covers a RETIRED account not counting as approved |
| R2 | Identical file uploaded twice | second is DUPLICATE, not processed, original untouched | AUTO | `intake.test.js` "identical file uploaded again becomes DUPLICATE" |
| R3 | Same supplier + number, different file | REVIEW_REQUIRED, no payable record | AUTO | `intake.test.js` "D: same supplier and number in a different file" |
| R4 | Two payable records for one supplier invoice number | impossible, DB rejects with 23505 | AUTO | `intake.test.js` "database forbids two payable records"; partial unique index `invoices_one_payable_per_number` |
| R5 | Malformed / non-XML input | fail closed to REVIEW_REQUIRED, file kept and readable | AUTO | `intake.test.js` "F: malformed file fails closed", "non-XML bytes fail closed" |
| R6 | XML with DOCTYPE or ENTITY | rejected before the parser runs | AUTO | `technical-validation.test.js` "DOCTYPE is rejected before parsing" |
| R7 | Amount thresholds route to the right tier | 380 auto, 1 240 MANAGER, 30 000 three steps | AUTO | `decide.test.js` (incl. boundary values); `intake.test.js` A, E, G |
| R8 | Same actor cannot satisfy two approval steps | 409, step stays PENDING, invoice not approved | AUTO | `approvals.test.js` "one actor cannot satisfy two approval steps" |
| R9 | Reviewer cannot approve what they released from review | 409, another approver succeeds | AUTO | `approvals.test.js` "whoever released an invoice from review cannot also approve it" |
| R10 | Rejected invoice cannot become approved | 409 at the endpoint, no transition in the machine | AUTO | `approvals.test.js` "a rejected invoice cannot be approved afterwards"; `states.test.js` |
| R11 | Finalised invoice cannot be processed again | 409, nothing changes | AUTO | `intake.test.js` "reprocess ... refused from APPROVED"; `app.test.js` returns 409 |
| R12 | Undeclared transition is impossible | throws, nothing written | AUTO | `intake.test.js` "an undeclared transition throws and writes nothing" |
| R13 | Every state change has an audit event | last event's to_state equals current state for every invoice; no orphan from_state | AUTO | `intake.test.js` "every state change has exactly one audit event" |
| R14 | Reconciliation cannot match the wrong invoice on amount alone | exception, no invoice attached | AUTO | `matching.test.js` "an amount that matches an invoice without a reference is never reconciled"; `moneypath.test.js` "an invoice is not reconciled just because a payment has the same amount". Mutation-checked: making the matcher accept amount-only breaks 6 tests |
| R15 | Repeated payment/webhook call is idempotent | one record | AUTO | `moneypath.test.js` replay cases for handoff, payment, confirmation, statement import and reconciliation run |
| R16 | A human action without an actor is refused | throws before any write | AUTO | `intake.test.js` "a human action without actor id is refused"; `app.test.js` unknown actor returns 400 |
| R17 | Fixing master data clears the exception on re-validation | REVIEW_REQUIRED becomes READY_FOR_APPROVAL | AUTO | `intake.test.js` "after the IBAN is approved in master data" |
| R18 | Intake facts are not derived from document content | filename and channel survive processing | AUTO | `intake.test.js` "receiveInvoice writes intake facts" |
| R19 | A review never exits directly to APPROVED | always at least one approval step, even under the auto limit | AUTO | `approvals.test.js` "a review of a small invoice still requires one approval" |
| R20 | An approval given before a correction is not inherited | every step restarts after re-validation | AUTO | `approvals.test.js` "an approval given before a correction cannot be inherited" |
| R21 | Rejection and rückfrage require a reason | 400, nothing changes | AUTO | `approvals.test.js` review-reject and step-reject cases |
| R22 | An approver without the required role is refused | 403, step stays PENDING | AUTO | `approvals.test.js` "an approver whose role does not match" |
| R23 | Steps are decided in order | 409 on an out-of-order step | AUTO | `approvals.test.js` "steps must be decided in order" |
| R24 | A decided step cannot be decided twice | 409 | AUTO | `approvals.test.js` "an already-decided step cannot be decided again" |

## Fixtures

All seven run through the real pipeline in `intake.test.js` and were also
uploaded through the running UI on 2026-09-17 (MANUAL, browser).

| Fixture | Scenario | Expected state | Status | Evidence |
|---|---|---|---|---|
| A | clean, 1 240 EUR | READY_FOR_APPROVAL, 1 MANAGER step | AUTO | `intake.test.js` "A: clean 1240 EUR" |
| B | IBAN differs from master data | REVIEW_REQUIRED, `supplier_iban_match` HIGH | AUTO | `intake.test.js` "B:" |
| C | 8 500 EUR net vs PO remaining 5 000 | REVIEW_REQUIRED, `po_amount_within_tolerance` HIGH | AUTO | `intake.test.js` "C:" |
| D | same number as A, different file | REVIEW_REQUIRED, `duplicate_invoice_number` HIGH | AUTO | `intake.test.js` "D:" |
| E | clean, 30 000 EUR | READY_FOR_APPROVAL, MANAGER + FINANCE + CFO | AUTO | `intake.test.js` "E:" |
| F | malformed | REVIEW_REQUIRED, TECHNICAL_VALIDATION_FAILED | AUTO | `intake.test.js` "F:" |
| G | clean, 380 EUR | APPROVED by SYSTEM, no steps | AUTO | `intake.test.js` "G:" |
| H | 380 EUR with a changed IBAN | REVIEW_REQUIRED; accepting it still needs one approval | AUTO | `approvals.test.js` "a review of a small invoice" |

## Parsing and technical validation

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| T1 | UBL fields map to the neutral structure | number, VAT ID, IBAN, PO, totals, lines | AUTO | `technical-validation.test.js` |
| T2 | Not well-formed XML | `xml_well_formed` FAILED | AUTO | `technical-validation.test.js` |
| T3 | CII (ZUGFeRD syntax) | `format_recognised` FAILED, reported as unsupported, not a crash | AUTO | `technical-validation.test.js` |
| T4 | Missing XRechnung CustomizationID | MEDIUM failure | AUTO | `technical-validation.test.js` |
| T5 | Non-numeric amounts or quantities | `amounts_numeric` FAILED | AUTO | `technical-validation.test.js` |
| T6 | Official EN 16931 / KoSIT validation | not implemented, adapter boundary only | OPEN | Deliberate, see ADR-008 |

## Business checks

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| B1 | Clean invoice, all master data matches | no FAILED check | AUTO | `business-checks.test.js` |
| B2 | Unknown supplier | HIGH, dependent checks SKIPPED not passed | AUTO | `business-checks.test.js` |
| B3 | Blocked supplier | `supplier_active` HIGH | AUTO | `business-checks.test.js` |
| B4 | Amount within PO tolerance | PASSED | AUTO | `business-checks.test.js` |
| B5 | Inconsistent totals | `totals_consistent` HIGH | AUTO | `business-checks.test.js` |
| B6 | Unknown PO reference | `po_exists` HIGH | AUTO | `business-checks.test.js` |
| B7 | Missing PO above the policy threshold | MEDIUM | AUTO | `business-checks.test.js` |

## Controls found by independent review

An independent review of Phases 0-2 found control defects that the passing
suite did not catch. Each was reproduced before being fixed, and each fix was
re-verified by re-running the original reproduction, not only the new test.
Tests live in `server/domain/workflow/controls.test.js`.

| # | Defect as found | Behaviour now | Status | Evidence |
|---|---|---|---|---|
| C1 (R01) | A malformed invoice could be released from review and approved, becoming payable with a null amount | Release and final approval both refuse, 422, naming the blockers | AUTO | "a technically invalid invoice cannot be released" |
| C2 (R01) | — | A changed IBAN is still overridable by a reviewer | AUTO | "a business exception such as a changed IBAN stays overridable" |
| C3 (R06) | An exception whose master data was corrected auto-approved with no human | Always at least one approval step; `auto_approved` never fires | AUTO | "an invoice that was ever an exception cannot be auto-approved" |
| C4 (R06) | — | An invoice that was never an exception still goes straight through | AUTO | same file |
| C5 (R02) | `RECONCILIATION_EXCEPTION` was outside the payable unique index | Index covers every post-approval state | AUTO | "duplicate protection survives a reconciliation exception" |
| C6 (R05) | `2026-02-30` returned HTTP 500 and stranded the invoice in RECEIVED | 201, `dates_valid` fails, invoice sits in review | AUTO | "an impossible calendar date fails closed" |
| C7 (R05) | An unparseable date was dropped to null and the invoice approved | Routed to review | AUTO | "an unparseable date is not silently dropped" |
| C8 (R03) | A self-consistent header over contradicting lines passed | Totals are chained line sum to net to gross to payable | AUTO | "line totals that contradict the net amount are caught" |
| C9 (R03) | An unreadable unit price was silently nulled and approved | `amounts_numeric` fails | AUTO | "an unreadable unit price is not approved" |
| C10 (R04) | An invoice addressed to another company was approved | `buyer_is_us` fails | AUTO | "an invoice addressed to another company is not approved" |
| C11 (R04) | A matching tax id excused a contradicting buyer name | Every present identifier must agree | AUTO | "a buyer name that contradicts a matching tax id" |
| C12 (R04) | An unknown tax id fell back to name matching and reported a tax-id match | Contradiction fails `supplier_known` with the real reason | AUTO | "a VAT id that matches no supplier" |
| C13 (R09) | Non-numeric tier limits became NaN and dropped a 30.000-EUR invoice to one approver | `loadPolicy()` throws | AUTO | "invalid policy configuration is rejected" |
| C14 (R09) | Out-of-order tiers were accepted | `loadPolicy()` throws | AUTO | "thresholds that are out of order are rejected" |

## Purchase-order capacity

Tests in `server/domain/purchase-orders/commitments.test.js`. PO-2026-0102
opens with 500,00 EUR and a tolerance of 10,00, so the ceiling for all live
commitments is 510,00.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| P1 | One invoice inside the balance | passes and holds capacity | AUTO | "a single invoice inside the remaining amount still passes" |
| P2 | Second invoice exceeding the order together with the first | REVIEW_REQUIRED, holds nothing | AUTO | "a second invoice that would exceed the order together with the first" |
| P3 | Check evidence | names available capacity and what others hold | AUTO | "the evidence names what is still available" |
| P4 | Tolerance | applies once per order, not per invoice | AUTO | "tolerance applies to the whole order" |
| P5 | Rejection | releases capacity for the next invoice | AUTO | "rejecting an invoice gives its capacity back" |
| P6 | Request for information | releases capacity while the question is open | AUTO | "requesting information releases capacity" |
| P7 | Re-validation | one invoice, one commitment | AUTO | "re-validating an invoice does not commit its amount twice" |
| P8 | Money path | a paid invoice has consumed, not released, the order | AUTO | "capacity stays held all the way through" |
| P9 | Two simultaneous uploads | exactly one proceeds. Mutation-checked: removing the row lock breaks it | AUTO | "two invoices arriving at the same time" |
| P10 | A different order | unaffected | AUTO | "an invoice against a different order is unaffected" |
| P11 | Invoice detail | reports available capacity, excluding the invoice's own hold | AUTO | "the invoice detail reports available capacity" |
| P12 | Original R07 reproduction | no longer reproduces | MANUAL | Probe against a fresh database, 2026-09-17 |
| P13 | Partial deliveries, credit notes, order closure | not modelled | OPEN | Deliberate, see ADR-032 |

## Known limitations, confirmed by reproduction

These are reproduced and accepted for the PoC, not fixed. They must not be
described as working.

| # | Limitation | Reproduction | Status |
|---|---|---|---|
| ~~L1 (R07)~~ | ~~Cumulative PO overrun is not prevented~~ | **Fixed 2026-09-17**: capacity is a commitment ledger; the original reproduction now stops the second invoice. See ADR-032 and the table below. | CLOSED |
| L2 (R08) | Intake and processing are separate transactions. If processing fails after receipt, re-uploading the same file returns DUPLICATE while the original stays in RECEIVED; recovery is a manual reprocess. | Inject a storage read failure after intake commits | OPEN |
| L3 (R10) | The recognised XML subset is loose: namespaces are stripped and only the local name `Invoice` is required, so a non-UBL namespace is still accepted. Allowances, charges, prepayments and rounding are not modelled. | Replace the UBL root namespace | OPEN |
| ~~L4 (R11)~~ | ~~Decisions are not bound to a document hash or validation-run identifier~~ | **Fixed 2026-09-17**: each decision records the document, the validation run and the amount, and two gates refuse a mismatch. See ADR-033 and the table below. | CLOSED |
| L8 | A refusal from the server (a four-eyes violation, a state conflict) is shown verbatim, so it stays German in English mode. The API returns prose, not an error code. | Trigger any 409 in English mode | OPEN |
| L7 | Business checks are not re-run at the final approval gate. Only `payableBlockers` is re-checked, so a supplier blocked between step 1 and step 2 is still approved. | Set a supplier to BLOCKED between two approval steps | OPEN |
| ~~L5 (R12)~~ | ~~Unauthenticated actor header, unrestricted CORS, binds all interfaces~~ | **Fixed 2026-09-17**: password login with server-side sessions, CSRF double-submit, a role matrix, same-origin CORS and loopback binding. See ADR-029 and ADR-030. | CLOSED |
| ~~L6 (R13)~~ | ~~The test helper could drop the development schema~~ | **Fixed 2026-09-17**: `testDeps()` refuses to run when `TEST_DATABASE_URL` equals `DATABASE_URL`. | CLOSED |

## Authentication and authorization

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| S1 | Correct password | 200, user returned, no secret in the body | AUTO | `auth.test.js` |
| S2 | Session cookie flags | HttpOnly and SameSite=Strict | AUTO | `auth.test.js` |
| S3 | Wrong password vs unknown address | identical 401 answer, no account enumeration | AUTO | `auth.test.js` |
| S4 | Repeated failures | account locks, 429 even with the right password | AUTO | `auth.test.js` |
| S5 | Successful login | failure counter cleared | AUTO | `auth.test.js` |
| S6 | No session | 401 on every protected route | AUTO | `auth.test.js` |
| S7 | Forged session token | 401 | AUTO | `auth.test.js` |
| S8 | `X-Actor-Id` header | grants nothing; removed, not deprecated | AUTO | `auth.test.js` |
| S9 | Logout | session revoked server-side, replayed cookie is dead | AUTO | `auth.test.js` |
| S10 | Expired session | 401 | AUTO | `auth.test.js` |
| S11 | Mutation without CSRF token | 403 | AUTO | `auth.test.js` |
| S12 | Mutation with a mismatched CSRF token | 403 | AUTO | `auth.test.js` |
| S13 | Reads without a CSRF token | allowed | AUTO | `auth.test.js` |
| S14 | Password hashing | per-user salt, same password hashes differently | AUTO | `auth.test.js` |
| S15 | Manager attempting a review decision | 403 | AUTO | `auth.test.js` |
| S16 | Clerk attempting the money path | 403 | AUTO | `auth.test.js` |
| S17 | Finance on the money path | 200 | AUTO | `auth.test.js` |
| S18 | Audit actor | the authenticated user, not a claimed one | AUTO | `auth.test.js` |
| S19 | Permissions reported per role | manager lacks review and payment rights | AUTO | `auth.test.js` |
| S20 | Four-eyes after review, with real roles | finance releases, cannot sign; second finance user can | AUTO | `approvals.test.js` |
| S21 | Login and logout through the UI | wrong password refused, session bar, sign-out reachable | MANUAL | Browser, 2026-09-17 |
| S22 | UI hides actions a role may not take | manager sees no review buttons, sees whose step it is | MANUAL | Browser, 2026-09-17 |
| S23 | Test database safeguard | refuses to run when it equals `DATABASE_URL` | MANUAL | Probe, 2026-09-17 |
| S24 | No password reset, second factor or SSO | out of scope | OPEN | Deliberate, see ADR-029 |

## Operational KPIs

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| K1 | Empty system | zeros, no division by zero | AUTO | `kpi.test.js` |
| K2 | Straight-through and exception rates | counted per invoice, not per event | AUTO | `kpi.test.js` |
| K3 | Duplicates | reported separately, never counted as processed volume | AUTO | `kpi.test.js` |
| K4 | Risk signals | count the invoices that raised them | AUTO | `kpi.test.js` |
| K5 | Exception reasons | ranked, biggest first | AUTO | `kpi.test.js` |
| K6 | Workload | counts what waits for a person now | AUTO | `kpi.test.js` |
| K7 | Approval time | measured release to approval | AUTO | `kpi.test.js` |
| K8 | Stage with no data | null, not zero | AUTO | `kpi.test.js` |
| K9 | Processing time split by path | touched path has its own median | AUTO | `kpi.test.js` |
| K10 | Review dwell time | measured entering review to release | AUTO | `kpi.test.js` |
| K11 | Savings estimate | derived from the stated assumptions and real volume | AUTO | `kpi.test.js` |
| K12 | API serves the same figures | 200 with the computed values | AUTO | `kpi.test.js` |
| K13 | Dashboard renders over demo data | all panels, German number format, no page overflow | MANUAL | Browser, 2026-09-17, 1400 px and 375 px |
| K14 | Release-time measurement is sound | reviewed invoices show 17,9 h to release, non-reviewed 0,005 h | MANUAL | SQL check against demo data, 2026-09-17 |

## Money path: accounting, payment, reconciliation

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| M1 | Approved invoice produces one booking record | ACCOUNTING_READY, document number, net/VAT/gross | AUTO | `moneypath.test.js` |
| M2 | Repeated accounting handoff | 409, still one record | AUTO | `moneypath.test.js` |
| M3 | Handoff from a non-approved invoice | 409, state unchanged | AUTO | `moneypath.test.js` |
| M4 | Accounting export | CSV with header and one row per record | AUTO | `moneypath.test.js` |
| M5 | Payment instruction created with an idempotency key | PAYMENT_PENDING, one instruction | AUTO | `moneypath.test.js` |
| M6 | Replayed payment instruction | 409, still one instruction | AUTO | `moneypath.test.js` |
| M7 | Payment confirmation | PAID, instruction EXECUTED with provider reference | AUTO | `moneypath.test.js` |
| M8 | Repeated confirmation | 409, state unchanged | AUTO | `moneypath.test.js` |
| M9 | Payment cannot skip the accounting handoff | 409 | AUTO | `moneypath.test.js` |
| M10 | Statement imported twice | each transaction once | AUTO | `moneypath.test.js` |
| M11 | Reference and amount agree | RECONCILED, transaction MATCHED | AUTO | `moneypath.test.js` |
| M12 | Reference names the invoice, amount differs | exception on that invoice, AMOUNT_MISMATCH | AUTO | `moneypath.test.js` |
| M13 | Transaction matching nothing | stays UNMATCHED, no invoice touched | AUTO | `moneypath.test.js` |
| M14 | Reconciliation run twice | no second reconciliation event | AUTO | `moneypath.test.js` |
| M15 | Exception resolved by hand | RECONCILED, actor and reason recorded | AUTO | `moneypath.test.js` |
| M16 | Resolving without a reason | 400, state unchanged | AUTO | `moneypath.test.js` |
| M17 | Full money path audit chain | eight events, no gap between from and to | AUTO | `moneypath.test.js` |
| M18 | Invoice number that prefixes another | longest match wins | AUTO | `matching.test.js` |
| M19 | Ambiguous reference naming two invoices | AMBIGUOUS_REFERENCE | AUTO | `matching.test.js` |

## Review and approval workflow

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| W1 | Accept from review | READY_FOR_APPROVAL, steps created, reviewer recorded, audit event names the person | AUTO | `approvals.test.js` |
| W2 | Reject from review | REJECTED, reason required | AUTO | `approvals.test.js` |
| W3 | Request info, then info received | INFO_REQUESTED then REVIEW_REQUIRED | AUTO | `approvals.test.js` |
| W4 | Confirm duplicate | DUPLICATE | AUTO | `approvals.test.js` |
| W5 | Review action on an invoice not in review | 409 | AUTO | `approvals.test.js` |
| W6 | Review action without an actor | 400, nothing changes | AUTO | `approvals.test.js` |
| W7 | Single-step approval | APPROVED, approver recorded | AUTO | `approvals.test.js` |
| W8 | Three-step approval | APPROVED only after the last step | AUTO | `approvals.test.js` |
| W9 | Step rejection | REJECTED, remaining steps CANCELLED | AUTO | `approvals.test.js` |
| W10 | Unknown step number | 404 from the handler | AUTO | `approvals.test.js` |
| W11 | A decision records the document, the validation run and the amount | step carries `document_sha256`, `validation_run_no`, `decided_gross` | AUTO | `binding.test.js` |
| W12 | A later step on a changed invoice is refused | 409, invoice stays READY_FOR_APPROVAL | AUTO | `binding.test.js` |
| W13 | Accounting handoff on a changed approved invoice is refused | 409, invoice stays APPROVED | AUTO | `binding.test.js` |
| W14 | An unchanged invoice runs the whole path unaffected | PAID | AUTO | `binding.test.js` |
| W15 | The binding is readable from the API detail | hash and run number present on the step | AUTO | `binding.test.js` |
| W16 | Neutering the drift check breaks the gates | W12 and W13 fail | MANUAL | Mutation check, 2026-09-17: `bindingDrift` returned early, both refusal tests failed |

## API

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| A1 | Upload returns 201 with full detail incl. actor name | 201 | AUTO | `app.test.js` |
| A2 | List and filter by state | correct rows | AUTO | `app.test.js` |
| A3 | Unknown state filter | 400 | AUTO | `app.test.js` |
| A4 | Non-XML upload | 400 | AUTO | `app.test.js` |
| A5 | Original file download | byte-identical | AUTO | `app.test.js` |
| A6 | Unknown invoice | 404 | AUTO | `app.test.js` |

## UI

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| U1 | Inbox shows the blocking reason per row | reason visible without opening the invoice | MANUAL | Browser, 2026-09-17 |
| U2 | Detail shows expected vs found with IBAN divergence marked | differing characters highlighted, both sides grouped in fours | MANUAL | Browser, 2026-09-17 |
| U3 | State spine shows position and blocker | blocked node rendered at the stage reached | MANUAL | Browser, 2026-09-17 |
| U4 | No horizontal page scroll at 375 px | scrollWidth equals clientWidth | MANUAL | Browser, 2026-09-17, measured in page |
| U5 | Keyboard focus visible, reduced motion respected | focus ring, animations disabled | CODE | `:focus-visible` and `prefers-reduced-motion` in `styles.css`, not yet exercised |
| U6 | Four-eyes refusal is visible to the user | server message shown, invoice unchanged | MANUAL | Browser, 2026-09-17: same manager accepted then tried to approve, refusal rendered, step stayed open |
| U7 | Full review-to-approval round trip in the UI | two different people, audit shows both | MANUAL | Browser, 2026-09-17: Tim Kessler released, Lea Sommer approved |
| U8 | Decision panel comes first on a phone | actions above the spine, no page overflow | MANUAL | Browser, 2026-09-17 at 375 px |
| U9 | Money path driven through the UI | approved invoice booked, paid, reconciled | MANUAL | Browser, 2026-09-17 |
| U10 | Reconciliation reasons visible per transaction | each unmatched line states why | MANUAL | Browser, 2026-09-17: amount-only and amount-mismatch cases shown |
| U11 | Spine marks the stage an exception branched from as reached | "Bezahlt" filled while the exception is current | MANUAL | Browser, 2026-09-17, fixed after being spotted |
| U12 | Decided approval step shows what it was signed for | document prefix, validation run and amount under the step; prefix matches the intake SHA-256 | MANUAL | Browser, 2026-09-17: `Beleg 8b48b6eb3f2b · Prüflauf 1 · 4.352,73 €` against file hash `8b48b6eb3f2bf49a…` |
| U13 | Binding line does not overflow at 375 px | scrollWidth equals clientWidth | MANUAL | Browser, 2026-09-17, measured in page |

## Independent review 2026-09-17

Ten findings raised against `ff600ce` in `docs/PROJECT_REVIEW_2026-09-17.md`.
Each was reproduced independently before being fixed; the reproduction is
recorded in the evidence column. The report itself is left as written.

| # | Finding | Reproduced | Fix | Status |
|---|---|---|---|---|
| F01 | Opening an uploaded XML executes script with the viewer's session | Browser, 2026-09-17: XHTML named `.xml` routed to review, its script ran and read `/api/auth/me` as MANAGER | Served as `text/plain` with nosniff and a sandbox policy; ADR-035 | AUTO `file-serving.test.js` for the response contract; MANUAL for execution (see L9) |
| F02 | Reconciliation ignores currency and counterparty | `matching.test.js` written first: USD and a foreign IBAN both matched | Both are evidence; unverifiable is an exception; ADR-036 | AUTO `matching.test.js`, `reconciliation.test.js` |
| F03 | Reference matching selects the wrong invoice | Probe against the real matcher: `INV-10` matched `INV-1`; `"INV-A und INV-LONG"` matched the longer one | Token boundaries; the longest-number tie-break removed; ADR-036 | AUTO `matching.test.js` |
| F04 | The commitment migration forgets existing claims | Disposable database: 0001-0005, an APPROVED invoice for 319,33, then the rest; availability still reported 500,00 | Backfill migration 0009; ADR-037 | AUTO `upgrade.test.js` |
| F05 | Manual resolution does not consume the bank evidence | `reconciliation.test.js`: resolved transaction returned to the pool and matched a later invoice | `RESOLVED` status, set in the same transaction; ADR-036 | AUTO `reconciliation.test.js` |
| F06 | Concurrent login failures bypass the lockout | `auth.test.js`: eight parallel guesses, then a correct password still succeeded | Increment and lock decided in one statement | AUTO `auth.test.js` |
| F07 | Invoice references become spreadsheet formulas in CSV | `csv-export.test.js`: `=1+1` reached the cell unescaped | Formula triggers prefixed, numbers exempt; ADR-038 | AUTO `csv-export.test.js` |
| F08 | Rejection is offered but refused while information is requested | `approvals.test.js`: 409 from `INFO_REQUESTED` | The declared transition is handled, with the same rules | AUTO `approvals.test.js` |
| F09 | Review-cycle medians can be negative | `kpi.test.js`: `READY_FOR_APPROVAL -> INFO_REQUESTED -> REVIEW_REQUIRED` gave -1 hours | Each review entry paired with its own exit; open visits excluded | AUTO `kpi.test.js` |
| F10 | Paid invoices with an open reconciliation count as overdue | `kpi.test.js`: a paid invoice 30 days past due counted as overdue | Overdue means unpaid; `RECONCILIATION_EXCEPTION` excluded | AUTO `kpi.test.js` |

Found while verifying the above, not in the report:

| # | Finding | Reproduced | Fix | Status |
|---|---|---|---|---|
| F11 | Every demo invoice's "view original" link answered 500 | Browser, 2026-09-17: the generator wrote originals to a temp directory the API cannot read | `scripts/demo-data.js` uses the same storage as the API | MANUAL Browser, 2026-09-17, source shown after the fix |

## Residual items from the same review

The report asked for more than the ten findings. These were addressed after the
findings themselves.

| # | Item | Expected | Status | Evidence |
|---|---|---|---|---|
| R1 | Reconcile against the payment instruction, not the invoice | the bank line is compared with what was sent to the bank | AUTO | `matching.test.js`, `reconciliation.test.js`; inner join on `payment_instructions` |
| R2 | Login timing must not reveal whether an account exists | comparable time for known and unknown addresses | AUTO | `auth.test.js`; measured 1.1 ms vs 40.4 ms before, 36.3 vs 37.7 after |
| R3 | Defined behaviour for an expired lock | the attempt count starts again | AUTO | `auth.test.js` |
| R4 | The test-database guard must not be defeated by an equivalent URL | identity, not string equality | MANUAL | 2026-09-17: `postgresql://127.0.0.1:5432/finops` against `postgresql://localhost/finops` refused before `reset()`; dev database intact |
| R5 | KPI definition changes recorded as decisions | an ADR per changed definition | DOC | ADR-039 |
| R6 | The README's no-enumeration claim matched to the evidence | wording and timing both covered | DOC | README, ADR-040 |

| # | Limitation | Why it stays open | Status |
|---|---|---|---|
| L9 | No automated real-browser regression proves the served original cannot execute. The automated tests assert the response contract: type, nosniff, sandbox policy. Browser execution was verified by hand. | A headless-browser runner is a dependency this PoC does not carry. | OPEN |
| L10 | The CSV export prefixes a formula-triggering cell, which alters the value a machine importer reads. | The consumer is a bookkeeping import that should strip a leading apostrophe; the alternative is leaving live formulas in a file people open. Recorded in ADR-038 rather than resolved. | OPEN |

## Display language

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| I1 | Every check the server can emit has English text | no missing key | AUTO | `dictionaries.test.js`, scans the check source |
| I2 | No English entry for a check that no longer exists | no stale key | AUTO | `dictionaries.test.js` |
| I3 | Every state, role and audit action has both languages | no missing label | AUTO | `dictionaries.test.js`, scans `states.js`, `authorize.js` and the domain modules |
| I4 | The two dictionaries carry the same keys | identical key sets | AUTO | `dictionaries.test.js` |
| I5 | The English dictionary contains no German | no German characters | AUTO | `dictionaries.test.js` |
| I6 | A check with no English entry falls back to the server sentence | German shown, nothing blank | AUTO | `dictionaries.test.js` |
| I7 | German terms inside expected/actual are translated | nothing German left | AUTO | `dictionaries.test.js` |
| I8 | Audit reasons the server writes are translated | nothing German left | AUTO | `dictionaries.test.js` |
| I9 | A comment a person typed is left unchanged | same words in both languages | AUTO | `dictionaries.test.js` |
| I10 | German mode passes server text through untouched | identical string | AUTO | `dictionaries.test.js` |
| I11 | Switching language changes every view | nav, dashboard, detail, payments all switch | MANUAL | Browser, 2026-09-17, both directions |
| I12 | Only data stays German in English mode | supplier names, document payment terms | MANUAL | Browser, 2026-09-17: page scan found only `Berliner Bürobedarf GmbH` |
| I13 | The choice survives a reload | localStorage, per browser | MANUAL | Browser, 2026-09-17 |
| I14 | `lang` and the document title follow the language | `lang="en"`, English title | MANUAL | Browser, 2026-09-17, read from the DOM |
| I15 | Numbers and dates follow the language | `62,9 %` in German, `62.9 %` in English; EUR in both | MANUAL | Browser, 2026-09-17 |
| I16 | No horizontal overflow at 375 px in English | scrollWidth equals clientWidth | MANUAL | Browser, 2026-09-17, measured in page |
| I17 | Server refusal messages stay German in English mode | shown verbatim | OPEN | Known limitation L8 |
