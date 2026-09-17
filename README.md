# Finance Operations Automation (DE) - E-Invoice to Payment

Proof of concept for German SMEs: an XRechnung arrives, the system validates it
technically and against the company's own master data, routes it
deterministically, gets the right people to approve it, hands it to accounting,
tracks payment and reconciles it. Every state change is audited. Uncertain
cases go to humans; nothing is approved by default.

Demo company: Nordwerk GmbH (fictional). All data is synthetic.

Status: Phase 1 (walking skeleton) in progress. See `docs/IMPLEMENTATION_PLAN.md`.

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

- No authentication. Actors are seeded users passed as `X-Actor-Id`; roles and
  segregation of duties are enforced server-side on that identity.
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
