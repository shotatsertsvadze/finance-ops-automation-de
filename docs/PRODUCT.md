# Product

## One sentence

An operations system for German SMEs that takes a structured B2B e-invoice
(XRechnung) and runs the work that happens *after* the invoice is
machine-readable: validation against the company's own master data,
deterministic routing, human approval where judgment matters, accounting
handoff, payment status, reconciliation and operational KPIs.

## Who it is for

Finance operations in a German SME with a few hundred to a few thousand
supplier invoices per month. Demo company: **Nordwerk GmbH**, Berlin, ~80
employees, ~2 000 supplier invoices per month (fictional, all data synthetic).

Roles: AP clerk (Kreditorenbuchhaltung), cost-centre manager, Finance lead,
CFO. Reviewer and approver are different people by design.

## What it is not

- Not an "AI invoice parser". XRechnung is already structured; parsing is the
  cheapest part.
- Not an accounting system, not a bank. It prepares an accounting-ready record
  and a payment instruction and hands them to adapters.
- Not a legal validator. It checks the profile declaration and the structure it
  needs; official EN 16931 / XRechnung validation is an adapter boundary.

## Value

| Manual step today | What the system does | Human stays for |
|---|---|---|
| Open mail, read invoice, type data | Parse XRechnung, store immutable original | nothing |
| Check supplier in the vendor list | Match VAT ID / name, check status | unknown suppliers |
| Compare IBAN with the vendor record | Compare with approved accounts, HIGH alert on change | every IBAN change |
| Find PO, compare amounts | Match PO, tolerance check | overruns, missing PO |
| Chase the manager for approval | Route by amount tier, queue per role, four-eyes | the approval itself |
| Re-key into accounting | Accounting record + export | posting review |
| Check bank statement later | Match payment to invoice, flag ambiguous | ambiguous matches |
| No visibility | STP rate, exception rate, cycle times, ageing | reading the dashboard |

## Where AI could add value later (not in the MVP)

Legacy PDF invoices during the transition, cost-centre suggestions, explaining
exceptions in plain language, matching free-text descriptions to POs, supplier
e-mail correspondence. Rules stay deterministic; AI output is evidence, never a
decision (`docs/DECISIONS.md` ADR-006).

## Key views

Posteingang (inbox), Prüfungsqueue (review), Rechnung (detail with validation
results and timeline), Freigaben (approvals), Zahlungen & Abgleich, Dashboard.
Every view answers: what happened, why is it here, what blocks it, who must act,
which evidence caused the decision.
