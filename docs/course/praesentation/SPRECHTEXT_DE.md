# Sprechtext – Abschlusspräsentation

Gehört zu `praesentation.html` (13 Folien plus 7 Backup-Folien). Ziel: etwa
17½ Minuten, davon etwa 5 Minuten Live-Demo. Bis 20 Minuten bleibt Puffer.
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
| 8 | Live: zwei Rechnungen | 0:30 | 7:40 |
| – | **Live-Demo** | 5:00 | 12:40 |
| 9 | Was Jonas bei einer Ausnahme sieht | 0:40 | 13:20 |
| 10 | Menschliche Kontrolle | 1:20 | 14:40 |
| 11 | Geschäftlicher Nutzen | 1:15 | 15:55 |
| 12 | Reflexion | 1:10 | 17:05 |
| 13 | Abschluss | 0:25 | 17:30 |

Wenn die Zeit knapp wird: Folie 9 nur zeigen, nicht besprechen (die Demo hat
es schon gezeigt), und auf Folie 12 nur je einen Punkt nennen.

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

[Übergang: Mail-Programm öffnen, beide Entwürfe absenden, zurück zu Folie 8.]

## 8 · Live: zwei Rechnungen (0:30)

Ich habe gerade zwei Rechnungen abgeschickt. Die erste ist eine kleine
Bürobedarf-Rechnung über 380 Euro, alles in Ordnung. Die sollte automatisch
freigegeben werden. Die zweite ist die Rechnung vom Anfang, Havel Logistik,
mit der abweichenden IBAN. Die sollte gestoppt werden.

Der Weg: Die Mail geht an ein Postfach. n8n, ein Werkzeug, das Abläufe
zwischen Diensten verbindet, holt den Anhang ab und reicht ihn an Finance-Ops
weiter. Finance-Ops prüft und entscheidet. Google Sheets protokolliert das
Ergebnis. Schauen wir es uns an.

## Live-Demo (5:00)

Ablauf und Ersatzwege: `docs/DEMO_LIVE_DE.md`. Klappt die Live-Demo nicht: Nach
Folie 8 folgen „Eingang“ (Bildschirmfotos Mail → n8n → Sheet) und
„Aufzeichnung“ (App-Teil als Video).

**n8n (30–45 s).** Hier ist der Ablauf in n8n. Links kommt die Mail an, in der
Mitte meldet sich n8n bei Finance-Ops an und übergibt die Datei, rechts wird
das Ergebnis ins Sheet geschrieben. [Auf „Executions“ wechseln.] Und hier sehen
wir: zwei Durchläufe, beide erfolgreich. Wichtig ist, was n8n nicht tut: Es
enthält keine einzige Geschäftsregel. Es transportiert nur.

**Google Sheet (20 s).** Im Protokoll stehen zwei neue Zeilen. Die
Bürobedarf-Rechnung: automatisch freigegeben. Havel Logistik: zur Prüfung, mit
dem Grund „IBAN weicht von den freigegebenen Bankverbindungen ab“.

**Finance-Ops, Posteingang (20 s).** So sieht das für Jonas aus. Oben die
gestoppte Rechnung, Status Sichtprüfung, darunter die freigegebene.

**INV-2026-00433 (40 s).** Die saubere Rechnung zuerst. Im Verlauf sieht man:
Nach dem Eingang hat nur das System gearbeitet. Keine Prüfung ist
fehlgeschlagen, der Betrag liegt unter der Auto-Grenze, also automatisch
freigegeben. Jonas musste nichts tun. Die offizielle KoSIT-Prüfung ist in der
Demo ausgeschaltet; im Betrieb liefe sie mit.

**HL-2026-7731 (2:00).** Jetzt die interessante. Ganz oben: „Was blockiert“,
in einem Satz. Darunter der Beleg: erwartet, gefunden, die abweichenden
Ziffern markiert. Jonas muss nichts suchen oder vergleichen.

[„Übrige 22 Prüfungen anzeigen“ klicken.] Alles andere ist ohne Befund:
20 bestanden, dazu ein reiner Hinweis und die offizielle Prüfung, die in der
Demo ausgeschaltet ist. Nur diese eine Prüfung ist fehlgeschlagen.
[Wieder einklappen.]

[Zurück nach oben scrollen, auf das Panel „Bankverbindung“ zeigen.] Und direkt
darunter der nächste Schritt: Die neue Bankverbindung wird zur Prüfung
vorgeschlagen. Die Rechnung selbst kann Jonas nicht freigeben, auch nicht mit
einer Begründung. Was dann passiert, zeige ich gleich.

[Zurück zu den Folien, dreimal weiter: Die Folien „Eingang“ und „Aufzeichnung“ überspringen.]

## 9 · Was Jonas bei einer Ausnahme sieht (0:40)

Kurz zusammengefasst, was wir gerade gesehen haben: kein Rätselraten. Der
Grund steht in einem Satz da, der Beleg direkt daneben, und der nächste
Schritt steht darunter. Alles andere ist ohne Befund und auf Wunsch
sichtbar.

