# Reference Audit

Audit of the two reference repositories before designing this project. Both were
cloned from GitHub on 2026-09-17 (shallow clones, `main`):

| Repository | Commit inspected | Type |
|---|---|---|
| `kichampMPi/dms-application` | `da4c116` | Team DMS, Next.js 16 + Supabase, Python OCR worker |
| `shotatsertsvadze/feldmark-bank-ag` | `6943ee6` | Bank intake workflow, Express + React + Postgres + n8n |

The audit reads code, schemas, tests, agent instructions and docs. It does not
run either application. Statements about runtime behaviour are marked as
"from code" where they were not verified live.

---

## 1. dms-application

### 1.1 What it is

A document management system built by a bootcamp team: upload, versioning,
tags, full-text search, folder tree, trash, share links, an OCR worker
(Python, `ocrmypdf`), and an "automation" area that wires n8n webhooks and an
LLM gateway. Next.js 16 App Router, TypeScript strict, Tailwind v4, Supabase
(Postgres, Auth, Storage) with Row-Level Security, all tables in a dedicated
`dms` schema.

### 1.2 Architecture patterns worth reusing

- **Dedicated Postgres schema per application** (`dms`, enforced by a script and CI).
  Makes the app portable between a local Postgres and a shared Supabase project.
  Adopted here as schema `finops`.
- **Files separated from metadata.** Postgres holds path, size, checksum; the file
  lives in a bucket. Adopted (local disk in MVP, bucket-ready path convention).
- **Immutable versions.** A new upload never overwrites. Adopted for the original
  invoice file: it is written once and never modified.
- **Feature folders** (`src/features/<area>`) with thin pages. Adopted in spirit:
  `server/domain/<area>` and `client/src/features/<area>`.
- **Migrations are append-only**; never edit an existing migration. Adopted.
- **Machine endpoints fail closed** (`src/proxy.ts`): if the automation secret is
  not configured the routes answer 503, not 200. Constant-time comparison of the
  secret. Worth copying when an n8n or webhook endpoint is added.
- **Deterministic suggestion logic before AI**: tag and document-type suggestions
  are word-boundary pattern matches with a `reason`, and a tie deliberately
  produces *no* suggestion (`suggest-document-type.ts`). Same philosophy as the
  routing engine here: deterministic rules, structured reasons, no guess.

### 1.3 Reusable code

- `matchesWholeWord()` (Umlaut-aware word-boundary matching) is small and
  generic. Not needed for XRechnung, which is structured. Not copied.
- SHA-256 duplicate check on `document_versions.checksum_sha256` before upload.
  The idea is reused; the code is trivial (`crypto.createHash`).
- `secretsMatch()` constant-time comparison. Will be reused verbatim when a
  webhook endpoint is added (Phase 3).

### 1.4 Data-model ideas

- `audit_log(team_id, user_id, action, entity, entity_id, details jsonb)`. Too
  generic for a workflow: no `from_state`/`to_state`, no `actor_type`
  (system vs. human), no reason. Extended here into `audit_events` with all of
  those.
- `document_status` enum `inbox | reviewed | archived`. Too coarse for invoice
  processing; replaced by the state machine in `docs/ARCHITECTURE.md`.
- `correspondents` with `match_pattern` and a per-team ASN counter under a lock
  (`next_asn`). The counter pattern is a clean way to issue gap-free numbers;
  not needed in the MVP.

### 1.5 Document ingestion patterns

- Two intake channels (watched folder, browser upload to a `_inbox/` bucket path)
  feeding one sequential pipeline (`worker/dms_worker/pipeline.py`). The pipeline
  is a single function with clear stages and an `Ergebnis` result object
  (`ok | dublette | fehler`). Same shape used here for `intake.js`.
- **Dead-letter handling**: a failing file moves to `fehler/` with a `.log`
  sidecar *and* is reported to the database (`store.log_problem`) so nothing
  fails silently. Adopted: technical failures become a visible
  `REVIEW_REQUIRED` invoice, never a lost file.
- `warte_bis_vollstaendig()` (wait until scanner finished writing). Not relevant
  for HTTP upload.

### 1.6 Workflow / approval patterns

None. The DMS has no approval workflow; `status` is set by whoever edits a
document. Nothing to reuse.

### 1.7 RBAC / permission ideas

- Teams + `team_members(role admin|editor|viewer)` and RLS policies through
  `is_team_member(team, min_role)`. Clean and database-enforced.
- **But** the application currently runs with auth disabled
  (`src/lib/auth-mode.ts`, `DMS_AUTH_DISABLED` defaults to true), machine
  routes use the service-role client that bypasses RLS, and `AGENTS.md` states
  that "route guards, role checks, and RLS are deliberately not gating
  anything". The RLS design is good; the operational state is "no
  authorization".
