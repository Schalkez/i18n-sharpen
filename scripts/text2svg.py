#!/usr/bin/env python3
"""Extract an SVG path 'd' (font units, y-up) for a string in a given TTF.
Usage: text2svg.py <font.ttf> <string> [tracking_units]
Prints JSON: {unitsPerEm, capHeight, advance, d}
"""
import sys, json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

font_path, text = sys.argv[1], sys.argv[2]
tracking = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0

font = TTFont(font_path)
upm = font["head"].unitsPerEm
cmap = font.getBestCmap()
glyphSet = font.getGlyphSet()
hmtx = font["hmtx"]

cap = None
try:
    cap = font["OS/2"].sCapHeight
except Exception:
    pass
if not cap:
    # fall back to bbox of '1'
    g = glyphSet[cmap[ord("1")]]
    from fontTools.pens.boundsPen import BoundsPen
    bp = BoundsPen(glyphSet); g.draw(bp)
    cap = bp.bounds[3] if bp.bounds else int(upm * 0.7)

x = 0.0
d_parts = []
for ch in text:
    gname = cmap.get(ord(ch))
    if gname is None:
        x += upm * 0.3
        continue
    pen = SVGPathPen(glyphSet)
    tpen = TransformPen(pen, (1, 0, 0, 1, x, 0))
    glyphSet[gname].draw(tpen)
    d = pen.getCommands()
    if d:
        d_parts.append(d)
    x += hmtx[gname][0] + tracking

print(json.dumps({
    "unitsPerEm": upm,
    "capHeight": cap,
    "advance": round(x, 1),
    "d": " ".join(d_parts),
}))
