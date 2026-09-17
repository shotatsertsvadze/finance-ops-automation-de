# Business Case (demo assumptions)

All numbers are assumptions for a fictional company. Nothing here is a measured
customer result. The dashboard (Phase 4) shows these assumptions next to the
computed figures.

## Inputs

| Assumption | Value | Source |
|---|---|---|
| Invoices per month | 2 000 | brief |
| Share arriving as XRechnung/ZUGFeRD | 60 % | assumption |
| Manual time per clean invoice | 6 min | `docs/IST_PROCESS.md` |
| Manual time per exception | 25 min | `docs/IST_PROCESS.md` |
| Exception share today | 20 % | assumption |
| Exception share with rules and master data | 12 % | assumption, to be measured on demo data |
| Time per exception with the system (evidence shown, one click) | 8 min | assumption |
| Cost per AP hour | 45 EUR | assumption |

## Model (structured invoices only, 1 200 per month)

Corrected 2026-09-17: an earlier version of this table kept the clean
population at 960 in both columns. If the exception share falls from 20 % to
12 %, the clean population rises to 1 056, because the invoices that stop being
exceptions become clean ones.

| | Today | With system |
|---|---|---|
| Clean invoices | 960 × 6 min = 96 h | 1 056 × 1 min approval click = 17.6 h |
| Exceptions | 240 × 25 min = 100 h | 144 × 8 min = 19.2 h |
| Total touch time | 196 h | 36.8 h |
| Cost at 45 EUR/h | 8 820 EUR | 1 656 EUR |
| Estimated saving | | ~7 164 EUR / month, ~159 h |

The one-minute figure assumes every clean invoice still gets an approval click.
Invoices below the auto-approve limit take no click at all, so this is the
conservative end. The split between straight-through and human-approved volume
is itself an assumption and is not measured here.

The model ignores the 40 % PDF invoices, one-time setup, and licence costs. It
also ignores the harder-to-quantify effects: avoided duplicate payments,
avoided IBAN fraud, earlier payment discounts, and audit readiness.

## What would prove the case

Measured on the demo data and later on pilot data: STP rate, exception rate by
reason, median processing time, median approval time, duplicate attempts caught,
IBAN alerts raised. All of these are computed from `audit_events`.

## Commodity vs. differentiation

Parsing XRechnung is commodity (every ERP will do it). Differentiating: the
exception logic tied to the company's own master data, the enforced approval
policy with segregation of duties, the audit trail that survives an audit, and
KPIs a CFO can act on.
