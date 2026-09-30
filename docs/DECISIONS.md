# Decisions

Short architecture decision records. Numbered, never rewritten; superseded
entries are marked, not deleted.

## ADR-001 Stack: Express 5 + pg + React/Vite, no Next.js, no Python worker

Context: both reference projects were audited (`docs/REFERENCE_AUDIT.md`). The
author knows React, Express, Postgres/Supabase, n8n. Local Postgres 14 is
available; Docker is not running.
Decision: Node.js ESM, Express 5, `pg` against a dedicated schema `finops`,
React 19 with Vite, `node --test`.
Consequences: no build step for the API; SQL is Supabase-compatible; one language.

## ADR-002 One transition function, one transition table

Context: both references had state changes spread over many functions and lost
audit events as a result.
Decision: `invoices.state` changes only through `transition()`; allowed
transitions are declared in `states.js`; the audit event is written in the same
transaction; an undeclared transition throws.
Consequences: every state change is auditable by construction; tests assert the
table, not individual endpoints.

## ADR-003 XRechnung UBL first, CII/ZUGFeRD behind the same parser interface

Context: XRechnung allows UBL 2.1 and UN/CEFACT CII syntaxes; ZUGFeRD embeds CII
in a PDF/A-3.
Decision: the MVP parses UBL Invoice only. `parseInvoiceXml()` returns a
format-neutral structure; a CII parser and a PDF/A-3 attachment extractor are
later adapters selected by the format detector. A plain PDF is never treated as
an e-invoice.
Consequences: fixtures are UBL; CII files are reported as `format_recognised`
FAILED with reason "unsupported syntax" and land in the review queue.

## ADR-004 No n8n in Phases 1-3

Context: the brief allows n8n only where orchestration adds value; Feldmark
showed rules drifting inside n8n nodes.
Decision: the pipeline runs inside the API request. n8n is reconsidered in
Phase 4/5 for scheduled jobs (due-date reminders, bank-statement polling) and
then only as a caller of the API, with idempotency keys.
Consequences: one source of truth for rules; the demo runs with two processes
(API and Vite).

## ADR-005 Identity boundary: seeded users, `X-Actor-Id` header, roles enforced server-side

**Superseded by ADR-029 (2026-09-17).** The header was never authentication;
anyone who could reach the API could claim any identity. Kept here as the
record of what was decided and why it was replaced.

Context: no authentication in the MVP. Feldmark's name-based four-eyes was easy
to fake.
Decision: `users` table with roles AP_CLERK, MANAGER, FINANCE, CFO, ADMIN.
Human actions require `X-Actor-Id`; the server resolves the user, checks the
role of the approval step and enforces segregation of duties by user id.
Consequences: this is authorization on a trusted identity, not authentication.
Documented in README under "Known limits". Replacing the header with a session
or JWT touches one middleware.

## ADR-006 No AI in the XRechnung path

Context: XRechnung is structured; every field the rules need is in the XML.
Decision: no LLM call in Phases 1-3. Candidate uses later: legacy PDF invoices,
explaining exceptions, cost-centre suggestions. Any AI output is stored in its
own table with confidence and evidence, never in the trusted columns.
Consequences: deterministic, testable, cheap; the demo shows that automation
value comes from workflow, not extraction.

## ADR-007 Policy thresholds are configuration, not code

Decision: `server/config/policy.js` reads env overrides
(`POLICY_AUTO_APPROVE_LIMIT`, `POLICY_TIER_1_LIMIT`, `POLICY_TIER_2_LIMIT`,
`POLICY_PO_TOLERANCE_PCT`, ...). The routing decision stores a snapshot of the
policy used.
Consequences: the audit trail shows which thresholds applied at decision time.

## ADR-008 Cautious wording for legal and compliance statements

Decision: the project never states that it "validates EN 16931 compliance",
"is XRechnung-compliant", "is GoBD-compliant", "is GDPR-compliant" or "meets
the German e-invoicing mandate". Allowed wording: "checks that the file
declares the XRechnung profile and has the structure the rules need",
"designed with GoBD/GDPR expectations in mind", "official validation is an
adapter boundary, not implemented". Approval thresholds are "demo assumptions".
Savings are "estimates from stated assumptions".

## ADR-009 Duplicate handling in two layers

Decision: identical file (same SHA-256) → `DUPLICATE` automatically, linked via
`duplicate_of`, no processing. Same supplier + invoice number in a different
file → `REVIEW_REQUIRED` with `duplicate_invoice_number` HIGH; a human confirms
or overrides. The database forbids two payable records for the same supplier +
invoice number regardless of what the application does.
Consequences: neither path can create a second payable action.

## ADR-010 Human review never ends in APPROVED

Decision: `REVIEW_REQUIRED` → `READY_FOR_APPROVAL` is the only positive exit
from review; the policy computes the steps and, if the amount is below the
auto limit, still requires one MANAGER step; the reviewer may not take the
first step (`POLICY_FOUR_EYES_AFTER_REVIEW=true`).
Consequences: an exception always has two humans on it.

## ADR-011 UI language German, code and documentation English

Decision: UI labels and status texts are German (target users are German
finance staff); identifiers, comments, docs and commit messages are English.

## ADR-012 The API port variable is API_PORT, not PORT

Context: `node --env-file` does not override a variable already present in the
environment. A host or dev-tool that sets `PORT` (the preview runner here did)
therefore made the API bind to the UI's port, and the UI silently moved to
another one.
Decision: the API reads `API_PORT` (default 4400); the UI dev server owns 5400.
Consequences: two servers, two unambiguous variables; an ambient `PORT` cannot
collide with either.

## ADR-013 Segregation of duties is checked on identity, in a fixed order

Context: the brief requires that one actor cannot satisfy two independent
approval steps, and that a finalised invoice cannot be processed again.
Decision: `decideApprovalStep()` checks, in this order: the invoice is still
READY_FOR_APPROVAL; the step exists and is PENDING; it is the lowest pending
step (steps run in order); the actor's role equals the step's `required_role`
exactly; the actor has not decided another step on this invoice; and the actor
is not the person recorded in `invoices.review_accepted_by`.
Roles must match exactly. A CFO does not implicitly satisfy a MANAGER step,
because an implicit hierarchy would quietly let one person cover a chain.
Consequences: refusals are 403 for a role mismatch and 409 for everything
else, and nothing is written when a check fails.

## ADR-014 Requesting information cancels approvals already given

Context: an invoice can reach READY_FOR_APPROVAL, collect one approval, and
then turn out to need a correction. Phase 1's re-validation only cancelled
PENDING steps, so an approval given before the correction would have survived
into the next run.
Decision: moving to INFO_REQUESTED sets every PENDING *and* APPROVED step to
CANCELLED and clears `review_accepted_by`. Re-validation then rebuilds the
steps from scratch.
Consequences: a correction always restarts the approval chain. The cancelled
rows are removed on the next validation run; the audit trail keeps the record
of who had approved what.

## ADR-015 Refused attempts are not written to the audit trail

Context: a blocked four-eyes attempt is interesting security telemetry.
Decision: `audit_events` records state transitions and decisions that
happened. A refused request changes nothing and is rejected before any write,
so it produces no event; the API returns the reason to the caller.
Consequences: the audit trail answers "what happened to this invoice", not
"what did someone try". Recording attempts would need a second connection
outside the rolled-back transaction. Noted as a limitation, not done.

## ADR-016 Reconciliation never matches on amount alone

Context: the classic reconciliation failure is closing the wrong invoice
because a payment happened to equal its amount. Two invoices of the same value
are indistinguishable by amount.
Decision: `matchTransaction()` reconciles only when the transaction reference
names exactly one open invoice AND the amount agrees. A reference match with a
different amount is an exception on that invoice; an amount match with no
usable reference is an exception attached to no invoice; a reference naming
several invoices is ambiguous. Where one invoice number is a prefix of
another, the longest match wins.
Consequences: more exceptions and more human work, which is the intended
trade. Closing a wrong payable is worse than asking a person.

## ADR-017 Idempotency is enforced by database constraints, not by checks

Context: retries, replayed webhooks and re-imported statements must not create
duplicates, and a pre-flight "does it already exist" check is a race.
Decision: unique constraints carry it. `accounting_records.invoice_id` is
unique, `payment_instructions.idempotency_key` is unique and derived from the
invoice, `bank_transactions.external_id` is unique, and a partial unique index
allows only one MATCHED transaction per invoice. Inserts use
`on conflict do nothing` and treat "no row inserted" as "already done". The
state machine independently blocks a repeated transition.
Consequences: correct under concurrency, not only under polite callers.

## ADR-018 Account numbers and tax keys are demo assignments

Decision: the accounting record carries creditor account, expense account and
tax key derived from small lookup tables. These are illustrative values, not a
certified SKR03/SKR04 mapping, and are labelled as such in the UI, the table
comment and the export documentation. A real installation maps its own chart
of accounts behind the same record shape.

## ADR-019 Eligibility is separate from the transition table

Supersedes nothing; corrects an omission in ADR-002 and ADR-010.

Context: an independent review of Phases 0-2 showed that a legal state edge was
being treated as sufficient authority to advance. A malformed invoice with no
readable amount and no resolved supplier could be released from review and
approved, becoming payable with `gross_amount = null`.
Decision: two separate questions. `states.js` answers "is this transition
allowed"; `eligibility.js` answers "is this evidence good enough to become
payable". `payableBlockers()` requires an invoice number, a readable gross
amount, a resolved supplier, a valid issue date, a currency, and no failed
check in `NON_OVERRIDABLE_CHECKS` (well-formedness, recognised format, required
fields, numeric amounts, valid dates, consistent totals). It is enforced when
review releases an invoice and again at final approval.
A reviewer judges business facts: a changed IBAN, a PO overrun, a suspected
duplicate. A reviewer cannot supply facts the document never carried. Two
people clicking does not establish a missing amount.
Consequences: technical failures are no longer overridable; business
exceptions still are, which is what review is for.

## ADR-020 A document that was ever an exception always needs a human

Context: an invoice in review whose master data was then corrected would, on
re-validation, take the ordinary auto-approval path and reach APPROVED with no
human involved. That contradicted ADR-010's stated outcome.
Decision: `invoices.had_exception` is set on entry to REVIEW_REQUIRED and never
cleared. Routing refuses to auto-approve such a document, producing at least one
approval step regardless of amount.
Consequences: correcting master data resolves the exception but does not erase
the fact that there was one.

## ADR-021 Identifiers must agree, not merely be present

Context: an invoice carrying a tax id that matched no supplier was quietly
resolved by company name instead, and the resulting evidence claimed the match
was made by tax id. An invoice addressed to a different company was approved.
Decision: a supplier tax id that matches nothing is a contradiction and fails
`supplier_known`; name matching is used only when no tax id is present, and an
ambiguous name fails. The new `buyer_is_us` check requires every buyer
identifier present in the document to agree with the configured company
(`server/config/company.js`). The lookup reports how the match was made, and
the check text states that method rather than inferring it.

## ADR-022 Declared totals are chained, not compared pairwise

Context: a document could declare a self-consistent header (net 100 + VAT 19 =
119) over lines that summed to 319.33, and pass, because the line sum was only
ever compared to the declared line-extension total.
Decision: `totals_consistent` chains line sum to line-extension total to
tax-exclusive amount to gross to payable amount. Unit prices join the
`amounts_numeric` check, so an unreadable price is a failure rather than a
silent null.
Consequences: this is a defined subset, not full EN 16931 arithmetic.
Allowances, charges, prepayments and rounding are not modelled; see the known
limitations in `docs/TEST_MATRIX.md`.

## ADR-023 Invalid configuration stops the process

