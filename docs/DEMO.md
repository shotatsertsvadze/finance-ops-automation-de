# Demo walkthrough

Twelve minutes, in order. For the three-minute video cut, with narration and
recording instructions, see `docs/DEMO_VIDEO.md`.

Every figure below comes from `npm run db:demo` with its default seed, which is
reproducible: the invoice numbers named here are the ones you will see. Steps
2, 6 and 8 upload three more invoices, so the figures in step 11 include them.
Run the steps once, in order, from a fresh reset.

Nothing in this system pays anyone. The bank, the accounting handoff and the
payment provider are simulated, and all data is synthetic.

## Before anyone is watching

```bash
npm install
cp .env.example .env          # set DATABASE_URL and TEST_DATABASE_URL
createdb finops               # once
npm run kosit:fetch           # once: the pinned KoSIT validator, SHA-256 checked
npm run kosit                 # in its own terminal; KOSIT_JAVA=... if `java` is not 11+
# in .env: KOSIT_URL=http://127.0.0.1:8081
npm run demo:reset            # drop, migrate, seed, generate the demo month
npm run dev                   # API on :4400, UI on :5400
```

The validator is optional. With it, every invoice carries the official
validation (KoSIT): 65 of the generated month are acceptable and the 5
malformed ones are not. Without it that check reads "skipped" and says the
document was not validated officially. Nothing else in this script changes.

Sign in as **jonas.weber@nordwerk.example** (Finance). Finance sees the whole
path; the other accounts are for the three-person moment in step 5 and the
four-eyes moment in step 6.

Open a second tab with `fixtures/xrechnung/` ready to upload.

---

## 1. The inbox — 60 seconds

70 invoices. The left rail counts the work: 6 in manual review, 3 awaiting
approval, 11 approved and waiting for the money path, 24 open under payments and
reconciliation. 30 of the 70 are already reconciled.

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

On that invoice, the check trail shows **1 of 23 checks failed**, with:

```
EXPECTED   DE02 1203 0000 0000 2020 51
FOUND      DE02 3002 0900 0106 5310 65
```

The differing characters are marked.

> "It does not say 'suspicious'. It says what it expected, what the document
> carried, and which characters differ. A reviewer decides in seconds instead
> of comparing an IBAN by eye. Every check works this way — that is the whole
> product."

Press **Show all 22 passed checks**: the ones that passed are there too, so a
reviewer can see what was *not* a problem. With the validator running, one of
them is **official validation (KoSIT)**: acceptable.

> "Formally, this is a perfectly valid e-invoice. The official validator has
> nothing against it. It is the business check, against our own master data,
> that sees it pays the wrong account."

## 4. Fail closed — 30 seconds

> "Nothing here was approved by default. An invoice reaches payment only when
> every check passes or a named person overrode a specific one, with a reason.
> Some checks cannot be overridden at all: a reviewer judges business facts,
> they cannot supply arithmetic the document never did."

Still on B, look at the decision panel: **Send for approval** is not offered.
The panel says the invoice is not releasable, because a changed IBAN is not a
judgement call. The server would refuse the release anyway (`NOT_PAYABLE_ELIGIBLE`);
the screen does not offer what the server would refuse. Instead, **Request
information** with *Call back the supplier on the number in our master data*.
It moves to **Question open**.

> "A reviewer cannot wave a new bank account through. It clears only when the
> verified account is in master data and the invoice is checked again — and
> even then a second person signs, and the payment re-checks the account at the
> moment money leaves."

## 5. A verified bank account — 2 minutes

