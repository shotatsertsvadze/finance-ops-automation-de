# Builds backup_folien_v5.html from the v3 backup slides: B2 separates the
# evaluated supplier inquiry from the unevaluated explanation, B3 names
# PostgreSQL, B6 carries the current figures, B8 shows the five paths.
# Every anchor must occur exactly once.
import sys

SRC, OUT = sys.argv[1:3]
PRECISE_1 = "Im kleinen Präferenzvergleich wurden in 6 von 6 Fällen die festen Vorlagen bevorzugt."
PRECISE_2 = "Für diese untersuchten Standardfälle zeigte sich kein erkennbarer Zusatznutzen durch KI."

CHECK = '<span class="ck"><svg class="i"><use href="#i-check"/></svg></span>'

B2 = f'''<!-- B2 · KI -->
<section class="slide" data-chapter="Backup">
  <div class="tag backup">Backup · Künstliche Intelligenz</div>
  <h1>KI schlägt vor. <span class="mark">Sie entscheidet nicht.</span></h1>
  <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:36px;margin-top:40px">
    <div class="card" style="padding:32px 40px">
      <div class="row"><div class="ico violet"><svg class="i"><use href="#i-spark"/></svg></div><div><h3>Rückfrage an den Lieferanten</h3><span class="badge test" style="margin-top:10px">gebaut · mit echtem LLM getestet</span></div></div>
      <ul class="list info" style="margin-top:24px;gap:12px">
        <li style="font-size:24px">{CHECK}Claude Sonnet 5.5: 16 von 24 Entwürfen zulässig</li>
        <li style="font-size:24px">{CHECK}Gezielte Nachprüfung, 5 Fälle: 15 von 15 · keine Gesamtquote</li>
        <li style="font-size:24px">{CHECK}Abgelehnter Entwurf: Die feste Vorlage springt ein</li>
        <li style="font-size:24px">{CHECK}Nie bei IBAN-Abweichung · Mensch gibt frei, versendet von Hand</li>
      </ul>
      <div style="border-top:2px dashed var(--bar);margin-top:22px;padding-top:16px"><div style="font:700 23px/1.3 var(--display)">{PRECISE_1}</div><div class="muted" style="font-size:21px;line-height:1.3;margin-top:4px">{PRECISE_2}</div></div>
    </div>
    <div class="card" style="padding:32px 40px">
      <div class="row"><div class="ico gray"><svg class="i"><use href="#i-doc"/></svg></div><div><h3>Erklärung eines Stopps</h3><span class="badge demo" style="margin-top:10px">gebaut · nicht mit echtem Modell bewertet</span></div></div>
      <ul class="list info" style="margin-top:24px;gap:12px">
        <li style="font-size:24px">{CHECK}Erklärt, warum eine Rechnung gestoppt wurde</li>
        <li style="font-size:24px">{CHECK}Sieht nur die Angaben, die je Prüfung erlaubt sind</li>
      </ul>
      <div class="note" style="margin-top:28px;font-size:23px"><div class="ico"><svg class="i"><use href="#i-lock"/></svg></div><div>Beide Funktionen optional, standardmäßig aus. Im Demo-Video aus.</div></div>
    </div>
  </div>
  <div class="note" style="margin-top:28px;font-size:24px"><div class="ico"><svg class="i"><use href="#i-ban"/></svg></div><div><b>Die KI darf nicht:</b> Rechnungen freigeben · Bankverbindungen ändern · Zahlungen anweisen · über den Kontoabgleich entscheiden · Rückfragen versenden</div></div>
  <p class="caption" style="margin-top:14px">Bewertung und Rohdaten: docs/course/KI_BEWERTUNG_DE.md</p>
</section>'''

LANE = '<div class="card lane"><div class="cond">{cond}</div><div>{chip}</div><div class="what">{what}</div>{extra}</div>'


def chip(kind, icon, text):
    return f'<span class="chip {kind}" style="font-size:22px;padding:6px 16px 6px 8px"><span class="dot" style="width:30px;height:30px"><svg class="i" style="stroke-width:3;width:18px;height:18px"><use href="#{icon}"/></svg></span>{text}</span>'


SUBPATH = ('<div class="sub"><span class="lab muted">RÜCKFRAGE</span>'
           '<span class="pill ai">KI-Entwurf</span><span class="to">→</span>'
           '<span class="pill">Anwendung prüft</span><span class="to">→</span>'
           '<span class="pill tpl">bei Ablehnung: feste Vorlage</span><span class="to">→</span>'
           '<span class="pill">Mensch gibt frei, versendet von Hand</span></div>')

LANES = "\n      ".join([
    LANE.format(cond="Alles bestanden, bis 500&nbsp;€", chip=chip("ok", "i-check", "Automatisch frei"),
                what="Kein Mensch nötig.", extra=""),
    LANE.format(cond="Alles bestanden, über 500&nbsp;€", chip=chip("go", "i-user", "Zur Freigabe"),
                what="Kostenstellenleitung; über 5.000&nbsp;€ auch Finanzen, über 25.000&nbsp;€ auch CFO.", extra=""),
    LANE.format(cond="IBAN weicht ab", chip=chip("stop", "i-excl", "Sichtprüfung"),
                what="Nur Rückruf unter der hinterlegten Nummer, neues Konto durch drei Personen. <b>Keine Rückfrage, nie ein KI-Entwurf.</b>", extra=""),
    LANE.format(cond="Andere fachliche Abweichung", chip=chip("stop", "i-excl", "Sichtprüfung"),
                what="z. B. Betrag über der Bestellung. Ein Mensch klärt, bei Bedarf mit einer Rückfrage an den Lieferanten.", extra=SUBPATH),
])

