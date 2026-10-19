# Finance Operations Automation (DE) – Projektabschluss

Stand: 30. September 2026, Feature Freeze. Grundlage ist der Code auf `main`.

> **Nachtrag 19. Oktober 2026.** Seitdem dazugekommen:
>
> - **Eingang per E-Mail über n8n** mit Protokoll in Google Sheets, für die
>   Präsentation. n8n transportiert nur, die Regeln bleiben in der Anwendung.
> - **KI-gestützte Lieferantenrückfrage** mit menschlicher Freigabe
>   (ADR-084). Der Feature Freeze wurde nur dafür aufgehoben.
> - **Soll/Ist-Auswertung** mit 20 synthetischen Rechnungen:
>   [SOLL_IST_DE.md](SOLL_IST_DE.md).
> - **Prozess- und Datenflussdiagramm** auf Deutsch:
>   [DATENFLUSS_DE.md](DATENFLUSS_DE.md).
> - Datenschutzkonzept um n8n, Google Sheets und den Demo-Tunnel ergänzt.
>
> Die Abschnitte 2, 5, 8 und 9 sind entsprechend angepasst.

> **Einordnung.** Die genaue Bewertungsgrundlage des Kurses liegt im
> Repository nicht vor. Diese Unterlagen sind deshalb als **empfohlene
> Projektdokumentation** zu verstehen, nicht als Abbildung einer
> verbindlichen Kursvorgabe. Die Gliederung folgt der Kursebene, die im
> Projektplan vorgesehen ist (`docs/FINANCE_OPS_2_PLAN.md`): Stakeholder,
> Risiken, Datenschutz, Methode und Zeitverlauf, Rollout, Reflexion.

Das Paket besteht aus drei Dokumenten:

| Dokument | Inhalt |
|---|---|
| dieses Dokument | Problem, Lösung, Automatisierung, Kontrollen, Freigabe, KI, Stakeholder, Methode, Status, Ausblick |
| [RISIKO_UND_DATENSCHUTZ_DE.md](RISIKO_UND_DATENSCHUTZ_DE.md) | Risikoanalyse und Datenschutzkonzept |
| [ROLLOUT_UND_REFLEXION_DE.md](ROLLOUT_UND_REFLEXION_DE.md) | Rollout- und Change-Konzept, Lessons Learned |

Die technischen Details stehen in den bestehenden Dokumenten auf Englisch:
`docs/ARCHITECTURE.md` (Aufbau, Zustände, Schnittstellen),
`docs/DECISIONS.md` (84 Architekturentscheidungen, kurz ADR),
`docs/TEST_MATRIX.md` (was wie getestet ist) und `docs/DEMO.md` (Ablauf der
Vorführung).

---

## 1. Projektübersicht

### Das Problem

Unternehmen in Deutschland erhalten immer mehr strukturierte
E-Rechnungen von ihren Lieferanten. Seit 2025 müssen sie E-Rechnungen im
B2B-Bereich empfangen können; die Pflicht zum Versenden folgt schrittweise
2027 und 2028.¹

Eine E-Rechnung ist maschinenlesbar. Das Abtippen entfällt also. Die
eigentliche Arbeit beginnt aber erst danach, und sie ist in vielen
Unternehmen noch Handarbeit:

- **Technische Prüfung:** Ist die Datei überhaupt eine gültige E-Rechnung?
- **Lieferantenprüfung:** Kennen wir diesen Lieferanten, und ist er aktiv?
- **Prüfung der Bankverbindung:** Stimmt die IBAN mit unseren Stammdaten
  überein? Eine geänderte Bankverbindung ist ein typisches und besonders
  relevantes Betrugsrisiko.
- **Bestellprüfung:** Gibt es eine Bestellung, und passt der Betrag?
- **Freigabe:** Wer muss zustimmen, und hat er es getan?
- **Ausnahmebehandlung:** Wer kümmert sich um die Rechnung, die nicht passt?
- **Zahlungsvorbereitung:** Welche Rechnung darf bezahlt werden?
- **Abstimmung:** Ist das Geld wirklich geflossen, und zu welcher Rechnung
  gehört die Buchung auf dem Kontoauszug?

Heute passiert vieles davon per E-Mail, nach Gedächtnis und ohne
nachvollziehbare Spur (`docs/IST_PROCESS.md`, fiktives Beispiel).

