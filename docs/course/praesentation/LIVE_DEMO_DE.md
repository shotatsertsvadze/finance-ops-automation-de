# Live-Demo – Start, Klickfolge, Reserve

Gehört zu `praesentation_v8.html`, Folie 7 (Sprechtext: `SPRECHTEXT_V8_DE.md`).
Die Reserve ist eine eigene Präsentation: `reserve_v8.html`. Rückfall auf v7
mit dem Workflow v2: Abschnitt „Rückfall auf v7 und v2“ unten.

Getestet am 21.10.2026 mit der n8n-Testkopie „Finance Ops – Invoice Intake
Demo v3 (Supabase-Test)“ über das Formular:

- 207493, 207496, 207497 grün (380 €, 1.240 €, 2.499 €), je eine Zeile im
  Protokoll in Supabase
- 207500 Duplikat: Zeile ohne Entscheidung
- 207503 Protokoll gesperrt: Bestätigung trotzdem, Weg „Supabase-Protokoll
  fehlgeschlagen“, keine Zeile
- 207510 rot (technischer Fehler, HTTP 502): keine Rechnung, keine Zeile

Der Finance-Ops-Teil (Schritte 6 bis 8) wurde am 20.10.2026 auf der
Demo-Instanz Klick für Klick nachgestellt, der KI-Entwurf mit dem echten Modell.
v2 wurde am 20.10.2026 getestet (Ausführungen 200209, 200211, 200213 grün,
200216 rot) und bleibt als Rückfall unverändert.

Grundsatz: **Klappt ein Schritt nicht, nicht reparieren.** Höchstens ein
zweiter Versuch, dann die Reserve aus diesem Dokument.

## Was live läuft

| Teil | Wo | Hinweis |
|---|---|---|
| Finance-Ops | eigene Demo-Instanz: Testdatenbank, API auf 4401, Oberfläche auf `http://localhost:5401`, KI an | Die Entwicklungsdatenbank bleibt unberührt. Alle Rechnungen, Entscheidungen und der Prüfpfad liegen hier. |
| n8n | Testkopie v3, Formular `https://n8n.skill-sprinters.de/form/finance-ops-rechnung-v3` | Der Switch verzweigt nur nach der Antwort von Finance-Ops. Original und v2 bleiben unverändert. |
| Supabase | Projekt `finops-demo-log`, Tabelle `finops_demo.processing_log` | nur zusätzliches Protokoll; n8n darf nur einfügen. Nur optional zeigen. |
| Tunnel | temporärer Cloudflare-Tunnel, nur zur Demo-API | Die Adresse ändert sich bei jedem Start. |

Offen sagen: Der Eingang läuft live über ein Formular. Im Betrieb kommt die
Rechnung per E-Mail (Original-Workflow, Video R1 in der Reserve), danach ist der Weg derselbe.

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
- Testkopie v3 öffnen und im Knoten **CONFIG – Finance Ops API** die
  Tunnel-Adresse eintragen, dann **veröffentlichen**. Das ist die einzige
  Änderung, ein Konfigurationswert wie beim Original. Die Logik bleibt
  unverändert.
- Danach im Knoten prüfen, ob die neue Adresse in der aktiven Version steht.
- v2 bleibt deaktiviert.

**6. Supabase-Protokoll leeren.** Im Supabase-Dashboard das Projekt
**finops-demo-log** öffnen (kein anderes Projekt), SQL Editor, ausführen:

```sql
truncate finops_demo.processing_log restart identity;
```

Danach zeigt die Tabelle nur die Zeilen von heute. Das Protokoll ist
synthetisch und gehört nur zu dieser Demo.

**7. Rechnung für die KI-Rückfrage vorbereiten:**
- In Finance-Ops als **anna.berger@nordwerk.example** anmelden.
- Über „Datei auswählen“ die Datei `fixtures/xrechnung/C_po_overrun_8500.xml`
  hochladen. SIT-2026-0918 von Spree IT steht danach in der Sichtprüfung.
