# Feature Research

**Domain:** AST-based i18n key scanner (replacing a regex engine) for JS/TS/Vue/Svelte/Astro
**Researched:** 2026-05-31
**Confidence:** HIGH — features are derived from the existing shipped behavior (parity targets) + the seed/handoff; the scanner contract is fully known from source.

> This is a **rewrite-to-parity-plus**, not a greenfield feature set. "Table stakes" = everything the v0.3.0 regex scanner already does, which the AST engine must match before it can become the default. "Differentiators" = the accuracy/correctness wins that justify the rewrite. The shadow-mode differential harness is how parity-plus is *proven*.

---

## Feature Landscape

### Table Stakes (Parity — the AST engine must match the regex engine before cutover)

Missing any of these = a regression, not just an incomplete feature.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Static used-key extraction — `t("key")` calls matching configured `matchFunctions` | Core of `validate`/`extract`/`prune` | LOW | Babel/TS: `CallExpression` whose callee matches a configured name; first arg a static string literal. |
| Attribute key extraction — `i18nKey="..."` matching configured `matchAttributes` | Already shipped (JSX + framework templates) | MEDIUM | JSX `JSXAttribute` string value; framework templates via their compiler AST. |
| Dynamic-call classification — fully-dynamic (`t(x)`) vs structured-concat (`t("p."+x)`) | Shipped in v0.3.0; feeds `ignoreDynamicKeys` + report counts, must not pollute missing-key failures | MEDIUM | Non-static first arg ⇒ capture raw expression text + classify. AST makes this exact (node type), replacing brittle regex. |
| Hardcoded-text candidates — JSXText + `placeholder/title/alt/aria-label/label` attrs | Shipped (`validate --check-hardcoded`) | MEDIUM | `JSXText`/template text nodes + the specific attribute set. Must respect `isHardcodedIgnored`. |
| Framework coverage — `.ts/.tsx/.js/.jsx/.vue/.svelte/.astro` | Shipped contract; cannot drop any extension | HIGH | Per-framework compiler dispatch; embedded `<script>` reuses the JS/TS parser. |
| Correct offsets → line numbers | Reports/CLI output point at real lines | MEDIUM | **Offset rebasing** for embedded blocks (PITFALLS #6); reuse existing `lines.ts`. |
| `fileContents` preserved for `looseKeyMatch` | `validate.ts` fuzzy fallback uses `String.includes` over stripped content | LOW | `stripComments(raw)` still runs independently of the AST pass (PITFALLS #8). |
| Config-driven detection (`matchFunctions`/`matchAttributes`) | No hardcoded i18n-function names — the project's framework-agnostic promise | LOW | Mechanism unchanged; only the engine under it changes. |
| Namespaced keys — `t("ns:key.path")` | Shipped read/validate/write-routing | LOW | Key string handling unchanged; AST only changes how the string is *found*. |
| CI-safe behavior — one bad file must not abort the run | "CI-friendly" constraint | MEDIUM | Collect-and-continue (PITFALLS #7); only missing-compiler is fatal. |

### Differentiators (Why the rewrite is worth a breaking change)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Near-100% extraction accuracy via real parsing** | Eliminates the unconvergent edge-case patch treadmill (`<Foo.Bar>`, `forwardRef<A,B>`) | HIGH | The core thesis. A context-free grammar parsed by a real parser, not pattern-matched. |
| **Two golden correctness cases** | Concrete proof regex couldn't, AST can | MEDIUM | (A) `<m.div>` dot-notation tags still extract inner text; (B) `forwardRef<HTMLInputElement, InputProps>(...)` generics never parsed as JSX. Must be named tests before cutover (PITFALLS Golden A/B). |
| **Single-pass unified `ParsedFileResult`** | One traversal yields used keys + dynamic calls + hardcoded candidates; replaces 3–4 separate regex passes per file | MEDIUM | `{ usedKeys, dynamicCalls, hardcodedCandidates }`, all offsets document-absolute. |
| **Shadow-mode differential-accuracy harness** | The ONLY way "near-100%" is actually verified — normal "phase complete" checks can't prove it | HIGH | AST behind a flag; diff vs regex over a corpus; triage to parity-or-better; flip default only on zero false-negatives. **The #1 verification requirement.** |
| **Bounded-concurrency parse pool (async as a perf win)** | Turn the forced sync→async migration into a speed gain, not a regression | MEDIUM | Cap ~4 concurrent parses; lazy-load parser on first JS/TS file; perf gate ≤100 ms vs v0.3.0. |
| **Actionable missing-compiler errors** | `.vue` without `@vue/compiler-sfc` → exact install command, not a stack trace | LOW | Fatal, `kind:"config"`; consistent with existing `I18nSharpenError`. |

### Anti-Features (Commonly tempting here, but out of scope)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Full type-checking (`ts.createProgram`) | "We already have the TS API" | Whole-program type resolution is orders of magnitude slower; breaks the sub-second budget | Parser-only `createSourceFile`; syntax is all the scanner needs. |
| Auto-fix / codemod (wrap hardcoded strings in `t()`) | Natural "next step" once you have the AST | Writing source files is high-risk; violates "no writing to `.ts/.js`" safety contract | Stay detection-only; report candidates. |
| Auto-detecting i18n functions (heuristic key inference) | "Find keys without config" | Guessy, framework-specific, false positives; breaks framework-agnostic promise | Keep `matchFunctions`/`matchAttributes` config-driven. |
| Permanent regex fallback alongside AST | "Safety net" | Two engines forever; defeats the rewrite; double maintenance | Shadow-mode to prove parity, then delete regex (separate phase). |
| Runtime/Program-wide cross-file key resolution | "Resolve `t(prefix + key)` by following variables" | Requires type-flow/data-flow analysis; unbounded scope | Classify as dynamic (structured-concat) and report, as today. |
| New built-in framework detectors beyond the 5 extensions | "Add Angular/Marko/etc." | Scope creep; each is a compiler + AST shape + tests | Defer; the dispatcher makes future additions cheap, but not this milestone. |

## Feature Dependencies

```
Config-driven detection (matchFunctions/matchAttributes)
    └──feeds──> Static used-key extraction
                    └──same traversal──> Dynamic-call classification
                    └──same traversal──> Hardcoded-text candidates
                         └──all emit──> ParsedFileResult (document-absolute offsets)
                                            └──requires──> Offset rebasing (embedded blocks)
                                            └──consumed by──> validate / extract / prune (async)

JS/TS parser (TS Compiler API or slim Babel)
    └──reused by──> Vue parser ──> Svelte parser ──> Astro parser  (each: compiler + script delegation)

Async migration (detectUsedKeys → commands → public API → cli)
    └──enables──> Bounded-concurrency parse pool ──> Perf gate

Shadow-mode flag + differential harness
    └──gates──> Default flip
                   └──gates (later, separate phase)──> Delete regex code + port tests
```

### Dependency Notes

- **Hardcoded detection requires the parser, not regex:** it needs to know which element/attribute a text node sits in — the original trigger for the whole rewrite.
- **Framework parsers require the JS/TS parser first:** every embedded `<script>` block delegates to it; build the JS/TS parser before the framework ones.
- **Default flip requires the shadow harness:** never flip on faith; flip on a zero-false-negative corpus diff.
- **Delete requires the flip:** removing `regex.ts`/`dynamic.ts`/`hardcoded.ts`/`scanner.ts` shim is a *separate, later* phase (ARCHITECTURE build order F). Tests are **ported**, not deleted.

## MVP Definition

### Launch With (the milestone's "done")

- [ ] JS/TS/JSX parser producing `ParsedFileResult` with the two golden cases passing — *the accuracy proof*
- [ ] Vue + Svelte (5, gate 4) + Astro parsers with correct offset rebasing — *parity coverage*
- [ ] Collect-and-continue error model + fatal actionable missing-compiler — *CI safety*
- [ ] Async migration of `validate`/`extract`/`prune` + public API + `cli.ts`, `fileContents` preserved — *the breaking change, done safely*
- [ ] Bounded-concurrency pool + perf gate ≤100 ms vs v0.3.0 — *no speed regression*
- [ ] Shadow-mode flag + differential harness proving parity on a real corpus, then default flip — *the verification gate*
- [ ] Ported behavioral tests (incl. golden A/B) green with AST as default

### Add After Validation (follow-up phase, same milestone)

- [ ] Delete `regex.ts`/`dynamic.ts`/`hardcoded.ts`/`scanner.ts` shim; remove shadow flag — *trigger: default flipped + corpus parity*
- [ ] BREAKING CHANGELOG: async API, bundle/peer-dep notes, per-framework install instructions

### Future Consideration (later milestones)

- [ ] Optional mtime/hash parse cache — *trigger: perf complaints on very large repos*
- [ ] `--strict-syntax` exit-code mode (parse errors fail CI) — *trigger: user demand*

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| JS/TS parser + golden cases | HIGH | HIGH | P1 |
| Framework parsers + offset rebasing | HIGH | HIGH | P1 |
| Collect-and-continue error model | HIGH | MEDIUM | P1 |
| Async migration (+ `fileContents` preserved) | HIGH | MEDIUM | P1 |
| Shadow-mode differential harness | HIGH | HIGH | P1 |
| Bounded-concurrency pool + perf gate | MEDIUM | MEDIUM | P1 |
| Delete regex + port tests (separate phase) | MEDIUM | MEDIUM | P2 |
| mtime/hash parse cache | LOW | MEDIUM | P3 |

## Shadow-Mode / Differential-Accuracy Approach (how parity is proven)

A standalone script (e.g. `scripts/shadow-compare.ts`, outside the unit suite) that:
1. Runs `detectUsedKeys` with `useAst:false` (regex) and `useAst:true` (AST) over the **same** corpus.
2. Diffs the `usedKeys` sets (and, ideally, dynamic + hardcoded candidate sets) per file.
3. Reports **false-negatives** (keys regex found but AST missed — must reach **zero**) and **AST-only gains** (keys AST found that regex missed — expected, the upside).
4. Triages every divergence to "parity-or-better"; the zero-false-negative result **gates the default flip**.

### Differential corpus candidates (per framework)

Repo fixtures plus ≥1 real OSS project per framework (verify license + i18n usage at plan-phase; pin commit SHAs for determinism):

| Framework | Corpus candidates |
|-----------|-------------------|
| React/TS (JSX/TSX) | The project's own `src/` fixtures; a mid-size OSS app using `react-i18next` / `next-intl` (e.g. an `i18next` example app). Must include `forwardRef<...>` generics and `<motion.div>`-style dot-notation tags. |
| Vue 3 | An OSS app using `vue-i18n` with both `<script setup>` and Options API SFCs. |
| Svelte 5 | An OSS app using `svelte-i18n` / `paraglide`, confirmed on Svelte 5 (modern AST). Add one Svelte 4 fixture for the version gate. |
| Astro | An OSS Astro site using `astro-i18n` / `astro-i18next` with frontmatter + templated text. |

Keep a small hand-curated fixture set in-repo for deterministic CI; use the OSS projects as a one-time/periodic accuracy audit, not a CI dependency.

## Sources

- Existing shipped behavior (parity targets): `src/core/scanner/*`, `src/commands/{validate,extract,prune}.ts`, `MILESTONES.md` (v0.2–v0.3 feature list).
- `.planning/research/ARCHITECTURE.md` — `ParsedFileResult`, single-pass data flow, shadow-mode build order, parse pool.
- `.planning/research/PITFALLS.md` — golden cases A/B, collect-and-continue, `fileContents`/`looseKeyMatch`, perf gate.
- `.planning/v0.4.0-SEED-PLAN.md` + `.planning/STATE.md` — feature scope, review notes #1–#7.
- i18n ecosystem conventions (`react-i18next`, `vue-i18n`, `svelte-i18n`, `astro-i18n`) for corpus selection — verify specifics at plan-phase.

---
*Feature research for: i18n-sharpen v0.4.0 AST Parser Rewrite*
*Researched: 2026-05-31*