Still on B, the **Bank account** panel says what the way on is. The invoice
never changes master data: its IBAN is only the reason for a proposal. Give a
reason (*The supplier's letter announces a new account*) and press **Propose
bank account for verification**. Proposal **BAC-000001** opens: the proposed
IBAN against the account on file, the policy (three different people), and B
listed as affected.

Sign in as **mira.hoffmann@nordwerk.example** (finance). The call-back form
shows the number to call, **+49 30 23125 102**, from master data; there is no
field to type one. Record the call: role *Buchhaltung*, and the IBAN the
supplier reads back, `DE02 3002 0900 0106 5310 65`. Press **Call-back confirms
the IBAN**. Mira is not offered the approval: whoever made the call cannot
approve.

Sign in as **sabine.vogt@nordwerk.example** (CFO) and **Approve bank account**.
The account is added to master data, next to the old one. B is listed as
waiting: it has an open question, and answering a person's question is a
person's act.

Back as Jonas, open B and press **Information received**, then on BAC-000001
**Revalidate invoices**. B runs its checks again as run 2, run 1 stays on
record, and it moves to **Awaiting approval** with a manager step, not to
approved.

> "The invoice never wrote master data. Three different people did: one
> proposed, one called back on the number we already had, one approved. And
> the invoice that started it still needs a signature: once an exception,
> always a human."

The new account is added, not substituted: the supplier's previous account
stays trusted until retiring accounts is built. Say so if asked.

## 6. Four eyes — 90 seconds

Upload **`C_po_overrun_8500.xml`**. It stops at review: it overruns its
purchase order. That *is* a judgement call. Accept it into approval with a
reason. It moves to **awaiting approval** with two steps, manager and finance,
not to approved.

Now sign in as **tim.kessler@nordwerk.example** (cost centre manager) and
approve step 1, then as **mira.hoffmann@nordwerk.example** (finance) step 2.

> "The person who cleared the exception cannot be the person who approves the
> payment, nobody signs an invoice they submitted, and whoever signs does not
> send the money. That is enforced by the server, not by the screen."

Point at the approval step: it records the document hash, the validation run
and the amount that was approved. If the document or the amount changes
afterwards, the approval no longer counts.

## 7. The money path — 60 seconds

Back as Jonas (finance, who did not sign it): **create booking record**, then
**instruct payment**, then **confirm payment**. As Mira, the payment buttons
would be refused.

> "The booking record is vendor-neutral; a DATEV or SAP adapter formats it. No
> money moves here — this is the seam where a real bank API goes."

## 8. A credit note — 90 seconds

Upload **`J_credit_note_214.xml`**. It is approved like any invoice, and the
progress spine is different: it ends at **credited**, with no payment stages.

**Create booking record**: it reads **−214.20**. The screen offers no payment,
only **Close the credit**; press it and the credit note ends as **Credited**.

> "A credit note says the supplier owes us. It runs exactly the same checks,
> and then the payment path is closed to it — the screen offers no payment,
> and the server refuses one.
> Accounting sees a reversal."

## 9. Netting — 90 seconds

Open **DEMO-2026-01018**. The invoice is 270.62; the payment instruction is
**149.66**, because the supplier's 120.96 credit note (DEMO-2026-01016) was
applied. Three more payments in the month were netted the same way; 823.09 of
credits in all.

> "The bank saw 149.66. The invoice says 270.62. The ledger records which
> credit note made up the difference, so the question 'why was this payment
> short' has an answer months later."

If asked what happens when the credits cover an invoice entirely: it is
settled against them and never paid (**Settled by credit**, ADR-050). The
generated month has no such case, so answer from the design rather than the
screen.

## 10. Reconciliation — 90 seconds

Go to **Payments and reconciliation**. The statement has 38 lines: 30 matched,
4 unclear, 4 open.

The four unclear lines each carry their reason:

| Line | Reason | What happened |
|---|---|---|
| TX-DEMO-0007 | `AMOUNT_MISMATCH` | DEMO-2026-01012: 3,196.07 arrived against an instruction for 3,236.07 |
| TX-DEMO-0029 | `AMOUNT_MISMATCH` | DEMO-2026-01055: 4,084.77 against 4,124.77 |
| TX-DEMO-0011 | `COUNTERPARTY_MISMATCH` | DEMO-2026-01021: right reference and amount, paid to another account |
| TX-DEMO-0013 | `NO_REFERENCE_MATCH` | 2,667.81, the exact amount of DEMO-2026-01024, but no payment named |

The four open lines (TX-2026-09-0001 to -0004) belong to the hand-written
fixtures, which the generated month does not contain, so there is nothing for
them to match.

> "A bank line is matched only when the reference names that payment and every
> other piece of evidence agrees. TX-DEMO-0013 has exactly the amount of
> DEMO-2026-01024, and it is still not a match: two payments of the same amount
> are indistinguishable by amount, so an amount-only hit is always an exception.
> DEMO-2026-01012 is a part payment: 3,196.07 arrived against 3,236.07, and a
> person decides what that means."

## 11. The metrics — 60 seconds

**Metrics**: 58.9 % straight through (43 of 73), 17.8 % exception rate, median
approval time, and the exception reasons ranked, with IBAN mismatches and
technical failures leading at five each. These include the three invoices
uploaded in steps 2, 6 and 8; before them the month reads 60.0 % and 15.7 %.

The ranking also shows the comment typed at **Information received** in step 5
as a reason of its own, once. The ranking counts every return to review by its
recorded reason, and that return records the comment. It is a known flaw of the
ranking, not of the bank-account step; if asked, say so.

> "Every operational figure is computed from the invoices and their check
> trail, not counted separately."

Under the title, **Sources** lists the four kinds of number. Every figure
carries its tag: the operational figures say **Synthetic demo data**, and
**Customer baseline** and **Pilot result** say **Not measured**.

Scroll to **Modelled savings potential**, tagged **Synthetic demo data +
Modelled assumption**, and say this part out loud:

> "This panel is a scenario on stated assumptions, not a measurement. The
> assumptions are in `docs/IST_PROCESS.md`. I am not claiming a customer saved
> this money."

---

## If someone asks what it does not do

Do not improvise. It is written down, with the reasoning, in
`README.md` under "Known limits" and in `docs/DECISIONS.md`:

- Only UBL syntax is read; CII and ZUGFeRD are adapter boundaries.
- Official validation is the pinned KoSIT validator; it reports an assessment,
  and no compliance is claimed. A rejected invoice is not processed by hand:
  the supplier sends a corrected one.
- A credit note offsets the next payment to that supplier, not the invoice it
  names.
- Reconciliation is one bank line to one invoice; part and collective payments
  become exceptions.
- Purchase orders are a single balance — no partial deliveries or order closure.
- A verified bank account is added to master data; the supplier's previous
  account stays trusted until retiring accounts is built.
- Authentication is demo-grade: no password reset, second factor or SSO.

## If a demo goes wrong

Reset to the state this script describes:

```bash
npm run db:reset && npm run db:migrate && npm run db:seed && npm run db:demo
```