B8 = f'''<!-- B8 · Fünf Wege -->
<section class="slide" data-chapter="Backup">
  <div class="tag backup">Backup · Schematisch</div>
  <h1>Fünf Wege. <span class="mark">Eine Stelle entscheidet.</span></h1>
  <div style="display:grid;grid-template-columns:470px 1fr;gap:40px;margin-top:28px">
    <div style="display:grid;align-content:start">
      <div class="card row" style="padding:18px 24px;gap:16px"><div class="ico sm gray"><svg class="i"><use href="#i-mail"/></svg></div><div style="font-size:25px;font-weight:600">E-Mail mit XRechnung</div></div>
      <div class="down">↓</div>
      <div class="card" style="padding:22px 26px"><div class="lab muted">N8N · TRANSPORT</div><p style="font-size:23px;line-height:1.35;margin-top:6px">Holt die Mail ab, lädt die Datei in Finance-Ops hoch, schreibt danach eine Zeile ins Google Sheet: ein zusätzliches Protokoll.</p><div class="note" style="margin-top:14px;font-size:21px;padding:12px 16px;gap:12px;border-radius:16px"><div>Grün in n8n heißt: transportiert. <b>Nicht: freigegeben.</b></div></div></div>
      <div class="down">↓ <span>oder Upload im Browser</span></div>
      <div class="card" style="padding:22px 26px;border:3px solid var(--blue)"><div class="lab" style="color:var(--blue)">FINANCE-OPS · ENTSCHEIDUNG</div><p style="font-size:23px;line-height:1.35;margin-top:6px">Feste Regeln prüfen und entscheiden. <b>Alle Daten und der Prüfpfad liegen in PostgreSQL.</b></p></div>
    </div>
    <div style="display:grid;align-content:start;gap:12px">
      <div class="lab muted">ERGEBNIS DER PRÜFUNG IN FINANCE-OPS</div>
      {LANES}
      <div class="lab muted" style="margin-top:12px">TECHNISCHER AUSFALL</div>
      {LANE.format(cond="n8n oder Verbindung weg", chip=chip("off", "i-plug", "Nicht geprüft"),
                   what='Erneut senden oder im Browser hochladen; doppelt senden ist sicher. <span class="badge model" style="font-size:17px;padding:2px 10px">Alarm bei Ausfall: nicht gebaut</span>', extra="")}
    </div>
  </div>
  <p class="caption" style="margin-top:16px">Schematisch und vereinfacht · gebaut bis auf den markierten Alarm · Details: docs/course/DATENFLUSS_DE.md</p>
</section>'''

CSS = '''/* B8: five paths */
.chip.go { background: var(--blue-soft); color: var(--blue); } .chip.go .dot { background: var(--blue); }
.chip.off { background: #EDF0F6; color: var(--muted); } .chip.off .dot { background: #98A1B3; }
.down { font: 500 28px var(--mono); color: var(--muted); padding: 6px 0 6px 34px; }
.down span { font-size: 20px; margin-left: 10px; }
.lane { display: grid; grid-template-columns: 330px 235px 1fr; gap: 20px; align-items: center; padding: 13px 24px; border-radius: 22px; }
.lane .cond { font: 700 24px/1.25 var(--body); }
.lane .what { font-size: 20px; line-height: 1.35; color: var(--muted); }
.lane .what b { color: var(--ink); }
.sub { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 4px; }
.sub .lab { margin-right: 6px; }
.pill { font: 600 18px var(--body); padding: 5px 13px; border-radius: 100px; background: #EDF0F6; white-space: nowrap; }
.pill.ai { background: var(--violet-soft); color: var(--violet); }
.pill.tpl { background: var(--marker-soft); }
.sub .to { color: var(--muted); font: 500 20px var(--mono); }
@page'''

s = open(SRC).read()
start = s.index("<!-- B2 · KI -->")
end = s.index("<!-- B3 · Werkzeuge -->")
s = s[:start] + B2 + "\n\n" + s[end:]

pairs = [
    ("<title>Backup-Folien v3 · Finance Operations Automation</title>", "<title>Backup-Folien v5 · Finance Operations Automation</title>"),
    ("@page", CSS),
    ("<p>Prüft alle Regeln, entscheidet, führt den Prüfpfad.</p>", "<p>Prüft alle Regeln, entscheidet, führt den Prüfpfad in PostgreSQL.</p>"),
    ("<p>Eine Zeile pro Rechnung. Nur Anzeige.</p>", "<p>Zusätzliches Protokoll, eine Zeile pro Rechnung. Nur Anzeige.</p>"),
    ('<div class="stat" style="color:var(--blue)">740+</div>', '<div class="stat" style="color:var(--blue)">788</div>'),
    ('<div class="stat" style="color:var(--blue)">83</div>', '<div class="stat" style="color:var(--blue)">84</div>'),
    ("Node.js (Express), PostgreSQL, React · Stand 11.10.2026", "Node.js (Express), PostgreSQL, React · Tests: CI vom 19.10.2026"),
    ("\n</main>", "\n" + B8 + "\n\n</main>"),
]
for a, b in pairs:
    assert s.count(a) == 1, a[:60]
    s = s.replace(a, b)
open(OUT, "w").write(s)
print("written", OUT)