Context: setting a tier limit to a non-numeric value produced NaN thresholds,
and a 30.000-EUR invoice then required only one approver instead of three.
Decision: `loadPolicy()` rejects non-finite or negative amounts and requires
the tiers to ascend. A misconfiguration is a startup failure, never a silently
weaker control.

## ADR-024 PO matching is a snapshot comparison, not a spending control

**Superseded by ADR-032 (2026-09-17).** The limitation is closed; the decisions
this ADR said were unsettled are settled there.

Context: two invoices, each within the PO's remaining amount, both approve even
though together they exceed it. There is no reservation, consumption or release
lifecycle; `purchase_orders.remaining_amount` is never decremented.
Decision: for this PoC the PO check stays a per-invoice snapshot comparison.
This is a stated limitation, not a claim. The system does not prevent cumulative
PO overruns, and no document may claim that it does.
A reservation lifecycle needs decisions this brief does not settle: when an
invoice reserves capacity, how a rejection releases it, whether tolerance
applies per invoice or cumulatively, and how concurrent invoices share a
balance. That is scoped work, not a patch.

## ADR-025 KPIs are computed, never counted

Context: a dashboard that maintains its own counters has a second source of
truth and drifts from the process it describes.
Decision: every figure in `GET /api/dashboard/kpis` is a query over
`invoices`, `validation_results` and `audit_events`. There is no KPI table, no
increment on write, and no cache. Straight-through means an `auto_approved`
event exists; an exception means the invoice carries `had_exception`.
Consequences: the dashboard cannot disagree with the invoice list. If a figure
looks wrong, the process data is wrong, and that is the useful failure mode.

## ADR-026 Cycle times are medians, split by path, and null when absent

Decision: cycle times use `percentile_cont(0.5)`, not averages, so one invoice
left over a weekend does not move a headline. Processing time is reported both
overall and for the human-touched path, because straight-through invoices are
approved within seconds and would otherwise hide how long a touched invoice
takes. Review dwell time is measured separately. A stage nothing has reached
reports null, never zero: "no data" and "instant" are different answers.

## ADR-027 The savings figure always travels with its assumptions

Context: the brief forbids inventing claims about customer savings.
Decision: `server/config/assumptions.js` holds the minutes-per-invoice and
hourly-cost inputs, the API returns them inside the `economics` block, and the
dashboard renders them as a table directly beneath the figure they produce,
labelled as a scenario and not a measurement. The estimate is applied to the
invoice population actually in the database, and the basis count is shown.

## ADR-028 Demo data goes through the real pipeline, then is backdated

Context: a demo run produces a median processing time under a second, so the
cycle-time panel says nothing.
Decision: `npm run db:demo` generates invoices and pushes every one through the
real intake, validation, routing, approval and payment functions. Nothing is
inserted straight into a table, so states and audit trails are genuine. Only
the timestamps are then shifted into the past with plausible gaps per step.
Consequences: the KPIs are computed over real process data with realistic
timing. The data is synthetic and labelled as such in the UI.

## ADR-029 Real authentication replaces the trusted actor header

Supersedes ADR-005.

Context: `X-Actor-Id` let any caller name themselves. Every server-side
control built on top of it (four-eyes, segregation of duties, the approval
chain) demonstrated identity-based rules without authenticating the identity.
An independent review flagged this as a deployment gate, and it is the last
thing standing between this PoC and something defensible.

Decision: password login with server-side sessions.
- Passwords: scrypt from `node:crypto`, a salt per user, constant-time
  comparison. No new dependency.
- Sessions: a random 32-byte token in an HttpOnly, SameSite=Strict cookie.
  Only its SHA-256 is stored, so a dump of `finops.sessions` yields no usable
  session. Logout revokes server-side, so a replayed cookie is dead.
- CSRF: double-submit. The token sits in a readable cookie and must be echoed
  in `X-CSRF-Token` on every state-changing request. A cross-site form can
  send the cookie but cannot set the header.
- Login failures are counted per account and lock it temporarily. A wrong
  password and an unknown address get the same answer, so the form cannot be
  used to enumerate staff.
- The actor for every audit event comes from the session, never from the
  request body or a header.

Consequences: `X-Actor-Id` is gone, not deprecated, and a test asserts it
grants nothing. This is authentication suitable for a demo, not an identity
provider: there is no password reset, no second factor, and no SSO.

## ADR-030 One authorization matrix, served to the client

Context: the target process says review belongs to accounts payable and
finance and the money path to finance, but every signed-in role could do
everything, and the UI offered buttons that would be refused.
Decision: `server/auth/authorize.js` holds the role-to-permission table and is
the only place it exists. Routes are guarded by `requirePermission(...)`.
`GET /api/auth/me` returns the permissions of the signed-in role, and the UI
hides what the server would refuse rather than re-implementing the rules.
Which role may decide an individual approval step stays in the approvals
domain, next to segregation of duties, because it is a property of the step
and not of the route.
Consequences: a manager can no longer take review decisions. Finance is
deliberately the one role that may both review and approve, which is what
makes the four-eyes-after-review rule meaningful rather than theoretical.

## ADR-031 The stack stays Express, `pg` and React

Context: revisiting ADR-001 after Phases 1-5, with the question of whether
Next.js or TypeScript would serve the project better.
Decision: no change to the runtime stack. The client is already React; the
gap against a "modern" stack is TypeScript, not the framework. Next.js solves
server rendering, routing and asset delivery, none of which this internal
console needs, and it would replace a working transport layer for no domain
benefit. The domain is already framework-agnostic: plain functions over a
`deps` object, which is what makes the transport replaceable at all.
TypeScript is worth doing and is recorded as the next scoped piece of work
rather than an incidental rewrite. It is honest to note that it would not have
prevented any of the defects the independent review found: those were runtime
data and control-flow problems, not shape mismatches.

## ADR-032 Purchase-order capacity is a commitment ledger

Supersedes ADR-024, which recorded the gap and listed the decisions it needed.
Those are settled here.

Context: `purchase_orders.remaining_amount` was read but never consumed, so two
invoices that each fitted inside it both became payable. A purchase order is a
spending limit, so what matters is the sum of everything live against it.

Decision: every invoice that is live against an order holds a row in
`finops.po_commitments`. Available capacity is the opening `remaining_amount`
minus the active commitments. The balance itself is never mutated: doing so
would be destructive, unauditable and racy, and it would lose the distinction
between "committed" and "spent".

The open questions, answered:
- **When is capacity taken?** On entering any state where the invoice is a
  claim on the order: READY_FOR_APPROVAL and every payable state through to
  RECONCILED. Taking it at approval alone would surprise an approver with a
  refusal at the click; taking it at validation means the second invoice is
  routed to review with the reason stated.
- **When is it released?** On entering REVIEW_REQUIRED, INFO_REQUESTED,
  REJECTED or DUPLICATE. A question or a rejection frees the money again.
- **Where is it maintained?** Inside `transition()`, the same choke point as
  the audit event. The claim belongs to the state change, not to whichever
  caller remembers to adjust it.
- **Per invoice or cumulative tolerance?** Cumulative. Tolerance is computed
  once on the order's opening balance and applies to the sum of commitments,
  otherwise N invoices each "within tolerance" drift the order by N times it.
- **Concurrency?** `availableCents()` locks the order row, so two invoices
  arriving together serialise instead of both reading the same availability.
  A test asserts that exactly one of two simultaneous uploads proceeds, and it
  fails when the lock is removed.

Consequences: a partially consumed order shows available capacity, not its
opening balance, in the UI and in the check evidence, which names how much is
held by other invoices. The demo data now creates its own orders with
realistic capacity, because otherwise a month of invoices against a handful of
small seeded orders turns almost every invoice into a PO exception.

Still not modelled: partial deliveries, credit notes returning capacity, and
order closure. An order is a single balance, not a line-by-line receipt.

## ADR-033 An approval names the document it was given for

Context: an `approval_steps` row recorded who decided, when, and with what
comment, but not what was decided about. To answer "what did this approver
sign for?" you had to read the invoice's current columns and assume nothing
had moved since.

Nothing had. Extracted fields are written only by `saveExtractedFields` inside
`processInvoice`, which is gated on `REPROCESSABLE_STATES` (RECEIVED,
VALIDATING, REVIEW_REQUIRED), and master data is read-only through the API. So
an invoice is frozen from the moment it leaves review. That is an accident of
a list, not a rule, and it will not survive corrections, credit notes or
partial deliveries.

Decision: each decision writes `document_sha256`, `validation_run_no` and
`decided_gross` onto its own step. Two gates then compare the invoice as it
stands against every step already decided: the next approval step, and the
accounting handoff. A mismatch is a 409, never an inherited signature.

A literal document-hash comparison alone would be a control that can never
fire, because the file bytes are an intake fact. The validation run and the
decided amount are what make the binding load-bearing: they are the things a
future correction path would move.

Steps decided before this column existed carry no binding and are skipped. An
absent record is not evidence of a change, and inventing a refusal from missing
data would be the opposite of fail-closed: it would strand invoices that are
fine.

Not included: re-running business checks at the final gate. A supplier blocked
between step 1 and step 2 is still approved today, because only
`payableBlockers` is re-checked. That is a separate control with its own
semantics, recorded as an open limitation rather than smuggled in here.

## ADR-034 English is a display language, German is the product's

Extends the rule in `AGENTS.md` that UI text is German. It still is: German is
what the server generates, what the database stores, and what an auditor of
this system would read. English exists so the same demo can be shown to an
audience that does not read German.

Decision: the client renders either language from the codes the API already
sends (`state`, `action`, `check_code`, `review_reason`, `match_reason`). The
server, the schema and the `CheckResult` contract are untouched, and the choice
lives in the browser, not on the account: it changes nothing that is stored.

Rejected: replacing German outright, which would have cost German-speaking
audiences for a product about German e-invoicing; and persisting message keys
plus parameters instead of prose, which is the architecturally clean answer but
needs a migration, a change to the contract the brief specified, and a backfill
of every existing row. That remains the right move if the product ever needs
stored history to be language-neutral.

The honest cost of the cheap option: an English label is a translation of a
German sentence the server produced, so it can fall behind. Three guards in
`dictionaries.test.js` make that fail loudly rather than silently. They read
the server's own source, so a check, an audit action, a state or a role added
without an English label breaks `npm test`.

Two things stay German on purpose. Supplier names, invoice numbers and the
payment terms read out of the document are data, not chrome; translating a
supplier's own wording would misrepresent the document. And a comment a person
typed stays in the words they wrote, because rewriting someone's entry in an
audit trail is worse than showing German to an English reader.

The URL paths stay German (`/sichtpruefung`, `/freigaben`). They are
identifiers, and changing them would break existing links for no gain.

## ADR-035 A stored original is served as source text, never as a document

Context: `/api/invoices/:id/file` returned the stored bytes as
`application/xml` with `Content-Disposition: inline`, on the API's own origin,
with no content policy. The XML gate decides what the system will *process*; it
does not decide what a browser will *render*. A file refused as an invoice is
still downloadable, and a document refused as an invoice can be a perfectly
good XHTML page.

Reproduced on 2026-09-17: a clerk uploaded well-formed XHTML named `.xml`.
Intake correctly routed it to review as an unsupported format. Opening its
original-file URL in a browser authenticated as a manager executed its script,
which called `/api/auth/me` and read back role MANAGER. That is stored XSS: the
uploader chooses the payload and the victim is whoever opens the link. HttpOnly
stops a script reading the cookie; it does not stop the script making
authenticated requests with it.

Decision: the endpoint serves `text/plain; charset=utf-8` with
`X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none';
sandbox; frame-ancestors 'none'` and `Referrer-Policy: no-referrer`. The bytes
are unchanged: safety comes from how the evidence is served, never from
rewriting it. `nosniff` is set on every API response, because a declared type
that the browser is free to second-guess is not a declared type.