¹ Stand der Projektrecherche in `docs/CUSTOMER_DISCOVERY.md`. Vor einer
Verwendung gegenüber Kunden den aktuellen Stand prüfen.

### Die Lösung

Das Projekt automatisiert den Weg einer Eingangsrechnung vom Eingang bis zur
Abstimmung mit dem Kontoauszug:

```
Rechnungseingang
→ technische Validierung
→ offizielle KoSIT-Validierung
→ fachliche Prüfung gegen die eigenen Stammdaten
→ deterministisches Routing
→ menschliche Prüfung und Freigabe, wenn nötig
→ Buchungssatz und simulierte Zahlung
→ Abstimmung mit dem Kontoauszug
→ Kennzahlen und Prüfpfad für jeden Statuswechsel
```

In einfachen Worten: Das System prüft jede Rechnung zuerst technisch und
danach anhand klarer Geschäftsregeln. Ist alles in Ordnung und der Betrag
klein, geht die Rechnung ohne Handarbeit weiter. Ist etwas auffällig, wird
sie nicht automatisch weiterverarbeitet. Sie landet bei der richtigen Person,
zusammen mit dem Grund: was erwartet wurde und was tatsächlich in der
Rechnung steht.

Zwei Begriffe kurz erklärt:

- **KoSIT** ist die Koordinierungsstelle für IT-Standards. Sie
  veröffentlicht den offiziellen Prüfer (Validator) für XRechnung. Das System
  nutzt genau diesen Prüfer, in einer festgelegten Version, lokal betrieben.
- **Deterministisch** heißt: Gleiche Eingabe, gleiches Ergebnis. Es gibt
  keine Schätzung und kein Modell, das „meint“, eine Rechnung sei in Ordnung.

Das Demo-Unternehmen ist die fiktive Nordwerk GmbH. Alle Daten sind
synthetisch.

### Was das Projekt nicht ist

- **Kein ERP-System.** Es bereitet einen Buchungssatz vor und übergibt ihn.
  Die Buchhaltung selbst bleibt woanders.
- **Kein Zahlungsdienstleister.** Zahlungen und Kontoauszüge sind simuliert.
  Es fließt kein Geld.
- **Keine produktionsreife Buchhaltungsplattform.** Es ist ein
  Proof of Concept mit produktionsnaher Kontrolllogik. Was für einen echten
  Betrieb fehlt, steht in Abschnitt 8.

Das Projekt beansprucht keine Konformität mit EN 16931, GoBD oder DSGVO
(ADR-008). Die KoSIT-Prüfung liefert eine Bewertung. Das System zertifiziert
nichts.

---

## 2. Die Automatisierung ist in der Anwendung umgesetzt

> Die Automatisierungslogik ist direkt in der Anwendung umgesetzt: über
> deterministische Zustandsübergänge, Validierungsregeln, menschliche
> Freigabepunkte und automatische Revalidierung.

Für diese Automatisierung braucht es kein externes Werkzeug wie n8n. Die
Regeln, die Zustände und die Freigaben liegen an einer Stelle: im Server der
Anwendung. Das war eine bewusste Entscheidung (ADR-004). Für die Präsentation
übernimmt n8n nur den Eingang per E-Mail und das Protokoll in Google Sheets,
ohne eine einzige Regel (Abschnitt 9).

### Kernprozess der Rechnungsautomatisierung

```
Rechnungseingang → Validierung → Routing → Prüfung/Freigabe → Zahlung → Abstimmung
```

- Mit dem Hochladen einer Rechnung startet die gesamte Prüfkette sofort.
- Das Routing entscheidet nach festen Regeln:
  - Eine technische Prüfung schlägt fehl → manuelle Prüfung.
  - Eine wichtige fachliche Prüfung schlägt fehl → manuelle Prüfung, mit dem
    Grund.
  - Eine Rechnungsposition lässt sich nicht sicher nachrechnen, etwa weil
    Menge oder Preis fehlen → manuelle Prüfung.
  - Alles in Ordnung, Betrag bis 500 EUR → automatisch freigegeben.
  - Alles in Ordnung, höherer Betrag → Freigabe durch die zuständigen
    Rollen, gestaffelt nach Betrag.