- Abmelden und als **jonas.weber@nordwerk.example** anmelden.

Dieser Upload läuft nicht über n8n und erscheint deshalb nicht im Protokoll.

**8. Dateien für das Formular bereitlegen.** Den Ordner einmal anlegen; der
Dateidialog öffnet ihn danach schnell:

```bash
mkdir -p ~/Desktop/Live-Demo && cp fixtures/xrechnung/G_clean_380.xml fixtures/xrechnung/A_clean_1240.xml fixtures/xrechnung/B_iban_changed_2499.xml ~/Desktop/Live-Demo/
```

**9. Demo-Fenster** (zweites Chrome-Fenster auf dem Beamer, Zoom 125 %),
Tabs von links nach rechts:

| Tab | Inhalt |
|---|---|
| 1, 2, 3 | je einmal das Formular v3 (gleiche Adresse). So bleibt jede Antwort stehen, und es muss nichts neu geladen werden. |
| 4 | n8n: Testkopie v3, Ansicht „Executions“, angemeldet |
| 5 | Finance-Ops `http://localhost:5401` als Jonas, Posteingang |
| 6 | Reservepräsentation `reserve_v8.html`, auf R1 (Video) |
| (7) | optional: Supabase, Projekt finops-demo-log, Table Editor, Schema `finops_demo`, Tabelle `processing_log` |

Tab 7 zeigt nur dieses Projekt. Die Projektliste nicht aufklappen, dort stehen
auch andere Projekte.

Die Präsentation läuft im ersten Fenster, alles andere im Demo-Fenster.
Zwischen den Tabs wechselt **Ctrl + Tab**.

