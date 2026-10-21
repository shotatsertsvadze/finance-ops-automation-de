# Builds zeitprobe_v7.html from zeitprobe_v6.html: the 12 sections and the plan
# total come from SPRECHTEXT_V7_DE.md, everything else stays as in v6.
# Usage: make_zeitprobe_v7.py zeitprobe_v6.html SPRECHTEXT_V7_DE.md out.html
import json, re, sys

src, script, out = sys.argv[1:4]
h = open(src).read()


def sections(path):
    result = []
    for block in re.split(r"^## ", open(path).read(), flags=re.M)[1:]:
        head, _, body = block.partition("\n")
        m = re.match(r"(\d+) · (.+?) \((\d+):(\d\d)\)$", head.strip())
        if not m:
            continue
        paras = [" ".join(p.split()) for p in body.split("\n---")[0].strip().split("\n\n")]
        paras = [p for p in paras if p and p != "---" and not p.startswith(("Ablaufplan", "|", "# "))]
        result.append({"slide": m[1], "title": m[2], "target": int(m[3]) * 60 + int(m[4]), "video": False, "paras": paras})
    return result


secs = sections(script)
assert [s["slide"] for s in secs] == [str(i) for i in range(1, 13)]
total = sum(s["target"] for s in secs)
fmt = lambda t: f"{t // 60}:{t % 60:02d}"
h, n = re.subn(r"const SECTIONS = \[.*?\];", lambda _: "const SECTIONS = " + json.dumps(secs, ensure_ascii=False).replace("</", "<\\/") + ";", h, count=1, flags=re.S)
assert n == 1
for old, new in [("PLAN_TOTAL = 1155", f"PLAN_TOTAL = {total}"), ("<title>Zeitprobe v6</title>", "<title>Zeitprobe v7</title>")]:
    assert h.count(old) == 1, old
    h = h.replace(old, new)
assert h.count("19:15") == 2
h = h.replace("19:15", fmt(total))
open(out, "w").write(h)
print("Zeitprobe v7: Plan", fmt(total))
