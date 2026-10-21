# Builds praesentation_v6.html from the final v5 deck: 12 main slides with the
# live demo at the centre, the old video and three more slides as reserve R1-R4
# behind the end, notes from SPRECHTEXT_V6_DE.md. v5 itself is not touched.
# Usage: make_deck_v6.py praesentation_v5.html backup_folien_v5.html SPRECHTEXT_V6_DE.md speaker_v5.html out.html
import base64, json, os, re, sys

v5_path, backup_path, script, speaker_path, out = sys.argv[1:6]
here = os.path.dirname(v5_path)
h = open(v5_path).read()
backup = open(backup_path).read()


def sub(text, old, new, count=1):
    assert text.count(old) == count, (text.count(old), old[:80])
    return text.replace(old, new)


def slide(n):
    """The section after the comment '<!-- n · ... -->' in v5, comment included."""
    m = re.search(rf"<!-- {n} · [^\n]*-->\n<section .*?</section>\n", h, flags=re.S)
    assert m, n
    return m.group(0)


def chapter(html, name):
    return re.sub(r'(<section class="slide") data-chapter="[^"]*"', rf'\1 data-chapter="{name}"', html, count=1)


def png(path):
    return "data:image/png;base64," + base64.b64encode(open(path, "rb").read()).decode()


# --- 4: background and bridge on one slide ---------------------------------
s5 = slide(5)
pattern = s5[s5.index('<div class="card" style="margin-top:44px'):s5.index('<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:30px">')]
pattern = sub(pattern, 'style="margin-top:44px;padding:36px 44px 32px"', 'style="margin-top:30px;padding:30px 44px 26px"')
NEW4 = f'''<!-- 4 · Woher ich das kenne -->
<section class="slide" data-chapter="Hintergrund">
  <div class="tag">Woher ich das kenne</div>
  <h1>Anderer Prozess. <span class="mark">Gleiches Grundproblem.</span></h1>
  <div style="display:grid;grid-template-columns:auto 1fr 1fr;gap:26px;margin-top:38px;align-items:center">
    <p style="font-size:28px;color:var(--muted);max-width:19ch;line-height:1.3">Operations in einem FinTech, Girokonten für Privatkunden.</p>
    <div class="card" style="padding:22px 28px;display:flex;gap:20px;align-items:center"><div class="ico sm violet"><svg class="i"><use href="#i-scale"/></svg></div><div style="font:700 30px var(--display)">Pfändungen</div></div>
    <div class="card" style="padding:22px 28px;display:flex;gap:20px;align-items:center"><div class="ico sm violet"><svg class="i"><use href="#i-building"/></svg></div><div style="font:700 30px/1.15 var(--display)">Behördliche Auskunftsersuchen</div></div>
  </div>
  {pattern.strip()}
  <div class="note" style="margin-top:24px;font-size:25px"><div class="ico"><svg class="i"><use href="#i-clock"/></svg></div><div><b>Viele Schritte, immer wieder von Hand.</b> Die E-Rechnung hat dasselbe Muster: strukturiert, mit synthetischen Daten vorführbar, seit 2025 beim Empfang Pflicht.</div></div>
  <p class="caption" style="margin-top:14px">Übertragener Ansatz, vereinfacht · kein Abbild der Systeme oder Abläufe meines früheren Arbeitgebers · Quelle Pflicht: BMF, FAQ E-Rechnung</p>
</section>
'''

