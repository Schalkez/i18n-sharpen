#!/usr/bin/env python3
"""Build the final i18n-sharpen logo set (text outlined to paths -> portable)."""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf"
OUT = os.path.join(os.path.dirname(__file__), "..", "logos", "final")
os.makedirs(OUT, exist_ok=True)

font = TTFont(FONT)
UPM = font["head"].unitsPerEm
CAP = font["OS/2"].sCapHeight          # 712
cmap = font.getBestCmap()
gs = font.getGlyphSet()
hmtx = font["hmtx"]

def extract(text, tracking=0.0):
    x = 0.0; parts = []
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None:
            x += UPM * 0.3; continue
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (1, 0, 0, 1, x, 0)))
        c = pen.getCommands()
        if c: parts.append(c)
        x += hmtx[g][0] + tracking
    return " ".join(parts), x

S = 100.0 / CAP            # scale so cap height = 100 user units
TX = 23                    # kern gap knife -> text

DEFS = '''<defs>
 <linearGradient id="steel" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#8FB4CE"/><stop offset="0.42" stop-color="#E3EFF7"/><stop offset="0.5" stop-color="#FBFEFF"/><stop offset="0.58" stop-color="#DCEAF4"/><stop offset="1" stop-color="#9CC0D8"/>
 </linearGradient>
 <linearGradient id="goldG" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#F8D784"/><stop offset="0.5" stop-color="#E7B23F"/><stop offset="1" stop-color="#C98A1E"/>
 </linearGradient>
 <linearGradient id="grip" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#2A313C"/><stop offset="0.5" stop-color="#171C24"/><stop offset="1" stop-color="#0E1218"/>
 </linearGradient>
</defs>'''

KNIFE = '''<g>
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

KNIFE_MONO = '''<g fill="{c}">
  <rect x="4" y="-22" width="10" height="20" rx="2.5"/>
  <rect x="-1.5" y="-32" width="21" height="9.5" rx="3"/>
  <path d="M4,-31 L14,-31 L14,-86 L8,-100 L4,-80 Z"/>
  <polygon points="9,-118 15,-111 9,-104 3,-111"/>
  <g stroke="{bg}" stroke-width="1.4" fill="none">
    <path d="M-1.5,-22.6 L19.5,-22.6"/><path d="M-1.5,-31.6 L19.5,-31.6"/>
  </g>
</g>'''

def text_path(d, fill, tx=TX):
    return f'<path d="{d}" transform="translate({tx},0) scale({S:.5f},{-S:.5f})" fill="{fill}"/>'

def write(name, vb, body, w=None, h=None):
    x, y, ww, hh = vb
    wa = f' width="{w}"' if w else ''
    ha = f' height="{h}"' if h else ''
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {ww} {hh}"{wa}{ha}>\n'
           f'{DEFS}\n{body}\n</svg>\n')
    with open(os.path.join(OUT, name), "w") as f:
        f.write(svg)
    print("wrote", name)

# --- metrics ---
d_full, adv_full = extract("18n-sharpen")
d_18n, adv_18n = extract("18n")
W_full = TX + adv_full * S          # right edge of full lockup
W_18n = TX + adv_18n * S
DESC = 36                            # descender room below baseline (p)
TOP = -120                           # pommel room

# 1) LOCKUP (primary, light bg)
write("lockup.svg",
      (-8, TOP, W_full + 16, (DESC - TOP)),
      KNIFE + "\n" + text_path(d_full, "#1B2330"))

# 2) LOCKUP MONO (single ink)
write("lockup-mono.svg",
      (-8, TOP, W_full + 16, (DESC - TOP)),
      KNIFE_MONO.format(c="#1B2330", bg="#FFFFFF") + "\n" + text_path(d_full, "#1B2330"))

# 3) COMPACT MARK (i18n) - Square 1:1 ratio with padding
W_mark = W_18n + 16
H_mark = DESC - TOP
size_mark = max(W_mark, H_mark) + 52
cx_mark = -8 + W_mark / 2
cy_mark = TOP + H_mark / 2
write("mark.svg",
      (cx_mark - size_mark / 2, cy_mark - size_mark / 2, size_mark, size_mark),
      KNIFE + "\n" + text_path(d_18n, "#1B2330"))

# 4) APP ICON DARK
icon_knife = '<g transform="translate(43.8,92) scale(0.71)">' + KNIFE + '</g>'
write("icon-dark.svg", (0, 0, 100, 100),
      '<rect x="0" y="0" width="100" height="100" rx="24" fill="#141A24"/>\n' + icon_knife,
      w=256, h=256)

# 5) APP ICON LIGHT
write("icon-light.svg", (0, 0, 100, 100),
      '<rect x="0" y="0" width="100" height="100" rx="24" fill="#EEF3F8" stroke="#DDE4EC" stroke-width="1.5"/>\n' + icon_knife,
      w=256, h=256)

# 6) FAVICON (simplified knife, chunky, no fine hairlines)
FAV = '''<g transform="translate(43.8,92) scale(0.74)">
  <rect x="3" y="-23" width="12" height="22" rx="2.5" fill="#171C24"/>
  <rect x="-3" y="-33" width="24" height="11" rx="3" fill="url(#goldG)" stroke="#1B2330" stroke-width="1.6"/>
  <path d="M3.5,-32 L14.5,-32 L14.5,-86 L8,-101 L3.5,-79 Z" fill="url(#steel)" stroke="#1B2330" stroke-width="2.4" stroke-linejoin="round"/>
  <polygon points="9,-119 16,-111 9,-103 2,-111" fill="url(#goldG)" stroke="#1B2330" stroke-width="1.4"/>
</g>'''
write("favicon.svg", (0, 0, 100, 100), FAV, w=64, h=64)

print(f"\nS={S:.5f}  TX={TX}  W_full={W_full:.1f}  W_18n={W_18n:.1f}")
