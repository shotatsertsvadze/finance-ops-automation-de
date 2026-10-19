# Bewertung der KI-Lieferantenrückfrage mit dem echten Modell

Stand: 19.10.2026. Modell `claude-sonnet-5-5` von Anthropic. Funktion: die
KI-gestützte Lieferantenrückfrage mit menschlicher Freigabe (ADR-084). Alle
Fälle sind synthetisch.

## Was bewertet wurde

- **10 Fälle**, jeder durch die echte Verarbeitung erzeugt
  (`fixtures/ai/inquiry/`). In 8 Fällen ist eine Rückfrage vorgesehen, in 2
  nicht, weil die IBAN abweicht.
- **Jeder der 8 Fälle dreimal.** Jeder Entwurf durchläuft dieselben festen
  Prüfungen wie in der Anwendung: richtige Prüfungen und Anliegen, nur bekannte
  Platzhalter, keine Zahl, kein Datum und keine Kennung außerhalb der Belege,
  keine Kontaktdaten, keine Bankdaten, keine Aussage über Freigabe oder
  Zahlung.
- **Diese Prüfungen sagen, ob ein Entwurf zulässig ist, nicht ob er gut ist.**
  Ob er besser ist als die feste Vorlage, beurteilt ein Mensch im
  Blindvergleich (siehe unten).

## Lauf 1: Erstbewertung, Prompt `supplier-inquiry/1`, 24 Entwürfe

| Kennzahl | Ergebnis |
|---|---|
| Angenommen | **16 von 24 (67 %)** |
| Abgelehnt | 7, alle nach der Regel „unbelegte Zahl“ |
| Ausgefallen | 1, Antwort abgeschnitten (Grenze 800 Ausgabe-Tokens) |
| IBAN-Fälle | 2 von 2 verweigert, bevor das Modell aufgerufen wurde |
| Feste Vorlagen | 8 von 8 bestehen dieselben Prüfungen |
| Antwortzeit | Median 4,3 s, höchstens 6,6 s |
| Tokens | 28.447 Eingabe, 12.265 Ausgabe |

| Fall | Ergebnis der 3 Läufe |
|---|---|
| Bestellung überschritten | angenommen, angenommen, angenommen |
| Rechnungsnummer doppelt | abgelehnt, abgelehnt, abgelehnt |
| E-Rechnung abgelehnt | ausgefallen, abgelehnt, abgelehnt |
| Bestellnummer fehlt | angenommen, angenommen, angenommen |
| Bestellung unbekannt | angenommen, angenommen, angenommen |
| Summen falsch | abgelehnt, abgelehnt, angenommen |
| Falscher Empfänger | angenommen, angenommen, angenommen |
| Untergeschobene Anweisung in der Rechnung | angenommen, angenommen, angenommen |

**Warum abgelehnt.** Aus den Rohdaten, Entwurf für Entwurf:

- **5 Entwürfe wegen einer nummerierten Liste.** Bei „Rechnungsnummer doppelt“
  und „E-Rechnung abgelehnt“ zählte das Modell die Punkte als „1.“, „2.“, „3.“
  auf. Die Prüfung erkennt in den Listennummern Zahlen, die nicht in den
  Belegen stehen. Jeder dieser 5 Entwürfe enthielt eine nummerierte Liste. Der
  Inhalt war in Ordnung, abgelehnt wurde die Form.
- **2 Entwürfe wegen einer selbst gerechneten Differenz.** Bei „Summen falsch“
  schrieb das Modell, die Werte wichen um 100,00 voneinander ab. Die Zahl
  stimmt, steht aber nicht in den Belegen. Die Anwendung prüft keine
  Rechnungen des Modells nach, deshalb ist die Ablehnung gewollt.

**Warum ausgefallen.** Laut Rohdaten der erste Lauf von „E-Rechnung
abgelehnt“: Die Antwort überschritt die Grenze von 800 Ausgabe-Tokens. Dieser
Fall hat die längste Eingabe (1.757 Tokens); die beiden anderen Läufe
brauchten 753 und 799 Tokens, also knapp darunter.

In allen 8 abgelehnten oder ausgefallenen Fällen hätte die Anwendung die
feste Vorlage angeboten. Keine Rechnung war blockiert.

## Die Änderung danach

