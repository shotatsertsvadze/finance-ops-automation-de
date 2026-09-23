# Three-minute demo video

A business demo, not a code walkthrough. The viewer should finish it
understanding the problem, what the system does about it, and what it
deliberately does not claim.

The recording runs **2:53**. Every time mark below was measured from a real
recording, not estimated, so the narration lines up with the footage.
The 1:40–2:12 beats changed with ADR-052 (a changed IBAN can no longer be
released from review) and kept their lengths; re-record before publishing.

The most important twenty seconds are **1:22–1:40**: the system stops itself on
an IBAN mismatch and shows the evidence. Everything else is setup for that.

## Reproducing exactly this

```bash
npm run demo:reset      # drops, migrates, seeds, regenerates the demo data
npm run dev             # API on :4400, UI on :5400
npm run demo:rehearse   # opens a browser and walks the path, at talking speed
```

The generator is seeded, so the invoice numbers below are the ones you will
see. `demo:rehearse` resets first and refuses to run if the data is not in its
starting state — fixture B is only a manual-review case the first time it
arrives; on a second pass it is a duplicate and the demo's best moment
disappears.

Rehearse with the narration out loud until it fits. `DEMO_SPEED=1.3` slows
every pause if you need more room.

---

## Storyboard

### 0:03 — 0:26  The problem (22s)

| | |
|---|---|
| **View** | Inbox, signed in as Anna Berger (accounts payable), English |
| **Click** | nothing |
| **On screen** | 70 invoices, the work queue counts in the left rail |

> "German B2B e-invoicing is machine-readable by law now. That part is solved.
> What is not solved is everything that happens next: checking the invoice
> against your own supplier and purchase-order data, chasing approvals, finding
> out why a payment did not match the bank statement. That is the manual work,
> and that is what this proof of concept automates. Seventy invoices here, all
> synthetic."

### 0:26 — 0:43  A clean invoice (17s)

| | |
|---|---|
| **View** | Inbox |
| **Click** | Choose file → `fixtures/xrechnung/G_clean_380.xml` |
| **On screen** | Toast "G_clean_380.xml processed", new top row **INV-2026-00433 · Approved · €380.00** |

> "This one arrives, is validated against master data, comes in under the
> approval limit, and is approved without a human touching it. That is the
> straight-through case."

### 0:43 — 0:57  What it actually checked (13s)

| | |
|---|---|
| **View** | Invoice detail for INV-2026-00433 |
| **Click** | the invoice number in the list |
| **On screen** | Check trail: **22 checks, nothing to report** |

> "Twenty-two checks, and the ones it passed are recorded too, not only the
> failures. Nothing here was approved by default."

### 0:57 — 1:12  The same control, the opposite outcome (15s)

| | |
|---|---|
| **View** | back to Inbox |
| **Click** | ← Inbox, then Choose file → `fixtures/xrechnung/B_iban_changed_2499.xml` |
| **On screen** | New top row **HL-2026-7731 · Manual review · "IBAN differs from master data"** |

> "Same upload, same checks. This one stopped itself, because it asks us to pay
> a bank account that is not the one we have on file for that supplier. That is
> the most common invoice fraud there is."

### 1:12 — 1:22  What is blocking (10s)

| | |
|---|---|
| **View** | Invoice detail for HL-2026-7731 |
| **Click** | the invoice number |
| **On screen** | "What is blocking" panel, progress spine halted at **Manual review** |

> "Automatic processing is stopped, and the screen says which check stopped it."

### 1:22 — 1:40  The evidence — the moment (18s)

| | |
|---|---|
| **View** | same page, check trail in frame |
| **Click** | nothing — let it sit |
| **On screen** | `supplier_iban_match · FAILED · HIGH`, EXPECTED vs FOUND, differing characters marked in red |

> "It does not say 'suspicious'. It says what it expected, what the document
> carried, and marks the characters that differ. A person decides in seconds
> instead of comparing an IBAN by eye. Every check in the system works this
> way — that is the actual product."

**Pause here.** Say nothing for a beat and let the two IBANs sit on screen.

### 1:40 — 1:50  A person decides (8s)

