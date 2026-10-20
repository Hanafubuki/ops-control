import json, re, struct, sys, zlib
from pathlib import Path

if len(sys.argv) != 2:
    sys.exit("usage: python3 art/build.py <pet>   (reads art/<pet>/<pet>.art)")
PET = sys.argv[1]
# The name becomes a path component and the TS export <NAME>_SHEET.
if not re.fullmatch(r"[a-z][a-z0-9-]*", PET):
    sys.exit(f"pet name {PET!r}: use lowercase letters, digits and dashes, starting with a letter")
ART = Path(__file__).parent
ROOT = ART.parent
SRC = ART / PET / f"{PET}.art"
SHEET = ROOT / "hooks" / "sprites" / f"{PET}.ts"
VIEWER = ART / PET / "viewer.html"
W, H = 24, 12

lines = SRC.read_text().splitlines()
palette, shiny, anims, transitions, outfits, named = {}, {}, {}, {}, {}, {}
errors = []
cur = None
i = 0


def kv(tokens):
    return dict(t.split("=", 1) for t in tokens if "=" in t)


def xy(s):
    return list(map(int, s.split(",")))


def block():
    global i
    out = []
    while lines[i].strip() != "end":
        out.append(lines[i])
        i += 1
    i += 1
    return out


while i < len(lines):
    p = lines[i].split()
    i += 1
    if not p:
        continue
    # `size WxH` must come before the first frame: frame rows are read H at a time
    if p[0] == "size":
        W, H = map(int, p[1].split("x"))
        if W < 1 or H < 1:
            sys.exit(f"{SRC}: size {p[1]} must be positive")
    elif p[0] in ("palette", "shiny"):
        (palette if p[0] == "palette" else shiny).update(l.split() for l in block())
    elif p[0] == "anim":
        o = kv(p[3:])
        cur = anims[p[1]] = {"loop": p[2] == "loop", "frames": []}
        cur["_exits"] = {int(n) for n in o["exits"].split(",")} if "exits" in o else set()
    elif p[0] == "trans":
        o = kv(p[2:])
        cur = transitions[p[1]] = {"from": o["from"], "to": o["to"], "frames": [], "_exits": set()}
    elif p[0] == "frame":
        o = kv(p[2:])
        fr = {"ms": int(p[1])}
        if "dx" in o:
            fr["dx"] = int(o["dx"])
        fr["head"] = xy(o["head"])
        if "hand" in o:
            fr["hand"] = xy(o["hand"])
        if "copy" in o:
            fr["px"] = list(named[o["copy"]])
        else:
            fr["px"] = lines[i : i + H]
            i += H
        if "name" in o:
            named[o["name"]] = fr["px"]
        # fx=x,y,c;... drops single particles (confetti) onto empty cells only
        if "fx" in o:
            g = [list(r) for r in fr["px"]]
            for spec in o["fx"].split(";"):
                x, y, c = spec.split(",")
                if g[int(y)][int(x)] == ".":
                    g[int(y)][int(x)] = c
            fr["px"] = ["".join(r) for r in g]
        if len(cur["frames"]) in cur["_exits"]:
            fr["exit"] = True
        cur["frames"].append(fr)
    elif p[0] == "outfit":
        o = kv(p[2:])
        px = block()
        if len({len(r) for r in px}) != 1:
            errors.append(f"outfit {p[1]} ragged rows")
        outfits[p[1]] = {"slot": o.get("slot", "head"), "anchor": xy(o["anchor"]), "px": px}

if len(palette) > 60:
    errors.append(f"palette has {len(palette)} colors, at most 60")
for k in [*palette, *shiny]:
    if len(k) != 1 or k == ".":
        errors.append(f"palette key {k!r} must be one character other than '.'")
for k in shiny:
    if k not in palette:
        errors.append(f"shiny key {k!r} is not in the palette")


def check(name, a, minimum):
    a.pop("_exits")
    if len(a["frames"]) < minimum:
        errors.append(f"{name}: only {len(a['frames'])} frames")
    if a.get("loop") and not any(f.get("exit") for f in a["frames"]):
        errors.append(f"{name}: looping animation has no exit frame")
    for n, fr in enumerate(a["frames"]):
        if len(fr["px"]) != H:
            errors.append(f"{name}[{n}] has {len(fr['px'])} rows")
        if not 80 <= fr["ms"]:
            errors.append(f"{name}[{n}] ms {fr['ms']} < 80")
        for r, row in enumerate(fr["px"]):
            if len(row) != W:
                errors.append(f"{name}[{n}] row {r} len {len(row)}: {row!r}")
            if set(row) - set(palette) - {"."}:
                errors.append(f"{name}[{n}] row {r} unknown {set(row) - set(palette) - {'.'}}")
    seen = [tuple(f["px"]) for f in a["frames"]]
    ex = [n for n, f in enumerate(a["frames"]) if f.get("exit")]
    print(f"{name:14} {len(seen):2} frames, {len(set(seen)):2} distinct, {sum(f['ms'] for f in a['frames']):5} ms  exits {ex}")


