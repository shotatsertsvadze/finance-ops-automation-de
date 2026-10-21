# Builds praesentation_v5.html: the v4 build with the v5 speaker notes, then
# targeted slide changes. v4 itself is not touched.
import re, subprocess, sys

v3_ref, out, video, poster, script, speaker = sys.argv[1:7]
here = __file__.rsplit("/", 2)[0]
tmp = out + ".v4tmp"
subprocess.run(["python3", f"{here}/v4/make_deck.py", v3_ref, tmp, video, poster, script, speaker], check=True)
h = open(tmp).read()
subprocess.run(["rm", tmp], check=True)


def sub(old, new, count=1):
    global h
    assert h.count(old) == count, (h.count(old), old[:70])
    h = h.replace(old, new)


def replace_slide(comment, new):
    """Replaces the section that follows an HTML comment such as '<!-- 15 · Reflexion -->'."""
    global h
    m = re.search(re.escape(comment) + r"\n<section .*?</section>\n", h, flags=re.S)
    assert m, comment
    h = h[:m.start()] + new.strip() + "\n" + h[m.end():]


# 3: two checks at two moments, the invoice first and the bank at transfer.
sub('''Von Hand fällt sie nur auf, wenn jemand jedes Mal genau hinschaut.</div></div>
</section>''', '''Von Hand fällt sie nur auf, wenn jemand jedes Mal genau hinschaut.</div></div>
  <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:22px;align-items:center;margin-top:24px">
    <div class="card" style="padding:18px 28px;box-shadow:none;border:2px solid var(--blue-soft)"><div class="lab" style="color:var(--blue)">BEI DER RECHNUNG · MEINE ANWENDUNG</div><div style="font-size:26px;margin-top:4px">Ist das Konto in den Stammdaten freigegeben?</div></div>
    <div style="font:700 40px var(--display);color:var(--muted)">→</div>
    <div class="card" style="padding:18px 28px;box-shadow:none"><div class="lab muted">BEI DER ÜBERWEISUNG · BANK, SEIT OKT. 2025</div><div style="font-size:26px;margin-top:4px">Passt der Name zur IBAN?</div></div>
  </div>
</section>''')
sub('<div class="note" style="margin-top:48px"><div class="ico"><svg class="i"><use href="#i-alert"/></svg></div><div>Eine echt aussehende Rechnung',
    '<div class="note" style="margin-top:36px"><div class="ico"><svg class="i"><use href="#i-alert"/></svg></div><div>Eine echt aussehende Rechnung')

# 7: the title answers Jonas' question from slide 6; "ohne Sachprüfung" is not "automatically approved".
sub('<h1>Vorher prüft Jonas alles. Nachher <span class="mark">nur die Ausnahmen.</span></h1>',
    '<h1>Weniger Sachprüfung. <span class="mark">Klare Freigaben.</span></h1>')
sub('>8 laufen durch</text>', '>8 ohne Sachprüfung</text>')
sub('Schematisch: 2 von 10 entspricht der Modellannahme „jede fünfte braucht Klärung“ · über 500 € zusätzlich eine Freigabe-Unterschrift',
    'Schematisch: 2 von 10 nach der Modellannahme „jede fünfte braucht Klärung“ · bis 500 € automatisch frei, darüber unterschreibt ein Mensch')

