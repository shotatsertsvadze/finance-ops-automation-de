# Builds praesentation_v8.html and reserve_v8.html from the tested v7 files:
# the processing log of the n8n workflow v3 is Supabase instead of Google
# Sheets. Slides keep their layout; only the affected texts change, the reserve
# gets B9 with the v3 test of 21.10.2026, and the speaker notes come from
# SPRECHTEXT_V8_DE.md. The v7 files stay untouched.
# Usage: make_deck_v8.py praesentation_v7.html reserve_v7.html SPRECHTEXT_V8_DE.md main.html reserve.html
import json, re, sys

main_src, reserve_src, script, out_main, out_reserve = sys.argv[1:6]


def sub(text, old, new):
    assert text.count(old) == 1, (text.count(old), old[:80])
    return text.replace(old, new)


js = lambda v: json.dumps(v, ensure_ascii=False).replace("</", "<\\/")


def notes(pattern):
    """Sections '## <no> · Title (m:ss)' of the speaker script, without tables and plans."""
    result = []
    for block in re.split(r"^## ", open(script).read(), flags=re.M)[1:]:
        head, _, body = block.partition("\n")
        body = body.split("\n---")[0]
        m = re.match(pattern, head.strip())
        if not m:
            continue
        paras = [" ".join(p.split()) for p in body.strip().split("\n\n")]
        paras = [p for p in paras if p and p != "---" and not p.startswith(("Ablaufplan", "|", "# "))]
        result.append({"slide": m[1], "title": m[2], "target": int(m[3]) * 60 + int(m[4]), "video": m[2] == "Demo-Video", "paras": paras})
    return result


def speaker_notes(html):
    m = re.search(r"window\.SPEAKER_NOTES = (.*?);\n", html)
    return json.loads(m[1])


def with_notes(html, notes_list):
    html, n = re.subn(r"window\.SPEAKER_NOTES = .*?;\n", lambda _: f"window.SPEAKER_NOTES = {js(notes_list)};\n", html, count=1)
    assert n == 1
    return html


# --- main deck ---------------------------------------------------------------
m = open(main_src).read()
m = sub(m, "<title>Finance Operations Automation · v7</title>", "<title>Finance Operations Automation · v8</title>")
# 6: the log is Supabase now; the failure path was tested again with v3.
m = sub(m, "<b>Sheet: nur Protokoll</b>", "<b>Supabase: nur Protokoll</b>")
m = sub(m, '<span class="live">Test 20.10.</span>', '<span class="live">Test 21.10.</span>')
# 7: what step 2 of the demo shows.
m = sub(m, ">Verzweigung nur nach der Antwort von Finance-Ops</div>", ">Verzweigung nur nach Finance-Ops, Protokoll in Supabase</div>")
# 11: data protection in real operation.
m = sub(m, ">AV-Verträge, KI-Anbieter prüfen, kein Sheet mit Rechnungsdaten</div>", ">AV-Verträge, KI-Anbieter prüfen, Supabase mit Zertifikatsprüfung</div>")
main_notes = notes(r"(\d+) · (.+?) \((\d+):(\d\d)\)$")
assert [n["slide"] for n in main_notes] == [str(i) for i in range(1, 13)]
m = with_notes(m, main_notes)
assert "Sheet" not in m, [l[:120] for l in m.splitlines() if "Sheet" in l]
open(out_main, "w").write(m)

# --- reserve deck --------------------------------------------------------------
r = open(reserve_src).read()
r = sub(r, "<title>Finance Operations Automation · Reserve v7</title>", "<title>Finance Operations Automation · Reserve v8</title>")
# R4: a failed log keeps the decision and the confirmation.
r = sub(r, '<div class="ftitle">Google Sheets weg</div>', '<div class="ftitle">Supabase-Protokoll weg</div>')
r = sub(r, '<div class="fcell">Die Entscheidung steht. Nur die Protokollzeile fehlt.</div>',
        '<div class="fcell">Die Entscheidung steht, die Bestätigung kommt. Nur die Zeile fehlt.</div>')
r = sub(r, "technischer Fehlerpfad getestet am 20.10.2026: n8n-Ausführung 200216",
        "Fehlerpfad und Protokollausfall getestet am 21.10.2026: n8n-Ausführungen 207510 und 207503")
# B1: the e-mail test of 11.10. ran on the original workflow, still with Sheets.
r = sub(r, "<th>Google Sheet</th>", "<th>Google Sheet (damals)</th>")
r = sub(r, "Belege: n8n-Ausführungen 112221 und 112248, Workflow „Finance Ops – Invoice Intake Demo“",
        "Belege: n8n-Ausführungen 112221 und 112248, ursprünglicher Workflow, Protokoll damals in Google Sheets · Test mit Supabase: B9")
# B3: the log tool.
r = sub(r, '<h3 style="margin-top:4px">Google Sheets</h3><p>Zusätzliches Protokoll, eine Zeile pro Rechnung. Nur Anzeige.</p>',
        '<h3 style="margin-top:4px">Supabase</h3><p>Zusätzliches Protokoll, eine Zeile pro Rechnung. n8n darf nur einfügen.</p>')
