# Sprechtext – Abschlusspräsentation

Gehört zu `praesentation_v5.html` (16 Folien). Die Fassung v4 bleibt
unverändert in `praesentation_v4.html` mit `SPRECHTEXT_DE.md`. Ziel: etwa
21 Minuten, davon gut 4 Minuten Demo-Video, das ich live erkläre. Obergrenze:
22 bis 23 Minuten. Die Dauern rechnen mit 95 Wörtern pro Minute,
dem Tempo aus der Probe vom 17.10.2026, Pausen und Folienwechsel inklusive.
Der Text ist zum Sprechen geschrieben, nicht zum Ablesen: Sätze in eckigen
Klammern sind Regieanweisungen.

| Folie | Inhalt | Dauer | Uhr |
|---|---|---|---|
| 1 | Titel | 0:15 | 0:15 |
| 2 | Eine Rechnung wie jede andere | 0:30 | 0:45 |
| 3 | Der zweite Blick | 1:30 | 2:15 |
| 4 | Woher ich das kenne | 1:20 | 3:35 |
| 5 | Anderer Prozess, gleiches Grundproblem | 1:00 | 4:35 |
| 6 | Jonas, Finance-Team Nordwerk | 1:00 | 5:35 |
| 7 | Vorher / Nachher | 1:00 | 6:35 |
| 8 | Zwei Rechnungen, zwei Ergebnisse | 0:50 | 7:25 |
| 9 | **Demo-Video** (4:05 plus Start) | 4:15 | 11:40 |
| 10 | Was Jonas sieht, und was dahinter steht | 0:35 | 12:15 |
| 11 | Menschliche Kontrolle | 1:35 | 13:50 |
| 12 | **Warum hier nicht die KI entscheidet** | 3:05 | 16:55 |
| 13 | **Gestoppt ist nicht ausgefallen** | 1:15 | 18:10 |
| 14 | Nutzen und wie man ihn misst | 1:35 | 19:45 |
| 15 | Reflexion und Einführung | 1:05 | 20:50 |
| 16 | Abschluss | 0:25 | 21:15 |

Wenn die Zeit knapp wird: auf Folie 10 den zweiten Absatz weglassen, auf
Folie 15 die Erkenntnisse nur nennen. Die Ausfall-Folie 13 nicht streichen:
Danach hat der Dozent gefragt.

---

## 1 · Titel (0:15)

Guten Tag. Ich bin Shota Tsertsvadze, und mein Abschlussprojekt heißt
Finance Operations Automation. Ich beginne mit einer Rechnung.

## 2 · Eine Rechnung wie jede andere (0:30)

Stellen Sie sich vor, das liegt heute Morgen in Ihrem Posteingang. Eine
Rechnung von Havel Logistik: Den Lieferanten kennen wir, es gibt eine passende
Bestellung, der Betrag liegt im Rahmen. 2.499 Euro für einen Palettentransport.

Auf den ersten Blick spricht nichts dagegen, sie zu bezahlen. Alles sieht
normal aus.

## 3 · Der zweite Blick (1:30)

Schauen wir genauer hin. Oben steht die IBAN, die wir für Havel Logistik in
unseren Stammdaten haben. Unten die IBAN auf dieser Rechnung. Alles rot
Markierte weicht ab.

Lieferant, Bestellung und Betrag stimmen. Nur das Konto nicht.

Eine echt aussehende Rechnung mit einem anderen Konto ist ein bekanntes
Muster beim Rechnungsbetrug. Ob es hier Betrug ist, wissen wir nicht. Aber
wir sollten nicht zahlen, bevor wir es wissen.

Seit Oktober 2025 gibt es bei Überweisungen die sogenannte
Empfängerüberprüfung. Banken gleichen den Namen mit der IBAN ab, bevor das
Geld überwiesen wird. Meine Anwendung setzt einen Schritt früher an: Sie prüft
bereits bei der Rechnung, ob die Bankverbindung in den Stammdaten des
Unternehmens hinterlegt und freigegeben ist.

Ohne diese Prüfung fällt so etwas von Hand nur auf, wenn jemand jedes Mal ganz
genau hinschaut, auch bei der hundertsten Rechnung des Tages.

## 4 · Woher ich das kenne (1:20)

