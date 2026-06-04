// Palette generator for the C1 "i18n + blade" lettermark.
// Edit the PALETTES array and re-run:  node generate.mjs
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));

// id, label, badge gradient stop1, stop2, accent (for "18" + blade), text color
// Trimmed to the 3 chosen finalists (ink-amber primary, mono utility, dracula alt).
const PALETTES = [
  { id: "ink-amber",   label: "Ink / Amber (terminal)",  s1: "#1E293B", s2: "#0F172A", accent: "#F59E0B", text: "#F8FAFC" },
  { id: "dracula",     label: "Dracula (editor)",        s1: "#282A36", s2: "#1E1F29", accent: "#FF79C6", text: "#F8F8F2" },
  { id: "mono-dark",   label: "Mono — dark",             s1: "#111114", s2: "#27272A", accent: "#FFFFFF", text: "#FFFFFF" },
  { id: "mono-light",  label: "Mono — light",            s1: "#F1F5F9", s2: "#E2E8F0", accent: "#0F172A", text: "#0F172A" },
];

const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

function svg(p) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none" role="img" aria-label="i18n-sharpen ${p.label}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${p.s1}"/><stop offset="1" stop-color="${p.s2}"/></linearGradient></defs>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#g)"/>
  <text x="32" y="38" text-anchor="middle" font-family="${FONT}" font-size="23" font-weight="800" letter-spacing="-0.5" fill="${p.text}">i<tspan fill="${p.accent}">18</tspan>n</text>
  <polygon points="14,45 50,47.5 14,50" fill="${p.accent}"/>
</svg>
`;
}

for (const p of PALETTES) writeFileSync(join(__dir, `${p.id}.svg`), svg(p));

const card = (p) => `      <div class="col"><div class="sizes"><img class="s96" src="${p.id}.svg"><img class="s32" src="${p.id}.svg"><img class="s16" src="${p.id}.svg"></div><div class="name">${p.label}</div><div class="hex">${p.s1} ${p.s2} · ${p.accent}</div></div>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>i18n-sharpen — palette options</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0}
  .panel{padding:40px}.light{background:#fff;color:#0F172A}.dark{background:#0B1020;color:#F8FAFC}
  h2{font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.6;margin:0 0 24px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:40px}
  .col{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}
  .sizes{display:flex;align-items:flex-end;gap:14px}
  .name{font-weight:700;font-size:13px}.hex{font-size:10px;opacity:.55;font-family:ui-monospace,monospace}
  img.s96{width:96px}img.s32{width:32px}img.s16{width:16px}
</style></head><body>
<div class="panel light"><h2>${PALETTES.length} palettes — light background</h2><div class="grid">
${PALETTES.map(card).join("\n")}
</div></div>
<div class="panel dark"><h2>${PALETTES.length} palettes — dark background</h2><div class="grid">
${PALETTES.map(card).join("\n")}
</div></div>
</body></html>
`;
writeFileSync(join(__dir, "palettes.html"), html);
console.log(`Generated ${PALETTES.length} palette SVGs + palettes.html`);
