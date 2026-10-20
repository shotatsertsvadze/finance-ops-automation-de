# Präsentationstag – Checkliste

Vortragsfassung: `docs/course/praesentation/praesentation_v5.html` (16 Folien),
Sprechtext `SPRECHTEXT_V5_DE.md`, geplant etwa 21 Minuten.
Die Demo läuft als Video auf Folie 9 (aufgezeichnet am 15.10.2026, 4:05, ohne
Ton): zwei Rechnungen per E-Mail, n8n Schritt für Schritt, Ausführungen,
Google Sheet, dann Finance-Ops. Eine Rechnung läuft automatisch durch, eine
stoppt. Am Tag selbst braucht es weder Tunnel noch n8n. Finance-Ops läuft nur
lokal mit, falls in den Fragen jemand die Anwendung sehen will.

Diese Liste ist der Ersatzweg für den Vortrag. Was im Betrieb bei einem
Ausfall passiert, steht auf Folie 13 und gehört nicht hierher.

```
E-Mail → n8n (Cloud) → Cloudflare-Tunnel → Finance-Ops (lokal) → Google Sheets
```

Videoquelle: `docs/course/praesentation/demo_v4.mp4`. In
`praesentation_v5.html` ist es eingebettet, die Datei funktioniert also
allein. Backup-Folien B1 bis B8: `docs/course/praesentation/backup_folien_v5.html`.
B8 zeigt schematisch die fünf Wege einer Rechnung.

## Am Vortag

- [ ] Präsentation auf dem Präsentationslaptop öffnen und Folie 9 einmal ganz
      abspielen. Start, Pause und weiter: Klick ins Video, Leertaste oder K.
      Die Pfeiltasten wechseln die Folie; beim Zurückkehren steht das Video
      dort, wo es pausiert wurde.
- [ ] Am Beamer prüfen: Untertitel und vergrößerte Stellen im Video lesbar?
- [ ] Referentenansicht probieren: In der Präsentation **S** drücken. Ein
      zweites Fenster zeigt den Sprechtext der aktuellen Folie und folgt beim
      Weiterschalten von selbst, auf Folie 9 auch dem Video. Pfeiltasten,
      Leertaste und K wirken in beiden Fenstern. Den Beamer dafür auf
      „erweitern“ stellen, nicht „spiegeln“, sonst sieht das Publikum den Text.
      Online nur das Präsentationsfenster teilen. Öffnet sich kein Fenster:
      Pop-ups für die Datei erlauben (getestet in Chrome).
- [ ] Ersatz bereitlegen: PDF der Präsentation und `demo_v4.mp4` als eigene
      Datei, auf dem Desktop und auf einem USB-Stick.
- [ ] Die Schriften der Präsentation kommen aus dem Internet (Google Fonts).
      Ohne Netz sieht sie leicht anders aus; im Zweifel das PDF zeigen.

## Am Morgen

1. [ ] Für Fragen: Anwendung starten mit `npm run dev`, dann
       `npm run demo:reset`. Finance-Ops unter **http://localhost:5400** als
       **jonas.weber@nordwerk.example** anmelden, Zoom 125 %.
2. [ ] Präsentation öffnen, **S** drücken, die Referentenansicht auf den
       Laptop-Bildschirm ziehen, die Präsentation auf den Beamer ziehen und
       erst dann ins Vollbild (Ctrl + Cmd + F). In dieser Reihenfolge: Ein
       Vollbildfenster bekommt auf dem Mac einen eigenen Schreibtisch, S im
       Vollbild springt deshalb zur Referentenansicht weg. Mit nur einem
       Bildschirm geht Vollbild plus Referentenansicht nicht; zum Üben die
       Fenster nebeneinander anordnen. Benachrichtigungen aus (Fokus-Modus).

3. [ ] Nur wenn die KI-Rückfrage in den Fragen gezeigt werden soll:
       `AI_EXPLANATIONS=true` in `.env`, `npm run dev` neu starten, einmal
       einen Entwurf für Rechnung C erzeugen (prüft Schlüssel und Guthaben).
       Die Hauptdemo braucht die KI nicht.

4. [ ] Backup-Folien `backup_folien_v5.html#8` in einem zweiten Tab desselben
       Fensters öffnen (B8, „Fünf Wege“). Nach dem Video bei Bedarf mit
       Ctrl + Tab hin- und zurückwechseln.

## Während des Vortrags

- Folie 9: Leertaste oder Klick auf das Play-Symbol. Die Referentenansicht
  hebt den Absatz zur aktuellen Videostelle hervor. Braucht ein Satz länger:
  Leertaste, weiterreden, Leertaste. Danach mit der Pfeiltaste weiter.

## Wenn etwas schiefgeht

| Situation | Dann |
|---|---|
| Video startet nicht | `demo_v4.mp4` vom Desktop in QuickTime öffnen, Vollbild |
| Präsentation lässt sich nicht öffnen | PDF zeigen; Folie 9 zeigt dort ein Standbild, das Video separat abspielen |
| In den Fragen will jemand die Anwendung live sehen | Finance-Ops öffnen, die beiden Dateien aus `Demo-Anhaenge/` im Projektordner über „Datei auswählen“ hochladen. Kanal zeigt dann „Upload“ |
| Jemand will die KI-Rückfrage sehen | Vorführung nach `docs/course/praesentation/DEMO_RUECKFRAGE_DE.md`, etwa 90 Sekunden. Antwortet das Modell nicht, lädt die feste Vorlage; genau das zeigen |

## Bekannte Kleinigkeiten (bei Nachfrage erklären)

- Der Eingang per n8n läuft unter dem Konto von Anna Berger; im Verlauf steht
  deshalb ihr Name beim Eingang.
- Die Fälligkeit von HL-2026-7731 (25.09.2026) ist fest in der Testrechnung
  und liegt am Präsentationstag in der Vergangenheit.
- `npm run demo:reset` schreibt `client/public/demo/statement_2026-09.json`
  mit neuen Daten. Diese Änderung nicht committen.

## Video neu aufnehmen

Nur nötig, wenn sich die Anwendung sichtbar ändert. Tunnel starten
(`cloudflared tunnel --url http://127.0.0.1:4400`), die Adresse in n8n im
Knoten **CONFIG – Finance Ops API** eintragen und veröffentlichen, alte Mails
als gelesen markieren, Sheet leeren, `npm run demo:reset`. Dann die zwei
Rechnungen per Mail schicken und Mail, n8n (Workflow, „Executions“) und Sheet
aufnehmen; den App-Teil danach mit denselben Rechnungen.