Warum mich gerade dieses Thema interessiert: Ich habe in den Operations eines
FinTech-Unternehmens gearbeitet, das Girokonten für Privatkunden anbietet.
Zwei meiner Bereiche waren Pfändungen und behördliche Auskunftsersuchen.

Was ich dort erlebt habe: viele Arbeitsschritte, die sich ständig
wiederholen, die von Hand erledigt werden und für die es kaum Automatisierung
gab. Das war aufwendig, und ehrlich gesagt auch ermüdend.

Rechts eine vereinfachte Darstellung, kein Abbild der Systeme oder Abläufe
meines früheren Arbeitgebers. Ein Auskunftsersuchen kommt an. Jemand ordnet es
ein, findet die richtige Person, sucht Kunden- und Kontodaten zusammen,
beantwortet es fristgerecht und hält fest, was gemacht wurde. Jeder Schritt:
von Hand.

Gerade bei repetitiver Arbeit ist der Mensch nicht die beste Prüfinstanz. Die
Aufmerksamkeit lässt nach, nicht weil jemand nachlässig ist, sondern weil die
Arbeit so ist.

## 5 · Anderer Prozess. Gleiches Grundproblem. (1:00)

Mein Projekt baut diesen Prozess nicht nach. Ich habe mir einen anderen Fall
gesucht, in dem dasselbe Grundmuster steckt: Ein Dokument kommt an, Daten
werden abgeglichen, feste Regeln angewendet, Abweichungen erkannt, ein Mensch
entscheidet dort, wo es nötig ist, und am Ende ist jeder Schritt belegt.

Warum die E-Rechnung? Drei Gründe.

Erstens ist sie strukturiert: Eine XRechnung enthält die Daten
maschinenlesbar. Regeln lassen sich sauber und nachvollziehbar prüfen.

Zweitens kann ich sie vollständig vorführen, mit synthetischen Testdaten.
Keine echten Kunden, keine echten Konten.

Und drittens ist sie aktuell: Seit Januar 2025 müssen inländische Unternehmen
E-Rechnungen empfangen können.

## 6 · Für wen: Jonas (1:00)

Damit es konkret wird, habe ich eine Person erfunden: Jonas Weber, im
Finance-Team der Nordwerk GmbH. Nordwerk ist ein ausgedachter Mittelständler
mit rund 2.000 Eingangsrechnungen im Monat, also etwa 100 an jedem
Arbeitstag. Das ist eine Annahme, keine gemessene Zahl.

Jonas' Alltag heute: Er öffnet jeden Anhang und legt ihn ab, tippt Daten ab,
prüft Lieferant und IBAN mit dem Auge, sucht die Bestellung und läuft
Freigaben per Mail hinterher. Bei jeder Rechnung.

Dabei will Jonas eigentlich nur drei Dinge wissen: Muss ich mir diese Rechnung
ansehen? Wenn ja, warum genau? Und was ist der nächste Schritt?

## 7 · Vorher / Nachher (1:00)

Die Antwort auf seine erste Frage: nur bei Ausnahmen. Links der Ablauf heute: zehn Rechnungen,
und alle zehn landen bei Jonas. Er prüft jede einzelne von Hand.

Rechts mit Finance-Ops. Das System übernimmt den Eingang und prüft die Datei
und die Geschäftsregeln: Lieferant, IBAN, Bestellung, Beträge. In unserem
Modell kommen acht von zehn ohne Sachprüfung durch. Zwei werden gestoppt und
kommen zu Jonas, jeweils mit dem Grund.

Ohne Sachprüfung heißt nicht automatisch bezahlt: Bis 500 Euro gibt das System
frei, darüber unterschreibt ein Mensch.

Und es entscheiden feste Regeln, keine KI. Warum, dazu komme ich nach der Demo.

## 8 · Zwei Rechnungen, zwei Ergebnisse (0:50)

Ich zeige das an zwei Rechnungen. Die erste ist eine kleine
Bürobedarf-Rechnung über 380 Euro, alles in Ordnung. Die sollte automatisch
freigegeben werden. Die zweite ist die Rechnung vom Anfang, Havel Logistik,
mit der abweichenden IBAN. Die sollte gestoppt werden.

Der Weg: Die Mail geht an ein Postfach. n8n, ein Werkzeug, das Abläufe
zwischen Diensten verbindet, holt den Anhang ab und reicht ihn an Finance-Ops
weiter. Finance-Ops prüft und entscheidet. Google Sheets protokolliert das
Ergebnis. Den Ablauf habe ich aufgezeichnet.

