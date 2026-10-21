# Werkzeuge für Deck, Sprechtext und PDFs

Gesichert am 21.10.2026 aus dem temporären Arbeitsordner, unverändert. Die
Skripte enthalten absolute Pfade zum Projektordner und erwarten Chrome und
Playwright aus `node_modules`.

Sprechtext und Deck v6 bauen (aus dem Ordner `docs/course/praesentation`):

```bash
python3 werkzeuge/v6/make_script_v6.py SPRECHTEXT_V5_DE.md SPRECHTEXT_V6_DE.md
```

```bash
python3 werkzeuge/v6/make_deck_v6.py praesentation_v5.html backup_folien_v5.html SPRECHTEXT_V6_DE.md werkzeuge/v5/speaker_v5.html praesentation_v6.html
```

v7 trennt das getestete v6-Deck in zwei Dateien, Hauptpräsentation und Reserve:

```bash
python3 werkzeuge/v7/make_script_v7.py SPRECHTEXT_V5_DE.md SPRECHTEXT_V7_DE.md
```

```bash
python3 werkzeuge/v7/make_deck_v7.py praesentation_v6.html backup_folien_v5.html SPRECHTEXT_V7_DE.md werkzeuge/v5/speaker_v5.html praesentation_v7.html reserve_v7.html
```

```bash
python3 werkzeuge/v7/make_zeitprobe_v7.py zeitprobe_v6.html SPRECHTEXT_V7_DE.md zeitprobe_v7.html
```

v8 baut auf den v7-Dateien auf: Protokoll in Supabase (n8n-Workflow v3) statt
Google Sheets, dazu die Referenzfolie B9. v7 bleibt unverändert.

```bash
python3 werkzeuge/v8/make_script_v8.py SPRECHTEXT_V7_DE.md SPRECHTEXT_V8_DE.md
```

```bash
python3 werkzeuge/v8/make_deck_v8.py praesentation_v7.html reserve_v7.html SPRECHTEXT_V8_DE.md praesentation_v8.html reserve_v8.html
```

```bash
python3 werkzeuge/v8/make_zeitprobe_v8.py zeitprobe_v7.html SPRECHTEXT_V8_DE.md zeitprobe_v8.html
```

Prüfen und exportieren:

| Skript | Zweck |
|---|---|
| `render.mjs <deck> <ordner>` | jede Folie als PNG, Warnung bei Text im Fußbereich |
| `v6/nav_test.mjs <deck>` | Sprünge, Referentenansicht, Reserve-Video (v6) |
| `v7/nav_test_v7.mjs <haupt> <reserve>` | beide v7- oder v8-Dateien: Folienzahl, Sprünge, Video, Referentenansicht |
| `pdf_deck.mjs <deck> <pdf>` | Deck als PDF |
| `md2html2.py <md> "<Titel>"` und `pdf_a4.mjs <html> <pdf>` | Markdown als A4-PDF (Sprechtext, Ablaufpläne) |
| `v6/finops_demo_check.mjs <ui> <api> <ordner>` | Finance-Ops-Teil der Live-Demo auf der Demo-Instanz durchklicken |

`zeitprobe_v5.html` und `zeitprobe_v6.html` im Ordner darüber sind die
Zeitproben vom Desktop; v6 entstand aus v5 durch Austausch der Abschnittsliste.
