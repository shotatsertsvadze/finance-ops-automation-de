# Builds SPRECHTEXT_V8_DE.md from SPRECHTEXT_V7_DE.md: the live demo runs on
# the n8n workflow v3, which writes its processing log to Supabase instead of
# Google Sheets. Finance-Ops and its PostgreSQL database stay the only source
# of decisions. Slide times are recomputed as in v7; the live block stays fixed.
# Usage: make_script_v8.py SPRECHTEXT_V7_DE.md out.md
import re, sys

src, out = sys.argv[1:3]
v7 = open(src).read()
WPM = 95
LIVE_SLIDE = 475


def sub(text, old, new):
    assert text.count(old) == 1, (text.count(old), old[:70])
    return text.replace(old, new)


fmt = lambda t: f"{t // 60}:{t % 60:02d}"


def words(body):
    paras = [p for p in body.strip().split("\n\n") if p and not p.startswith(("[", "|"))]
    return len(" ".join(paras).replace("**", "").split())


start = v7.index("## 1 · ")
reserve_at = v7.index("---\n\n# Reservepräsentation")
qa_at = v7.index("---\n\n## Kurze Antworten")
slides = re.findall(r"^## (\d+) · (.+?) \((\d+):(\d\d)\)\n\n(.*?)(?=^## |\Z)", v7[start:reserve_at], flags=re.M | re.S)
assert [s[0] for s in slides] == [str(i) for i in range(1, 13)]
body = {int(n): b.strip() for n, _, _, _, b in slides}
title = {int(n): t for n, t, _, _, _ in slides}
reserve, qa = v7[reserve_at:qa_at], v7[qa_at:]

# --- main slides ---------------------------------------------------------------
body[6] = sub(body[6], """nichts freigegeben. Fällt nur das Sheet aus, hat Finance-Ops trotzdem
entschieden; es fehlt nur die Protokollzeile.""", """nichts freigegeben. Danach protokolliert n8n zusätzlich in Supabase. Fällt
nur das aus, hat Finance-Ops trotzdem entschieden.""")
body[7] = sub(body[7], "Tabs: Formular 1, 2, 3 · n8n-Ausführungen ·", "Tabs: Formular 1, 2, 3 · n8n-Ausführungen v3 ·")
body[7] = sub(body[7], """Havel-Ausführung öffnen: Der Switch ging nach „Gestoppt:
Sichtprüfung“. n8n folgt nur der Antwort von Finance-Ops. Grün heißt:
transportiert.""", """Havel-Ausführung öffnen: Der Switch ging nach „Gestoppt:
Sichtprüfung“, danach die Zeile ins Protokoll in Supabase. n8n folgt nur der
Antwort von Finance-Ops. Grün heißt: transportiert.""")
body[7] = sub(body[7], """**5 · Fehlerpfad** Ausführung 200216: rot, „Technischer Fehler – nicht
geprüft“. Nichts geprüft, nichts freigegeben. Getestet, nicht live provoziert.""", """**5 · Fehlerpfad** Ausführung 207510: rot, „Technischer Fehler – nicht
geprüft“. Nichts geprüft, nichts freigegeben, keine Zeile im Protokoll.
Getestet, nicht live provoziert.""")
body[11] = sub(body[11], """Auftragsverarbeitung, eine Prüfung des KI-Anbieters und kein Google Sheet mit
Rechnungsdaten.""", """Auftragsverarbeitung, eine Prüfung des KI-Anbieters und eine Verbindung zu
Supabase mit Zertifikatsprüfung.""")

rows, clock = [], 0
for n in range(1, 13):
    secs = LIVE_SLIDE if n == 7 else max(15, round(words(body[n]) / WPM * 60 / 5) * 5)
    clock += secs
    rows.append((n, title[n], secs, clock, words(body[n])))

table = "| Folie | Inhalt | Dauer | Uhr |\n|---|---|---|---|\n" + "".join(
    f"| {n} | {'**Live-Demo** (8 Schritte)' if n == 7 else t} | {fmt(s)} | {fmt(c)} |\n" for n, t, s, c, _ in rows)