# 10: what stands behind the screen, with its limit.
sub('''      <div class="row" style="align-items:flex-start"><span class="num" style="background:var(--violet)">4</span><div><h3>Nächster Schritt</h3><p class="muted" style="font-size:25px">direkt darunter</p></div></div>
      <p class="caption" style="margin-top:20px">Bildschirmfoto der Anwendung, Stand 11.10.2026 · synthetische Daten</p>''',
    '''      <div class="row" style="align-items:flex-start"><span class="num" style="background:var(--violet)">4</span><div><h3>Nächster Schritt</h3><p class="muted" style="font-size:25px">direkt darunter</p></div></div>
      <div class="card" style="padding:22px 28px">
        <div class="lab muted">DAHINTER</div>
        <div style="display:flex;gap:40px;margin-top:6px">
          <div><div style="font:750 46px var(--display)">788</div><div class="muted" style="font-size:22px">automatisierte Tests</div></div>
          <div><div style="font:750 46px var(--display)">84</div><div class="muted" style="font-size:22px">dokumentierte Architektur&shy;entscheidungen (ADRs)</div></div>
        </div>
        <div class="muted" style="font-size:20px;margin-top:10px">getestet mit synthetischen Daten, nicht im Echtbetrieb</div>
      </div>
      <p class="caption">Bildschirmfoto der Anwendung, Stand 11.10.2026 · synthetische Daten · Tests: CI vom 19.10.2026</p>''')
sub('<div style="display:grid;gap:30px">\n      <div class="row" style="align-items:flex-start"><span class="num">1</span>',
    '<div style="display:grid;gap:22px">\n      <div class="row" style="align-items:flex-start"><span class="num">1</span>')


def who(icon, tone, title, items, badge):
    lis = "".join(f'<li><span class="ck" style="background:var(--{tone})"><svg class="i"><use href="#i-check"/></svg></span>{t}</li>' for t in items)
    return f'''    <div class="card" style="padding:24px 28px;display:flex;flex-direction:column;gap:16px">
      <div class="row" style="gap:16px"><div class="ico sm {tone}"><svg class="i"><use href="#{icon}"/></svg></div><h3 style="font-size:32px">{title}</h3></div>
      <ul class="list" style="gap:12px">{lis}</ul>
      <div style="margin-top:auto">{badge}</div>
    </div>'''


ai = f'''<!-- 12 · Wer entscheidet was -->
<section class="slide" data-chapter="Kontrolle">
  <div class="tag">Technikwahl</div>
  <h1>Warum hier <span class="mark">nicht die KI entscheidet.</span></h1>
  <div style="display:grid;grid-template-columns:repeat(3, minmax(0, 1fr));gap:28px;margin-top:26px">
{who("i-gear", "blue", "Regeln entscheiden", ["IBAN, Beträge, Bestellung", "Freigabegrenzen", "gleiche Daten, gleiches Ergebnis, mit Grund"], '<span class="badge test">gebaut und getestet</span>')}
    <div class="card" style="padding:24px 28px;display:flex;flex-direction:column;gap:14px">
      <div class="row" style="gap:16px"><div class="ico sm violet"><svg class="i"><use href="#i-spark"/></svg></div><h3 style="font-size:32px">KI schlägt vor</h3></div>
      <div><div style="font-size:26px;line-height:1.3">Entwirft die Rückfrage an den Lieferanten</div><div class="muted" style="font-size:21px;line-height:1.3;margin-top:4px">Mensch prüft, gibt frei, verschickt von Hand · nie bei IBAN-Abweichung</div><div style="margin-top:8px"><span class="badge test" style="white-space:normal;line-height:1.35">gebaut · mit echtem LLM getestet</span></div><div class="muted" style="font-size:20px;line-height:1.3;margin-top:6px">Claude Sonnet 5.5: 16 von 24 zulässig · gezielte Nachprüfung (5 Fälle): 15 von 15, keine Gesamtquote</div></div>
      <div style="border-top:2px dashed var(--bar);padding-top:12px"><div style="font:700 22px var(--display);line-height:1.3">Im kleinen Präferenzvergleich wurden in 6 von 6 Fällen die festen Vorlagen bevorzugt.</div><div class="muted" style="font-size:20px;line-height:1.3;margin-top:4px">Für diese untersuchten Standardfälle zeigte sich kein erkennbarer Zusatznutzen durch KI.</div></div>
    </div>
{who("i-user", "mint", "Menschen verantworten", ["Ausnahmen", "neue Bankverbindungen", "Freigaben über 500 €"], '<span class="badge test">im System erzwungen</span>')}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:22px">
    <div class="note" style="font-size:24px;padding:18px 26px;align-items:flex-start"><div class="ico"><svg class="i"><use href="#i-alert"/></svg></div><div><b>Kein Sprachmodell über Zahlungen:</b> nicht garantiert gleich, eine Begründung ist kein Beleg, den Rechnungstext schreibt der Absender.</div></div>
    <div class="card" style="padding:18px 26px;box-shadow:none;display:flex;gap:20px;align-items:flex-start"><div class="ico sm gray"><svg class="i"><use href="#i-building"/></svg></div><div style="font-size:24px"><b>Mein PoC:</b> Fokus auf nachvollziehbare Regeln, Ausnahmen und menschliche Verantwortung.</div></div>
  </div>
  <p style="font-size:28px;margin-top:22px"><b>Nicht nur: Wo kann ich KI einsetzen?</b> <span class="muted">Sondern: Wo bringt sie messbaren Nutzen, und wo ist eine Regel sicherer?</span></p>
</section>
'''