# --- 5: Jonas and before/after on one slide --------------------------------
s7 = slide(7)
after_svg = s7[s7.index("<!-- after -->"):]
after_svg = after_svg[after_svg.index("<svg"):after_svg.index("</svg>") + 6]
after_svg = sub(after_svg, 'style="width:100%;height:410px;margin-top:10px"', 'style="width:100%;height:390px;margin-top:4px"')
q = '<span class="chip plain" style="background:var(--violet-soft);color:var(--violet);font-size:23px">{}</span>'
NEW5 = f'''<!-- 5 · Jonas: vorher und nachher -->
<section class="slide" data-chapter="Lösung">
  <div class="tag">Für wen</div>
  <h1>Jonas will wissen: <span class="mark">Muss ich da ran?</span></h1>
  <div style="display:grid;grid-template-columns:440px 1fr;gap:36px;margin-top:34px">
    <div class="card" style="padding:28px 32px;text-align:center">
      <div class="avatar violet" style="width:120px;height:120px"><svg class="i" style="width:60px;height:60px"><use href="#i-user"/></svg></div>
      <div style="font:700 38px var(--display);margin-top:14px">Jonas Weber</div>
      <div class="muted" style="font-size:24px">Finance-Team, Nordwerk GmbH</div>
      <div style="margin-top:14px"><span class="badge fict">Fiktive Person</span></div>
      <div style="border-top:2px solid var(--line);margin-top:18px;padding-top:14px">
        <div class="stat" style="color:var(--violet);font-size:76px">≈ 100</div>
        <div style="font-size:23px;margin-top:4px">Eingangsrechnungen pro Arbeitstag</div>
        <div style="margin-top:10px"><span class="badge model">Modellannahme: 2.000 im Monat</span></div>
      </div>
    </div>
    <div style="display:grid;gap:16px;align-content:start">
      <div class="row" style="gap:12px;flex-wrap:wrap">{q.format("„Muss ich mir die ansehen?“")}{q.format("„Wenn ja: warum genau?“")}{q.format("„Was ist der nächste Schritt?“")}</div>
      <div class="card" style="padding:22px 32px">
        <div style="display:flex;align-items:center;gap:14px"><span class="chip ok" style="padding:6px 18px;font-size:22px">Nachher</span><span style="font-size:22px;color:var(--muted)">System prüft, Jonas nur bei Ausnahmen · <b style="color:var(--ink)">über 500 € gibt immer ein Mensch frei</b></span></div>
        {after_svg}
      </div>
    </div>
  </div>
  <p class="caption" style="margin-top:14px">Schematisch: 2 von 10 nach der Modellannahme „jede fünfte braucht Klärung“ · bis 500 € gibt das System frei, darüber ein Mensch, auch wenn alles stimmt</p>
</section>
'''

# --- 6: the five paths as one picture -----------------------------------------
# Finance-Ops is the only filled node; four results fan out of it. The technical
# failure leaves the line before Finance-Ops and passes underneath: not checked.
def outcome(top, tone, icon, title, cond, tag, extra=""):
    return f'''    <div class="out {tone}{extra}" style="top:{top}px"><span class="dot"><svg class="i"><use href="#{icon}"/></svg></span><div><div class="t">{title}<span class="live">{tag}</span></div><div class="c">{cond}</div></div></div>'''