- Lesson for this project: do not build an RLS model that is then switched off.
  Enforce roles in the domain layer where the decision is made
  (approval step requires role X, actor must differ from previous approver) and
  document the identity boundary honestly.

### 1.8 Audit-trail implementation

`audit_log` is written by whoever remembers to write it (`storeDocument()` does;
the worker does; the server actions for metadata edits do). There is no single
choke point. The result is the same class of gap Feldmark found in itself
("regulärer Freigabefall blieb unprotokolliert"). Here every state change goes
through one `transition()` function that writes the audit event in the same
transaction; there is no other way to change `invoices.state`.

### 1.9 Validation approaches

- Upload: size limit, empty-file check, deliberately *no* MIME check ("das DMS
  nimmt jeden Dateityp an"). Fine for a DMS, wrong for an e-invoice intake: here
  only XML is accepted, the XML parser has DTD/entity processing disabled and
  any `<!DOCTYPE` is rejected.
- `ocr.ts`: missing API key produces an error, not silent empty text. Same
  principle applied to every adapter here.

### 1.10 Test strategy

- Node built-in test runner (`node --test`) for pure TypeScript functions; pytest
  for the worker with a `DryRunStore` fake and OCR tests skipped when
  `ocrmypdf` is absent. Good: dependency injection at the storage boundary, no
  test framework dependency.
- CI runs lint, typecheck, build and the boundary script, but **does not run the
  tests** (`ci.yml`). Tests exist but are not gating.
- Adopted: `node --test`, storage-independent domain tests, plus real-database
  tests for the invariants (uniqueness, transitions), all run by one `npm test`.

### 1.11 UX patterns

German UI, English identifiers; design tokens in `globals.css`; shared
components (`EmptyState`, `Notice`, `PageHeader`). Server components by default.
The UI is a document library, not an operations console; nothing specific to
reuse beyond the language convention.

### 1.12 Anti-patterns and technical debt NOT to carry over

1. **A real API key is committed in `.env.example`** (`MISTRAL_API_KEY=U8hb…`,
   present since the first commit `da4c116`). This violates the project's own
   AGENTS.md. Here: `.env.example` contains only placeholders, and `.gitignore`
   excludes every `.env*` except `.env.example`.
2. **Auth disabled by default** while RLS policies exist, giving a false sense
   of protection. Here: no RLS theatre; roles enforced in the domain layer; the
   identity boundary is documented as an MVP limitation.
3. **Multi-agent process overhead** (`agent-guard.mjs`, `pruefe-grenzen.mjs`,
   owners JSON, mandatory `git switch main` loops, hooks that block writes). Built
   for a team of parallel agents on a shared `main`. This is a single-owner
   portfolio project; that machinery would be pure ceremony.
4. **Two parallel processing paths** (Python worker with `ocrmypdf` and a
   TypeScript fallback via Mistral OCR) that must stay behaviourally identical
   (same checksum, same storage path). Two implementations of one rule is the
   kind of duplicated business state the brief forbids.
5. **Workflow JSON snapshots stored in the app** (`n8n-workflows/*.stub.json`,
   `workflow_versions` table) create a second source of truth for behaviour.
6. **Next.js 16 App Router** adds server components, server actions, proxies and
   a build step that a small Express API does not need. Higher complexity for no
   MVP benefit.
7. `audit_log` without state transitions or actor type (see 1.8).

---

## 2. feldmark-bank-ag

### 2.1 What it is

A fictional bank's intake system for account garnishments and official
information requests: upload of a letter, Mistral OCR + one LLM
classification/extraction call, a deterministic `bestimmeRouting()` that sends
the case either to automatic case creation or a human review queue
(Sichtprüfung), server-side four-eyes gates on release actions, deterministic
generation of the legally required declaration text, and daily n8n sweeps for
deadline reminders/escalation with an idempotency marker. Express 4 + React 18
(Vite) + `pg` against Supabase Postgres (schema `feldmark`).

### 2.2 Architecture patterns worth reusing

- **Fail-closed routing as a pure function** (`bestimmeRouting`): every branch
  that cannot prove safety pushes the path to review and appends a human-
  readable reason; a missing confidence counts as zero, never as pass. Adopted
  as the core of `server/domain/routing/decide.js`, with structured check
  results instead of strings.
- **Source metadata never comes from the model**: `zustelldatum` is taken from
  upload metadata, never parsed from the document. Adopted: `received_at`,
  `source_channel`, `file_sha256` are intake facts; nothing extracted from the
  invoice can overwrite them.
- **Server-side gates that return 409 without touching state**
  (`/erklaerung/freigeben` checks the four-eyes rule before calling any DB
  function). Adopted for all approval transitions.
- **Release and dispatch are separate steps** ("freigegeben" is not
  "versendet"). Adopted: `APPROVED` → `ACCOUNTING_READY` → `PAYMENT_PENDING` →
  `PAID` are distinct, each with its own audit event.
- **Dead-letter path into the same review queue** (`legeVerarbeitungsfehlerAn`):
  a hard failure in OCR or classification lands in the human queue instead of an
  orphaned file. Adopted.
- **Deterministic text generation, no LLM** for anything legally binding
  (`pkonto_drittschuldner.js`). Here: the accounting export record is produced
  deterministically; no AI in the money path.
- **Single database as the only shared state between app and n8n**; n8n reads
  and writes the same tables, no mirror. Adopted as the rule for any future n8n
  use.
- **Idempotency marker for scheduled jobs** (`erinnerungen_gesendet text[]`
  checked before every action). The pattern is right; the implementation is a
  side-channel array on the case row. Here: idempotency keys on payment and
  accounting records plus unique constraints, which the database enforces.

### 2.3 Reusable code

- `inTransaktion(fn)` (BEGIN/COMMIT/ROLLBACK helper around `pg.Pool`). Reused
  as `withTransaction()`.
- `pruefeVierAugen(previousPerson, releasingPerson)` (whitespace/case-normalised
  comparison; an unknown previous person counts as a warning, not as "different
  person"). Reused in principle: here actors are user IDs from a `users` table,
  so the comparison is exact, and an unknown actor is a 400.
- `normalisiereDeutschesDatum()`, `alsBetrag()`: defensive parsing of model
  output. Not needed for XRechnung (ISO dates, decimal strings by schema).
- The Vite + Express dev setup (`concurrently`, proxy `/api`). Reused.

### 2.4 Data-model ideas

- One `*_faelle` table per case type plus one type-agnostic review queue
  (`sichtpruefung_warteschlange`). Justified there (different deadline law per
  type); here there is one entity, the invoice, so a single `invoices` table with
  a `state` column and a review reason is simpler.
- `*_protokoll(fall_id, ereignis, fristende, rest_tage, erzeugt_am)` is both audit
  trail and KPI base. Good idea: the audit table here is designed so that
  processing-time and approval-time KPIs are computed from it.
- Extension tables (`pfaendung_erweiterung`) to avoid touching a table the n8n
  workflow selects with `SELECT *`. That is a workaround for a coupling problem;
  here n8n (if used) will query views, not tables.
- Status is a free `text` column with a `CHECK` constraint that drifted between
  the live database and the SQL file. Here: a Postgres enum in a migration file
  that is the only source of the schema.

### 2.5 Document ingestion patterns

Upload → optional HEIC conversion → OCR → classification, all in one request,
with the dead-letter branch. For XRechnung there is no OCR; the equivalent
pipeline is upload → XML safety check → parse → technical validation → business
validation → routing, and the same "everything ends in a visible state" rule.

### 2.6 Workflow / approval patterns

- Explicit reject path (`/ablehnen`) that is blocked once the irreversible step
  happened (404 after dispatch). Adopted: no transition out of `PAID`,
  `RECONCILED`, `REJECTED`, `DUPLICATE`.
- Regenerating a declaration resets a previously released status and logs it.
  Adopted as the general rule: any correction resets approvals and is audited.
- Weak spot: transitions are spread over many functions
  (`gibErklaerungFrei`, `bestaetigeVersand`, `lehneErklaerungAb`, …) each doing
  its own `UPDATE … SET status`. The 2026-08-27 review found three transitions
  that were silently unlogged. Here there is one `transition()` function and a
  transition table; a transition not in the table is rejected.

### 2.7 RBAC / permission ideas

No auth; four-eyes is name-based text comparison, documented in README
"Bewusste Grenzen". Honest, but a name field is the easiest thing to fake.
Here: a seeded `users` table with roles, actor passed as `X-Actor-Id`, server
resolves the user and checks the role. Still not authentication, and documented
as such, but the segregation-of-duties check compares identities, not free text.

### 2.8 Audit-trail implementation

`protokolliere()` writes to a per-type protocol table. Strengths: every sweep
action and every release step is an event; the frontend timeline and activity
feed read the same table. Weaknesses found by their own review: silent status
resets, events missing for regular (non-override) releases, a comma-join bug in
the n8n node writing the protocol. Root cause in all three: more than one code
path can change state. Fixed structurally here (see 2.6).

### 2.9 Validation approaches

- Confidence thresholds, plausibility flag from the model, OCR confidence
  minimum, truncation flag: each is a separate reason string. Good separation.
- Required-field check at case creation returns
  `{angelegt:false, grund:"Pflichtfeld(er) fehlen: …"}` instead of throwing.
  Adopted as the structured check-result shape
  (`check, status, severity, expected, actual, reason, recommended_action`).

### 2.10 Test strategy

- `node --test`, 27 tests. Two kinds: pure-function tests
  (`mistral.routing.test.js`, `fristlogik.test.js`) and integration tests that
  spawn the real Express server on a test port against the **real Supabase
  database** and clean up afterwards (`hitl-gates.test.js`,
  `db.audit-trail.test.js`). Tests skip when `DATABASE_URL` is missing.
- `docs/testmatrix.md` with three honest states (verified / indirect / open).
  Adopted as `docs/TEST_MATRIX.md` with four states as the brief requires.
- Deliberate trap fixtures (`muster_dateien/`, e.g. a document that contains the
  right keywords but is not a garnishment). Adopted: fixtures B, C, D, F are
  traps.
- Weak spot: integration tests run against the shared demo database. Here a
  dedicated local database (`finops_test`) is created by the test script.

### 2.11 UX patterns

Sidebar navigation; Posteingang (upload with intake metadata), Fallübersicht
with a deadline bar and last event per case, per-case timeline, cross-case
activity feed, an interactive process diagram. The "last event per case" column
and the timeline are directly relevant and reused conceptually. Stamps and
colour-coded document types (`dokumenttypen.js`) map to state badges here.

### 2.12 Anti-patterns and technical debt NOT to carry over

1. **Schema drift**: live `ALTER TABLE` on Supabase not mirrored in the SQL file
   (documented in the schema comments). Here: migrations are the only way the
   schema changes, applied by a script.
2. **n8n workflow JSON exports as stale snapshots** that are "not the source of
   truth" and were broken for weeks. Business rules (deadline logic) lived in
   n8n Code nodes with a "reference copy" in the repo that is tested but not
   executed. That is exactly the "invariants inside opaque n8n nodes" the brief
   forbids. Here: all rules in `server/domain`; n8n (if used) calls the API.
3. **Tests against the shared production/demo database.**
4. **Many status-changing functions, no transition table** (see 2.6).
5. **Text-based four-eyes** (see 2.7).
6. **Extension tables to avoid touching a table n8n reads with `SELECT *`.**
7. **A large running session log (`KONTEXT.md`) as the primary source of
   decisions**, with ~76 code comments pointing into it. Decisions belong in
   `docs/DECISIONS.md` as short numbered records.
8. Date handling via `to_char` in every query because `node-pg` parses `date`
   into a JS Date. Here: `pg` type parser configured once to return `date` and
   `numeric` as strings.

---

## 3. Comparison and stack recommendation

| Aspect | dms-application | feldmark-bank-ag | This project |
|---|---|---|---|
| Frontend | Next.js 16 App Router, TS, Tailwind | React 18 + Vite, JS | React 19 + Vite 8, JS (ESM), plain CSS tokens |
| API | Next route handlers + server actions | Express 4 | Express 5 |
| DB access | supabase-js (PostgREST), RLS | `pg` direct | `pg` direct, own schema `finops` |
| Database | Supabase cloud | Supabase cloud | local Postgres now, Supabase-compatible SQL |
| Files | Supabase Storage | local `uploads/` | local `storage/` with bucket-style path |
| Workflow engine | n8n webhooks | n8n cron sweeps | none in Phase 1-3; API-driven n8n later |
| AI | Mistral OCR + LLM | Mistral OCR + LLM | none in the XRechnung path |
| Tests | node --test + pytest, not in CI | node --test, real DB | node --test, pure + local test DB |

**Recommendation: Feldmark's stack, cleaned up.** Express + `pg` + React/Vite is
the lowest-complexity stack that the author already knows, that runs on the
local Postgres 14 present on this machine today (Docker is not running, so the
Supabase CLI is not usable locally), and whose SQL moves to Supabase unchanged
because it uses a dedicated schema. Next.js, RLS and the multi-agent control
plane from the DMS would add complexity without MVP value. n8n is deferred until
there is a scheduled or external-trigger job (bank-statement polling, due-date
reminders) that genuinely benefits from it; even then it will call the API, not
hold rules.

## 4. What is deliberately different from both

- One `transition()` choke point and a declared transition table.
- Structured check results instead of reason strings.
- Uniqueness of payable records enforced by the database, not by a pre-check.
- Approval steps as rows with required role and actor, so segregation of duties
  is a query, not a string comparison.
- Policy thresholds in one config module, overridable by environment.
- Test matrix with four states (automated / manual / inferred from code / not
  tested) maintained from the first commit.