- Nach der Freigabe folgen Buchungssatz, Zahlungsanweisung und Bestätigung.
- Die Abstimmung ordnet Kontoauszugszeilen den Zahlungen zu. Was nicht
  eindeutig passt, wird eine Ausnahme für einen Menschen.

Die Betragsgrenzen sind Demo-Annahmen, keine gesetzlichen Vorgaben. Sie sind
konfigurierbar, und jede Routing-Entscheidung speichert die Regeln, nach
denen sie getroffen wurde.

### IBAN-Kontrollworkflow

```
IBAN-Abweichung
→ kontrollierter Vorschlag für eine neue Bankverbindung
→ unabhängige Verifizierung per Rückruf
→ Freigabe
→ vertrauenswürdige Stammdaten werden ergänzt
→ automatische Revalidierung der betroffenen Rechnung
```

- Die Rechnung stoppt, weil ihre IBAN nicht zu den hinterlegten Konten des
  Lieferanten passt. Diese Abweichung kann niemand einfach „durchwinken“.
- Eine Person schlägt die neue Bankverbindung zur Prüfung vor. Die Rechnung
  selbst ändert nie die Stammdaten.
- Eine zweite Person ruft den Lieferanten an – und zwar unter der Nummer,
  die bereits in den Stammdaten steht, nicht unter einer Nummer aus der
  Rechnung. Der Lieferant liest die IBAN vor.
- Eine dritte Person gibt frei. Erst dann wird das Konto als
  vertrauenswürdig ergänzt.
- Danach prüft das System die betroffenen Rechnungen automatisch neu. Eine
  frühere Ausnahme geht dabei in die Freigabe, nie direkt auf „freigegeben“.
  Eine Rechnung mit offener Rückfrage wartet, bis die Antwort da ist.

### Merkmale der Automatisierung

| Merkmal | Wie es im System umgesetzt ist |
|---|---|
| **Trigger** | Das Hochladen startet die Prüfkette. Die Freigabe einer neuen Bankverbindung startet die Revalidierung. Die letzte Freigabestufe setzt die Rechnung auf „freigegeben“. Der Import eines Kontoauszugs und der Abgleich werden von Finanzen angestoßen. Zeitgesteuerte Trigger gibt es noch nicht. |
| **Deterministische Regeln** | Jede Prüfung liefert ein strukturiertes Ergebnis: Status, Schwere, erwartet, gefunden, Grund, empfohlener nächster Schritt. Das Routing ist eine reine Funktion dieser Ergebnisse und der Betragsregeln. |
| **Zustandsmaschine** | Jede Rechnung hat genau einen Status. Welche Wechsel erlaubt sind, steht in einer festen Tabelle. Der Status ändert sich nur über eine einzige Funktion, die gleichzeitig den Prüfpfad schreibt. Für Bankverbindungsänderungen gibt es eine eigene, gleich aufgebaute Zustandsmaschine. |
| **Routing** | Auffällige Rechnungen gehen in die Prüfung, saubere in die passende Freigabestufe oder direkt weiter. Jede Warteschlange zeigt, wer handeln muss und warum. |
| **Human-in-the-loop** | Menschen entscheiden dort, wo Urteilsvermögen gefragt ist: Ausnahmen, Freigaben, neue Bankverbindungen, unklare Zahlungseingänge. Die Oberfläche orientiert sich an Rolle und Status. Verbindlich entscheidet jedoch immer der Server, ob eine Aktion für die konkrete Rechnung und Person zulässig ist. |
| **Retry** | Nach einem Ausfall des KoSIT-Prüfers werden die betroffenen Rechnungen gezielt neu geprüft, angestoßen über die Schnittstelle; eine Schaltfläche dafür fehlt noch. Eine fehlgeschlagene Zahlung kann als neuer Versuch erneut angewiesen werden. Eine abgebrochene Verarbeitung wird beim erneuten Hochladen derselben Datei fortgesetzt. |
| **Idempotenz und Parallelität** | Kritische Zahlungs- und Verrechnungsabläufe verwenden serverseitige Sperren und Datenbanktransaktionen, um wiederholte oder parallele Verarbeitung kontrolliert zu behandeln. Beispiele: Dieselbe Datei wird als Duplikat erkannt. Jede Zahlungsanweisung hat einen eigenen Idempotenzschlüssel, und pro Rechnung ist höchstens eine Zahlung aktiv. Eine Gutschrift wird auch bei zwei gleichzeitigen Zahlungen nur einmal verrechnet. Ein Kontoauszug kann gefahrlos zweimal importiert werden. |
| **Auditierbarkeit** | Jeder Statuswechsel wird mit Person, Zeitpunkt, Grund und Beleg gespeichert, in derselben Datenbanktransaktion. Prüfergebnisse bleiben pro Prüflauf erhalten. Eine Freigabe ist an das Dokument, den Prüflauf und den Betrag gebunden, für die sie erteilt wurde. |
| **Fail closed** | Besteht eine Rechnung eine Prüfung nicht, geht sie in die manuelle Prüfung, nicht in die Freigabe. Unvollständige oder nicht zuverlässig prüfbare Rechnungspositionen werden nicht automatisch freigegeben, sondern zur manuellen Prüfung weitergeleitet. Ist der KoSIT-Prüfer eingerichtet, aber nicht erreichbar, gilt die Rechnung als nicht geprüft. Im Produktionsmodus startet die Anwendung ohne ihn gar nicht. |

