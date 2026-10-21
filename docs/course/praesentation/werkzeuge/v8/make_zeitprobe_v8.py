# Builds zeitprobe_v8.html from zeitprobe_v7.html: the 12 sections come from
# SPRECHTEXT_V8_DE.md. The plan total must stay at 20:05, as rehearsed.
# Usage: make_zeitprobe_v8.py zeitprobe_v7.html SPRECHTEXT_V8_DE.md out.html
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
assert sum(s["target"] for s in secs) == 1205
h, n = re.subn(r"const SECTIONS = \[.*?\];", lambda _: "const SECTIONS = " + json.dumps(secs, ensure_ascii=False).replace("</", "<\\/") + ";", h, count=1, flags=re.S)
assert n == 1
assert h.count("<title>Zeitprobe v7</title>") == 1
h = h.replace("<title>Zeitprobe v7</title>", "<title>Zeitprobe v8</title>")
open(out, "w").write(h)
print("Zeitprobe v8: Plan 20:05")
