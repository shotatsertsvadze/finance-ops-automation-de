# Generalprobe Donnerstag – Start, Go/No-go, Durchlauf

Ziel: die Präsentation einmal genau so laufen lassen wie am Freitag, mit v8
und dem n8n-Workflow v3 (Protokoll in Supabase), und danach den Backup-Ablauf
üben. Rückfall bleibt v7 mit dem Workflow v2.

Diese Liste von oben nach unten abarbeiten, Teil 1 bis 6. Ein Punkt gilt erst
nach höchstens zwei Versuchen als No-go. Die Klickfolge der Live-Demo steht in
`Live-Demo Ablauf v8.pdf` auf dem Desktop.

Mitnehmen:
- Stoppuhr
- Laptop mit Referentenansicht, Beamer oder zweiter Bildschirm für
  Präsentation und Demo-Fenster
- vom Desktop: `Finance Operations Automation (DE) · v8.html` und
  `· Reserve v8.html`, `Live-Demo Ablauf v8.pdf`, `demo_v4.mp4`, der Ordner
  `Live-Demo` mit den drei Formulardateien

## 1 · Start (etwa 25 Minuten)

Alle Befehle im Projektordner `~/Desktop/finance-ops-automation-de`. Vier
Terminals: 1 Demo-API, 2 Oberfläche, 3 Tunnel, 4 für einzelne Befehle. Die
Entwicklungsinstanz (`npm run dev`) wird nicht gebraucht. Terminals nicht auf
den Beamer legen.

**☐ 1. Demo-Datenbank frisch aufsetzen** (Terminal 4). Das betrifft nur die
Testdatenbank aus `TEST_DATABASE_URL`.

```bash
mkdir -p ~/finops-live-demo
```

```bash
DATABASE_URL="$(grep '^TEST_DATABASE_URL=' .env | cut -d= -f2-)" STORAGE_DIR=~/finops-live-demo npm run demo:reset
```

```bash
git checkout client/public/demo/statement_2026-09.json
```

Erwartet: am Ende eine Zusammenfassung mit `bank_exceptions: 4`, danach
„Updated 1 path from the index“.

**☐ 2. Demo-API starten** (Terminal 1, läuft weiter):

```bash
DATABASE_URL="$(grep '^TEST_DATABASE_URL=' .env | cut -d= -f2-)" API_PORT=4401 STORAGE_DIR=~/finops-live-demo AI_EXPLANATIONS=true node --env-file=.env server/index.js
```

Erwartet: eine Zeile mit `finops api listening on http://127.0.0.1:4401`.

**☐ 3. Oberfläche starten** (Terminal 2, läuft weiter):

```bash
API_PORT=4401 npx vite --config client/vite.config.js --port 5401 --strictPort
```

Erwartet: eine Zeile mit `http://localhost:5401/`. Im Browser erscheint dort
die Anmeldung.

**☐ 4. Tunnel starten** (Terminal 3, läuft weiter):

```bash
cloudflared tunnel --url http://127.0.0.1:4401
```

Erwartet: eine Adresse `https://….trycloudflare.com`. Kopieren und in
Terminal 4 prüfen (Adresse einsetzen):

```bash
curl -s https://ADRESSE.trycloudflare.com/api/health
```

Erwartet: `{"ok":true}`. In den ersten 10 bis 30 Sekunden kann noch ein Fehler
kommen; dann wiederholen.

**☐ 5. n8n v3:**
- Workflow „Finance Ops – Invoice Intake Demo v3 (Supabase-Test)“ öffnen.
- Im Knoten **CONFIG – Finance Ops API** den Wert durch die Tunnel-Adresse
  ersetzen (ohne `/` am Ende), speichern und **veröffentlichen**. Das ist die
  einzige Änderung.
- v2 bleibt deaktiviert, das Original bleibt, wie es ist.

Erwartet: `https://n8n.skill-sprinters.de/form/finance-ops-rechnung-v3` zeigt
„Finance Operations – Rechnung einreichen“.

**☐ 6. Supabase-Protokoll leeren.** Im Supabase-Dashboard das Projekt
**finops-demo-log** öffnen (kein anderes Projekt), SQL Editor:

```sql
truncate finops_demo.processing_log restart identity;
```

Erwartet: „Success. No rows returned“.

