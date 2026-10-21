# Präsentationstag – Checkliste

Vortragsfassung: `docs/course/praesentation/praesentation_v7.html`.
- Genau 12 Folien, die Live-Demo auf Folie 7.
- Reserve als eigene Präsentation: `reserve_v7.html` mit R1 bis R4 (Demo) und
  B1 bis B8 (Referenz für Fragen).
- Sprechtext: `SPRECHTEXT_V7_DE.md`. Geplant sind etwa 20 Minuten; vorgesehen
  sind 15 bis 20 Minuten mit 2 bis 3 Minuten Spielraum.
- Live-Demo: `docs/course/praesentation/LIVE_DEMO_DE.md`, mit Start,
  Klickfolge, Go/No-go und Reserve.

Die Demo zeigt drei Rechnungen live, Eingang über das Formular der n8n-Testkopie
v2: eine wird automatisch frei, eine geht zur Freigabe, eine wird wegen der
IBAN gestoppt. n8n verzweigt nach der Antwort von Finance-Ops. Danach folgen
in Finance-Ops die Entscheidungen der Menschen und die KI-Rückfrage.

Rückfallebenen:
- Das Video vom 15.10.2026 liegt unverändert als R1 in `reserve_v7.html`
  (Tab 6 im Demo-Fenster) und als eigene Datei `demo_v4.mp4`.
- Die Fassung v6 (12 Folien mit R1 bis R4 in einer Datei) bleibt als
  `praesentation_v6.html` erhalten (Git-Tag `deck-v6-final`), ebenso v5
  (`praesentation_v5.html`, Git-Tag `deck-v5-final`).

Diese Liste ist der Ersatzweg für den Vortrag. Was im Betrieb bei einem
Ausfall passiert, steht auf R4 und gehört nicht hierher.

```
Formular (live) oder E-Mail (Betrieb) → n8n → Cloudflare-Tunnel → Finance-Ops (Demo-Instanz, lokal)
                                         n8n verzweigt nach der Antwort → Google Sheet
```

Videoquelle: `docs/course/praesentation/demo_v4.mp4`. In `reserve_v7.html`
ist es als R1 eingebettet, die Datei funktioniert also allein. Die
Referenzfolien B1 bis B8 aus `backup_folien_v5.html` liegen dort dahinter.

## Am Vortag

- [ ] Generalprobe mit der Go/No-go-Checkliste
      `docs/course/praesentation/GENERALPROBE_DE.md`: Start, ganzer Vortrag mit
      Zwischenzeiten, Plan B einmal üben.
- [ ] Wechsel zwischen Präsentation und Demo-Fenster am Beamer üben. Beide
      sind Chrome: Cmd + Tab wechselt nur zwischen Programmen, zwischen
      Chrome-Fenstern Cmd + < (deutsche Tastatur). Liegen beide im Vollbild,
      wechselt macOS den Schreibtisch. Wirkt das zu unruhig, beide Fenster nur
      maximieren.
- [ ] Reserve R1 einmal abspielen: Tab 6 (`reserve_v7.html`), Leertaste oder
      K. Zurück in die Präsentation, dort 8 und Enter für Folie 8.
- [ ] Am Beamer prüfen: Lesbar sind Formular-Antworten, n8n-Ausführungen und
      Finance-Ops bei Zoom 125 %?
- [ ] Referentenansicht probieren: In der Präsentation **S** drücken. Ein
      zweites Fenster zeigt den Sprechtext der aktuellen Folie und folgt beim
      Weiterschalten von selbst. Auf Folie 7 steht dort die Klickfolge, auf
      Pfeiltasten und Zahlen mit Enter wirken in beiden Fenstern. Die
      Reservepräsentation hat eine eigene Referentenansicht (dort S drücken);
      auf R1 folgt ihr Text dem Video. Den Beamer auf „erweitern“
      stellen, nicht „spiegeln“, sonst sieht das Publikum den Text. Öffnet
      sich kein Fenster: Pop-ups für die Datei erlauben (getestet in Chrome).
