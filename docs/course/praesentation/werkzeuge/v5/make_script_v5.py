# Builds SPRECHTEXT_V5_DE.md from the v4 script: new texts for slides 7, 8, 10-16,
# two precision fixes, and a timing plan at the pace measured in rehearsal.
import re, sys

src, out = sys.argv[1:3]
WPM = 95          # measured in the rehearsal of 17.10.2026, pauses and slide changes included
VIDEO_SLIDE = 255  # 4:05 video plus starting it
s = open(src).read()


def sub(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)


def section(n, title, body):
    """Replaces the body (and title) of slide n; the time is filled in later."""
    global s
    m = re.search(rf"^## {n} · .*?\n(.*?)(?=^## |^---$|\Z)", s, flags=re.M | re.S)
    assert m, n
    s = s[:m.start()] + f"## {n} · {title} (@@)\n\n{body.strip()}\n\n" + s[m.end():]


sub("""Rechts sehen Sie, wie man sich das vorstellen kann. Das ist eine vereinfachte
Darstellung, kein Abbild der Systeme oder Abläufe meines früheren Arbeitgebers. Ein
Auskunftsersuchen kommt an. Jemand liest es und ordnet es ein, findet die
richtige Person, gleicht Angaben ab, sucht Kunden- und Kontodaten zusammen,
erstellt die Antwort, behält die Frist im Blick und hält am Ende fest, was
gemacht wurde. Jeder dieser Schritte: von Hand.""", """Rechts eine vereinfachte Darstellung, kein Abbild der Systeme oder Abläufe
meines früheren Arbeitgebers. Ein Auskunftsersuchen kommt an. Jemand ordnet es
ein, findet die richtige Person, sucht Kunden- und Kontodaten zusammen,
beantwortet es fristgerecht und hält fest, was gemacht wurde. Jeder Schritt:
von Hand.""")
sub("einem eigenen Demo-Konto an.", "dem Demo-Konto der Buchhaltung an.")
# 3: the bank's payee check answers the obvious question right where it comes up.
sub("""wir sollten nicht zahlen, bevor wir es wissen. Und von Hand fällt so etwas nur
auf, wenn jemand jedes Mal ganz genau hinschaut, auch bei der hundertsten
Rechnung des Tages.""", """wir sollten nicht zahlen, bevor wir es wissen.

Seit Oktober 2025 gibt es bei Überweisungen die sogenannte
Empfängerüberprüfung. Banken gleichen den Namen mit der IBAN ab, bevor das
Geld überwiesen wird. Meine Anwendung setzt einen Schritt früher an: Sie prüft
bereits bei der Rechnung, ob die Bankverbindung in den Stammdaten des
Unternehmens hinterlegt und freigegeben ist.

Ohne diese Prüfung fällt so etwas von Hand nur auf, wenn jemand jedes Mal ganz
genau hinschaut, auch bei der hundertsten Rechnung des Tages.""")

section(7, "Vorher / Nachher", """
Die Antwort auf seine erste Frage: nur bei Ausnahmen. Links der Ablauf heute: zehn Rechnungen,
und alle zehn landen bei Jonas. Er prüft jede einzelne von Hand.

Rechts mit Finance-Ops. Das System übernimmt den Eingang und prüft die Datei
und die Geschäftsregeln: Lieferant, IBAN, Bestellung, Beträge. In unserem
Modell kommen acht von zehn ohne Sachprüfung durch. Zwei werden gestoppt und
kommen zu Jonas, jeweils mit dem Grund.

Ohne Sachprüfung heißt nicht automatisch bezahlt: Bis 500 Euro gibt das System
frei, darüber unterschreibt ein Mensch.

Und es entscheiden feste Regeln, keine KI. Warum, dazu komme ich nach der Demo.
""")

