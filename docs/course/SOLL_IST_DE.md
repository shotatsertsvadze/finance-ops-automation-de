# Soll/Ist-Auswertung: 20 synthetische Rechnungen

Eine feste Testmenge mit bekanntem Soll-Ergebnis, damit das Erfolgskriterium
„mindestens 8 von 10 Rechnungen laufen ohne manuelle Sachprüfung durch“
nachprüfbar wird. „Durchgelaufen“ heißt hier: **an der richtigen Stelle
gelandet**. Eine Rechnung zählt nur dann als richtig, wenn Status, Grund und
Freigabekette dem Soll entsprechen.

## Vorgehen

- 20 synthetische Rechnungen an die fiktive Nordwerk GmbH, von den drei
  Lieferanten aus den Stammdaten.
- Jede Rechnung läuft einzeln durch die echte Verarbeitung: Einlesen,
  Prüfungen, Einordnung. Grundlage sind dieselben Stammdaten und die Richtlinie
  `demo-2026-09` (automatische Freigabe bis 500 €, zweite Stufe über 5.000 €,
  dritte über 25.000 €, Bestelltoleranz 2 %, mindestens 10 €).
- 16 Rechnungen sollen ohne Sachprüfung durchlaufen, 4 müssen stoppen. Diese
  Mischung bildet die Annahme aus dem Steckbrief nach (8 von 10).
  **Die Quote von 80 % ist also gewählt, nicht gemessen.** Gemessen wird, ob
  jede einzelne Rechnung dort landet, wo sie hingehört.
- Das Soll habe ich aus den Geschäftsregeln abgeleitet, bevor die Rechnungen
  liefen. Es ist kein unabhängiges Urteil einer Fachabteilung.
- Ausgewählt sind vor allem Grenzfälle: genau an einer Freigabegrenze, 1 Cent
  darüber, Überschreitung innerhalb der Toleranz, Gutschrift, Anzahlung,
  Kleinbetrag mit fremder IBAN.

## Ergebnis (Lauf vom 19.10.2026)

| Kennzahl | Ergebnis |
|---|---|
| Ist entspricht Soll (Status, Grund, Freigabekette) | **20 von 20** |
| Ohne Sachprüfung durchgelaufen | 16 von 20 (6 automatisch freigegeben, 10 zur Freigabe nach Betrag) |
| Gestoppt, mit richtigem Grund | 4 von 4 |
| Fälschlich durchgelaufen | 0 |
| Fälschlich gestoppt | 0 |
| Rechnungen mit fremder IBAN gestoppt | 2 von 2, auch die unter der Freigabegrenze |

## Die 20 Rechnungen

„Zur Freigabe“ heißt: keine Sachprüfung, aber die Freigabe nach Betrag durch
die genannten Rollen. Kostenstellenleitung = Manager.

| Nr. | Fall | Betrag | Soll | Ist |
|---|---|---|---|---|
| 1 | Bürobedarf, Bestellung passt | 380,00 € | Freigegeben (automatisch) | wie Soll |
| 2 | Rabatt auf Rechnungsebene | 499,80 € | Freigegeben (automatisch) | wie Soll |
| 3 | Gutschrift | 214,20 € | Freigegeben (automatisch) | wie Soll |
| 4 | Zwei Steuersätze (19 % und 7 %) | 113,00 € | Freigegeben (automatisch) | wie Soll |
| 5 | Genau an der Freigabegrenze | 500,00 € | Freigegeben (automatisch) | wie Soll |
| 6 | Kleinbetrag ohne Bestellung, unter der Bestellpflicht | 238,00 € | Freigegeben (automatisch) | wie Soll |
| 7 | Bürobedarf | 1.240,00 € | Zur Freigabe: Kostenstellenleitung | wie Soll |
| 8 | 1 Cent über der Freigabegrenze | 500,01 € | Zur Freigabe: Kostenstellenleitung | wie Soll |
| 9 | Bestellung um 5,00 € überschritten, innerhalb der Toleranz | 505,00 € | Zur Freigabe: Kostenstellenleitung | wie Soll |
| 10 | Anzahlung verrechnet | 1.000,00 € | Zur Freigabe: Kostenstellenleitung | wie Soll |
| 11 | Logistik | 1.190,00 € | Zur Freigabe: Kostenstellenleitung | wie Soll |
| 12 | Logistik mit Frachtzuschlag | 1.309,00 € | Zur Freigabe: Kostenstellenleitung | wie Soll |
| 13 | IT-Leistung | 4.760,00 € | Zur Freigabe: Kostenstellenleitung | wie Soll |
| 14 | IT-Leistung, zweite Stufe | 5.950,00 € | Zur Freigabe: Kostenstellenleitung, Finanzen | wie Soll |
| 15 | Genau an der zweiten Grenze | 25.000,00 € | Zur Freigabe: Kostenstellenleitung, Finanzen | wie Soll |
| 16 | IT-Leistung, dritte Stufe | 30.000,00 € | Zur Freigabe: Kostenstellenleitung, Finanzen, CFO | wie Soll |
| 17 | Fremde IBAN (Havel Logistik) | 2.499,00 € | Sichtprüfung: IBAN weicht von den Stammdaten ab | wie Soll |
| 18 | Fremde IBAN bei Kleinbetrag | 380,00 € | Sichtprüfung: IBAN weicht von den Stammdaten ab | wie Soll |
| 19 | Bestellung deutlich überschritten | 10.115,00 € | Sichtprüfung: Betrag überschreitet die Bestellung | wie Soll |
| 20 | Rechnungsnummer doppelt (nach Nr. 7) | 1.240,00 € | Sichtprüfung: Rechnungsnummer bereits erfasst | wie Soll |

Nr. 18 ist der wichtigste Grenzfall: Der Betrag liegt unter der Grenze für die
automatische Freigabe, die Rechnung stoppt trotzdem. Eine fremde IBAN geht nie
automatisch durch.

## Was das zeigt und was nicht

- **Zeigt:** Die Regeln ordnen diese 20 Fälle richtig ein, auch an den Grenzen.
  Keine Rechnung mit Risiko läuft durch, keine saubere bleibt hängen.
- **Zeigt nicht**, wie viele echte Rechnungen durchlaufen würden. Das hängt von
  der Qualität der Stammdaten und Bestellungen ab und ist im Pilot zu messen.
- Der offizielle KoSIT-Prüfer ist in diesem Lauf nicht beteiligt. Die zehn
  Testrechnungen A–J laufen in der CI zusätzlich durch den echten Prüfer
  (`kosit-real.test.js`).
- Weitere Ausnahmen (fehlerhafte Datei, gesperrter Lieferant, falsche Summen,
  falscher Empfänger) prüfen die übrigen automatisierten Tests.

## Nachprüfen

Der Test `server/domain/intake/soll-ist.test.js` führt alle 20 Rechnungen aus
und schlägt fehl, sobald eine vom Soll abweicht. Die Fälle stehen in
`server/test-support/soll-ist.js`.

```bash
node --env-file=.env --test server/domain/intake/soll-ist.test.js
```
