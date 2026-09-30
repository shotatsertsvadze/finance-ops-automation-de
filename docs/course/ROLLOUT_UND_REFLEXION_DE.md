# Rollout- und Change-Konzept, Reflexion

Teil des Abschlusspakets, siehe [COURSE_FINAL_DE.md](COURSE_FINAL_DE.md).
Empfohlene Projektdokumentation, keine verbindliche Kursvorgabe.

Das Projekt ist **nicht produktionsreif**. Dieses Konzept beschreibt, wie
ein realistischer Weg in den Betrieb aussehen könnte. Nichts davon hat bisher
mit einem echten Kunden stattgefunden.

---

## Teil A: Rollout- und Change-Konzept

### Stufen

| Stufe | Was passiert | Weiter, wenn |
|---|---|---|
| 1. Demo und interne Validierung | Vorführung mit synthetischen Daten, Feedback von Fachleuten aus Kreditorenbuchhaltung und Finanzen | der Ablauf verstanden wird und die Kontrollen als sinnvoll gelten |
| 2. Analyse echter Kundenprozesse | Interviews und eine Messung des heutigen Aufwands, nach dem Leitfaden in `docs/CUSTOMER_DISCOVERY.md` | ein Partner mit passendem Prozess und messbarer Ausgangslage gefunden ist |
| 3. Pilot mit kontrollierten Daten | Stammdaten des Partners, ausgewählte Rechnungen, Testumgebung; die Anwendung zahlt nichts | die Warnungen stimmen und die Fehlalarme in einem vereinbarten Rahmen bleiben |
| 4. Begrenzter Realprozess-Pilot | eine Gesellschaft, strukturierte Rechnungen, zuerst im Parallelbetrieb („Shadow Mode“): echte Rechnungen laufen mit, der bisherige Prozess bleibt führend. Danach werden die Rechnungen zuerst im System bearbeitet; Zahlungen gibt weiterhin die bestehende Banksoftware frei | die vereinbarten Kriterien erfüllt sind (siehe Pilot-Kennzahlen) |
| 5. Integrations-Härtung | DATEV-Export, Kontoauszüge (camt.053), Postfach-Eingang, Anmeldung über das Firmenkonto (SSO), Hosting mit Backups | die Anbindungen gegen die echten Systeme des Partners getestet sind |
| 6. Breiterer Rollout | weitere Rechnungsformate (CII, ZUGFeRD), weitere Gesellschaften, weitere Nutzergruppen | Betrieb, Support und Datenschutz für den größeren Umfang geklärt sind |

Stufe 2 bis 4 folgen dem Pilotvorschlag im Projekt: eine Gesellschaft,
8 bis 10 Wochen, die ersten vier Wochen im Parallelbetrieb, mit einer
Go/No-go-Entscheidung nach Woche 4 und am Ende.

### Schulung

- **Kreditorenbuchhaltung:** Arbeitsliste lesen, Ausnahmen bearbeiten,
  Rückfragen stellen, neue Bankverbindungen vorschlagen. Kernbotschaft: Das
  System zeigt Belege, die Entscheidung trifft der Mensch.
- **Freigebende:** Was eine Freigabe bedeutet, warum die Funktionstrennung
  gilt und warum manche Prüfungen nicht übersteuert werden können.
- **Finanzen:** Zahlungsweg, Abstimmung, Umgang mit Ausnahmen, Rückruf bei
  neuen Bankverbindungen.
- **Alle:** Die KI-Erklärung – falls eingeschaltet – ist ein Vorschlag,
  keine Entscheidung.

Kurze Schulungen am echten Fall wirken besser als lange Handbücher. Eine
Ansprechperson in der Kreditorenbuchhaltung („Champion“) hilft im Alltag.

### Definition von Freigaberollen

- Vor dem Pilot festlegen: Wer ist Kostenstellenleitung, wer Finanzen, wer
  CFO im Sinne der Freigabestufen?
- Betragsgrenzen mit dem Kunden vereinbaren. Die heutigen Werte sind
  Demo-Annahmen.
