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

Prüfen und exportieren:

| Skript | Zweck |
|---|---|
| `render.mjs <deck> <ordner>` | jede Folie als PNG, Warnung bei Text im Fußbereich |
| `v6/nav_test.mjs <deck>` | Sprünge, Referentenansicht, Reserve-Video |
| `pdf_deck.mjs <deck> <pdf>` | Deck als PDF |
| `md2html2.py <md> "<Titel>"` und `pdf_a4.mjs <html> <pdf>` | Markdown als A4-PDF (Sprechtext, Ablaufpläne) |
| `v6/finops_demo_check.mjs <ui> <api> <ordner>` | Finance-Ops-Teil der Live-Demo auf der Demo-Instanz durchklicken |

`zeitprobe_v5.html` und `zeitprobe_v6.html` im Ordner darüber sind die
Zeitproben vom Desktop; v6 entstand aus v5 durch Austausch der Abschnittsliste.
