#!/usr/bin/env python3
"""Generate brand assets (logo-light, logo-dark, icon) from the knife-i + DIN wordmark.
Outputs to assets/logo/ and mirrors to docs/public/."""
import os, shutil
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FONT = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
font = TTFont(FONT); UPM = font["head"].unitsPerEm; CAP = font["OS/2"].sCapHeight
cmap = font.getBestCmap(); gs = font.getGlyphSet(); hmtx = font["hmtx"]

def extract(text):
    x = 0.0; parts = []; bp = BoundsPen(gs)
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None: x += UPM*0.3; continue
        pen = SVGPathPen(gs); tp = TransformPen(pen, (1,0,0,1,x,0))
        gs[g].draw(tp)
        gs[g].draw(TransformPen(bp, (1,0,0,1,x,0)))
        c = pen.getCommands()
        if c: parts.append(c)
        x += hmtx[g][0]
    return " ".join(parts), x, bp.bounds

d, adv, bounds = extract("18n-sharpen")
S = 100.0/CAP; TX = 23
txt_top = -bounds[3]*S; txt_bot = -bounds[1]*S          # screen-space text extents
def text_path(fill):
    return f'<path d="{d}" transform="translate({TX},0) scale({S:.5f},{-S:.5f})" fill="{fill}"/>'

# layout bounds (knife pommel at -118, guard left -1.5)
minX, minY = -4, -120
right = TX + adv*S
VW = round(right + 6, 1)
VH = round(txt_bot - minY + 4, 1)

GRADS = '''
 <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8FB4CE"/><stop offset="0.42" stop-color="#E3EFF7"/><stop offset="0.5" stop-color="#FBFEFF"/><stop offset="0.58" stop-color="#DCEAF4"/><stop offset="1" stop-color="#9CC0D8"/></linearGradient>
 <linearGradient id="goldG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8D784"/><stop offset="0.5" stop-color="#E7B23F"/><stop offset="1" stop-color="#C98A1E"/></linearGradient>
 <linearGradient id="grip" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2A313C"/><stop offset="0.5" stop-color="#171C24"/><stop offset="1" stop-color="#0E1218"/></linearGradient>
 <linearGradient id="gripD" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#5C6776"/><stop offset="0.5" stop-color="#444E5C"/><stop offset="1" stop-color="#39414D"/></linearGradient>'''

# knife for LIGHT background (ink outlines define edges on white)
KNIFE_LIGHT = '''<g>
  <rect x="4" y="-22" width="10" height="20" rx="2.5" fill="url(#grip)" stroke="#0C1118" stroke-width="1.2"/>
  <path d="M5,-6 L13,-12 M5,-12 L13,-18" stroke="url(#goldG)" stroke-width="1.4" opacity="0.85"/>
  <rect x="-1.5" y="-32" width="21" height="9.5" rx="3" fill="url(#goldG)" stroke="#1B2330" stroke-width="1.6"/>
  <circle cx="9" cy="-27.2" r="1.7" fill="#1B2330" opacity="0.55"/>
  <path d="M4,-31 L14,-31 L14,-86 L8,-100 L4,-80 Z" fill="url(#steel)" stroke="#1B2330" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M5,-34 L5,-78" stroke="#FFFFFF" stroke-width="1.4" opacity="0.75"/>
  <path d="M5,-79 L7.4,-97" stroke="#FFFFFF" stroke-width="1.2" opacity="0.6"/>
  <path d="M12.4,-34 L12.4,-85" stroke="#1B2330" stroke-width="1" opacity="0.16"/>
  <path d="M4.4,-80 L13.6,-86" stroke="#1B2330" stroke-width="1" opacity="0.28"/>
  <polygon points="9,-118 15,-111 9,-104 3,-111" fill="url(#goldG)" stroke="#1B2330" stroke-width="1.2"/>
</g>'''

# knife for DARK background (lighter grip, no dark outlines -> stays visible on dark)
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

def wordmark(fname, knife, textfill, w, h):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{minX} {minY} {VW} {VH}" '
           f'width="{w}" height="{h}" fill="none" role="img" aria-label="i18n-sharpen">\n'
           f'<defs>{GRADS}</defs>\n{knife}\n{text_path(textfill)}\n</svg>\n')
    open(os.path.join(ROOT, fname), "w").write(svg)

# display size (height 64 banner)
H = 64; W = round(H * VW / VH)
wordmark("assets/logo/logo-light.svg", KNIFE_LIGHT, "#1B2330", W, H)
wordmark("assets/logo/logo-dark.svg",  KNIFE_DARK,  "#F4F8FC", W, H)

# icon: dark rounded square + dagger (favicon + hero, works on any theme)
icon = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="64" height="64" '
        f'role="img" aria-label="i18n-sharpen icon">\n<defs>{GRADS}</defs>\n'
        f'<rect x="0" y="0" width="100" height="100" rx="24" fill="#141A24"/>\n'
        f'<g transform="translate(43.8,92) scale(0.71)">{KNIFE_LIGHT}</g>\n</svg>\n')
open(os.path.join(ROOT, "assets/logo/icon.svg"), "w").write(icon)

# nav icons: knife only, transparent bg (navbar: icon + siteTitle pattern)
def nav_icon(fname, knife):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" '
           f'width="28" height="28" role="img" aria-label="i18n-sharpen icon">\n'
           f'<defs>{GRADS}</defs>\n'
           f'<g transform="translate(43.8,92) scale(0.71)">{knife}</g>\n</svg>\n')
    open(os.path.join(ROOT, fname), "w").write(svg)

nav_icon("assets/logo/nav-icon-light.svg", KNIFE_LIGHT)
nav_icon("assets/logo/nav-icon-dark.svg",  KNIFE_DARK)

# mirror to docs/public
for f in ("logo-light.svg", "logo-dark.svg", "icon.svg",
          "nav-icon-light.svg", "nav-icon-dark.svg"):
    shutil.copy(os.path.join(ROOT, "assets/logo", f), os.path.join(ROOT, "docs/public", f))

print(f"viewBox: {minX} {minY} {VW} {VH}")
print(f"banner W x H = {W} x {H}  (README aspect)")
print("wrote assets/logo/{logo-light,logo-dark,icon,nav-icon-light,nav-icon-dark}.svg + mirrored to docs/public/")
