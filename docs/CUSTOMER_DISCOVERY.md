# Customer discovery

Status: a plan, not a result. Nothing here has been validated with a customer.
Every statement about customers is a hypothesis to test, and every threshold is
a proposal to agree with a pilot partner, not a claim (ADR-008).

## Why now (hypothesis)

- Since 1 January 2025, businesses in Germany must be able to receive e-invoices
  in domestic B2B (EN 16931: XRechnung, or ZUGFeRD from 2.0.1 excluding the
  MINIMUM and BASIC WL profiles). Issuing becomes mandatory from 2027 for
  businesses above 800,000 EUR prior-year turnover and from 2028 for all
  (Wachstumschancengesetz and the BMF guidance on it). Check the current state
  before quoting any of this to a customer.
- Hypothesis: from 2027 the share of structured invoices an SME receives rises
  sharply, and the question moves from "can we read it" to "what happens after
  we have read it". That second question is what this project answers.
- Since October 2025, euro-area banks check the payee name against the IBAN
  before a credit transfer (Verification of Payee). Hypothesis: it helps, but it
  does not replace a verified account in master data, because it checks the
  name the payer typed, not whether the supplier really changed banks.

## ICP candidates

| | ICP 1 (primary) | ICP 2 | ICP 3 (channel, not buyer) |
|---|---|---|---|
| Company type | Industrial Mittelstand manufacturer, one German GmbH | Wholesale / distribution, or multi-site services (logistics, facility services) | Tax advisory firm (Steuerberatungskanzlei) doing SME bookkeeping in DATEV |
| Size | 50-250 employees | 30-150 employees | 5-30 staff, many SME clients |
| Supplier invoices | 300-2,000 / month, recurring suppliers | 500-3,000 / month, many small amounts, frequent credit notes | thousands across clients, mixed formats |
| Process | POs for materials from the ERP, services without PO; AP team of 1-3; approvals by e-mail or paper | little PO discipline, volume-driven; returns and bonuses as credit notes | receives documents from clients, codes and books them; approvals happen at the client |
| Likely pain | re-keying, manual PO matching, approvals stuck in inboxes, IBAN-change fraud attempts, lost early-payment discounts | volume, credit notes against open items, reconciliation | mixed formats, missing documents, coding effort |
| Why relevant | PO checks with the commitment ledger, amount-tier approvals, four-eyes, IBAN control: the core of what exists | straight-through for small invoices, credit netting, reconciliation | pre-validated structured data and a DATEV export; a referral channel |
| Fit today | good | good for STP, weaker until real statements (camt.053) are read | partial: the approval workflow belongs to the client |

Deliberately out of scope for discovery:

- Micro businesses below roughly 50 invoices a month: too little volume to pay
  back the change.
- Large enterprises with SAP and established AP automation.
- Construction: reverse charge under §13b UStG and progress invoices
  (Abschlagsrechnungen) are not modelled; the system refuses reverse charge today
  (ADR-053).
- Public-sector buyers: a different procurement and invoicing regime.

Recommended mix: 6-8 interviews in ICP 1, 3-4 in ICP 2, 2-3 in ICP 3 (mainly
for DATEV export requirements and referrals). 12-15 in total.

## How to interview

- 45 minutes with the head of accounting (Leitung Buchhaltung or kaufmännische
  Leitung); if possible, a separate 20 minutes with an AP clerk.
- Ask about the last concrete cases, not opinions about the future. No demo in
  the first 30 minutes, and none at all unless asked. Do not pitch features.
- Ask for artefacts: invoice counts by format for one month, an anonymised
  open-items list, one anonymised e-invoice sample for format testing (only with
  written permission).
- Raw notes stay outside the repository (they may name people and suppliers).
  Only anonymised synthesis is committed.

## Discovery questions

