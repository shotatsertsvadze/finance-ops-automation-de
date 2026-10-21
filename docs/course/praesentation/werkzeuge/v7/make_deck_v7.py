# Splits the tested v6 deck into two files: praesentation_v7.html with exactly
# the 12 main slides, and reserve_v7.html with the reserve slides R1-R4 from v6
# and the reference slides B1-B8 from backup_folien_v5.html. Adds the three
# points agreed for v7 (problem in one number, data protection, recommendation).
# Usage: make_deck_v7.py praesentation_v6.html backup_folien_v5.html SPRECHTEXT_V7_DE.md speaker_v5.html main.html reserve.html
import json, re, sys

v6_path, backup_path, script, speaker_path, out_main, out_reserve = sys.argv[1:7]
v6 = open(v6_path).read()
backup = open(backup_path).read()
speaker_src = open(speaker_path).read()


def sub(text, old, new, count=1):
    assert text.count(old) == count, (text.count(old), old[:80])
    return text.replace(old, new)


def sections(html, pattern=r"<!-- [^\n]*-->\n<section .*?</section>\n"):
    return re.findall(pattern, html[html.index('<main class="deck">'):html.index("</main>")], flags=re.S)


SECS = sections(v6)
MAIN = [s for s in SECS if 'data-chapter="Backup"' not in s]
RESERVE = [s for s in SECS if 'data-chapter="Backup"' in s]
REFERENCE = sections(backup, r"<!-- B\d · [^\n]*-->\n<section .*?</section>\n")
assert (len(MAIN), len(RESERVE), len(REFERENCE)) == (12, 4, 8)


def with_main(html, secs):
    start, end = html.index('<main class="deck">\n') + len('<main class="deck">\n'), html.index("</main>")
    return html[:start] + "\n" + "\n".join(secs) + "\n" + html[end:]


def notes(path, pattern):
    """Sections '## <no> · Title (m:ss)' of the speaker script, without tables and plans."""
    result = []
    for block in re.split(r"^## ", open(path).read(), flags=re.M)[1:]:
        head, _, body = block.partition("\n")
        body = body.split("\n---")[0]
        m = re.match(pattern, head.strip())
        if not m:
            continue
        paras = [" ".join(p.split()) for p in body.strip().split("\n\n")]
        paras = [p for p in paras if p and p != "---" and not p.startswith(("Ablaufplan", "|", "# "))]
        result.append({"slide": m[1], "title": m[2], "target": int(m[3]) * 60 + int(m[4]), "video": m[2] == "Demo-Video", "paras": paras})
    return result


js = lambda v: json.dumps(v, ensure_ascii=False).replace("</", "<\\/")


def with_speaker(html, notes_list, speaker):
    html, n1 = re.subn(r"window\.SPEAKER_NOTES = .*?;\n", lambda _: f"window.SPEAKER_NOTES = {js(notes_list)};\n", html, count=1)
    html, n2 = re.subn(r"const SPEAKER_HTML = .*?;\n", lambda _: f"const SPEAKER_HTML = {js(speaker)};\n", html, count=1)
    assert n1 == 1 and n2 == 1
    return html


# --- main deck: the 12 slides ------------------------------------------------
main = MAIN[:]
# 5: the problem in one number, marked as a model assumption.
main[4] = sub(main[4], '<div class="stat" style="color:var(--violet);font-size:76px">≈ 100</div>',
              '<div class="stat" style="color:var(--violet);font-size:76px">≈ 327 h</div>')
main[4] = sub(main[4], '<div style="font-size:23px;margin-top:4px">Eingangsrechnungen pro Arbeitstag</div>',
              '<div style="font-size:23px;margin-top:4px">Prüfaufwand im Monat, heute</div>')
main[4] = sub(main[4], '<span class="badge model">Modellannahme: 2.000 im Monat</span>',
              '<span class="badge model">Modell: 2.000 Rechnungen/Monat</span>')
# 7: the reserve is a separate file now.
main[6] = sub(main[6], "Reserve: Video vom 15.10.2026 und Screenshots hinter Folie 12",
              "Reserve: Video vom 15.10.2026 und Screenshots in der Reservepräsentation")
# 11: data protection as its own point.
privacy = '''  <div class="card" style="margin-top:26px;padding:20px 30px;display:grid;grid-template-columns:auto 1fr 1fr 1.35fr;gap:30px;align-items:start">
    <div class="row" style="gap:16px;align-self:center"><div class="ico sm blue"><svg class="i"><use href="#i-shield"/></svg></div><div style="font:700 30px var(--display)">Datenschutz</div></div>
    <div><div class="lab muted">DEMO</div><div style="font-size:23px;line-height:1.3">nur synthetische Daten</div></div>
    <div><div class="lab muted">KI</div><div style="font-size:23px;line-height:1.3">keine Namen, keine Rechnungsnummer</div></div>
    <div><div class="lab muted">ECHTBETRIEB</div><div style="font-size:23px;line-height:1.3">AV-Verträge, KI-Anbieter prüfen, kein Sheet mit Rechnungsdaten</div></div>
  </div>
</section>
'''
assert main[10].endswith("</section>\n")
main[10] = main[10][:-len("</section>\n")] + privacy
# 12: the recommendation before the thanks.
main[11] = sub(main[11], '''      <p class="lede">Automatisieren, was Routine ist. Kontrollieren, was kritisch ist.</p>
      <div style="margin-top:56px;font:700 44px var(--display)">''', '''      <p class="lede">Automatisieren, was Routine ist. Kontrollieren, was kritisch ist.</p>
      <div class="note" style="margin-top:34px;font-size:27px;padding:18px 26px;gap:18px"><div class="ico"><svg class="i"><use href="#i-flag"/></svg></div><div><b>Empfehlung:</b> kontrollierter Pilot im Parallelbetrieb. Ausweiten erst nach vereinbarten Kriterien.</div></div>
      <div style="margin-top:40px;font:700 44px var(--display)">''')

