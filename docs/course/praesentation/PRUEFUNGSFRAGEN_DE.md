# Prüfungsfragen – Vorbereitung auf die Fragerunde

Gehört zu `praesentation_v5.html` und `SPRECHTEXT_V5_DE.md`. Stand: 19.10.2026.

20 Fragen, wie sie ein kritischer, aber fairer Prüfer im Kurs KI-Manager stellen
könnte, geordnet nach Wahrscheinlichkeit. Jede Antwort dauert gesprochen etwa
30 bis 60 Sekunden und beruht nur auf dem, was gebaut und dokumentiert ist.
Was geplant ist, steht als geplant da.

**Zum Gebrauch:** Nicht auswendig lernen. Für jede Frage den **Kern** (fett)
sicher sagen können, der Rest darf in eigenen Worten kommen. Wo
`[…]` steht, kenne nur ich die Antwort: Diese Stellen vorher ehrlich ausfüllen.

Schwierigkeit: ● leicht · ●● mittel · ●●● schwer

---

## 1. Warum ist das ein KI-Projekt, wenn feste Regeln entscheiden? ●●

**Kern: Die Entscheidung, wo KI hingehört und wo nicht, ist selbst
KI-Management.**

Über Geld entscheiden bei mir feste Regeln, weil sie bei gleichen Daten immer
dasselbe Ergebnis liefern und jedes Ergebnis einen Grund hat. Ein Sprachmodell
liefert das nicht garantiert, und den Rechnungstext schreibt der Absender, im
schlimmsten Fall der Betrüger. KI setze ich dort ein, wo ein Fehler wenig
kostet und ein Mensch draufschaut: Sie entwirft die Rückfrage an den
Lieferanten. Rechnungsnummer und Lieferant bekommt sie nicht, sie schreibt
Platzhalter;
die Anwendung prüft den Entwurf, ein Mensch gibt frei und verschickt von Hand.
Bei einer abweichenden IBAN gibt es keinen Entwurf. Mit dem echten Modell
waren zuerst 16 von 24 Entwürfen zulässig. Nach einer Zeile mehr im Prompt
waren es in einer gezielten Nachprüfung mit fünf Fällen 15 von 15, keine neue
Gesamtquote. Im Vergleich mit der festen Vorlage habe ich aber in sechs von
sechs Fällen die Vorlage gewählt. Für diese untersuchten Standardfälle zeigte sich kein erkennbarer Zusatznutzen durch KI. Erklären, warum eine Rechnung gestoppt wurde, kann sie auch; das ist gebaut, aber noch nicht mit dem echten Modell bewertet.
PDF-Rechnungen auszulesen wäre die nächste Stelle, das ist nur eine Idee.

**Nachfrage:** „Dann ist die KI doch nur Dekoration?“
→ Nein. Sie ist gebaut und mit einem echten Sprachmodell getestet. Aber in
den sechs untersuchten Standardfällen zeigte sich kein erkennbarer
Zusatznutzen: Sechsmal fiel die Wahl auf die Vorlage. Meine Hypothese hat sich
dort nicht bestätigt, deshalb würde ich mit der Vorlage starten. Offen ist, ob
die KI bei mehreren gleichzeitigen Problemen oder mit der verbesserten
Prompt-Fassung hilft. Ehrlich dazu: Der Vergleich war klein, mit Hilfe von
ChatGPT, nicht ganz blind und mit Entwürfen der ersten Prompt-Fassung. Ich
sage deshalb „kein erkennbarer Zusatznutzen in diesen Fällen“, nicht „die KI
ist schlechter“.

---

## 2. Wie viel haben Sie selbst gebaut, und welche Rolle hatte KI bei der Entwicklung? ●●●

**Kern: ehrlich sagen, wie gearbeitet wurde, und die eigene Rolle klar
benennen.**

Sehr wahrscheinlich, weil 788 Tests und 84 Entscheidungen in wenigen Wochen
auffallen. Antwortgerüst, mit den eigenen Fakten zu füllen:

„Ich habe mit KI-Programmierassistenten gearbeitet: […welche Werkzeuge, wofür].
Meine Rolle war: das Problem und den Prozess beschreiben, Anforderungen und
Kontrollen festlegen, jede Architekturentscheidung prüfen und freigeben, die
Ergebnisse gegen Tests und Demo abnehmen und bei Fehlern die Ursache
verlangen, nicht den schnellsten Workaround. […ein konkretes Beispiel, wo ich
eingegriffen oder etwas abgelehnt habe]. Genau das ist für mich die Lehre als
KI-Manager: Die KI liefert schnell, die Verantwortung für das Ergebnis bleibt
bei mir.“

