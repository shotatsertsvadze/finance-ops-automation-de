# Test Matrix

One consolidated matrix. Update rows in place; never start a second matrix.

Legend:
- **AUTO** verified by an automated test (`npm test`), test file named
- **MANUAL** verified by hand, date and method named
- **CODE** inferred from reading the code only, never executed
- **CI** verified by an automated job in `.github/workflows/ci.yml` outside `npm test`, job named
- **OPEN** not yet tested, a real gap

Run: `npm test` (712 tests, all passing as of 2026-09-30; the three
real-validator tests skip without `KOSIT_TEST_URL` and run in CI, see
"Official validation"). Database tests need
`TEST_DATABASE_URL` and rebuild the `finops` schema in that database.

## High-priority business risks

| # | Risk / behaviour | Expected | Status | Evidence |
|---|---|---|---|---|
| R1 | Changed IBAN never auto-passes | HIGH failure, REVIEW_REQUIRED | AUTO | `intake.test.js` "B: changed IBAN never auto-passes"; `business-checks.test.js` also covers a RETIRED account not counting as approved |
| R1a | A changed IBAN cannot be released from review | 422 `NOT_PAYABLE_ELIGIBLE`, blocker `supplier_iban_match`, stays REVIEW_REQUIRED | AUTO | `approvals.test.js` "a changed IBAN cannot be released from review"; the way on (master data, then re-validation, still one signature) is R06 in `controls.test.js` |
| R1b | Payment re-checks master data | 409 `IBAN_NOT_VERIFIED` for a retired account, 409 `SUPPLIER_NOT_ACTIVE` for a blocked supplier; nothing instructed | AUTO | `moneypath.test.js` "no payment goes to …" |
| R2 | Identical file uploaded twice | second is DUPLICATE, not processed, original untouched | AUTO | `intake.test.js` "identical file uploaded again becomes DUPLICATE" |
| R3 | Same supplier + number, different file | REVIEW_REQUIRED, no payable record | AUTO | `intake.test.js` "D: same supplier and number in a different file" |
| R4 | Two payable records for one supplier invoice number | impossible, DB rejects with 23505 | AUTO | `intake.test.js` "database forbids two payable records"; partial unique index `invoices_one_payable_per_number`, covering CREDITED and SETTLED_BY_CREDIT since 0013; `schema-states.test.js` compares the index with `PAYABLE_STATES` |
| R4a | Every state has exactly one phase, and every state list derives from it | a state without a phase fails the suite; nothing moves backward once committed | AUTO | `states.test.js` (ADR-051) |
| R5 | Malformed / non-XML input | fail closed to REVIEW_REQUIRED, file kept and readable | AUTO | `intake.test.js` "F: malformed file fails closed", "non-XML bytes fail closed" |
| R6 | XML with DOCTYPE or ENTITY | rejected before the parser runs | AUTO | `technical-validation.test.js` "DOCTYPE is rejected before parsing" |
| R7 | Amount thresholds route to the right tier | 380 auto, 1 240 MANAGER, 30 000 three steps | AUTO | `decide.test.js` (incl. boundary values); `intake.test.js` A, E, G |
| R8 | Same actor cannot satisfy two approval steps | 409, step stays PENDING, invoice not approved | AUTO | `approvals.test.js` "one actor cannot satisfy two approval steps" |
| R8a | Whoever submitted an invoice cannot approve it | 409 `UPLOADER_CANNOT_APPROVE`; another manager can | AUTO | `approvals.test.js` "whoever submitted an invoice cannot approve it" |
| R8b | Whoever signed an approval step cannot pay the invoice | 409 `APPROVER_CANNOT_PAY` on instruction and on confirmation, state unchanged; a second finance user can | AUTO | `separation.test.js` (ADR-056) |
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

They run through the real pipeline in `intake.test.js`; A-G were also uploaded
through the running UI on 2026-09-17, and I and J on 2026-09-18 (MANUAL,
browser).

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
| I | 3 % discount, 499.80 EUR due | APPROVED, no steps; 535.50 without the discount would need one | AUTO | `business-checks.test.js` "fixture I behaves as the README says" |
| J | credit note, 214.20 EUR, crediting RE-2026-4471 | APPROVED, booked negative, CREDITED, never paid | AUTO | `moneypath.test.js` "a credit note runs the pipeline" |
| A-J, demo | official XRechnung validity | KoSIT accepts A-E and G-J and rejects F; of the 70 generated demo invoices it accepts 65 and rejects the 5 malformed ones | AUTO | `kosit-real.test.js` against the pinned KoSIT 1.6.3 and configuration 2026-08-31 (OV21-OV23); first measured by hand in the spike, 2026-09-30 |

## Parsing and technical validation

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| T1 | UBL fields map to the neutral structure | number, VAT ID, IBAN, PO, totals, lines | AUTO | `technical-validation.test.js` |
| T2 | Not well-formed XML | `xml_well_formed` FAILED | AUTO | `technical-validation.test.js` |
| T3 | CII (ZUGFeRD syntax) | `format_recognised` FAILED, reported as unsupported, not a crash | AUTO | `technical-validation.test.js` |
| T4 | Missing XRechnung CustomizationID | MEDIUM failure | AUTO | `technical-validation.test.js` |
| T5 | Non-numeric amounts or quantities | `amounts_numeric` FAILED | AUTO | `technical-validation.test.js` |
| T6 | Document-level allowances and charges are read with amount and reason | `allowanceCharges`, `allowanceTotal`, `chargeTotal` | AUTO | `allowances.test.js` |
| T7 | A charge indicator that says neither is read as neither | `isCharge` null, not defaulted | AUTO | `allowances.test.js` |
| T8 | Prepayment and rounding are read | `prepaid`, `rounding`, amount due after them | AUTO | `allowances.test.js` |
| T9 | A line-level allowance is read on its line | `lines[].allowanceCharges` | AUTO | `allowances.test.js` |
| T9a | A base quantity is read | `lines[].baseQuantity` | AUTO | `allowances.test.js` |
| T9b | A UBL CreditNote document is read as a credit note | `documentType`, lines under CreditNoteLine/CreditedQuantity | AUTO | `credit-notes.test.js` |
| T9c | An Invoice document with type code 381 is one too | `documentType` CREDIT_NOTE | AUTO | `credit-notes.test.js` |
| T9d | A CreditNote root in another namespace | refused | AUTO | `credit-notes.test.js` |
| T9e | 380 and 381 are both known types | no `invoice_type_code` warning | AUTO | `credit-notes.test.js` |
| T9f | A CreditNote's due date | read from `PaymentMeans/PaymentDueDate`, where the UBL CreditNote schema puts it; an Invoice still reads only its own `DueDate` | AUTO | `credit-notes.test.js` "a CreditNote's due date", "an Invoice's due date" |
| T10 | Official EN 16931 / KoSIT validation | not implemented, adapter boundary only | OPEN | Deliberate, see ADR-008 |

