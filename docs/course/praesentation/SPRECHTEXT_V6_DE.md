# Sprechtext – Abschlusspräsentation v6

Gehört zu `praesentation_v6.html`: 12 Folien mit der Live-Demo in der Mitte,
dahinter Reservefolien R1 bis R4. Die Fassung v5 bleibt unverändert
(`praesentation_v5.html`, `SPRECHTEXT_V5_DE.md`, Git-Tag `deck-v5-final`).
Klickfolge, Start der Demo-Instanz und Reserveplan: `LIVE_DEMO_DE.md`.

Ziel: etwa 19:00 Minuten, Obergrenze 22 bis 23 Minuten. Die Dauern
rechnen mit 95 Wörtern pro Minute, dem Tempo aus der Probe vom 17.10.2026.
Die Live-Demo hat eine feste Zeit von 7:55, Tab-Wechsel inklusive.
Sätze in eckigen Klammern sind Regieanweisungen.

| Folie | Inhalt | Dauer | Uhr |
|---|---|---|---|
| 1 | Titel | 0:15 | 0:15 |
| 2 | Eine Rechnung wie jede andere | 0:30 | 0:45 |
| 3 | Der zweite Blick | 1:30 | 2:15 |
| 4 | Woher ich das kenne | 1:15 | 3:30 |
| 5 | Für wen: Jonas | 1:05 | 4:35 |
| 6 | Fünf Wege. Eine Stelle entscheidet. | 1:00 | 5:35 |
| 7 | **Live-Demo** (8 Schritte) | 7:55 | 13:30 |
| 8 | Menschliche Kontrolle | 1:05 | 14:35 |
| 9 | Warum hier nicht die KI entscheidet | 2:05 | 16:40 |
| 10 | Nutzen und wie man ihn misst | 1:10 | 17:50 |
| 11 | Reflexion und Einführung | 0:45 | 18:35 |
| 12 | Abschluss | 0:25 | 19:00 |

Puffer bis 22:00: 3:00. Er ist für Wartezeiten in der Live-Demo gedacht.

Wenn die Zeit knapp wird: in der Live-Demo die Schritte 7 und 8 nur ansagen,
auf Folie 10 die Pilotkennzahlen nur nennen, auf Folie 11 die Einführung nur
nennen. Klappt ein Live-Schritt nicht: nicht reparieren, sondern in die Reserve
wechseln (`LIVE_DEMO_DE.md`, Abschnitt Reserve).

Tasten in der Präsentation: Pfeiltasten wechseln die Folie, **Zahl und Enter**
springt zu einer Folie (etwa 8 Enter), **V** springt zum Reserve-Video, **S**
öffnet die Referentenansicht.

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

## 4 · Woher ich das kenne (1:15)

Warum gerade dieses Thema? Ich habe in den Operations eines FinTech-Unternehmens
gearbeitet, das Girokonten für Privatkunden anbietet. Zwei meiner Bereiche waren
Pfändungen und behördliche Auskunftsersuchen: viele Schritte, die sich ständig
wiederholen, fast alles von Hand. Gerade bei solcher Arbeit ist der Mensch nicht
die beste Prüfinstanz. Die Aufmerksamkeit lässt nach, nicht aus Nachlässigkeit,
sondern weil die Arbeit so ist.

Mein Projekt baut diesen Prozess nicht nach. Ich habe einen anderen Fall
gewählt, mit demselben Muster: Ein Dokument kommt an, Daten werden abgeglichen,
feste Regeln angewendet, Abweichungen erkannt, ein Mensch entscheidet, wo es
nötig ist, und jeder Schritt ist belegt. Die E-Rechnung eignet sich dafür: Sie
ist strukturiert, ich kann sie mit synthetischen Daten vorführen, und seit 2025
müssen Unternehmen sie empfangen können.

## 5 · Für wen: Jonas (1:05)

Damit es konkret wird: Jonas Weber, eine erfundene Person im Finance-Team der
Nordwerk GmbH, einem ausgedachten Mittelständler mit rund 2.000
Eingangsrechnungen im Monat. Das ist eine Annahme, keine gemessene Zahl. Heute
prüft Jonas jede Rechnung selbst. Er will aber nur drei Dinge wissen: Muss ich
mir die ansehen? Wenn ja, warum genau? Und was ist der nächste Schritt?