def row(icon, tone, what, seen, step):
    return f'''      <div class="frow">
        <div class="row" style="gap:18px"><div class="ico sm {tone}"><svg class="i"><use href="#{icon}"/></svg></div><div class="ftitle">{what}</div></div>
        <div class="fcell">{seen}</div>
        <div class="fcell"><b>{step}</b></div>
      </div>'''


def strip(tone, label, text, dashed=False):
    border = "border:2.5px dashed #8E9AAE;background:transparent" if dashed else f"border:2px solid var(--{tone}-soft);background:var(--{tone}-soft)"
    return f'<div class="card" style="padding:16px 22px;box-shadow:none;{border}"><div class="lab" style="color:var(--{tone}{"-ink" if tone == "mint" else ""})">{label}</div><div style="font-size:23px;margin-top:4px">{text}</div></div>'


failure = f'''<!-- 13 · Ausfall: Stopp oder Störung -->
<section class="slide" data-chapter="Ausfall">
  <div class="tag">Wenn etwas ausfällt</div>
  <h1>Gestoppt ist <span class="mark">nicht ausgefallen.</span></h1>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:28px">
    <div class="card" style="padding:18px 28px;display:flex;gap:20px;align-items:center;box-shadow:none;border:2px solid var(--mint-soft)">
      <div class="ico sm mint"><svg class="i"><use href="#i-check"/></svg></div>
      <div><div style="font:700 28px var(--display)">Fachlicher Stopp</div><div style="font-size:22px;color:var(--muted)">IBAN weicht ab: Die Kontrolle arbeitet wie vorgesehen.</div></div>
    </div>
    <div class="card" style="padding:18px 28px;display:flex;gap:20px;align-items:center;box-shadow:none;border:2px solid var(--coral-soft)">
      <div class="ico sm coral"><svg class="i"><use href="#i-alert"/></svg></div>
      <div><div style="font:700 28px var(--display)">Technischer Ausfall</div><div style="font-size:22px;color:var(--muted)">Ein Baustein ist nicht erreichbar.</div></div>
    </div>
  </div>
  <div class="card" style="margin-top:20px;padding:14px 34px 6px">
    <div class="frow fhead"><div>AUSFALL</div><div>FOLGE</div><div>NÄCHSTER SCHRITT</div></div>
{row("i-plug", "gray", "n8n nicht erreichbar", "Die Mails bleiben im Postfach, nichts wird geprüft.", "Rechnung direkt in Finance-Ops hochladen.")}
{row("i-server", "coral", "Finance-Ops oder Verbindung weg", "n8n bricht ab, rot in den Ausführungen. Die Mail gilt als abgeholt.", "Verbindung herstellen, erneut senden.")}
{row("i-table", "blue", "Google Sheets weg", "Die Entscheidung steht. Nur die Protokollzeile fehlt.", "Zeile nachtragen.")}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px;margin-top:20px">
    {strip("mint", "EINGEBAUT", "Doppelt senden ist sicher. Ein Abbruch wird fortgesetzt.")}
    {strip("violet", "HEUTE VON HAND", "In n8n nachsehen, erneut senden.")}
    {strip("muted", "NOCH NICHT GEBAUT", "Automatische Benachrichtigung bei Ausfall.", dashed=True)}
  </div>
  <p class="caption" style="margin-top:14px">Belegt: Duplikate ADR-009, Fortsetzen ADR-044 · Abbruch an einem Schritt: n8n-Ausführung 51289</p>
</section>
'''