section(8, "Zwei Rechnungen, zwei Ergebnisse", """
Ich zeige das an zwei Rechnungen. Die erste ist eine kleine
Bürobedarf-Rechnung über 380 Euro, alles in Ordnung. Die sollte automatisch
freigegeben werden. Die zweite ist die Rechnung vom Anfang, Havel Logistik,
mit der abweichenden IBAN. Die sollte gestoppt werden.

Der Weg: Die Mail geht an ein Postfach. n8n, ein Werkzeug, das Abläufe
zwischen Diensten verbindet, holt den Anhang ab und reicht ihn an Finance-Ops
weiter. Finance-Ops prüft, entscheidet und speichert alles in seiner
PostgreSQL-Datenbank, auch den Prüfpfad. n8n schreibt zusätzlich eine
Protokollzeile ins Google Sheet. Den Ablauf habe ich aufgezeichnet.
""")

section(10, "Was Jonas bei einer Ausnahme sieht", """
Zusammengefasst: kein Rätselraten. Oben steht in einem Satz, was blockiert.
Darunter der Beleg, die abweichenden Ziffern markiert. Der Rest ohne Befund.
Und direkt darunter der nächste Schritt.

Das ist die Oberfläche. Dahinter stehen 788 automatisierte Tests und 84
dokumentierte Architekturentscheidungen. Die Kontrollen sind also geprüft und
nachvollziehbar. Getestet ist das mit synthetischen Daten, nicht im
Echtbetrieb.
""")

section(11, "Menschliche Kontrolle", """
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
""")

section(12, "Warum hier nicht die KI entscheidet", """
Sie fragen sich vielleicht: Das ist ein KI-Kurs. Warum entscheidet hier keine
KI? Das war eine bewusste Entscheidung.

Über Geld entscheiden feste Regeln: gleiche Daten, gleiches Ergebnis, und jedes
Ergebnis hat einen Grund. Ein Sprachmodell liefert nicht garantiert jedes Mal
dasselbe. Eine plausible Begründung ist noch kein Beleg. Und den Text der
Rechnung schreibt der Absender, im schlimmsten Fall der Betrüger.

Wo hilft KI dann? Bei der Rückfrage an den Lieferanten. Ist eine Rechnung
gestoppt, entwirft die KI den Brief. Rechnungsnummer und Lieferant bekommt sie
nicht, sie schreibt Platzhalter, und die Anwendung prüft jeden Entwurf. Ein
Mensch gibt frei und verschickt von Hand. Bei einer abweichenden IBAN gibt es
keinen Entwurf, nur den Rückruf.

Das ist kein Konzept: Die Funktion ist gebaut und mit einem echten
Sprachmodell getestet, Claude Sonnet 5.5 von Anthropic. 16 von 24 Entwürfen
waren zulässig. Nach einer Korrektur am Prompt bestanden in einer gezielten
Nachprüfung 15 von 15. Eine neue Gesamtquote ist das nicht.

Entscheidend war der Vergleich mit einer festen Vorlage. In sechs Fällen habe
ich gewählt, ohne die Auflösung zu kennen. Sechsmal fiel die Wahl auf die
Vorlage. Die KI-Texte waren länger und erklärten Regeln, die der Lieferant
nicht braucht. Der Vergleich war klein, mit Hilfe von ChatGPT und mit
Entwürfen der ersten Prompt-Fassung. Für diese untersuchten Standardfälle
zeigte sich kein erkennbarer Zusatznutzen durch KI. Verallgemeinern lässt sich
das nicht. Gebaut, gemessen und dann die einfachere Lösung gewählt: Das ist
für mich KI-Management.

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
""")

section(13, "Gestoppt ist nicht ausgefallen", """
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
""")

section(14, "Geschäftlicher Nutzen und wie man ihn misst", """
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
""")

section(15, "Reflexion und Einführung", """
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
""")

section(16, "Abschluss", """
Die Rechnung vom Anfang: gestoppt, bevor Geld überwiesen wird. In der Demo ist die
Zahlung simuliert, die Kontrolle dahinter ist echt.
Automatisieren, was Routine ist. Kontrollieren, was kritisch ist.

Vielen Dank. Ich freue mich auf Ihre Fragen.
""")