**Nachfrage:** „Können Sie erklären, wie die IBAN-Prüfung im Code funktioniert?“
→ Auf Ablaufebene antworten: Die IBAN der Rechnung wird mit den freigegebenen
Konten des Lieferanten aus den Stammdaten verglichen. Bei Abweichung ist die
Prüfung fehlgeschlagen, Schwere hoch, nicht übersteuerbar. Die Rechnung geht in
die Prüfung, die abweichenden Zeichen werden markiert.

---

## 3. Woher kommen die 327 und 80 Stunden? ●

**Kern: Das ist eine Modellrechnung mit Annahmen, nicht gemessen.**

Ich habe angenommen: 2.000 Rechnungen im Monat, jede fünfte braucht Klärung.
Eine saubere Rechnung kostet heute sechs Minuten, mit dem System eine Minute
für die Freigabe. Eine Ausnahme 25 Minuten, mit dem System 8, weil der Beleg
schon daliegt. Daraus ergeben sich rund 327 und rund 80 Stunden. Diese
Minutenwerte sind in der Anwendung als Annahmen hinterlegt und werden im
Dashboard neben jeder daraus berechneten Zahl angezeigt. Ob das in einem echten
Unternehmen stimmt, muss ein Pilot messen.

**Nachfrage:** „Warum gerade 20 Prozent Ausnahmen?“
→ Eine Annahme für die fiktive Firma. Gerade diese Zahl würde ich im Pilot
zuerst messen, weil das Ergebnis stark davon abhängt.

---

## 4. Warum n8n, und warum liegen die Regeln nicht in n8n? ●●

**Kern: n8n transportiert, Finance-Ops entscheidet. Eine grüne Ausführung ist
keine Freigabe.**

n8n holt die Mail ab, nimmt den XML-Anhang, meldet sich bei Finance-Ops an,
übergibt die Datei und schreibt das Ergebnis ins Sheet. Die Regeln liegen nur
in der Anwendung. Dort sind sie getestet und gelten gleich, egal ob eine
Rechnung per Mail, Formular oder Upload kommt. Lägen sie zusätzlich in
n8n-Knoten, gäbe es zwei Stellen, die auseinanderlaufen können. Das habe ich
früh entschieden und dokumentiert (ADR-004).

**Nachfrage:** „Warum dann überhaupt n8n und nicht einfach ein Postfach-Abruf
im Code?“
→ Für die Demo zeigt n8n den Eingang sichtbar und Schritt für Schritt, ohne
Änderung an der Anwendung. Ein Postfach-Eingang im Code ist für einen echten
Betrieb geplant, nicht gebaut.

---

## 5. Welche Daten verarbeiten Sie, und wo landen sie? Stichwort DSGVO. ●●●

**Kern: Heute nur synthetische Daten. Für echte Daten fehlen Verträge und
Konzepte, das ist dokumentiert.**

Die Demo arbeitet nur mit erfundenen Daten. Ein echter Betrieb würde Daten von
Mitarbeitenden, Lieferanten und Rechnungen verarbeiten. Eingebaut ist:
Passwörter und Sitzungen nur als Hash, Protokolle ohne Inhalte der Anfragen,
Kennzahlen pro Prozess, nicht pro Person. Der offizielle Prüfer läuft lokal,
dafür verlässt keine Rechnung das System. Die KI ist aus, und eingeschaltet
bekäme sie nur minimierte Prüfinformationen, keine Rechnungsdatei, keine Namen,
IBANs gekürzt; für die Rückfrage dazu die Namen von Platzhaltern, nie deren
Werte. Im Google
Sheet stehen keine Bankdaten, n8n sieht die IBAN aber beim Transport. Vor echten Daten fehlen der Vertrag zur Auftragsverarbeitung,
ein Aufbewahrungs- und Löschkonzept und die Abstimmung mit dem
Datenschutzbeauftragten.

**Nachfrage:** „Und n8n und Google Sheets? Da laufen ja auch Daten durch.“
→ Richtig, im Datenschutzkonzept sind sie noch nicht behandelt. In der Demo
laufen nur synthetische Daten durch. Für echte Daten bräuchte es auch dafür
einen Vertrag zur Auftragsverarbeitung, oder n8n im eigenen Netz. Das Sheet ist
nur eine Anzeige. Den maßgeblichen Prüfpfad führt Finance-Ops selbst.