---

## 3. Architektur und Kontrollen

Das System ist eine Webanwendung aus einem Server (Node.js), einer Datenbank
(PostgreSQL) und einer Oberfläche (React). Die Geschäftsregeln liegen
ausschließlich im Server. Die Oberfläche zeigt an, entscheidet aber nichts.

Die wichtigsten eingebauten Kontrollen:

- **Belege statt Urteile.** Das System sagt nicht „verdächtig“. Es zeigt,
  was erwartet wurde und was in der Rechnung steht. Bei einer IBAN sind die
  abweichenden Zeichen markiert.
- **Beträge werden nachgerechnet.** Jede Zeile und jede Summe wird aus den
  Einzelwerten neu berechnet, auf den Cent genau. Lässt sich eine Zeile nicht
  nachrechnen, geht die Rechnung in die manuelle Prüfung.
- **Manche Prüfungen lassen sich nicht übersteuern.** Eine geänderte IBAN,
  ein Rechenfehler in den Summen oder eine abgelehnte KoSIT-Prüfung kann kein
  Prüfer freigeben.
- **Letzte Kontrolle vor der Freigabe.** Bevor eine Freigabe gespeichert
  wird, laufen die fachlichen Prüfungen noch einmal gegen die aktuellen
  Stammdaten.
- **Die Zahlung prüft das Konto erneut.** Bezahlt wird nur auf ein aktives,
  hinterlegtes Konto eines aktiven Lieferanten, geprüft im Moment der
  Anweisung.
- **Geschützter Prüfpfad.** Im Produktionsmodus darf die Datenbankrolle der
  Anwendung den Prüfpfad nur ergänzen, nicht ändern oder löschen. Ein Start mit
  unsicherer Konfiguration wird verweigert, zum Beispiel mit dem
  Demo-Passwort oder ohne KoSIT-Prüfer.

Qualitätssicherung: 745 automatisierte Tests, darunter Tests gegen eine echte
Datenbank, Browsertests und Tests gegen den echten KoSIT-Prüfer. Sie laufen
bei jeder Änderung automatisch in der CI, zusammen mit einer
Sicherheitsprüfung der Abhängigkeiten, dem Build und einem Start der
Docker-Demo.

---

## 4. Die Rolle der menschlichen Freigabe

Menschliche Freigabe ist hier kein Zeichen fehlender Automatisierung. Sie ist
ein Teil davon. Das System übernimmt das Prüfen, Sortieren und Weiterleiten.
Menschen entscheiden dort, wo es um Urteil und Verantwortung geht.

Freigabestufen (Demo-Annahmen, konfigurierbar):

| Bruttobetrag | Freigabe |
|---|---|
| bis 500 EUR, ohne Auffälligkeit | automatisch |
| bis 5 000 EUR | Kostenstellenleitung |
| bis 25 000 EUR | Kostenstellenleitung und Finanzen |
| darüber | Kostenstellenleitung, Finanzen und CFO |

Funktionstrennung, vom Server erzwungen:

- Wer eine Ausnahme aus der Prüfung entlässt, darf diese Rechnung nicht
  freigeben (Vier-Augen-Prinzip).
- Wer eine Rechnung eingereicht hat, darf sie nicht freigeben.
- Niemand entscheidet zwei Freigabestufen derselben Rechnung.
- Wer freigegeben hat, darf die Zahlung weder anweisen noch bestätigen.
- Eine neue Bankverbindung braucht drei verschiedene Personen: Vorschlag,
  Rückruf, Freigabe.