Rejected: serving it as an attachment. The reviewer's "view the original" link
is worth keeping, and plain text with nosniff already removes the execution.

Rejected: filtering the uploaded XML. A filter is a guess about every renderer;
the content type is a statement to all of them.

## ADR-036 What must agree before a payment closes an invoice

Extends ADR-016, which established that reference and amount must both agree.
Three defects showed that was not enough, each reproduced on 2026-09-17.

**The reference must name the invoice, not contain its characters.** Matching
was a substring test with a longest-number tie-break. With only `INV-1` open, a
reference naming `INV-10` closed `INV-1`; with both `INV-A` and `INV-LONG` open,
`"INV-A und INV-LONG"` silently closed the longer one instead of being
ambiguous. An identifier now ends where a non-alphanumeric character begins, so
`INV-10` does not name `INV-1` while `RG-INV-2026-00421/2026` still names
`INV-2026-00421`: a hyphen or slash joins identifiers, a digit extends one.
With real boundaries the tie-break has nothing left to fix and is gone; two
named invoices are two obligations, which is ambiguous.

**Direction is defined.** This is Nordwerk's own account, so paying a supplier
moves money out and appears as a negative amount, which is what the demo
statement already carried. A positive transaction of the same size is money
arriving and does not settle a payable. Tests previously accepted either sign,
which is how an incoming credit could close a bill.

**Currency and counterparty are evidence too.** The matcher compared an
absolute number and ignored both, and the candidate query did not even select
the invoice currency. A payment in USD, or to a different supplier's account,
reconciled a EUR invoice. An account that cannot be verified on either side is
an exception, not a pass: unverifiable is not verified.

Checked in a fixed order — direction, currency, counterparty, amount — so a
transaction wrong in several ways always reports the same reason.

**Manual resolution consumes the evidence.** Closing an exception changed only
the invoice; its transaction stayed `EXCEPTION`, was picked up by the next run,
reset to `UNMATCHED` with its reason cleared but its invoice link intact, and
was then free to match a later invoice. A resolved transaction now moves to
`RESOLVED` in the same transaction as the invoice, and `RESOLVED` never
re-enters matching. A transaction that stops matching loses its invoice link
instead of keeping a stale one.

## ADR-037 A feature that reads existing rows needs a repair migration

Context: migration 0006 created the purchase-order commitment ledger empty. A
new installation is correct, because every invoice arrives after the ledger
exists. An installation that already had invoices in capacity-holding states
came out of the upgrade with no record of those claims, so every order looked
untouched and the next invoice could spend the same money again.

Reproduced on 2026-09-17 by applying 0001-0005, inserting an APPROVED invoice
for 319,33 against a 500,00 order, then applying the rest: availability still
reported the full 500,00.

Decision: 0009 backfills the missing commitments, append-only and safe to
re-run. An order that was already overspent before the ledger existed is
reported with `raise notice` rather than absorbed, because silently swallowing
it hides the condition the ledger was added to prevent.

The general rule this records: a migration that introduces a table the domain
treats as complete must populate it from the rows that already exist. Every
other test in this project starts from an empty schema with all migrations
applied, so no reset-and-seed test can see this class of defect. Upgrade tests
build the "before" state deliberately: migrations to a point, data, then the
rest.

## ADR-038 The accounting CSV defends against formula execution

Context: the export quotes delimiters and quotes, which keeps a value inside
its column. It does nothing about a spreadsheet executing it. An invoice
numbered `=1+1` passes intake and reaches the CSV as a live formula.

Decision: a cell opening with `=`, `+`, `-`, `@`, tab or carriage return is
prefixed with an apostrophe, which Excel, LibreOffice and Sheets all read as
"this is text". A well-formed number is exempt, otherwise every credit amount
would be mangled to defend against a leading minus.

The trade-off, stated plainly: the prefix changes the exported value. The
export's consumer is a bookkeeping import, which should strip a leading
apostrophe, and the prefix appears only on values that would otherwise be
executed. Neutralising at export rather than rejecting at intake keeps the
stored document a faithful record of what the supplier sent.

## ADR-039 A KPI answers one question, and says which

Two figures on the dashboard were measuring something other than their label.

**"Time waiting in review" paired the wrong events.** It subtracted the first
entry into review from the first entry into the approval queue, across an
invoice's whole history. For the ordinary path
`READY_FOR_APPROVAL -> INFO_REQUESTED -> REVIEW_REQUIRED`, the approval entry
comes first and the figure went negative. Each entry into review is now paired
with its own exit, so an invoice that visits review three times contributes
three durations, and a visit that has not ended contributes none: an unfinished
wait has no duration yet, and counting it as zero would flatter the number.

**"Overdue" counted invoices that were already paid.** The filter excluded
`PAID` and `RECONCILED` but not `RECONCILIATION_EXCEPTION`, which is only
reachable after payment. A paid invoice whose bank match was unclear appeared
as an unpaid overdue bill. Overdue means the supplier does not have their
money; an unclear reconciliation is bookkeeping work, already counted on its
own line.

The rule behind both: a KPI is defined by the question it answers, and a state
added to the machine has to be placed in every figure that filters on state.

## ADR-040 Refusing a login costs the same whether or not the account exists

Context: the login returns one wording for every failure, which the README
described as giving nothing away. The work behind it differed: an unknown
address returned without touching scrypt, a known one paid the full cost.
Measured on 2026-09-17 against the running API: a median of 1.1 ms for an
address that does not exist against 40.4 ms for one that does, a factor of
thirty-seven. Identical wording delivered in a fortieth of the time is not
identical; the login form enumerated the staff list.

Decision: when no user matches, the request verifies the password against a
decoy hash generated at startup. Both paths run scrypt exactly once. Measured
after the change: 36.3 ms against 37.7 ms, a factor of 1.04.

The regression asserts a ratio rather than a duration, because absolute timings
belong to the machine, and it allows a generous threefold margin, because the
defect it guards against was fortyfold. A test that demanded tighter equality
would fail on a busy laptop and teach people to ignore it.

Also settled here: a lock that has expired resets the attempt count. Leaving
the count at the threshold meant the first wrong password after the wait locked
the account again immediately, which is a worse experience than the policy
describes and was never a stated decision.

## ADR-041 Business facts are checked again at the moment of signing

Closes L7, which had been accepted as a limitation since the eligibility work.

Context: validation runs at intake. Master data does not stand still. A
supplier can be blocked, a bank account retired or a purchase order consumed
while an invoice waits for a signature, and until now the final gate re-checked
only `payableBlockers` — missing fields and unreadable structure. Business facts
were whatever the last run had said. Reproduced on 2026-09-17: an invoice
released for approval, its supplier then blocked, was approved and became
payable on the strength of a check run days earlier.

Decision: before an approval is recorded, the business checks run again against
current master data and the stored parse. The document is an intake fact and
cannot have changed (ADR-033), so nothing is re-read from the file; only master
data can move the answer.

**The part that makes this non-trivial.** An invoice released from review still
carries the check that sent it there: a reviewer looked at that changed IBAN and
accepted it. Refusing on any failing check would refuse every reviewed
exception and make review pointless. The gate therefore compares against what
the previous run recorded and stops only a check that was not failing then and
is failing now. Severities match the routing rule, HIGH and MEDIUM, so the gate
stops exactly what intake would have stopped.

**Where the invoice goes.** Back to `REVIEW_REQUIRED`, not stuck in front of a
confused approver. A business problem belongs in the review queue, which is
where intake would have sent it, and the state machine gains
`READY_FOR_APPROVAL -> REVIEW_REQUIRED` for this one purpose. The pending steps
are cancelled and `review_accepted_by` is cleared, so the four-eyes rule starts
again rather than inheriting the earlier release.

The re-check is recorded as a complete validation run, so the reviewer opens
the invoice and sees the current picture. The technical results are carried
forward from the previous run rather than recomputed: the document cannot have
changed, so copying them states a fact rather than guessing one.

**The response.** The transition commits and the request is answered 409 with
the invoice. The signature did not happen and the invoice did move; reporting
only one of those would leave the screen lying about the other. The client
reloads after a refusal for the same reason.

Rejection is deliberately unaffected. The gate guards the payable direction:
refusing to pay a blocked supplier is always allowed.

## ADR-042 A refusal carries a code as well as a sentence

Closes L8. ADR-034 put the display language on the client, rendered from the
codes the API already sent. Refusals had no code: they were German prose, shown
verbatim, so an English demo was English until something went wrong and then
answered in German at exactly the moment a reader most needs to understand.

Decision: every refusal carries a stable `code`, and `details` carry the
parameters its sentence interpolates. The German sentence stays in `error`
unchanged, so nothing that logs or reads the API breaks and a non-UI caller
still gets something legible. The client renders from the code and falls back
to the sentence when it does not know one.

The fallback direction matters. A missing entry shows German, which is a worse
answer than English and a far better one than nothing; a refusal must never be
swallowed because a translation is absent.

State and role parameters are translated before the sentence is built, so a
refusal names them in the same words as the rest of the screen: "An invoice in
state Approved is not in manual review", not "in state APPROVED".

Kept from going stale by the same technique as the check codes: the tests scan
the server's own source for every code it can send and fail when one has no
text in either language, when text exists for a code that can no longer happen,
and when a refusal is thrown without a code at all.

One guard was weaker than its name. "The English dictionary carries no German
text" only tested for umlauts, and a deliberate mutation putting
"Freigabeschritt" into an English string passed. It now also renders
parameterised entries, which it had skipped entirely, and trips on distinctive
German vocabulary. It is a tripwire, not language detection, and is named for
what it does.

## ADR-043 A document built from parts we do not model is refused, not measured

**Superseded by ADR-047.** Allowances, charges and prepayments are computed
now, and the blanket refusal this records is gone. Kept for the reasoning.

Closes half of L3. The adapter reads lines and totals. UBL also has allowances,
charges and prepayments, and an invoice using them behaves three different ways
depending on how it is written: a prepayment failed `totals_consistent`, a
correctly formed discount also failed it, and a discount the totals had already
absorbed passed every check. The first two were right for the wrong reason —
the totals were consistent, we simply could not reconstruct them — and the
third was a silent pass on a document whose payable amount we never verified.

Decision: the parser reports these parts, and `document_features_supported`
fails when any is present, naming which. The totals rule is then reported
SKIPPED rather than FAILED: a rule that does not apply to a document is neither
passed nor failed, and claiming either would be a statement we cannot support.

The check is non-overridable. A reviewer judges business facts; they cannot
supply a total the system never computed. Such an invoice can reach review and
be rejected or queried, and can never reach approval.

The cost, stated plainly: any invoice carrying a discount line is unpayable in
this prototype. That is the honest consequence of not modelling discounts, and
better than paying an amount nobody checked.

## ADR-044 Sending a stranded file again resumes it

Closes L2. Receiving a file and processing it are separate transactions on
purpose: that a document arrived is worth keeping even when the run that should
have read it fell over. The cost was that the invoice sat in RECEIVED and the
duplicate rule counted it as the live one, so re-sending the same file answered
DUPLICATE. The obvious thing for a sender to try was the one thing that could
not work, and only an operator with the reprocess endpoint could rescue it.

Decision: when the identical file arrives and the existing invoice is still in
RECEIVED or VALIDATING — states it only occupies while its first run has not
finished — that invoice is resumed instead of a duplicate being recorded. Its
intake facts are untouched, because it is the same arrival; the second delivery
is recorded as `intake_resumed` rather than passing silently.

The decision is taken under `select ... for update`. A run processing the
invoice at that moment holds the row, so the second arrival waits and then sees
where the first actually ended, rather than racing it into a second run.

A file sent again after processing finished is still a duplicate. Resumption is
for work that never completed, not a way around the duplicate rule.

