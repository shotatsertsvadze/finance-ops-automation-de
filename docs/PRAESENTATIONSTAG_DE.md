# Präsentationstag – Checkliste

Vortragsfassung: `docs/course/praesentation/praesentation_v6.html`.
- 12 Folien, die Live-Demo auf Folie 7, hinter Folie 12 die Reservefolien R1
  bis R4.
- Sprechtext: `SPRECHTEXT_V6_DE.md`. Geplant sind 19 Minuten, Obergrenze 22
  bis 23.
- Live-Demo: `docs/course/praesentation/LIVE_DEMO_DE.md`, mit Start,
  Klickfolge, Go/No-go und Reserve.

Die Demo zeigt drei Rechnungen live, Eingang über das Formular der n8n-Testkopie
v2: eine wird automatisch frei, eine geht zur Freigabe, eine wird wegen der
IBAN gestoppt. n8n verzweigt nach der Antwort von Finance-Ops. Danach folgen
in Finance-Ops die Entscheidungen der Menschen und die KI-Rückfrage.

Rückfallebenen:
- Das Video vom 15.10.2026 liegt unverändert als R1 im Deck (Taste **V**).
- Die Fassung v5 mit dem Video auf Folie 9 bleibt als `praesentation_v5.html`
  erhalten (Git-Tag `deck-v5-final`).

Diese Liste ist der Ersatzweg für den Vortrag. Was im Betrieb bei einem
Ausfall passiert, steht auf R4 und gehört nicht hierher.

```
Formular (live) oder E-Mail (Betrieb) → n8n → Cloudflare-Tunnel → Finance-Ops (Demo-Instanz, lokal)
                                         n8n verzweigt nach der Antwort → Google Sheet
```

Videoquelle: `docs/course/praesentation/demo_v4.mp4`. In
`praesentation_v6.html` ist es als R1 eingebettet, die Datei funktioniert also
allein. Weitere Referenzfolien B1 bis B7: `docs/course/praesentation/backup_folien_v5.html`.

## Am Vortag

- [ ] Generalprobe mit der Go/No-go-Checkliste
      `docs/course/praesentation/GENERALPROBE_DE.md`: Start, ganzer Vortrag mit
      Zwischenzeiten, Plan B einmal üben.
- [ ] Wechsel zwischen Präsentation und Demo-Fenster am Beamer üben
      (Cmd + Tab). Liegen beide im Vollbild, wechselt macOS den Schreibtisch.
      Wirkt das zu unruhig, beide Fenster nur maximieren.
- [ ] Reserve R1 einmal abspielen: Taste V, dann Klick ins Video, Leertaste
      oder K. Zurück zu Folie 8 mit 8 und Enter.
- [ ] Am Beamer prüfen: Lesbar sind Formular-Antworten, n8n-Ausführungen und
      Finance-Ops bei Zoom 125 %?
- [ ] Referentenansicht probieren: In der Präsentation **S** drücken. Ein
      zweites Fenster zeigt den Sprechtext der aktuellen Folie und folgt beim
      Weiterschalten von selbst. Auf Folie 7 steht dort die Klickfolge, auf
      R1 folgt der Text dem Video. Pfeiltasten, Zahlen mit Enter, V,
      Leertaste und K wirken in beiden Fenstern. Den Beamer auf „erweitern“
      stellen, nicht „spiegeln“, sonst sieht das Publikum den Text. Öffnet
      sich kein Fenster: Pop-ups für die Datei erlauben (getestet in Chrome).
- [ ] Ersatz bereitlegen: PDF der Präsentation (v6) und `demo_v4.mp4` als
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
3. [ ] Demo-Fenster mit den Tabs nach `LIVE_DEMO_DE.md` vorbereiten, ebenfalls
       auf dem Beamer.
4. [ ] Go/No-go nach `LIVE_DEMO_DE.md`, 10 Minuten vorher. Fällt ein Punkt
       aus: Plan B.

## Während des Vortrags

- Folie 7: Live-Demo nach der Klickfolge. Klappt ein Schritt nicht, nicht
  reparieren: höchstens ein zweiter Versuch, dann die Reserve.
- Zurück zur Präsentation mit Cmd + Tab, weiter mit der Pfeiltaste zu Folie 8.

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