## Business checks

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| B1 | Clean invoice, all master data matches | no FAILED check | AUTO | `business-checks.test.js` |
| B2 | Unknown supplier | HIGH, dependent checks SKIPPED not passed | AUTO | `business-checks.test.js` |
| B3 | Blocked supplier | `supplier_active` HIGH | AUTO | `business-checks.test.js` |
| B4 | Amount within PO tolerance | PASSED | AUTO | `business-checks.test.js` |
| B5 | Inconsistent totals | `totals_consistent` HIGH | AUTO | `business-checks.test.js` |
| B8 | A discounted invoice is verified, not refused | no FAILED check; net and amount due are after the discount | AUTO | `business-checks.test.js` |
| B9 | A surcharge is added, a prepayment subtracted | `totals_consistent` PASSED at the right amount | AUTO | `business-checks.test.js` |
| B10 | A discount the totals do not declare | `totals_consistent` HIGH naming the link | AUTO | `business-checks.test.js` |
| B11 | An allowance with no charge indicator | `totals_consistent` HIGH, not guessed either way | AUTO | `business-checks.test.js` |
| B12 | Tax breakdown per rate | read from each TaxSubtotal; absent means none, not a guess | AUTO | `invoice/tax-breakdown.test.js` |
| B13 | A breakdown that cannot be booked | `tax_breakdown_bookable` HIGH for a missing breakdown, an unmapped rate, reverse charge, a rate's tax off, or sums off | AUTO | `validation/tax-breakdown.test.js` |
| B14 | An unbookable breakdown in review | REVIEW_REQUIRED, and review cannot release it | AUTO | `intake.test.js` "a rate with no tax key stops the invoice" |
| B15 | A mixed-rate invoice | processed like a clean one; booked as one line per rate under one document number, one CSV row per line | AUTO | `intake.test.js`; `booking-lines.test.js` |
| B16 | An invoice parsed before the breakdown was read | booked from its stored original, not guessed | AUTO | `booking-lines.test.js` |
| B17 | The handoff does not trust validation alone | 422 `TAX_BREAKDOWN_NOT_BOOKABLE`, no line written | AUTO | `booking-lines.test.js` |
| C1 | An approved invoice is stopped | CANCELLED, reason on the audit event, PO claim released | AUTO | `cancellation/cancel.test.js`; browser check 2026-09-23 (MANUAL): spine and history show it |
| C2 | Stopping without a reason, or by a clerk or manager | 400 `REASON_REQUIRED`; 403 | AUTO | `cancellation/cancel.test.js` |
| C3 | A booked invoice is stopped | reversal lines: new document number, sign turned, `reverses_document_no` names the booking | AUTO | `cancellation/cancel.test.js` |
| C4 | Stopping before approval or once payment is instructed | 409 `NOT_CANCELLABLE` | AUTO | `cancellation/cancel.test.js`; `states.test.js` |
| C5 | The client offers stopping only where the server allows it | APPROVED and every booked variant, finance, reason required | AUTO | `actions.test.js` |
| C6 | Every server module is scanned for refusal codes | a new folder cannot slip past the dictionary guard | AUTO | `dictionaries.test.js` |
| C7 | A payment the bank did not carry out | PAYMENT_FAILED with a reason; instruction FAILED | AUTO | `payments/payment-failure.test.js` |
| C8 | Reporting a failure without a reason, or after confirmation | 400 `REASON_REQUIRED`; 409 | AUTO | `payments/payment-failure.test.js` |
| C9 | Retry | back to ACCOUNTING_READY; the next instruction is a new attempt with its own key; confirmation pays that one | AUTO | `payments/payment-failure.test.js` |
| C10 | Credits spent on a failed payment | released, open again, applied to the retry | AUTO | `payments/payment-failure.test.js` |
| C11 | A failed payment is stopped | CANCELLED, booking reversed | AUTO | `payments/payment-failure.test.js` |
| C12 | Two live instructions for one invoice | impossible, partial unique index | AUTO | `payments/payment-failure.test.js` |
| C13 | Fail, then retry, in the browser | state, hint and both ways out shown; retry offers payment again | MANUAL | Browser, 2026-09-23, test database |
| B12 | A stated amount that cannot be read is not zero | `totals_consistent` HIGH | AUTO | `business-checks.test.js` |
| B13 | Nothing left to pay after a discount or prepayment | REVIEW_REQUIRED, `NOTHING_TO_PAY` | AUTO | `decide.test.js` |
| B14 | A line amount that does not follow from quantity and price | `line_amounts_consistent` HIGH, totals still PASSED | AUTO | `business-checks.test.js` |
| B15 | A price stated per base quantity | PASSED; the base quantity divides the price | AUTO | `business-checks.test.js` |
| B16 | A line discount the line amount reflects, and one it ignores | PASSED, then FAILED | AUTO | `business-checks.test.js` |
| B17 | A line that cannot be recomputed: no quantity, no price, a base quantity of zero | `line_amounts_consistent` FAILED HIGH, "Menge oder Einzelpreis nicht lesbar"; overridable like B18 (ADR-081, was SKIPPED under ADR-048) | AUTO | `business-checks.test.js` |
| B17a | The same invoice under the auto-approve limit, no validator configured | REVIEW_REQUIRED, `LINE_AMOUNTS_CONSISTENT`, never APPROVED; with a required validator missing or unreachable it still stops first as `TECHNICAL_VALIDATION_FAILED` | AUTO | `intake.test.js` |
| B18 | A reviewer may accept a miscalculated line | not in payableBlockers, unlike `totals_consistent` | AUTO | `business-checks.test.js` |
| B19 | Quantity times price is exact, not floating point | half a cent rounds away from zero; no precision lost on large lines | AUTO | `money.test.js` |
| B20 | Fixture I behaves as the README table promises | no FAILED check, 499.80 EUR due, approved automatically | AUTO | `business-checks.test.js` |
| B21 | A credit note naming the invoice it credits | `credit_note_reference` PASSED | AUTO | `business-checks.test.js` |
| B22 | A credit note naming nothing | `credit_note_reference` MEDIUM | AUTO | `business-checks.test.js` |
| B23 | An invoice is not asked what it credits | the check is absent, not SKIPPED | AUTO | `business-checks.test.js` |
| B24 | A credit note larger than the order | `po_amount_within_tolerance` SKIPPED, no failure | AUTO | `business-checks.test.js` |
| B25 | An unreadable credit balance | not netted against, not treated as zero | AUTO | `netting.test.js` |
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
| P11b | A credit note gives capacity back | negative claim, order shows the amount free again | AUTO | `credit-note-path.test.js` |
| P11c | A booked credit note keeps its claim | capacity stays back after CREDITED | AUTO | `credit-note-path.test.js`; releasing it undid the credit |
| P11d | An invoice settled by credit keeps its claim | ACTIVE commitment after SETTLED_BY_CREDIT | AUTO | `netting-path.test.js` "a settled invoice keeps its claim" |
| P11e | Claims released by settlement before 0013 are restored | once, however often the repair runs | AUTO | `upgrade.test.js` "an invoice settled by credit before 0013" |
| P11a | An order taken past its value by reviewers | shown as over-committed, not as a negative availability | MANUAL | Invoice detail, DEMO-PO-KLEIN in the demo run |
| P12 | Original R07 reproduction | no longer reproduces | MANUAL | Probe against a fresh database, 2026-09-17 |
| P13 | Partial deliveries and order closure | not modelled | OPEN | Deliberate, see ADR-032; credit notes returning capacity are modelled, see ADR-049 |

## Known limitations, confirmed by reproduction

These are reproduced and accepted for the PoC, not fixed. They must not be
described as working.

| # | Limitation | Reproduction | Status |
|---|---|---|---|
| ~~L1 (R07)~~ | ~~Cumulative PO overrun is not prevented~~ | **Fixed 2026-09-17**: capacity is a commitment ledger; the original reproduction now stops the second invoice. See ADR-032 and the table below. | CLOSED |
| ~~L2 (R08)~~ | ~~A stranded intake could only be rescued by an operator~~ | **Fixed 2026-09-17**: sending the same file again resumes an invoice whose first run never finished. See ADR-044 and the table below. | CLOSED |
| L3 (R10, partly closed) | The recognised XML subset is narrow. **Fixed 2026-09-17**: the root namespace is now required. **Fixed 2026-09-18**: allowances, charges and prepayments are computed along the EN 16931 chain rather than refused, so a discounted invoice is payable (ADR-047 supersedes ADR-043). **Also 2026-09-18**: each line is recomputed from quantity, unit price and base quantity, so a declared line amount is no longer taken on trust (ADR-048). Still narrow: only UBL syntax is read, and CII remains an adapter boundary. | Upload a CII document | OPEN |
| ~~L4 (R11)~~ | ~~Decisions are not bound to a document hash or validation-run identifier~~ | **Fixed 2026-09-17**: each decision records the document, the validation run and the amount, and two gates refuse a mismatch. See ADR-033 and the table below. | CLOSED |
| ~~L8~~ | ~~Server refusals stay German in English mode~~ | **Fixed 2026-09-17**: every refusal carries a code and its parameters; the client renders it in the chosen language and falls back to the server's sentence. See ADR-042 and the table below. | CLOSED |
| ~~L7~~ | ~~Business checks are not re-run at the final approval gate~~ | **Fixed 2026-09-17**: the gate re-checks business facts against current master data and returns the invoice to review when one has newly failed. See ADR-041 and the table below. | CLOSED |
| ~~L5 (R12)~~ | ~~Unauthenticated actor header, unrestricted CORS, binds all interfaces~~ | **Fixed 2026-09-17**: password login with server-side sessions, CSRF double-submit, a role matrix, same-origin CORS and loopback binding. See ADR-029 and ADR-030. | CLOSED |
| ~~L6 (R13)~~ | ~~The test helper could drop the development schema~~ | **Fixed 2026-09-17**: `testDeps()` refuses to run when `TEST_DATABASE_URL` equals `DATABASE_URL`. | CLOSED |
| L9 | A supplier's previous bank account stays trusted after a new one is approved: both can be paid until retiring accounts exists (ADR-077) | Approve a change for S-1001: both IBANs are ACTIVE | OPEN |
| L10 | The exception ranking counts the comment typed at "information received" as a reason of its own, because that return to review records the comment as its reason | Demo step 5: the ranking lists "Rückruf erledigt, Konto freigegeben" once | OPEN |
| L11 | The official-validation call runs inside the invoice's transaction and holds its row lock for the call, 10-40 ms normally and at most `KOSIT_TIMEOUT_MS` (20 s cap). The readiness check does not ask the validator; the Docker demo runs without one, so there the check is SKIPPED (ADR-078) | Stop the daemon: `/api/health/ready` still answers 200 and a new invoice goes to review | OPEN |
| L12 | Rarely, one full-suite run fails with pg's "timeout exceeded when trying to connect", seen in `getInvoiceDetail`. Cause not established; it passed on rerun and in isolated runs, and was seen before ADR-078 | Not reproducible on demand: seen once in Phase 1 and once in Phase 2, not in the reruns | OPEN |
| L13 | The operational figures declare SYNTHETIC as a constant, because the application holds demo data only. On real invoices they would still say synthetic: before a customer or pilot deployment, their source must follow the actual dataset (ADR-079) | Read `server/domain/kpi/provenance.js`: `volume` to `cycle` map to SYNTHETIC unconditionally | OPEN |
| L14 | A source's explanation is hover text (`title`), which touch screens do not show. The source label itself is always visible text, so the meaning never rests on colour or hover alone | Tap a source tag on a phone: no explanation appears | OPEN |
| L15 | Whether an AI explanation contradicts the evidence in free text is checked only by a phrase list; facts, the set of failures, cited checks and steps are checked exactly. Negation is read per clause, so a double negation ("kein Grund, warum sie nicht bezahlt werden kann") is taken as negated (ADR-080) | An answer such as "the order has room left" without a number passes the verifier | OPEN |
| L16 | Real-provider quality and acceptance rate of the AI explanation are unmeasured: it is structurally tested with a stand-in provider only, because paid API usage is not enabled for this project (ADR-080) | `npm run ai:eval`, 2026-09-30: every request refused by the API (account without API credit); no answer was generated | OPEN |

