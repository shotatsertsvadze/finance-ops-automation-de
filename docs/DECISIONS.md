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