---

## 6. Hat das System bei Havel Logistik einen Betrug erkannt? ●

**Kern: Nein. Es hat eine Abweichung erkannt und die Zahlung verhindert, bis
sie geklärt ist.**

Das System sieht, dass die IBAN nicht zu den freigegebenen Bankverbindungen
des Lieferanten passt. Ob das Betrug ist oder ein echter Bankwechsel, weiß es
nicht. Das klärt der Rückruf unter der Nummer, die schon in den Stammdaten
steht. Die Kontrolle sorgt nur dafür, dass vorher nicht gezahlt wird. Und in
der Demo ist die Zahlung ohnehin simuliert.

**Nachfrage:** „Sie sagen auf Folie 3, die Bank prüft Name und IBAN. Reicht das
nicht?“
→ Es hilft, ersetzt aber kein verifiziertes Konto in den Stammdaten. Die Bank
prüft beim Bezahlen, ob der eingegebene Name zur IBAN passt. Ob der Lieferant
wirklich die Bank gewechselt hat und ob das Unternehmen dieses Konto
freigegeben hat, prüft sie nicht. Das ist im Projekt als Hypothese
festgehalten, nicht getestet. Wie genau die Banken bei einer Abweichung
vorgehen, würde ich mit der Hausbank klären, statt es zu behaupten.

---

## 7. Wie würden Sie messen, ob das System wirklich etwas bringt? ●●

**Kern: drei Kennzahlen und eine Leitplanke, gemessen mit derselben Methode wie
die Ausgangslage.**

Erstens die Automatisierungsquote: Wie viele Rechnungen kommen ohne
Sachprüfung durch? Zweitens die Bearbeitungszeit pro Rechnung, vorher und
nachher gleich gemessen. Drittens die Fehlalarme: Wie viele Stopps hatten
keinen echten Befund? Dazu eine Leitplanke: keine Zahlung auf ein ungeprüftes
Konto. Schneller ist kein Erfolg, wenn das Risiko steigt. Gemessen würde in
einem Pilot mit Parallelbetrieb, mit einer Go/No-go-Entscheidung nach vier
Wochen.

**Nachfrage:** „Wie erkennen Sie einen Fehlalarm?“
→ Im Parallelbetrieb entscheidet Jonas wie bisher. Hält das System eine
Rechnung an, die Jonas nach Prüfung bezahlt hätte, und der Grund war
unbegründet, ist das ein Fehlalarm. Das ist ein Vergleich mit dem menschlichen
Urteil, keine Messung der Anwendung allein.

---

## 8. Wie stellen Sie sicher, dass die KI nichts Falsches schreibt? ●●●

**Kern: Ganz ausschließen lässt es sich nicht. Deshalb ist sie ein
gekennzeichneter Vorschlag und entscheidet nichts.**

Bei der Rückfrage schreibt das Modell Platzhalter statt Werte; die Anwendung
setzt Rechnungsnummer und Betrag erst nach der Prüfung ein. Jeder Entwurf ohne
belegte Zahlen, mit Kontakt- oder Bankdaten oder mit einer Aussage über
Freigabe oder Zahlung wird abgelehnt, dann springt die Vorlage ein. In der
Bewertung waren alle Ablehnungen solche unbelegten Zahlen, darunter zwei
richtig gerechnete Differenzen, die die Prüfung bewusst nicht zulässt.

Jede Antwort wird vor der Anzeige gegen die Belege geprüft. Nennt sie eine Zahl
oder Kennung, die nicht in den Prüfergebnissen steht, oder klingt sie nach
Freigabe oder Zahlung, wird sie nicht angezeigt. Die regelbasierten
Prüfergebnisse stehen auf dem Bildschirm über der Erklärung. Ein Test schlägt
fehl, sobald Workflow- oder Zahlungscode die KI einbindet. Die Grenze:
Widersprüche im freien Text erkennt die Prüfung nur über eine Liste von
Formulierungen.

**Nachfrage:** „Und wenn Jonas der KI trotzdem blind vertraut?“
→ Übervertrauen lässt sich durch Gestaltung verringern, nicht ausschließen.
Deshalb kann die Erklärung nichts auslösen. Die Entscheidung trifft Jonas immer
auf Basis der Belege, und die Freigabe ist ein eigener Schritt.