| # | Topic | Question (asked in German) | What it tells us |
|---|---|---|---|
| 1 | Intake | Wie kommen Eingangsrechnungen heute bei Ihnen an, und wer nimmt sie zuerst in die Hand? Erzählen Sie vom letzten Montag. | channels, volume, first touch |
| 2 | Formats | Welcher Anteil kommt heute als XRechnung oder ZUGFeRD, welcher als PDF oder Papier? Woher wissen Sie das? | structured share, and whether anyone knows it |
| 3 | Stack | In welchem System wird bestellt, in welchem gebucht? Buchen Sie selbst oder die Steuerkanzlei in DATEV? | integration target: ERP, DATEV, both |
| 4 | Supplier master data | Wie ändert sich bei Ihnen die Bankverbindung eines Lieferanten? Wer darf das, wie wird es geprüft? Gab es schon einen Betrugsversuch? | whether the IBAN control is a felt risk |
| 5 | PO matching | Welcher Anteil der Rechnungen hat eine Bestellung? Wie gleichen Sie Rechnung, Bestellung und Wareneingang ab? | PO share, two- or three-way match |
| 6 | Approval | Wie läuft die Freigabe einer Rechnung über 5.000 Euro ab, von Eingang bis Zahlung? Wo bleibt sie liegen, und wie lange? | approval time, bottleneck, who signs |
| 7 | Exceptions | Welche drei Rechnungen haben zuletzt Ärger gemacht? Was war das Problem, und wie lange hat die Klärung gedauert? | exception types and their cost |
| 8 | Payment | Wie entsteht der Zahllauf: wer bereitet ihn vor, wer gibt ihn frei, in welchem Programm? Nutzen Sie Skonto systematisch? | payment preparation, discount losses |
| 9 | Reconciliation | Wie gleichen Sie Kontoauszüge mit offenen Posten ab, und wie oft bleibt etwas ungeklärt? | reconciliation pain, statement formats |
| 10 | Manual work and cost | Wie viele Personen arbeiten wie viele Stunden pro Woche an Eingangsrechnungen? Was passiert, wenn eine davon vier Wochen ausfällt? | FTE, fragility, cost of the status quo |
| 11 | E-Rechnung | Was haben Sie für die E-Rechnungspflicht bisher getan, und was erwarten Sie ab 2027, wenn mehr Lieferanten E-Rechnungen schicken müssen? | urgency and timing |
| 12 | Pilot | Wenn wir acht Wochen parallel zu Ihrem Prozess mitlaufen, mit echten Rechnungen, ohne selbst zu zahlen: was müsste danach messbar besser sein? Wer müsste zustimmen (Datenschutz, IT, Steuerberater)? | willingness, decision makers, their success criteria |

Processing time and current cost come from questions 6, 7 and 10 and are then
measured, not estimated (below).

## Signals

| Strong | Weak or disqualifying |
|---|---|
| a named IBAN fraud attempt, or a bank-detail change handled by e-mail alone | no structured invoices expected before 2028 |
| approvals that routinely wait more than a week | fewer than ~50 invoices a month |
| early-payment discounts lost for lack of time | AP fully outsourced, no internal approval step |
| an AP team that would notice a four-week absence | an ERP with AP automation already in use and liked |
| agrees to a baseline measurement | "interesting" without a next step |

## Baseline measurement model

The same definition is used for the customer baseline and for the pilot, or the
comparison means nothing. Every value is recorded with its method, period,
sample size and who measured it.

