# Präsentationstag – Checkliste

Vortragsfassung: `docs/course/praesentation/praesentation_v4.html` (16 Folien).
Die Demo läuft als Video auf Folie 9 (aufgezeichnet am 15.10.2026, 4:05, ohne
Ton): zwei Rechnungen per E-Mail, n8n Schritt für Schritt, Ausführungen,
Google Sheet, dann Finance-Ops. Eine Rechnung läuft automatisch durch, eine
stoppt. Am Tag selbst braucht es weder Tunnel noch n8n. Finance-Ops läuft nur
lokal mit, falls in den Fragen jemand die Anwendung sehen will.

Diese Liste ist der Ersatzweg für den Vortrag. Was im Betrieb bei einem
Ausfall passiert, steht auf den Folien 12 und 13 und gehört nicht hierher.

```
E-Mail → n8n (Cloud) → Cloudflare-Tunnel → Finance-Ops (lokal) → Google Sheets
```

Videoquelle: `docs/course/praesentation/demo_v4.mp4`. In
`praesentation_v4.html` ist es eingebettet, die Datei funktioniert also
allein. Die Vorgängerfassung mit Backup-Folien liegt in
`docs/course/praesentation/referenz/`.

## Am Vortag

- [ ] Präsentation auf dem Präsentationslaptop öffnen und Folie 9 einmal ganz
      abspielen. Start, Pause und weiter: Klick ins Video, Leertaste oder K.
      Die Pfeiltasten wechseln die Folie; beim Zurückkehren steht das Video
      dort, wo es pausiert wurde.
- [ ] Am Beamer prüfen: Untertitel und vergrößerte Stellen im Video lesbar?
- [ ] Ersatz bereitlegen: PDF der Präsentation und `demo_v4.mp4` als eigene
      Datei, auf dem Desktop und auf einem USB-Stick.
- [ ] Die Schriften der Präsentation kommen aus dem Internet (Google Fonts).
      Ohne Netz sieht sie leicht anders aus; im Zweifel das PDF zeigen.

## Am Morgen

1. [ ] Für Fragen: Anwendung starten mit `npm run dev`, dann
       `npm run demo:reset`. Finance-Ops unter **http://localhost:5400** als
       **jonas.weber@nordwerk.example** anmelden, Zoom 125 %.
2. [ ] Präsentation im Vollbild öffnen. Benachrichtigungen aus (Fokus-Modus).

## Während des Vortrags

- Folie 9: Leertaste oder Klick auf das Play-Symbol, dazu den Sprechtext
  (Abschnitt „9 · Demo-Video“, mit Zeitmarken). Braucht ein Satz länger:
  Leertaste, weiterreden, Leertaste. Danach mit der Pfeiltaste weiter.

## Wenn etwas schiefgeht

| Situation | Dann |
|---|---|
| Video startet nicht | `demo_v4.mp4` vom Desktop in QuickTime öffnen, Vollbild |
| Präsentation lässt sich nicht öffnen | PDF zeigen; Folie 9 zeigt dort ein Standbild, das Video separat abspielen |
| In den Fragen will jemand die Anwendung live sehen | Finance-Ops öffnen, die beiden Dateien aus `~/Desktop/Demo-Anhaenge/` über „Datei auswählen“ hochladen. Kanal zeigt dann „Upload“ |

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