---

## 9. Was passiert, wenn n8n oder Finance-Ops ausfällt, und wer merkt das? ●●

**Kern: Es geht nichts verloren und nichts wird falsch freigegeben, aber heute
merkt es nur, wer nachschaut.**

Fällt n8n aus, bleiben die Mails im Postfach, und man lädt die Rechnungen
direkt in Finance-Ops hoch. Ist Finance-Ops nicht erreichbar, bricht n8n beim
Anmelden ab und zeigt den Lauf rot. Die Mail gilt dann als abgeholt, man sendet
erneut. Doppelt senden ist sicher, dieselbe Datei wird als Duplikat erkannt.
Eine automatische Benachrichtigung bei Ausfall gibt es noch nicht. Das wäre der
nächste Schritt, etwa ein Fehler-Workflow in n8n an ein Team-Postfach.

**Nachfrage:** „Holt n8n nach einem Neustart die liegengebliebenen Mails ab?“
→ Das habe ich nicht getestet. Ich würde es nicht behaupten, sondern vor einem
Pilot gezielt prüfen.

---

## 10. Warum drei Personen für eine neue Bankverbindung? Bremst das nicht? ●●

**Kern: meine Projektregel, keine allgemeine Pflicht. Der Kern ist die
Trennung: Wer vorschlägt, prüft und gibt nicht selbst frei.**

Eine geänderte Bankverbindung ist der Punkt, an dem echtes Geld falsch fließen
kann. Deshalb: Person eins schlägt vor, Person zwei ruft unter der hinterlegten
Nummer zurück, Person drei gibt frei. Das kommt selten vor, im Vergleich zu
den vielen Rechnungen, die einfach durchlaufen. Die Bremse sitzt also genau
dort, wo sie sich lohnt. Ein Zwei-Personen-Modus ist im Datenmodell vorbereitet,
aber bewusst nicht freigegeben.

**Nachfrage:** „Was macht ein kleines Unternehmen mit nur zwei Leuten in der
Buchhaltung?“
→ Dann wäre über den Zwei-Personen-Modus zu sprechen. Den würde ich aber erst
nach einer Abwägung mit dem Unternehmen freigeben, nicht pauschal.

---

## 11. Warum selbst bauen statt eine fertige Lösung kaufen, etwa DATEV, Candis oder finway? ●●●

**Kern: Das ist kein Konkurrenzprodukt. Das Projekt zeigt die Entscheidungen
hinter so einem System. In einem echten Unternehmen würde ich zuerst prüfen, ob
ein fertiges Produkt reicht.**

Lösungen wie DATEV, Candis oder finway bilden Rechnungseingang, Freigaben und
die Übergabe an die Buchhaltung schon ab, teils mit KI beim Erfassen. Mein
Projekt will das nicht besser machen. Es macht sichtbar, welche Entscheidungen
dahinter stehen: was eine feste Regel entscheidet, wo ein Mensch entscheidet
und wo KI hilft. Genau diese Fragen müsste ein Unternehmen auch bei einem
gekauften Produkt beantworten, etwa bei der Einrichtung der Freigaben.

**Nachfrage:** „Was kann Ihre Lösung, was diese Produkte nicht können?“
→ Das behaupte ich nicht. Ich habe mir die Produkte angesehen, aber nicht im
Detail verglichen und nicht getestet. Für eine Kaufentscheidung würde ich mit
eigenen Rechnungen testen: Wie wird eine abweichende IBAN behandelt, lässt sie
sich übersteuern, wer muss eine neue Bankverbindung freigeben, und was steht
danach im Prüfpfad?

---

## 12. Wie würden Sie das System bei Nordwerk einführen? ●●

**Kern: erst abstimmen, dann parallel laufen lassen, vergleichen, dann
entscheiden.**

Zuerst die Regeln mit dem Finance-Team abstimmen: Welche Grenzen gelten, wer
ist für welche Ausnahme zuständig? Dann ein Parallelbetrieb: Echte Rechnungen
laufen mit, aber Jonas entscheidet wie bisher. Dann vergleichen: Wo hätte das
System anders entschieden, und warum? Erst danach wird entschieden, ob
ausgeweitet oder nachgeschärft wird. Dazu eine Ansprechperson in der
Kreditorenbuchhaltung und kurze Schulungen am echten Fall. Das ist ein
Vorschlag, umgesetzt ist davon noch nichts.

