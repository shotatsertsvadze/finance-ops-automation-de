# Live-Demo – Start, Klickfolge, Reserve

Gehört zu `praesentation_v6.html`, Folie 7 (Sprechtext: `SPRECHTEXT_V6_DE.md`).

Getestet am 20.10.2026:

- n8n-Testkopie „Finance Ops – Invoice Intake Demo v2 (Wege)“, Version
  `f9122671`. Ausführungen 200209, 200211 und 200213 grün, 200216 rot
  (technischer Fehler).
- Der Finance-Ops-Teil (Schritte 6 bis 8) wurde auf der Demo-Instanz Klick
  für Klick nachgestellt, der KI-Entwurf mit dem echten Modell.

Grundsatz: **Klappt ein Schritt nicht, nicht reparieren.** Höchstens ein
zweiter Versuch, dann die Reserve aus diesem Dokument.

## Was live läuft

| Teil | Wo | Hinweis |
|---|---|---|
| Finance-Ops | eigene Demo-Instanz: Testdatenbank, API auf 4401, Oberfläche auf `http://localhost:5401`, KI an | Die Entwicklungsdatenbank bleibt unberührt. |
| n8n | Testkopie v2, Formular `https://n8n.skill-sprinters.de/form/finance-ops-rechnung-v2` | Der Switch verzweigt nur nach der Antwort von Finance-Ops. Das Original bleibt unverändert. |
| Sheet | Tab „Branching Test Log“ | nur optional zeigen |
| Tunnel | temporärer Cloudflare-Tunnel, nur zur Demo-API | Die Adresse ändert sich bei jedem Start. |

Offen sagen: Der Eingang läuft live über ein Formular. Im Betrieb kommt die
Rechnung per E-Mail (Original-Workflow, Video R1), danach ist der Weg derselbe.

## Start am Präsentationstag (etwa 25 Minuten vorher)

Alles im Projektordner `~/Desktop/finance-ops-automation-de`. Die
Entwicklungsinstanz (`npm run dev`) wird nicht gebraucht.

**1. Demo-Datenbank frisch aufsetzen.** Das betrifft nur die Testdatenbank
aus `TEST_DATABASE_URL`:

```bash
mkdir -p ~/finops-live-demo
```

```bash
DATABASE_URL="$(grep '^TEST_DATABASE_URL=' .env | cut -d= -f2-)" STORAGE_DIR=~/finops-live-demo npm run demo:reset
```

```bash
git checkout client/public/demo/statement_2026-09.json
```

**2. Demo-API starten** (Terminal 1, läuft weiter):

```bash
DATABASE_URL="$(grep '^TEST_DATABASE_URL=' .env | cut -d= -f2-)" API_PORT=4401 STORAGE_DIR=~/finops-live-demo AI_EXPLANATIONS=true node --env-file=.env server/index.js
```

**3. Oberfläche starten** (Terminal 2, läuft weiter):

```bash
API_PORT=4401 npx vite --config client/vite.config.js --port 5401 --strictPort
```

**4. Tunnel starten** (Terminal 3, läuft weiter). Die angezeigte Adresse
`https://….trycloudflare.com` kopieren:

```bash
cloudflared tunnel --url http://127.0.0.1:4401
```

**5. n8n:**
- Testkopie v2 öffnen und im Knoten **CONFIG – Finance Ops API** die
  Tunnel-Adresse eintragen, dann **veröffentlichen**. Das ist die einzige
  Änderung, ein Konfigurationswert wie beim Original. Die Logik bleibt
  unverändert.
- Danach im Knoten prüfen, ob die neue Adresse in der aktiven Version steht.

**6. Rechnung für die KI-Rückfrage vorbereiten:**
- In Finance-Ops als **anna.berger@nordwerk.example** anmelden.
- Über „Datei auswählen“ die Datei `fixtures/xrechnung/C_po_overrun_8500.xml`
  hochladen. SIT-2026-0918 von Spree IT steht danach in der Sichtprüfung.
- Abmelden und als **jonas.weber@nordwerk.example** anmelden.

**7. Dateien für das Formular bereitlegen.** Den Ordner einmal anlegen; der
Dateidialog öffnet ihn danach schnell:

