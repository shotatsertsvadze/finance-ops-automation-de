# Sprechtext – Abschlusspräsentation

Gehört zu `praesentation_v4.html` (16 Folien, kein Backup-Anhang mehr; die
früheren Backup-Folien liegen in `referenz/backup_folien_v3.html`). Ziel: etwa
19 Minuten, davon gut 4 Minuten Demo-Video, das ich live erkläre. Rahmen des
Dozenten: 15 bis 20 Minuten.
Der Text ist zum Sprechen geschrieben, nicht zum Ablesen: Sätze in eckigen
Klammern sind Regieanweisungen.

| Folie | Inhalt | Dauer | Uhr |
|---|---|---|---|
| 1 | Titel | 0:20 | 0:20 |
| 2 | Eine Rechnung wie jede andere | 0:50 | 1:10 |
| 3 | Der zweite Blick | 1:00 | 2:10 |
| 4 | Woher ich das kenne | 1:30 | 3:40 |
| 5 | Anderer Prozess, gleiches Grundproblem | 1:15 | 4:55 |
| 6 | Jonas, Finance-Team Nordwerk | 1:00 | 5:55 |
| 7 | Vorher / Nachher | 1:15 | 7:10 |
| 8 | Zwei Rechnungen, zwei Ergebnisse | 0:40 | 7:50 |
| 9 | **Demo-Video** (4:05 plus Start) | 4:15 | 12:05 |
| 10 | Was Jonas bei einer Ausnahme sieht | 0:20 | 12:25 |
| 11 | Menschliche Kontrolle | 1:20 | 13:45 |
| 12 | **Gestoppt ist nicht ausgefallen** | 1:40 | 15:25 |
| 13 | **Was hält, was noch fehlt** | 1:00 | 16:25 |
| 14 | Geschäftlicher Nutzen | 1:15 | 17:40 |
| 15 | Reflexion | 1:00 | 18:40 |
| 16 | Abschluss | 0:25 | 19:05 |

Wenn die Zeit knapp wird: Folie 10 nur zeigen, nicht besprechen (das Video hat
es schon gezeigt), und auf Folie 15 nur je einen Punkt nennen. Die
Ausfall-Folien 12 und 13 nicht kürzen: Danach hat der Dozent gefragt.

---

## 1 · Titel (0:20)

Guten Tag. Ich bin Shota Tsertsvadze, und mein Abschlussprojekt heißt
Finance Operations Automation. Ich beginne mit einer Rechnung.

## 2 · Eine Rechnung wie jede andere (0:50)

Stellen Sie sich vor, das liegt heute Morgen in Ihrem Posteingang. Eine
Rechnung von Havel Logistik: Den Lieferanten kennen wir, es gibt eine passende
Bestellung, der Betrag liegt im Rahmen. 2.499 Euro für einen Palettentransport.

Auf den ersten Blick spricht nichts dagegen, sie zu bezahlen. Alles sieht
normal aus.

## 3 · Der zweite Blick (1:00)

Schauen wir genauer hin. Oben steht die IBAN, die wir für Havel Logistik in
unseren Stammdaten haben. Unten die IBAN auf dieser Rechnung. Alles rot
Markierte weicht ab.

Lieferant, Bestellung und Betrag stimmen. Nur das Konto nicht.

Eine echt aussehende Rechnung mit einem anderen Konto ist ein bekanntes
Muster beim Rechnungsbetrug. Ob es hier Betrug ist, wissen wir nicht. Aber
wir sollten nicht zahlen, bevor wir es wissen. Und von Hand fällt so etwas nur
auf, wenn jemand jedes Mal ganz genau hinschaut, auch bei der hundertsten
Rechnung des Tages.

## 4 · Woher ich das kenne (1:30)

Warum mich gerade dieses Thema interessiert: Ich habe in den Operations eines
FinTech-Unternehmens gearbeitet, das Girokonten für Privatkunden anbietet.
Zwei meiner Bereiche waren Pfändungen und behördliche Auskunftsersuchen.

Was ich dort erlebt habe: viele Arbeitsschritte, die sich ständig
wiederholen, die von Hand erledigt werden und für die es kaum Automatisierung
gab. Das war aufwendig, und ehrlich gesagt auch ermüdend.

Rechts sehen Sie, wie man sich das vorstellen kann. Das ist eine vereinfachte
Darstellung, kein Abbild der Systeme meines früheren Arbeitgebers. Ein
Auskunftsersuchen kommt an. Jemand liest es und ordnet es ein, findet die
richtige Person, gleicht Angaben ab, sucht Kunden- und Kontodaten zusammen,
erstellt die Antwort, behält die Frist im Blick und hält am Ende fest, was
gemacht wurde. Jeder dieser Schritte: von Hand.

