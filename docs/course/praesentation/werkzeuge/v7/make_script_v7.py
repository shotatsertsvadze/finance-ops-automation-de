# Builds SPRECHTEXT_V7_DE.md: the 12 slides of praesentation_v7.html, then the
# notes for the separate reserve deck reserve_v7.html, and the short answers
# from v5 with the changes the live demo brings. Times follow the rehearsal
# pace; the live block has a fixed time.
# Usage: make_script_v7.py SPRECHTEXT_V5_DE.md out.md
import re, sys

src, out = sys.argv[1:3]
v5 = open(src).read()
WPM = 95
LIVE_SLIDE = 475   # 0:15 introduction plus 7:40 live block, tab changes included
VIDEO = 255        # reserve video, as in v5


def section(n):
    """Body of slide n in the v5 script."""
    m = re.search(rf"^## {n} · .*?\n(.*?)(?=^## |\Z)", v5, flags=re.M | re.S)
    assert m, n
    return re.sub(r"\n+---\s*$", "", m.group(1).strip())


def answers():
    i = v5.index("## Kurze Antworten auf erwartbare Fragen")
    return v5[i:]


def sub(text, old, new):
    assert text.count(old) == 1, (text.count(old), old[:60])
    return text.replace(old, new)


SLIDES = [
    (1, "Titel", sub(section(1), "Finance Operations Automation. Ich beginne mit einer Rechnung.", "Finance Operations Automation, kurz Finance-Ops. Ich beginne mit einer\nRechnung.")),
    (2, "Eine Rechnung wie jede andere", section(2)),
    (3, "Der zweite Blick", section(3)),
    (4, "Woher ich das kenne", """
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
"""),
    (5, "Für wen: Jonas", """
Damit es konkret wird: Jonas Weber, eine erfundene Person im Finance-Team der
Nordwerk GmbH, einem ausgedachten Mittelständler mit rund 2.000
Eingangsrechnungen im Monat. Heute prüft Jonas jede Rechnung selbst. Nach
meiner Modellrechnung sind das rund 327 Stunden Prüfaufwand im Monat; das ist
eine Annahme, keine gemessene Zahl. Er will aber nur drei Dinge wissen: Muss ich
mir die ansehen? Wenn ja, warum genau? Und was ist der nächste Schritt?

Mit Finance-Ops prüft das System jede Rechnung nach festen Regeln. In unserem
Modell kommen acht von zehn ohne Sachprüfung durch, zwei landen mit Grund bei
Jonas. Ohne Sachprüfung heißt aber nicht automatisch freigegeben: Nur bis 500
Euro gibt das System selbst frei. Darüber gibt ein Mensch frei, auch wenn
fachlich alles stimmt.
"""),
    (6, "Fünf Wege. Eine Stelle entscheidet.", """
So läuft eine Rechnung durch. Links der Eingang: Im Betrieb kommt sie per
E-Mail, gleich in der Demo über ein Formular. n8n nimmt die Datei an und reicht
sie an Finance-Ops weiter. Geprüft und entschieden wird nur dort, und alles
liegt in der PostgreSQL-Datenbank von Finance-Ops, auch der Prüfpfad.

Rechts die Wege. Drei davon zeige ich gleich live: automatisch frei, Freigabe
durch einen Menschen und gestoppt wegen der IBAN. Bei einer anderen Abweichung
kann die KI eine Rückfrage entwerfen, auch das zeige ich. Und unten der
technische Ausfall: Fallen n8n oder die Verbindung aus, wird nichts geprüft und
nichts freigegeben. Fällt nur das Sheet aus, hat Finance-Ops trotzdem
entschieden; es fehlt nur die Protokollzeile.
"""),
    (7, "Live-Demo", """
[Fensterwechsel zum Demo-Fenster. Tabs: Formular 1, 2, 3 · n8n-Ausführungen ·
Finance-Ops · Reserve. Klappt etwas nicht: Reserve in Tab 6, nicht reparieren.]

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

[Fensterwechsel zurück, Pfeiltaste zu Folie 8.]
"""),
    (8, "Menschliche Kontrolle", """
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
"""),
    (9, "Warum hier nicht die KI entscheidet", """
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
"""),
    (10, "Nutzen und wie man ihn misst", """
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
"""),
    (11, "Reflexion und Einführung", """
Was nehme ich mit? Die schwierigste Frage war nicht, was man automatisiert,
sondern wo ein Mensch entscheiden muss. Ein Prototyp ist noch kein eingeführter
Prozess. Und eine Demo braucht Betriebsdisziplin; deshalb gibt es für heute
einen Ausfallplan.

Bei Nordwerk würde ich so einführen: Regeln mit dem Finance-Team abstimmen,
dann ein Parallelbetrieb, in dem Jonas wie bisher entscheidet, vergleichen und
erst dann ausweiten oder nachschärfen. Das ist ein Vorschlag, umgesetzt ist
davon nichts.

Zum Datenschutz: In der Demo gibt es nur synthetische Daten. Die KI bekommt
keine Namen und keine Rechnungsnummer, nur freigegebene Prüfbelege mit
Platzhaltern. Für echte Rechnungen bräuchte es Verträge zur
Auftragsverarbeitung, eine Prüfung des KI-Anbieters und kein Google Sheet mit
Rechnungsdaten.
"""),
    (12, "Abschluss", """
Die Rechnung vom Anfang: gestoppt vor der Zahlungsfreigabe. Zahlungen sind im
Projekt nur simuliert, echtes Geld fließt nicht; die Kontrolle davor ist echt.
Automatisieren, was Routine ist. Kontrollieren, was kritisch ist.

Meine Empfehlung an die Geschäftsführung: ein kontrollierter Pilot im
Parallelbetrieb. Echte Rechnungen laufen mit, Jonas entscheidet weiter selbst,
und ausgeweitet wird erst, wenn die vorher vereinbarten Kriterien erfüllt sind.

Vielen Dank. Ich freue mich auf Ihre Fragen.
"""),
]