## Authentication and authorization

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| S1 | Correct password | 200, user returned, no secret in the body | AUTO | `auth.test.js` |
| S2 | Session cookie flags | HttpOnly and SameSite=Strict | AUTO | `auth.test.js` |
| S3 | Wrong password vs unknown address | identical 401 answer, no account enumeration | AUTO | `auth.test.js` |
| S4 | Repeated failures | the address is throttled, 429 `LOGIN_THROTTLED` with `Retry-After` even with the right password (ADR-059) | AUTO | `auth.test.js` "repeated failures stop that address" |
| S4a | A guesser cannot lock the owner out | six failures from one address; the owner signs in from another | AUTO | `auth.test.js` "someone guessing a password does not lock its owner out" |
| S4b | Password spraying from one address | twenty failures across accounts, the twenty-first refused; other addresses untouched | AUTO | `auth.test.js` "one address guessing across many accounts is stopped" |
| S4c | Throttling does not enumerate accounts | a real and an unknown address are throttled with the same answer | AUTO | `auth.test.js` "an unknown address is throttled exactly like a real one" |
| S4d | A client cannot choose its own address | `X-Forwarded-For` honoured through a loopback proxy, ignored on a direct connection | MANUAL | Probe, 2026-09-23: 1.2.3.4 via 127.0.0.1; the real LAN address when connecting directly |
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
| S25 | Production start refuses the published demo password | every such account named, ADMIN included; an account with its own password is not; `DEMO_MODE=true` allows it; development never refused | AUTO | `server/config/deployment.test.js` (ADR-058) |
| S26 | Production start refuses a missing client build | names `npm run build` | AUTO | `server/config/deployment.test.js` |
| S27 | Replacing a password ends the old sessions | old session 401, demo password 401, new password signs in; short password and unknown account refused | AUTO | `server/auth/set-password.test.js` |
| S28 | The API serves the built client | page, assets, a reloaded client route gets the page; an unknown `/api` path stays a JSON 401 | AUTO | `server/client-serving.test.js` |
| S30 | Every response names its request | `X-Request-Id` set; a usable inbound id kept, an unusable one replaced | AUTO | `server/observability.test.js` (ADR-060) |
| S31 | One JSON log line per request | method, path, status, ms, user; no password, no query string | AUTO | `server/observability.test.js` |
| S32 | An internal error is traceable, not exposed | logged with request id and stack; the caller gets the id, not the cause; the client shows it as the reference | AUTO | `server/observability.test.js`; `dictionaries.test.js` |
| S33 | Readiness asks the database | 200 when it answers; 503 within the 2 s timeout when it hangs | AUTO | `server/observability.test.js` |
| S34 | Logs from a running server | startup, health, readiness and a refused request each one JSON line; the test run writes none | MANUAL | Probe, 2026-09-23 |
| S29 | `npm start` end to end | refused with exit 1 on demo passwords and no build; in demo mode serves the UI with `Secure` cookies, sign-in and reload work in chromium; after `user:password` for every account it starts and the demo password gets 401 | MANUAL | Probe, 2026-09-23, against the test database |

## Operational KPIs

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| K1 | Empty system | zeros, no division by zero | AUTO | `kpi.test.js` |
| K2 | Straight-through and exception rates | counted per invoice, not per event | AUTO | `kpi.test.js` |
| K3 | Duplicates | reported separately, never counted as processed volume | AUTO | `kpi.test.js` |
| K4 | Risk signals | count the invoices that raised them | AUTO | `kpi.test.js` |
| K5 | Exception reasons | ranked, biggest first | AUTO | `kpi.test.js` |
| K6 | Workload | counts what waits for a person now | AUTO | `kpi.test.js` |
| K6a | A failed payment on the dashboard | counted under "Zahlungen fehlgeschlagen" as work for finance | AUTO | `kpi.test.js` "a payment the bank did not carry out is waiting for finance" |
| K7 | Approval time | measured release to approval | AUTO | `kpi.test.js` |
| K8 | Stage with no data | null, not zero | AUTO | `kpi.test.js` |
| K9 | Processing time split by path | touched path has its own median | AUTO | `kpi.test.js` |
| K10 | Review dwell time | measured entering review to release | AUTO | `kpi.test.js` |
| K11 | Savings estimate | derived from the stated assumptions and real volume | AUTO | `kpi.test.js` |
| K12 | API serves the same figures | 200 with the computed values | AUTO | `kpi.test.js` |
| K12a | Credited and settled documents are not overdue | overdue and due-soon count only OUTSTANDING_STATES | AUTO | `kpi.test.js` "no settled document is overdue" |
| K13 | Dashboard renders over demo data | all panels, German number format, no page overflow | MANUAL | Browser, 2026-09-17, 1400 px and 375 px |
| K14 | Release-time measurement is sound | reviewed invoices show 17,9 h to release, non-reviewed 0,005 h | MANUAL | SQL check against demo data, 2026-09-17 |
| K15 | An operational figure (ADR-079) | volume, rates, risk, workload, cycle times and the basis count name SYNTHETIC | AUTO | `kpi.test.js` "an operational figure names the synthetic demo data" |
| K16 | The savings inputs | name ASSUMPTION | AUTO | `kpi.test.js` "the savings inputs are named as modelled assumptions" |
| K17 | A savings figure | time saved, cost saved and minutes per invoice name SYNTHETIC and ASSUMPTION | AUTO | `kpi.test.js` "a savings figure names both of its sources" |
| K18 | No customer baseline, no pilot | both `available: false`, explained as "Nicht gemessen", no period; no figure cites a source that is not available | AUTO | `kpi.test.js` "with no customer baseline and no pilot" |
| K19 | A figure without a source | every block and economics figure is mapped, and nothing stale | AUTO | `kpi.test.js` "every figure the dashboard is sent names its source"; mutation check 2026-09-30: removing `cycle` from the map fails it |
| K20 | The API contract | `provenance` with the four sources, each with label, explanation, `available`, `period` | AUTO | `kpi.test.js` "the API serves the same figures" |
| K21 | Source labels in both languages | a label and an explanation per type in German and English; "Nicht gemessen" / "Not measured" | AUTO | `dictionaries.test.js` |
| K22 | Figures unchanged by the labels | every KPI and savings value identical before and after, on the same demo month | MANUAL | 2026-09-30: on one demo month, the KPI response of `main` (6cda0c2) and of this change compared; identical except the added `provenance` |
| K23 | The labels on screen | legend, a tag per figure or panel, amber where an assumption is involved, "Nicht gemessen" for baseline and pilot; no page overflow | MANUAL | Browser, 2026-09-30, German and English, 1280 px and 390 px |

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
| M11 | A credit note over the API | APPROVED, booking -214.20, CREDITED | AUTO | `moneypath.test.js` |
| M12 | Paying a credit note | 422 `CREDIT_NOTE_NOT_PAYABLE`, nothing written | AUTO | `moneypath.test.js`, `credit-note-path.test.js` |
| M13 | Closing an invoice as a credit | 409 `NOT_A_CREDIT_NOTE` | AUTO | `moneypath.test.js` |
| M14 | Booking a credit twice | 409 `NOT_READY_TO_CREDIT` | AUTO | `moneypath.test.js` |
| M15 | A clerk booking a credit | 403 | AUTO | `moneypath.test.js` |
| M16 | The booking record of a credit note | net, tax and gross negated | AUTO | `credit-note-path.test.js` |
| M17 | An open credit reduces what is sent to the bank | instruction 476.00 for a 595.00 invoice | AUTO | `netting-path.test.js` |
| M18 | Netting order | oldest credit first, ties by number; independent of row order | AUTO | `netting.test.js` |
| M19 | A credit of another supplier | not applied | AUTO | `netting-path.test.js` |
| M19a | The open credit on the invoice detail | the netting's own figure: same supplier, same currency, drives pay vs. settle | AUTO | `netting-path.test.js` "the invoice detail shows the credit the payment would apply"; PO availability likewise comes from `availableCents` |
| M20 | A credit note not yet booked | not available for netting | AUTO | `netting-path.test.js` |
| M21 | An invoice the credits cover entirely | 409 `FULLY_CREDITED`; settles through its own action | AUTO | `netting-path.test.js` |
| M22 | Settling an invoice with a remainder | 409 `NOT_FULLY_CREDITED`, nothing consumed | AUTO | `netting-path.test.js` |
| M23 | A credit applied twice to one invoice | refused by the unique index | AUTO | `netting-path.test.js` |
| M23a | Two sessions reach the same credit note at once, the second waiting for the first's lock: payment against payment, settlement against payment, payment against settlement | the credit is spent once; the second sees only what the first left (119.00 of 357.00 after a settlement; nothing after a payment, so it pays in full); an invoice the spent credit no longer covers is refused `NOT_FULLY_CREDITED` and stays ACCOUNTING_READY (ADR-083) | AUTO | `netting-path.test.js` "payment against payment", "settlement against payment", "payment against settlement"; a third session holds the ledger table so the first stops with its locks held |
| M23b | Two payment instructions at once, unforced, five runs | never more applied than the credit; one netted, one in full | AUTO | `netting-path.test.js` "unforced, repeated"; before ADR-083 the credit was spent twice in 20 of 20 runs |
| M24 | What was applied is on the audit trail | gross, amount applied and the credit notes used | AUTO | `netting-path.test.js` |
| M25 | A netted payment reconciles | bank line -476.00 matched against the instruction, no rule changed | MANUAL | End-to-end probe, 2026-09-18: imported, matched, RECONCILED |
| M26 | A partly used credit keeps its remainder | 476.00 credit, 119.00 applied, 357.00 left | AUTO | `netting-path.test.js` |
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

