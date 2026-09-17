# Independent project review

Reviewed commit `ff600ceb4d344693423326c7fa463168c166a715` on 2026-09-17.
The working tree was clean at the start. This review changes only this report.
The earlier Phase 0 review remains historical evidence, not the current verdict.

**Verdict: changes required.** The earlier eligibility, identity, date,
duplicate-state and policy remediations are present, and the new sessions,
approval bindings and commitment ledger improve the design. The current build
still has exploitable active-file rendering and incorrect reconciliation paths.

Validation: **182 tests passed, zero failed or skipped; `npm run build` passed.**
The suite ran against a newly created local database. Additional probes used
the real HTTP API, PostgreSQL, synthetic invoices and a browser; migration
behavior was checked in a second disposable database. Existing application and
test databases were not reset. No real payments or external data transfers ran.

## Findings

### F01 — P1: Opening an uploaded XML file executes code with the viewer's session

Location: [invoices.js:64](../server/routes/invoices.js).

The file endpoint serves the original bytes as `application/xml` with
`Content-Disposition: inline`, on the authenticated API origin, without a
restrictive content security policy. Rejected documents remain downloadable.

Reproduction: a clerk uploaded well-formed XHTML named
`review-active-content.xml`. Intake correctly routed it to review as an
unsupported format. Opening its original-file URL in a browser authenticated
as Finance nevertheless executed its embedded script. The harmless probe
changed a marker to `executed` and fetched `/api/auth/me`, reading role
`FINANCE`.

This is stored XSS, not merely permissive invoice parsing. An uploader can
target a more privileged reviewer who uses the existing original-file link.
HttpOnly protects direct cookie reads but does not prevent script from sending
authenticated requests; the CSRF cookie is readable on that same origin.