**☐ 7. Rechnung für die KI-Rückfrage.** In `http://localhost:5401` als
**anna.berger@nordwerk.example** anmelden, über „Datei auswählen“ die Datei
`fixtures/xrechnung/C_po_overrun_8500.xml` aus dem Projektordner hochladen,
abmelden, als **jonas.weber@nordwerk.example** anmelden. Erwartet:
SIT-2026-0918 von Spree IT steht in der Sichtprüfung.

**☐ 8. Fenster.**
- Fenster 1 auf dem Beamer: `Finance Operations Automation (DE) · v8.html`.
  **S** drücken, die Referentenansicht auf den Laptop ziehen, dann die
  Präsentation ins Vollbild (Ctrl + Cmd + F).
- Fenster 2 auf dem Beamer, das Demo-Fenster, Zoom 125 %:

| Tab | Inhalt |
|---|---|
| 1, 2, 3 | je einmal das Formular v3 |
| 4 | n8n: v3, Ansicht „Executions“ |
| 5 | Finance-Ops `http://localhost:5401` als Jonas, Posteingang |
| 6 | `Finance Operations Automation (DE) · Reserve v8.html`, auf R1 |
| 7 | Supabase, Projekt finops-demo-log, Table Editor, Schema `finops_demo`, Tabelle `processing_log` |

Aufbau gemessen: ______ (Ziel unter 25 Minuten)

## 2 · Go/No-go (10 Minuten vor Beginn)

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | Tunnel | `curl -s https://ADRESSE.trycloudflare.com/api/health` liefert `{"ok":true}` |
| ☐ | Formular | Tab 1 zeigt „Finance Operations – Rechnung einreichen“ |
| ☐ | n8n | v3 aktiv, CONFIG zeigt die heutige Tunnel-Adresse; v2 deaktiviert |
| ☐ | Supabase | Projekt aktiv, Tabelle in Tab 7 leer |
| ☐ | Finance-Ops | Jonas sieht SIT-2026-0918 in der Sichtprüfung, sonst nichts von heute |
| ☐ | Fehlerpfad | In der Ausführungsliste von v3 steht noch 207510 (rot); sonst in Schritt 5 R4 zeigen |
| ☐ | Reserve | Tab 6 auf R1; Leertaste startet das Video, K hält es an; danach die Seite neu laden (0:00) |
| ☐ | Zugangsdaten | nirgends auf dem Beamer sichtbar: keine Terminals, keine geöffnete Credential |
| ☐ | Zertifikat zu Supabase | bekannte Grenze, am 21.10.2026 für die befristete Demo mit synthetischen Daten akzeptiert (`LIVE_DEMO_DE.md`, Abschnitt „Sicherheitsgrenze“) |

Alles Go: weiter mit Teil 3. Tunnel oder n8n nicht erreichbar und in einer
Minute nicht behebbar: Teil 3 mit Plan B statt der Live-Schritte 1 bis 5
(`LIVE_DEMO_DE.md`, Reserve).

## 3 · Durchlauf: der ganze Vortrag ohne Unterbrechung

Stoppuhr starten, Folie 1 bis 12 wie am Freitag, die Demo nach der Klickfolge.

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | 380 € einreichen | Antwort „Freigegeben“ in unter 15 s |
| ☐ | 1.240 € einreichen | Antwort „Freigabe ausstehend“ |
| ☐ | 2.499 € einreichen | Antwort „Sichtprüfung“, Grund IBAN |
| ☐ | Wege in n8n | drei grüne Ausführungen; Havel läuft über „Gestoppt: Sichtprüfung“ und danach über „Protokoll in Supabase“, nicht über den Fehlerweg |
| ☐ | Fehlerpfad | 207510 öffnet sich, endet rot in „Technischer Fehler – nicht geprüft“ |
| ☐ | Finance-Ops | Havel: Grund und markierte Ziffern, kein Rückfrage-Knopf, nur der Rückruf-Hinweis |
| ☐ | KI-Rückfrage | Entwurf in unter 15 s oder der Hinweis auf die feste Vorlage; Text freigegeben, nicht versendet |
| ☐ | Freigabe durch Tim | INV-2026-00421 steht auf „Freigegeben“, im Verlauf steht Tim Kessler |
| ☐ | Fensterwechsel | hin und zurück ohne Suchen. Beide sind Chrome: Cmd + Tab wechselt nur zwischen Programmen, deshalb Cmd + < testen, im Vollbild und maximiert. Festgelegt: ______ |
| ☐ | Gesamtdauer | unter 22:00 (Plan 20:05) |
| ☐ | Zwischenzeiten | nach Folie 6 etwa 5:55, nach der Demo etwa 13:50, Ende etwa 20:05. Gemessen: ______ / ______ / ______ |

