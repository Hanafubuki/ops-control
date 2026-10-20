import json, re, sys
from pathlib import Path

# Fails when any animation other than idle reuses idle's base frame: a pose
# built from the resting sprite with a face swap reads as idle in the pane.
# idle2 and idle3 are idle variants: they start and end on the base frame so a
# pose change can leave them there.
if len(sys.argv) != 2:
    sys.exit("usage: python3 art/check_distinct.py <pet>   (reads hooks/sprites/<pet>.ts)")
src = (Path(__file__).parent.parent / "hooks" / "sprites" / f"{sys.argv[1]}.ts").read_text()

frames, cur = {}, None
for line in src.splitlines():
    if m := re.match(r'\s+"([\w-]+)": \{ loop:', line):
        cur = frames.setdefault(m.group(1), [])
    elif re.match(r'\s+"[\w-]+": \{ (from|slot):', line) or line.startswith("  },"):
        cur = None
    elif cur is not None and (m := re.search(r"px: (\[.*?\])", line)):
        cur.append(json.loads(m.group(1)))

base = frames["idle"][0]
bad = [f"{a}[{i}]" for a, fs in frames.items() if not re.fullmatch(r"idle\d*", a) for i, f in enumerate(fs) if f == base]
print(f"{sum(map(len, frames.values()))} frames in {len(frames)} animations checked against idle[0]")
if bad:
    sys.exit("identical to idle's base frame: " + ", ".join(bad))
print("ok: no animation outside the idles reuses idle's base frame")