# Timing: spoken words at the measured pace, rounded to 5 s; the video slide is fixed.
plan, clock, rows = {}, 0, []
for block in re.split(r"^## ", s, flags=re.M)[1:]:
    head, _, body = block.partition("\n")
    m = re.match(r"(\d+) · (.+?) \((@@|\d+:\d\d)\)$", head.strip())
    if not m:
        continue
    n = int(m[1])
    paras = [p for p in body.strip().split("\n\n") if p and not p.startswith(("[", "|", "Ablaufplan", "---"))]
    words = len(" ".join(paras).replace("**", "").split())
    secs = VIDEO_SLIDE if m[2] == "Demo-Video" or n == 9 else max(15, round(words / WPM * 60 / 5) * 5)
    plan[n] = secs
    clock += secs
    rows.append((n, m[2], secs, clock, words))
fmt = lambda t: f"{t // 60}:{t % 60:02d}"
for n, title, secs, _, _ in rows:
    s = re.sub(rf"^## {n} · (.+?) \((?:@@|\d+:\d\d)\)$", lambda m: f"## {n} · {m[1]} ({fmt(secs)})", s, count=1, flags=re.M)

titles = {1: "Titel", 2: "Eine Rechnung wie jede andere", 3: "Der zweite Blick", 4: "Woher ich das kenne",
          5: "Anderer Prozess, gleiches Grundproblem", 6: "Jonas, Finance-Team Nordwerk", 7: "Vorher / Nachher",
          8: "Zwei Rechnungen, zwei Ergebnisse", 9: "**Demo-Video** (4:05 plus Start)",
          10: "Was Jonas sieht, und was dahinter steht", 11: "Menschliche Kontrolle",
          12: "**Warum hier nicht die KI entscheidet**", 13: "**Gestoppt ist nicht ausgefallen**",
          14: "Nutzen und wie man ihn misst", 15: "Reflexion und Einführung", 16: "Abschluss"}
table = "| Folie | Inhalt | Dauer | Uhr |\n|---|---|---|---|\n" + "".join(
    f"| {n} | {titles[n]} | {fmt(secs)} | {fmt(c)} |\n" for n, _, secs, c, _ in rows)
s = re.sub(r"\| Folie \| Inhalt \| Dauer \| Uhr \|\n\|---\|---\|---\|---\|\n(?:\|.*\|\n)+", table, s, count=1)

