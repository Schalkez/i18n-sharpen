#!/usr/bin/env python3
"""Build og-card.svg + og-card.png (1200×630) for social sharing preview."""
import os, glob, shutil, subprocess
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FONT = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
font = TTFont(FONT)
CAP = font["OS/2"].sCapHeight
cmap = font.getBestCmap()
gs = font.getGlyphSet()
hmtx = font["hmtx"]

def extract(text):
    x = 0.0; parts = []; bp = BoundsPen(gs)
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None: x += font["head"].unitsPerEm * 0.3; continue
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (1, 0, 0, 1, x, 0)))
        gs[g].draw(TransformPen(bp, (1, 0, 0, 1, x, 0)))
        c = pen.getCommands()
        if c: parts.append(c)
        x += hmtx[g][0]
    return " ".join(parts), x, bp.bounds

GRADS = '''
 <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8FB4CE"/><stop offset="0.42" stop-color="#E3EFF7"/><stop offset="0.5" stop-color="#FBFEFF"/><stop offset="0.58" stop-color="#DCEAF4"/><stop offset="1" stop-color="#9CC0D8"/></linearGradient>
 <linearGradient id="goldG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8D784"/><stop offset="0.5" stop-color="#E7B23F"/><stop offset="1" stop-color="#C98A1E"/></linearGradient>
 <linearGradient id="gripD" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5C6776"/><stop offset="0.5" stop-color="#444E5C"/><stop offset="1" stop-color="#39414D"/></linearGradient>'''

KNIFE_DARK = '''<g>
  <rect x="4" y="-22" width="10" height="20" rx="2.5" fill="url(#gripD)"/>
  <path d="M5,-6 L13,-12 M5,-12 L13,-18" stroke="url(#goldG)" stroke-width="1.4" opacity="0.95"/>
  <rect x="-1.5" y="-32" width="21" height="9.5" rx="3" fill="url(#goldG)"/>
  <circle cx="9" cy="-27.2" r="1.7" fill="#5A3E12" opacity="0.6"/>
  <path d="M4,-31 L14,-31 L14,-86 L8,-100 L4,-80 Z" fill="url(#steel)"/>
  <path d="M5,-34 L5,-78" stroke="#FFFFFF" stroke-width="1.4" opacity="0.6"/>
  <path d="M12.4,-34 L12.4,-85" stroke="#1B2330" stroke-width="1" opacity="0.18"/>
  <polygon points="9,-118 15,-111 9,-104 3,-111" fill="url(#goldG)"/>
</g>'''

d, adv, bounds = extract("18n-sharpen")
S  = 100.0 / CAP   # font units → user units (cap = 100)
TX = 23             # x offset where text starts (knife occupies 0..TX)
minX, minY = -4, -120
VW = round(TX + adv * S + 6, 1)
txt_bot = -bounds[1] * S
VH = round(txt_bot - minY + 4, 1)

# OG canvas
OW, OH = 1200, 630

# Scale lockup to ~800px wide
og_s = 800.0 / VW
lockup_w = VW * og_s   # ~800
lockup_h = VH * og_s   # ~204

# Vertically center lockup+tagline block
TAGLINE_GAP = 52       # px below lockup
TAGLINE_H   = 36       # approx tagline text height
block_h = lockup_h + TAGLINE_GAP + TAGLINE_H
block_top = (OH - block_h) / 2

# Group transform: map viewBox origin (minX,minY) → screen (lockup_left, block_top)
lockup_left = (OW - lockup_w) / 2
tx = lockup_left - og_s * minX
ty = block_top   - og_s * minY
tagline_y = block_top + lockup_h + TAGLINE_GAP

text_path = (f'<path d="{d}" '
             f'transform="translate({TX},0) scale({S:.5f},{-S:.5f})" '
             f'fill="#F4F8FC"/>')

# Subtle dot grid
dots = []
for gx in range(30, OW, 60):
    for gy in range(30, OH, 60):
        dots.append(f'<circle cx="{gx}" cy="{gy}" r="1"/>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {OW} {OH}" width="{OW}" height="{OH}" role="img" aria-label="i18n-sharpen">
<defs>{GRADS}</defs>
<rect width="{OW}" height="{OH}" fill="#141A24"/>
<g fill="#8FB4CE" opacity="0.055">{''.join(dots)}</g>
<g transform="translate({tx:.2f},{ty:.2f}) scale({og_s:.5f})">
  {KNIFE_DARK}
  {text_path}
</g>
<text x="{OW/2:.1f}" y="{tagline_y:.1f}" text-anchor="middle"
  font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
  font-size="22" font-weight="400" fill="#4D6E8A" letter-spacing="5">AST-BASED i18n STATIC ANALYSIS</text>
</svg>
'''

svg_path = os.path.join(ROOT, "docs/public/og-card.svg")
open(svg_path, "w").write(svg)
print(f"wrote {svg_path}")
print(f"lockup {lockup_w:.0f}×{lockup_h:.0f}px  scale={og_s:.3f}  tagline y={tagline_y:.0f}")

# Render to PNG for social crawlers (SVG not supported by most)
tmp_dir = "/tmp/ogprev"
os.makedirs(tmp_dir, exist_ok=True)
subprocess.run(["qlmanage", "-t", "-s", "1200", "-o", tmp_dir, svg_path],
               capture_output=True)
rendered = glob.glob(os.path.join(tmp_dir, "og-card.svg.png"))
if rendered:
    png_path = os.path.join(ROOT, "docs/public/og-card.png")
    # qlmanage pads to a square; crop to exact 1200×630 from top-left
    subprocess.run(["magick", rendered[0],
                    "-crop", f"{OW}x{OH}+0+0", "+repage", png_path], check=True)
    print(f"rendered + cropped PNG → {png_path}")
else:
    print("PNG render failed — qlmanage returned nothing; SVG only")
