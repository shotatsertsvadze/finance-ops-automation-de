# Ist-Prozess (current process) - Nordwerk GmbH

Fictional baseline used for the business case. Figures are assumptions, not
measurements.

## Volume

~2 000 supplier invoices per month, ~60 % already arrive as XRechnung/ZUGFeRD
from larger suppliers, the rest as PDF by e-mail (out of scope for the MVP).

## Steps today

1. Invoices arrive in a shared mailbox `rechnungen@`. An AP clerk opens each
   mail, saves the attachment to a network folder named by month.
2. The clerk reads the invoice and types supplier, number, date, amounts into
   the accounting software.
3. Supplier data is checked by eye against the vendor list; an IBAN change is
   noticed only if the clerk remembers the old one.
4. The clerk looks for the PO in the ERP; if missing, mails the requester.
5. The clerk forwards the PDF to the cost-centre manager for approval; the
   manager replies "ok" by mail or not at all. Above a certain amount the clerk
   also asks Finance.
6. After approval the clerk marks the invoice as payable; a payment run is
   prepared twice a week.
7. Weeks later, bank statements are matched manually to open items.
8. Management asks "how many invoices are stuck?" and gets an estimate.

## Weak points

| Problem | Effect |
|---|---|
| Re-keying structured data | 5-8 min per invoice, typos, wrong amounts |
| IBAN changes not detected | fraud exposure (fake "new bank details" mails) |
| Approval by e-mail | no audit trail, delays, duplicate approvals, lost mails |
| Same invoice sent twice (mail + portal) | duplicate payments found only at reconciliation |
| No PO discipline | overruns discovered after payment |
| No process data | no STP rate, no cycle time, no ageing, no early-payment discounts used |

## Baseline assumptions for the business case

| Measure | Assumed value |
|---|---|
| Manual handling time per clean invoice | 6 min |
| Manual handling time per exception | 25 min |
| Share of invoices needing clarification | 20 % |
| Average approval wait | 5 working days |
| Fully loaded cost of an AP clerk | 45 EUR/h |
