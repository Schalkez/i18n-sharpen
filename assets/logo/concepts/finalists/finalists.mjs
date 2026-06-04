// Render the 3 dark finalists as full horizontal lockups (icon + wordmark).
// Lockup reads "i18n" (badge) + "-sharpen" (wordmark) = i18n-sharpen.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const __dir = dirname(fileURLToPath(import.meta.url));

const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

const FINALISTS = [
  { id: "ink-amber", label: "Ink / Amber",   s1: "#1E293B", s2: "#0F172A", accent: "#F59E0B", badgeText: "#F8FAFC" },
  { id: "mono",      label: "Mono",          s1: "#111114", s2: "#27272A", accent: "#FFFFFF", badgeText: "#FFFFFF" },
  { id: "dracula",   label: "Dracula",       s1: "#282A36", s2: "#1E1F29", accent: "#FF79C6", badgeText: "#F8F8F2" },
];

// icon block (0..64): badge + "i18n" + blade
const icon = (p) => `<defs><linearGradient id="g" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${p.s1}"/><stop offset="1" stop-color="${p.s2}"/></linearGradient></defs>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#g)"/>
  <text x="32" y="38" text-anchor="middle" font-family="${FONT}" font-size="23" font-weight="800" letter-spacing="-0.5" fill="${p.badgeText}">i<tspan fill="${p.accent}">18</tspan>n</text>
  <polygon points="14,45 50,47.5 14,50" fill="${p.accent}"/>`;

// lockup: icon + "-sharpen" wordmark in `wordColor`
const lockup = (p, wordColor) => `<svg xmlns="http://www.w3.org/2000/svg" width="250" height="64" viewBox="0 0 250 64" fill="none" role="img" aria-label="i18n-sharpen">
  ${icon(p)}
  <text x="76" y="42" font-family="${FONT}" font-size="27" font-weight="700" letter-spacing="-0.5" fill="${wordColor}">-sharpen</text>
</svg>
`;

for (const p of FINALISTS) {
  writeFileSync(join(__dir, `${p.id}-light.svg`), lockup(p, "#0F172A"));
  writeFileSync(join(__dir, `${p.id}-dark.svg`),  lockup(p, "#F8FAFC"));
}

const row = (p) => `    <div class="col">
      <img class="lk" src="${p.id}-LK.svg" alt="">
      <div class="name">${p.label}</div>
    </div>`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>i18n-sharpen — finalist lockups</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;margin:0}
  .panel{padding:48px}.light{background:#fff;color:#0F172A}.dark{background:#0B1020;color:#F8FAFC}
  h2{font-size:13px;letter-spacing:1px;text-transform:uppercase;opacity:.6;margin:0 0 28px}
  .col{display:flex;flex-direction:column;gap:10px;margin-bottom:36px}
  .lk{height:52px;align-self:flex-start}.name{font-weight:700;font-size:13px;opacity:.7}
</style></head><body>
<div class="panel light"><h2>Finalist lockups — light background</h2>
${FINALISTS.map(p => row(p).replace("-LK.svg", "-light.svg")).join("\n")}
</div>
<div class="panel dark"><h2>Finalist lockups — dark background</h2>
${FINALISTS.map(p => row(p).replace("-LK.svg", "-dark.svg")).join("\n")}
</div>
</body></html>
`;
writeFileSync(join(__dir, "finalists.html"), html);
console.log("Generated 3 finalists × 2 backgrounds + finalists.html");
