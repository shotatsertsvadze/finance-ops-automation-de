# Finance Operations Automation (DE) - E-Invoice to Payment

Proof of concept for German SMEs: an XRechnung arrives, the system validates it
technically and against the company's own master data, routes it
deterministically, gets the right people to approve it, hands it to accounting,
tracks payment and reconciles it. Every state change is audited. Uncertain
cases go to humans; nothing is approved by default.

Demo company: Nordwerk GmbH (fictional). All data is synthetic.

Status: Phases 1-3 built; control review completed and remediated. See
`docs/IMPLEMENTATION_PLAN.md` and `docs/PHASE_0_INDEPENDENT_REVIEW.md`.

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

- **Cumulative purchase-order overruns are not prevented.** The PO check
  compares one invoice against the remaining amount at that moment; the amount
  is never consumed, so two invoices that each fit can together exceed it.
- **The recognised XML subset is loose.** Namespaces are stripped, and
  allowances, charges, prepayments and rounding are not modelled.
- **Decisions are not bound to a document hash or validation run**, so an
  approval records who and when, but not "of exactly this version".
- **Recovery after a partial intake is manual.** If processing fails after the
  file is received, re-uploading returns a duplicate and the original waits for
  a manual reprocess.
- No authentication. Actors are seeded users passed as `X-Actor-Id`; roles and
  segregation of duties are enforced server-side on that identity, which
  demonstrates identity-based rules rather than authenticated ones.
- Only XRechnung in UBL syntax is parsed. CII and ZUGFeRD are adapter boundaries.
- No official EN 16931 / XRechnung validator is wired in. The system checks the
  declared profile and the structure it needs; it does not certify compliance.
- Accounting, payment and bank data are simulated.
- Approval thresholds and savings figures are demo assumptions.

## Working an invoice

Pick who you are acting as in the sidebar. The server resolves that identity on
every request and enforces the rules; the picker is not a login.

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
meaningful rather than sub-second. The data is synthetic.

Every dashboard figure is computed from the invoices and their audit events.
There is no counter to drift. The savings estimate is a scenario shown together
with the assumptions that produce it, not a measured benefit.