- Klären, ob das Team groß genug für drei getrennte Personen bei
  Bankverbindungsänderungen ist. Ein Zwei-Personen-Modus ist bewusst nicht
  gebaut.

### Verantwortung für Stammdaten

- Eine benannte Person oder Stelle verantwortet Lieferanten, Bankverbindungen
  und Bestellungen.
- Vor dem Pilot die Stammdaten bereinigen: Das System ist nur so gut wie die
  Daten, gegen die es prüft.
- Rückrufnummern der Lieferanten müssen stimmen, bevor der Rückrufprozess
  startet.

### Change-Kommunikation

- **Intern:** Das Ziel ist weniger Routinearbeit und weniger Risiko, keine
  Kontrolle einzelner Personen. Kennzahlen sind prozessbezogen.
- **Lieferanten:** Ankündigen, dass eine Änderung der Bankverbindung
  telefonisch unter der bekannten Nummer bestätigt wird. So wirkt der Rückruf
  als Schutz, nicht als Misstrauen.
- **Management:** Nutzen erst nach Messung behaupten. Bis dahin sind alle
  Einsparungen Modellwerte.
- Wo ein Betriebsrat besteht, ihn früh einbinden.

### Pilot-Kennzahlen

Vorschläge aus `docs/CUSTOMER_DISCOVERY.md`, vor dem Start mit dem Partner zu
vereinbaren:

| Bereich | Kennzahl |
|---|---|
| Abdeckung | Anteil strukturierter Rechnungen, die ohne Abtippen gelesen werden |
| Kontrolle | jede IBAN-Abweichung erkannt, keine Zahlung auf ein ungeprüftes Konto |
| Fehlalarme | Anteil markierter Rechnungen, die sich als unauffällig erweisen |
| Aufwand | Bearbeitungszeit pro Rechnung im Vergleich zur Ausgangsmessung |
| Tempo | mittlere Freigabedauer |
| Buchhaltung | Anteil der Buchungssätze, die ohne Nacharbeit übernommen werden |
| Akzeptanz | Team und Freigebende bearbeiten alle Pilotrechnungen im System |
| Datenschutz | Vertrag zur Auftragsverarbeitung vor der ersten echten Rechnung, kein Vorfall |

Wichtig ist, dass Ausgangslage und Pilot mit derselben Methode gemessen
werden. Das Dashboard kennzeichnet schon heute, welche Werte gemessen und
welche angenommen sind.

### Fallback und Rollback

- **Im Parallelbetrieb** bleibt der bisherige Prozess führend. Ein Abbruch
  kostet nichts außer der investierten Zeit.
- **Im Realbetrieb** bleiben Zahlungen während des Pilots in der bestehenden
  Banksoftware. Das System löst selbst keine Zahlung aus.
- **Rückweg:** Der alte Prozess wird während des Pilots nicht abgeschaltet.
  Offene Rechnungen lassen sich aus dem Prüfpfad und dem Buchungsexport
  nachvollziehen und übergeben.
- **Technisch** braucht ein Rollback Backups mit getesteter
  Wiederherstellung. Das gehört zur Integrations-Härtung und fehlt heute.

---

## Teil B: Reflexion und Lessons Learned

**Regeln statt KI für finanzielle Entscheidungen.** Freigabe, Routing und
Zahlung folgen festen Regeln. Das macht sie testbar und erklärbar. Eine
KI-Entscheidung hätte sich an nichts messen lassen außer an den Regeln, die
das System ohnehin anwendet.

**Menschliche Freigabe gehört zur Automatisierung.** Gute Automatisierung
heißt nicht, dass niemand mehr entscheidet. Sie heißt, dass Menschen nur
noch dort entscheiden, wo ihr Urteil gebraucht wird – und dass sie dafür alle
Belege auf einen Blick sehen.

