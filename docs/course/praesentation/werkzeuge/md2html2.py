# Minimal Markdown to HTML for the speaker script and the live-demo runbook:
# headings, rules, tables, paragraphs, lists, check boxes, fenced code, bold,
# inline code and [stage directions]. Usage: md2html2.py file.md "Title"
import html, re, sys

ITEM = re.compile(r"^(\s*)(- \[ \] |- |\d+\. (?:\[ \] )?)")


def inline(t):
    t = html.escape(t, quote=False)
    t = re.sub(r"`([^`]+)`", r"<code>\1</code>", t)
    t = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", t)
    return re.sub(r"\[([^\]]+)\]", r'<span class="regie">[\1]</span>', t)


def items(lines):
    """List items: a line starting with a marker opens one, indented lines continue it."""
    out = []
    for line in lines:
        m = ITEM.match(line)
        if m:
            box = "☐ " if "[ ]" in m[2] else ""
            out.append([m[2].strip()[0].isdigit(), box + line[m.end():].strip()])
        else:
            out[-1][1] += " " + line.strip()
    ordered = out[0][0]
    tag = "ol" if ordered else "ul"
    return f"<{tag}>" + "".join(f"<li>{inline(t)}</li>" for _, t in out) + f"</{tag}>"


def block(b):
    lines = b.split("\n")
    if b.startswith("```"):
        return "<pre>" + html.escape("\n".join(lines[1:-1])) + "</pre>"
    if b.startswith("# "):
        return f"<h1>{inline(b[2:])}</h1>"
    if b.startswith("## "):
        m = re.match(r"## (\d+) · (.+?) \((\d+:\d\d)\)$", b)
        if m:
            return f'<h2><span class="no">{m[1]}</span>{inline(m[2])}<span class="dur">{m[3]}</span></h2>'
        return f"<h2>{inline(b[3:])}</h2>"
    if b.strip() == "---":
        return "<hr>"
    if lines[0].startswith("|"):
        rows = [[c.strip() for c in l.strip("|").split("|")] for l in lines if not re.match(r"^\|[-| ]+\|$", l)]
        cls = ' class="times"' if "Dauer" in rows[0] else ""
        head = "".join(f"<th>{inline(c)}</th>" for c in rows[0])
        body = "".join("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in rows[1:])
        return f"<table{cls}><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>"
    first = next((i for i, l in enumerate(lines) if ITEM.match(l)), None)
    if first is not None:
        lead = f"<p>{inline(' '.join(lines[:first]))}</p>" if first else ""
        return lead + items(lines[first:])
    if re.fullmatch(r"\*\*.+\*\*", lines[0]) and len(lines) > 1:
        return f'<p class="q">{inline(lines[0])}</p><p>{inline(" ".join(lines[1:]))}</p>'
    return f"<p>{inline(' '.join(lines))}</p>"


src = open(sys.argv[1]).read().strip()
title = sys.argv[2] if len(sys.argv) > 2 else "Sprechtext Abschlusspräsentation"
blocks = [b.strip("\n") for b in re.split(r"\n\s*\n", src) if b.strip()]
body = "\n".join(block(b) for b in blocks)
print(f"""<!doctype html><html lang="de"><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,600;1,400&display=swap">
<style>
@page {{ size: A4; margin: 16mm 18mm; }}
:root {{ --ink: #0F2340; --text: #2F3B4E; --muted: #6A778C; --line: #D7DFEA; --blue: #2F5BEA; }}
* {{ box-sizing: border-box; }}
body {{ font: 11pt/1.55 "IBM Plex Sans", sans-serif; color: var(--text); margin: 0; }}
h1 {{ font-size: 20pt; color: var(--ink); margin: 0 0 8px; }}
h2 {{ display: flex; align-items: center; gap: 10px; font-size: 13.5pt; color: var(--ink); margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 1.5px solid var(--ink); break-after: avoid; }}
h2 .no {{ display: inline-grid; place-items: center; min-width: 26px; height: 26px; border-radius: 13px; background: var(--blue); color: #fff; font-size: 11pt; padding: 0 6px; }}
h2 .dur {{ margin-left: auto; font: 500 10pt "IBM Plex Mono", monospace; color: var(--muted); }}
p {{ margin: 0 0 8px; }}
p.q {{ margin: 12px 0 2px; color: var(--ink); break-after: avoid; }}
ul, ol {{ margin: 0 0 8px; padding-left: 22px; }}
li {{ margin: 0 0 3px; }}
pre {{ font: 9pt/1.45 "IBM Plex Mono", monospace; background: #EEF2F7; padding: 8px 10px; border-radius: 4px; white-space: pre-wrap; word-break: break-all; margin: 0 0 10px; }}
.regie {{ color: var(--muted); font-style: italic; }}
code {{ font: 9.5pt "IBM Plex Mono", monospace; background: #EEF2F7; padding: 0 3px; border-radius: 2px; }}
strong {{ color: var(--ink); }}
table {{ border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10pt; }}
th, td {{ text-align: left; padding: 3px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }}
th {{ color: var(--muted); font-weight: 600; }}
tr {{ break-inside: avoid; }}
table.times td:nth-child(3), table.times td:nth-child(4) {{ font-family: "IBM Plex Mono", monospace; }}
hr {{ border: 0; border-top: 1px solid var(--line); margin: 16px 0; }}
</style></head><body>
{body}
</body></html>""")