- Eine Prüfung endet nie direkt in „freigegeben“. Sie endet immer in
  mindestens einer Freigabestufe.

---

## 5. KI: Rolle und Grenzen

Die KI-Funktion ist **optional, standardmäßig ausgeschaltet und ohne
Entscheidungsbefugnis**. Sie liegt außerhalb des finanziellen
Entscheidungswegs. Die Demo, die Tests und die CI laufen ohne sie.

**Was sie tut.** Bei einer gestoppten Rechnung kann ein Prüfer auf Knopfdruck
eine kurze Erklärung anfordern: Warum ist die Rechnung gestoppt, und was wäre
ein möglicher nächster Schritt? Die Erklärung ist sichtbar als
„KI-generierter Vorschlag – keine Entscheidung“ gekennzeichnet.

**Was sie nicht tut.** Die KI entscheidet nichts. Sie hat keinen Einfluss auf
Routing, Freigabe, Stammdaten, Zahlung oder Abstimmung. Ein automatischer
Test schlägt fehl, sobald Workflow-, Routing-, Freigabe-, Stammdaten- oder
Zahlungscode die KI-Funktion einbindet. Die regelbasierten Prüfergebnisse
bleiben die Grundlage und stehen auf dem Bildschirm über der Erklärung.

**Wie sie abgesichert ist:**

- Für die Erklärung werden nur ausdrücklich freigegebene, minimierte
  Prüfinformationen verwendet. Dokumentbasierte Rohwerte werden
  standardmäßig nicht übertragen; KoSIT-Fehlermeldungen werden auf
  Regelcodes reduziert.
- IBANs erscheinen nur gekürzt, mit den ersten und letzten vier Zeichen.
  Namen von Lieferant, Käufer und Firma, Kommentare und die Rechnungsdatei
  selbst werden nicht gesendet.
- Jede Antwort wird vor der Anzeige gegen die Belege geprüft. Nennt sie eine
  Zahl oder Kennung, die nicht in den Belegen steht, oder klingt sie nach
  Freigabe oder Zahlung, wird sie nicht angezeigt. Das garantiert nicht,
  dass sie richtig ist. Deshalb bleibt sie ein gekennzeichneter Vorschlag.
- Der genaue Input, der gesendet wurde, wird gespeichert.

**Stand der Bewertung.** Die Funktion ist implementiert und mit
deterministischen Tests und einem Test-Stellvertreter für den Anbieter
geprüft. Eine Bewertung mit dem echten Modell (Anthropic, `claude-sonnet-4-6`)
steht noch aus, weil für das Projekt keine kostenpflichtige API-Nutzung
freigeschaltet ist. Grenzen der Absicherung: Widersprüche im freien Text
werden nur über eine Liste von Formulierungen erkannt (ADR-080).

Warum die KI hier nur erklärt: Eine Erklärung lässt sich an den Belegen
messen, und eine falsche kostet einen Prüfer einen Moment. Eine falsche
Freigabe bewegt Geld.

**Nachtrag: Entwurf der Lieferantenrückfrage (ADR-084).** Bei einer Ausnahme
kann ein Prüfer einen Entwurf der Rückfrage an den Lieferanten anfordern. Das
Modell schreibt Platzhalter wie `{{rechnungsnummer}}`, nie Werte aus der
Rechnung; die Anwendung setzt die Werte erst nach der Prüfung ein. Ein Mensch
bearbeitet den Text, gibt ihn frei und versendet ihn von Hand. Erst „von Hand
versendet“ ändert den Status der Rechnung. Bei einer abweichenden IBAN gibt es
keinen Entwurf, nur den Rückruf. Fällt das Modell aus, steht eine feste Vorlage
bereit. Standardmodell ist seitdem `claude-sonnet-5-5`; die Bewertung mit dem
echten Modell steht für beide KI-Funktionen noch aus.

---

## 6. Stakeholder-Analyse