sub("""Gehört zu `praesentation_v4.html` (16 Folien, kein Backup-Anhang mehr; die
früheren Backup-Folien liegen in `referenz/backup_folien_v3.html`). Ziel: etwa
19 Minuten, davon gut 4 Minuten Demo-Video, das ich live erkläre. Rahmen des
Dozenten: 15 bis 20 Minuten.""", f"""Gehört zu `praesentation_v5.html` (16 Folien). Die Fassung v4 bleibt
unverändert in `praesentation_v4.html` mit `SPRECHTEXT_DE.md`. Ziel: etwa
21 Minuten, davon gut 4 Minuten Demo-Video, das ich live erkläre. Obergrenze:
22 bis 23 Minuten. Die Dauern rechnen mit {WPM} Wörtern pro Minute,
dem Tempo aus der Probe vom 17.10.2026, Pausen und Folienwechsel inklusive.""")
sub("""Wenn die Zeit knapp wird: Folie 10 nur zeigen, nicht besprechen (das Video hat
es schon gezeigt), und auf Folie 15 nur je einen Punkt nennen. Die
Ausfall-Folien 12 und 13 nicht kürzen: Danach hat der Dozent gefragt.""",
    """Wenn die Zeit knapp wird: auf Folie 10 den zweiten Absatz weglassen, auf
Folie 15 die Erkenntnisse nur nennen. Die Ausfall-Folie 13 nicht streichen:
Danach hat der Dozent gefragt.""")
sub("""**Warum entscheidet keine KI?**
Weil die Entscheidung nachvollziehbar und wiederholbar sein muss. Feste Regeln
liefern bei gleichen Daten immer dasselbe Ergebnis und nennen den Grund. Die KI darf eine
Ausnahme erklären, sie ist standardmäßig aus. → Referenzfolie B2.""",
    """**Warum ist das ein KI-Projekt, wenn Regeln entscheiden?**
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

**Woher wissen Sie, dass sich das lohnt?**
Noch gar nicht. 327 und 80 Stunden sind eine Modellrechnung. Ein Pilot im
Parallelbetrieb würde Automatisierungsquote, Bearbeitungszeit und Fehlalarme
messen, mit derselben Methode wie die Ausgangslage. → Folie 14.

**Was passiert mit den Mitarbeitenden?**
Jonas prüft nicht mehr jede Rechnung, sondern die Ausnahmen. Im Pilot
entscheidet er zuerst wie bisher, und wir vergleichen. Eine Ansprechperson in
der Kreditorenbuchhaltung und kurze Schulungen am echten Fall gehören dazu
(`docs/course/ROLLOUT_UND_REFLEXION_DE.md`).""")
sub("""Über 740 automatisierte Tests, dazu 83 dokumentierte
Architekturentscheidungen.""", """788 automatisierte Tests, alle grün in der CI vom 19.10.2026, dazu 84
dokumentierte Architekturentscheidungen.""")
sub("""Die früheren Backup-Folien B1 bis B7 sind nicht mehr Teil des Vortrags. Bei
Bedarf `referenz/backup_folien_v3.html` öffnen; die Verweise unten nennen die
passende Folie.""", """Die Backup-Folien B1 bis B8 sind nicht Teil des Vortrags. Sie liegen in
`backup_folien_v5.html`: vor Beginn in einem zweiten Tab öffnen und auf B8
„Fünf Wege“ stellen, nach dem Video bei Bedarf kurz dorthin wechseln. Die
Verweise unten nennen die passende Folie.""")
sub("""darf. (`docs/course/DATENFLUSS_DE.md`)""", """darf. (`docs/course/DATENFLUSS_DE.md`)

**Warum Google Sheets und keine richtige Datenbank, etwa Supabase?**
Die Datenbank gibt es schon: Finance-Ops speichert alle Daten, Entscheidungen
und den Prüfpfad in PostgreSQL. Das Sheet ist nur ein zusätzliches Protokoll,
das n8n schreibt; es wirkt nicht auf Finance-Ops zurück. Eine Umstellung auf
Supabase ist dafür nicht nötig. In einem echten Betrieb würde ich das Sheet
weglassen oder durch eine Ansicht in Finance-Ops ersetzen. → Referenzfolie B8.""")
sub("""oder Upload kommt. → Referenzfolie B3.""", """oder Upload kommt. Eine grüne n8n-Ausführung heißt nur: transportiert, nicht
freigegeben. → Referenzfolien B3 und B8.""")
sub("""Aus Annahmen für die fiktive Firma: Minuten pro Rechnung, Anteil der
Ausnahmen. Nichts davon ist gemessen. → Referenzfolie B4.""", """Aus einer Modellrechnung für die fiktive Firma, nichts davon ist gemessen.
Angenommen sind 2.000 Rechnungen im Monat, davon 20 Prozent Ausnahmen, also
1.600 saubere und 400 Ausnahmen. Heute 6 Minuten je saubere Rechnung und 25 je
Ausnahme: 19.600 Minuten, rund 327 Stunden. Mit dem System 1 und 8 Minuten:
4.800 Minuten, also 80 Stunden. Ein Pilot müsste jede dieser Annahmen messen.
→ Referenzfolie B4.""")
open(out, "w").write(s)
for n, title, secs, c, w in rows:
    print(f"{n:2} {w:4} words {fmt(secs):>5} {fmt(c):>6}")