Required fix: serve originals as downloads or an escaped plain-text view; if
active rendering is needed, isolate it from the application's origin and
credentials. Preserve the original bytes in storage. Add a real-browser
regression that opens rejected active content and proves it cannot execute or
access the API. This threat is also described in
[OWASP's file-upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

### F02 — P1: Reconciliation ignores currency and counterparty

Locations: [matching.js:14](../server/domain/reconciliation/matching.js),
[reconciliation.js:44](../server/domain/reconciliation/reconciliation.js).

The matcher uses only a substring of the invoice number and the absolute
numeric amount. It never checks the transaction currency or counterparty
account. The candidate query does not even select invoice currency, despite
selecting its IBAN.

Independent HTTP probes each moved an actual 119.00 EUR invoice from `PAID`
to `RECONCILED` using a transaction with its reference and numeric amount but:

- Currency USD instead of EUR.
- A different supplier's IBAN.
- A positive amount rather than the outgoing negative amount.

The last case also exposes an undefined debit/credit convention: existing
tests deliberately accept either sign, so the import contract must settle
direction explicitly. Currency and counterparty checks are missing regardless
of that convention.

Required fix: reconcile against the payment instruction's reference, amount,
currency and creditor account, with a defined direction convention. Missing or
conflicting evidence must remain an exception. Tests should change each field
independently rather than only checking equal amounts and references.

### F03 — P1: Reference matching can select the wrong invoice

Location: [matching.js:18](../server/domain/reconciliation/matching.js).

The longest-number fallback does not distinguish a true prefix collision from
a reference genuinely naming several invoices. With open invoices `INV-A` and
`INV-LONG`, reference `INV-A und INV-LONG` and matching amounts, the function
returns `MATCHED` for `INV-LONG`, contradicting the documented ambiguous-reference
rule. Separately, when only `INV-1` is open, reference `INV-10` matches `INV-1`.
Both cases were reproduced directly against the current matcher.

Required fix: define reference token boundaries or use the generated payment
reference. Multiple distinct named obligations must remain ambiguous; an absent
longer invoice must not turn its prefix into a match. Extend the existing prefix
and ambiguity tests with these two cases.

### F04 — P1: The commitment migration forgets existing invoice claims

Location: [0006_po_commitments.sql:13](../db/migrations/0006_po_commitments.sql).

Migration 0006 creates an empty ledger without backfilling invoices already in
states that hold capacity. New intake sees those old claims as free capacity.

Upgrade reproduction: apply migrations 0001-0005 and seed master data; insert
a representative pre-upgrade `APPROVED` invoice for net 319.33 against the
500.00 opening balance of PO-2026-0102; apply 0006 and 0007. Availability still
reports 500.00. Upload G through the real pipeline: it also becomes `APPROVED`.
There are now two approved invoices totalling 638.66, but only one 319.33
commitment. The intended cumulative ceiling is 510.00.

Required fix: add an append-only repair migration that establishes missing live
commitments without duplicating existing ones. Report pre-existing overruns
rather than silently ignoring them. Add an upgrade test with old invoices;
reset-and-seed tests cannot detect this migration defect.

### F05 — P1: Manual reconciliation does not consume or resolve the bank evidence

Locations: [reconciliation.js:98](../server/domain/reconciliation/reconciliation.js)
and its subsequent unmatched-update branch.

`resolveReconciliation()` changes only the invoice state. The associated bank
transaction stays `EXCEPTION` and remains eligible for the next matching run.

HTTP reproduction: a 100.00 payment against a 119.00 invoice produces an
exception. Finance resolves the invoice manually. Its bank transaction remains
`EXCEPTION`; the next run changes it to `UNMATCHED`, clears the reason, and
retains the old invoice link. A new paid 100.00 invoice from another supplier
with the same invoice number then causes that same bank transaction to become
`MATCHED` to the new invoice. F02 facilitates the cross-supplier example, but
the unresolved/reusable evidence exists independently of F02.

Required fix: manual resolution must explicitly identify the evidence being
consumed or document a distinct write-off/adjustment outcome. Persist that
resolution on the bank side in the same transaction and exclude resolved
evidence from future automatic matching. Test reruns after manual resolution,
including whether prior associations and reasons survive.

### F06 — P2: Concurrent login failures bypass the configured lockout threshold

Location: [auth.js:69](../server/routes/auth.js).

`registerFailure()` computes the new count from the previously selected user
row and writes that absolute value. Concurrent requests overwrite one another's
increments. The lock decision uses the same stale value.

Reproduction against a fresh seeded account: issue two batches of four parallel
wrong-password requests. All eight return 401; a subsequent correct-password
login returns 200 despite the default five-failure lockout. The existing test
only sends failures sequentially.

Required fix: increment and decide lockout atomically under database concurrency,
with defined behavior for expiry and successful logins. Add parallel-request
tests. Identical failure wording also does not eliminate the timing difference
between unknown users and users whose passwords are actually hashed; the
README's no-enumeration claim is broader than the current evidence.

### F07 — P2: Invoice references become executable spreadsheet formulas in CSV

Location: [accounting.js:104](../server/domain/accounting/accounting.js).

An invoice numbered `=1+1` passes intake and accounting handoff. The exported
CSV row ends in the unescaped cell `;=1+1`. The formatter escapes delimiters and
quotes but does not address formula interpretation. The dangerous cell was
reproduced through the API; this review did not launch a spreadsheet application.

Required fix: define the export's intended consumer and provide a safe text
representation for spreadsheet use without silently corrupting machine-import
identifiers. Test formula prefixes and embedded separators. CSV quoting alone
does not make formulas inert; see
[OWASP's CSV injection guidance](https://community.owasp.org/attacks/CSV_Injection).

### F08 — P2: The offered rejection action cannot work while information is requested

Locations: [ActionPanel.jsx:67](../client/src/features/invoice/ActionPanel.jsx)
and [approvals.js:56](../server/domain/approvals/approvals.js).

The UI offers Reject from `INFO_REQUESTED`, and the transition table permits
`INFO_REQUESTED -> REJECTED`. The domain handler handles only `info-received`
before requiring `REVIEW_REQUIRED` for every other review action.

Reproduction: request information as the clerk, then submit review rejection
with a reason. The server returns 409 and the invoice stays `INFO_REQUESTED`.

Required fix: support the declared rejection transition with the existing role,
reason, cancellation and audit rules. Add an authenticated HTTP test from this
specific state.

### F09 — P2: Review-cycle medians can be negative

Location: [kpi.js:159](../server/domain/kpi/kpi.js).

The cycle query subtracts the first-ever review entry from the first-ever
approval-queue entry, even if they belong to different workflow visits.
For the valid path `READY_FOR_APPROVAL -> INFO_REQUESTED -> REVIEW_REQUIRED`,
the approval entry precedes the review entry.

The HTTP probe followed this path; setting representative synthetic event times
two hours and one hour in the past yielded `median_review_hours = -1`, even
though that review visit had not ended. The problem is event pairing, not
rounding or the choice of median.

Required fix: pair each review entry with its subsequent exit and define how
repeat visits contribute. Exclude unfinished visits from completed duration
statistics. Add a repeated-cycle case instead of only straight-line histories.

### F10 — P2: Already-paid reconciliation exceptions are counted as overdue

Location: [kpi.js:117](../server/domain/kpi/kpi.js).

The due-soon and overdue filters exclude `PAID` and `RECONCILED` but omit
`RECONCILIATION_EXCEPTION`, which can only be reached after `PAID`. A paid
invoice with an old due date and a partial-match exception increased the overdue
count to one in the probe.

Required fix: separate outstanding-payment work from reconciliation work, using
the complete post-payment state set. Add a KPI regression for a paid invoice
whose reconciliation remains unresolved.

## Review scope and remaining limits

Previously documented manual intake recovery, unsupported XML features and
the absence of fresh business checks at final approval remain accepted PoC
limitations; this report does not relabel them as newly discovered defects.
The historical test-database guard now compares URL strings, but equivalent
URLs can still name the same database. The isolated review databases avoided
that risk; no destructive alias test was performed.

The UI was read and built; browser execution focused on the original-file
security boundary. This was not a full visual/accessibility audit or dependency
vulnerability scan. No claim is made about official invoice validation or legal
compliance. The browser probe read only a synthetic user's role and performed
no privileged state change.

The highest-priority sequence is F01, then reconciliation correctness and
evidence lifecycle (F02, F03, F05), then the upgrade defect F04. Keep application
changes incremental and add each regression to the existing test matrix. Any
change to a recorded ADR should receive a new superseding ADR. No application
fixes or ADR changes were made by this review.

Temporary reproduction artifacts: `/tmp/finops-current-review.mjs`,
`/tmp/finops-upgrade-review.mjs`, `/tmp/finops-current-baseline.log`,
`/tmp/finops-current-evidence.json`, and
`/tmp/finops-current-reuse-evidence.json`. These probes are not part of
`npm test` and should not be marked AUTO until converted into regression tests.