## Official validation (ADR-078)

The KoSIT validator, pinned to 1.6.3 with the XRechnung 3.0.2 configuration of
2026-08-31. Transport in `server/integrations/kosit.test.js`; meaning in
`server/domain/invoice/official-validation.test.js` (real reports as
fixtures); intake in `server/domain/intake/official-intake.test.js` and
`official-retry.test.js` (a stand-in built from real reports); the real daemon
in `server/integrations/kosit-real.test.js`.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| OV1 | An accepted report | PASSED; validator and configuration version, scenario and the reported document hash kept | AUTO | `official-validation.test.js`; `kosit-real.test.js` |
| OV2 | A rejected report | FAILED, naming the error count, the rule codes and the first message | AUTO | `official-validation.test.js`; `kosit-real.test.js` (F) |
| OV3 | A report that contradicts its HTTP status | FAILED, no verdict recorded | AUTO | `official-validation.test.js` |
| OV4 | A report about another document | FAILED: its SHA-256 is not this document's | AUTO | `official-validation.test.js` |
| OV5 | A report from another validator version | FAILED | AUTO | `official-validation.test.js` |
| OV6 | A report from another rule configuration, or an acceptance naming none | FAILED | AUTO | `official-validation.test.js` |
| OV7 | A body that is not a report (empty, text, HTML, truncated) | FAILED | AUTO | `official-validation.test.js` |
| OV8 | No answer within the timeout, or a body that stalls | TIMEOUT, FAILED | AUTO | `kosit.test.js`, `official-validation.test.js` |
| OV9 | Validator not running | UNAVAILABLE, FAILED; an invoice that would auto-approve goes to review | AUTO | `kosit.test.js`, `official-intake.test.js` |
| OV10 | HTTP 422 | UNPROCESSABLE, FAILED | AUTO | `kosit.test.js`, `official-intake.test.js` |
| OV11 | Any other status (400, 500) | ERROR, FAILED | AUTO | `kosit.test.js`, `official-validation.test.js` |
| OV12 | Required but not configured | FAILED and recorded as NOT_CONFIGURED; a production start without `KOSIT_URL` is refused | AUTO | `official-intake.test.js`, `deployment.test.js` |
| OV13 | Not configured outside production | SKIPPED, saying the document was not validated officially; the business checks run; nothing recorded as a validation | AUTO | `official-intake.test.js` |
| OV14 | A document the parser cannot read | not sent; SKIPPED | AUTO | `official-validation.test.js`, `official-intake.test.js` |
| OV15 | The evidence of a run | one row per run: verdict, versions, both hashes, report and its SHA-256; the invoice detail carries it without the raw report | AUTO | `official-intake.test.js` |
| OV16 | A failed official validation and the release | a payable blocker; release refused with 422; no business checks for that run | AUTO | `official-intake.test.js` |
| OV17 | Reprocessing after an outage | a new run; run 1's record and FAILED check stay; the invoice then needs a signature (ADR-020) | AUTO | `official-intake.test.js` |
| OV18 | The retry after an outage | validates stranded invoices once each; a replay changes nothing; while the validator is down nothing is touched; verdicts and invoices waiting for an answer are left alone; two retries at once run an invoice once, even one that stays in review | AUTO | `official-retry.test.js`; mutation check 2026-09-30: without the re-check under the lock the concurrent case ran B twice |
| OV19 | The app's database role and the evidence | update, delete and truncate refused; a production start checks it | AUTO | `audit-role.test.js` |
| OV20 | `KOSIT_TIMEOUT_MS` above 20 s or not a number | the start stops: the call runs inside the invoice's transaction | AUTO | `kosit.test.js` |
| OV21 | The real validator and the fixtures | A-E and G-J accepted, F rejected, each report naming the document | AUTO | `kosit-real.test.js` |
| OV22 | The real validator through intake | B and H stop on their IBAN, C on its order, D (after A) as a duplicate, each with the official check PASSED; F technical; A, E awaiting approval; G, I, J approved | AUTO | `kosit-real.test.js` |
| OV23 | The demo month against the real validator | 65 accepted; rejected exactly DEMO-2026-01002, -01026, -01037, -01048, -01053; states and generator totals as without the validator | AUTO | `kosit-real.test.js` |
| OV24 | Without a validator, or a named one that does not answer | the real tests skip without `KOSIT_TEST_URL`; with `KOSIT_TEST_REQUIRED=true`, or a URL that does not answer, they fail | MANUAL | 2026-09-30, both runs |
| OV25 | `npm run kosit:fetch` and `npm run kosit` | fetch verifies both SHA-256s and keeps verified files; start refuses a missing or altered artifact, a missing Java, the macOS stub `/usr/bin/java`, and a non-local `KOSIT_URL`; the daemon listens on 127.0.0.1 only | MANUAL | 2026-09-30, with Homebrew openjdk@17 through `KOSIT_JAVA`; `lsof` shows 127.0.0.1:8081 |
| OV26 | CI and the real validator | Java 17, the pinned artifacts fetched and cached, the daemon started before `npm test` with the real tests required | CI | `ci.yml` job `test` |
| OV27 | The check in English | an entry for PASSED, FAILED and SKIPPED | AUTO | `dictionaries.test.js` |

## AI exception explanation (ADR-080)