OTHER = 'andere Abweichung · <span class="ai">KI entwirft</span> → Mensch gibt frei'
NEW6 = f'''<!-- 6 · Fünf Wege -->
<section class="slide" data-chapter="Lösung">
  <div class="tag">So läuft eine Rechnung</div>
  <h1>Fünf Wege. <span class="mark">Eine Stelle entscheidet.</span></h1>
  <div class="paths">
    <svg class="wires" viewBox="0 0 1700 640" aria-hidden="true">
      <defs>
        <marker id="p6-gray" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#98A1B3"/></marker>
      </defs>
      <path d="M220 186C245 186 245 221 266 221M220 296C245 296 245 261 266 261M520 241H584" stroke="#98A1B3" stroke-width="4" fill="none" marker-end="url(#p6-gray)"/>
      <path d="M110 146V70Q110 40 140 40H730Q760 40 760 70V86" stroke="#98A1B3" stroke-width="3" stroke-dasharray="9 9" fill="none" marker-end="url(#p6-gray)"/>
      <path d="M395 326V396" stroke="#98A1B3" stroke-width="3" stroke-dasharray="4 8" stroke-linecap="round" fill="none"/>
      <path d="M545 241V560Q545 580 565 580H1054" stroke="#98A1B3" stroke-width="4" stroke-dasharray="12 10" fill="none" marker-end="url(#p6-gray)"/>
      <circle cx="545" cy="241" r="7" fill="#98A1B3"/>
      <g class="fan" fill="none" stroke-width="6" stroke-linecap="round">
        <path pathLength="1" d="M930 241C995 241 995 52 1060 52" stroke="var(--mint)"/>
        <path pathLength="1" d="M930 241C995 241 995 178 1060 178" stroke="var(--blue)"/>
        <path pathLength="1" d="M930 241C995 241 995 304 1060 304" stroke="var(--coral)"/>
        <path pathLength="1" d="M930 241C995 241 995 430 1060 430" stroke="var(--coral)"/>
      </g>
    </svg>
    <div class="bypass">oder Upload im Browser</div>
    <div class="card src" style="top:146px"><div class="ico sm gray"><svg class="i"><use href="#i-mail"/></svg></div><div><b>E-Mail</b><span>im Betrieb</span></div></div>
    <div class="card src" style="top:256px"><div class="ico sm blue"><svg class="i"><use href="#i-doc"/></svg></div><div><b>Formular</b><span style="color:var(--blue)">Live-Demo</span></div></div>
    <div class="card n8n"><div class="lab muted">N8N</div><div class="big">transportiert</div><div class="small">Ein grüner Lauf ist <b>keine Freigabe.</b></div></div>
    <div class="card sheet"><div class="ico sm gray"><svg class="i"><use href="#i-table"/></svg></div><div><b>Sheet: nur Protokoll</b><span>Fällt es aus, hat Finance-Ops trotzdem entschieden.</span></div></div>
    <div class="hub"><div class="gear"><svg class="i"><use href="#i-gear"/></svg></div><div class="name">Finance-Ops</div><div class="does">prüft und entscheidet</div><div class="db">Daten und Prüfpfad: PostgreSQL</div></div>
{outcome(0, "ok", "i-check", "Automatisch frei", "alles bestanden, bis 500&nbsp;€", "LIVE 380&nbsp;€")}
{outcome(126, "go", "i-user", "Ein Mensch gibt frei", "alles bestanden, über 500&nbsp;€", "LIVE 1.240&nbsp;€")}
{outcome(252, "stop", "i-phone", "Gestoppt: nur Rückruf", "IBAN weicht ab · keine Mail, keine KI", "LIVE 2.499&nbsp;€")}
{outcome(378, "stop", "i-chat", "Gestoppt: Rückfrage", OTHER, "LIVE KI")}
{outcome(528, "off", "i-x", "Nicht geprüft", "n8n oder Verbindung weg · nichts freigegeben", "Test 20.10.", " fail")}
  </div>
  <p class="caption" style="margin-top:14px">Schematisch und vereinfacht · gebaut bis auf einen Alarm bei Ausfall · LIVE: zeige ich gleich in der Demo</p>
</section>
'''
PATHS_CSS = """/* 6: five paths */
.chip.go { background: var(--blue-soft); color: var(--blue); } .chip.go .dot { background: var(--blue); }
.paths { position: relative; width: 1700px; height: 640px; margin-top: 28px; }
.paths .wires { position: absolute; inset: 0; width: 1700px; height: 640px; overflow: visible; }
.paths > div { position: absolute; }
.paths .card { border-radius: 24px; }
.paths .src { left: 0; width: 220px; height: 80px; display: flex; align-items: center; gap: 14px; padding: 0 14px; }
.paths .src b, .paths .sheet b { display: block; font-size: 25px; font-weight: 600; line-height: 1.2; }
.paths .src span, .paths .sheet span { display: block; font-size: 18px; color: var(--muted); line-height: 1.3; }
.paths .bypass { left: 250px; top: 22px; padding: 0 12px; background: var(--canvas); font: 500 19px var(--mono); color: var(--muted); }
.paths .n8n { left: 270px; top: 156px; width: 250px; height: 170px; padding: 20px 22px; text-align: center; }
.paths .n8n .big { font: 700 31px/1.1 var(--display); margin-top: 6px; }
.paths .n8n .small { font-size: 19px; line-height: 1.3; color: var(--muted); margin-top: 10px; }
.paths .n8n .small b { color: var(--ink); }
.paths .sheet { left: 120px; top: 400px; width: 400px; display: flex; align-items: center; gap: 14px; padding: 14px 18px; }
.paths .sheet b { font-size: 22px; }
.paths .hub { left: 590px; top: 90px; width: 340px; height: 302px; border-radius: 36px; background: var(--blue); color: #fff; text-align: center; padding: 0 22px; display: flex; flex-direction: column; justify-content: center; box-shadow: 0 6px 12px rgba(47,91,234,.2), 0 24px 56px rgba(47,91,234,.32); }
.paths .hub .gear { width: 72px; height: 72px; border-radius: 22px; background: rgba(255,255,255,.18); display: grid; place-items: center; margin: 0 auto; }
.paths .hub .gear svg { width: 40px; height: 40px; }
.paths .hub .name { font: 750 42px/1.1 var(--display); margin-top: 14px; white-space: nowrap; }
.paths .hub .does { font-size: 26px; font-weight: 600; margin-top: 2px; }
.paths .hub .db { font-size: 18px; line-height: 1.3; opacity: .85; border-top: 1.5px solid rgba(255,255,255,.3); margin-top: 14px; padding-top: 10px; }
.paths .out { left: 1060px; width: 640px; height: 104px; display: grid; grid-template-columns: 56px 1fr; gap: 18px; align-items: center; padding: 0 24px 0 20px; background: var(--paper); border: 1px solid var(--line); border-radius: 24px; box-shadow: var(--shadow); }
.paths .out .dot { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; color: #fff; }
.paths .out .dot svg { width: 28px; height: 28px; stroke-width: 2.6; }
.paths .out.ok .dot { background: var(--mint); } .paths .out.go .dot { background: var(--blue); }
.paths .out.stop .dot { background: var(--coral); } .paths .out.off .dot { background: #98A1B3; }
.paths .out .t { display: flex; justify-content: space-between; align-items: center; gap: 12px; font: 700 28px/1.2 var(--display); }
.paths .out.ok .t { color: var(--mint-ink); } .paths .out.go .t { color: var(--blue); } .paths .out.stop .t { color: var(--coral-ink); } .paths .out.off .t { color: var(--muted); }
.paths .out .c { font-size: 20px; line-height: 1.3; color: var(--muted); margin-top: 3px; }
.paths .out .live { flex: none; font: 500 16px var(--mono); letter-spacing: .02em; color: var(--blue); background: var(--blue-soft); border-radius: 8px; padding: 3px 10px; }
.paths .out.fail { background: transparent; border: 2.5px dashed #B6BFCF; box-shadow: none; }
.paths .out.fail .live { color: var(--muted); background: #E7EBF2; }
.paths .ai { font-weight: 600; color: var(--violet); background: var(--violet-soft); border-radius: 6px; padding: 0 7px; margin-right: 4px; }
body.present .slide.active .paths .fan path { stroke-dasharray: 1; animation: fan .55s cubic-bezier(.3,.7,.3,1) both; }
body.present .slide.active .paths .fan path:nth-child(2) { animation-delay: .08s; }
body.present .slide.active .paths .fan path:nth-child(3) { animation-delay: .16s; }
body.present .slide.active .paths .fan path:nth-child(4) { animation-delay: .24s; }
@keyframes fan { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@media (prefers-reduced-motion: reduce) { .paths .fan path { animation: none !important; } }
@media print { .paths .hub, .paths .out { box-shadow: none; } .paths .out:not(.fail) { border: 2px solid #DDE2EC; } }
"""


