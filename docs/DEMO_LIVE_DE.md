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
- [ ] Ersatzvideo (60–90 s) genau dieses Ablaufs aufnehmen.
- [ ] Am Beamer prüfen: Browser-Zoom 125 % lesbar? Sonst 150 %.

## Am Morgen (spätestens 60 Minuten vorher)

1. [ ] Anwendung starten: `npm run dev`.
       Prüfen: `curl http://127.0.0.1:4400/api/health` liefert `{"ok":true}`.
2. [ ] Tunnel **neu** starten, auch wenn noch einer läuft:
       `cloudflared tunnel --url http://127.0.0.1:4400`.
       Die angezeigte `https://….trycloudflare.com`-Adresse kopieren und prüfen:
       `curl https://<adresse>/api/health` liefert `{"ok":true}`.
       Warum: Die Adresse ändert sich bei jedem Start und kann auch bei
       laufendem Prozess wegfallen (am 7. Oktober war die Adresse vom Vortag
       nicht mehr erreichbar).
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
9. [ ] Browser: Finance-Ops als **jonas.weber@nordwerk.example** angemeldet,
       Zoom 125 %. Tabs in dieser Reihenfolge: Folien, Mail, Sheet, Finance-Ops
       Posteingang. Benachrichtigungen aus (Fokus-Modus).

Ab hier nichts mehr in Finance-Ops hochladen.

## Live-Ablauf (etwa 5 Minuten)

| Schritt | Zeigen | Erwartetes Ergebnis |
|---|---|---|
| 1 | Mail 1, dann Mail 2 senden | – |
| 2 | Sheet | zwei neue Zeilen: „Automatisch freigegeben“ und „Zur Prüfung“ mit Grund „IBAN weicht … ab (Betrugsrisiko)“ |
| 3 | Finance-Ops Posteingang (neu laden) | oben HL-2026-7731 „Sichtprüfung“, darunter INV-2026-00433 „Freigegeben“ |
| 4 | INV-2026-00433 öffnen | Verlauf: nach dem Eingang nur SYSTEM, „Automatisch freigegeben“ |
| 5 | HL-2026-7731 öffnen | „Was blockiert“, Erwartet/Gefunden mit markierten Ziffern |
| 6 | „Alle 22 bestandenen Prüfungen anzeigen“ | alles andere ist in Ordnung |
| 7 | zurück zu Folie 8 | – |

Nicht zeigen: Anmeldung, Kennzahlen, Zahlungen und Abgleich, XML-Ansicht,
Sprachumschaltung, KI-Erklärung (ausgeschaltet).

## Wenn etwas schiefgeht

| Situation | Dann |
|---|---|
| Nach 30 s keine Zeile im Sheet | n8n-Formular öffnen (Production-URL im Knoten „Rechnung per Formular“), beide Dateien nacheinander hochladen |
| n8n oder Tunnel nicht erreichbar | In Finance-Ops „Datei auswählen“, beide Dateien hochladen. Kanal zeigt dann „Upload“ |
| Finance-Ops selbst nicht erreichbar | Backup-Folie 13, dann Ersatzvideo |
| Mail kommt nach dem Ersatzweg doch noch an | Sie wird als Duplikat erfasst. Harmlos, nicht kommentieren |

## Bekannte Kleinigkeiten (nicht zeigen, bei Nachfrage erklären)

- Über das n8n-Formular eingegangene Rechnungen zeigen den Kanal in
  Finance-Ops als Code `FORM` statt als Wort (im Sheet steht „Formular“).
- Der Eingang per n8n läuft unter dem Konto von Anna Berger; im Verlauf steht
  deshalb ihr Name beim Eingang.
- Die Fälligkeit von HL-2026-7731 (25.09.2026) ist fest in der Testrechnung
  und liegt am Präsentationstag in der Vergangenheit.
- Der Demo-Monat wird relativ zum Tag von `demo:reset` erzeugt; einige
  Kontoauszugszeilen haben Wertstellungen bis zu fünf Tage in der Zukunft.