Mit Finance-Ops prüft das System jede Rechnung nach festen Regeln. In unserem
Modell kommen acht von zehn ohne Sachprüfung durch, zwei landen mit Grund bei
Jonas. Ohne Sachprüfung heißt nicht automatisch bezahlt: Bis 500 Euro gibt das
System frei, darüber unterschreibt ein Mensch.

## 6 · Fünf Wege. Eine Stelle entscheidet. (1:00)

So läuft eine Rechnung durch. Links der Eingang: Im Betrieb kommt sie per
E-Mail, gleich in der Demo über ein Formular. n8n nimmt die Datei an und reicht
sie an Finance-Ops weiter. Geprüft und entschieden wird nur dort, und alles
liegt in der PostgreSQL-Datenbank von Finance-Ops, auch der Prüfpfad.

Rechts die Wege. Drei davon zeige ich gleich live: automatisch frei, Freigabe
durch einen Menschen und gestoppt wegen der IBAN. Bei einer anderen Abweichung
kann die KI eine Rückfrage entwerfen, auch das zeige ich. Und unten der
technische Ausfall: Dann wird nichts geprüft und nichts freigegeben.

## 7 · Live-Demo (7:55)

[Cmd + Tab zum Demo-Fenster. Tabs: Formular 1, 2, 3 · n8n-Ausführungen ·
Finance-Ops. Klappt etwas nicht: Reserve, nicht reparieren.]

Eingang heute per n8n-Formular. Im Betrieb kommt die Rechnung per E-Mail,
danach ist der Weg derselbe.

**1 · 380 €** G_clean_380 einreichen: „Freigegeben“. Kein Mensch nötig.

**2 · 1.240 €** A_clean_1240: „Freigabe ausstehend“. Ein Mensch muss
unterschreiben.

**3 · 2.499 €** B_iban_changed_2499: „Sichtprüfung“. Die IBAN weicht ab.

**4 · Wege in n8n** Havel-Ausführung öffnen: Der Switch ging nach „Gestoppt:
Sichtprüfung“. n8n folgt nur der Antwort von Finance-Ops. Grün heißt:
transportiert.

**5 · Fehlerpfad** Ausführung 200216: rot, „Technischer Fehler – nicht
geprüft“. Nichts geprüft, nichts freigegeben. Getestet, nicht live provoziert.

**6 · Jonas** Havel öffnen: Grund, markierte Ziffern, keine Rückfrage, nur
Rückruf. Dahinter stehen 788 automatisierte Tests.

**7 · KI** Spree IT: KI-Entwurf erstellen. Die Werte setzt die Anwendung ein.
Einen Satz ändern, Text freigeben: freigegeben, nicht versendet.

**8 · Tim** Abmelden, als Tim Kessler anmelden, die 1.240 € freigeben. Anna,
die eingereicht hat, könnte das nicht.

[Cmd + Tab zurück, Pfeiltaste zu Folie 8.]

## 8 · Menschliche Kontrolle (1:05)

Und wenn Havel Logistik wirklich die Bank gewechselt hat? Dann gilt: Eine
Rechnung kann die Bankverbindung nie ändern. Die IBAN auf der Rechnung ist
genau das, was ein Betrüger kontrolliert.

Person eins schlägt die neue Bankverbindung vor. Person zwei ruft beim
Lieferanten an, nur über die Nummer aus den Stammdaten, und lässt sich die IBAN
vorlesen. Person drei gibt frei. Erst dann prüft das System die Rechnung noch
einmal, und auch dann unterschreibt ein Mensch: Eine einmal gestoppte Rechnung
wird nie automatisch freigegeben.

Drei Personen sind meine Projektregel, keine allgemeine Pflicht. Der Punkt: Wer
vorschlägt, prüft und gibt nicht selbst frei.

## 9 · Warum hier nicht die KI entscheidet (2:05)

Sie haben eben gesehen: Entschieden haben feste Regeln, keine KI. Das war eine
bewusste Entscheidung. Über Geld entscheiden Regeln: gleiche Daten, gleiches
Ergebnis, und jedes Ergebnis hat einen Grund. Ein Sprachmodell liefert nicht
garantiert jedes Mal dasselbe, eine plausible Begründung ist kein Beleg, und den
Rechnungstext schreibt der Absender, im schlimmsten Fall der Betrüger.