- [ ] Ersatz bereitlegen: PDF von Haupt- und Reservepräsentation (v7) und `demo_v4.mp4` als
      eigene Datei, auf dem Desktop und auf einem USB-Stick.
- [ ] Die Schriften der Präsentation kommen aus dem Internet (Google Fonts).
      Ohne Netz sieht sie leicht anders aus; im Zweifel das PDF zeigen.

## Am Morgen

1. [ ] Demo-Instanz, Tunnel und n8n starten nach `LIVE_DEMO_DE.md`, Abschnitt
       Start. Etwa 25 Minuten vorher; die Entwicklungsinstanz wird nicht
       gebraucht.
2. [ ] Präsentation öffnen, **S** drücken, die Referentenansicht auf den
       Laptop-Bildschirm ziehen, die Präsentation auf den Beamer ziehen und
       erst dann ins Vollbild (Ctrl + Cmd + F). In dieser Reihenfolge: Ein
       Vollbildfenster bekommt auf dem Mac einen eigenen Schreibtisch, S im
       Vollbild springt deshalb zur Referentenansicht weg. Benachrichtigungen
       aus (Fokus-Modus).
3. [ ] Demo-Fenster mit den Tabs nach `LIVE_DEMO_DE.md` vorbereiten (Tab 6:
       `reserve_v7.html` auf R1), ebenfalls
       auf dem Beamer.
4. [ ] Go/No-go nach `LIVE_DEMO_DE.md`, 10 Minuten vorher. Fällt ein Punkt
       aus: Plan B.

## Während des Vortrags

- Folie 7: Live-Demo nach der Klickfolge. Klappt ein Schritt nicht, nicht
  reparieren: höchstens ein zweiter Versuch, dann die Reserve.
- Zurück zur Präsentation mit dem Fensterwechsel aus der Generalprobe, weiter
  mit der Pfeiltaste zu Folie 8.

## Wenn etwas schiefgeht

| Situation | Dann |
|---|---|
| Live-Demo nicht erreichbar | Plan B nach `LIVE_DEMO_DE.md`: Video R1 bis 2:16, dann die drei Dateien lokal in Finance-Ops hochladen |
| Video startet nicht | `demo_v4.mp4` vom Desktop in QuickTime öffnen, Vollbild |
| Präsentation lässt sich nicht öffnen | PDF zeigen, das Video separat abspielen |
| In den Fragen will jemand mehr von der Anwendung sehen | Die Demo-Instanz ist ohnehin offen (`http://localhost:5401`). |
| Jemand will die KI-Rückfrage noch einmal sehen | Sie ist Teil der Live-Demo. Reserve: R2. Antwortet das Modell nicht, lädt die feste Vorlage; genau das zeigen. |

## Bekannte Kleinigkeiten (bei Nachfrage erklären)

- Der Eingang per n8n läuft unter dem Konto von Anna Berger; im Verlauf steht
  deshalb ihr Name beim Eingang.
- Die Fälligkeit von HL-2026-7731 (25.09.2026) ist fest in der Testrechnung
  und liegt am Präsentationstag in der Vergangenheit.
- `npm run demo:reset` schreibt `client/public/demo/statement_2026-09.json`
  mit neuen Daten. Diese Änderung nicht committen.
- Die Testkopie v2 schreibt ihr Protokoll in den Tab „Branching Test Log“; das
  „Demo Log“ des Originals bleibt unberührt.

## Video neu aufnehmen

Nur nötig, wenn sich die Anwendung sichtbar ändert. Tunnel starten
(`cloudflared tunnel --url http://127.0.0.1:4400`), die Adresse in n8n im
Knoten **CONFIG – Finance Ops API** eintragen und veröffentlichen, alte Mails
als gelesen markieren, Sheet leeren, `npm run demo:reset`. Dann die zwei
Rechnungen per Mail schicken und Mail, n8n (Workflow, „Executions“) und Sheet
aufnehmen; den App-Teil danach mit denselben Rechnungen.
