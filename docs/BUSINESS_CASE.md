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

| | Today | With system |
|---|---|---|
| Clean invoices | 960 × 6 min = 96 h | STP: ~0 min touch; approval click ~1 min → 16 h |
| Exceptions | 240 × 25 min = 100 h | 144 × 8 min = 19 h |
| Total | 196 h | 35 h |
| Cost | 8 820 EUR | 1 575 EUR |
| Estimated saving | | ~7 200 EUR / month, ~160 h |

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