## 9 · Demo-Video (4:15)

[Ins Video klicken oder Leertaste: Start. Leertaste, K oder Klick: Pause und
weiter. Die Pfeiltasten wechseln die Folie. Zeiten in Klammern: Stelle im
Video. Braucht ein Satz länger, kurz pausieren und weiterreden.]

Ablaufplan des Videos (Aufnahme vom 15.10.2026, ohne Ton):

| Zeit | Szene | Gezeigt | Sprechzeit |
|---|---|---|---|
| 0:00 | Zwei Mails | Entwurf mit Anhang, Adressen abgedeckt | 12 s |
| 0:12 | n8n im Überblick | ganzer Workflow | 11 s |
| 0:23 | Eingang | E-Mail, Formular, XML vorbereiten | 26 s |
| 0:49 | Übergabe | Gruppe Finance-Ops, fünf Knoten | 34 s |
| 1:23 | Protokoll | Gruppe Google Sheets, Formularzweig | 31 s |
| 1:54 | Ausführungen | zwei grüne Läufe | 10 s |
| 2:04 | Google Sheet | zwei Zeilen, zwei Ergebnisse | 12 s |
| 2:16 | Posteingang | beide Rechnungen | 16 s |
| 2:32 | INV-2026-00433 | Status, dann Verlauf | 29 s |
| 3:01 | HL-2026-7731 | was blockiert, dann der Beleg | 28 s |
| 3:29 | Übrige Prüfungen | 20 bestanden | 17 s |
| 3:46 | Nächster Schritt | Bankverbindung vorschlagen | 19 s |

**(0:00) Zwei Mails.** Zwei Rechnungen kommen per E-Mail an, jeweils mit der
XRechnung im Anhang: zuerst Havel Logistik, dann eine kleine
Bürobedarf-Rechnung.

**(0:12) n8n im Überblick.** Das ist der n8n-Workflow. Ich gehe ihn jetzt
Knoten für Knoten von links nach rechts durch.

**(0:23) Eingang.** Unten links „Rechnung per E-Mail“: Dieser Knoten holt neue
Mails aus dem Demo-Postfach. Darüber „Rechnung per Formular“, ein zweiter
Eingangsweg, den ich heute nicht nutze. Beide führen zu „XML vorbereiten“: Der
Knoten nimmt nur den XML-Anhang und merkt sich, auf welchem Weg die Rechnung
kam.

**(0:49) Übergabe.** Jetzt die Gruppe Finance-Ops. „CONFIG“ enthält nur die
Adresse von Finance-Ops, keine Regeln. „Finance Ops Login“ meldet sich mit
dem Demo-Konto der Buchhaltung an. „Session vorbereiten“ übernimmt aus der Antwort
den Nachweis der Anmeldung. „Datei + Session zusammenführen“ legt Rechnung und
Anmeldung zusammen. „Rechnung prüfen“ schickt die Datei an Finance-Ops.
Geprüft und entschieden wird nur dort; n8n enthält keine einzige
Geschäftsregel.

**(1:23) Protokoll.** Rechts die Gruppe Google Sheets. „Ergebnis vorbereiten“
übersetzt die Antwort in Wörter, etwa „Zur Prüfung“ statt eines Codes. „Demo
Log aktualisieren“ schreibt daraus eine Zeile ins Google Sheet. Ganz rechts
der Formularweg: Nur wenn die Rechnung über das Formular kam, zeigt n8n dort
eine Bestätigung. Bei einer E-Mail endet der Lauf nach dem Sheet.

**(1:54) Ausführungen.** Beide Ausführungen sind grün. Das heißt nur: n8n hat
transportiert. Ob eine Rechnung frei ist, entscheidet Finance-Ops.

**(2:04) Google Sheet.** Und genau das zeigt das Protokoll: Havel Logistik zur
Prüfung, die Bürobedarf-Rechnung automatisch freigegeben. Zweimal grün, zwei
verschiedene Ergebnisse.

**(2:16) Posteingang.** So sieht das für Jonas aus. Beide Rechnungen sind da
und schon geprüft: oben die freigegebene Bürobedarf-Rechnung, darunter Havel
Logistik in der Sichtprüfung.