The upload also writes to storage only once it is clear a row will reference
the bytes, so a resumption no longer leaves a second copy of an identical file
behind.

## ADR-045 The CSV export asks who is reading it

Closes L10, which ADR-038 recorded as a trade-off rather than a fix.

Two consumers want incompatible things from the same file. A bookkeeping import
matching on an invoice number must see that number byte for byte. A spreadsheet
executes any cell beginning `=`, `+`, `-` or `@`, so the same number becomes a
live formula in front of whoever opens it. Prefixing an apostrophe serves the
second and corrupts the first; ADR-038 chose the second and said so.

Decision: the export takes a profile. `machine`, the default, returns values
exactly as they arrived. `spreadsheet` neutralises cells that would execute.
The two download under different filenames so nobody imports the wrong one, and
an unknown profile is refused rather than guessed.

Defaulting to `machine` follows the documented purpose: this endpoint is an
accounting handoff, and nothing in the interface links it. Making the faithful
form the default means no identifier is ever altered unasked; a person who
wants to open the file in Excel says so.

A well-formed number is never prefixed under either profile, or every credit
amount would be mangled to defend against a leading minus.

## ADR-046 Two claims need a browser, so the tests use one

Closes L9 and U5, both of which had been verified only by hand.

Whether a served document executes is the browser's decision, made from the
headers. Asserting the headers proves the contract, not the consequence.
Whether a focus ring appears or an animation is suppressed is the result of
cascade and media-query evaluation, and `:focus-visible` is a heuristic about
how an element was focused. None of this can be checked by reading a file, and
the matrix had been claiming the accessibility rules worked on the evidence
that they were present in the stylesheet.

Decision: Playwright as a development dependency, with the browser tests in
`browser/`. They skip with the install command when the binary is absent, so
`npm test` still passes on a clean clone and in CI without a download, and run
for anyone who has it.

This does not reopen ADR-031. The stack that ships is unchanged; this is a test
dependency, and nothing in `server/` or `client/` imports it.

The security test reproduces the original attack rather than restating the fix:
it uploads the XHTML that once executed, opens it with a real session, and
asserts the script neither ran nor reached the API. Reverting the content type
makes it fail, which is how it was checked.

The accessibility tests read `client/src/styles.css` directly rather than a
build, so they need no `npm run build` first and exercise the file the project
edits. One of them clicks the control with a mouse and asserts the ring does
*not* appear: without it, a plain `:focus` rule would pass and the point of
`:focus-visible` would go untested.


## ADR-047 Allowances are arithmetic, so the arithmetic is done

Supersedes ADR-043, and closes the rest of L3's totals half.

ADR-043 refused any document carrying an allowance, a charge or a prepayment,
because the payable amount could not be reconstructed from what the adapter
read. The reasoning was sound and the cost was stated plainly: a correctly
written invoice granting a discount was unpayable here. That cost turned out to
be the wrong trade, because a discount is ordinary commercial practice rather
than an exotic corner of UBL, and because the parts being refused are not
features at all. They are the middle of EN 16931's calculation chain:

    lines - allowances + charges = net       (BR-CO-10, 11, 12, 13)
    net + tax                   = gross      (BR-CO-15)
    gross - prepaid + rounding  = payable    (BR-CO-16)

Decision: the adapter reads the whole of `LegalMonetaryTotal` and every
`AllowanceCharge`, at document and line level, and `totals_consistent` checks
every link of that chain instead of the three it checked before. The feature
blacklist `document_features_supported` is deleted; the arithmetic is what
fails closed now, and it is the stronger guard, because it also catches a
document that uses a part we did read and still does not add up.

The fail-closed property is unchanged, and rests on three rules:

- An amount the document omits is zero. One it states but we cannot read is
  unknown, and unknown is never treated as zero: a prepayment of "zweihundert"
  read as nothing due would leave the whole gross amount to pay a second time.
- `cbc:ChargeIndicator` decides whether an amount is added or subtracted. A
  value that is neither `true` nor `false` is reported as neither, and the
  document is refused, rather than defaulting to one and moving money.
- `totals_consistent` stays non-overridable. A reviewer judges business facts;
  they cannot supply a total the document never added up.

One consequence had to be handled separately. Allowances make a zero payable
amount reachable — a discount covering the line total, or a prepayment covering
the gross — and zero is a known amount, so it passed the unknown-amount guard
in routing and could auto-approve a payment run for nothing. Routing now sends
any payable amount at or below zero to review as `NOTHING_TO_PAY`.

What is still not modelled is named rather than implied: a line's own net
amount is taken as declared and summed, so a line whose stated discount does
not match its stated net is not caught. The header chain closes over the
declared line amounts, so this cannot move the amount paid; it can only hide a
supplier's own arithmetic error inside a line.

## Assumptions and contradictions found in the brief

- The brief lists "totals mathematically consistent" under business validation
  although it is a property of the document. Kept under business validation as
  requested; the technical layer only checks that amounts parse.
- The brief's example thresholds overlap ("€500-€5,000 one manager", "> €5,000
  Finance + manager", "> €25,000 senior"). Interpreted as tiers on gross amount:
  ≤ 500 auto, ≤ 5 000 MANAGER, ≤ 25 000 MANAGER + FINANCE, above MANAGER +
  FINANCE + CFO.
- Scenario A asks for "straight-through or minimal approval". With gross
  1 240 EUR it needs one MANAGER approval under the default policy. Fixture G
  (380 EUR) shows the straight-through path.
- Scenario C ("exception / approval path"): a PO overrun is a HIGH failure, so
  it goes to review, not approval. A reviewer can accept it into approval.
- Scenario D is implemented both ways: re-uploading the identical fixture A
  file → `DUPLICATE`; fixture D (same number, different issue date) →
  `REVIEW_REQUIRED`.
- The brief says "Nordwerk GmbH ~2,000 supplier invoices per month". All volume
  and cost figures in `docs/BUSINESS_CASE.md` are assumptions labelled as such.
- "Prevent duplicate approval": interpreted as (a) an approval step can be
  decided once, (b) the same user cannot decide two steps of one invoice,
  (c) a finalised invoice rejects any approval call.

## ADR-048 A line amount is recomputed, not taken on trust

**Partly superseded by ADR-081 (2026-09-30):** a line that cannot be
recomputed is FAILED, not SKIPPED. The first supporting decision below no
longer holds.

Completes ADR-047 and closes the last of L3's totals half.

ADR-047 verifies the chain from the line total to the amount due, and that
chain sums the net amount each line declares. Those declared amounts were the
one set of numbers nothing derived. A line reading

    quantity 10, unit price 5.00, line amount 500.00

leaves every total in the document consistent with every other, passes the
whole chain, and overpays by a factor of ten. The header arithmetic cannot see
it, because the header arithmetic is built from it.

Decision: every line is recomputed as
`quantity x unit price / base quantity - allowances + charges` and compared
with the amount it declares, as `line_amounts_consistent`. Base quantity
matters and is read: a price stated per 1000 pieces is not a price per piece,
and treating it as one would fail every such line.

Severity is HIGH, because this is the only check anchoring a declared amount to
what was ordered. It is deliberately **not** in `NON_OVERRIDABLE_CHECKS`,
unlike `totals_consistent`. The difference is what a reviewer can actually
judge: a document whose totals do not add up cannot be made to add up by a
person, but a line whose price differs from the order is exactly the business
fact a reviewer reads the order to settle.

Two supporting decisions:

- A mixture of lines that agree and lines that could not be recomputed is
  reported SKIPPED, not PASSED. Passing would claim every line was verified.
- The product is computed exactly, in `productToCents`, rather than with
  floating point. A price may carry four decimals and a quantity may be
  fractional, the tolerance is one cent, and a one-cent rounding error would
  refuse a correct invoice. Truncating instead of rounding a half is caught by
  its own test.

## ADR-049 A credit note is the same pipeline with a different ending

Closes the credit-note half of the purchase-order limitation.

UNTDID 1001 code 381 was a warning, and the document then took the ordinary
payable path: a document saying the supplier owes us could be approved, booked
and paid, sending money in the direction the document reverses. Nothing caught
it, because every check upstream asks questions that are just as valid for a
credit note - is this supplier known, is it addressed to us, do the totals add
up - and answers them the same way.

Decision: a credit note is an invoice row with `document_type = 'CREDIT_NOTE'`,
not a separate entity. It reuses intake, validation, routing, approval and the
accounting handoff, and parts company at the money.

Four consequences, each of them a decision in its own right:

- **Amounts stay positive, as the document states them.** The direction is
  carried by the type. Storing it as a sign would push the question into the
  totals chain, the approval tiers and every check that reads an amount, and
  each of those would have to be right about it.
- **The booking record carries the sign.** `buildAccountingRecord` negates net,
  tax and gross for a credit note, because that is what accounting reads and
  where a reversal belongs.
- **The payable path is closed.** `createPaymentInstruction` refuses a credit
  note before it looks at the state, so the refusal names the real reason
  rather than a status. `bookCredit` moves ACCOUNTING_READY to CREDITED, and
  refuses an invoice - otherwise an invoice could reach a terminal state
  without ever being paid and would leave the payment queue as if it had been.
- **It gives purchase-order capacity back.** Its claim in the ledger is
  negative. `CREDITED` is in the set of states that hold a claim, alongside
  `RECONCILED`: a booked credit note is as final as a reconciled invoice, and
  leaving it out released the negative claim and undid the capacity at the
  moment the credit became final. That was a real bug, found by extending the
  test past the state it originally stopped at.

Two checks behave differently for a credit note. `credit_note_reference` (the
invoice it credits) is asked only of credit notes, because an invoice would
report it SKIPPED every time and that is noise in the one panel a reviewer
reads. `po_amount_within_tolerance` is skipped, because a credit note does not
consume the order - measuring it against the ceiling would refuse exactly the
credit notes that matter most.

Both document shapes are accepted: a UBL `CreditNote` in its own namespace,
and a UBL `Invoice` whose type code is 381. Which one XRechnung requires is not
asserted here, because this project does not make standards claims it has not
verified (ADR-008).

**What is deliberately not modelled**: settlement. A credit note is booked and
closed, and whether the balance comes back as a refund or as a deduction from
the next payment run happens outside this system. Netting it against a later
payment would mean an open-credit ledger, partial consumption, and a bank
transaction that no longer matches any single invoice's amount - which reopens
reconciliation, the part of the system with the most safety rules in it. That
is a larger piece of work and is named here rather than half-built.

## ADR-050 A booked credit reduces the next payment, and the ledger says which

Completes ADR-049, which booked credit notes and left settlement outside the
system. A credit note now offsets the next payment to the same supplier.

The part that turned out not to need changing is the part I expected to:
reconciliation. `matching.js` has always compared a bank line with the payment
instruction rather than with the invoice, and its own comment says why - "they
agree today, and when they stop agreeing the instruction is the one the bank
acted on". Netting is exactly that case. The instruction carries the netted
amount, the bank line matches it, and no reconciliation rule moved.

**The ledger, not a balance.** `credit_applications` records each amount of a
credit note applied to an invoice. A credit note's open balance is its gross
amount minus the sum of its applications. An append-only record answers "why
was this payment 476.00 and not 595.00" months later; a decremented counter
cannot. A unique index on (credit_note_id, invoice_id) means a replay can
consume nothing, and the credits are read `for update` inside the payment's own
transaction, so two payments to one supplier cannot both spend the same credit.

**The order is part of the rule.** Oldest credit first, ties broken by document
number. Without a total order the same invoice could be paid a different amount
depending on the order rows came back in, which is not something a payment
system may leave to chance.

