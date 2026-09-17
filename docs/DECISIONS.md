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