**(2:32) INV-2026-00433.** Die saubere Rechnung zuerst: 380 Euro, Status
freigegeben.

**(2:44) Verlauf.** Im Verlauf sieht man: Nach dem Eingang hat nur das System
gearbeitet. Keine Prüfung ist fehlgeschlagen, der Betrag liegt unter der
Grenze von 500 Euro. Jonas musste nichts tun.

**(3:01) HL-2026-7731.** Jetzt Havel Logistik, 2.499 Euro, gestoppt. Ganz oben
steht in einem Satz, was blockiert.

**(3:14) Beleg.** Darunter der Beleg: erwartet, gefunden, die abweichenden
Ziffern markiert. Das ist ein Grund zur Prüfung, kein Nachweis für Betrug.

**(3:29) Übrige Prüfungen.** Alles andere ist ohne Befund, 20 Prüfungen
bestanden. Nur diese eine ist fehlgeschlagen.

**(3:46) Nächster Schritt.** Und direkt darunter der nächste Schritt: die neue
Bankverbindung zur Prüfung vorschlagen. Die Rechnung selbst kann Jonas so
nicht freigeben. Was dann passiert, zeige ich gleich.

[Video endet bei 4:05. Pfeiltaste: weiter zu Folie 10.]

## 10 · Was Jonas bei einer Ausnahme sieht (0:35)

Zusammengefasst: kein Rätselraten. Oben steht in einem Satz, was blockiert.
Darunter der Beleg, die abweichenden Ziffern markiert. Der Rest ohne Befund.
Und direkt darunter der nächste Schritt.

Das ist die Oberfläche. Dahinter stehen 788 automatisierte Tests und 84
dokumentierte Architekturentscheidungen. Die Kontrollen sind also geprüft und
nachvollziehbar. Getestet ist das mit synthetischen Daten, nicht im
Echtbetrieb.

## 11 · Menschliche Kontrolle (1:35)

Jetzt die naheliegende Frage: Und wenn Havel Logistik wirklich die Bank
gewechselt hat?

Dann gilt eine wichtige Regel: Eine Rechnung kann die Bankverbindung nie
ändern. Die IBAN auf einer Rechnung ist genau das, was ein Betrüger
kontrolliert.

Person eins schlägt die neue Bankverbindung vor, mit Begründung. Person zwei
prüft unabhängig: Sie ruft beim Lieferanten an, und zwar nur über die Nummer,
die wir schon in den Stammdaten haben, nie über eine Nummer von der Rechnung.
Der Lieferant liest die IBAN vor. Person drei gibt die Bankverbindung frei.
Erst dann prüft das System die Rechnung noch einmal.

Und dann kommt eine zweite, eigene Entscheidung: die Freigabe der Rechnung.
Eine Rechnung, die einmal gestoppt war, wird nie automatisch freigegeben. Ein
Mensch unterschreibt.

Die Idee ist das Vier-Augen-Prinzip, hier bewusst mit drei Personen. Das ist
meine Projektregel, keine allgemeine Pflicht. Der Punkt: Wer vorschlägt, prüft
und gibt nicht selbst frei.

## 12 · Warum hier nicht die KI entscheidet (3:05)

Sie fragen sich vielleicht: Das ist ein KI-Kurs. Warum entscheidet hier keine
KI? Das war eine bewusste Entscheidung.

Über Geld entscheiden feste Regeln: gleiche Daten, gleiches Ergebnis, und jedes
Ergebnis hat einen Grund. Ein Sprachmodell liefert nicht garantiert jedes Mal
dasselbe. Eine plausible Begründung ist noch kein Beleg. Und den Text der
Rechnung schreibt der Absender, im schlimmsten Fall der Betrüger.

Wo hilft KI dann? Bei der Rückfrage an den Lieferanten. Ist eine Rechnung
gestoppt, entwirft die KI den Brief. Rechnungsnummer und Lieferant bekommt sie
gar nicht, sie schreibt Platzhalter. Zahlen darf sie nur nennen, wenn sie in
den Prüfergebnissen stehen. Die Anwendung prüft das und setzt erst dann die
Werte ein. Ein Mensch gibt frei und verschickt von Hand. Bei einer
abweichenden IBAN gibt es keinen Entwurf, nur den Rückruf.

