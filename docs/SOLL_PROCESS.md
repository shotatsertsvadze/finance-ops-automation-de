# Soll-Prozess (target process)

Legend, updated as phases land: ✅ implemented and covered by a test,
⚠️ partially implemented, ❌ planned.

```mermaid
flowchart TD
    A[XRechnung received\nupload / mailbox adapter] --> B[Intake: store original, hash, RECEIVED]
    B --> C{Same file already live?}
    C -- yes --> D[DUPLICATE, linked to original]
    C -- no --> E[Technical validation]
    E -- fail --> R[REVIEW_REQUIRED\nreason TECHNICAL_VALIDATION_FAILED]
    E -- pass --> F[Business validation\nsupplier, IBAN, duplicate number, PO, totals, currency, completeness]
    F -- HIGH/MEDIUM failure --> R
    F -- pass --> G{Gross amount vs. policy}
    G -- ≤ auto limit --> H[APPROVED by system]
    G -- above --> I[READY_FOR_APPROVAL\nsteps by tier]
    R --> J{Reviewer}
    J -- accept --> I
    J -- request info --> K[INFO_REQUESTED] --> R
    J -- reject --> X[REJECTED]
    J -- confirm duplicate --> D
    I --> L{Approvers, four-eyes}
    L -- all approve --> H
    L -- reject --> X
    H --> M[ACCOUNTING_READY\nexport record]
    M --> N[PAYMENT_PENDING\nmock payment]
    N --> O[PAID]
    O --> P{Bank record match}
    P -- exact --> Q[RECONCILED]
    P -- none/ambiguous --> S[RECONCILIATION_EXCEPTION] --> Q
    M -- credit note --> CR[CREDITED]
    M -- open credits cover it --> SC[SETTLED_BY_CREDIT]
    N -- bank did not carry it out --> PF[PAYMENT_FAILED]
    PF -- instruct again --> M
    H -- stopped by finance --> CX[CANCELLED]
    M -- stopped, booking reversed --> CX
    PF -- stopped, booking reversed --> CX
```

| Step | Automated? | Human gate | Status |
|---|---|---|---|
| Intake, hashing, immutable storage | yes | - | ✅ |
| Exact duplicate file | yes | - | ✅ |
| Technical validation | yes | failure → review | ✅ |
| Business validation | yes | any HIGH/MEDIUM → review | ✅ |
| Routing and tier calculation | yes | - | ✅ |
| Straight-through approval ≤ auto limit | yes | - | ✅ |
| Review decision | no | AP clerk / Finance | ✅ |
| Approval steps | no | MANAGER / FINANCE / CFO, different actors | ✅ |
| Accounting record and export | yes | Finance triggers the handoff | ✅ |
| Credit note booked, open credits netted against the next payment | yes | Finance | ✅ |
| Payment instruction (mock) | yes | Finance instructs and confirms; not whoever signed an approval step | ✅ |
| Failed payment, instructed again or stopped | no | Finance | ✅ |
| Stopping an approved invoice, booking reversed | no | Finance, reason required | ✅ |
| Reconciliation | yes | ambiguous → human | ✅ |
| KPIs | yes | - | ✅ |

Roles: review belongs to accounts payable and finance; approval steps to the
cost-centre manager, finance and the CFO by amount tier; the money path to
finance. Enforced server-side against an authenticated session, not a claimed
identity (ADR-029, ADR-030).

Deliberately human: every IBAN change, every unknown supplier, every PO overrun,
every approval above the auto limit, every ambiguous bank match.
