# Stack Research

**Domain:** Parser stack for a per-framework AST i18n scanner (replacing a regex/state-machine engine) in a tiny-dependency TypeScript ESM CLI
**Researched:** 2026-05-31
**Confidence:** MEDIUM-HIGH — ecosystem facts and APIs are HIGH confidence; exact latest version numbers should be re-verified via Context7 at plan-phase (compiler-version pinning is itself a planned research item).

> ⚠️ **This document revises the seed plan's dependency choice.** The seed mandates `@babel/parser` + `@babel/traverse` (~4.7 MB) as direct deps. Independent PITFALLS research found `@babel/traverse`'s ESM `.default` interop to be the single highest crash risk of the milestone. The recommendation below therefore moves the parser to the **TypeScript Compiler API as a workspace peer dependency** (primary) with a **slim `@babel/parser`-only fallback** (no `@babel/traverse`). **This is a recommendation to ratify at the requirements/discuss step**, since it changes the seed's stated stance (handoff open decision #1).

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **`typescript` (Compiler API)** — workspace peer dep | `>=5.0` (project already on `^5.9.3`) | Parse `.ts/.tsx/.js/.jsx` to an AST via `ts.createSourceFile` (parser only — **no** `Program`/type-checker) and walk with `ts.forEachChild` | A TS-first i18n tool's users overwhelmingly already have `typescript` installed ⇒ **~0 added bundle weight on the common path**. Native TS + JSX/TSX with no plugin config. No ESM `.default` interop trap. Stable, exhaustively documented AST. Consistent with the established `createRequire` dynamic-load pattern (the same one used for `jiti` and for the Vue/Svelte/Astro compilers this milestone adds). |
| **`@vue/compiler-sfc`** (+ `@vue/compiler-dom`) — workspace peer dep | `^3.4` (Vue 3.x) | `.vue` SFC: `parse()` splits blocks; `@vue/compiler-dom` `compile()` yields a traversable template AST | Official Vue SFC tooling; ships with every Vue 3 project. Loaded from the user's workspace, never bundled. |
| **`svelte` (`svelte/compiler`)** — workspace peer dep | `^5.0` primary; gate for `^4.0` legacy | `.svelte`: `parse(source, { modern: true })` → `ast.fragment` (Svelte 5); legacy `ast.html` (Svelte 4) | Official compiler; ships with every Svelte project. **Svelte 5 changed the AST shape** — must pass `{ modern: true }` and read `ast.fragment`; version-gate for v4. |
| **`@astrojs/compiler`** — workspace peer dep | `^2.x` | `.astro`: `parse()` splits frontmatter + HTML body | Official Astro compiler. **WASM, async init** — must `await` initialization before/at first parse and serialize the first call. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **`@babel/parser`** (fallback path only) | `^7.27` | Parse `.ts/.tsx/.js/.jsx` when `typescript` is **not** resolvable in the user's workspace (plain-JS projects with no TS) | Only if shipping the bundled fallback. ~1.8 MB. Configure `plugins: ["jsx","typescript","decorators-legacy"]`, `errorRecovery: true`. |
| **`@babel/types`** (fallback path only) | `^7.27` | Hand-walk the Babel AST via `traverseFast` instead of `@babel/traverse` | Pairs with the `@babel/parser` fallback to **avoid `@babel/traverse` entirely** (the ESM `.default` crash). Read-only visitor ⇒ a hand-walk is sufficient. |
| `node:module` `createRequire` | built-in | Resolve peer compilers from the user's `cwd` `node_modules` | All dynamic loads (`typescript`, `@vue/compiler-sfc`, `svelte/compiler`, `@astrojs/compiler`). Already the project's established pattern. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `vitest bench` | Perf-regression gate vs the v0.3.0 regex baseline | Gate: AST path ≤ 100 ms over baseline on a fixed 50-file fixture corpus (PROJECT.md performance constraint). |
| `tsup` (existing) | ESM bundle | If the Babel fallback is bundled, watch the reported bundle size in CI (alert > ~3 MB). With TS-API-as-peer-dep, the bundle barely grows. |
| Context7 (plan-phase) | Verify exact current versions + AST shapes before pinning | Compiler-version pinning is a deliberate plan-phase task (handoff open decision #2). |

## Installation

The CLI itself adds **no mandatory heavy runtime deps** under the primary recommendation. Parsers are resolved from the user's workspace:

```bash
# CLI runtime deps (unchanged tiny tree) — nothing heavy added on the common path
# commander, picocolors, yaml, zod  (already present)

# Users install only the compilers for the frameworks/languages they actually scan
# (resolved dynamically from their workspace; missing → actionable I18nSharpenError):
npm install -D typescript                 # .ts/.tsx/.js/.jsx  (almost always already present)
npm install -D @vue/compiler-sfc          # .vue
npm install -D svelte                     # .svelte
npm install -D @astrojs/compiler          # .astro

# Fallback path ONLY (if you choose to bundle a parser for no-typescript JS projects):
npm install @babel/parser @babel/types    # ~1.8MB; NO @babel/traverse
```

`package.json` should declare these as **`peerDependencies` + `peerDependenciesMeta.optional: true`** (mirroring how `jiti` is treated), not as `dependencies`.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| TS Compiler API (peer) for JS/TS/JSX | **Seed's `@babel/parser` + `@babel/traverse` (direct deps, ~4.7 MB)** | Only if you must support plain-JS projects that have **no** `typescript` AND want a single bundled path AND accept the bundle hit + `traverse` ESM unwrap. Even then, prefer the slim fallback below over `@babel/traverse`. |
| TS Compiler API (peer) | **`@babel/parser` + `@babel/types` hand-walk (no traverse), bundled** (~1.8 MB) | Strong single-path choice if you do **not** want a `typescript` peer requirement. One code path, no peer friction, avoids the `traverse` trap. This is the recommended **fallback** and an acceptable primary if the team prefers zero peer deps for JS. |
| Per-framework official compilers (Vue/Svelte/Astro) | Generic HTML parsers (`parse5`, `htmlparser2`) | Never for these frameworks — they don't understand SFC/`{#each}`/frontmatter semantics or script boundaries. Official compilers only. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`@babel/traverse`** | ESM `.default` interop crash (`TypeError: traverse is not a function`) under native ESM + `tsup`; the milestone's #1 documented runtime trap; also drags in `@babel/types` (~2.5 MB) for ~4.7 MB total | TS Compiler API `forEachChild` (primary), or `@babel/types` `traverseFast` hand-walk (fallback). Read-only visiting needs no full traverse. |
| **Babel as a hard `dependency`** | ~4.7 MB on every install, including JSON-only users who never touch a `.ts` file; contradicts the (revised but still real) tiny-dep ethos | Workspace peer-dep resolution; lazy-load the parser only on first JS/TS file. |
| **`ts.createProgram` / type-checker** | Orders of magnitude slower (whole-program type resolution); the scanner needs syntax only | `ts.createSourceFile(name, text, target, /*setParentNodes*/ true, scriptKind)` — parser only, fast. |
| **Regex fallback after cutover** | Two engines to maintain; defeats the rewrite | Collect-and-continue error model; delete regex only after shadow-mode parity (separate phase). |
| **Bundling framework compilers** | Vue/Svelte/Astro compilers are large and version-coupled to the user's project | Always dynamic-load from the user's workspace via `createRequire`. |

## Stack Patterns by Variant

**If the project has `typescript` in its workspace (the common case for this tool):**
- Use the TS Compiler API path. Zero added bundle weight. `ScriptKind.TSX` for `.tsx`/`.jsx`, `ScriptKind.TS` for `.ts`, `ScriptKind.JS`/`JSX` for `.js`/`.jsx`.
- Offsets: `node.getStart(sourceFile)` / `node.end` are absolute into the SourceFile text — rebase embedded blocks by adding the block start offset (same as Babel).

**If the project is plain JS with no `typescript`:**
- Either require `typescript` as a peer (actionable error), or use the bundled slim-Babel fallback (`@babel/parser` + `@babel/types` hand-walk, no traverse).
- Decide ONE of these at requirements to avoid maintaining two JS parsers indefinitely.

**If scanning `.vue/.svelte/.astro`:**
- Dynamic-load the framework compiler from the workspace; extract the embedded `<script>` content and feed it to the **same** JS/TS parser used above; rebase offsets by the block's start offset.
- Svelte: version-gate `{ modern: true }`/`ast.fragment` (v5) vs `ast.html` (v4).
- Astro: `await` the WASM init; serialize the first parse.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `typescript >=5.0` | Node ≥ 20, ESM | `ts.createSourceFile` API stable across 4.5→5.x; JSX/TSX supported via `ScriptKind`. Project already on `^5.9.3`. |
| `@vue/compiler-sfc ^3.4` | `@vue/compiler-dom` same minor | Keep both in lockstep; both ship with `vue@3`. |
| `svelte ^5` | `{ modern: true }` → `ast.fragment` | Svelte 4 uses `ast.html`; detect major version after dynamic import and branch. Svelte 6 will make `modern` the default. |
| `@astrojs/compiler ^2` | async WASM init | `parse()` is async; cache an init promise; do not call concurrently before first `await` resolves. |
| `@babel/parser ^7.27` (fallback) | `@babel/types ^7.27` | Keep `@babel/*` versions aligned; do **not** add `@babel/traverse`. |

## Decision Summary (for requirements/discuss)

1. **JS/TS/JSX parser:** ✅ Recommend **TypeScript Compiler API (workspace peer dep)** primary; **slim `@babel/parser` + `@babel/types` hand-walk** as the bundled fallback for no-TS projects. ❌ Reject seed's `@babel/traverse`. *(Ratify — this changes the seed.)*
2. **Framework compilers:** ✅ Dynamic-load `@vue/compiler-sfc`+`@vue/compiler-dom` (3.x), `svelte/compiler` (5.x, gate 4.x), `@astrojs/compiler` (2.x) from the workspace. Unchanged from seed in spirit.
3. **Dependency declaration:** ✅ All compilers as **optional `peerDependencies`** (like `jiti`), not `dependencies`.
4. **Version pinning:** Defer exact pins to plan-phase Context7 verification (handoff open decision #2).

## Sources

- `.planning/research/PITFALLS.md` — `@babel/traverse` ESM `.default` crash (babel#13093, #15269); Svelte 5 `fragment` vs `html`; Astro WASM init; Vue `scriptSetup`/template compile; `babel-walk`/`astray` faster alternatives.
- `.planning/research/ARCHITECTURE.md` — offset rebasing, parse pool, error model, dynamic-load `createRequire` pattern.
- `.planning/v0.4.0-SEED-PLAN.md` — seed dependency strategy (Babel mandatory) + bundle-size warning (~4.7 MB).
- `.planning/PROJECT.md` / `.planning/STATE.md` — tiny-dep constraint (revised), `jiti` optional-peer precedent, review note #5 (reconsider Babel deps; TS Compiler API as peer).
- TypeScript Compiler API (`ts.createSourceFile`, `forEachChild`, `ScriptKind`) — to re-verify exact current version at plan-phase via Context7.

---
*Stack research for: i18n-sharpen v0.4.0 AST Parser Rewrite*
*Researched: 2026-05-31*
