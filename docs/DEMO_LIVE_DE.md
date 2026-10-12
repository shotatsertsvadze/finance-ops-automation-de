# Live-Demo – Checkliste

Für die Abschlusspräsentation: zwei Rechnungen per E-Mail, eine läuft
automatisch durch, eine stoppt. Der ausführliche Ablauf aller Funktionen
steht in `docs/DEMO.md`.

```
E-Mail → n8n (Cloud) → Cloudflare-Tunnel → Finance-Ops (lokal) → Google Sheets
```

Finance-Ops prüft und entscheidet. n8n transportiert die Datei und übersetzt
für das Sheet nur die Codes der Antwort in Wörter (Knoten „Ergebnis
vorbereiten“).

## Am Vortag

- [ ] Kompletter Durchlauf auf dem Präsentationslaptop, im Netz, das vor Ort
      genutzt wird (im Zweifel Handy-Hotspot). Dreimal, jeweils ab „Am Morgen“.
- [ ] Ersatzfolien prüfen. Direkt nach Folie 8 folgen zwei Folien ohne
      Nummer: „Eingang“ (Bildschirmfotos Mail → n8n → Sheet vom 12.10.2026)
      und „Aufzeichnung“ (App-Teil als Video, 82 s, Klick startet es).
      Videoquelle: `docs/course/praesentation/ersatzvideo_app.mp4`.
- [ ] Am Beamer prüfen: Browser-Zoom 125 % lesbar? Sonst 150 %.

## Am Morgen (spätestens 60 Minuten vorher)

1. [ ] Anwendung starten: `npm run dev`.
       Prüfen: `curl http://127.0.0.1:4400/api/health` liefert `{"ok":true}`.
2. [ ] Tunnel **neu** starten, auch wenn noch einer läuft:
       `cloudflared tunnel --url http://127.0.0.1:4400`.
       Die angezeigte `https://….trycloudflare.com`-Adresse kopieren und prüfen:
       `curl https://<adresse>/api/health` liefert `{"ok":true}`.
       Warum: Die Adresse ändert sich bei jedem Start und kann auch bei
       laufendem Prozess wegfallen (am 7., 9. und 11. Oktober war die Adresse
       vom Vortag nicht mehr erreichbar).
       Meldet `curl` direkt nach dem Start „Could not resolve host“: eine
       Minute warten und erneut prüfen. Die neue Adresse braucht kurz, bis
       der lokale DNS-Cache sie kennt (am 11. Oktober so beobachtet).
3. [ ] n8n, Workflow „Finance Ops – Invoice Intake Demo“: neue Adresse in den
       Knoten **CONFIG – Finance Ops API** eintragen, speichern und
       **veröffentlichen** (Publish). Speichern allein ändert die aktive
       Version nicht.
4. [ ] Postfach, das n8n liest: alle alten Mails als gelesen markieren. Der
       E-Mail-Trigger holt jede ungelesene Mail mit XML-Anhang ab.
5. [ ] Probelauf mit einer **anderen** Datei: `fixtures/xrechnung/A_clean_1240.xml`
       per Mail schicken. Erwartung: neue Zeile im Sheet, Rechnung
       INV-2026-00421 in Finance-Ops.
6. [ ] Daten zurücksetzen: `npm run demo:reset`.
       Warum: Finance-Ops erkennt dieselbe Datei am Inhalt wieder. Liegt
       HL-2026-7731 schon in der Datenbank, zeigt die Demo „Duplikat“ statt
       des IBAN-Stopps. Umbenennen der Datei hilft nicht.
7. [ ] Google Sheet „Finance Ops Demo Log“: alle Zeilen unter der Kopfzeile löschen.
8. [ ] Zwei Mail-Entwürfe an das n8n-Postfach vorbereiten, Anhänge umbenannt
       (der Originalname verrät die Pointe):
       - Mail 1: `G_clean_380.xml` als `Rechnung_INV-2026-00433.xml`
       - Mail 2: `B_iban_changed_2499.xml` als `Rechnung_HL-2026-7731.xml`
9. [ ] Browser: Finance-Ops unter **http://localhost:5400** als
       **jonas.weber@nordwerk.example** angemeldet, Zoom 125 %.
       Port 5400 zeigt immer den aktuellen Stand; Port 4400 zeigt nur, was
       zuletzt mit `npm run build` gebaut wurde.
       Tabs in dieser Reihenfolge: Folien, Mail (zwei Entwürfe), n8n
       (Workflow, Reiter „Executions“), Sheet, Finance-Ops Posteingang.
       Benachrichtigungen aus (Fokus-Modus).

Ab hier nichts mehr in Finance-Ops hochladen.

## Live-Ablauf (etwa 5 Minuten)