The capability is optional, off by default and non-authoritative. CI runs
these with a stand-in provider (`test-support/ai.js`); no test calls a real
model, and real-provider evaluation is pending (L16, AI24).

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| AI1 | Off (the default) | the endpoint says `{enabled:false}`, a request is refused with `AI_DISABLED`, nothing recorded; the invoice detail is identical with AI on or off | AUTO | `explanations.test.js` "off"; `ai-explanation.test.js` |
| AI2 | On without a key | the attempt is FAILED, "Kein API-Schlüssel konfiguriert", nothing else changes; a production start is refused | AUTO | `explanations.test.js`; `deployment.test.js` |
| AI3 | Timeout, unreachable provider | FAILED, recorded, "unavailable"; state, checks, routing, audit and approval steps unchanged | AUTO | `explanations.test.js` "a timeout", "an unreachable provider" |
| AI4 | An answer that is not the agreed JSON | REJECTED (SCHEMA), never returned | AUTO | `explanations.test.js`; `grounding.test.js` |
| AI5 | A cited check that does not exist | REJECTED (UNKNOWN_CHECK) | AUTO | `grounding.test.js` |
| AI6 | An invented IBAN, amount, PO number, date or rule code, in German or English notation | REJECTED (UNGROUNDED); a figure from the evidence in either notation passes | AUTO | `grounding.test.js` |
| AI7 | A failure left out, or a passed check named as the failure | REJECTED (FAILED_CHECKS) | AUTO | `grounding.test.js` scenarios 1, 3, 4, 5 |
| AI8 | A next step not offered, or one that would move the invoice on | REJECTED (NEXT_STEP); the steps offered never include accept, approve or pay | AUTO | `grounding.test.js`; `explanation-input.test.js` |
| AI9 | Decision language, a contact route, a payment claimed without evidence | REJECTED (DECISION, CONTACT, PAYMENT_CLAIM); a trusted account may still be called "freigegeben" | AUTO | `grounding.test.js` |
| AI9a | A negated release, approval or payment | "kann nicht freigegeben werden", "cannot be approved", "should not be paid", "do not release the invoice" pass; "kann freigegeben werden", "can be approved", "pay it", and a positive clause after an unrelated negation ("stimmt nicht; die Rechnung kann freigegeben werden") are refused; "bezahlt werden" is not a payment claim, "wurde bezahlt" is | AUTO | `grounding.test.js` |
| AI10 | A grounded answer | ACCEPTED, stored, served again without a second call | AUTO | `explanations.test.js` |
| AI11 | Labelled as AI and not a decision | the API marks `ai_generated: true` with provider and model; the badge reads "KI-generierter Vorschlag – keine Entscheidung" / "AI-generated suggestion – not a decision" | AUTO | `explanations.test.js`; `dictionaries.test.js` |
| AI12 | A newer validation run | the old run's explanation is kept but not shown as current; asking again explains run 2 | AUTO | `explanations.test.js` "an explanation belongs to its validation run" |
| AI13 | What leaves the system | exactly the recorded input: no full IBAN, name, file name, path or e-mail; keys exactly the contract. No supplier number, name or VAT id, even when a check is about which supplier it is (an order of another supplier, an unknown supplier): those are sent as the relationship; the stored evidence still names them | AUTO | `explanations.test.js` "only the minimised evidence", "no supplier's number, name or VAT id"; `explanation-input.test.js` |
| AI13a | A value typed into the document, repeated by a failed check: an amount, a date, the profile, the currency, the IBAN field, a tax rate, a line id, a duplicated invoice number, the KoSIT validator's message quoting it | none of it in the provider request; the stored evidence still shows it; KoSIT rule codes are sent, its message text is not (ADR-082) | AUTO | `explanations.test.js` "a value planted in", "the KoSIT validator's own message"; `explanation-input.test.js` |
| AI13b | A check the allowlist does not name | sends its code, phase and severity only; expected, found and reason are withheld; every check that can fail or warn is named, and no stale entry remains | AUTO | `explanation-input.test.js` "a check nobody has classified", "every check that can fail or warn is classified" |
| AI14 | Language and model in the cache key | German and English are separate explanations; another model never reuses an accepted answer | AUTO | `explanations.test.js`; mutation check 2026-09-30: without the model in the key, 12 tests fail |
| AI15 | Verification switched off | a refused answer would be shown | AUTO | mutation check 2026-09-30: accepting every answer fails 2 tests |
| AI16 | Two requests at once | one accepted row | AUTO | `explanations.test.js` |
| AI17 | The provider call and the database | no connection held while waiting | AUTO | `explanations.test.js` |
| AI18 | No authority | no workflow, routing, approval, master-data or payment module imports the AI modules | AUTO | `explanations.test.js` "no workflow ... imports" |
| AI19 | Who may ask | `review:decide` asks; anyone who reads the invoice reads the answer; an unknown language is 400 | AUTO | `ai-explanation.test.js` |
| AI20 | The adapter | pinned `claude-sonnet-4-6`, temperature 0, forced tool, 800 tokens, no extended thinking; no provider text or key in an error; timeout and unreachable are failures | AUTO | `ai-explainer.test.js` |
| AI21 | The record | insert-only for the app role; a production start checks it | AUTO | `audit-role.test.js` |
| AI22 | The evaluation scenarios | IBAN mismatch, PO overrun, duplicate, KoSIT rejection, two failures: every good answer accepted in German and English, every bad one refused by its rule; the committed inputs equal what the pipeline produces | AUTO | `grounding.test.js`; `explanations.test.js` "the committed evaluation inputs" |
| AI23 | The panel | below the checks; DE and EN; a refused answer reads "Keine KI-Erklärung verfügbar" with a retry; no panel for an invoice that passed; no button for a manager; no overflow at 390 px | MANUAL | Browser, 2026-09-30, with the stand-in provider |
| AI24 | The real model | `npm run ai:eval` over the five scenarios in both languages, three runs each | OPEN | Pending: paid API usage is not enabled for this project; see L16 |

## Bank-account changes (ADR-077)