Die KI-Rückfrage ist gebaut und mit einem echten Sprachmodell getestet, Claude
Sonnet 5.5 von Anthropic. 16 von 24 Entwürfen waren zulässig. Nach einer
Korrektur am Prompt bestanden in einer gezielten Nachprüfung 15 von 15. Eine
neue Gesamtquote ist das nicht.

Entscheidend war der Vergleich mit der festen Vorlage. Im kleinen
Präferenzvergleich wurden in 6 von 6 Fällen die festen Vorlagen bevorzugt. Für
diese untersuchten Standardfälle zeigte sich kein erkennbarer Zusatznutzen
durch KI. Die KI-Texte waren länger und erklärten Regeln, die der Lieferant
nicht braucht. Der Vergleich war klein, mit Hilfe von ChatGPT und mit Entwürfen
der ersten Prompt-Fassung; verallgemeinern lässt sich das nicht. Gebaut,
gemessen und dann die einfachere Lösung gewählt: Das ist für mich
KI-Management.

Fertige Lösungen wie DATEV, Candis oder finway würde ich in einem Unternehmen
zuerst prüfen. Mir ging es darum, die Entscheidungen dahinter nachvollziehbar
zu machen.

## 10 · Nutzen und wie man ihn misst (1:10)

Was bringt das? Links eine Modellrechnung für Nordwerk, klar gesagt: Annahmen,
nicht gemessen. 2.000 Rechnungen im Monat, jede fünfte braucht eine Klärung.
Eine saubere Rechnung kostet heute sechs Minuten, mit dem System eine, eine
Ausnahme 25 statt 8. Dann sinkt der Aufwand von rund 327 auf 80 Stunden im
Monat.

Ob das stimmt, muss ein Pilot zeigen. Vorab habe ich die Regeln an 20
synthetischen Rechnungen mit bekanntem Soll geprüft: Alle 20 landen richtig,
beide fremden IBANs gestoppt. Die Mischung habe ich gewählt.

Im Pilot würde ich messen: Automatisierungsquote, Bearbeitungszeit und
Fehlalarme. Dazu eine Leitplanke: keine Zahlung auf ein ungeprüftes Konto.
Schneller ist kein Erfolg, wenn das Risiko steigt.

## 11 · Reflexion und Einführung (0:45)

Was nehme ich mit? Die schwierigste Frage war nicht, was man automatisiert,
sondern wo ein Mensch entscheiden muss. Ein Prototyp ist noch kein eingeführter
Prozess. Und eine Demo braucht Betriebsdisziplin; deshalb gibt es für heute
einen Ausfallplan.

Bei Nordwerk würde ich so einführen: Regeln mit dem Finance-Team abstimmen,
dann ein Parallelbetrieb, in dem Jonas wie bisher entscheidet, vergleichen und
erst dann ausweiten oder nachschärfen. Das ist ein Vorschlag, umgesetzt ist
davon nichts.

## 12 · Abschluss (0:25)

Die Rechnung vom Anfang: gestoppt, bevor Geld überwiesen wird. In der Demo ist die
Zahlung simuliert, die Kontrolle dahinter ist echt.
Automatisieren, was Routine ist. Kontrollieren, was kritisch ist.

Vielen Dank. Ich freue mich auf Ihre Fragen.

---

# Reservefolien hinter Folie 12

Nur bei Bedarf. Im Deck heißen sie R1 bis R4.

## 13 · Demo-Video (4:15)

[Reserve: nur wenn die Live-Demo nicht läuft. Aufnahme vom 15.10.2026, Eingang per E-Mail, mit dem ursprünglichen Workflow ohne Verzweigung. Danach Zahl 8 und Enter: weiter mit Folie 8.]

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

[Video endet bei 4:05. Zahl 8 und Enter: weiter mit Folie 8.]

## 14 · KI-Rückfrage (Reserve) (0:45)

[Reserve, wenn das Modell oder Finance-Ops nicht antwortet. Aufnahme vom
19.10.2026 mit dem echten Modell auf einer Testdatenbank.]

Links der KI-Entwurf: Rechnungsnummer, Betrag und Bestellung hat die Anwendung
nach der Prüfung eingesetzt, das Modell kannte sie nicht. Ein Mensch prüft,
gibt frei und versendet von Hand. Rechts Havel Logistik: Bei abweichender IBAN
gibt es keine Rückfrage, nur den Rückruf.