| | |
|---|---|
| **View** | same page, decision panel |
| **Click** | type into Reason: *Call back the supplier on the number in our master data.* then **Request information** |
| **On screen** | the typed reason, then the state moving to **Awaiting information** |

> "A person cannot wave a new bank account through. The way on is a call-back,
> and the verified account in master data."

### 1:50 — 2:01  Fail closed on the money (11s)

| | |
|---|---|
| **View** | same page after the decision |
| **Click** | nothing |
| **On screen** | "The invoice is waiting for an answer", progress spine held before approval |

> "Once the account is verified, the invoice is checked again, still needs a
> second person's signature, and the payment checks the account once more at
> the moment money leaves. That is enforced on the server, not on the screen."

### 2:01 — 2:12  The audit trail (11s)

| | |
|---|---|
| **View** | same page, History panel in frame |
| **Click** | scroll to History |
| **On screen** | received → checks started → routed to manual review → information requested, with **Anna Berger** and her reason |

> "Every state change, who made it, and on what grounds. It is written in the
> same database transaction as the change itself, so the trail cannot drift
> from what actually happened."

### 2:12 — 2:29  What it costs (17s)

| | |
|---|---|
| **View** | Metrics |
| **Click** | Metrics in the left rail |
| **On screen** | straight-through ~60 %, exception rate ~17 %, exception reasons ranked, work queue |

> "And because every decision is recorded, the operational numbers fall out of
> the data: how much went straight through, how much stopped, what stopped it,
> and what is waiting for a person right now. These are computed from the
> invoices and their check trail, not counted separately."

### 2:29 — 2:53  The honest close (12s + tail)

| | |
|---|---|
| **View** | Metrics, scrolled to **Modelled relief** |
| **Click** | scroll down |
| **On screen** | the panel's own caption: *Scenario on disclosed assumptions, not a measurement* |

> "One thing to be clear about: this panel is a scenario built on stated
> assumptions, not a measured saving, and I am not claiming a customer saved
> this money. This is a proof of concept on synthetic data. It is not
> production software and it is not certified against EN 16931 or GoBD. What it
> does not do is written down in the repository, with the reasoning."

---

## Keep the narration honest

Do not say, in the video or around it:

- "AI-powered" — there is no model anywhere in this system, and that is a
  deliberate design decision, not an omission.
- "production-ready", "compliant", "EN 16931 certified".
- any savings figure as a measured result.

What you can say without hedging: it runs end to end, the controls are
deterministic, uncertain cases go to a person, and every decision is audited.

## Recording it

### Option A — automated, silent, then narrate over it

```bash
npm run demo:reset && npm run dev     # in one terminal
npm run demo:record                   # in another; writes demo-video/demo.webm
npm run demo:mp4                      # H.264 mp4 for sharing
```

`demo-video/demo.mp4` is 1440×900, H.264, about 5 MB for the full 2:53, and
opens anywhere — Slack, email, Keynote. Record your voice over it afterwards in QuickTime, iMovie or Descript.

The trade-off, stated plainly: **there is no mouse cursor** in a Playwright
recording and clicks happen instantly. It looks clean and slightly robotic.
That is fine when you narrate over it, and it is perfectly reproducible.

### Option B — screen recording, narrated live

Better if you want a visible cursor and your own pacing.

1. `npm run demo:reset`, then `npm run dev`.
2. Open the browser at 1440×900 and sign in as Anna Berger. Switch to **EN**.
3. `Cmd+Shift+5` → **Record Selected Portion** → drag around the browser window
   only → set **Options → Microphone** to your microphone → **Record**.
4. Follow the storyboard above. Keep `docs/DEMO_VIDEO.md` open on a second
   screen or a phone.
5. `Cmd+Ctrl+Esc` to stop. The file lands on the Desktop as `.mov`.

Compress before sending:

```bash
ffmpeg -i ~/Desktop/"Screen Recording.mov" -vf scale=1440:-2 -c:v libx264 -crf 23 -movflags +faststart demo.mp4
```

Whichever you choose, **rehearse with `npm run demo:rehearse` first**. It opens
a real browser, follows the same path, and prints each beat as it reaches it.