head = v7[:start]
head = sub(head, "# Sprechtext – Abschlusspräsentation v7", "# Sprechtext – Abschlusspräsentation v8")
head = sub(head, """Gehört zu `praesentation_v7.html`: genau 12 Folien, die Live-Demo auf Folie 7.
Die Reserve ist eine eigene Präsentation, `reserve_v7.html`: R1 bis R4 für die
Demo, B1 bis B8 als Referenz für Fragen. Die Fassung v6 bleibt unverändert
(`praesentation_v6.html`, `SPRECHTEXT_V6_DE.md`, Git-Tag `deck-v6-final`).""", """Gehört zu `praesentation_v8.html`: genau 12 Folien, die Live-Demo auf Folie 7.
Die Reserve ist eine eigene Präsentation, `reserve_v8.html`: R1 bis R4 für die
Demo, B1 bis B9 als Referenz für Fragen. Live läuft der n8n-Workflow v3: Er
schreibt sein Verarbeitungsprotokoll in Supabase statt in Google Sheets.
Finance-Ops und seine PostgreSQL-Datenbank bleiben die einzige Quelle für
Rechnungen, Entscheidungen und Prüfpfad.

Rückfall: v7 mit dem Workflow v2 und Google Sheets bleibt unverändert
(`praesentation_v7.html`, `reserve_v7.html`, `SPRECHTEXT_V7_DE.md`).""")
head = re.sub(r"Ziel: etwa \d+:\d\d Minuten", f"Ziel: etwa {fmt(clock)} Minuten", head)
head = re.sub(r"\| Folie \| Inhalt .*?\n\n", lambda _: table + "\n", head, flags=re.S)
head = re.sub(r"Puffer bis 22:00: \d+:\d\d\.", f"Puffer bis 22:00: {fmt(22 * 60 - clock)}.", head)

# --- reserve -------------------------------------------------------------------
reserve = sub(reserve, "# Reservepräsentation reserve_v7.html", "# Reservepräsentation reserve_v8.html")
reserve = sub(reserve, "B1 bis B8 sind Referenzfolien für Fragen", "B1 bis B9 sind Referenzfolien für Fragen")
reserve = sub(reserve, "mit dem ursprünglichen Workflow ohne Verzweigung. Danach",
              "mit dem ursprünglichen Workflow ohne Verzweigung; das Protokoll ist dort noch ein Google Sheet. Danach")
reserve = sub(reserve, """**(1:23) Protokoll.** Rechts die Gruppe Google Sheets. „Ergebnis vorbereiten“
übersetzt die Antwort in Wörter, etwa „Zur Prüfung“ statt eines Codes. „Demo
Log aktualisieren“ schreibt daraus eine Zeile ins Google Sheet. Ganz rechts""", """**(1:23) Protokoll.** Rechts das Protokoll, in diesem Workflow noch Google
Sheets, heute Supabase. „Ergebnis vorbereiten“ übersetzt die Antwort in Wörter,
etwa „Zur Prüfung“ statt eines Codes. „Demo Log aktualisieren“ schreibt daraus
eine Zeile. Ganz rechts""")
reserve = sub(reserve, """senden. Fällt Google Sheets aus, steht die Entscheidung trotzdem. Es fehlt nur
die Zeile im Protokoll.""", """senden. Fällt das Protokoll in Supabase aus, steht die Entscheidung trotzdem,
und die Bestätigung erscheint. Es fehlt nur die Zeile im Protokoll.""")
reserve = sub(reserve, """Einen Ausfall sieht heute
nur, wer nachschaut.""", """Einen Ausfall sieht heute
nur, wer nachschaut; ein gescheitertes Protokoll bleibt in n8n sogar grün.""")

# --- short answers -------------------------------------------------------------
qa = sub(qa, "In der Reservepräsentation `reserve_v7.html` liegen", "In der Reservepräsentation `reserve_v8.html` liegen")
qa = sub(qa, "folgen die Referenzfolien B1 bis B8; B8 entspricht Folie 6 in ausführlicher Form.",
         "folgen die Referenzfolien B1 bis B9; B8 entspricht Folie 6 in ausführlicher Form,\nB9 zeigt den Test von v3 mit Supabase.")