Mit dem echten Modell bestanden zuerst 16 von 24 Entwürfen die Prüfung. Die
meisten Ablehnungen waren nummerierte Listen. Nach einer Zeile mehr im Prompt
bestanden in der Nachprüfung 15 von 15. Fällt ein Entwurf durch, springt eine
feste Vorlage ein. Ob die Entwürfe besser sind als die Vorlage, muss ein
Blindvergleich zeigen. Die Verantwortung tragen Menschen.

Ich habe mir drei bestehende Lösungen angesehen: DATEV, Candis und finway.
DATEV ist eng mit der Buchhaltung verbunden, Candis nutzt unter anderem KI für
die Rechnungserfassung, und finway deckt auch Bestellungen und deren Abgleich
mit Rechnungen ab.

Mein Ziel war nicht, diese Produkte zu ersetzen. Ich wollte selbst
nachvollziehen, wie man einen solchen Prozess mit festen Regeln,
dokumentierten Ausnahmen und klarer menschlicher Verantwortung gestaltet. In
einem echten Unternehmen würde ich zuerst prüfen, welche Funktionen die
vorhandene Software bereits bietet.

Die Frage ist also nicht nur: Wo kann ich KI einsetzen? Sondern: Wo bringt sie
messbaren Nutzen, und wo ist eine Regel sicherer?

## 13 · Gestoppt ist nicht ausgefallen (1:15)

Die Rechnung von Havel Logistik wurde gestoppt. Das ist kein Ausfall, das ist
die Kontrolle bei der Arbeit. Ein technischer Ausfall ist etwas anderes: Ein
Baustein ist nicht erreichbar.

Fällt n8n aus, bleiben die Mails im Postfach. Der Ersatzweg: die Rechnung
direkt in Finance-Ops hochladen. Ist Finance-Ops nicht erreichbar, bricht n8n
ab, und die Mail gilt als abgeholt. Also Verbindung herstellen und erneut
senden. Fällt Google Sheets aus, steht die Entscheidung trotzdem. Es fehlt nur
die Zeile im Protokoll.

Eingebaut ist: Doppelt senden ist sicher, und eine abgebrochene Prüfung wird
fortgesetzt. Von Hand heißt heute: in n8n nachsehen und erneut senden. Noch
nicht gebaut ist eine automatische Benachrichtigung. Einen Ausfall sieht heute
nur, wer nachschaut.

## 14 · Geschäftlicher Nutzen und wie man ihn misst (1:35)

Was bringt das? Links eine Modellrechnung für Nordwerk, klar gesagt:
Annahmen, nicht gemessen. 2.000 Rechnungen im Monat, jede fünfte braucht eine
Klärung. Eine saubere Rechnung kostet heute sechs Minuten, mit dem System eine,
eine Ausnahme 25 statt 8. Dann sinkt der Aufwand von rund 327 auf rund 80
Stunden im Monat.

Ob das stimmt, muss ein Pilot zeigen. Vorab habe ich die Regeln an 20
synthetischen Rechnungen mit bekanntem Soll-Ergebnis geprüft. Alle 20 landen
dort, wo sie hingehören: 16 ohne Sachprüfung, 4 gestoppt mit dem richtigen
Grund, darunter beide mit fremder IBAN. Die Mischung habe ich gewählt. Gemessen
ist also nicht die Quote, sondern dass die Regeln richtig greifen.

Im Pilot würde ich drei Dinge messen: Wie viele
Rechnungen kommen ohne Sachprüfung durch? Wie lange braucht eine Rechnung,
gemessen wie vorher? Und wie viele Stopps waren Fehlalarme? Dazu eine
Leitplanke: keine Zahlung auf ein ungeprüftes Konto. Schneller ist kein
Erfolg, wenn das Risiko steigt.

## 15 · Reflexion und Einführung (1:05)

Was nehme ich mit? Erstens: Die schwierigste Frage war nicht, was man
automatisiert, sondern wo ein Mensch entscheiden muss. Zweitens: Ein
funktionierender Prototyp ist noch kein eingeführter Prozess. Und drittens:
Eine Demo braucht Betriebsdisziplin. Die Tunnel-Adresse ist mehrfach
weggefallen, daraus sind Checkliste und Ausfallplan entstanden.