r = sub(r, "Es übersetzt für das Sheet nur Codes in Wörter.", "Es übersetzt für die Bestätigung nur Codes in Wörter.")
r = sub(r, "Demo-Aufbau: Anwendung lokal über einen temporären Cloudflare-Tunnel erreichbar, n8n in der Cloud",
        "Demo-Aufbau: Anwendung lokal über einen temporären Cloudflare-Tunnel erreichbar, n8n in der Cloud, Protokoll in Supabase (Frankfurt)")
# B8: the transport card.
r = sub(r, "schreibt danach eine Zeile ins Google Sheet: ein zusätzliches Protokoll.",
        "schreibt danach eine Zeile in Supabase: ein zusätzliches Protokoll.")

B9 = '''<!-- B9 · Test v3 mit Supabase -->
<section class="slide" data-chapter="Backup" data-label="B9" data-group="Backup">
  <div class="tag backup">Backup · Integrationstest v3</div>
  <h1>Getestet: <span class="mark">Protokoll in Supabase.</span></h1>
  <div class="row" style="margin-top:22px;gap:14px"><span class="badge test">Getestet am 21.10.2026</span><span class="badge demo">Synthetische Testrechnungen</span><span class="badge demo">n8n-Formular, Workflow v3</span></div>
  <div class="card b9" style="margin-top:26px;padding:22px 40px 10px">
    <table class="t">
      <tr><th>Fall</th><th>Formular zeigt</th><th>Finance-Ops</th><th>Protokoll in Supabase</th></tr>
      <tr><td><b>380&nbsp;€</b> <span class="muted">INV-2026-00433</span></td><td>Freigegeben</td><td><span class="iban">APPROVED</span></td><td>Zeile, <span class="iban">AUTO_APPROVE</span></td></tr>
      <tr><td><b>1.240&nbsp;€</b> <span class="muted">INV-2026-00421</span></td><td>Freigabe ausstehend</td><td><span class="iban">READY_FOR_APPROVAL</span></td><td>Zeile, <span class="iban">APPROVAL</span></td></tr>
      <tr><td><b>2.499&nbsp;€</b> <span class="muted">HL-2026-7731</span></td><td>Sichtprüfung, IBAN</td><td><span class="iban">REVIEW_REQUIRED</span></td><td>Zeile, <span class="iban">REVIEW</span></td></tr>
      <tr><td><b>Duplikat</b> <span class="muted">380&nbsp;€ noch einmal</span></td><td>Duplikat</td><td><span class="iban">DUPLICATE</span></td><td>Zeile <b>ohne Entscheidung</b></td></tr>
      <tr><td><b>Protokoll gesperrt</b> <span class="muted">Recht kurz entzogen</span></td><td>Sichtprüfung</td><td><span class="iban">REVIEW_REQUIRED</span></td><td>keine Zeile, Fehlerweg</td></tr>
      <tr><td><b>Finance-Ops gestoppt</b> <span class="muted">HTTP 502</span></td><td>Fehlermeldung</td><td>keine Rechnung</td><td>keine Zeile</td></tr>
    </table>
  </div>
  <div class="note" style="margin-top:26px"><div class="ico"><svg class="i"><use href="#i-shield"/></svg></div><div>Entschieden hat in jedem Fall <b>Finance-Ops</b>. Supabase hält nur fest, was Finance-Ops geantwortet hat; n8n darf dort nur einfügen.</div></div>
  <p class="caption" style="margin-top:16px">Belege: n8n-Ausführungen 207493, 207496, 207497, 207500, 207503, 207510 · Supabase Frankfurt · Zertifikat nicht geprüft</p>
</section>
'''
r = sub(r, "\n</main>", "\n" + B9 + "</main>")
r = sub(r, "</style>", ".b9 table.t td { padding: 12px 14px; }\n.b9 table.t td .muted { font-size: 20px; margin-left: 6px; }\n</style>")

reserve_notes = speaker_notes(r)
assert [n["label"] for n in reserve_notes] == ["R1", "R2", "R3", "R4"] + [f"B{i}" for i in range(1, 9)]
for i, n in enumerate(notes(r"(R\d) · (.+?) \((\d+):(\d\d)\)$")):
    reserve_notes[i] = dict(n, slide=str(i + 1), label=n["slide"])
reserve_notes.append({"slide": "13", "label": "B9", "title": "Test v3 mit Supabase", "target": 60, "video": False,
                      "paras": ["[Referenzfolie für Fragen, ohne Sprechtext. Passende Antworten: Abschnitt „Kurze Antworten“ im Sprechtext.]"]})
r = with_notes(r, reserve_notes)
open(out_reserve, "w").write(r)
print("main:", m.count('<section class="slide"'), "slides,", len(main_notes), "notes |",
      "reserve:", r.count('<section class="slide"'), "slides,", len(reserve_notes), "notes")