**Fensterwechsel:** Präsentation und Demo-Fenster sind beide Chrome. **Cmd +
Tab** wechselt zwischen Programmen, nicht zwischen zwei Fenstern desselben
Programms. Zwischen Chrome-Fenstern wechselt **Cmd + <** (deutsche Tastatur;
US-Tastatur Cmd + `). In der Generalprobe festlegen, welcher Weg zuverlässig
klappt, auch im Vollbild; wirkt es zu unruhig, beide Fenster nur maximieren.
Unten steht dafür „Fensterwechsel“.

## Go/No-go, 10 Minuten vorher

- [ ] `https://<Tunnel-Adresse>/api/health` liefert `{"ok":true}`.
- [ ] Tab 1 zeigt „Finance Operations – Rechnung einreichen“.
- [ ] In n8n ist v3 aktiv, und CONFIG zeigt die heutige Tunnel-Adresse. v2 ist
      deaktiviert.
- [ ] Supabase: Projekt finops-demo-log aktiv (nicht pausiert), Tabelle
      `processing_log` leer.
- [ ] In Finance-Ops sieht Jonas SIT-2026-0918 in der Sichtprüfung, sonst
      nichts von heute.
- [ ] In der Ausführungsliste von v3 steht noch **207510** (rot). Fehlt sie,
      in Schritt 5 R4 zeigen (Tab 6, Pfeiltaste).
- [ ] Tab 6 zeigt `reserve_v8.html` auf R1; Leertaste startet das Video, K
      hält es an. Danach wieder auf 0:00 stellen (Seite neu laden).

Fällt ein Punkt aus und lässt sich nicht in einer Minute beheben: **Plan B**
(siehe Reserve). Ist nur Supabase nicht erreichbar, ist das kein No-go: Die
Demo läuft, nur die Protokollzeilen fehlen (siehe Reserve).

## Klickfolge (Folie 7, Soll 7:55)

| Schritt | Klicks | Erwartet | Satz | Soll |
|---|---|---|---|---|
| Einstieg | Folie 7 zeigen, dann Fensterwechsel | – | „Drei Rechnungen, drei Erwartungen. Eingang heute per Formular, im Betrieb per E-Mail.“ | 0:15 |
| 1 · 380 € | Tab 1: Datei auswählen → `G_clean_380.xml` → **Rechnung einreichen** | nach 2–6 s: „Rechnung INV-2026-00433 – Status: Freigegeben – Bruttobetrag innerhalb der Auto-Grenze (500 EUR) …“ | „Kein Mensch nötig.“ | 0:40 |
| 2 · 1.240 € | Ctrl + Tab, `A_clean_1240.xml` | „Status: Freigabe ausstehend – Freigabe durch MANAGER laut Betragsstufe“ | „Über 500 €: Ein Mensch muss unterschreiben.“ | 0:30 |
| 3 · 2.499 € | Ctrl + Tab, `B_iban_changed_2499.xml` | „Status: Sichtprüfung – IBAN weicht von den freigegebenen Bankverbindungen des Lieferanten ab (Betrugsrisiko)“ | „Die Rechnung vom Anfang.“ | 0:30 |
| 4 · Wege in n8n | Ctrl + Tab, Ausführungsliste neu laden, oberste Ausführung (Havel) öffnen | Pfad über „Entscheidung von Finance-Ops“ nach „Gestoppt: Sichtprüfung in Finance-Ops“, danach „Protokoll in Supabase“ grün, nicht der Fehlerweg | „n8n folgt nur der Antwort von Finance-Ops und schreibt danach eine Zeile ins Protokoll. Grün heißt: transportiert, nicht freigegeben.“ | 1:00 |
| 5 · Fehlerpfad | zurück zur Liste, **207510** (21.10., rot) öffnen | endet in „Technischer Fehler – nicht geprüft“, HTTP 502 | „Finance-Ops war gestoppt: nichts geprüft, nichts freigegeben, keine Zeile im Protokoll. Getestet, nicht live provoziert.“ | 0:45 |
| 6 · Jonas | Ctrl + Tab, Posteingang neu laden, **HL-2026-7731** | oben der Grund, die Ziffern markiert; unten im Panel „Lieferantenrückfrage“ nur der Hinweis auf den Rückruf, **kein Knopf** | „Bei geänderter IBAN wäre eine Mail der falsche Kanal. Dahinter stehen 788 Tests.“ | 1:00 |
| 7 · KI | Posteingang → **SIT-2026-0918** → **KI-Entwurf erstellen** → einen Satz ändern → **Text freigeben** | nach etwa 5 s „KI-Entwurf – bitte prüfen und anpassen“, danach „Freigegeben, noch nicht versendet“ | „Die Werte setzt die Anwendung ein, nicht das Modell. Freigegeben ist nicht versendet.“ | 1:30 |
| 8 · Tim | **Abmelden** (unten links) → tim.kessler@nordwerk.example, Passwort → **Freigaben** → **INV-2026-00421** → **Freigeben** | Status „Freigegeben“, im Verlauf „Tim Kessler“ | „Anna, die eingereicht hat, könnte das nicht.“ | 0:45 |
| Rückweg | Fensterwechsel, Pfeiltaste | Folie 8 | – | – |

Summe der Schritte: 6:55. Dazu etwa 1:00 für Tab-Wechsel und Dateidialoge,
ergibt 7:55.

Nur wenn nach Schritt 4 Zeit ist (etwa 15 s): Tab 7, Tabelle aktualisieren.
Drei Zeilen: `AUTO_APPROVE`, `APPROVAL`, `REVIEW`. Satz: „Das ist nur das
Protokoll. Entschieden hat Finance-Ops.“

Gemessen:
- Antwort im Formular: 1,9 bis 3,2 s mit v3 (21.10.2026), 4,4 bis 6,0 s mit v2
  (20.10.2026)
- KI-Entwurf: 5,1 s (20.10.2026)
- Freigabe durch Tim: unter 2 s nach dem Klick (20.10.2026)

## Reserve

| Situation | Dann | Folie |
|---|---|---|
| **Plan B:** Tunnel oder n8n schon beim Go/No-go nicht erreichbar | Folie 7 zeigen, Fensterwechsel, Tab 6 (R1): **Leertaste**, Video bis 2:16 abspielen (n8n und Protokoll; im Video noch Google Sheets, der ursprüngliche Workflow), mit **K** anhalten. Dann in Finance-Ops als Anna die drei Dateien über „Datei auswählen“ hochladen. Das ergibt dieselben Entscheidungen live, ohne n8n. Weiter mit Schritt 6. Sagen: „Die Verzweigung in n8n und das Protokoll in Supabase habe ich am 21.10. getestet; heute ist der Weg nicht erreichbar.“ | R1, B9 |
| Das Formular meldet „Problem submitting response“ oder antwortet nach 15 s nicht | Erst in Finance-Ops (Tab 5) nachsehen, ob die Rechnung angekommen ist. **Ja:** Finance-Ops hat geprüft und entschieden; nicht neu einreichen, sonst entsteht ein Duplikat. Das Ergebnis in Finance-Ops zeigen. **Nein:** einmal neu einreichen. Klappt es dann nicht, Schritt 5 zeigen und lokal hochladen wie in Plan B. | – |
| In n8n läuft der Weg „Supabase-Protokoll fehlgeschlagen“ | Nichts tun. Die Bestätigung kam, die Entscheidung steht in Finance-Ops, nur die Zeile fehlt. Sagen: „Das Protokoll ist ausgefallen, die Entscheidung steht. Genau dafür ist dieser Weg gebaut.“ | R4 |
| n8n-Oberfläche lädt nicht | Schritte 4 und 5 nur ansagen, R4 zeigen (Tab 6, Pfeiltaste), weiter mit Schritt 6 | R4 |
| Finance-Ops lädt nicht | R3 (Was Jonas sieht) und R2 (KI) zeigen (Tab 6), Schritt 8 ansagen | R3, R2 |
| Das Modell antwortet nicht | Das Panel lädt die feste Vorlage und sagt das: „Kein KI-Entwurf verfügbar. Die feste Vorlage ist geladen.“ Genau das zeigen. Kommt gar nichts: R2 | R2 |
| Zeit knapp | Schritte 7 und 8 nur ansagen | – |

Die Hauptpräsentation hat genau 12 Folien; **Zahl und Enter** springt zu einer
Folie (8 Enter zurück zu Folie 8). Die Reserve liegt in `reserve_v8.html`
(Tab 6), dort mit den Pfeiltasten blättern:
- R1: Demo-Video, unverändert (Leertaste oder K: abspielen und anhalten)
- R2: KI-Rückfrage
- R3: Was Jonas sieht
- R4: Gestoppt ist nicht ausgefallen
- B1 bis B8: Referenzfolien für Fragen
- B9: Test von v3 mit Supabase am 21.10.2026

Das Video liegt zusätzlich als eigene Datei `demo_v4.mp4` bereit.
Die getesteten n8n-Läufe von v2 sind als bereinigte Auszüge gesichert:
`docs/course/n8n-ausfuehrungen/`.

## Rückfall auf v7 und v2

Nur wenn die Generalprobe für v3 ein No-go ergibt (`GENERALPROBE_DE.md`).
Dann gilt der Ablauf v7 (`Live-Demo Ablauf v7.pdf` auf dem Desktop):
- In n8n v3 deaktivieren, in v2 die Tunnel-Adresse eintragen und
  veröffentlichen. Es ist immer nur eine Kopie aktiv.
- Präsentation `praesentation_v7.html`, Reserve `reserve_v7.html`, Sprechtext
  `SPRECHTEXT_V7_DE.md`.
- Formular `…/form/finance-ops-rechnung-v2`, Fehlerpfad 200216, Protokoll im
  Google Sheet.

## Danach

- Tunnel, Oberfläche und Demo-API mit Ctrl + C beenden.
- In n8n die Testkopie v3 deaktivieren. Das Original bleibt, wie es ist.

## Generalprobe am Donnerstag

Go/No-go-Checkliste: `GENERALPROBE_DE.md`. Danach für Freitag die
Demo-Datenbank wieder frisch aufsetzen (Start, Schritt 1) und das
Supabase-Protokoll leeren (Schritt 6), sonst wären die drei Rechnungen
Duplikate.