| Stakeholder | Interesse | Rolle im Prozess | Wichtigste Anforderung oder Sorge |
|---|---|---|---|
| Kreditorenbuchhaltung (Accounts Payable) | weniger Abtippen und Nachfragen, klare Arbeitsliste | lädt Rechnungen hoch, prüft Ausnahmen, schlägt neue Bankverbindungen vor | Warnungen müssen stimmen; zu viele Fehlalarme kosten mehr Zeit, als sie sparen |
| Finance Operations (Rolle „Finanzen“) | ein Prozess, der vom Eingang bis zur Abstimmung durchläuft | prüft, gibt frei, bucht, weist Zahlungen an, bearbeitet Abstimmungsausnahmen | klare Zuständigkeiten, Funktionstrennung, nachvollziehbare Ausnahmen |
| Finance Manager / Leitung Finanzbuchhaltung | Kontrolle über Regeln, Fristen und Qualität | legt Freigabegrenzen und Verantwortlichkeiten fest; die Grenzen sind heute Konfiguration | Regeln müssen konfigurierbar und im Prüfpfad nachvollziehbar sein |
| Kostenstellenleitung | schnelle, einfache Freigabe | entscheidet die erste Freigabestufe; eine Zuordnung nach Kostenstelle ist noch nicht gebaut | wenig Aufwand pro Freigabe, klare Grundlage |
| CFO / Freigabeverantwortliche | Schutz vor Betrug und Fehlzahlungen | letzte Freigabestufe bei hohen Beträgen, Freigabe neuer Bankverbindungen | keine Zahlung auf ein ungeprüftes Konto; Verantwortung klar dokumentiert |
| Einkauf / Procurement | Bestellungen werden eingehalten | verantwortet Bestellungen und klärt Überschreitungen; Bestellungen sind im System heute nur hinterlegte Stammdaten | Abweichungen von der Bestellung früh sehen, nicht erst nach der Zahlung |
| Lieferantenkontakt | pünktliche, richtige Zahlung | liefert die E-Rechnung, bestätigt Bankverbindungen per Rückruf | ein Rückruf bei Kontowechsel darf nicht wie Misstrauen wirken; Zahlungen dürfen sich nicht verzögern |
| IT / Systemadministration | stabiler, sicherer Betrieb | betreibt Anwendung, Datenbank und KoSIT-Prüfer | Hosting, Backups, Zugangsverwaltung, Updates; die Administration nimmt bewusst an keiner Bankverbindungsänderung teil |
| Steuerberater / Buchhaltungspartner | saubere Übergabe in die Buchhaltung | übernimmt Buchungssätze, meist in DATEV | Export ohne Nacharbeit; die DATEV-Anbindung ist noch nicht gebaut |
| Management | Transparenz, Kosten, Risiko | entscheidet über Pilot und Einführung | belastbare Zahlen statt Versprechen; der Nutzen ist bisher modelliert, nicht gemessen |

Für einen echten Pilot kommen laut Projektplan weitere Beteiligte hinzu:
Datenschutzbeauftragte, gegebenenfalls der Betriebsrat, Wirtschaftsprüfer
und die Hausbank.

---

## 7. Projektmethode und Zeitverlauf

### Vorgehen

Das Projekt wurde in kurzen, abgeschlossenen Schritten gebaut. Jeder Schritt
folgte demselben Muster:

```
Design → Tests → Implementierung → Verifikation → CI → Merge
```

- **Design:** Die Entscheidung wird vorher festgehalten, als ADR in
  `docs/DECISIONS.md`. Heute sind es 83.
- **Tests:** Was das System können soll, steht in `docs/TEST_MATRIX.md`, mit
  dem zugehörigen Test.
- **Verifikation:** Jede Änderung läuft gegen die vollständige Testsuite.
  Wichtige Abläufe werden zusätzlich in der Oberfläche geprüft.
- **CI und Merge:** Jede größere Funktion kam auf einem eigenen Branch, per
  Pull Request, mit grüner CI.

Riskante Vorhaben wurden zuerst mit einer **Machbarkeitsprüfung (Spike)**
erkundet. Beispiel: Vor dem Einbau des KoSIT-Prüfers wurde getestet, ob er
lokal läuft und ob die Testdaten den offiziellen Standard wirklich erfüllen.
Das taten sie zunächst nicht, und das wurde vor der Integration behoben.