# --- 7: live demo anchor ----------------------------------------------------
def invoice(tone, supplier, number, amount, chip_class, chip_icon, expect, note):
    return f'''    <div class="card" style="padding:26px 30px;border-left:12px solid var(--{tone})">
      <div class="muted" style="font-size:22px">{supplier}</div>
      <div class="iban" style="font-size:30px;margin-top:2px">{number}</div>
      <div style="font:750 64px/1.1 var(--display);margin-top:10px">{amount}</div>
      <div style="margin-top:14px"><span class="chip {chip_class}" style="font-size:22px;padding:6px 16px 6px 8px"><span class="dot" style="width:30px;height:30px"><svg class="i" style="stroke-width:3;width:18px;height:18px"><use href="#{chip_icon}"/></svg></span>{expect}</span></div>
      <p class="muted" style="font-size:22px;margin-top:12px;line-height:1.35">{note}</p>
    </div>'''


def step(n, title, text):
    return f'''      <div class="row" style="align-items:flex-start;gap:14px"><span class="num">{n}</span><div><div style="font:700 24px var(--display)">{title}</div><div class="muted" style="font-size:19px;line-height:1.3">{text}</div></div></div>'''


NEW7 = f'''<!-- 7 · Live-Demo -->
<section class="slide" data-chapter="Demo">
  <div class="tag live">Live-Demo</div>
  <h1>Drei Rechnungen. <span class="mark">Drei Wege.</span></h1>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:28px;margin-top:36px">
{invoice("mint", "Berliner Bürobedarf GmbH", "INV-2026-00433", "380 €", "ok", "i-check", "Erwartet: automatisch frei", "Bekanntes Konto, Bestellung passt, bis 500 €.")}
{invoice("blue", "Berliner Bürobedarf GmbH", "INV-2026-00421", "1.240 €", "go", "i-user", "Erwartet: ein Mensch gibt frei", "Alles bestanden, aber über 500 €: Kostenstellenleitung.")}
{invoice("coral", "Havel Logistik GmbH", "HL-2026-7731", "2.499 €", "stop", "i-excl", "Erwartet: gestoppt", "Die Rechnung vom Anfang. Die IBAN passt nicht.")}
  </div>
  <div class="card" style="margin-top:26px;padding:22px 30px">
    <div class="lab muted">SO ZEIGE ICH ES</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:22px;margin-top:12px">
{step(1, "Einreichen", "über ein n8n-Formular; im Betrieb kommt die Rechnung per E-Mail")}
{step(2, "Wege in n8n", "Verzweigung nur nach der Antwort von Finance-Ops")}
{step(3, "Entscheiden in Finance-Ops", "Grund, Rückruf statt Rückfrage, Freigabe durch Tim")}
{step(4, "KI-Rückfrage", "bei einer anderen Ausnahme; ein Mensch gibt frei")}
    </div>
  </div>
  <p class="caption" style="margin-top:16px">Live auf einer Testinstanz mit synthetischen Daten · Reserve: Video vom 15.10.2026 und Screenshots hinter Folie 12</p>
</section>
'''