Wie würde ich das bei Nordwerk einführen? Erst die Regeln mit dem
Finance-Team abstimmen: Welche Grenzen gelten, wer ist für welche Ausnahme
zuständig? Dann ein Parallelbetrieb: Echte Rechnungen laufen mit, aber Jonas
entscheidet wie bisher. Dann vergleichen: Wo hätte das System anders
entschieden, und warum? Erst danach: ausweiten oder nachschärfen. Das ist ein
Vorschlag, umgesetzt ist davon noch nichts.

## 16 · Abschluss (0:25)

Die Rechnung vom Anfang: gestoppt, bevor Geld überwiesen wird. In der Demo ist die
Zahlung simuliert, die Kontrolle dahinter ist echt.
Automatisieren, was Routine ist. Kontrollieren, was kritisch ist.

Vielen Dank. Ich freue mich auf Ihre Fragen.

---

## Kurze Antworten auf erwartbare Fragen

Die früheren Backup-Folien B1 bis B7 sind nicht mehr Teil des Vortrags. Bei
Bedarf `referenz/backup_folien_v3.html` öffnen; die Verweise unten nennen die
passende Folie.

**Hat das System einen Betrug erkannt?**
Nein. Es hat erkannt, dass die IBAN nicht zu den freigegebenen
Bankverbindungen passt. Ob das Betrug ist oder ein echter Bankwechsel, klärt
der Rückruf. Das System sorgt nur dafür, dass vorher nicht gezahlt wird.

**Warum ist das ein KI-Projekt, wenn Regeln entscheiden?**
Weil die Wahl der richtigen Technik Teil des KI-Managements ist. Über Geld
entscheiden Regeln, weil sie wiederholbar und begründet sind. KI setze ich
dort ein, wo ein Fehler wenig kostet und ein Mensch draufschaut: Sie entwirft
die Rückfrage an den Lieferanten und erklärt Ausnahmen. Später denkbar:
PDF-Rechnungen auslesen, mit Bestätigung durch einen Menschen. → Folie 12.

**Wie haben Sie die KI bewertet?**
Die Rückfrage mit dem echten Modell: acht Fälle, je dreimal, jeder Entwurf
durch dieselben festen Prüfungen wie in der Anwendung. In der ersten Runde
waren 16 von 24 zulässig. Fünf Ablehnungen kamen von nummerierten Listen, zwei
von einer Differenz, die das Modell selbst gerechnet hatte, und ein Entwurf
brach an der Längengrenze ab. Nach einer Zeile im Prompt waren in der
Nachprüfung 15 von 15 zulässig. Beide IBAN-Fälle wurden vor jedem Aufruf
verweigert. Zusammen etwa 30 Cent. Ob die Texte besser sind als die Vorlage,
bewertet ein Mensch blind. Die Erklärfunktion ist noch nicht mit dem echten
Modell bewertet. (`docs/course/KI_BEWERTUNG_DE.md`)

**Sieht die KI die Rechnungsdaten?**
Nicht die Rechnung selbst. Sie bekommt die fehlgeschlagenen Prüfungen mit
ihren freigegebenen Belegen, bei einer Überschreitung etwa Netto- und
Bestellbetrag. Keine Rechnungsnummer, keinen Lieferanten, keinen Firmennamen,
keine IBAN. Diese Werte setzt die Anwendung erst nach der Prüfung über
Platzhalter ein. Eine Anweisung, die jemand in der Rechnung versteckt, kommt
beim Modell gar nicht an.

**Haben Sie die Prüfung gelockert, damit mehr Entwürfe durchkommen?**
Nein. Geändert habe ich eine Zeile im Prompt: Spiegelstriche statt
Nummern. Die Prüfregeln sind gleich geblieben. Eine selbst gerechnete Zahl
lehnt die Prüfung weiterhin ab, auch wenn sie stimmt.

**Wie haben Sie die Testmenge festgelegt?**
20 synthetische Rechnungen, das Soll vorher aus den Regeln abgeleitet, viele
Grenzfälle: genau 500 Euro, ein Cent darüber, fremde IBAN bei einem
Kleinbetrag. Alle 20 landen richtig. Dass 16 durchlaufen, habe ich gewählt,
passend zur Annahme acht von zehn. (`docs/course/SOLL_IST_DE.md`)

**Stehen Bankdaten im Google Sheet?**
Nein. Das Sheet hat neun Spalten ohne IBAN. n8n sieht die IBAN aber, weil es
die Rechnung transportiert. Für ein Echtsystem: kein Sheet mit
Rechnungsdaten, n8n im eigenen Netz, ein technisches Konto, das nur hochladen
darf. (`docs/course/DATENFLUSS_DE.md`)