```bash
mkdir -p ~/Desktop/Live-Demo && cp fixtures/xrechnung/G_clean_380.xml fixtures/xrechnung/A_clean_1240.xml fixtures/xrechnung/B_iban_changed_2499.xml ~/Desktop/Live-Demo/
```

**8. Demo-Fenster** (zweites Chrome-Fenster auf dem Beamer, Zoom 125 %),
Tabs von links nach rechts:

| Tab | Inhalt |
|---|---|
| 1, 2, 3 | je einmal das Formular (gleiche Adresse). So bleibt jede Antwort stehen, und es muss nichts neu geladen werden. |
| 4 | n8n: Testkopie v2, Ansicht „Executions“, angemeldet |
| 5 | Finance-Ops `http://localhost:5401` als Jonas, Posteingang |
| (6) | optional: Google Sheet, Tab „Branching Test Log“ |

Die Präsentation läuft im ersten Fenster. Wechsel zwischen Präsentation und
Demo mit **Cmd + Tab**, zwischen den Tabs mit **Ctrl + Tab**. Liegen beide im
Vollbild, wechselt macOS dabei den Schreibtisch. In der Generalprobe testen;
wirkt es zu unruhig, beide Fenster nur maximieren.

## Go/No-go, 10 Minuten vorher

- [ ] `https://<Tunnel-Adresse>/api/health` liefert `{"ok":true}`.
- [ ] Tab 1 zeigt „Finance Operations – Rechnung einreichen“.
- [ ] In n8n ist v2 aktiv, und CONFIG zeigt die heutige Tunnel-Adresse.
- [ ] In Finance-Ops sieht Jonas SIT-2026-0918 in der Sichtprüfung, sonst
      nichts von heute.
- [ ] In der Ausführungsliste von v2 steht noch **200216** (rot). Fehlt sie,
      in Schritt 5 R4 zeigen.

Fällt ein Punkt aus und lässt sich nicht in einer Minute beheben: **Plan B**
(siehe Reserve).

## Klickfolge (Folie 7, Soll 7:55)

| Schritt | Klicks | Erwartet | Satz | Soll |
|---|---|---|---|---|
| Einstieg | Folie 7 zeigen, dann Cmd + Tab | – | „Drei Rechnungen, drei Erwartungen. Eingang heute per Formular, im Betrieb per E-Mail.“ | 0:15 |
| 1 · 380 € | Tab 1: Datei auswählen → `G_clean_380.xml` → **Rechnung einreichen** | nach 4–6 s: „Rechnung INV-2026-00433 – Status: Freigegeben – Bruttobetrag innerhalb der Auto-Grenze (500 EUR) …“ | „Kein Mensch nötig.“ | 0:40 |
| 2 · 1.240 € | Ctrl + Tab, `A_clean_1240.xml` | „Status: Freigabe ausstehend – Freigabe durch MANAGER laut Betragsstufe“ | „Über 500 €: Ein Mensch muss unterschreiben.“ | 0:30 |
| 3 · 2.499 € | Ctrl + Tab, `B_iban_changed_2499.xml` | „Status: Sichtprüfung – IBAN weicht von den freigegebenen Bankverbindungen des Lieferanten ab (Betrugsrisiko)“ | „Die Rechnung vom Anfang.“ | 0:30 |
| 4 · Wege in n8n | Ctrl + Tab, Ausführungsliste neu laden, oberste Ausführung (Havel) öffnen | Pfad über „Entscheidung von Finance-Ops“ nach „Gestoppt: Sichtprüfung in Finance-Ops“ | „n8n folgt nur der Antwort von Finance-Ops. Grün heißt: transportiert, nicht freigegeben.“ | 1:00 |
| 5 · Fehlerpfad | zurück zur Liste, **200216** (20.10., rot) öffnen | endet in „Technischer Fehler – nicht geprüft“, HTTP 502 | „Finance-Ops war gestoppt: nichts geprüft, nichts freigegeben. Getestet, nicht live provoziert.“ | 0:45 |
| 6 · Jonas | Ctrl + Tab, Posteingang neu laden, **HL-2026-7731** | oben der Grund, die Ziffern markiert; unten im Panel „Lieferantenrückfrage“ nur der Hinweis auf den Rückruf, **kein Knopf** | „Bei geänderter IBAN wäre eine Mail der falsche Kanal. Dahinter stehen 788 Tests.“ | 1:00 |
| 7 · KI | Posteingang → **SIT-2026-0918** → **KI-Entwurf erstellen** → einen Satz ändern → **Text freigeben** | nach etwa 5 s „KI-Entwurf – bitte prüfen und anpassen“, danach „Freigegeben, noch nicht versendet“ | „Die Werte setzt die Anwendung ein, nicht das Modell. Freigegeben ist nicht versendet.“ | 1:30 |
| 8 · Tim | **Abmelden** (unten links) → tim.kessler@nordwerk.example, Passwort → **Freigaben** → **INV-2026-00421** → **Freigeben** | Status „Freigegeben“, im Verlauf „Tim Kessler“ | „Anna, die eingereicht hat, könnte das nicht.“ | 0:45 |
| Rückweg | Cmd + Tab, Pfeiltaste | Folie 8 | – | – |