**Nachfrage:** „Wie lange würde das dauern?“
→ Im Konzept vorgeschlagen: eine Gesellschaft, 8 bis 10 Wochen, die ersten vier
im Parallelbetrieb, mit einer Go/No-go-Entscheidung nach Woche vier und am Ende.

---

## 13. Was beweisen 788 Tests, und was nicht? ●●

**Kern: Sie beweisen, dass sich die Kontrollen im Proof of Concept wie
beschrieben verhalten. Sie beweisen keine Produktionsreife.**

Getestet sind die Regeln, die Freigaben, die Funktionstrennung, der Geldweg und
die Fehlerfälle, gegen eine echte Datenbank, im Browser und gegen den echten
KoSIT-Prüfer. Die Tests laufen bei jeder Änderung automatisch. Was sie nicht
zeigen: Verhalten unter echter Last, mit echten Lieferantendaten, mit echten
Bank- und Buchhaltungssystemen. Die Anbindungen an DATEV und die Bank gibt es
noch nicht. Dort liegt die größte Unsicherheit für einen Pilot.

**Nachfrage:** „Wer hat die Tests geschrieben, und wer prüft die Tests?“
→ […ehrlich, siehe Frage 2]. Zusätzlich gab es dokumentierte Reviews der
Kontrolllogik, deren Befunde behoben wurden: […wer sie durchgeführt hat].

---

## 14. Ist das GoBD- oder EN-16931-konform? ●●

**Kern: Dazu mache ich bewusst keine Aussage.**

Ich nutze den offiziellen KoSIT-Prüfer in einer festen Version. Er liefert eine
Bewertung, ob eine Rechnung dem Standard entspricht. Das System selbst
zertifiziert nichts. Für GoBD fehlen zum Beispiel ein revisionssicheres
Archiv und ein Aufbewahrungskonzept. Das wäre im Pilot mit Fachleuten zu
prüfen. Ich wollte nichts versprechen, was ich nicht belegen kann.

**Nachfrage:** „Ist der Prüfer in der Demo überhaupt aktiv?“
→ Nein, in der Demo ist er aus. Im Produktionsmodus startet die Anwendung ohne
ihn gar nicht. Ist er eingerichtet, aber nicht erreichbar, geht eine Rechnung
in die Prüfung, nie in die Freigabe.

---

## 15. 40 Prozent der Rechnungen kommen noch als PDF. Was dann? ●●

**Kern: Heute nicht abgedeckt. Genau dort könnte KI später sinnvoll helfen,
mit menschlicher Bestätigung.**

Die Anwendung liest nur XRechnung, also strukturierte Daten. Die 40 Prozent
sind eine Annahme für Nordwerk. Für PDFs könnte KI die Felder auslesen. Ein
Mensch bestätigt sie, und danach gelten dieselben festen Regeln wie für jede
E-Rechnung. Die KI würde also die Eingabe vorbereiten, nicht entscheiden. Das
ist eine Idee, nicht gebaut. Laut meiner Recherche wird ab 2027 und 2028
schrittweise auch das Versenden von E-Rechnungen Pflicht. Dann dürfte der
Anteil strukturierter Rechnungen steigen.

**Nachfrage:** „Wie würden Sie die Qualität dieser Auslesung messen?“
→ An einer Stichprobe mit bekannten Werten: Anteil richtig erkannter Felder,
vor allem IBAN und Betrag, und wie oft der Mensch korrigieren muss.

---

## 16. Kann der Rückruf manipuliert werden? ●●●

**Kern: Ja, die Kontrolle hat Grenzen, und die sind dokumentiert.**

Ist schon die hinterlegte Rückrufnummer falsch, oder wird der Anruf selbst
manipuliert, greift die Kontrolle nicht. Das System kann auch nicht beweisen,
dass ein Anruf stattfand. Es macht ihn nachvollziehbar: welche Nummer, welche
vorgelesene IBAN, wer, wann, und eine dritte Person muss zustimmen. Absprachen
zwischen mehreren Personen verhindert keine Software. Und noch eine Grenze: Das
alte Konto bleibt vertrauenswürdig, bis ein Stilllegen gebaut ist.

**Nachfrage:** „Warum haben Sie das Stilllegen nicht gebaut?“
→ Feature Freeze vor dem Kurs-Ende. Ich habe es lieber als bekannte Grenze
dokumentiert, als es unter Zeitdruck halb zu bauen.