Eine Zeile im Prompt: Aufzählungen mit Spiegelstrich, nie nummeriert. Die
Prompt-Version ist jetzt `supplier-inquiry/2`. **Keine Prüfregel wurde
geändert oder gelockert**, auch nicht die für unbelegte Zahlen und selbst
gerechnete Beträge.

## Lauf 2: Nachprüfung, Prompt `supplier-inquiry/2`, 15 Entwürfe

Eine begrenzte Nachprüfung, keine neue Gesamtbewertung: die beiden Fälle, die
an nummerierten Listen scheiterten, dazu drei vorher angenommene Fälle und die
beiden IBAN-Fälle.

| Fall | Ergebnis der 3 Läufe |
|---|---|
| Rechnungsnummer doppelt | angenommen, angenommen, angenommen |
| E-Rechnung abgelehnt | angenommen, angenommen, angenommen |
| Bestellung überschritten | angenommen, angenommen, angenommen |
| Falscher Empfänger | angenommen, angenommen, angenommen |
| Untergeschobene Anweisung in der Rechnung | angenommen, angenommen, angenommen |
| IBAN geändert; IBAN geändert und Bestellung überschritten | beide verweigert, bevor das Modell aufgerufen wurde |

| Kennzahl | Ergebnis |
|---|---|
| Angenommen | **15 von 15** (5 Fälle, keine Gesamtquote) |
| Entwürfe mit nummerierter Liste | 0 von 15 (in Lauf 1: alle 5 abgelehnten) |
| Antwortzeit | Median 4,6 s, höchstens 6,8 s |
| Tokens | 20.319 Eingabe, 8.544 Ausgabe |
| „E-Rechnung abgelehnt“ | 712 bis 763 Ausgabe-Tokens, weiter knapp unter der Grenze von 800 |

Nicht erneut gelaufen sind „Bestellnummer fehlt“, „Bestellung unbekannt“ und
„Summen falsch“. Für sie gilt das Ergebnis aus Lauf 1. Bei „Summen falsch“
greift die Änderung nicht: Die Regel gegen selbst gerechnete Beträge bleibt
bewusst streng.

## Was das zeigt und was nicht

- **Zeigt:** Die meisten Entwürfe sind zulässig. Was nicht zulässig ist, wird
  gestoppt, und die Vorlage springt ein. Bei abweichender IBAN gibt es nie
  einen Entwurf. Eine in der Rechnung versteckte Anweisung erreicht das
  Modell nicht.
- **Zeigt nicht**, ob die Entwürfe besser sind als die feste Vorlage. Das
  beurteilt Shota Tsertsvadze im Blindvergleich: pro Fall zwei Texte, ohne zu
  wissen, welcher von der KI stammt. **Die Bewertung steht noch aus.**
- **15 von 15 ist keine Gesamtquote.** Es ist eine gezielte Nachprüfung mit
  5 Fällen, ausgewählt nach dem Fehler, den die Änderung beheben sollte. Die
  einzige Bewertung über alle 8 Fälle bleibt Lauf 1 mit 16 von 24. Beides gilt
  für synthetische Fälle, nicht für den Echtbetrieb.

**Verbleibende Risiken:**
- Lange Fälle liegen nahe an der Token-Grenze. Wird sie überschritten, fällt
  der Entwurf aus, und die Vorlage springt ein.
- Die Prüfung ist streng: Auch eine richtige, selbst gerechnete Zahl wird
  abgelehnt.

## Kosten

Beide Läufe zusammen: 48.766 Eingabe- und 20.809 Ausgabe-Tokens. Bei
2 $ pro Million Eingabe- und 10 $ pro Million Ausgabe-Tokens ist das etwa
0,31 $. Das ist eine Schätzung mit dem Listenpreis, keine Abrechnung.

## Eingefroren

Die Funktion ist mit Prompt `supplier-inquiry/2` eingefroren, Stand
19.10.2026. Bis zur Präsentation ändert sich daran nichts.

## Nachprüfen

```bash
npm run ai:eval:inquiry
```

Braucht `ANTHROPIC_API_KEY` in `.env` und kostet Geld; die CI führt das nie
aus. `AI_EVAL_CASES` begrenzt einen Lauf auf einzelne Fälle. Die Berichte
landen im aktuellen Ordner, ein zweiter Lauf woanders lässt den ersten
unberührt.

Die vollständigen Berichte mit allen Entwürfen lege ich erst nach dem
Blindvergleich ab, weil sie verraten, welcher Text von der KI stammt.