for name, a in anims.items():
    check(name, a, 8)
for name, t in transitions.items():
    check(name, t, 4)
    if t["to"] not in anims or (t["from"] != "*" and t["from"] not in anims):
        errors.append(f"transition {name}: unknown from/to")

if errors:
    print("\n".join(errors))
    sys.exit(1)


def js(v):
    return json.dumps(v, separators=(",", ":"), ensure_ascii=False)


def pt(a):
    return "[" + ",".join(map(str, a)) + "]"


def frame(f):
    parts = [f"ms: {f['ms']}"]
    if "dx" in f:
        parts.append(f"dx: {f['dx']}")
    parts.append(f"head: {pt(f['head'])}")
    if "hand" in f:
        parts.append(f"hand: {pt(f['hand'])}")
    parts.append(f"px: {js(f['px'])}")
    if f.get("exit"):
        parts.append("exit: true")
    return "      { " + ", ".join(parts) + " },"


ts = [
    f"// Hand-drawn by the artist; data only. Generated from art/{PET}/{PET}.art by art/build.py",
    "import type { PetSheet } from '../pets.ts'",
    "",
    f"export const {PET.upper().replace('-', '_')}_SHEET: PetSheet = {{",
    f"  w: {W},",
    f"  h: {H},",
    f"  palette: {js(palette)},",
]
if shiny:
    ts.append(f"  shiny: {js(shiny)},")
ts += ["  animations: {"]
for n, a in anims.items():
    ts += [f"    {js(n)}: {{ loop: {'true' if a['loop'] else 'false'}, frames: ["] + [frame(f) for f in a["frames"]] + ["    ] },"]
ts += ["  },"]
if outfits:
    ts += ["  outfits: {"]
    for n, o in outfits.items():
        ts.append(f"    {js(n)}: {{ slot: {js(o['slot'])}, anchor: {pt(o['anchor'])}, px: {js(o['px'])} }},")
    ts += ["  },"]
if transitions:
    ts += ["  transitions: {"]
    for n, t in transitions.items():
        ts += [f"    {js(n)}: {{ from: {js(t['from'])}, to: {js(t['to'])}, frames: ["] + [frame(f) for f in t["frames"]] + ["    ] },"]
    ts += ["  },"]
ts += ["}"]
SHEET.write_text("\n".join(ts) + "\n")

sheet = {"w": W, "h": H, "palette": palette, "shiny": shiny, "animations": anims,
         "transitions": transitions, "outfits": outfits}
blob = js({k: v for k, v in sheet.items() if v != {}})
VIEWER.write_text((ART / "viewer.template.html").read_text().replace("__PET__", PET.capitalize()).replace("__SPRITES__", blob))

# Row order is the public PNG pet spec: a sheet made from the template is read by
# position, so reordering breaks every custom pet. Left walks are mirrored at runtime.
SPEC_ROWS = ["idle", "walk", "working", "hop", "alert", "done", "sleep", "fail",
             "juggle", "pant", "pant-walk", "scrunch", "idle2", "idle3"]


def png(path, w, h, rgba_rows):
    # Only IHDR/IDAT/IEND: a gAMA, cHRM, sRGB or iCCP chunk makes browsers and the
    # studio shift the colors, so palette hexes would no longer round-trip.
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    raw = b"".join(b"\x00" + bytes(r) for r in rgba_rows)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


rgba = {k: bytes.fromhex(v.lstrip("#")) + b"\xff" for k, v in palette.items()}
rgba["."] = b"\x00\x00\x00\x00"
cols = max((len(anims[n]["frames"]) for n in SPEC_ROWS if n in anims), default=1)
grid = [bytearray(cols * W * 4) for _ in range(len(SPEC_ROWS) * H)]
for r, n in enumerate(SPEC_ROWS):
    for c, f in enumerate(anims.get(n, {"frames": []})["frames"]):
        for y, row in enumerate(f["px"]):
            grid[r * H + y][c * W * 4 : (c + 1) * W * 4] = b"".join(rgba[ch] for ch in row)
written = []
for scale, suffix in ((1, ""), (8, "@8x")):
    out = ART / PET / f"{PET}-sheet{suffix}.png"
    rows = [bytes(b for px in range(0, len(g), 4) for b in g[px : px + 4] * scale) for g in grid]
    png(out, cols * W * scale, len(grid) * scale, [r for r in rows for _ in range(scale)])
    written.append(out.relative_to(ROOT))
print("wrote", SHEET.relative_to(ROOT), VIEWER.relative_to(ROOT), *written, sep="\n  ")