A new trusted supplier bank account: proposed, verified by call-back on the
number on file, approved by a third person, then the stopped invoices
revalidated. Unit rules in `server/domain/bank-changes/rules.test.js` and
`iban.test.js`; constraints in `schema.test.js`; the steps in
`changes.test.js`; revalidation in `revalidation.test.js`; HTTP in
`server/routes/bank-changes.test.js`; the app role in `audit-role.test.js`;
the screen's offers in `client/src/features/bank-changes/rules.test.js`.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| BC1 | An IBAN with a wrong check digit, or not IBAN-shaped | 400 `IBAN_INVALID`; spaces and case normalised | AUTO | `iban.test.js`, `changes.test.js` |
| BC2 | Policy value for distinct people | 3 by default; any other value stops the start | AUTO | `rules.test.js` |
| BC3 | A proposal | snapshots the trusted IBANs, the policy and a SHA-256 hash; event `proposed`; master data unchanged | AUTO | `changes.test.js` |
| BC4 | Proposing an account already on file | 409 `IBAN_ALREADY_ON_FILE` | AUTO | `changes.test.js` |
| BC5 | The same IBAN proposed again while open | the open change, 200, the first proposer kept | AUTO | `changes.test.js` |
| BC6 | Another IBAN while one is open; two proposals at once | 409 `CHANGE_ALREADY_OPEN` naming it; exactly one open change | AUTO | `changes.test.js`; `schema.test.js` (unique index) |
| BC7 | A source invoice of another supplier or IBAN; a blocked supplier | 400 `SOURCE_INVOICE_MISMATCH`; 409 `SUPPLIER_NOT_ACTIVE_FOR_CHANGE` | AUTO | `changes.test.js` |
| BC8 | The proposer verifies | 409 `PROPOSER_CANNOT_VERIFY`; the database refuses it too | AUTO | `changes.test.js`, `schema.test.js`, `bank-changes.test.js` |
| BC9 | A call-back number in the request | ignored: the number on file is recorded | AUTO | `changes.test.js`, `bank-changes.test.js` |
| BC10 | Confirming without the IBAN read back, or with another | 409 `IBAN_READ_BACK_MISMATCH` | AUTO | `changes.test.js` |
| BC11 | Call-back fields out of range, a time in the future or before the proposal | 400 `VERIFICATION_INVALID` naming the field | AUTO | `changes.test.js`, `bank-changes.test.js` |
| BC12 | No call-back number on file (an upgraded installation) | 409 `NO_CALLBACK_NUMBER`, nothing recorded; a number sent with the call is no fallback | AUTO | `changes.test.js` |
| BC13 | A denied call-back | the change is rejected; nothing trusted | AUTO | `changes.test.js` |
| BC14 | Approval without verification | 409 `CHANGE_NOT_VERIFIED`; the database refuses an approved change without a verifier | AUTO | `changes.test.js`, `schema.test.js`, `bank-changes.test.js` |
| BC15 | The proposer approves or rejects | 409 `PROPOSER_CANNOT_DECIDE`; the database refuses it | AUTO | `changes.test.js`, `schema.test.js` |
| BC16 | The verifier approves under the three-person policy | 409 `VERIFIER_CANNOT_APPROVE`; the database refuses it; the verifier may still reject | AUTO | `changes.test.js`, `schema.test.js`, `rules.test.js` |
| BC17 | A third person approves | the IBAN is added as ACTIVE naming the change; the previous account stays ACTIVE | AUTO | `changes.test.js` |
| BC18 | A verification bound to another hash; a proposal altered after verification | 409 `EVIDENCE_MISMATCH`, nothing written | AUTO | `changes.test.js` |
| BC19 | Master data changed after the proposal; the supplier blocked since | 409 `MASTER_DATA_CHANGED`; 409 `SUPPLIER_NOT_ACTIVE_FOR_CHANGE` | AUTO | `changes.test.js` |
| BC20 | Two approvers at once; the same step repeated | one account, one approval event; a repeat by the same person returns the change unchanged, another person gets 409 `CHANGE_STATE_CONFLICT` | AUTO | `changes.test.js` |
| BC21 | An IBAN trusted for another supplier | allowed by the database; the proposal lists the other supplier; approval refused with `SHARED_IBAN_NOT_ACKNOWLEDGED` until acknowledged, which the approval evidence records; the acknowledgement does not let an unverified change, the verifier or the proposer approve | AUTO | `schema.test.js`, `changes.test.js`, `bank-changes.test.js` |
| BC22 | Rejected or withdrawn changes | never write master data; only the proposer withdraws; a withdrawn change no longer blocks a new one | AUTO | `changes.test.js`, `bank-changes.test.js` |
| BC23 | An invoice with a new IBAN on its own | changes no master data and creates no proposal | AUTO | `bank-changes.test.js` |
| BC24 | Who may do what | read: clerk, finance, CFO, admin; propose: clerk, finance; verify, approve, reject: finance, CFO; admin and manager take no step. The revalidation retry needs `invoice:reprocess`, so admin may ask for it: a technical re-run that decides nothing | AUTO | `bank-changes.test.js`; client `rules.test.js` |
| BC25 | CSRF, a non-UUID id or supplier, bad input | 403 `CSRF_INVALID`; 404 with a code; 400 with a code; never 500 | AUTO | `bank-changes.test.js` |
| BC26 | The app's own database role | runs the whole loop; cannot change a proposal, evidence, events, revalidation links or trusted accounts; may move a change's decision columns | AUTO | `audit-role.test.js` |
| BC27 | A production start as a role that could rewrite bank-change history | refused, naming it | AUTO | `audit-role.test.js` |
| BC28 | Revalidation after approval | the invoice gets a new run, the old run is kept; the link records runs and states; the invoice's trail names the change | AUTO | `revalidation.test.js` |
| BC29 | A former exception below the auto-approve limit (fixture H) | `READY_FOR_APPROVAL` with one step, never `APPROVED` (ADR-020) | AUTO | `revalidation.test.js` |
| BC30 | An unrelated failure | still failing in the new run; the invoice stays in review | AUTO | `revalidation.test.js`; `audit-role.test.js` |
| BC31 | An invoice with an open question | reported as waiting, untouched; "information received" validates nothing; the retry then revalidates it, as the person who asked | AUTO | `revalidation.test.js` |
| BC32 | An invoice rejected in the meantime; another supplier's or IBAN's invoice | skipped, no run | AUTO | `revalidation.test.js` |
| BC33 | A crash between the new run and its link | neither committed; the retry runs the invoice once; two retries at once run it once; a retry after completion adds nothing | AUTO | `revalidation.test.js`; mutation check 2026-09-30: committing the run apart from its link failed this test |
| BC39 | An affected invoice re-validated by hand before the change's retry, still in review for another reason | no longer pending; the retry does nothing and marks the change complete | AUTO | `revalidation.test.js` |
| BC34 | Revalidation of a change not approved | 409 `CHANGE_STATE_CONFLICT` | AUTO | `revalidation.test.js`, `bank-changes.test.js` |
| BC35 | What the screens offer | verify only to another person, approve only to a third, withdraw only to the proposer, nothing to admin, retry only while invoices are left; the invoice offers a proposal or links to the change | AUTO | client `rules.test.js` |
| BC36 | Every change state, event and refusal in both languages | labels present in German and English | AUTO | `dictionaries.test.js` |
| BC37 | The loop in the browser | H: proposed from the invoice, call-back form shows the number on file, verified, approved by a third person, H awaits a manager; B: waiting, then revalidated by the retry; a shared IBAN needs the tick; admin and manager see no step | MANUAL | Browser (Playwright script), 2026-09-30, built client served by the API |
| BC38 | The demo with the new step | every figure DEMO.md quotes, and step 5 end to end | MANUAL | Demo verification script against a fresh `db:demo`, 2026-09-30 |

## API

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| A1 | Upload returns 201 with full detail incl. actor name | 201 | AUTO | `app.test.js` |
| A2 | List and filter by state | correct rows | AUTO | `app.test.js` |
| A3 | Unknown state filter | 400 | AUTO | `app.test.js` |
| A4 | Non-XML upload | 400 | AUTO | `app.test.js` |
| A5 | Original file download | byte-identical | AUTO | `app.test.js` |
| A6 | Unknown invoice | 404 | AUTO | `app.test.js` |
| A6a | An id that is not a UUID | 404 `INVOICE_NOT_FOUND` on reads and actions, not 500 | AUTO | `app.test.js` |
| A6b | A malformed cookie | 401 like no session, not 500 | AUTO | `app.test.js` |
| A6c | A refused upload | 400 with code `UPLOAD_REJECTED`, set where it is thrown | AUTO | `app.test.js` |
| A6d | A dropped idle database connection | logged; the process keeps running | AUTO | `db.test.js` |

## UI

The action panel and the progress spine decide what a person is offered. That
logic lives in `client/src/features/invoice/actions.js` as plain functions, so
it is checked by `npm test` rather than by opening a browser.

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| U10 | Which actions each state offers | the keys for that state, in order | AUTO | `actions.test.js` |
| U11 | A booked credit note | offers the credit, never the payment | AUTO | `actions.test.js` |
| U12 | A partly credited invoice | offers payment, prompt states the netting | AUTO | `actions.test.js` |
| U13 | An invoice its credits cover | offers settlement, not payment | AUTO | `actions.test.js` |
| U14 | An approval with no pending step | offers nothing | AUTO | `actions.test.js` |
| U15 | Every action names a permission | no button that always fails | AUTO | `actions.test.js` |
| U16 | The progress path per document | credit notes and settled invoices never show payment stages | AUTO | `actions.test.js` |
| U17 | Role filtering in the browser | a cost-centre manager sees only the approval actions | MANUAL | Two-role probe, 2026-09-18 |
| U18 | Confirming a duplicate is offered only when the invoice number was seen before | offered when `duplicate_invoice_number` failed, not on an IBAN stop | AUTO | `actions.test.js` |
| U20 | On an IBAN stop the bank-account proposal is the only filled button | decision panel fills none when the viewer may propose; otherwise 'Rückfrage stellen' stays primary | AUTO | `actions.test.js`; Browser, 2026-10-11, DEMO-2026-01014 as Jonas Weber |

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| U1 | Inbox shows the blocking reason per row | reason visible without opening the invoice | MANUAL | Browser, 2026-09-17 |
| U2 | Detail shows expected vs found with IBAN divergence marked | differing characters highlighted, both sides grouped in fours | MANUAL | Browser, 2026-09-17 |
| U3 | State spine shows position and blocker | blocked node rendered at the stage reached | MANUAL | Browser, 2026-09-17 |
| U4 | No horizontal page scroll at 375 px | scrollWidth equals clientWidth | MANUAL | Browser, 2026-09-17, measured in page |
| U5 | Keyboard focus visible, reduced motion respected | focus ring on keyboard focus but not on a click; animation collapsed under a reduced-motion preference | AUTO | `browser/accessibility.browser.test.js`, against the real stylesheet in chromium |
| U6 | Four-eyes refusal is visible to the user | server message shown, invoice unchanged | MANUAL | Browser, 2026-09-17: same manager accepted then tried to approve, refusal rendered, step stayed open |
| U7 | Full review-to-approval round trip in the UI | two different people, audit shows both | MANUAL | Browser, 2026-09-17: Tim Kessler released, Lea Sommer approved |
| U8 | Decision panel comes first on a phone | actions above the spine, no page overflow | MANUAL | Browser, 2026-09-17 at 375 px |
| U9 | Money path driven through the UI | approved invoice booked, paid, reconciled | MANUAL | Browser, 2026-09-17 |
| U10 | Reconciliation reasons visible per transaction | each unmatched line states why | MANUAL | Browser, 2026-09-17: amount-only and amount-mismatch cases shown |
| U11 | Spine marks the stage an exception branched from as reached | "Bezahlt" filled while the exception is current | MANUAL | Browser, 2026-09-17, fixed after being spotted |
| U12 | Decided approval step shows what it was signed for | document prefix, validation run and amount under the step; prefix matches the intake SHA-256 | MANUAL | Browser, 2026-09-17: `Beleg 8b48b6eb3f2b · Prüflauf 1 · 4.352,73 €` against file hash `8b48b6eb3f2bf49a…` |
| U13 | Binding line does not overflow at 375 px | scrollWidth equals clientWidth | MANUAL | Browser, 2026-09-17, measured in page |
| U14 | A request refused for want of a session signs the client out | `NOT_SIGNED_IN` reports it; a wrong password (`SIGN_IN_REFUSED`) and a 403 do not | AUTO | `client/src/lib/api.test.js` (ADR-057) |
| U15 | An expired session returns to sign-in, not to empty data | before: payments page showed "0 Umsätze importiert" over 38 lines; after: sign-in with the expiry note, none on a first visit, and signing in again lands on the same page | MANUAL | Browser, 2026-09-23: session expired in the database, then navigated |
| U19 | On an IBAN stop the bank-account panel follows the evidence | order: blocking reason, check trail, bank account, decision; check code muted; no fixture path in the upload area | MANUAL | Browser, 2026-10-09: DEMO-2026-01014 as Jonas Weber, screenshot |

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
| F06 | Concurrent login failures bypass the lockout | `auth.test.js`: eight parallel guesses, then a correct password still succeeded | Increment and lock decided in one statement; since ADR-059 each attempt is recorded before its password is checked, twelve at once check at most five | AUTO `auth.test.js` |
| F07 | Invoice references become spreadsheet formulas in CSV | `csv-export.test.js`: `=1+1` reached the cell unescaped | Formula triggers prefixed, numbers exempt; ADR-038 | AUTO `csv-export.test.js` |
| F08 | Rejection is offered but refused while information is requested | `approvals.test.js`: 409 from `INFO_REQUESTED` | The declared transition is handled, with the same rules | AUTO `approvals.test.js` |
| F09 | Review-cycle medians can be negative | `kpi.test.js`: `READY_FOR_APPROVAL -> INFO_REQUESTED -> REVIEW_REQUIRED` gave -1 hours | Each review entry paired with its own exit; open visits excluded | AUTO `kpi.test.js` |
| F10 | Paid invoices with an open reconciliation count as overdue | `kpi.test.js`: a paid invoice 30 days past due counted as overdue | Overdue means unpaid; `RECONCILIATION_EXCEPTION` excluded | AUTO `kpi.test.js` |