Summe der Schritte: 6:55. Dazu etwa 1:00 für Tab-Wechsel und Dateidialoge,
ergibt 7:55.

Gemessen am 20.10.2026:
- Antwort im Formular: 4,4 bis 6,0 s
- KI-Entwurf: 5,1 s
- Freigabe durch Tim: unter 2 s nach dem Klick

## Reserve

| Situation | Dann | Folie |
|---|---|---|
| **Plan B:** Tunnel oder n8n schon beim Go/No-go nicht erreichbar | Folie 7 zeigen, **V** drücken: Video bis 2:16 abspielen (n8n und Sheet), anhalten. Dann in Finance-Ops als Anna die drei Dateien über „Datei auswählen“ hochladen. Das ergibt dieselben Entscheidungen live, ohne n8n. Weiter mit Schritt 6. Sagen: „Die Verzweigung in n8n habe ich am 20.10. getestet; heute ist der Weg nicht erreichbar.“ | R1 |
| Das Formular meldet „Problem submitting response“ oder antwortet nach 15 s nicht | Erst in Finance-Ops (Tab 5) nachsehen, ob die Rechnung angekommen ist. **Ja:** Finance-Ops hat geprüft und entschieden, nur das Protokoll im Sheet ist gescheitert, so beim ersten Testlauf am 20.10. Nicht neu einreichen, sonst entsteht ein Duplikat; das Ergebnis in Finance-Ops zeigen. **Nein:** einmal neu einreichen. Klappt es dann nicht, Schritt 5 zeigen und lokal hochladen wie in Plan B. | – |
| n8n-Oberfläche lädt nicht | Schritte 4 und 5 nur ansagen, Folie R4 zeigen, weiter mit Schritt 6 | R4 |
| Finance-Ops lädt nicht | R3 (Was Jonas sieht) und R2 (KI) zeigen, Schritt 8 ansagen | R3, R2 |
| Das Modell antwortet nicht | Das Panel lädt die feste Vorlage und sagt das: „Kein KI-Entwurf verfügbar. Die feste Vorlage ist geladen.“ Genau das zeigen. Kommt gar nichts: R2 | R2 |
| Zeit knapp | Schritte 7 und 8 nur ansagen | – |

Sprung in der Präsentation: **Zahl und Enter** (etwa 13 Enter für R1, 8 Enter
zurück zu Folie 8), **V** springt direkt zum Video.

Hinter Folie 12 liegen die Reservefolien:
- R1: Demo-Video, unverändert
- R2: KI-Rückfrage
- R3: Was Jonas sieht
- R4: Gestoppt ist nicht ausgefallen

## Danach

- Tunnel, Oberfläche und Demo-API mit Ctrl + C beenden.
- In n8n die Testkopie v2 deaktivieren. Das Original bleibt, wie es ist.

## Generalprobe am Donnerstag

Go/No-go-Checkliste: `GENERALPROBE_DE.md`. Danach die Demo-Datenbank für
Freitag wieder frisch aufsetzen (Start, Schritt 1), sonst wären die drei
Rechnungen Duplikate.