# --- reserve slides ---------------------------------------------------------
CLOSE = sub(slide(16), '<h1 class="xl">Gestoppt, <span class="mark">bevor Geld überwiesen wird.</span></h1>',
             '<h1 class="xl">Gestoppt, <span class="mark">vor der Zahlungsfreigabe.</span></h1>')
R1 = chapter(slide(9), "Backup")
R1 = sub(R1, '<div class="tag" style="margin-bottom:0">Demo</div>', '<div class="tag backup" style="margin-bottom:0">Reserve · Demo-Video</div>')
R1 = sub(R1, "Aufzeichnung vom 15.10.2026 · synthetische Daten", "Aufzeichnung vom 15.10.2026 · Eingang per E-Mail, ursprünglicher Workflow ohne Verzweigung · synthetische Daten")

shots = os.path.join(here, "reserve_ki_rueckfrage")
R2 = f'''<!-- R2 · KI-Rückfrage -->
<section class="slide" data-chapter="Backup">
  <div class="tag backup">Reserve · KI-Rückfrage</div>
  <h1>KI entwirft. <span class="mark">Ein Mensch gibt frei.</span></h1>
  <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:32px;margin-top:30px;align-items:start">
    <div class="card" style="padding:14px;overflow:hidden"><img src="{png(os.path.join(shots, "2_ki_entwurf.png"))}" alt="KI-Entwurf der Lieferantenrückfrage mit eingesetzten Werten" style="width:100%;display:block;border-radius:18px"></div>
    <div style="display:grid;gap:22px">
      <div class="card" style="padding:14px;overflow:hidden"><img src="{png(os.path.join(shots, "5_iban.png"))}" alt="Havel Logistik: keine Rückfrage, nur Rückruf" style="width:100%;display:block;border-radius:14px"></div>
      <ul class="list info" style="gap:14px">
        <li style="font-size:25px"><span class="ck"><svg class="i"><use href="#i-check"/></svg></span>Werte setzt die Anwendung nach der Prüfung ein</li>
        <li style="font-size:25px"><span class="ck"><svg class="i"><use href="#i-check"/></svg></span>Freigegeben ist nicht versendet</li>
        <li style="font-size:25px"><span class="ck"><svg class="i"><use href="#i-check"/></svg></span>Abweichende IBAN: keine Rückfrage, nur Rückruf</li>
      </ul>
    </div>
  </div>
  <p class="caption" style="margin-top:18px">Aufnahme vom 19.10.2026 mit dem echten Modell auf einer Testdatenbank · synthetische Daten</p>
</section>
'''
R3 = chapter(slide(10), "Backup")
R3 = sub(R3, '<div class="tag">Nach der Demo · Was Jonas bei einer Ausnahme sieht</div>', '<div class="tag backup">Reserve · Was Jonas bei einer Ausnahme sieht</div>')
R4 = chapter(slide(13), "Backup")
R4 = sub(R4, '<div class="tag">Wenn etwas ausfällt</div>', '<div class="tag backup">Reserve · Wenn etwas ausfällt</div>')
R4 = sub(R4, "Belegt: Duplikate ADR-009, Fortsetzen ADR-044 · Abbruch an einem Schritt: n8n-Ausführung 51289",
         "Belegt: Duplikate ADR-009, Fortsetzen ADR-044 · technischer Fehlerpfad getestet am 20.10.2026: n8n-Ausführung 200216")