Found while verifying the above, not in the report:

| # | Finding | Reproduced | Fix | Status |
|---|---|---|---|---|
| F11 | Every demo invoice's "view original" link answered 500 | Browser, 2026-09-17: the generator wrote originals to a temp directory the API cannot read | `scripts/demo-data.js` uses the same storage as the API | MANUAL Browser, 2026-09-17, source shown after the fix |

## Final approval gate

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| G1 | A supplier blocked while the invoice waited | the approval is refused | AUTO | `final-gate.test.js` |
| G2 | The invoice returns to review with the new failure recorded | REVIEW_REQUIRED, reason SUPPLIER_ACTIVE, check on the record | AUTO | `final-gate.test.js` |
| G3 | Pending steps are cancelled, not left open | every step CANCELLED | AUTO | `final-gate.test.js` |
| G4 | An exception a reviewer already accepted still approves | 200, APPROVED | AUTO | `final-gate.test.js` |
| G5 | A clean invoice is unaffected | 200, APPROVED | AUTO | `final-gate.test.js` |
| G6 | A bank account retired while the invoice waited | REVIEW_REQUIRED, reason SUPPLIER_IBAN_MATCH | AUTO | `final-gate.test.js` |
| G7 | Rejection is not blocked by a new business failure | 200, REJECTED | AUTO | `final-gate.test.js` |
| G8 | Both halves of the gate are load-bearing | removing it fails 4 tests; treating every failure as new fails G4 | MANUAL | Mutation check, 2026-09-17 |
| G9 | The refusal is visible to the approver | invoice shown in review with the blocking reason | MANUAL | Browser, 2026-09-17: step CANCELLED, "Lieferant gesperrt", `supplier_active FAILED · HIGH` |

## Closing the documented limitations

| # | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| K1 | A document rooted in another namespace is not an XRechnung | format_recognised FAILED | AUTO | `technical-validation.test.js` |
| K2 | The default namespace counts as much as a prefixed one | PASSED | AUTO | `technical-validation.test.js` |
| K3 | An unqualified `Invoice` root is refused | FAILED | AUTO | `technical-validation.test.js` |
| K4 | A discount the totals do not declare is caught by the chain | totals_consistent FAILED | AUTO | `business-checks.test.js`; this case passed every check before ADR-043, and was refused wholesale under it |
| K5 | A discounted invoice reaches approval | no FAILED check, amount due after the discount | AUTO | `business-checks.test.js`; impossible under ADR-043 |
| K6 | A document whose totals do not add up cannot be approved | `totals_consistent` in payableBlockers | AUTO | `eligibility` non-overridable checks |
| K7 | A failed first run leaves the receipt on the record | one invoice, RECEIVED | AUTO | `recovery.test.js` |
| K8 | Sending the same file again resumes it | same invoice id, processed, no second row | AUTO | `recovery.test.js` |
| K9 | A resumed invoice keeps its intake facts | received_at, filename, channel unchanged | AUTO | `recovery.test.js` |
| K10 | The resumption is on the audit trail | `intake_resumed` recorded | AUTO | `recovery.test.js` |
| K11 | A file sent again after processing is still a duplicate | DUPLICATE | AUTO | `recovery.test.js` |
| K6a | A miscalculated line is caught although every total agrees | `line_amounts_consistent` FAILED, `totals_consistent` PASSED | AUTO | `business-checks.test.js`; the header chain cannot see this |
| K12a | Allowance and line evidence read in English | no German left | AUTO | `dictionaries.test.js` |
| K12 | The machine export returns identifiers unaltered | `=1+1` survives | AUTO | `csv-export.test.js`, `moneypath.test.js` |
| K13 | The spreadsheet export makes such a cell inert | prefixed, value intact | AUTO | `csv-export.test.js` |
| K14 | The two exports are told apart by filename | different Content-Disposition | AUTO | `moneypath.test.js` |
| K15 | An unknown export profile is refused | 400 UNKNOWN_EXPORT_PROFILE | AUTO | `moneypath.test.js` |
| K16 | The stored original does not execute in a browser | no script, no API call, no title | AUTO | `browser/file-serving.browser.test.js` |
| K17 | A real invoice is still readable as source in a browser | content shown | AUTO | `browser/file-serving.browser.test.js` |
| K18 | The browser tests skip rather than fail without a browser | 6 skipped, 0 failed, install hint shown | MANUAL | 2026-09-17, `PLAYWRIGHT_BROWSERS_PATH` pointed at an empty directory |
| K19 | Both browser suites are load-bearing | reverting the content type fails K16 | MANUAL | Mutation check, 2026-09-17 |

## Residual items from the same review

The report asked for more than the ten findings. These were addressed after the
findings themselves.

| # | Item | Expected | Status | Evidence |
|---|---|---|---|---|
| R1 | Reconcile against the payment instruction, not the invoice | the bank line is compared with what was sent to the bank | AUTO | `matching.test.js`, `reconciliation.test.js`; inner join on `payment_instructions` |
| R2 | Login timing must not reveal whether an account exists | comparable time for known and unknown addresses | AUTO | `auth.test.js`; measured 1.1 ms vs 40.4 ms before, 36.3 vs 37.7 after |
| R3 | Defined behaviour for an expired lock | failures older than the window no longer count (ADR-059) | AUTO | `auth.test.js` "failures older than the window no longer count" |
| R4 | The test-database guard must not be defeated by an equivalent URL | identity, not string equality | MANUAL | 2026-09-17: `postgresql://127.0.0.1:5432/finops` against `postgresql://localhost/finops` refused before `reset()`; dev database intact |
| R5 | KPI definition changes recorded as decisions | an ADR per changed definition | DOC | ADR-039 |
| R6 | The README's no-enumeration claim matched to the evidence | wording and timing both covered | DOC | README, ADR-040 |
| R7 | The demo can demonstrate its own reconciliation | matched, exception and open lines against the generated invoices | MANUAL | Browser, 2026-09-17: 33 matched, 4 unclear with distinct reasons, 4 open; dashboard shows 3 reconciliation exceptions |
| R8 | The demo run is reproducible, as the module claims | two full rebuilds produce an identical statement | MANUAL | 2026-09-17: same SHA-256 across two rebuilds after `backdate` stopped using `Math.random` |