| Schritt | Zeigen | Erwartetes Ergebnis |
|---|---|---|
| 1 | Am Ende von Folie 7: Mail 1, dann Mail 2 senden, zurück zu Folie 8 | Die Mails sind unterwegs, während Folie 8 erklärt wird |
| 2 | n8n, Workflow (30–45 s), dann Reiter „Executions“ | Ablauf einmal erklären; zwei Ausführungen „Success“ |
| 3 | Sheet | zwei neue Zeilen, Betrag als „380,00 €“ bzw. „2.499,00 €“: „Automatisch freigegeben · Freigegeben“ und „Zur Prüfung · Sichtprüfung“ mit Grund „IBAN weicht … ab (Betrugsrisiko)“, Kanal „E-Mail“ |
| 4 | Finance-Ops Posteingang (neu laden) | oben HL-2026-7731 „Sichtprüfung“, darunter INV-2026-00433 „Freigegeben“ |
| 5 | INV-2026-00433 öffnen | Verlauf: Eingang (Anna Berger, n8n-Konto), danach nur SYSTEM, „Automatisch freigegeben“ |
| 6 | HL-2026-7731 öffnen | „Was blockiert“, Erwartet/Gefunden mit markierten Ziffern, direkt darunter „Bankverbindung“ (ab `polish/demo-ui`; vorher steht sie unter „Ihre Entscheidung“) |
| 7 | „Übrige 22 Prüfungen anzeigen (20 bestanden)“, wieder einklappen | eine Prüfung fehlgeschlagen, 20 bestanden, dazu ein Hinweis und die ausgeschaltete offizielle Prüfung |
| 8 | zurück zu den Folien, dreimal weiter zu Folie 9 (die Folien „Eingang“ und „Aufzeichnung“ überspringen) | – |

Zuletzt so durchgelaufen am 11.10.2026 (E-Mail-Weg, beide Ergebnisse wie
erwartet; n8n-Ausführungen 3,5 s und 2,3 s). Die Belege stehen auf Backup-Folie
B1.

Nicht zeigen: Anmeldung, Kennzahlen, Zahlungen und Abgleich, XML-Ansicht,
Sprachumschaltung, KI-Erklärung (ausgeschaltet).

## Wenn etwas schiefgeht

| Situation | Dann |
|---|---|
| Nach 60 s keine Zeile im Sheet | Zuerst Finance-Ops-Posteingang neu laden. Sind beide Rechnungen schon da, dort weiterzeigen (nur das Sheet hängt). Sonst nur die **fehlende** Datei über das n8n-Formular hochladen (Production-URL im Knoten „Rechnung per Formular“). Eine schon verarbeitete Datei noch einmal zu senden erzeugt ein Duplikat und verschiebt die Reihenfolge im Posteingang |
| n8n oder Tunnel nicht erreichbar | Auf Folie 8 einmal weiter zur Folie „Eingang“ und damit den Weg Mail → n8n → Sheet zeigen. Dann im Posteingang prüfen, was schon angekommen ist, dann nur die fehlende Datei in Finance-Ops über „Datei auswählen“ hochladen. Kanal zeigt dann „Upload“ |
| Finance-Ops selbst nicht erreichbar | Auf Folie 8 weiter zur Folie „Eingang“, dann zur Folie „Aufzeichnung“, Klick ins Video startet es. Dann Folie 9 und Backup-Folie B1 (dort stehen die n8n-Ausführungen 112221 und 112248 vom 11.10.) |
| Mail kommt nach dem Ersatzweg doch noch an | Sie wird als Duplikat erfasst. Harmlos, nicht kommentieren |

## Bekannte Kleinigkeiten (nicht zeigen, bei Nachfrage erklären)

- Über das n8n-Formular eingegangene Rechnungen zeigen den Kanal in
  Finance-Ops als Code `FORM` statt als Wort, bis der Branch
  `polish/demo-ui` gemergt ist (danach „Formular“).
- Bis `polish/demo-ui` gemergt ist, heißt der Schalter in der Prüfspur noch
  „Alle 22 bestandenen Prüfungen anzeigen“ und zählt die übersprungene
  offizielle Prüfung und einen Hinweis mit.
- `npm run demo:reset` schreibt `client/public/demo/statement_2026-09.json`
  mit neuen Daten. Diese Änderung nicht committen.
- Der Eingang per n8n läuft unter dem Konto von Anna Berger; im Verlauf steht
  deshalb ihr Name beim Eingang.
- Die Fälligkeit von HL-2026-7731 (25.09.2026) ist fest in der Testrechnung
  und liegt am Präsentationstag in der Vergangenheit.
- Der Demo-Monat wird relativ zum Tag von `demo:reset` erzeugt; einige
  Kontoauszugszeilen haben Wertstellungen bis zu fünf Tage in der Zukunft.