## 15 · Was Jonas bei einer Ausnahme sieht (0:35)

Zusammengefasst: kein Rätselraten. Oben steht in einem Satz, was blockiert.
Darunter der Beleg, die abweichenden Ziffern markiert. Der Rest ohne Befund.
Und direkt darunter der nächste Schritt.

Das ist die Oberfläche. Dahinter stehen 788 automatisierte Tests und 84
dokumentierte Architekturentscheidungen. Die Kontrollen sind also geprüft und
nachvollziehbar. Getestet ist das mit synthetischen Daten, nicht im
Echtbetrieb.

## 16 · Gestoppt ist nicht ausgefallen (1:15)

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

---

## Kurze Antworten auf erwartbare Fragen

Im Deck liegen hinter Folie 12 die Reservefolien R1 bis R4 (Demo-Video,
KI-Rückfrage, Was Jonas sieht, Gestoppt ist nicht ausgefallen). Weitere
Referenzfolien B1 bis B7 stehen in `backup_folien_v5.html`; B8 ist jetzt
Folie 6. Die Verweise unten nennen die passende Folie.

**Hat das System einen Betrug erkannt?**
Nein. Es hat erkannt, dass die IBAN nicht zu den freigegebenen
Bankverbindungen passt. Ob das Betrug ist oder ein echter Bankwechsel, klärt
der Rückruf. Das System sorgt nur dafür, dass vorher nicht gezahlt wird.

**Warum ist das ein KI-Projekt, wenn Regeln entscheiden?**
Weil die Wahl der richtigen Technik Teil des KI-Managements ist. Über Geld
entscheiden Regeln, weil sie wiederholbar und begründet sind. KI setze ich
dort ein, wo ein Fehler wenig kostet und ein Mensch draufschaut: Sie entwirft
die Rückfrage an den Lieferanten und erklärt Ausnahmen. Später denkbar:
PDF-Rechnungen auslesen, mit Bestätigung durch einen Menschen. → Folie 9.

**Wie haben Sie die KI bewertet?**
Die Rückfrage mit dem echten Modell: acht Fälle, je dreimal, jeder Entwurf
durch dieselben festen Prüfungen wie in der Anwendung. In der ersten Runde
waren 16 von 24 zulässig. Fünf Ablehnungen kamen von nummerierten Listen, zwei
von einer Differenz, die das Modell selbst gerechnet hatte, und ein Entwurf
brach an der Längengrenze ab. Nach einer Zeile im Prompt waren in einer
gezielten Nachprüfung mit fünf Fällen 15 von 15 zulässig. Eine neue
Gesamtquote ist das nicht. Beide IBAN-Fälle wurden vor jedem Aufruf
verweigert. Zusammen etwa 30 Cent. Im Vergleich mit der festen Vorlage fiel
meine Wahl sechsmal von sechs auf die Vorlage. Die Erklärfunktion ist noch nicht mit dem echten
Modell bewertet. (`docs/course/KI_BEWERTUNG_DE.md`)

**Sieht die KI die Rechnungsdaten?**
Nicht die Rechnung selbst. Sie bekommt die fehlgeschlagenen Prüfungen mit
ihren freigegebenen Belegen, bei einer Überschreitung etwa Netto- und
Bestellbetrag. Keine Rechnungsnummer, keinen Lieferanten, keinen Firmennamen,
keine IBAN. Diese Werte setzt die Anwendung erst nach der Prüfung über
Platzhalter ein. Eine Anweisung, die jemand in der Rechnung versteckt, kommt
beim Modell gar nicht an.

**Ist die KI-Funktion wirklich gebaut, oder nur ein Konzept?**
Gebaut und mit einem echten Sprachmodell getestet, Claude Sonnet 5.5: 24
Entwürfe in der Erstbewertung, 15 in der Nachprüfung, dazu ein Durchlauf in
der Anwendung bis „von Hand versendet“. Ich kann sie live zeigen, und als
Reserve gibt es Screenshots.

