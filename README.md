# Finance Operations Automation (DE) - E-Invoice to Payment

[![tests](https://github.com/shotatsertsvadze/finance-ops-automation-de/actions/workflows/ci.yml/badge.svg)](https://github.com/shotatsertsvadze/finance-ops-automation-de/actions/workflows/ci.yml)

Proof of concept for German SMEs: an XRechnung arrives, the system validates it
technically and against the company's own master data, routes it
deterministically, gets the right people to approve it, hands it to accounting,
tracks payment and reconciles it. Every state change is audited. Uncertain
cases go to humans; nothing is approved by default.

Demo company: Nordwerk GmbH (fictional). All data is synthetic.

Status: Phases 1-3 built; control review completed and remediated. See
`docs/IMPLEMENTATION_PLAN.md` and `docs/PHASE_0_INDEPENDENT_REVIEW.md`.

![The operational metrics view, showing straight-through processing rate, exception reasons, cycle times, risk signals and the work queue](docs/screenshots/dashboard.png)

The metrics view after a demo run of 70 synthetic invoices. Every figure is
derived from the invoices and their check trail rather than counted separately.
The interface is German by default and switches to English.

## What is worth looking at

- **One way to change state.** `invoices.state` moves only through `transition()`
  in `server/domain/workflow/transitions.js`, which writes the audit event in the
  same transaction. No route, script or SQL trigger writes it directly, and the
  legal transitions are a declared table rather than scattered conditions.
- **Checks produce evidence, not verdicts.** Every check returns `check, status,
  severity, expected, actual, reason, recommended_action`, so a reviewer is shown
  what was expected and what the document actually carried, with the differing
  characters marked for things like a changed IBAN.
- **Fail closed.** Missing, malformed or uncertain data routes to review, never to
  approval. A few checks cannot be overridden at all: a reviewer is there to judge
  business facts, not to supply arithmetic the document never did.
- **Amounts are recomputed, not read.** Discounts, surcharges and prepayments are
  computed along EN 16931's calculation chain, and every line is recomputed from
  its quantity and unit price - exactly, not in floating point, because the
  tolerance is one cent (ADR-047, ADR-048).
- **Nothing is inferred.** Routing is a pure function of the check results and the
  amount policy. No model decides anything, and none sits anywhere near the
  payment path.

![An invoice stopped for review: the decision panel, what is blocking, and the two failed checks with their expected and found values](docs/screenshots/invoice.png)

An invoice the system stopped, because the purchase order named on it belongs
to a different supplier. The reviewer is shown each failed check with what was
expected and what the document actually carried, and decides from there.

The reasoning behind each decision is in `docs/DECISIONS.md`, every behaviour has
a row in `docs/TEST_MATRIX.md`, and what the system does *not* do is listed under
"Known limits" below rather than left to be discovered.

## Setup

Requires Node.js 22+ and PostgreSQL 14+.

```bash
npm install
cp .env.example .env        # set DATABASE_URL and TEST_DATABASE_URL
createdb finops             # or any database named in DATABASE_URL
npm run db:migrate
npm run db:seed
npm run dev                 # API on http://localhost:4400, UI on http://localhost:5400
```

Tests:

```bash
createdb finops_test
npm test
```

## Try it

Upload a fixture from `fixtures/xrechnung/` in the UI, or:

```bash
curl -F file=@fixtures/xrechnung/A_clean_1240.xml http://localhost:4400/api/invoices
```

| Fixture | Scenario | Expected |
|---|---|---|
| A | clean, 1 240 EUR | waits for one manager approval |
| B | IBAN differs from supplier master data | review, HIGH |
| C | invoice 8 500 EUR, PO remaining 5 000 EUR | review, HIGH |
| D | same number as A, different file | review, duplicate suspicion |
| E | clean, 30 000 EUR | manager + finance + CFO |
| F | malformed | review, technical failure |
| G | clean, 380 EUR | approved automatically |
| H | IBAN differs, 380 EUR | review, HIGH; a small amount is no reason to skip the check |
| I | 3 % discount: 450 EUR of lines, 30 EUR off, 499.80 EUR due | approved automatically; without the discount 535.50 EUR would need a manager |
| J | credit note for 214.20 EUR, crediting RE-2026-4471 | approved, booked as a negative record, closed as credited, never paid |

## Documentation

- `docs/PRODUCT.md` - what and for whom
- `docs/ARCHITECTURE.md` - stack, data model, state machine, API, adapters
- `docs/DECISIONS.md` - decision records, assumptions
- `docs/IST_PROCESS.md`, `docs/SOLL_PROCESS.md` - current vs. target process
- `docs/BUSINESS_CASE.md` - demo assumptions
- `docs/TEST_MATRIX.md` - what is verified and how
- `docs/REFERENCE_AUDIT.md` - audit of the two reference repositories

## Known limits

These are reproduced and accepted, not hidden. Full list with reproductions in
`docs/TEST_MATRIX.md` under "Known limitations".

- **A purchase order is a single balance, not a line-by-line receipt.**
  Capacity is committed, released and given back by a credit note, but partial
  deliveries and order closure are not modelled.
- **A credit note is applied to the next payment, not to the invoice it
  names.** It runs the same checks, reduces the order, is never paid, and its
  open balance offsets the next payment to that supplier - oldest credit first.
  The reference to the invoice being credited is read and shown, but does not
  steer which payment it reduces.
- **Reconciliation matches one statement line to one invoice.** Part payments
  and collective payments covering several invoices are not modelled; each
  becomes an exception for a person to resolve.
- **Authentication is demo-grade.** Real password login, sessions and a role
  matrix, but no password reset, no second factor and no SSO. Accounts are
  seeded with a shared, documented password.
- Only XRechnung in UBL syntax is parsed. CII and ZUGFeRD are adapter boundaries.
- No official EN 16931 / XRechnung validator is wired in. The system checks the
  declared profile and the structure it needs; it does not certify compliance.
- Accounting, payment and bank data are simulated.
- Approval thresholds and savings figures are demo assumptions.

## When an intake does not finish

Receiving a file and processing it are separate steps, so an arrival is
recorded even if the run that reads it fails. Sending the same file again
resumes that invoice rather than answering "duplicate"; a file sent again after
processing finished is still a duplicate. See ADR-044.

## Handing figures to accounting

`GET /api/accounting/export` returns the booking records as CSV for a
bookkeeping import, with values exactly as they arrived. Add
`?profile=spreadsheet` for a copy in which cells a spreadsheet would execute
are made inert; the two download under different names. See ADR-045.

## Refusals

A refusal from the server carries a stable code and the parameters its sentence
uses, alongside the German sentence itself. The interface renders it in the
chosen language and falls back to the server's wording when it does not know a
code, so an error is never swallowed by a missing translation. See ADR-042.

## Stored originals

The uploaded file is kept byte for byte and served back as source text, never
as a type a browser will render. A document refused as an invoice can still be
a working web page, and rendering it on the API's own origin would run it with
the session of whoever opened the link. See ADR-035.

## Display language

The interface runs in German or English; the switch is at the bottom of the
sidebar and the choice is remembered per browser. German is the product's
language and the one the server generates and stores, so supplier names,
document text and comments people typed stay in German either way. See
ADR-034.

## Signing in

The demo accounts share one password, `nordwerk-demo`, set by `npm run db:seed`
and overridable with `DEMO_PASSWORD`. These are synthetic accounts in a local
demo.

| Account | Role | May |
|---|---|---|
| anna.berger@nordwerk.example | Kreditorenbuchhaltung | upload, review decisions |
| tim.kessler@nordwerk.example | Kostenstellenleitung | upload, approval steps |
| lea.sommer@nordwerk.example | Kostenstellenleitung | upload, approval steps |
| jonas.weber@nordwerk.example | Finanzen | review, approval, the money path |
| mira.hoffmann@nordwerk.example | Finanzen | as above |
| sabine.vogt@nordwerk.example | CFO | upload, approval steps |

Passwords are hashed with scrypt and a per-user salt. The session is a random
token in an HttpOnly, SameSite=Strict cookie; only its hash is stored, so a
database dump yields no usable session. Signing out revokes it server-side.
State-changing requests carry a CSRF token. Repeated failed logins lock an
account temporarily; an expired lock starts the count again. A wrong password
and an unknown address get the same answer and cost the same work, so neither
the wording nor the response time says whether the account exists.

Finance is deliberately the one role that may both review and approve. That is
what makes the four-eyes rule after a review meaningful rather than theoretical.

## Working an invoice

Every action is authorised server-side against the signed-in session. The UI
hides what your role may not do; the server refuses it either way.

An invoice in review can be sent to approval, rejected, put on hold with a
query, or confirmed as a duplicate. Rejection, query and duplicate need a
reason. Sending an exception to approval never approves it: it always produces
at least one approval step, and the person who released it cannot take that
step. Approval steps run in order, each needs the exact role, and no one may
decide two steps of the same invoice.

## Money path and reconciliation

An approved invoice is handed to accounting as a booking record, paid through
a simulated provider, and matched against a synthetic bank statement. Under
"Zahlungen und Abgleich" you can import the demo statement from
`fixtures/bank/` and run the match.

A payment is only matched to an invoice when its reference names that invoice
and the amount agrees. A payment whose amount happens to equal an invoice is
never matched on that basis alone: it becomes an exception for a person to
resolve. The demo statement contains one clean match, one amount-only payment,
one part payment and one payment that matches nothing.

Booking accounts and tax keys in the export are demo assignments, not a
certified SKR mapping.

## Dashboard

```bash
npm run db:reset && npm run db:demo   # a month of synthetic invoices
```

`npm run db:demo` pushes every generated invoice through the real pipeline and
then shifts the timestamps into the past, so the cycle-time figures are
meaningful rather than sub-second. It also writes the bank statement that
answers its own payments to `client/public/demo/`, imports it and reconciles
it, so the last stage of the process has something to show. That statement is
deliberately imperfect: a short payment, a payment to the wrong account, one
with no invoice named and a few payments the bank has not reported yet. A month
of lines that all matched would demonstrate nothing.

The same seed produces the same invoices, amounts and relative timings. The
dates are not fixed: the month ends today, so regenerating on another day
shifts them and rewrites the committed statement. The data is synthetic.

Every dashboard figure is computed from the invoices and their audit events.
There is no counter to drift. The savings estimate is a scenario shown together
with the assumptions that produce it, not a measured benefit.

## Licence

MIT, see `LICENSE`. The data, the company and the figures are invented.