m = with_main(v6, main)
m = sub(m, "<title>Finance Operations Automation · v6</title>", "<title>Finance Operations Automation · v7</title>")
m = sub(m, '''  // A number and Enter jump to that slide; V jumps to the reserve video.
  let typed = "";
  const reserveVideo = slides.findIndex((s) => s.querySelector("video"));
''', '''  // A number and Enter jump to that slide.
  let typed = "";
''')
m = sub(m, '''    if (e.key.toLowerCase() === "v" && !e.metaKey && !e.ctrlKey) return show(reserveVideo);
    // On the video slide, Space and K pause and resume; the arrow keys still change slides.
    const video = slides[current].querySelector("video");
    if (video && (e.key === " " || e.key.toLowerCase() === "k")) {
      e.preventDefault();
      return video.paused ? video.play() : video.pause();
    }
''', "")
main_notes = notes(script, r"(\d+) · (.+?) \((\d+):(\d\d)\)$")
assert [n["slide"] for n in main_notes] == [str(i) for i in range(1, 13)], [n["slide"] for n in main_notes]
sp = sub(speaker_src, '<span>→ ← Folie · Leertaste oder K: Video</span>', '<span>→ ← Folie · Zahl + Enter: Sprung</span>')
sp = sub(sp, '''  if (!["ArrowRight", "ArrowLeft", " ", "PageDown", "PageUp", "Home", "End", "k"].includes(key)) return;''',
         '''  if (!["ArrowRight", "ArrowLeft", " ", "PageDown", "PageUp", "Home", "End", "Enter"].includes(key) && !/^[0-9]$/.test(key)) return;''')
m = with_speaker(m, main_notes, sp)
open(out_main, "w").write(m)

# --- reserve deck: R1-R4 and B1-B8 ------------------------------------------
label = lambda sec, lab, group: sub(sec, '<section class="slide" data-chapter="Backup"', f'<section class="slide" data-chapter="Backup" data-label="{lab}" data-group="{group}"')
reserve = [label(s, f"R{i + 1}", "Reserve") for i, s in enumerate(RESERVE)] + [label(s, f"B{i + 1}", "Backup") for i, s in enumerate(REFERENCE)]
r = with_main(v6, reserve)
r = sub(r, "<title>Finance Operations Automation · v6</title>", "<title>Finance Operations Automation · Reserve v7</title>")
b8_css = backup[backup.index("/* B8: five paths */"):backup.index("@page")]
b8_css = "\n".join(l for l in b8_css.splitlines() if not l.startswith(".chip.go"))
r = sub(r, "</style>", b8_css + "\n</style>")
r = sub(r, '''    foot.innerHTML = `<div class="rail"><span class="on" style="flex:none;color:var(--muted)">Reserve</span></div><span class="pageno">R${++backupNo}</span>`;''',
        '''    foot.innerHTML = `<div class="rail"><span class="on" style="flex:none;color:var(--muted)">${slide.dataset.group}</span></div><span class="pageno">${slide.dataset.label}</span>`;''')
r = sub(r, "window.SPEAKER_COUNT = mainCount;", "window.SPEAKER_COUNT = slides.length;\nwindow.SPEAKER_LABELS = slides.map((s) => s.dataset.label);")
# No jumps by number here: "8 Enter" means slide 8 of the main deck, not B4.
r = sub(r, '''  // A number and Enter jump to that slide; V jumps to the reserve video.
  let typed = "";
  const reserveVideo = slides.findIndex((s) => s.querySelector("video"));
''', "")
r = sub(r, '''    if (/^[0-9]$/.test(e.key)) { typed = (typed + e.key).slice(-2); return; }
    if (e.key === "Enter" && typed) { show(+typed - 1); typed = ""; return; }
    typed = "";
    if (e.key.toLowerCase() === "v" && !e.metaKey && !e.ctrlKey) return show(reserveVideo);
''', "")
r = sub(r, '    if (e.key === "End") show(lastMain);', '    if (e.key === "End") show(slides.length - 1);')
reserve_notes = [dict(n, slide=str(i + 1), label=n["slide"]) for i, n in enumerate(notes(script, r"(R\d) · (.+?) \((\d+):(\d\d)\)$"))]
assert [n["label"] for n in reserve_notes] == ["R1", "R2", "R3", "R4"]
for i, sec in enumerate(REFERENCE):
    title = re.match(r"<!-- B\d · ([^\n]*?) -->", sec)[1]
    reserve_notes.append({"slide": str(5 + i), "label": f"B{i + 1}", "title": title, "target": 60, "video": False,
                          "paras": ["[Referenzfolie für Fragen, ohne Sprechtext. Passende Antworten: Abschnitt „Kurze Antworten“ im Sprechtext.]"]})
sp = sub(speaker_src, '$("no").textContent = `${i + 1} / ${deck.SPEAKER_COUNT}`;', '$("no").textContent = deck.SPEAKER_LABELS[i];')
sp = sub(sp, '$("next").textContent = next ? `Als Nächstes: ${next.slide} · ${next.title}` : "Letzte Folie";',
         '$("next").textContent = next ? `Als Nächstes: ${next.label} · ${next.title}` : "Letzte Folie";')
r = with_speaker(r, reserve_notes, sp)
open(out_reserve, "w").write(r)
print("main:", m.count('<section class="slide"'), "slides,", len(main_notes), "notes |",
      "reserve:", r.count('<section class="slide"'), "slides,", len(reserve_notes), "notes")