**Two endings, kept apart.** Credits that cover an invoice entirely leave
nothing to send, and an instruction for 0.00 is not a payment. The first design
refused that case, which stranded the invoice with no way out and, worse, made
partial consumption of a credit impossible: a credit is only ever used in part
when it exceeds the invoice, which was the refused case. So an invoice its
credits cover reaches `SETTLED_BY_CREDIT` through its own action. A person
decides to settle rather than to pay, and the audit trail says which they did.
`createPaymentInstruction` refuses a fully credited invoice (`FULLY_CREDITED`)
and `settleByCredit` refuses one with a remainder (`NOT_FULLY_CREDITED`), so
neither action can quietly do the other's job.

**Shown before the decision, not after.** The invoice detail reports the
supplier's open credits while the invoice waits at `ACCOUNTING_READY`, and the
action panel offers either "instruct payment" with the netting stated, or
"settle against credits" when they cover it. The audit event records the gross
amount, the amount applied and which credit notes were used, so the reduction
is never only visible as a smaller number.

**Still not modelled**, and named rather than half-built: a credit note is
applied to whichever invoices come next, not to the one it names. `BillingReference`
is read, stored and displayed, but it does not steer the netting. Honouring it
would mean deciding what happens when the named invoice is already paid, or
belongs to another period, and that is a question about someone's accounting
policy rather than about this code.

## ADR-051 Every state has one phase, and every list of states is derived from it

Context: the code filtered on invoice states in six places - `PAYABLE_STATES`,
the commitment ledger's `HOLDS_CAPACITY`, two KPI filters, the reconciliation
candidates and the duplicate lookup - plus the partial unique index. Each was a
hand-written list. ADR-039 recorded the rule "a state added to the machine has
to be placed in every figure that filters on state", and the next two states
proved it could not be followed by memory: after ADR-049 and ADR-050,
settling an invoice against credits released its purchase-order claim
(reproduced: PO-2026-0102 reported 600,00 available after a 100,00 invoice was
settled, against an opening 500,00), credited and settled documents counted as
overdue, and neither state was covered by `invoices_one_payable_per_number`.

Decision: `states.js` gives each state one phase - OPEN, AWAITING_APPROVAL,
COMMITTED, SETTLED or DISCARDED - and exports every list as a derivation:
`PAYABLE_STATES` (committed or settled), `HOLDS_CAPACITY_STATES` (awaiting
approval onward, not discarded), `OUTSTANDING_STATES` (not yet settled or
discarded), `DISCARDED_STATES`, and `AWAITING_RECONCILIATION_STATES` (derived
from the transition table). SQL receives these as `invoice_state[]` parameters
rather than literals.

The one list that cannot be derived is a partial index predicate. Migration
0013 widens it, and a test reads the index back from `pg_indexes` and compares
it with `PAYABLE_STATES`, so the two cannot drift silently. 0013 also restores,
per ADR-037, the claims that settlement had already released.

Consequences: a new state fails `states.test.js` until it is given a phase, and
placing it is one line. The invariant "once committed, only forward" is now a
test rather than a property of the table someone has to check by eye.

## ADR-052 A changed IBAN is verified into master data, never waved through

**Partly superseded by ADR-077 (2026-09-30):** a verified account is now added
inside the application, through a proposal, a call-back and an approval by
three people. The last sentence below no longer holds.

Supersedes the part of ADR-019 and ADR-041 that treated a changed IBAN as a
business exception a reviewer may accept. Extends ADR-013.

Context: the payment instruction paid the IBAN printed on the invoice. A
reviewer could release an invoice whose IBAN matched no account of the
supplier, one approver could sign it, and money went to an account nobody had
verified — the most common invoice-fraud pattern. Master data was re-checked at
the signature (ADR-041) but not at payment, so a supplier blocked or an account
retired between approval and payment was still paid. Separately, managers may
upload invoices and one-step invoices need only a manager, so one person could
submit and approve the same invoice.

Decision:
- `supplier_iban_match` joins `NON_OVERRIDABLE_CHECKS`. Review cannot release
  an invoice whose IBAN is not an active account of the supplier. The way on is
  to verify the account (a call-back on a number already in master data), add
  it to master data, and re-validate; ADR-020 still requires a signature.
- The payment instruction asks again: the supplier must be ACTIVE and the
  invoice's IBAN an ACTIVE account of it, or the instruction is refused
  (`SUPPLIER_NOT_ACTIVE`, `IBAN_NOT_VERIFIED`) and the invoice stays
  `ACCOUNTING_READY`. The instruction carries the account as master data holds it.
- `decideApprovalStep` refuses the person who submitted the invoice, read from
  its `received` audit event (`UPLOADER_CANNOT_APPROVE`). A system channel has
  no submitter and is unaffected.

Consequences: the demo no longer releases fixture B; it requests information
for a call-back, and the four-eyes beat uses fixture C (a PO overrun, still a
judgement call). Tests that used B as "an exception a reviewer accepts" now use
C or a built invoice against an unknown order. Master data has no write API in
this PoC, so adding a verified account is done outside the application.

## ADR-053 A booking has one line per tax rate, taken from the document

Refines ADR-018, whose account and key assignments remain demo values.

Context: the booking record carried one tax key, derived from total VAT divided
by total net. A mixed invoice - 7 % food and 19 % other goods is ordinary in
Germany - produced a ratio matching no real rate, and the lookup then fell back
to key "0", tax-free, without a word. An unrecognised rate did the same. That
is a wrong booking made silently, against the fail-closed rule. The document
states its rates itself, one `TaxSubtotal` each, but the parser never read them.

Decision:
- The parser reads each `TaxSubtotal` (base, tax, VAT category, rate).
- A new business check, `tax_breakdown_bookable` (HIGH), requires a breakdown;
  a tax key for every category and rate in `config/tax-keys.js`; each rate's
  tax equal to base x rate within the totals tolerance; and the breakdown
  summing exactly to the declared net and VAT, as EN 16931 defines those
  sums. It is not overridable: a reviewer cannot supply a rate mapping or
  arithmetic, as with `totals_consistent` (ADR-047).
- Keys are mapped by category and rate, not rate alone. Reverse charge (AE) is
  0 % and is not tax-free; it has no key, so it stops rather than being booked
  as key "0".
- The handoff writes one booking line per rate under one document number. Each
  line's gross is its base plus its tax, so the lines sum to the tax-inclusive
  total; a prepayment on the document was booked when it was made and is not
  part of this booking. Migration 0014 moves uniqueness to (invoice, tax key)
  and (document number, tax key).
- The handoff runs the same check again and refuses with 422 rather than
  trusting validation alone. An invoice parsed before the breakdown was read
  has none stored; its original is an intake fact and is parsed again.

Consequences: every invoice shows one more check (22, not 21). The CSV export
has one row per line, and the invoice detail lists every line's tax key.
Mapping a new rate is one entry in `config/tax-keys.js`.

## ADR-054 An approved invoice can be stopped until money is on its way

Context: once approved, an invoice could only move forward. `APPROVED` led to
the booking, the booking to the payment. Fraud or a dispute found after the
signature had no way out except paying, or editing the database behind
`transition()` - which the project rules forbid.

Decision:
- `APPROVED` and `ACCOUNTING_READY` may move to a new terminal state,
  `CANCELLED`, through `POST /api/invoices/:id/cancel`. A reason is required;
  the permission `invoice:cancel` is finance's and admin's.
- `CANCELLED` is in the DISCARDED phase (ADR-051): no longer owed, not
  payable, and its purchase-order claim is released by `transition()`.
- A booked invoice is reversed in the same transaction: its booking lines
  again with the sign turned, under a new document number, each line naming
  the document it reverses (`reverses_document_no`, migration 0016). A
  cancellation that left the booking in place would leave accounting holding
  an obligation nobody will pay.
- `PAYMENT_PENDING` cannot be cancelled directly. Once an instruction has gone
  to the bank, stopping it is a recall that the bank has to confirm; that
  belongs to the failed-payment path, not to this action.
- The invariant "once committed, only forward" becomes "once committed,
  forward or cancelled - never back to review".

Consequences: a new enum value in its own migration (0015), because Postgres
does not allow a value to be used in the transaction that adds it. The
dictionary guard now scans every server module for refusal codes; its
hand-kept list had missed the new folder and would have passed for the wrong
reason.

## ADR-055 A payment the bank did not carry out fails, and is tried again or stopped

Completes ADR-054. Supersedes the part of ADR-017 that keyed the payment
instruction once per invoice.

Context: `PAYMENT_PENDING` could only become `PAID`. A transfer the bank
rejected or returned had no state, and a second attempt was impossible: the
instruction's idempotency key was `pay:<invoice>`, so the only instruction an
invoice could ever have was the one that failed.

Decision:
- `PAYMENT_PENDING -> PAYMENT_FAILED`, reason required, through
  `POST /api/invoices/:id/payment/fail` - what a bank adapter's webhook would
  call. A recall is modelled as a failure the bank confirms, so a pending
  payment is never cancelled directly.
- `PAYMENT_FAILED` is in the COMMITTED phase (ADR-051): still owed, still
  payable, still holding its purchase-order claim. From it the invoice goes
  back to `ACCOUNTING_READY` (`/payment/retry`), to be instructed or settled
  again, or is stopped (ADR-054), which reverses its booking.
- Idempotency is per attempt: the key is `pay:<invoice>:<attempt>`, and a
  partial unique index allows at most one live (pending or executed)
  instruction per invoice, so a replay still cannot pay twice. Confirmation
  and reconciliation read only the live instruction; the invoice detail shows
  the latest attempt.
- Credits applied to the failed attempt are released - `released_at` on
  `credit_applications`, not a delete - so the ledger keeps the record and the
  next attempt nets them again (ADR-050).

Consequences: two enum and schema migrations (0017, 0018). The dictionary,
state and schema guards each flagged the new state until it was placed, which
is what ADR-051 set them up to do.

## ADR-056 Whoever signs an invoice does not pay it

Extends ADR-013 and ADR-052.

Context: FINANCE signs the second approval step of every invoice above tier 1
and also instructs and confirms payments. One person could sign an invoice and
then send its money, so the approval chain ended in the hands it was meant to
check.

Decision:
- `createPaymentInstruction` and `confirmPayment` refuse anyone who holds an
  `APPROVED` step on the invoice (409 `APPROVER_CANNOT_PAY`), before anything
  is written. The live signatures are read from `approval_steps`; after
  `APPROVED` no path leads back to review, so they cannot be rebuilt under the
  payer's feet.
- Booking, reporting a failed payment, reopening one and stopping an invoice
  stay open to the signer: none of them sends money.
- An invoice the system approved has no signer and is unaffected. ADMIN cannot
  approve, so is unaffected too.
- The client shows the refusal rather than hiding the buttons, as it does for
  the other person-based rules of ADR-013.

Consequences: an invoice with a FINANCE step needs a second finance user to
pay it; the seed has two (Jonas Weber, Mira Hoffmann). The demo generator lets
Mira sign and Jonas pay, and the demo script follows.

## ADR-057 An ended session returns the client to sign-in

Context: every page catches its own request errors. When the session expired,
a page either showed a bare "Nicht angemeldet" or, worse, rendered as empty:
the payments page read "0 Umsätze importiert" over a statement of 38 lines.

Decision: `request()` reports a refusal with code `NOT_SIGNED_IN` to one
listener, which `useSession` sets. It keys on the code, not on status 401,
because a wrong password is also a 401 (`SIGN_IN_REFUSED`). The listener only
acts when someone was signed in, so the first visit's refused `/auth/me` is
not called an expiry. The sign-in screen then says the session has expired;
the URL is kept, so signing in again returns to the same page.

Consequences: nothing a page did before the expiry is retried; the person
repeats the action after signing in, and the server decides it afresh.

## ADR-058 A production start serves the client and refuses the demo password

Context: the app could only run as a local demo. Nothing served the built
client, there was no start command, and every account, ADMIN included, shared
a password printed in the README. The `Secure` cookie flag depended on a
`NODE_ENV` nobody set.