main = "\n".join([slide(1), slide(2), slide(3), NEW4, NEW5, NEW6, NEW7,
                  slide(11), slide(12), slide(14), slide(15), CLOSE,
                  R1, R2, R3, R4])
start, end = h.index('<main class="deck">\n') + len('<main class="deck">\n'), h.index("</main>")
h = h[:start] + "\n" + main + "\n" + h[end:]

# --- style, chapters, footer, keys ------------------------------------------
h = sub(h, "</style>", PATHS_CSS + "</style>")
h = sub(h, 'const CHAPTERS = ["Anlass", "Hintergrund", "Lösung", "Demo", "Kontrolle", "Ausfall", "Nutzen", "Ausblick"];',
        'const CHAPTERS = ["Anlass", "Hintergrund", "Lösung", "Demo", "Kontrolle", "Nutzen", "Ausblick"];')
h = sub(h, '<span class="on" style="flex:none;color:var(--muted)">Backup</span></div><span class="pageno">B${++backupNo}</span>',
        '<span class="on" style="flex:none;color:var(--muted)">Reserve</span></div><span class="pageno">R${++backupNo}</span>')
h = sub(h, '''  addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) return openSpeaker();''',
        '''  // A number and Enter jump to that slide; V jumps to the reserve video.
  let typed = "";
  const reserveVideo = slides.findIndex((s) => s.querySelector("video"));
  addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) return openSpeaker();
    if (/^[0-9]$/.test(e.key)) { typed = (typed + e.key).slice(-2); return; }
    if (e.key === "Enter" && typed) { show(+typed - 1); typed = ""; return; }
    typed = "";
    if (e.key.toLowerCase() === "v" && !e.metaKey && !e.ctrlKey) return show(reserveVideo);''')


# --- notes and speaker view -------------------------------------------------
def notes(path):
    """Sections '## N · Title (m:ss)' of the speaker script, without tables and plans."""
    result = []
    for block in re.split(r"^## ", open(path).read(), flags=re.M)[1:]:
        head, _, body = block.partition("\n")
        body = body.split("\n---")[0]
        m = re.match(r"(\d+) · (.+?) \((\d+):(\d\d)\)$", head.strip())
        if not m:
            continue
        paras = [" ".join(p.split()) for p in body.strip().split("\n\n")]
        paras = [p for p in paras if p and p != "---" and not p.startswith(("Ablaufplan", "|", "# "))]
        result.append({"slide": m[1], "title": m[2], "target": int(m[3]) * 60 + int(m[4]), "video": m[2] == "Demo-Video", "paras": paras})
    return result


speaker = open(speaker_path).read()
speaker = sub(speaker, '$("no").textContent = `${i + 1} / ${deck.SPEAKER_COUNT}`;',
              '$("no").textContent = i < deck.SPEAKER_COUNT ? `${i + 1} / ${deck.SPEAKER_COUNT}` : `R${i + 1 - deck.SPEAKER_COUNT}`;')
speaker = sub(speaker, '<span>→ ← Folie · Leertaste oder K: Video</span>', '<span>→ ← Folie · Zahl + Enter: Sprung · V: Reserve-Video · Leertaste oder K: Video</span>')
speaker = sub(speaker, '''  if (!["ArrowRight", "ArrowLeft", " ", "PageDown", "PageUp", "Home", "End", "k"].includes(key)) return;''',
              '''  if (!["ArrowRight", "ArrowLeft", " ", "PageDown", "PageUp", "Home", "End", "k", "v", "Enter"].includes(key) && !/^[0-9]$/.test(key)) return;''')

js = lambda v: json.dumps(v, ensure_ascii=False).replace("</", "<\\/")
h, n1 = re.subn(r"window\.SPEAKER_NOTES = .*?;\n", lambda _: f"window.SPEAKER_NOTES = {js(notes(script))};\n", h, count=1)
h, n2 = re.subn(r"const SPEAKER_HTML = .*?;\n", lambda _: f"const SPEAKER_HTML = {js(speaker)};\n", h, count=1)
assert n1 == 1 and n2 == 1
h = sub(h, "<title>Finance Operations Automation</title>", "<title>Finance Operations Automation · v6</title>")
open(out, "w").write(h)
print("slides:", h.count('<section class="slide"'), "| notes:", len(notes(script)))
