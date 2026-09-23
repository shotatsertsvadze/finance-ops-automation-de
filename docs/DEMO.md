# Demo walkthrough

Ten minutes, in order. For the three-minute video cut, with narration and
recording instructions, see `docs/DEMO_VIDEO.md`.

Every figure below comes from `npm run db:demo` with its default seed, which is
reproducible: the invoice numbers named here are the ones you will see.

Nothing in this system pays anyone. The bank, the accounting handoff and the
payment provider are simulated, and all data is synthetic.

## Before anyone is watching

```bash
npm install
cp .env.example .env          # set DATABASE_URL and TEST_DATABASE_URL
createdb finops
npm run db:migrate && npm run db:seed && npm run db:demo
npm run dev                   # API on :4400, UI on :5400
```

Sign in as **jonas.weber@nordwerk.example** (Finance). Finance sees the whole
path; the other accounts are for the four-eyes moment in step 5.

Open a second tab with `fixtures/xrechnung/` ready to upload.

---

## 1. The inbox — 60 seconds

70 invoices, states in the left rail: 6 in manual review, 4 awaiting approval,
28 reconciled.

> "Every one of these arrived as an XRechnung XML and walked the same path. The
> counts on the left are work, not statistics: they are what is waiting for a
> person right now."

## 2. Upload an invoice, live — 90 seconds

Upload **`B_iban_changed_2499.xml`**. It stops immediately at manual review,
reason `SUPPLIER_IBAN_MATCH`.

> "This supplier's invoice says pay a different bank account than the one in
> our master data. That is the most common invoice fraud there is, and the
> system stopped it without anyone looking."

## 3. The evidence — 2 minutes, the heart of it

On that invoice, the check trail shows **1 of 21 checks failed**, with:

```
EXPECTED   DE02 1203 0000 0000 2020 51
FOUND      DE02 3002 0900 0106 5310 65
```

The differing characters are marked.

> "It does not say 'suspicious'. It says what it expected, what the document
> carried, and which characters differ. A reviewer decides in seconds instead
> of comparing an IBAN by eye. Every check works this way — that is the whole
> product."

Press **Show all 20 passed checks**: the ones that passed are there too, so a
reviewer can see what was *not* a problem.

## 4. Fail closed — 30 seconds

> "Nothing here was approved by default. An invoice reaches payment only when
> every check passes or a named person overrode a specific one, with a reason.
> Some checks cannot be overridden at all: a reviewer judges business facts,
> they cannot supply arithmetic the document never did."

Still on B, press **Send for approval** with a reason. It is refused: a changed
IBAN is not a judgement call. Instead, **Request information** with *Call back
the supplier on the number in our master data*. It moves to **awaiting
information**.

> "A reviewer cannot wave a new bank account through. It clears only when the
> verified account is in master data and the invoice is checked again — and
> even then a second person signs, and the payment re-checks the account at the
> moment money leaves."

## 5. Four eyes — 90 seconds

Upload **`C_po_overrun_8500.xml`**. It stops at review: it overruns its
purchase order. That *is* a judgement call. Accept it into approval with a
reason. It moves to **awaiting approval** with two steps, manager and finance,
not to approved.

Now sign in as **tim.kessler@nordwerk.example** (cost centre manager) and
approve step 1, then as **jonas.weber@nordwerk.example** (finance) step 2.

> "The person who cleared the exception cannot be the person who approves the
> payment, and nobody signs an invoice they submitted. That is enforced by the
> server, not by the screen."

Point at the approval step: it records the document hash, the validation run
and the amount that was approved. If the document or the amount changes
afterwards, the approval no longer counts.

## 6. The money path — 60 seconds

Back as Finance: **create booking record**, then **instruct payment**, then
**confirm payment**.

> "The booking record is vendor-neutral; a DATEV or SAP adapter formats it. No
> money moves here — this is the seam where a real bank API goes."

## 7. A credit note — 90 seconds

Upload **`J_credit_note_214.xml`**. It is approved like any invoice, and the
progress spine is different: it ends at **credited**, with no payment stages.

Book it. The booking record reads **−214.20**.

> "A credit note says the supplier owes us. It runs exactly the same checks,
> and then the payment path is closed to it — asking to pay it is refused.
> Accounting sees a reversal."

## 8. Netting — 90 seconds

Open **DEMO-2026-01018**. The invoice is 270.62; the payment instruction is
**149.66**, because a 120.96 credit for that supplier was applied.

> "The bank saw 149.66. The invoice says 270.62. The ledger records which
> credit note made up the difference, so the question 'why was this payment
> short' has an answer months later."

Then open **DEMO-2026-01022**: 218.71, **settled by credit**, never paid,
because the open credits covered it entirely.

## 9. Reconciliation — 90 seconds

Go to **Payments and reconciliation**: 28 matched, 4 unclear, 4 open.

Open the unclear ones — they carry distinct reasons: `AMOUNT_MISMATCH`,
`NO_REFERENCE_MATCH`, `COUNTERPARTY_MISMATCH`.

> "A bank line is matched only when the reference names that payment and every
> other piece of evidence agrees. Two payments of the same amount are
> indistinguishable by amount, so an amount-only hit is always an exception,
> never a match. DEMO-2026-01058 is a part payment: 1,960.41 arrived against
> an instruction for 2,000.41, and a person decides what that means."

## 10. The metrics — 60 seconds

**Metrics**: 60 % straight through, 15.7 % exception rate, median approval
time, and the exception reasons ranked.

> "Every figure is computed from the invoices and their check trail, not
> counted separately."

Scroll to **modelled relief** and say this part out loud:

> "This panel is a scenario on stated assumptions, not a measurement. The
> assumptions are in `docs/IST_PROCESS.md`. I am not claiming a customer saved
> this money."

---

## If someone asks what it does not do

Do not improvise. It is written down, with the reasoning, in
`README.md` under "Known limits" and in `docs/DECISIONS.md`:

- Only UBL syntax is read; CII and ZUGFeRD are adapter boundaries.
- No official EN 16931 / KoSIT validator is wired in, and no compliance is
  claimed.
- A credit note offsets the next payment to that supplier, not the invoice it
  names.
- Reconciliation is one bank line to one invoice; part and collective payments
  become exceptions.
- Purchase orders are a single balance — no partial deliveries or order closure.
- Authentication is demo-grade: no password reset, second factor or SSO.

## If a demo goes wrong

Reset to the state this script describes:

```bash
npm run db:reset && npm run db:migrate && npm run db:seed && npm run db:demo
```