## 10 · Menschliche Kontrolle (1:20)

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

## 11 · Geschäftlicher Nutzen (1:15)

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

## 12 · Reflexion (1:10)

Was nehme ich mit? Erstens: Die schwierigste Frage war nicht, was man
automatisiert. Sondern wo ein Mensch entscheiden muss, und wer genau.
Zweitens: Feste Regeln sind erklärbar. Jede Entscheidung lässt sich begründen,
und das schafft Vertrauen bei Finance. Drittens, ganz praktisch: Eine Demo
braucht Betriebsdisziplin. Die temporäre Tunnel-Adresse ist mehrfach
weggefallen. Daraus ist eine feste Checkliste geworden.

Die nächsten Schritte wären ein Pilot mit echten, anonymisierten
Rechnungsdaten eines Unternehmens, ein stabiler Betrieb statt Tunnel, bei dem
die offizielle KoSIT-Prüfung dauerhaft mitläuft, und echte Anbindungen an
Buchhaltung und Bank.

## 13 · Abschluss (0:25)

Die Rechnung vom Anfang: gestoppt, bevor Geld überwiesen wurde.
Automatisieren, was Routine ist. Kontrollieren, was kritisch ist.

Vielen Dank. Ich freue mich auf Ihre Fragen.

---

## Kurze Antworten auf erwartbare Fragen

**Hat das System einen Betrug erkannt?**
Nein. Es hat erkannt, dass die IBAN nicht zu den freigegebenen
Bankverbindungen passt. Ob das Betrug ist oder ein echter Bankwechsel, klärt
der Rückruf. Das System sorgt nur dafür, dass vorher nicht gezahlt wird.

**Warum entscheidet keine KI?**
Weil die Entscheidung nachvollziehbar und wiederholbar sein muss. Feste Regeln
liefern bei gleichen Daten immer dasselbe Ergebnis und nennen den Grund. Die KI darf eine
Ausnahme erklären, sie ist standardmäßig aus. → Backup B2.

**Was macht n8n genau? Warum nicht alles in n8n?**
n8n holt die Mail ab, meldet sich an, übergibt die Datei und schreibt das
Ergebnis ins Sheet. Die Regeln liegen an einer Stelle in der Anwendung, sind
dort getestet und gelten unabhängig davon, ob eine Rechnung per Mail, Formular
oder Upload kommt. → Backup B3.

**Warum drei Personen? Ist das nicht zu viel?**
Das ist die Regel, die ich für das Projekt gewählt habe, und sie ist im
System fest auf drei gesetzt. Ein Zwei-Personen-Modus ist im Datenmodell
vorbereitet, aber bewusst nicht freigegeben. Der Kern ist
die Trennung: Wer vorschlägt, prüft und gibt nicht selbst frei.

**Kann jemand den Rückruf einfach behaupten?**
Das System kann nicht beweisen, dass ein Anruf stattfand. Es macht ihn
nachvollziehbar: Nummer aus den Stammdaten, vorgelesene IBAN, wer wann, und
eine dritte Person muss zustimmen. → Backup B5.

**Woher kommen die 327 und 80 Stunden?**
Aus Annahmen für die fiktive Firma: Minuten pro Rechnung, Anteil der
Ausnahmen. Nichts davon ist gemessen. → Backup B4.

**Funktioniert das auch mit PDF-Rechnungen?**
Nein. Die Anwendung liest XRechnung im UBL-Format. Andere Formate wie CII oder
ZUGFeRD sind vorgesehen, aber nicht gebaut.

**Ist das produktionsreif?**
Nein, es ist ein Proof of Concept mit synthetischen Daten. Es läuft lokal,
für die Demo über einen temporären Tunnel. Buchungen gehen als CSV-Export
raus, Kontoauszüge kommen als Import, Zahlungen sind simuliert. Für den Betrieb
fehlen ein fester Server, echte Anbindungen an Buchhaltung und Bank und eine
dauerhaft laufende KoSIT-Prüfung, die eingebaut, in der Demo aber aus ist.
→ Backup B5.

**Ist das rechtskonform (GoBD, DSGVO, EN 16931)?**
Dazu mache ich bewusst keine Aussage. Das wäre im Pilot mit Fachleuten zu
prüfen.

**Wie schnell geht das?**
Im Test am 11.10.2026 lief eine n8n-Ausführung 2 bis 4 Sekunden, von der
Abholung der Mail bis zur Zeile im Sheet. Wie lange das Postfach braucht, bis
n8n die Mail abholt, habe ich nicht gemessen. → Backup B1.

**Wie viele Tests gibt es?**
Über 740 automatisierte Tests, dazu 83 dokumentierte
Architekturentscheidungen. → Backup B6.

**Was passiert, wenn dieselbe Rechnung zweimal kommt?**
Dieselbe Datei wird am Inhalt erkannt, auch unter anderem Namen, und als
Duplikat abgelegt, nicht ein zweites Mal geprüft.