**Woher wissen Sie, dass sich das lohnt?**
Noch gar nicht. 327 und 80 Stunden sind eine Modellrechnung. Ein Pilot im
Parallelbetrieb würde Automatisierungsquote, Bearbeitungszeit und Fehlalarme
messen, mit derselben Methode wie die Ausgangslage. → Folie 14.

**Was passiert mit den Mitarbeitenden?**
Jonas prüft nicht mehr jede Rechnung, sondern die Ausnahmen. Im Pilot
entscheidet er zuerst wie bisher, und wir vergleichen. Eine Ansprechperson in
der Kreditorenbuchhaltung und kurze Schulungen am echten Fall gehören dazu
(`docs/course/ROLLOUT_UND_REFLEXION_DE.md`).

**Was macht n8n genau? Warum nicht alles in n8n?**
n8n holt die Mail ab, meldet sich an, übergibt die Datei und schreibt das
Ergebnis ins Sheet. Die Regeln liegen an einer Stelle in der Anwendung, sind
dort getestet und gelten unabhängig davon, ob eine Rechnung per Mail, Formular
oder Upload kommt. → Referenzfolie B3.

**Warum drei Personen? Ist das nicht zu viel?**
Das ist die Regel, die ich für das Projekt gewählt habe, und sie ist im
System fest auf drei gesetzt. Ein Zwei-Personen-Modus ist im Datenmodell
vorbereitet, aber bewusst nicht freigegeben. Der Kern ist
die Trennung: Wer vorschlägt, prüft und gibt nicht selbst frei.

**Kann jemand den Rückruf einfach behaupten?**
Das System kann nicht beweisen, dass ein Anruf stattfand. Es macht ihn
nachvollziehbar: Nummer aus den Stammdaten, vorgelesene IBAN, wer wann, und
eine dritte Person muss zustimmen. → Referenzfolie B5.

**Woher kommen die 327 und 80 Stunden?**
Aus Annahmen für die fiktive Firma: Minuten pro Rechnung, Anteil der
Ausnahmen. Nichts davon ist gemessen. → Referenzfolie B4.

**Funktioniert das auch mit PDF-Rechnungen?**
Nein. Die Anwendung liest XRechnung im UBL-Format. Andere Formate wie CII oder
ZUGFeRD sind vorgesehen, aber nicht gebaut.

**Ist das produktionsreif?**
Nein, es ist ein Proof of Concept mit synthetischen Daten. Es läuft lokal,
für die Demo über einen temporären Tunnel. Buchungen gehen als CSV-Export
raus, Kontoauszüge kommen als Import, Zahlungen sind simuliert. Für den Betrieb
fehlen ein fester Server, echte Anbindungen an Buchhaltung und Bank und eine
dauerhaft laufende KoSIT-Prüfung, die eingebaut, in der Demo aber aus ist.
→ Referenzfolie B5.

**Ist das rechtskonform (GoBD, DSGVO, EN 16931)?**
Dazu mache ich bewusst keine Aussage. Das wäre im Pilot mit Fachleuten zu
prüfen.

**Wie schnell geht das?**
Im Test am 11.10.2026 lief eine n8n-Ausführung 2 bis 4 Sekunden, von der
Abholung der Mail bis zur Zeile im Sheet. Wie lange das Postfach braucht, bis
n8n die Mail abholt, habe ich nicht gemessen. → Referenzfolie B1.

**Wie viele Tests gibt es?**
788 automatisierte Tests, alle grün in der CI vom 19.10.2026, dazu 84
dokumentierte Architekturentscheidungen. → Referenzfolie B6.

**Bekommt jemand eine Nachricht, wenn etwas ausfällt?**
Nein, heute nicht. Einen Ausfall sieht, wer in n8n die Ausführungen oder das
Sheet prüft. Der nächste Schritt wäre ein Fehler-Workflow in n8n, der zum
Beispiel ein Team-Postfach benachrichtigt. Das ist nicht gebaut.

**Was passiert, wenn dieselbe Rechnung zweimal kommt?**
Dieselbe Datei wird am Inhalt erkannt, auch unter anderem Namen, und als
Duplikat abgelegt, nicht ein zweites Mal geprüft.