---

## 17. Was passiert mit Jonas' Arbeitsplatz, und wird er überwacht? ●●

**Kern: Seine Arbeit verschiebt sich von Routine zu Ausnahmen. Die Kennzahlen
sind bewusst prozessbezogen, nicht personenbezogen.**

Jonas prüft nicht mehr jede Rechnung, sondern die, bei denen es auf sein
Urteil ankommt. Das System ist kein Werkzeug zur Leistungskontrolle: Kennzahlen
werden pro Prozess berechnet, nie pro Person. Wo es einen Betriebsrat gibt, hat
er bei technischer Überwachung ein Mitspracherecht. Das sollte vor einem Pilot
besprochen werden.

**Nachfrage:** „Wenn 75 Prozent der Zeit wegfallen, braucht man dann weniger
Leute?“
→ Das wäre eine Entscheidung des Unternehmens, nicht des Systems. Und die Zahl
ist modelliert. Realistischer ist, dass die gewonnene Zeit erst in Klärungen,
Skonto-Nutzung und Abstimmung geht, aber auch das müsste ein Pilot zeigen.

---

## 18. Warum hat das Projekt keine KI gegen Betrug, etwa eine Anomalie-Erkennung? ●●●

**Kern: Für die bekannte Masche reicht eine klare Regel. Eine Anomalie-Erkennung
bräuchte echte Daten und erzeugt Fehlalarme.**

Die häufigste Masche ist eine andere IBAN auf einer echt aussehenden Rechnung.
Die erkennt eine einfache Regel zuverlässig, und jeder Treffer hat einen
klaren Grund. Eine lernende Anomalie-Erkennung bräuchte echte Rechnungsdaten
zum Trainieren, die ich nicht habe, und jeder unbegründete Alarm kostet Jonas
Zeit. Als Ergänzung später denkbar, aber nur gemessen an den Fehlalarmen.

**Nachfrage:** „Und Betrug, den keine Regel kennt?“
→ Den fängt mein System nicht. Das ist eine ehrliche Grenze. Eine
Anomalie-Erkennung könnte dort Hinweise geben, aber entscheiden sollte auch sie
nicht.

---

## 19. Was fehlt für einen echten Betrieb? ●

**Kern: Anbindungen, Betrieb, Anmeldung, und ein Pilot mit Messwerten.**

Es fehlen: eine Bankanbindung für Zahlungen und Kontoauszüge, ein Export, den
die Buchhaltung direkt importiert, etwa DATEV, Anmeldung mit Firmenkonto und
zweitem Faktor, ein fester Server statt Tunnel mit Backups und Alarmen, ein
revisionssicheres Archiv und weitere Rechnungsformate wie ZUGFeRD. Vor allem
aber ein Pilot, der den Nutzen misst. Ein funktionierender Prototyp ist noch
kein eingeführter Prozess.

**Nachfrage:** „Was davon zuerst?“
→ Der Pilot im Parallelbetrieb, weil er zeigt, ob sich der Rest lohnt. Er
braucht keine Bankanbindung, weil weiter die bestehende Banksoftware zahlt.

---

## 20. Was würden Sie heute anders machen? ●●

**Kern: eine echte Erkenntnis nennen, keine Floskel.** Vorschlag, nur sagen,
was für mich stimmt.

Zwei Dinge. Erstens hätte ich früher mit echten Menschen aus der Buchhaltung
gesprochen. Die Annahmen der Modellrechnung stammen von mir, nicht aus
Interviews. Zweitens hätte ich den Betrieb der Demo früher ernst genommen. Die
temporäre Tunnel-Adresse ist mehrfach weggefallen, daraus sind erst spät
Checkliste und Ausfallplan entstanden. Und die schwierigste Frage war am Ende
nicht, was man automatisiert, sondern wo ein Mensch entscheiden muss.

**Nachfrage:** „Und was würden Sie genauso wieder machen?“
→ Jede Entscheidung schriftlich begründen und Grenzen offen dokumentieren. Das
hat mir in dieser Fragerunde geholfen.

---

## Wenn ich etwas nicht weiß

„Das habe ich nicht getestet“ oder „Das ist nicht gebaut“ ist eine gute
Antwort. Danach einen Satz, wie ich es prüfen würde. Nie raten, nie Geplantes
als fertig darstellen.