Gerade bei repetitiver Arbeit ist der Mensch nicht die beste Prüfinstanz. Die
Aufmerksamkeit lässt nach, nicht weil jemand nachlässig ist, sondern weil die
Arbeit so ist.

## 5 · Anderer Prozess. Gleiches Grundproblem. (1:15)

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

## 7 · Vorher / Nachher (1:15)

Genau das ändert meine Anwendung. Links der Ablauf heute: zehn Rechnungen,
und alle zehn landen bei Jonas. Er prüft jede einzelne von Hand.

Rechts mit Finance-Ops. Blau ist das System: Es übernimmt den Eingang, prüft
die Datei und die Geschäftsregeln, also Lieferant, IBAN, Bestellung und
Beträge. In unserem Modell laufen acht von zehn einfach durch, grün. Zwei
werden gestoppt und kommen zu Jonas, jeweils mit dem Grund, warum.

Bei größeren Beträgen braucht eine saubere Rechnung zusätzlich eine
Freigabe-Unterschrift. Von Hand prüfen muss sie aber niemand mehr.

Wichtig: Es entscheiden feste Geschäftsregeln. Bei gleichen Daten und gleichen
Regeln kommt immer dasselbe heraus, und jede Entscheidung hat einen Grund. Es gibt eine optionale KI-Erklärung, die eine Ausnahme verständlicher
formulieren kann, aber sie entscheidet nichts.


## 8 · Zwei Rechnungen, zwei Ergebnisse (0:40)

Ich zeige das an zwei Rechnungen. Die erste ist eine kleine
Bürobedarf-Rechnung über 380 Euro, alles in Ordnung. Die sollte automatisch
freigegeben werden. Die zweite ist die Rechnung vom Anfang, Havel Logistik,
mit der abweichenden IBAN. Die sollte gestoppt werden.

Der Weg: Die Mail geht an ein Postfach. n8n, ein Werkzeug, das Abläufe
zwischen Diensten verbindet, holt den Anhang ab und reicht ihn an Finance-Ops
weiter. Finance-Ops prüft und entscheidet. Google Sheets protokolliert das
Ergebnis. Den Ablauf habe ich aufgezeichnet, damit Sie ihn ohne Wartezeiten
sehen.

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
einem eigenen Demo-Konto an. „Session vorbereiten“ übernimmt aus der Antwort
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

## 10 · Was Jonas bei einer Ausnahme sieht (0:20)

Zusammengefasst: kein Rätselraten. Der Grund steht in einem Satz da, der Beleg
daneben, der nächste Schritt darunter.

## 11 · Menschliche Kontrolle (1:20)

Jetzt die naheliegende Frage: Und wenn Havel Logistik wirklich die Bank
gewechselt hat?

Dann gilt eine wichtige Regel: Eine Rechnung kann die Bankverbindung nie
ändern. Die IBAN auf einer Rechnung ist genau das, was ein Betrüger
kontrolliert. Deshalb gibt es einen eigenen Weg mit eigenen Entscheidungen.

Person eins schlägt die neue Bankverbindung vor, mit Begründung. Person zwei
prüft unabhängig: Sie ruft beim Lieferanten an, und zwar nur über die Nummer,
die wir schon in den Stammdaten haben, nie über eine Nummer von der Rechnung.
Der Lieferant liest die IBAN vor. Person drei gibt die Bankverbindung frei.
Erst dann prüft das System die Rechnung automatisch noch einmal, mit allen
Prüfungen.

Und dann kommt eine zweite, eigene Entscheidung: die Freigabe der Rechnung.
Eine Rechnung, die einmal gestoppt war, wird nie automatisch freigegeben. Ein
Mensch unterschreibt.

Das ist das bekannte Vier-Augen-Prinzip, in diesem Projekt bewusst mit drei
Personen, und so ist es im System fest eingestellt. Für jedes Unternehmen
vorschreiben würde ich das nicht. Der Punkt
ist: Wer vorschlägt, darf nicht selbst prüfen oder freigeben.

## 12 · Gestoppt ist nicht ausgefallen (1:40)

Die Rechnung von Havel Logistik wurde gestoppt. Das war kein Ausfall: Das
System hat genau das getan, wofür es gebaut ist. Ein technischer Ausfall ist
etwas anderes. Dann ist ein Baustein nicht erreichbar. Drei Fälle.

Erstens: n8n ist nicht erreichbar. Dann passiert nichts. Die Mails bleiben im
Postfach, keine Rechnung wird geprüft. Der Ersatzweg: die Rechnungen direkt in
Finance-Ops hochladen.