| # | Limitation | Why it stays open | Status |
|---|---|---|---|
| ~~L9~~ | ~~No automated real-browser regression for the served original~~ | **Fixed 2026-09-17**: Playwright drives the original attack and proves the script neither runs nor reaches the API. See ADR-046. | CLOSED |
| ~~L10~~ | ~~The CSV export altered the value a machine importer reads~~ | **Fixed 2026-09-17**: the export takes a consumer profile; `machine` is faithful and the default, `spreadsheet` is inert. See ADR-045. | CLOSED |

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
| I17 | Server refusals read in the chosen language | code plus parameters, rendered client-side | AUTO | `dictionaries.test.js` |
| I18 | Every refusal the server can send has text in both languages | no missing code | AUTO | `dictionaries.test.js`, scans the routes and domain modules |
| I19 | No refusal text exists for a code that cannot happen | no stale code | AUTO | `dictionaries.test.js` |
| I20 | Every refusal is thrown with a code | no bare refusal | AUTO | `dictionaries.test.js` |
| I21 | A refusal names states and roles as the screen does | "in state Approved", not "APPROVED" | AUTO | `dictionaries.test.js` |
| I22 | An unknown code falls back to the server's sentence | German rather than nothing | AUTO | `dictionaries.test.js` |
| I25 | Every intake channel is named in words | UPLOAD, EMAIL and the n8n FORM, in both languages and in the audit sentence | AUTO | `dictionaries.test.js` |
| I23 | The English guard catches German without umlauts | a German word in an English entry fails | MANUAL | Mutation check, 2026-09-17: "Freigabeschritt" passed the old guard, fails the new one |
| I24 | A refusal is visible in English end to end | sign-in and a business-gate 409 both read in English | MANUAL | Browser, 2026-09-17: "Email address or password is wrong"; "Not approved: a business check has failed since the invoice was submitted" |

## Operations

| ID | Case | Expected | Status | Evidence |
|---|---|---|---|---|
| O1 | Every applied migration carries its file's checksum | sha256 per row in `schema_migrations` | AUTO | `server/migrations.test.js` (ADR-061) |
| O2 | An applied migration edited afterwards | the run stops and names the file | AUTO | `server/migrations.test.js` |
| O3 | A database migrated before checksums existed | each row gets its checksum once, nothing re-applied | AUTO | `server/migrations.test.js` |
| O4 | Two migration runs at once | each file applied exactly once; before the lock, the second crashed on `pgcrypto` | AUTO | `server/migrations.test.js` |
| O5 | An intake that fails after writing its file | no row and no file; before the fix the file stayed, referenced by nothing | AUTO | `orphan-file.test.js` (ADR-062) |
| O6 | A successful intake keeps its file | `<id>/original.xml` present | AUTO | `orphan-file.test.js` |
| O7 | Each payment has its own end-to-end id | `NW-P-` and eight digits, unique per attempt; reference is `<id> RE <invoice number>` | AUTO | `payment-reference.test.js` (ADR-063) |
| O8 | A supplier's invoice number cannot break the reference | 200-character number with `#` and `|`: reference 140 characters at most, SEPA characters only | AUTO | `payment-reference.test.js` |
| O9 | A bank line naming only the supplier's number | not reconciled; a line naming the payment's id is | AUTO | `payment-reference.test.js`; `matching.test.js` |
| O10 | An instruction from before end-to-end ids | still recognised by its reference | AUTO | `matching.test.js` |
| O11 | The demo generator after the change | same totals: 36 paid, 30 matched, 4 exceptions, 4 unmatched | MANUAL | Run against the test database, 2026-09-23 |
| O12 | Reads that carry bank details or the books | export and bank transactions: finance and admin only; supplier and PO master data: clerk, finance, admin; every other role 403 | AUTO | `read-permissions.test.js` (ADR-064) |
| O13 | A role without `bank:read` on the payments page | says the area is reserved for finance, never shows an empty statement; finance sees the statement | MANUAL | Browser, 2026-09-23: manager and finance |
| O14 | A request within a minute of the last one | `last_seen_at` not written | AUTO | `session-upkeep.test.js` (ADR-065) |
| O15 | A request after a minute | `last_seen_at` refreshed | AUTO | `session-upkeep.test.js` |
| O16 | Sessions that ended more than a day ago | deleted at the next sign-in; one that ended an hour ago stays | AUTO | `session-upkeep.test.js` |
| O17 | The invoice list in pages | `limit` and `offset`, newest first, no invoice twice or missing, full count in `X-Total-Count`, the count follows the state filter | AUTO | `paging.test.js` (ADR-066) |
| O18 | A page size outside 1-200 or a negative offset | 400 `INVALID_PAGE` | AUTO | `paging.test.js` |
| O19 | Navigation counts | one grouped query, not the downloaded list | AUTO | `paging.test.js`; client `api.test.js` |
| O20 | Paging in the inbox | 70 demo invoices: 50 shown with "Weitere laden (50 von 70 angezeigt)", all 70 after one click; nav counts 70 and 6 in review | MANUAL | Browser, 2026-09-23 |
| O21 | An invoice released into approval a second time | the first round's steps stay, cancelled, with who signed; the new round is round 2 | AUTO | `rounds.test.js` (ADR-067) |
| O22 | The detail after a second release | `approval_steps` is the live round; `approval_history` holds the earlier one with its signer | AUTO | `rounds.test.js` |
| O23 | Deciding the new round | works as before and leaves the old round untouched | AUTO | `rounds.test.js`; demo generator totals unchanged |
| O24 | The app runs as its own database role | upload, booking, payment and confirmation all succeed as the granted role | AUTO | `audit-role.test.js` (ADR-068) |
| O25 | That role and the audit trail | update, delete and truncate refused; deleting an invoice refused, so no cascade | AUTO | `audit-role.test.js` |
| O26 | A production start as a role that could change the trail | refused, naming what it could do; the granted role passes | AUTO | `audit-role.test.js` |
| O27 | `db:grant` and `npm start` end to end | grant sets the rights and refuses an unsafe role name; start as the owner refused naming update, delete, truncate and invoice delete; start as the granted role listens | MANUAL | Probe, 2026-09-23, against the test database |
| O28 | The detail says whether review may release the invoice | `payable_blockers`: a changed IBAN is named, the same answer the release gives; a PO overrun blocks nothing | AUTO | `releasable.test.js` (ADR-071) |
| O29 | A review with a blocker | "Zur Freigabe geben" not offered, the prompt says why; the other decisions stay | AUTO | client `actions.test.js` |
| O30 | Earlier approval rounds on the invoice screen | round, step, role, signer and time, marked cancelled, under the live steps | MANUAL | Browser, 2026-09-23: E after a question and a second release |
| O31 | The three follow-ups together in the browser | B offers no release and says why; E lists its first round; dashboard shows one failed payment | MANUAL | Browser, 2026-09-23 |
| O32 | The business date around midnight in Germany | 01:30 CEST books the new day; 00:30 CET on 1 January books the new year; 23:59 CEST stays on the same day | AUTO | `server/domain/dates.test.js` (ADR-072) |
| O33 | A statement line with a malformed amount, date or currency | 400 `TRANSACTION_INVALID` naming line and field; nothing imported. Before: 500 | AUTO | `server/input-validation.test.js` (ADR-073) |
| O34 | A comment that is not text or longer than 1000 characters | 400 `COMMENT_INVALID`; exactly 1000 is accepted. Before: a number gave 500, 900 KB was stored | AUTO | `server/input-validation.test.js` |
| O35 | A body that is not JSON | 400 `INVALID_JSON` | AUTO | `server/input-validation.test.js` |
| O36 | A numeric setting that is not a number in range | the start stops, naming the setting. Before: `SESSION_HOURS=zwoelf` started and every sign-in failed | AUTO | `server/config/env.test.js` |
| O37 | Security headers on the page and the API | CSP without unsafe-inline or unsafe-eval, frame-ancestors none, X-Frame-Options DENY, no-referrer, nosniff; HSTS in production only | AUTO | `server/security-headers.test.js` (ADR-074) |
| O38 | The built app under that CSP | sign-in, invoice, dashboard, payments and the original XML work; both fonts load; no CSP violation in the console | MANUAL | Browser, 2026-09-23, `dist/` served by the API |
| O39 | A statement that runs too long | cancelled at the statement limit | AUTO | `server/timeouts.test.js` (ADR-075) |
| O40 | A database that cannot be reached | fails within the connect limit; before: a connect to an unroutable address hung 75 s | AUTO | `server/timeouts.test.js` |
| O41 | SIGTERM | "shutting down", "stopped", exit code 0 | AUTO | `server/timeouts.test.js` |
| O42 | `docker compose up` on a machine with only Docker | the stack builds and starts, readiness answers, `/` serves the page, a demo account sees 70 invoices | CI | `ci.yml` job `docker`, first green run 2026-09-24 (ADR-076) |
| O43 | A dependency with a known high or critical vulnerability | the build fails | CI | `ci.yml` job `test`, step `npm audit --audit-level=high` |