replace_slide("<!-- 12 · Ausfall: Stopp oder Störung -->", ai + "\n" + failure)
replace_slide("<!-- 13 · Ausfall: was hält, was fehlt -->", "")


def kpi(icon, tone, title, sub, extra=""):
    return f'''      <div class="card row" style="padding:20px 26px{extra}"><div class="ico sm {tone}"><svg class="i"><use href="#{icon}"/></svg></div><div><div style="font:700 28px var(--display)">{title}</div><div class="muted" style="font-size:22px">{sub}</div></div></div>'''


sub('''      <div style="font:700 30px var(--display)">Was für Jonas einfacher wird</div>
      <div class="card row" style="padding:24px 28px"><div class="ico sm blue"><svg class="i"><use href="#i-gear"/></svg></div><div><div style="font:700 28px var(--display)">Routine läuft durch</div><div class="muted" style="font-size:22px">ohne Sichtprüfung</div></div></div>
      <div class="card row" style="padding:24px 28px"><div class="ico sm coral"><svg class="i"><use href="#i-alert"/></svg></div><div><div style="font:700 28px var(--display)">Ausnahmen kommen mit Grund</div><div class="muted" style="font-size:22px">erwartet und gefunden</div></div></div>
      <div class="card row" style="padding:24px 28px"><div class="ico sm violet"><svg class="i"><use href="#i-user"/></svg></div><div><div style="font:700 28px var(--display)">Er entscheidet gezielt</div><div class="muted" style="font-size:22px">wo Verantwortung gefragt ist</div></div></div>
      <div class="card row" style="padding:24px 28px"><div class="ico sm gray"><svg class="i"><use href="#i-doccheck"/></svg></div><div><div style="font:700 28px var(--display)">Jeder Schritt belegt</div><div class="muted" style="font-size:22px">wer, wann, was</div></div></div>''',
    '''      <div class="row" style="justify-content:space-between"><div style="font:700 30px var(--display)">So würde ein Pilot es messen</div><span class="badge model">Vorschlag</span></div>
''' + "\n".join([
        kpi("i-gear", "blue", "Automatisierungsquote", "Anteil ohne Sachprüfung"),
        kpi("i-clock", "gray", "Bearbeitungszeit", "pro Rechnung, gemessen wie vorher"),
        kpi("i-alert", "coral", "Fehlalarme", "Stopps ohne echten Befund"),
        kpi("i-shield", "violet", "Leitplanke: keine Zahlung auf ein ungeprüftes Konto", "Schneller zählt nur, wenn das Risiko nicht steigt",
            ";border:2px solid var(--violet-soft);background:var(--violet-soft);box-shadow:none"),
    ]))


def step(n, title, text, first=False):
    return f'''        <div class="row" style="align-items:flex-start;position:relative{"" if first else ";margin-top:30px"}"><span class="step-n">{n}</span><div><h3 style="font-size:30px">{title}</h3><p class="muted" style="font-size:23px">{text}</p></div></div>'''


