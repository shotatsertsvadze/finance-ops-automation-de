# Generalprobe Donnerstag – Go/No-go

Ziel: die Präsentation einmal genau so laufen lassen wie am Freitag, mit v8
und dem n8n-Workflow v3 (Protokoll in Supabase).
Mitnehmen:
- Stoppuhr
- Referentenansicht auf dem Laptop, Präsentation und Demo-Fenster auf dem
  Beamer oder einem zweiten Bildschirm
- Befehle und Klickfolge aus `LIVE_DEMO_DE.md`

Jeder Punkt hat ein Kriterium. Ein Punkt gilt erst nach höchstens zwei
Versuchen als No-go.

## A · Aufbau

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | Demo-Instanz starten (Datenbank, API, Oberfläche) | `http://localhost:5401` lädt, Anna und Jonas können sich anmelden; Aufbau unter 10 Minuten |
| ☐ | Tunnel und n8n | Tunnel-Adresse in CONFIG der Kopie v3 eingetragen und veröffentlicht; v2 deaktiviert; `https://<Tunnel>/api/health` liefert `{"ok":true}`; das Formular v3 lädt |
| ☐ | Supabase | Projekt finops-demo-log aktiv; Tabelle geleert; in n8n verbindet die Credential „Supabase Demo-Log“ (Test grün) |
| ☐ | Rechnung für die KI vorbereitet | SIT-2026-0918 steht bei Jonas in der Sichtprüfung |
| ☐ | Fenster | Präsentation (`praesentation_v8.html`) und Demo-Fenster mit sechs Tabs auf dem Beamer, Tab 6 ist `reserve_v8.html` auf R1; Referentenansicht auf dem Laptop |

## B · Live-Demo

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | 380 € einreichen | Antwort „Freigegeben“ in unter 15 s |
| ☐ | 1.240 € einreichen | Antwort „Freigabe ausstehend“ |
| ☐ | 2.499 € einreichen | Antwort „Sichtprüfung“, Grund IBAN |
| ☐ | Wege in n8n | drei grüne Ausführungen; Havel läuft über „Gestoppt: Sichtprüfung“ und danach über „Protokoll in Supabase“, nicht über den Fehlerweg; 207510 steht noch in der Liste (sonst R4 für Schritt 5) |
| ☐ | Protokoll in Supabase | genau drei neue Zeilen: `AUTO_APPROVE`, `APPROVAL`, `REVIEW`; Tab 7 zeigt nur dieses Projekt |
| ☐ | Finance-Ops | Havel: Grund und markierte Ziffern, kein Rückfrage-Knopf, nur der Rückruf-Hinweis |
| ☐ | KI-Rückfrage | Entwurf in unter 15 s oder der Hinweis auf die feste Vorlage; Text freigegeben, nicht versendet |
| ☐ | Freigabe durch Tim | INV-2026-00421 steht auf „Freigegeben“, im Verlauf steht Tim Kessler |
| ☐ | Wechsel Präsentation und Browser | Fensterwechsel hin und zurück ohne Suchen. Beide sind Chrome: Cmd + Tab wechselt nur zwischen Programmen, deshalb Cmd + < testen. Danach festgelegt: welche Taste, Vollbild oder maximiert |

## C · Zeit

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | Gesamtdauer | unter 22:00 (Plan 20:05; vorgesehen 15 bis 20 Minuten mit 2 bis 3 Minuten Spielraum) |
| ☐ | Zwischenzeiten | nach Folie 6 etwa 5:55, nach der Demo etwa 13:50, Ende etwa 20:05. Gemessen: ______ / ______ / ______ |

## D · Reserve

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | Plan B | Fensterwechsel, Tab 6 (R1), Leertaste, Video bis 2:16, K; dann als Anna die drei Dateien lokal hochladen; die drei Entscheidungen sind sichtbar; zusammen unter 4 Minuten |
| ☐ | Rückweg | 8 und Enter führt zu Folie 8 |
| ☐ | Ersatzdateien | PDF v8 und v7 (Haupt- und Reservepräsentation) und `demo_v4.mp4` auf dem Desktop und auf einem USB-Stick |

## E · Verbindung und Sicherheit

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | Verbindung zu Supabase | keine Ausführung lief über „Supabase-Protokoll fehlgeschlagen“ |
| ☐ | Zertifikat zu Supabase | entweder die Korrektur ist umgesetzt und getestet (Prüfung an), oder die bekannte Grenze (Ignore SSL Issues, nur synthetische Daten, Rolle darf nur einfügen) ist für Freitag ausdrücklich akzeptiert; Bedingungen in `LIVE_DEMO_DE.md`, Abschnitt „Sicherheitsgrenze“ |
| ☐ | Keine Zugangsdaten sichtbar | weder in n8n noch in Supabase noch in Terminals auf dem Beamer |

## Entscheidung für Freitag

- **Alles Go:** v8 mit v3 live wie geplant.
- **Ein Punkt zu Supabase oder v3 No-go** (Verbindung, Rechte, Zeilen,
  Sicherheit): Rückfall auf v7 mit v2 und Google Sheets
  (`LIVE_DEMO_DE.md`, Abschnitt „Rückfall auf v7 und v2“).
- **Ein anderer Punkt aus B No-go:** Plan B wird der Hauptweg. Folie 7 bleibt,
  die Demo läuft dann als Video bis 2:16 plus lokaler Upload.
- **Länger als 22:00:** kürzen wie im Sprechtext unter „Wenn die Zeit knapp
  wird“.

## Danach

- [ ] Tunnel, Oberfläche und Demo-API beenden, in n8n die Kopie v3 deaktivieren.
- [ ] Für Freitag wird die Demo-Datenbank am Morgen frisch aufgesetzt und das
      Supabase-Protokoll geleert (`LIVE_DEMO_DE.md`, Start, Schritte 1 und 6).