Decision:
- `npm start` sets `NODE_ENV=production`. In production the API serves `dist/`
  and answers any GET outside `/api/` with `index.html`, so a reloaded client
  route works; `/api` keeps its JSON answers. Cookies are `Secure`, so HTTPS
  (typically a reverse proxy on the same host) is required.
- The start is refused, exit code 1, while `dist/index.html` is missing or any
  account still verifies against the published demo password. Every such
  account is named. `DEMO_MODE=true` allows the demo password on purpose, for
  a hosted demo on synthetic data. Development is never refused.
- `npm run user:password -- <email>` takes the password on stdin, so it stays
  out of shell history, requires 12 characters, clears a login lock and ends
  the account's open sessions.

Consequences: checking every account costs one scrypt verification each at
startup, about 40 ms per account. A password set through `DEMO_PASSWORD` is
not recognised as a demo password; it is a demo-only knob, documented as such.
There is still no self-service password change (S24).

## ADR-059 Failed sign-ins throttle the address, never the account

Supersedes the account lock of ADR-029 and the expired-lock rule of ADR-040.

Context: five wrong passwords locked the account itself for fifteen minutes,
and the lock outlived the right password. Anyone who knew an address, which
the demo accounts print on the login screen, could shut the CFO out at will,
from anywhere, again and again. Reproduced on 2026-09-23: six failures from
one address, then the owner's correct password from another got 429.

Decision:
- Failures are recorded per client address in `login_failures`. An address
  gets `LOGIN_MAX_ATTEMPTS` (5) per account and `LOGIN_MAX_ATTEMPTS_PER_IP`
  (20) across all accounts within `LOGIN_LOCK_MINUTES` (15); beyond that it
  gets 429 `LOGIN_THROTTLED` with `Retry-After`, even for the right password.
  The owner, from another address, is not affected.
- The attempt is written before the password is checked and taken back on
  success, so simultaneous guesses count one another; the per-account counter
  of F06 needed a single-statement update for the same reason.
- The check runs before the account is looked up, so a throttled answer is the
  same for an address that exists and one that does not (ADR-040 still holds).
- `trust proxy` is `loopback`: `X-Forwarded-For` is believed only from a proxy
  on the same host, so a client connecting directly cannot choose its address.
- `users.failed_attempts` and `users.locked_until` are dropped (0019).

Consequences: an attacker spread over many addresses is not stopped by this;
each address gets five guesses per account per quarter hour. That, and a
shared office address throttling colleagues after twenty failures, is the
trade against a lockout anyone can trigger. A second factor (S24) is the
answer to distributed guessing and remains out of scope.

## ADR-060 Requests are named, logged as JSON, and readiness asks the database

Completes the observability item whose pool error handler landed earlier.

Context: a failure in production could not be traced. The only log line was a
bare `console.error` of a 500, which the caller saw as "Interner Fehler" with
nothing to quote, and `/api/health` answered `ok` with the database down.

Decision:
- Every request gets an id: the caller's `X-Request-Id` when it is 1-64
  characters of `[A-Za-z0-9._-]`, so a proxy's id links both logs, otherwise a
  UUID. It is returned in `X-Request-Id`.
- Logs are one JSON object per line, from `server/log.js`, with no library.
  Each request logs method, path without its query, status, duration and the
  user id when it finishes; never the body, which can hold a password. warn
  and error go to stderr.
- A 500 logs the message and stack under the request id; the response carries
  only the id (`details.request_id`), which the client shows as the reference.
- `/api/health` stays liveness. `/api/health/ready` runs `select 1` with a two
  second limit and answers 503 when the database does not answer, so a load
  balancer can take the instance out without anything restarting it.
- `npm test` sets `LOG_LEVEL=warn`, so the test run is not buried in request
  lines; tests capture lines through `logOutput`, not stdout, because the
  test runner reports on stdout.

Consequences: no log shipping, metrics or tracing across services; a JSON
line per request is what a collector needs to start.

## ADR-061 The migration runner checks what it applied and runs alone

Context: `schema_migrations` recorded only file names. A migration edited after
it was applied was skipped without a word, so the change never reached any
database that already had the file, and two runs at once raced through the
same files; reproduced on 2026-09-23, the second crashed creating `pgcrypto`.

Decision:
- Each applied migration is recorded with the sha256 of its file. A run that
  finds an applied file whose checksum differs stops, naming the file. A row
  from before checksums existed is given its checksum on the next run.
- The whole run holds a Postgres advisory lock, so a second run waits and then
  finds nothing left to do.

Consequences: a checksum covers the bytes, so a line-ending conversion counts
as an edit. The rule was already append-only (AGENTS.md); now the runner
enforces it.

## ADR-062 A failed intake takes its file with it

Context: the original is written inside the intake transaction, before the
invoice row, so that a row never points at a file that is not there. When a
later step failed - a concurrent identical upload, any insert error - the
rollback removed the row and left the file, referenced by nothing. Reproduced
on 2026-09-23 with a failing insert.

Decision: an error between writing the file and the end of the intake's work
removes the file (`storage.discardUnreferenced`) before the rollback. A failed
commit does not: whether the row was committed is then uncertain, and a spare
file is harmless where a missing original is not.

Consequences: a process that dies between the write and the commit still
leaves a file behind. That is rare, harmless, and the only case left; a sweep
comparing storage with `invoices.file_path` would find it, and is not built.
Stored originals stay immutable: only a file no committed row refers to is
ever removed.

## ADR-063 A payment is known at the bank by an id Nordwerk issues

Context: the reference on a payment instruction was the supplier's invoice
number. It is chosen by the supplier, is not unique across suppliers, and was
never held to SEPA's 140 characters or its character set, so a long or odd
number would have been rejected by a bank. Reconciliation then looked for that
number in the bank line: a bank line naming only the supplier's number
reconciled the payment (reproduced on 2026-09-23).

Decision:
- Each instruction gets an `end_to_end_id`, `NW-P-` and eight digits from a
  sequence, one per attempt, unique, within SEPA's 35 characters.
- The reference sent is `<id> RE <invoice number>`, with any character SEPA
  does not carry replaced by a dot, cut at 140. The database enforces both for
  every row that has an id.
- Reconciliation looks for the id. The supplier's number alone identifies
  nothing. An instruction created before this change has no id and is still
  recognised by its reference, which was the invoice number, so payments in
  flight at the migration are not stranded.

Consequences: the bank line must echo the reference Nordwerk sent, which is
what a bank statement for an outgoing transfer does. Tests that used fixed
statements now substitute the reference that was sent. The demo generator's
totals are unchanged; its shipped statement is regenerated in the new format.

## ADR-064 Reading bank details and the books needs a permission

Extends ADR-030, which guarded every write but no read.

Context: any signed-in role could read the accounting export, the bank
transactions and the supplier master data, every IBAN included. A cost-centre
manager needs none of them to approve an invoice.

Decision: three read permissions. `accounting:export` and `bank:read` for
finance and admin; `master-data:read` for the AP clerk, finance and admin, since
the clerk reviews supplier and bank-account questions. The invoice detail still
shows the invoice's own IBAN to everyone who may see the invoice: the reviewer
and approvers need it to judge that invoice. The payments page says the area is
reserved for finance instead of showing an empty statement.

Consequences: `/api/users` stays open to any signed-in user; it holds names and
roles, which the approval screens show anyway.

## ADR-065 Sessions are written less and cleaned up

Context: resolving a session updated `last_seen_at` on every request, so every
read was also a write, and sessions that had expired or been revoked were
never removed.

Decision: `last_seen_at` is updated only when it is more than a minute old.
Each sign-in deletes sessions that expired or were revoked more than a day
ago; the last day stays, for anyone asking who was signed in when.

Consequences: `last_seen_at` is accurate to a minute. Clean-up runs only when
someone signs in, which is often enough for a table that grows only through
sign-ins; no scheduled job is needed.

## ADR-066 The invoice list comes a page at a time

Context: `GET /api/invoices` returned every invoice in one response, and the
navigation counted invoices per state by downloading that whole list on every
change.

Decision: the list takes `limit` (1-200, default 50) and `offset`, sorted by
receipt newest first with the id as tie-break, and reports the full count in
`X-Total-Count`. The body stays an array, so callers that read it are
unchanged. `GET /api/invoices/counts` answers the navigation with one grouped
query. The inbox shows the true total and loads further pages on request.

Consequences: offset paging can skip or repeat a row when invoices arrive
between two pages; for a work queue read by people that is acceptable, and
keyset paging can replace it without changing the client's contract. The KPI
queries still aggregate whole tables, which is what they are for; an index or
a summary table is the next step when that becomes slow.

## ADR-067 Approval steps are kept, round by round

Context: releasing an invoice from review deleted every approval step and
re-validation deleted the cancelled ones, so who had signed what in an earlier
round was gone from the table and survived only in the audit log.

Decision: steps carry a `round`. Each release into approval starts a new round
after cancelling what is left of the old one; nothing is deleted. The approval
decision works on the live round, the highest one. The invoice detail returns
the live round as `approval_steps`, as before, and the earlier rounds as
`approval_history`. Every other reader already filtered by status, and an
earlier round is always cancelled, so none of them changed.

Consequences: a cancelled step keeps its signer and decision time but not the
fact that it had been approved; the audit log has that. The screen does not
show `approval_history` yet.

## ADR-068 The app's database role cannot change the audit trail

Context: the app connected as the schema owner, which may UPDATE and DELETE
audit rows, and `audit_events` cascades from `invoices`, so deleting an invoice
erased its trail. Nothing in the app does either, but a trail that anyone with
the app's credentials can rewrite is not evidence.

Decision:
- The app connects as its own role. `npm run db:grant -- <role>`, run as the
  owner after every migration, gives it what the app needs and withholds
  UPDATE, DELETE and TRUNCATE on `audit_events`, DELETE and TRUNCATE on
  `invoices`, and writes to `schema_migrations`. Default privileges cover
  tables a later migration creates.
- A production start is refused while the connected role could change the
  trail, so running as the owner is caught, not assumed away.
- Migrations, the seed and the tests keep running as the owner.

Consequences: a deployment has two connection strings, the owner's for
migrations and the app's for `npm start`. The owner can still change anything;
protecting the trail from the database's owner is the database operator's
concern, outside this app. The cascade from invoices stays in the schema;
what stops it is that the app role cannot delete an invoice.

## ADR-069 Refusals live in one module, and the domain picks its own handler

Context: `RuleError` was defined in the approvals module and imported by five
others, and `TransitionError` and `NotFoundError` lived in the state-machine
module; a module that refused a payment depended on approvals for the class.
Separately, the review route read the invoice's state to decide which domain
function should handle "request information", a rule outside the domain.

Decision: the three refusal classes live in `server/domain/errors.js`.
`decideReview` handles "request information" while the invoice awaits
approval itself, in the same transaction that locks the invoice; the route
passes the action through.

Consequences: no behaviour changes. The refusal `NOT_AWAITING_APPROVAL`
disappears, because the state it guarded is now decided before the call; the
dictionary guard flagged its text as orphaned.

## ADR-070 Comments say why, not what happened

