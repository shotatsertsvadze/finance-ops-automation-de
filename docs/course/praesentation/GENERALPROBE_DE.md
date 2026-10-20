# Generalprobe Donnerstag – Go/No-go

Ziel: die Präsentation einmal genau so laufen lassen wie am Freitag.
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
| ☐ | Tunnel und n8n | Tunnel-Adresse in CONFIG der Kopie v2 eingetragen und veröffentlicht; `https://<Tunnel>/api/health` liefert `{"ok":true}`; das Formular lädt |
| ☐ | Rechnung für die KI vorbereitet | SIT-2026-0918 steht bei Jonas in der Sichtprüfung |
| ☐ | Fenster | Präsentation und Demo-Fenster mit fünf Tabs auf dem Beamer, Referentenansicht auf dem Laptop |

## B · Live-Demo

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | 380 € einreichen | Antwort „Freigegeben“ in unter 15 s |
| ☐ | 1.240 € einreichen | Antwort „Freigabe ausstehend“ |
| ☐ | 2.499 € einreichen | Antwort „Sichtprüfung“, Grund IBAN |
| ☐ | Wege in n8n | drei grüne Ausführungen; Havel läuft über „Gestoppt: Sichtprüfung“; 200216 steht noch in der Liste (sonst Screenshot für die Reserve) |
| ☐ | Finance-Ops | Havel: Grund und markierte Ziffern, kein Rückfrage-Knopf, nur der Rückruf-Hinweis |
| ☐ | KI-Rückfrage | Entwurf in unter 15 s oder der Hinweis auf die feste Vorlage; Text freigegeben, nicht versendet |
| ☐ | Freigabe durch Tim | INV-2026-00421 steht auf „Freigegeben“, im Verlauf steht Tim Kessler |
| ☐ | Wechsel Präsentation und Browser | Cmd + Tab hin und zurück ohne Suchen; Vollbild oder maximiert ist danach festgelegt |

## C · Zeit

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | Gesamtdauer | unter 22:00 (Plan 19:15) |
| ☐ | Zwischenzeiten | nach Folie 6 etwa 5:50, nach der Demo etwa 13:45, Ende etwa 19:15. Gemessen: ______ / ______ / ______ |

## D · Reserve

| | Punkt | Go, wenn |
|---|---|---|
| ☐ | Plan B | Taste V, Video bis 2:16, dann als Anna die drei Dateien lokal hochladen; die drei Entscheidungen sind sichtbar; zusammen unter 4 Minuten |
| ☐ | Rückweg | 8 und Enter führt zu Folie 8 |
| ☐ | Ersatzdateien | PDF v6 und `demo_v4.mp4` auf dem Desktop und auf einem USB-Stick |

## Entscheidung für Freitag

- **Alles Go:** live wie geplant.
- **Ein Punkt aus B No-go:** Plan B wird der Hauptweg. Folie 7 bleibt, die
  Demo läuft dann als Video bis 2:16 plus lokaler Upload.
- **Länger als 22:00:** kürzen wie im Sprechtext unter „Wenn die Zeit knapp
  wird“.

## Danach

- [ ] Tunnel, Oberfläche und Demo-API beenden, in n8n die Kopie v2 deaktivieren.
- [ ] Für Freitag wird die Demo-Datenbank am Morgen frisch aufgesetzt (`LIVE_DEMO_DE.md`, Start).