| Metric | Definition | Baseline (customer, before) | Pilot (measured) |
|---|---|---|---|
| Invoices per month | supplier invoices and credit notes received, split by format (XRechnung, ZUGFeRD, PDF, paper) | ERP or DATEV document count over 3 months, format split from a one-month tally | counted by the system, per format |
| Handling time | human minutes per invoice from receipt to release for payment, split clean / exception | two-week time log on a tally sheet, at least 100 invoices | the same time log for the pilot invoices; screen time is not touch time |
| Manual-touch rate | share of invoices with at least one manual step before payment approval (keying counts) | from the time log; usually close to 100 % where invoices are keyed | 1 - straight-through rate, from the audit trail |
| Exception rate | share needing clarification outside the normal path | flagged in the time log | `had_exception`, per invoice |
| Approval time | median hours from "ready for approval" to final approval | 30 sampled invoices, from e-mail or stamp timestamps | from the audit trail |
| Overdue invoices | share paid after the due date over the period; and count open past due at month end | open-items list and payment dates | from due dates and payment events |
| Manual hours | hours per month on accounts payable | time log extrapolated, cross-checked against the interview | time log extrapolated |
| Cost per invoice | manual hours x the customer's loaded hourly cost / invoices | the customer's own hourly cost, not our 45 EUR | same formula, pilot hours |
| Rework / error rate | share of invoices with a correction after posting (reversal, re-booking), a duplicate payment, or a returned payment | sample of the journal and bank returns over 3-6 months | reversals, failed payments, duplicates caught |
| Discount lost (optional) | early-payment discounts available but not taken, EUR | open-items list against payment terms | from payment terms and payment dates |

Minimum viable baseline: invoices per month with format split, handling time
clean and exception, exception rate, approval time and the loaded hourly cost.
That is enough to replace every assumption in `server/config/assumptions.js`:

| Assumption today | Replaced by |
|---|---|
| `manual_minutes_clean` 6 | baseline handling time, clean |
| `manual_minutes_exception` 25 | baseline handling time, exception |
| `hourly_cost_eur` 45 | the customer's loaded hourly cost |
| `system_minutes_clean` 1, `system_minutes_exception` 8 | pilot handling time, measured the same way |
| exception share 20 % / 12 % (`docs/BUSINESS_CASE.md`) | baseline and pilot exception rate |

How the values are stored and shown is in `docs/FINANCE_OPS_2_PLAN.md`,
section E.

## Pilot shape and success criteria

Shape: one legal entity, 8-10 weeks. Weeks 1-4 in shadow mode: real structured
invoices run through the system in parallel, and the system never pays. Weeks
5-8, if the gate below is passed: structured invoices are worked in the system
first; payments are still released in the customer's existing banking software.

Criteria, proposed and agreed with the partner before the start:

| Area | Criterion |
|---|---|
| Coverage | at least 90 % of the partner's structured invoices are read without manual keying |
| Control | every IBAN deviation is flagged; no payment is released to an unverified account; every master-data change carries evidence and two people |
| Noise | at most an agreed share (for example 20 %) of flagged invoices are judged fine by the reviewer; noise destroys trust faster than misses |
| Effort | handling time per structured invoice down by an agreed amount (for example 40 %) against the baseline, measured the same way |
| Speed | median approval time down by an agreed amount (for example 30 %) |
| Accounting | the export is imported by the accountant or tax advisor without rework for at least 95 % of records, if the export is in scope |
| Adoption | AP team and approvers work all pilot invoices in the system in weeks 5-8 |
| Data protection | processing agreement signed before the first real invoice; no incident |

Go / no-go at week 4 and at the end: continue when every control criterion is
met and at least two of coverage, effort and speed are.

## Plan

| Weeks | Step | Output |
|---|---|---|
| 1-2 | recruit through the personal network, IHK events, tax advisors, the course network; prepare the guide | 15-20 contacts, interview slots |
| 3-6 | 12-15 interviews | anonymised notes per interview |
| 7 | synthesis: pain frequency x intensity per ICP; ICP decision | `docs/discovery/SYNTHESIS.md` |
| 8 | ask 2-3 interviewees for a baseline measurement | signed-up baseline partners, a pilot candidate |

Decision rule: pursue an ICP when at least 60 % of its interviews name
master-data risk or approval delay among their top three pains, and at least 2
of its interviewees agree to a baseline measurement. Otherwise, narrow or change the ICP before
building further.