Context: several comments told the story of a change ("used to count as the
live one", "until this existed", "read 0 for as long as it existed"). The
story belongs to the ADRs and the commit log; in the code it ages into
confusion, describing a past the reader cannot see.

Decision: a comment states the reason the code is as it is, in the present,
and names the ADR that holds the story. Test files keep their headers naming
the defect a test guards against: that is the test's reason for existing.
Comments about rows written before a column existed stay, since they explain
current behaviour for old data.

Consequences: six comments rewritten; no code changed.

## ADR-071 The screen does not offer a release the server would refuse

Context: every invoice in review showed "Zur Freigabe geben". For one with a
failure no reviewer may override, such as a changed IBAN (ADR-052), the
button always failed with `NOT_PAYABLE_ELIGIBLE`.

Decision: the invoice detail carries `payable_blockers`, computed by the same
`payableBlockers` the release calls. With any blocker the client leaves the
release out and says why; asking for information, rejecting, confirming a
duplicate and checking again remain.

Consequences: the server still refuses on its own; the screen only stops
offering a button that cannot work.

## ADR-072 One business date, in German time

Context: the booking date was `new Date().toISOString()`, which is UTC, while
the due-date figures on the dashboard used the database's `current_date`,
which follows whatever zone the database runs in. Between midnight and 02:00
German summer time a booking was dated the day before, on New Year's night the
year before, and a hosted database on UTC would have moved "overdue" as well.

Decision: `businessDate()` in `server/domain/dates.js` gives today's date in
Europe/Berlin. Bookings, reversals and the due-date figures all use it; the
figures pass it to SQL instead of reading `current_date`.

Consequences: server and database zones no longer matter for any date the
business sees. Timestamps (`received_at`, audit times) stay `timestamptz`.

## ADR-073 Bad input is a 400 that says what is wrong

Context: input was checked only where a rule needed it, and the database was
left to refuse the rest. A statement line with amount "abc" or date "gestern"
came back as a 500, a numeric comment crashed on `.trim()` with a 500, a 900 KB
comment was written into the audit trail whole, malformed JSON got the
parser's English message and no code, and `SESSION_HOURS=zwoelf` started the
server and failed every sign-in.

Decision:
- Statement lines are checked field by field before the import; the 400 lists
  every bad line and field, and nothing of the statement is imported.
- Every `comment` is checked once at the API boundary: text, at most 1000
  characters. The form enforces the same limit.
- Malformed JSON is 400 `INVALID_JSON`, an oversized body 413 `BODY_TOO_LARGE`.
- Numeric settings go through `envNumber`, which stops the start with the
  setting's name and allowed range.

Consequences: a 500 now means a fault in the app, not bad input.

## ADR-074 Browser security headers on every response

Context: the only header was `nosniff`. The approval screens could be framed
by another site, a classic clickjacking target, and nothing limited where
scripts could load from.

Decision: every response carries a Content-Security-Policy that allows the
app's own origin and Google Fonts for the typefaces, with no inline script,
no eval, no plugins and no framing; `X-Frame-Options: DENY` for older
browsers; `Referrer-Policy: no-referrer`; `Cross-Origin-Opener-Policy:
same-origin`; and a Permissions-Policy that turns off camera, microphone and
location. In production HSTS is added, since the app runs behind HTTPS there
(ADR-058). The original-XML route keeps its own stricter sandbox policy.

Consequences: fonts from another host, or an inline script, need the policy
changed on purpose. The Vite dev server is not covered; it serves the
development build only.

## ADR-075 Every wait is bounded, and the server shuts down cleanly

Context: the pool had no connection, statement or idle-transaction limit, so a
database that hung took every request with it; a connect to an unroutable
address waited 75 s for the operating system. The process ignored SIGTERM, so
a deploy or restart cut requests off mid-transaction.

Decision: `createPool` bounds connecting (5 s), each statement (15 s) and a
transaction left idle (30 s), each overridable by environment and by tests;
the migration runner lifts the statement limit for its own session. A request
may take at most 30 s. On SIGTERM or SIGINT the server stops accepting
connections, closes idle ones, lets running requests finish, closes the pool
and exits 0; after 10 s it exits with 1 rather than hang.

Consequences: a slow query now fails with a 500 and a request id instead of
waiting indefinitely, which is what the logs and readiness check expect.

## ADR-076 The demo runs with one command

Context: this is a portfolio project. Running it needed Node, a local
Postgres, an `.env` and five commands, and the API served the built client only
in production, where HTTPS, a separate database role and replaced passwords are
required (ADR-058, ADR-068). A reviewer had no short way to see it.

Decision: `docker compose up` starts Postgres 14 and the app. The container
rebuilds the schema, seeds, generates the demo month, publishes the matching
bank statement and serves the built client on port 4400, as a non-root user.
The API now serves the built client whenever one exists; production still
requires it. A CI job builds the stack, waits for readiness and checks that a
demo account sees the 70 invoices.

Consequences: the Docker demo runs in development mode on plain HTTP, with the
demo passwords and the owner connection; it is a showcase, not a deployment.
Production keeps its own checks.

## ADR-077 A new supplier bank account is proposed, verified by call-back and approved by three people

Supersedes the sentence of ADR-052 that master data has no write API and a
verified account is added outside the application. Extends ADR-013, ADR-033
and ADR-068.

Context: ADR-052 stops an invoice whose IBAN is not a trusted account of its
supplier, and no reviewer may override that. The way on, verifying the account
and adding it to master data, happened outside the application, so the
control that mattered most, who confirmed a new account and how, left no
record here. An IBAN printed on an invoice is exactly what a fraudster
controls, so it must never be the source of trusted data.

Decision:
- **Three people.** A change is proposed (AP clerk or finance), verified
  (finance or CFO) and approved (finance or CFO). The proposer cannot verify,
  approve or reject; under the three-person policy the verifier cannot
  approve. The number of people is `POLICY_BANK_CHANGE_DISTINCT_ACTORS`,
  default 3, stored on each change so the rule a change is judged by is the
  one in force when it was proposed. Any other value stops the process: a
  two-person mode is designed for (the row and the rule take 2) but not
  enabled. Administration reads and takes no step; running the system is not
  a business role. It may ask for the revalidation retry below, through
  `invoice:reprocess`, which it already holds for any invoice in review: a
  technical re-run of the checks, not a decision about the account, and it
  ends at a signer like any other. The rules are enforced in the domain, as constraints in
  the database and, for what to offer, on the screen.
- **Call-back trust model.** Verification is one method only: a call-back on
  `suppliers.callback_phone`, the number already on file. The server copies
  that number into the evidence; a number in the request is never read. The
  verifier records the role spoken to, the time, and the IBAN the supplier
  reads back, which must equal the proposal to confirm; otherwise the call is
  recorded as not confirmed and the change is rejected. The call-back number
  itself has no write path in the application.
- **Immutable proposal and evidence.** A proposal snapshots the supplier's
  trusted IBANs and the policy under a SHA-256 hash; the verification stores
  the hash it confirmed. Approval recomputes the hash from the stored columns,
  compares it with both, and checks that the trusted accounts are still the
  ones proposed against (`MASTER_DATA_CHANGED`) and that the supplier is still
  active. A correction is a withdrawal and a new proposal; nothing is edited.
  The app's database role may update only a change's state and decision
  columns, never the proposal, and may only insert verifications, events,
  revalidation links and bank accounts; a production start checks all of it.
- **Add, not replace.** Approval adds the account as ACTIVE, naming the
  change that added it. The supplier's previous accounts stay trusted:
  retiring an account would strand invoices already approved to it, since the
  payment re-checks the account (ADR-052), and is a later feature. Until
  then, both accounts can be paid.
- **A shared IBAN is a warning, not a constraint.** IBANs are unique per
  supplier only. Factoring and group treasury legitimately put several
  suppliers on one account, so the database does not forbid it. A proposal
  records which other suppliers trust the IBAN, the screen shows it, and the
  approval is refused (`SHARED_IBAN_NOT_ACKNOWLEDGED`) until the approver
  explicitly acknowledges it; the acknowledgement is in the approval's
  evidence.
- **Revalidation after the commit.** The approval commits the master-data
  change first. Then each invoice of that supplier which carries the new
  IBAN, is in review, and whose latest run failed `supplier_iban_match` is
  validated again, as the system, citing the change. Each invoice is its own
  transaction, which writes the new run, the state change, its audit events
  and its link to the change together: a crash leaves either all of it or
  none. A new run keeps the old ones; every check runs again, so other
  failures stay; and ADR-020 sends a former exception to a signer, never to
  approved, whatever its amount. Invoices with an open question are reported
  and left alone; decided ones are skipped.
- **Retry and idempotency.** Revalidation can be asked for again from the
  change. The link table's key (change, invoice) and the lock on the invoice
  mean a retry, or two at once, never runs an invoice twice. The change is
  marked complete once nothing is left waiting or failed. Repeating a step one
  has already taken returns the change unchanged; another person's attempt at
  a decided step is refused (`CHANGE_STATE_CONFLICT`). One open change per
  supplier is a unique index.
- **Information received stays what it was.** It returns an invoice from
  INFO_REQUESTED to review and validates nothing; revalidation is its own,
  explicit step. `docs/ARCHITECTURE.md` said otherwise and is corrected.

Consequences:
- **Residual human risk.** The system cannot prove that a call took place, or
  that the person reached was entitled to confirm. The read-back, the number
  on file, three people and the trail make a careless or colluding
  confirmation harder and visible afterwards, not impossible.
- **Out of scope, and why it matters.** Retiring an account, onboarding a
  supplier, changing the call-back number, other verification methods,
  attachments, a payment hold while a change is open, and the two-person mode
  are later work. Retirement is the one that changes risk: until it exists, a
  supplier's old account stays payable after a new one is approved.
- The CFO can read bank-account changes, including IBANs, to decide them,
  although `master-data:read` stays with the clerk, finance and
  administration (ADR-064).
- An upgraded installation has no call-back numbers until they are entered in
  the database; verification is refused (`NO_CALLBACK_NUMBER`) until then.

## ADR-078 Official validation by a pinned KoSIT validator; its verdict is evidence

Extends ADR-003 and ADR-052. Keeps ADR-008: the check reports the
validator's assessment, it claims no compliance.

Context: the system checked only the profile an invoice declares and the
structure it needs, so "is this a valid XRechnung" had no authoritative
answer. The spike of 30 September showed the KoSIT validator 1.6.3 with the
XRechnung configuration of 2026-08-31 (XRechnung 3.0.2) running on the Java 17
already on the machine; as a daemon it starts in seconds and then answers in
10-40 ms, where a JVM per document takes about 5 s.

Decision:
- **Execution.** One long-running KoSIT daemon, called over HTTP with the
  original bytes; never a JVM per invoice. `npm run kosit` starts it for
  development and CI on 127.0.0.1 only; a deployment points `KOSIT_URL` at an
  internal address. The daemon has no authentication, so it is never exposed.
  `server/integrations/kosit.js` is transport only: status 200 accepted, 406
  rejected, 422 unprocessable, any other status an error, no answer within
  `KOSIT_TIMEOUT_MS` (default 10 s, at most 20 s) a timeout, no connection
  unavailable.
- **Pinned versions.** `server/integrations/kosit-pins.js` names the
  validator jar and the configuration archive by version, URL and SHA-256.
  `npm run kosit:fetch` refuses other bytes; `npm run kosit` refuses to start
  unverified ones. Every report must name the pinned engine, and its matched
  scenario the pinned rule sets (XRechnung schematron 2.6.0 for 3.0.2,
  EN 16931 UBL 1.3.16); otherwise the answer is not trusted. Upgrading is a
  change to that file, a re-run of the fixtures, the real-validator tests and
  the demo, and an ADR; a daemon upgraded without it fails closed.
- **Place in the pipeline.** After the XML safety gate and the parser, before
  the business checks. Only a document the parser could read is sent;
  unsafe or unreadable input never is. The answer is one technical check,
  `official_validation`. FAILED is a technical failure: the invoice goes to
  review with `TECHNICAL_VALIDATION_FAILED`, and the business checks do not
  run for that run.
- **Fail closed.** Only a readable report that agrees with the HTTP status,
  comes from the pinned validator and configuration, and names this
  document's SHA-256 is a verdict. Accepted is PASSED. Rejected, a timeout, an
  unavailable validator, a 422, any other status, and any answer that is not
  a trustworthy report are FAILED. Outside production, with no `KOSIT_URL`,
  the check is SKIPPED and says the document was not validated officially. A
  production start without `KOSIT_URL` is refused, and code that builds its
  dependencies without a validator fails closed in production.
- **The verdict is immutable evidence.** `official_validation` joins the
  checks no reviewer can override (ADR-052's list). Nothing turns FAILED into
  PASSED, and neither the check nor its record is ever updated. This phase
  does not permit processing a rejected invoice by hand: the way on is a
  corrected document from the supplier (request information, or reject) or,
  when there was no verdict, a retry. If manual processing is permitted
  later, it is a separate operational disposition such as
  `ACCEPT_FOR_MANUAL_PROCESSING`, with actor, reason and audit evidence, that
  changes how the document is handled and never rewrites the verdict; unsafe
  or unreadable input stays non-overridable either way.
- **Evidence.** `official_validations` holds one row per run that asked the
  validator or had to: outcome, verdict, HTTP status, validator and
  configuration version, scenario, the document's hash and the one the
  report names, normalised messages (step, level, rule code, text), the error
  when there was no verdict, the duration, and the raw report with its
  SHA-256. The app's database role may only insert it, and a production start
  checks that (ADR-068). The application reads the normalised columns; the
  invoice detail carries the latest record without the raw report. The
  report's line numbers stay in the raw report only: the daemon re-reads the
  document, so they do not point into the stored original.
- **Retry.** A single invoice is validated again by reprocessing it, as a new
  run beside the old one. After an outage, `POST
  /api/invoices/official-validation/retry` asks the daemon's health first and
  does nothing while it is down; otherwise it takes every invoice in review
  whose latest run got no verdict, each under its lock and re-checked there,
  so a replayed or concurrent retry runs nothing twice. Invoices waiting for a
  person's answer are left alone.
- **Tests and CI.** Unit and pipeline tests use a stand-in whose answers are
  real reports re-addressed to the document. `kosit-real.test.js` runs the
  fixtures, the intake path and the whole demo month against the real daemon;
  it skips without `KOSIT_TEST_URL` and fails instead when
  `KOSIT_TEST_REQUIRED=true`. CI installs Java 17, fetches and caches the
  pinned artifacts, starts the daemon and runs the suite with both set. The
  Docker demo runs in development mode without a validator, so there the
  check is SKIPPED.

Consequences:
- An invoice that arrives while the validator is down goes to review, and
  having been an exception it needs a signature even after a clean retry
  (ADR-020).
- Every invoice has one more check in its evidence.
- The call runs inside the invoice's transaction and holds its row lock for
  10-40 ms normally, bounded by the timeout.
- Not built: CII and ZUGFeRD (the configuration could validate CII, but the
  parser cannot read it, so it is never sent); the validator in the readiness
  check; a screen for the batch retry; the operational disposition.

## ADR-079 Every dashboard figure names its source

Context: ADR-027 puts the savings figure beside its assumptions, but the
dashboard did not say which figures come from the synthetic demo data and
which from assumptions, nor that no customer has measured anything. The only
hint of synthetic data was a phrase in the client's own lead sentence, the
savings panel was titled "Modellrechnung Entlastung", and one modelled figure,
"Bearbeitungszeit je Rechnung", read like a measurement.

Decision: `GET /api/dashboard/kpis` carries `provenance`, built in
`server/domain/kpi/provenance.js`.
- `sources` has four types, each with a German label, an explanation,
  `available` and a `period`. SYNTHETIC is computed from the demo's synthetic
  invoices: correctly, but not from a real process. ASSUMPTION is a modelled
  input (`server/config/assumptions.js`). CUSTOMER_BASELINE and PILOT_RESULT
  are `available: false` and explained as "Nicht gemessen"; `period` is null
  for all four.
- `figures` maps every block of the response, and each economics figure, to
  the types it rests on. The operational blocks rest on SYNTHETIC, the savings
  inputs on ASSUMPTION, and time saved, cost saved and minutes per invoice on
  both.
- Tests hold the rules: no figure cites a source that is not available, and
  a figure added to the response without a source fails the suite.
- The client renders labels from the codes (ADR-034). A legend of the four
  types sits under the title, with "Nicht gemessen" beside baseline and pilot.
  Each figure or panel carries its source tag, amber when an assumption is
  involved. The savings panel is "Modelliertes Einsparpotenzial" and its
  outputs are "modelliert"; baseline and pilot get a row each saying
  "Nicht gemessen".
- No formula and no value changed.

Extension: when a baseline or a pilot result exists, its source becomes
available with its period, and the figures that use it name it instead of
ASSUMPTION. The values would come from the append-only measurements described
in `docs/FINANCE_OPS_2_PLAN.md` section E.

Consequences:
- The operational figures are declared SYNTHETIC as a constant, because this
  proof of concept holds synthetic data only. A deployment on real invoices
  must change that declaration before its figures are read as results.
- One source per type.
- Not built: baseline entry, pilot ingestion, the plan's TARGET type, and the
  Baseline | Pilot | Target table.

## ADR-080 An AI model may explain why an invoice stopped; it never decides

Context: the system already knows why an invoice stopped, as structured
checks with expected and found values. A reviewer still has to turn several
of them into one picture, and exceptions are the most expensive step (25
minutes against 6 in the assumptions). ADR-006 kept AI out of the XRechnung
path; this amends it by placing AI beside the path, never in it.

Decision: a reviewer can ask for an explanation of an invoice in
`REVIEW_REQUIRED` with at least one failed check. The model restates evidence
the deterministic system produced; nothing reads its answer.
- **Input** (`domain/ai/explanation-input.js`): the latest run's failed checks
  and warnings with expected, found and reason; other checks by code only;
  the invoice's kind, state, review reason and run; and the next steps that
  never move an invoice on (`verify_bank_account`, `confirm_duplicate`,
  `request_info`, `reject`). IBANs are masked to their first and last four
  characters; supplier, buyer and company names and e-mail addresses are
  removed; the checks about which supplier it is (`supplier_known`,
  `po_supplier_match`) are sent as the relationship they establish ("keine
  eindeutige Zuordnung", "Bestellung eines anderen Lieferanten"), without any
  supplier number, name or VAT id; text is cleaned and cut to 240 characters.
  The evidence on screen and in the database keeps them. Never sent: the
  document, file name, path or hash, full IBANs, names, addresses, contacts,
  call-back numbers, bank-account changes, the KoSIT report, comments, users,
  payment or statement data, earlier runs.
- **Output**, forced through one tool: summary (200 characters), explanation
  (700), the exact failed checks, the checks cited, an offered next step or
  none, the language. The next step is shown in the words of the button it
  names, from our dictionaries, never the model's.
- **Verification** (`domain/ai/grounding.js`), before anything is shown: the
  schema and language; exactly the failed checks; only known checks cited; an
  offered step; every date, number and identifier in the text present in the
  evidence, in German or English notation; no link, e-mail address or phone
  number; no phrase that approves, releases or pays, or calls the invoice
  fine, unless a negation in the same clause states the block ("kann nicht
  freigegeben werden", "do not pay it"; a negation in an earlier clause does
  not count); no claim that money moved unless the evidence says so, where
  "bezahlt werden" or "be paid" says what may happen, not what did. A refused
  answer is stored as REJECTED and never shown.
- **Provider**: `integrations/ai-explainer.js`, Anthropic, `claude-sonnet-4-6`
  by default (`AI_MODEL`), temperature 0, 800 output tokens, 20 s timeout, no
  retries, no extended thinking. Failures keep a status, error type or cause,
  never the provider's text or the key.
- **Persistence**: `ai_explanations`, insert-only for the app role, one row
  per attempt with the exact input sent. An accepted answer is served again
  for the same invoice, run, input hash, prompt version, schema version,
  provider, model and language; a new run, another model or the other
  language is a new explanation. Nothing is written to invoices, checks,
  routing, approvals, master data or the audit trail.
- **Failure**: switched off, unconfigured, unreachable, slow, malformed or
  refused, the answer is "Keine KI-Erklärung verfügbar" and nothing else
  changes. The provider is called with no database connection held.
- **Off by default** (`AI_EXPLANATIONS=true` switches it on). A production
  start with it on and no `ANTHROPIC_API_KEY` is refused.
- **Evaluation**: five scenarios in `fixtures/ai/` (IBAN mismatch, PO overrun,
  duplicate, KoSIT rejection, two failures at once), each with answers the
  verifier must accept and answers it must refuse, run in CI with a stand-in
  provider. `npm run ai:eval` runs them against the real model by hand.

Why here and not in approval, routing or payment: an explanation can be
checked against the facts it was given, and a wrong one costs a reviewer a
moment, with the evidence beside it. A decision to approve, route or pay has
nothing to check it against but the rules the system already applies
deterministically, and a wrong one moves money. So the model explains, and
nothing it says is an input to any rule, state or payment. A test fails if
workflow, routing, approval, master-data or payment code imports it.

Consequences:
- Only as good as its verification. Facts, form and the set of failures are
  checked; whether free text contradicts the evidence in some other way is
  caught only by the phrase list, which is best effort. The checks stay on
  screen above the explanation for that reason.
- The explanation is stored in the reader's language, the one exception to
  German-only stored text.
- Masked evidence leaves the system for an external provider. Before real
  invoice data, a deployment needs a provider and data-processing review, a
  processing agreement and a check of the provider's retention; nothing here
  claims GDPR compliance.
- Not built: automatic generation, feedback on explanations, other providers,
  explanations outside review. The plan's pilot decides whether it stays: if
  exceptions take no less time with it, it is removed.
- Status, 2026-09-30: The AI exception-explanation capability is implemented
  and structurally tested with deterministic grounding tests and a stand-in
  provider. It is disabled by default and does not participate in invoice
  routing, approval, master-data changes, payment or reconciliation.
  Real-provider quality and acceptance-rate evaluation against the configured
  Anthropic model is still pending because external paid API usage is not
  enabled for this project. `npm run ai:eval` stays for when it is.

## ADR-081 A line that cannot be recomputed stops the invoice

Supersedes the first supporting decision of ADR-048. Corrective hardening
during the feature freeze; no behaviour is added.

Context: ADR-048 reported a line it could not recompute as SKIPPED, so that
a mixture of verified and unverifiable lines was not shown as PASSED. That was
right about the report and wrong about the consequence. Routing stops only on
FAILED checks, and a SKIPPED check is severity INFO. A missing quantity or unit
price is not a numeric error either: `amounts_numeric` asks whether a stated
value is a number, not whether it is stated. So an invoice whose line had no
quantity passed every check that ran, and under the auto-approve limit it was
APPROVED without a person.

This held only where no validator is configured (development, the Docker demo,
the tests). With a validator required, the pinned KoSIT rules reject such a
document first (BR-22, BR-26, PEPPOL-EN16931-R121, checked against 1.6.3 with
XRechnung 3.0.2), and an unreachable validator fails closed (ADR-078). The
protection was real in production, but it came from the external rule set,
not from this application's own rule.

Decision: a line whose quantity, unit price, base quantity, declared amount or
line allowances cannot be read into a product is an issue of
`line_amounts_consistent`, FAILED with severity HIGH, stated as "Position n:
Menge oder Einzelpreis nicht lesbar". It stays overridable, like a
miscalculated line: a reviewer can read the order and judge it.

Not changed: SKIPPED keeps its meaning everywhere else. A check that does not
apply (no purchase order, an unknown supplier) is not evidence against the
invoice, and making every SKIPPED block routing would stop invoices for
questions that were never asked.

Consequences: no invoice of the demo month changes; none of them has a line
that cannot be recomputed. The English dictionary loses the SKIPPED text of
this check, which can no longer occur.