Zusätzlich gab es zwei unabhängige Reviews der Kontrolllogik
(`docs/PHASE_0_INDEPENDENT_REVIEW.md`, `docs/PROJECT_REVIEW_2026-09-17.md`).
Ihre Befunde wurden behoben und dokumentiert. Ein weiteres Review kurz vor
dem Abschluss fand drei Lücken. Sie wurden zuerst nachgestellt, dann im
Feature Freeze als korrigierende Härtung behoben (PR #13, ADR-081 bis
ADR-083).

### Zeitverlauf

| # | Phase | Zeitraum | Ergebnis |
|---|---|---|---|
| 1 | Funktionsfähiger PoC | 17.–18.09.2026 | End-to-End-Ablauf vom Eingang bis zu den Kennzahlen, echte Anmeldung, Gutschriften, englische Oberfläche, CI; zwei unabhängige Reviews und deren Behebung |
| 2 | Härtung sowie Dokumentations- und Baseline-Bereinigung | 23.–29.09.2026 | Kontrollen nachgeschärft (IBAN nie durchwinkbar, Funktionstrennung bei Zahlungen, geschützter Prüfpfad, sicherer Produktionsstart), Demo mit einem Befehl, Dokumentation an einen frischen Demolauf angeglichen |
| 3 | XRechnung-Konformität der Testdaten und KoSIT-Vorbereitung | 29.–30.09.2026 | Plan für die Kursphase, KoSIT-Spike; Test- und Demodaten so korrigiert, dass der offizielle Prüfer alle gültig gemeinten Rechnungen akzeptiert |
| 4 | IBAN-Stammdaten-Kontrollworkflow | 30.09.2026 | Drei-Personen-Prozess für neue Bankverbindungen mit Revalidierung (PR #8, ADR-077) |
| 5 | Produktionsnahe KoSIT-Integration | 30.09.2026 | offizielle Prüfung jeder Rechnung, versionsgebunden; Ausfälle und zentrale Validierungsfehler führen nicht zu einer automatischen Freigabe; Wiederholung nach Ausfall (PR #9, ADR-078) |
| 6 | KPI-Provenienz | 30.09.2026 | jede Kennzahl nennt ihre Quelle; „nicht gemessen“, wo nichts gemessen ist (PR #10, ADR-079) |
| 7 | Optionale KI-Ausnahmeerklärung | 30.09.2026 | erklärt, entscheidet nicht; standardmäßig aus (PR #11, ADR-080) |
| 8 | UI/UX-Polish | 30.09.2026 | einheitliche Statusfarben, keine Sprachmischung, klarere Rechnungs- und Bankverbindungsansicht, ohne Verhaltensänderung (PR #12) |
| 9 | Feature Freeze | seit 30.09.2026 | nur noch Fehlerbehebung, Dokumentation, Demo-Stabilisierung und Polish ohne neues Verhalten |
| 10 | Korrigierende Härtung | 30.09.2026 | drei Review-Befunde behoben: Positionen ohne lesbare Menge oder Preis gehen in die Prüfung, die KI erhält keine Rohwerte aus dem Dokument, eine Gutschrift wird auch bei parallelen Zahlungen nur einmal verrechnet (PR #13, ADR-081 bis ADR-083) |
| 11 | Course-Final Packaging | Oktober 2026 | dieses Dokumentationspaket, Präsentation, Probedurchläufe |

Der Plan sah den Feature Freeze für den 15. Oktober vor. Er wurde früher
erreicht. Die Zeit bis zur Präsentation (15.–23. Oktober) ist für
Dokumentation, Demo-Stabilisierung, Präsentation und Probe reserviert.

---

## 8. Finaler Projektstatus

### Implementiert

- End-to-End-Rechnungsworkflow vom Eingang bis zur Abstimmung
- technische Validierung (Struktur, Pflichtfelder, sichere XML-Verarbeitung)
- offizielle KoSIT-Validierung, versionsgebunden; Ausfälle und zentrale
  Validierungsfehler führen nicht zu einer automatischen Freigabe
- fachliche Prüfung gegen Lieferanten, Bankverbindungen und Bestellungen,
  mit Nachrechnen aller Beträge
- Freigabeworkflow mit Betragsstufen und Funktionstrennung
- kontrollierte IBAN-Änderung mit drei Personen und Rückruf
- Buchungssatz und simulierte Zahlung, inklusive fehlgeschlagener Zahlung,
  Storno und Verrechnung von Gutschriften
- Abstimmung mit einem (synthetischen) Kontoauszug
- Prüfpfad für jeden Statuswechsel, im Produktionsmodus nur ergänzbar
- Kennzahlen mit Quellenangabe (Provenienz)
- optionale KI-Erklärung, standardmäßig aus
- optionale KI-gestützte Lieferantenrückfrage mit menschlicher Freigabe,
  standardmäßig aus (Nachtrag)
- Eingang per E-Mail über n8n mit Protokoll in Google Sheets, als Demo
  (Nachtrag)
- zweisprachige Oberfläche (Deutsch, Englisch)
- 745 automatisierte Tests
- CI bei jeder Änderung: Abhängigkeitsprüfung, Tests mit echtem
  KoSIT-Prüfer, Build, Docker-Demo
- UI/UX-Polish

### Noch nicht produktionsreif / Future Scope

- CII und ZUGFeRD (bisher nur XRechnung in UBL-Syntax)
- Rechnungseingang per Postfach im Dauerbetrieb (bisher nur die n8n-Demo)
- DATEV-Anbindung
- Kontoauszüge im Bankformat camt.053
- Zahlungsdateien im SEPA-Format pain.001
- vollständiges Lieferanten-Onboarding und Stammdatenimport
- Stilllegen alter Bankverbindungen (bisher wird ein Konto nur ergänzt)
- SSO und Mehr-Faktor-Anmeldung (MFA), Passwort-Zurücksetzen
- Produktionshosting und Backups
- vollständiges Aufbewahrungs- und Archivierungskonzept
- echter Kundenpilot mit gemessenen Werten
- weitere n8n-Abläufe wie Erinnerungen und Eskalation
- Bewertung der KI-Funktion mit dem echten Modell

Weitere bekannte Grenzen stehen im README unter „Known limits“, zum Beispiel:
Teil- und Sammelzahlungen werden immer zu Ausnahmen, und eine Bestellung ist
ein einzelner Restbetrag ohne Teillieferungen.

---

## 9. Ausblick nach dem Kurs: Externe Automatisierung und Orchestrierung

Nach dem Kurs kann ein Werkzeug wie n8n als **Orchestrierungsschicht um die
bestehende Anwendung** herum ergänzt werden. Es würde die vorhandenen
Schnittstellen (APIs) aufrufen, nicht ersetzen. Das ist so bereits in ADR-004
angelegt.

Mögliche Einsätze:

- Rechnungseingang aus einem E-Mail-Postfach
- Erinnerungen an offene Freigaben
- Eskalation, wenn eine Freigabe zu lange liegt
- Benachrichtigung bei fehlgeschlagenen Zahlungen
- geplante Nachfassaktionen bei offenen Rückfragen
- Übergabe an DATEV oder ein ERP
- zeitgesteuerter Abgleich mit dem Kontoauszug
- Benachrichtigungen per Teams, Slack oder E-Mail

### Die Grenze zwischen Anwendung und Orchestrierung

| Anwendung | n8n / Orchestrierung |
|---|---|
| Source of Truth | Trigger |
| Geschäftsregeln | Benachrichtigungen |
| Berechtigungen | Zeitpläne |
| Zustandsmaschine | externe Integrationen |
| Prüfpfad | |
| Freigabe | |

**n8n darf nicht entscheiden über:**

- die Freigabe einer Rechnung
- eine Änderung vertrauenswürdiger Lieferanten-Bankverbindungen
- die Autorisierung einer Zahlung
- das Ergebnis der Abstimmung

Diese Entscheidungen bleiben in der Anwendung, bei ihren Regeln und bei den
berechtigten Menschen. Ein Orchestrierungswerkzeug ruft nur die Schnittstelle
auf. Die Anwendung prüft dann Rechte und Regeln wie bei jedem anderen Aufruf.

Gebaut ist davon nur der erste Punkt, als Demo: der Eingang aus einem
E-Mail-Postfach, mit Protokoll in Google Sheets. Der Rest ist Umfang für die
Zeit nach dem Kurs.

### Weitere Reihenfolge nach dem Kurs

Laut Projektplan zuerst CII/ZUGFeRD, dann Kundeninterviews, Postfach-Eingang,
DATEV, camt.053, pain.001, Lieferanten-Onboarding und Stammdatenimport,
SSO/MFA, Hosting und Backups sowie ein Pilot mit echten Messwerten
(`docs/FINANCE_OPS_2_PLAN.md`).