**Warum haben Sie die KI gebaut, wenn die Vorlage bevorzugt wurde?**
Weil man das erst weiß, wenn man misst. Die Frage war, wo die KI eine echte
Aufgabe bekommt. Ich habe sie gebaut, abgesichert und mit einem echten
Sprachmodell gegen die einfachste Lösung getestet. Für die untersuchten
Standardfälle zeigte sich kein erkennbarer Zusatznutzen. In einer Einführung
würde ich mit der Vorlage starten. Ob die KI bei mehreren gleichzeitigen
Problemen oder mit der verbesserten Prompt-Fassung hilft, habe ich nicht
verglichen.

**Wie unabhängig war der Vergleich?**
Nicht ganz. Eine Person, eine Präferenz je Fall, keine Punkte. Verglichen habe
ich mit Hilfe von ChatGPT, und ich wusste vorher, dass die KI-Texte im Schnitt
länger sind. Deshalb sage ich: kein erkennbarer Zusatznutzen in diesen
Fällen. Ich sage nicht: Die KI ist schlechter. (`docs/course/KI_BEWERTUNG_DE.md`)

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

**Warum in der Demo ein Formular statt einer E-Mail?**
Weil es zuverlässig und sofort sichtbar ist. Danach läuft derselbe Weg wie bei
einer Mail: Datei an Finance-Ops, Entscheidung dort, Verzweigung in n8n nach
der Antwort. Der Mail-Eingang ist im Video (R1) zu sehen.

**Woher weiß n8n, welcher Zweig gilt?**
Aus der Antwort von Finance-Ops: Feld `routing.decision` (AUTO_APPROVE,
APPROVAL, REVIEW) und der Status. In n8n steht keine Betragsgrenze und keine
IBAN-Prüfung. Getestet am 20.10.2026 mit drei Rechnungen und einem Ausfall.

**Warum Google Sheets und keine richtige Datenbank, etwa Supabase?**
Die Datenbank gibt es schon: Finance-Ops speichert alle Daten, Entscheidungen
und den Prüfpfad in PostgreSQL. Das Sheet ist nur ein zusätzliches Protokoll,
das n8n schreibt; es wirkt nicht auf Finance-Ops zurück. Eine Umstellung auf
Supabase ist dafür nicht nötig. In einem echten Betrieb würde ich das Sheet
weglassen oder durch eine Ansicht in Finance-Ops ersetzen. → Folie 6.

**Woher wissen Sie, dass sich das lohnt?**
Noch gar nicht. 327 und 80 Stunden sind eine Modellrechnung. Ein Pilot im
Parallelbetrieb würde Automatisierungsquote, Bearbeitungszeit und Fehlalarme
messen, mit derselben Methode wie die Ausgangslage. → Folie 10.

**Was passiert mit den Mitarbeitenden?**
Jonas prüft nicht mehr jede Rechnung, sondern die Ausnahmen. Im Pilot
entscheidet er zuerst wie bisher, und wir vergleichen. Eine Ansprechperson in
der Kreditorenbuchhaltung und kurze Schulungen am echten Fall gehören dazu
(`docs/course/ROLLOUT_UND_REFLEXION_DE.md`).

**Was macht n8n genau? Warum nicht alles in n8n?**
n8n nimmt die Datei an, per Mail oder in der Demo per Formular, meldet sich
an, übergibt die Datei, verzweigt nach der Antwort von Finance-Ops und schreibt
das Ergebnis ins Sheet. Die Regeln liegen an einer Stelle in der Anwendung, sind
dort getestet und gelten unabhängig davon, ob eine Rechnung per Mail, Formular
oder Upload kommt. Eine grüne n8n-Ausführung heißt nur: transportiert, nicht
freigegeben. → Folie 6 und Referenzfolie B3.

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
Aus einer Modellrechnung für die fiktive Firma, nichts davon ist gemessen.
Angenommen sind 2.000 Rechnungen im Monat, davon 20 Prozent Ausnahmen, also
1.600 saubere und 400 Ausnahmen. Heute 6 Minuten je saubere Rechnung und 25 je
Ausnahme: 19.600 Minuten, rund 327 Stunden. Mit dem System 1 und 8 Minuten:
4.800 Minuten, also 80 Stunden. Ein Pilot müsste jede dieser Annahmen messen.
→ Referenzfolie B4.

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
Abholung der Mail bis zur Zeile im Sheet. Im Test am 20.10.2026 kam die Antwort
im Formular nach 4 bis 6 Sekunden. Wie lange das Postfach braucht, bis
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