RESERVE = [
    ("R1", "Demo-Video", VIDEO, "[Reserve: nur wenn die Live-Demo nicht läuft. Aufnahme vom 15.10.2026, "
     "Eingang per E-Mail, mit dem ursprünglichen Workflow ohne Verzweigung. Danach Fensterwechsel zurück "
     "zur Hauptpräsentation, Pfeiltaste zu Folie 8.]\n\n" + section(9).split("\n\n", 1)[1].replace(
         "[Video endet bei 4:05. Pfeiltaste: weiter zu Folie 10.]", "[Video endet bei 4:05. Fensterwechsel zurück zur Hauptpräsentation, Pfeiltaste zu Folie 8.]")),
    ("R2", "KI-Rückfrage", 45, """
[Reserve, wenn das Modell oder Finance-Ops nicht antwortet. Aufnahme vom
19.10.2026 mit dem echten Modell auf einer Testdatenbank.]

Links der KI-Entwurf: Rechnungsnummer, Betrag und Bestellung hat die Anwendung
nach der Prüfung eingesetzt, das Modell kannte sie nicht. Ein Mensch prüft,
gibt frei und versendet von Hand. Rechts Havel Logistik: Bei abweichender IBAN
gibt es keine Rückfrage, nur den Rückruf.
"""),
    ("R3", "Was Jonas bei einer Ausnahme sieht", 35, section(10)),
    ("R4", "Gestoppt ist nicht ausgefallen", 75, section(13)),
]

fmt = lambda t: f"{t // 60}:{t % 60:02d}"


def words(body):
    paras = [p for p in body.strip().split("\n\n") if p and not p.startswith(("[", "|"))]
    return len(" ".join(paras).replace("**", "").split())


rows, clock = [], 0
for n, title, body in SLIDES:
    secs = LIVE_SLIDE if n == 7 else max(15, round(words(body) / WPM * 60 / 5) * 5)
    clock += secs
    rows.append((n, title, secs, clock, words(body)))

table = "| Folie | Inhalt | Dauer | Uhr |\n|---|---|---|---|\n" + "".join(
    f"| {n} | {'**Live-Demo** (8 Schritte)' if n == 7 else t} | {fmt(s)} | {fmt(c)} |\n" for n, t, s, c, _ in rows)

head = f"""# Sprechtext – Abschlusspräsentation v7

Gehört zu `praesentation_v7.html`: genau 12 Folien, die Live-Demo auf Folie 7.
Die Reserve ist eine eigene Präsentation, `reserve_v7.html`: R1 bis R4 für die
Demo, B1 bis B8 als Referenz für Fragen. Die Fassung v6 bleibt unverändert
(`praesentation_v6.html`, `SPRECHTEXT_V6_DE.md`, Git-Tag `deck-v6-final`).
Klickfolge, Start der Demo-Instanz und Reserveplan: `LIVE_DEMO_DE.md`.

Ziel: etwa {fmt(clock)} Minuten; vorgesehen sind 15 bis 20 Minuten mit 2 bis 3
Minuten Spielraum. Die Dauern
rechnen mit {WPM} Wörtern pro Minute, dem Tempo aus der Probe vom 17.10.2026.
Die Live-Demo hat eine feste Zeit von {fmt(LIVE_SLIDE)}, Tab-Wechsel inklusive.
Sätze in eckigen Klammern sind Regieanweisungen.

{table}
Puffer bis 22:00: {fmt(22 * 60 - clock)}. Er ist für Wartezeiten in der Live-Demo gedacht.

Wenn die Zeit knapp wird: in der Live-Demo die Schritte 7 und 8 nur ansagen,
auf Folie 10 die Pilotkennzahlen nur nennen, auf Folie 11 die Einführung nur
nennen. Klappt ein Live-Schritt nicht: nicht reparieren, sondern in die Reserve
wechseln (`LIVE_DEMO_DE.md`, Abschnitt Reserve).

Tasten in der Hauptpräsentation: Pfeiltasten wechseln die Folie, **Zahl und
Enter** springt zu einer Folie (etwa 8 Enter), **S** öffnet die
Referentenansicht. Die Reservepräsentation liegt vor Beginn als Tab 6 im
Demo-Fenster auf R1 bereit. Dort wechseln die Pfeiltasten die Folie, Leertaste
oder K starten und halten das Video, S öffnet ihre eigene Referentenansicht.
Für den Fensterwechsel zwischen Präsentation und Demo-Fenster gilt die Taste
aus der Generalprobe: Cmd + Tab wechselt nur zwischen Programmen, zwischen zwei
Chrome-Fenstern Cmd + <.

---

"""