replace_slide("<!-- 15 · Reflexion -->", f'''<!-- 15 · Reflexion und Einführung -->
<section class="slide" data-chapter="Ausblick">
  <div class="tag">Reflexion</div>
  <h1>Was ich mitnehme. <span class="mark">Wie ich es einführen würde.</span></h1>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:44px;margin-top:40px">
    <div style="display:grid;gap:20px;align-content:start">
      <div class="row" style="gap:14px"><div class="ico sm yellow"><svg class="i"><use href="#i-bulb"/></svg></div><div style="font:700 32px var(--display)">Erkenntnisse</div></div>
      <div class="card tile" style="padding:24px 30px"><h3 style="font-size:30px">Die schwierigste Frage: Wo entscheidet ein Mensch?</h3><p>Nicht: Was lässt sich automatisieren.</p></div>
      <div class="card tile" style="padding:24px 30px"><h3 style="font-size:30px">Ein Prototyp ist noch kein eingeführter Prozess</h3><p>Vertrauen entsteht im Alltag, nicht in der Demo.</p></div>
      <div class="card tile" style="padding:24px 30px"><h3 style="font-size:30px">Eine Demo braucht Betriebsdisziplin</h3><p>Die Tunnel-Adresse fiel mehrfach weg. Daraus entstand eine Checkliste.</p></div>
    </div>
    <div>
      <div class="row" style="gap:14px;margin-bottom:20px;justify-content:space-between"><div class="row" style="gap:14px"><div class="ico sm blue"><svg class="i"><use href="#i-flag"/></svg></div><div style="font:700 32px var(--display)">Einführung bei Nordwerk</div></div><span class="badge model">Vorschlag, nicht umgesetzt</span></div>
      <div class="card" style="padding:32px 40px;position:relative">
        <div style="position:absolute;left:83px;top:66px;bottom:66px;border-left:4px dashed var(--bar)"></div>
{step(1, "Regeln abstimmen", "mit dem Finance-Team: Grenzen, Zuständige je Ausnahme", first=True)}
{step(2, "Parallelbetrieb", "echte Rechnungen laufen mit, Jonas entscheidet wie bisher")}
{step(3, "Vergleichen und messen", "System gegen Jonas: Abweichungen, Zeit, Rückmeldung")}
{step(4, "Ausweiten oder nachschärfen", "Entscheidung nach vorher vereinbarten Kriterien")}
      </div>
    </div>
  </div>
</section>''')

# Keys: S and K work with Shift or Caps Lock too; Cmd+S and Ctrl+S stay with the browser.
sub('    if (e.key === "s") return openSpeaker();',
    '    if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) return openSpeaker();')
sub('if (video && (e.key === " " || e.key === "k")) {',
    'if (video && (e.key === " " || e.key.toLowerCase() === "k")) {')

# 16: the payment is simulated; the line says what the control does, not that money was saved.
sub('<h1 class="xl">Gestoppt, <span class="mark">bevor Geld überwiesen wurde.</span></h1>',
    '<h1 class="xl">Gestoppt, <span class="mark">bevor Geld überwiesen wird.</span></h1>')

# 14: the fixed Soll/Ist set, below the model calculation and the pilot measures.
sub('<div style="display:grid;grid-template-columns:840px 1fr;gap:44px;margin-top:44px">\n    <div class="card" style="padding:36px 44px">',
    '<div style="display:grid;grid-template-columns:840px 1fr;gap:44px;margin-top:26px">\n    <div class="card" style="padding:28px 44px">')
sub('''Schneller zählt nur, wenn das Risiko nicht steigt</div></div></div>
    </div>
  </div>
</section>''', '''Schneller zählt nur, wenn das Risiko nicht steigt</div></div></div>
    </div>
  </div>
  <div class="card" style="margin-top:18px;padding:12px 28px;box-shadow:none;border:2px solid var(--mint-soft);background:var(--mint-soft);display:flex;gap:22px;align-items:center">
    <div class="ico sm mint"><svg class="i"><use href="#i-check"/></svg></div>
    <div><div style="font:700 26px var(--display)">Vorab geprüft: 20 von 20 Testrechnungen richtig eingeordnet, beide fremden IBANs gestoppt</div><div class="muted" style="font-size:21px">20 synthetische Rechnungen mit bekanntem Soll · 16 ohne Sachprüfung, 4 mit richtigem Grund gestoppt · Mischung gewählt, nicht gemessen</div></div>
    <span class="badge test" style="margin-left:auto;flex:none">getestet</span>
  </div>
</section>''')

open(out, "w").write(h)
print("slides:", h.count('<section class="slide"'))