**Fail closed ist eine Designentscheidung, keine Kleinigkeit.** Die Frage
„was passiert, wenn eine Information fehlt?“ musste für jede Prüfung einzeln
beantwortet werden. Beispiel KoSIT: Ein nicht erreichbarer Prüfer darf nicht
wie eine bestandene Prüfung aussehen. Beispiel Rechnungspositionen: Eine
Position ohne Menge galt zuerst nur als „nicht nachgerechnet“ und hielt die
Rechnung nicht auf. Heute geht eine solche Rechnung in die manuelle
Prüfung.

**Testdaten müssen echte Standards erfüllen.** Die eigenen Testrechnungen
wurden vom eigenen Parser akzeptiert. Erst der offizielle KoSIT-Prüfer
zeigte, dass sie den Standard nicht erfüllten. Seit der Korrektur akzeptiert
er alle Rechnungen, die gültig sein sollen, und lehnt nur die bewusst
fehlerhaften ab (65 von 70 im Demomonat).

**Prüfpfad und Idempotenz sind fachliche Anforderungen.** Wer wann was
entschieden hat, und dass eine Zahlung nicht doppelt ausgelöst werden kann,
sind Kernanforderungen der Finanzbuchhaltung. Sie wurden deshalb von Anfang
an in die Datenbank und die Statuswechsel eingebaut, nicht nachträglich.

**Offizielle und fachliche Prüfung sind verschiedene Ebenen.** Die
Demo-Rechnung mit geänderter IBAN ist formal eine einwandfreie E-Rechnung.
KoSIT hat nichts einzuwenden. Erst der Abgleich mit den eigenen Stammdaten
zeigt, dass sie auf das falsche Konto zahlen würde.

**KI ist hier als Erklärung nützlich, nicht als Entscheider.** Eine
Erklärung lässt sich gegen die Belege prüfen, und ein Fehler kostet einen
Moment. Offen bleibt, ob sie im Alltag Zeit spart. Das muss ein Pilot messen;
eine Bewertung mit dem echten Modell steht noch aus.

**Ehrliche Kennzahlen.** Jede Zahl im Dashboard nennt ihre Quelle.
Einsparungen sind als Modellwert gekennzeichnet, Kundenwerte als „nicht
gemessen". Eine beeindruckende Zahl ohne Herkunft hätte der Glaubwürdigkeit
mehr geschadet als genützt.

**Grüne Tests beweisen nicht alles.** Zwei unabhängige Reviews fanden
Schwachstellen, obwohl alle Tests grün waren – zum Beispiel, dass eine
hochgeladene Datei im Browser Code ausführen konnte. Auch später rutschten
Fehler durch, die kein Test abdeckte: ein fehlerhafter Text in den Demodaten
und ein Vorführskript, das nach einer Änderung nicht mehr durchlief. Noch
nach dem Feature Freeze fand ein weiteres Review drei Lücken, darunter zwei
gleichzeitige Zahlungen, die dieselbe Gutschrift verrechnen konnten. Alle drei
wurden erst nachgestellt, dann behoben und mit eigenen Tests abgesichert.
Unabhängige Durchsicht und das Ausprobieren in der Oberfläche bleiben nötig.

**Dokumentation driftet.** Mehrfach stimmten Dokumente nicht mehr mit dem
Code überein und mussten an einen frischen Demolauf angeglichen werden.
Hilfreich war, Zahlen in der Dokumentation durch automatische Tests
abzusichern, wo es möglich war.

**Umfang begrenzen hat das Projekt besser gemacht.** CII/ZUGFeRD, die
Kundeninterviews und externe Orchestrierung wurden bewusst nach hinten
verschoben. Dafür sind die Kernkontrollen umgesetzt und getestet.

**Der Feature Freeze hat späten Umfang verhindert.** Nach dem Freeze kamen
nur noch Fehlerbehebung, korrigierende Härtung, Darstellung und
Dokumentation hinzu. So blieb Zeit
für Stabilität und Präsentation, statt kurz vor Schluss neue Funktionen
einzubauen.

**Was ich anders machen würde.** Die Gespräche mit echten Unternehmen früher
beginnen: Alle Nutzenzahlen sind bisher Annahmen. Und für die KI-Funktion
von Anfang an ein Budget für die Bewertung mit dem echten Modell einplanen.