body = "".join(f"## {n} · {t} ({fmt(s)})\n\n{b.strip()}\n\n" for (n, t, b), (_, _, s, _, _) in zip(SLIDES, rows))
reserve = "---\n\n# Reservepräsentation reserve_v7.html\n\nNur bei Bedarf. R1 bis R4 gehören zur Demo, B1 bis B8 sind Referenzfolien für Fragen und haben keinen Sprechtext.\n\n" + "".join(
    f"## {n} · {t} ({fmt(s)})\n\n{b.strip()}\n\n" for n, t, s, b in RESERVE)

qa = answers()
qa = sub(qa, """Die Backup-Folien B1 bis B8 sind nicht Teil des Vortrags. Sie liegen in
`backup_folien_v5.html`: vor Beginn in einem zweiten Tab öffnen und auf B8
„Fünf Wege“ stellen, nach dem Video bei Bedarf kurz dorthin wechseln. Die
Verweise unten nennen die passende Folie.""", """Im Deck liegen hinter Folie 12 die Reservefolien R1 bis R4 (Demo-Video,
KI-Rückfrage, Was Jonas sieht, Gestoppt ist nicht ausgefallen). Weitere
Referenzfolien B1 bis B7 stehen in `backup_folien_v5.html`; B8 ist jetzt
Folie 6. Die Verweise unten nennen die passende Folie.""".replace(
    "Im Deck liegen hinter Folie 12 die Reservefolien R1 bis R4", "In der Reservepräsentation `reserve_v7.html` liegen die Reservefolien R1 bis R4").replace(
    "Weitere\nReferenzfolien B1 bis B7 stehen in `backup_folien_v5.html`; B8 ist jetzt\nFolie 6.", "Dahinter\nfolgen die Referenzfolien B1 bis B8; B8 entspricht Folie 6 in ausführlicher Form."))
qa = sub(qa, """n8n holt die Mail ab, meldet sich an, übergibt die Datei und schreibt das
Ergebnis ins Sheet.""", """n8n nimmt die Datei an, per Mail oder in der Demo per Formular, meldet sich
an, übergibt die Datei, verzweigt nach der Antwort von Finance-Ops und schreibt
das Ergebnis ins Sheet.""")
qa = sub(qa, """Im Test am 11.10.2026 lief eine n8n-Ausführung 2 bis 4 Sekunden, von der
Abholung der Mail bis zur Zeile im Sheet.""", """Im Test am 11.10.2026 lief eine n8n-Ausführung 2 bis 4 Sekunden, von der
Abholung der Mail bis zur Zeile im Sheet. Im Test am 20.10.2026 kam die Antwort
im Formular nach 4 bis 6 Sekunden.""")
qa = sub(qa, """**Warum Google Sheets und keine richtige Datenbank, etwa Supabase?**""", """**Warum in der Demo ein Formular statt einer E-Mail?**
Weil es zuverlässig und sofort sichtbar ist. Danach läuft derselbe Weg wie bei
einer Mail: Datei an Finance-Ops, Entscheidung dort, Verzweigung in n8n nach
der Antwort. Der Mail-Eingang ist im Video zu sehen (R1 in der Reservepräsentation).

**Woher weiß n8n, welcher Zweig gilt?**
Aus der Antwort von Finance-Ops: Feld `routing.decision` (AUTO_APPROVE,
APPROVAL, REVIEW) und der Status. In n8n steht keine Betragsgrenze und keine
IBAN-Prüfung. Getestet am 20.10.2026 mit drei Rechnungen und einem Ausfall.

**Warum Google Sheets und keine richtige Datenbank, etwa Supabase?**""")

for old, new in [("PDF-Rechnungen auslesen, mit Bestätigung durch einen Menschen. → Folie 12.", "PDF-Rechnungen auslesen, mit Bestätigung durch einen Menschen. → Folie 9."),
                 ("mit derselben Methode wie die Ausgangslage. → Folie 14.", "mit derselben Methode wie die Ausgangslage. → Folie 10."),
                 ("weglassen oder durch eine Ansicht in Finance-Ops ersetzen. → Referenzfolie B8.", "weglassen oder durch eine Ansicht in Finance-Ops ersetzen. → Folie 6."),
                 ("freigegeben. → Referenzfolien B3 und B8.", "freigegeben. → Folie 6 und Referenzfolie B3.")]:
    qa = sub(qa, old, new)
open(out, "w").write(head + body + reserve + "---\n\n" + qa)
for n, t, s, c, w in rows:
    print(f"{n:2} {w:4} words {fmt(s):>5} {fmt(c):>6}  {t}")