Zweitens: Die Verbindung zu Finance-Ops oder Finance-Ops selbst ist weg. Dann
bricht n8n beim Anmelden ab, und die Ausführung steht rot in der Liste, mit
dem Schritt, an dem sie abbrach. In Finance-Ops ist nichts angekommen, im
Sheet steht nichts. Wichtig: Die Mail gilt für n8n als abgeholt und kommt
nicht von selbst noch einmal. Also Verbindung herstellen, dann die Rechnung
erneut senden oder hochladen.

Drittens: Google Sheets ist weg. Dann hat Finance-Ops schon geprüft und
entschieden, die Rechnung ist vollständig. Es fehlt nur die Zeile im
Protokoll, die trägt man nach. Die Rechnung noch einmal zu senden hilft hier
nicht: Finance-Ops erkennt die Datei und legt nur ein Duplikat an.

Und eine ehrliche Grenze: Heute meldet sich kein System von selbst. Einen
Ausfall sieht, wer nachschaut.

## 13 · Was hält, was noch fehlt (1:00)

Was hält: Doppelt senden ist sicher. Dieselbe Datei wird als Duplikat erkannt,
nichts wird doppelt freigegeben. Bricht eine Prüfung mittendrin ab, setzt
dieselbe Datei sie beim erneuten Senden fort. Und ist der offizielle
Prüfdienst nicht erreichbar, geht die Rechnung in die Sichtprüfung, nie in die
Freigabe. In der Demo ist dieser Prüfdienst aus.

Von Hand heißt heute: in n8n nachsehen, die Ursache beheben, die Rechnung
erneut senden oder hochladen, eine fehlende Zeile nachtragen.

Noch nicht gebaut ist die automatische Benachrichtigung bei einem Fehler, ein
Dauerbetrieb statt des Tunnels und das automatische Nachholen fehlender
Sheet-Zeilen. Das wären die nächsten Schritte.

## 14 · Geschäftlicher Nutzen (1:15)

Was bringt das? Links eine Modellrechnung für Nordwerk, klar gesagt: mit
Annahmen, nicht gemessen. 2.000 Rechnungen im Monat, jede fünfte braucht eine
Klärung. Wenn eine saubere Rechnung heute sechs Minuten kostet und mit dem
System eine, und eine Ausnahme 25 statt 8 Minuten, dann sinkt der Aufwand von
rund 327 auf rund 80 Stunden im Monat. Ob das in einem echten Unternehmen so
ist, müsste ein Pilot messen.

Rechts das, was sich für Jonas auf jeden Fall ändert: Routine läuft durch.
Ausnahmen kommen mit Grund. Er entscheidet gezielt, dort, wo Verantwortung
gefragt ist. Und jeder Schritt ist belegt: wer was wann geprüft und
entschieden hat.

## 15 · Reflexion (1:00)

Was nehme ich mit? Erstens: Die schwierigste Frage war nicht, was man
automatisiert. Sondern wo ein Mensch entscheiden muss, und wer genau.
Zweitens: Feste Regeln sind erklärbar. Jede Entscheidung lässt sich begründen,
und das schafft Vertrauen bei Finance. Drittens, ganz praktisch: Eine Demo
braucht Betriebsdisziplin. Die temporäre Tunnel-Adresse ist mehrfach
weggefallen. Daraus sind eine feste Checkliste und der Ausfallplan von eben
geworden.

Die nächsten Schritte wären ein Pilot mit echten, anonymisierten
Rechnungsdaten eines Unternehmens, ein stabiler Betrieb statt Tunnel, bei dem
die offizielle KoSIT-Prüfung dauerhaft mitläuft, und echte Anbindungen an
Buchhaltung und Bank.

## 16 · Abschluss (0:25)

Die Rechnung vom Anfang: gestoppt, bevor Geld überwiesen wurde.
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

**Warum entscheidet keine KI?**
Weil die Entscheidung nachvollziehbar und wiederholbar sein muss. Feste Regeln
liefern bei gleichen Daten immer dasselbe Ergebnis und nennen den Grund. Die KI darf eine
Ausnahme erklären, sie ist standardmäßig aus. → Referenzfolie B2.

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
Über 740 automatisierte Tests, dazu 83 dokumentierte
Architekturentscheidungen. → Referenzfolie B6.

**Bekommt jemand eine Nachricht, wenn etwas ausfällt?**
Nein, heute nicht. Einen Ausfall sieht, wer in n8n die Ausführungen oder das
Sheet prüft. Der nächste Schritt wäre ein Fehler-Workflow in n8n, der zum
Beispiel ein Team-Postfach benachrichtigt. Das ist nicht gebaut.

**Was passiert, wenn dieselbe Rechnung zweimal kommt?**
Dieselbe Datei wird am Inhalt erkannt, auch unter anderem Namen, und als
Duplikat abgelegt, nicht ein zweites Mal geprüft.