Direkt nach dem Vortrag:

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | Protokoll in Supabase | Tab 7 aktualisieren: genau drei Zeilen, `AUTO_APPROVE`, `APPROVAL`, `REVIEW`; Tab 7 zeigt nur dieses Projekt |
| ☐ | Kein Fehlerweg | keine Ausführung von heute lief über „Supabase-Protokoll fehlgeschlagen“ |

## 4 · Backup üben (nur in der Generalprobe)

Der Reset in 4.1 ist nur für die Generalprobe. **Am Freitag gibt es während der
Präsentation keinen Reset:** Angekommenes zeigen, nur Fehlendes hochladen
(`LIVE_DEMO_DE.md`, Reserve).

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | 4.1 Reset | Terminal 1: Ctrl + C. Terminal 4: die drei Befehle aus Schritt 1. Terminal 1: Befehl aus Schritt 2. Oberfläche und Tunnel laufen weiter. In Tab 5 neu als Jonas anmelden. Posteingang ohne Rechnungen von heute |
| ☐ | 4.2 Teilausfall (der Fall für Freitag) | Tab 1 neu laden, 380 € einreichen: „Freigegeben“. Dann Terminal 3: Ctrl + C (Tunnel weg). Tab 2: 1.240 € einreichen, es kommt ein Fehler oder keine Antwort. Tab 5, Posteingang neu laden: 380 € steht oben als „Freigegeben“, 1.240 € fehlt. Als Jonas über „Datei auswählen“ 1.240 € und 2.499 € aus `~/Desktop/Live-Demo` hochladen: „Freigabe ausstehend“ und „Sichtprüfung“, kein Duplikat. Unter 3 Minuten |
| ☐ | 4.3 Video | Fensterwechsel, Tab 6 (R1), Leertaste, Video bis 2:16, K; Fensterwechsel zurück, 8 und Enter: Folie 8. Unter 3 Minuten. Keine Dateien hochladen, sie sind schon da |
| ☐ | 4.4 Finance-Ops weg | Tab 6: R3, R2 und B9 durchblättern. Optional `demo_v4.mp4` in QuickTime bei 2:16 öffnen |
| ☐ | 4.5 Rückfall v7 und v2 | `Finance Operations Automation (DE) · v7.html` und `· Reserve v7.html` öffnen und durchblättern; in n8n ist v2 vorhanden und deaktiviert. Ohne Lauf mit v2 |
| ☐ | 4.6 Ersatzdateien | PDF v8 und v7 (Haupt- und Reservepräsentation) und `demo_v4.mp4` auf dem Desktop und auf einem USB-Stick |

## 5 · Entscheidung für Freitag

- **Alles Go:** v8 mit v3 live wie geplant.
- **Ein Punkt zu Supabase oder v3 No-go** (Verbindung, Rechte, Zeilen,
  Sicherheit): Rückfall auf v7 mit v2 und Google Sheets
  (`LIVE_DEMO_DE.md`, Abschnitt „Rückfall auf v7 und v2“).
- **Ein anderer Live-Punkt No-go:** Plan B wird der Hauptweg. Folie 7 bleibt,
  die Demo läuft dann als Video bis 2:16 plus Upload in Finance-Ops.
- **Länger als 22:00:** kürzen wie im Sprechtext unter „Wenn die Zeit knapp
  wird“.

Notizen: ____________________________________________

## 6 · Danach

- [ ] Terminal 1 und 2 mit Ctrl + C beenden (der Tunnel ist seit 4.2 aus).
- [ ] In n8n die Kopie v3 deaktivieren.
- [ ] Am Freitagmorgen Teil 1 noch einmal ganz: Datenbank frisch, neuer
      Tunnel, neue Adresse in v3, Supabase-Protokoll leeren.
- [ ] Den Supabase-Zugang erst nach der Präsentation am Freitag deaktivieren,
      nicht jetzt (`LIVE_DEMO_DE.md`, Abschnitt „Danach“).