qa = sub(qa, """**Stehen Bankdaten im Google Sheet?**
Nein. Das Sheet hat neun Spalten ohne IBAN. n8n sieht die IBAN aber, weil es
die Rechnung transportiert. Für ein Echtsystem: kein Sheet mit
Rechnungsdaten, n8n im eigenen Netz, ein technisches Konto, das nur hochladen
darf. (`docs/course/DATENFLUSS_DE.md`)""", """**Stehen Bankdaten im Protokoll in Supabase?**
Nein. Das Protokoll hat keine IBAN-Spalte, und die Prüfgründe nennen keine
Kontonummer. n8n sieht die IBAN aber, weil es die Rechnung transportiert. Für
ein Echtsystem: n8n im eigenen Netz, ein technisches Konto, das nur hochladen
darf, und für das Protokoll ein Vertrag zur Auftragsverarbeitung.
(`docs/course/DATENFLUSS_DE.md`)""")
qa = sub(qa, "IBAN-Prüfung. Getestet am 20.10.2026 mit drei Rechnungen und einem Ausfall.", """IBAN-Prüfung. Getestet am 20.10.2026 mit v2 und am 21.10.2026 mit v3: drei
Rechnungen, ein Duplikat, ein Protokollausfall und ein Ausfall von Finance-Ops.""")
qa = sub(qa, """**Warum Google Sheets und keine richtige Datenbank, etwa Supabase?**
Die Datenbank gibt es schon: Finance-Ops speichert alle Daten, Entscheidungen
und den Prüfpfad in PostgreSQL. Das Sheet ist nur ein zusätzliches Protokoll,
das n8n schreibt; es wirkt nicht auf Finance-Ops zurück. Eine Umstellung auf
Supabase ist dafür nicht nötig. In einem echten Betrieb würde ich das Sheet
weglassen oder durch eine Ansicht in Finance-Ops ersetzen. → Folie 6.""", """**Warum Supabase, wenn Finance-Ops schon eine Datenbank hat?**
Finance-Ops bleibt die zentrale Quelle: Rechnungen, Entscheidungen und der
Prüfpfad liegen in der PostgreSQL-Datenbank der Anwendung. Supabase ist nur das
Verarbeitungsprotokoll von n8n, eine Zeile pro Lauf. n8n schreibt über eine
eigene Rolle, die nur einfügen darf, nicht lesen, ändern oder löschen. Es
ersetzt das Google Sheet der früheren Fassung und wirkt nicht auf Finance-Ops
zurück. Ein Duplikat steht dort ohne Entscheidung, und fällt Supabase aus,
steht die Entscheidung trotzdem. → Folie 6, Referenzfolie B9.

**Ist die Verbindung zu Supabase sicher?**
Verschlüsselt ja, aber n8n prüft das Server-Zertifikat nicht. Supabase signiert
es mit einer eigenen Zertifizierungsstelle, und die Postgres-Zugangsdaten in n8n
haben kein Feld dafür. Für die Demo mit synthetischen Daten halte ich das für
vertretbar: Die Rolle darf nur in diese eine Tabelle einfügen. Für echten
Betrieb gehört das Zertifikat auf den n8n-Server, dann wird die Prüfung
eingeschaltet.""")
qa = sub(qa, """an, übergibt die Datei, verzweigt nach der Antwort von Finance-Ops und schreibt
das Ergebnis ins Sheet.""", """an, übergibt die Datei, verzweigt nach der Antwort von Finance-Ops und schreibt
das Ergebnis ins Protokoll in Supabase.""")
qa = sub(qa, """fehlen ein fester Server, echte Anbindungen an Buchhaltung und Bank und eine
dauerhaft laufende KoSIT-Prüfung, die eingebaut, in der Demo aber aus ist.""", """fehlen ein fester Server, echte Anbindungen an Buchhaltung und Bank, eine
dauerhaft laufende KoSIT-Prüfung, die eingebaut, in der Demo aber aus ist, und
eine Verbindung zu Supabase, die das Zertifikat prüft.""")
qa = sub(qa, """im Formular nach 4 bis 6 Sekunden.""", """im Formular nach 4 bis 6 Sekunden, mit v3 am 21.10.2026 nach 2 bis 3 Sekunden,
die Zeile in Supabase eingeschlossen.""")
qa = sub(qa, """Nein, heute nicht. Einen Ausfall sieht, wer in n8n die Ausführungen oder das
Sheet prüft.""", """Nein, heute nicht. Einen Ausfall sieht, wer in n8n die Ausführungen prüft. Ein
gescheitertes Protokoll in Supabase bleibt dort sogar grün; erkennbar ist es
nur am Weg „Supabase-Protokoll fehlgeschlagen“.""")
qa = sub(qa, """Duplikat abgelegt, nicht ein zweites Mal geprüft.""", """Duplikat abgelegt, nicht ein zweites Mal geprüft. Im Protokoll in Supabase
steht es ohne Entscheidung und verweist auf das Original; als Freigabe lässt es
sich nicht lesen.""")
assert "Sheet" not in qa.replace("Google Sheet der früheren Fassung", "").replace("zur Zeile im Sheet", ""), \
    [l for l in qa.splitlines() if "Sheet" in l]

main = "".join(f"## {n} · {t} ({fmt(s)})\n\n{body[n]}\n\n" for n, t, s, _, _ in rows)
open(out, "w").write(head + main + reserve + qa)
for n, t, s, c, w in rows:
    print(f"{n:2} {w:4} words {fmt(s):>5} {fmt(c):>6}  {t}")
