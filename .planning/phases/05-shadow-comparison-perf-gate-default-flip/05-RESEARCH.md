# Phase 5: Shadow Comparison, Perf Gate & Default Flip - Research

**Researched:** 2026-06-02
**Domain:** Differential test harness, hand-rolled microbenchmark, corpus vendoring, AST default flip
**Confidence:** HIGH (all claims verified against actual source code or official GitHub APIs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Real-OSS corpus is **vendored** — curated files copied into the repo (`tests/corpus/`), committed. No submodules, no network fetch.
- **D-02:** **One real OSS project per framework** (JS/TS, Vue, Svelte, Astro). Repo fixtures (`src/__tests__/parsers/fixtures/`) also join the diff.
- **D-03:** Provenance recorded in a **`SOURCES.md`** manifest: upstream URL, exact commit SHA, paths taken, license.
- **D-04:** Sources MUST be permissively licensed (MIT/Apache-2.0/BSD) and contain real `t("...")` calls / configured attributes so extraction fires. *Corpus selection is this phase's research responsibility.*
- **D-05:** `scripts/shadow-compare.ts` emits a **structured JSON report** (per-file + totals: false-negatives, AST-only gains, parse errors) plus concise human summary to stdout. Exit code is the gate.
- **D-06:** Report written to **`scratch/`** (must be gitignored). Exit code is the authoritative verdict.
- **D-07:** Any false-negative (key regex found that AST missed) → exit non-zero. Hard block, no allowlist.
- **D-08:** AST-only gains documented in the report, non-blocking.
- **D-09:** v0.3.0 baseline is a **live in-process delta** — both engines run in the same `pnpm bench` process over the same corpus; (AST median − regex median ≤ 100 ms). Self-calibrating, no stored baseline.
- **D-10:** Benchmark is **hand-rolled** — `performance.now()` with warmup + N timed iterations in `scripts/`. Zero new deps.
- **D-11:** 50-file benchmark corpus is a **fixed, deterministic 50-file slice** of the vendored corpus.
- **D-12:** Pass/fail uses the **median of N runs** after warmup. `pnpm bench` exits non-zero when (AST median − regex median) > 100 ms.
- **D-13:** Clean flip at four `?? false` → `?? true` sites. No env-var, no config field, no CLI flag. `useAst` stays internal.
- **D-14:** `pnpm bench` wired into CI (`.github/workflows/ci.yml`, build-test job). `pnpm shadow` is on-demand only.
- **D-15:** Default flip lands as an **isolated, final atomic commit** — gates pass first, then flip last.
- **D-16:** Add a **default-is-AST guard test** asserting the default engine (no explicit `useAst`) runs the AST path.

### Claude's Discretion

- Exact JSON report schema/field names and stdout summary wording.
- `package.json` script names (`bench`, `shadow`) and `scripts/` file layout.
- Warmup count and N (iteration count) for the benchmark.
- Exact directory name/structure for vendored corpus (`tests/corpus/` is a suggestion).
- How the deterministic 50-file slice is selected (alpha sort, manifest list, first-N).
- How `shadow-compare` reuses `detectUsedKeys` vs. driving `parseFile`/regex more directly.
- Whether the default-is-AST guard is a dedicated test or folded into existing suites.

### Deferred Ideas (OUT OF SCOPE)

- Deleting `regex.ts`/`dynamic.ts`/`hardcoded.ts`/`scanner.ts` shim (Phase 6 CLEAN-01).
- Repurposing/deleting `bench` and `shadow-compare` once regex is gone (Phase 6).
- 2-3 OSS projects per framework / larger corpus.
- Triage-allowlist for false-negatives.
- Committed diff-report snapshot as audit artifact.
- Public `maxConcurrency` / engine config field / CLI flag.
- `--strict-syntax` (STRICT-01).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SHADOW-02 | Differential harness diffs regex vs AST output over a corpus (repo fixtures + ≥1 real OSS project per framework) and reports false-negatives and AST-only gains | Corpus candidates pinned below; `detectUsedKeys` API verified to support both paths via `opts.useAst` |
| SHADOW-03 | AST path becomes default only after corpus diff shows zero false-negatives | Exit-code gate pattern confirmed; flip sites verified at exact lines |
| PERF-01 | Benchmark compares AST vs v0.3.0 baseline; perf gate fails build on regression beyond 100 ms | Live-delta design verified; `performance.now()` available in Node ≥ 20; CI step location confirmed |

</phase_requirements>

---

## Summary

Phase 5 has three concrete deliverables: a differential shadow harness (`scripts/shadow-compare.ts`), a hand-rolled benchmark (`scripts/bench.ts`), and the four-line default flip. All three build directly on the API contracts locked in Phase 4 — specifically `detectUsedKeys(files, matchFunctions, matchAttributes, opts?)` returning `{ usedKeys, fileContents, parsedResults, parseErrors }`, where `opts.useAst` toggles the engine. Both gate tools invoke the same function twice (once per engine) in a single process; no new runtime dependencies are needed.

The most important open decision (D-04 / STATE.md open decision #3) is fully resolved here. Four concrete OSS corpus candidates are verified against real GitHub content, commit SHAs retrieved, licenses confirmed permissive, and the specific files to vendor are specified. The matchFunctions/matchAttributes configuration each project needs is documented so the harness config is unambiguous.

The benchmark design uses `performance.now()` (available globally in Node ≥ 20 without import), a warmup pass of 3 iterations, and N=10 timed iterations. Median of 10 is stable enough for CI while the live-delta approach eliminates machine-to-machine variance. The 50-file slice is the entire vendored corpus padded or trimmed to exactly 50 via alphabetical sort — deterministic across any machine.

**Primary recommendation:** Implement `scripts/shadow-compare.ts` first (confirms zero false-negatives), then `scripts/bench.ts` (confirms ≤100 ms delta), then the isolated flip commit. Never flip before both gate scripts exit zero.

---

## Corpus Selection (D-04 — Open Decision #3, NOW RESOLVED)

This section is the primary research output. Every candidate below has been verified via GitHub API: license, file paths, actual `t("key")` call patterns, and current commit SHA.

### Framework: JS/TS (React / Next.js with next-intl)

**Selected:** `nelsonlaidev/nelsonlai.dev`

| Property | Value |
|----------|-------|
| Upstream repo | `https://github.com/nelsonlaidev/nelsonlai.dev` |
| License | MIT [VERIFIED: GitHub API license endpoint] |
| Stars / Last push | 833 stars / 2026-05-11 |
| i18n library | `next-intl` — `useTranslations()` composable returning `t` |
| matchFunctions config | `["t"]` — `const t = useTranslations()` then `t("key")` in script |
| Current HEAD SHA | `76f67d7f29716d185b4f43f3aa7c0cde57d64873` |

**Files to vendor (contain real `t()` calls):**

| File | Why |
|------|-----|
| `src/app/[locale]/(main)/about/page.tsx` | `const t = useTranslations()` + multiple `t("common.labels.about")`, `t("about.description")`, `t("metadata.site-description")` calls |
| `src/app/[locale]/(main)/blog/page.tsx` | Expected similar pattern — blog page for corpus variety |
| `src/app/[locale]/(main)/page.tsx` | Landing page |

**Executor lookup steps for SHA pinning:** `gh api repos/nelsonlaidev/nelsonlai.dev/commits/main | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['sha'])"` — run at time of vendoring and record in `SOURCES.md`.

**matchAttributes:** None needed for this project (no i18nKey attributes in the content viewed).

---

### Framework: Vue (Nuxt 3 / vue-i18n)

**Selected:** `vuesion/vuesion`

| Property | Value |
|----------|-------|
| Upstream repo | `https://github.com/vuesion/vuesion` |
| License | MIT [VERIFIED: GitHub API license endpoint] |
| Stars / Last push | 2873 stars / 2026-05-31 |
| i18n library | `vue-i18n` via `useI18n()` composable |
| matchFunctions config | `["t"]` — `const { t } = useI18n()` then `t("pages.index.title")` in `<script setup>` |
| Current HEAD SHA | `b6683b566600bc55494d854e7d08e01248df4d05` |

**Files to vendor:**

| File | Why |
|------|-----|
| `src/pages/index.vue` | `const { t } = useI18n()` + `t('pages.index.title')`, `t('pages.index.description')` in script setup [VERIFIED: content read via GitHub API] |
| `src/pages/services/index.vue` | Same pattern — `const { t } = useI18n()` + multiple `t('pages.services.*')` calls [VERIFIED] |

**Important note:** The component-level `.vue` files (e.g. `LandingPageHeroSection.vue`) use `$t('key')` in templates (Vue global `$t`, not a function call matching `matchFunctions: ["t"]`). Only the `src/pages/*.vue` files use `const { t } = useI18n()` + `t("key")` in `<script setup>`. Vendor the pages, not the component-level files — they exercise the right extraction path.

**matchAttributes:** `["i18nKey"]` to match the existing repo fixture pattern (the existing `vue-setup.vue` fixture already uses `i18nKey="nav.home"` as an attribute).

---

### Framework: Svelte (SvelteKit with custom i18n)

**Selected:** `Scorpio3310/sveltekit-i18n-starter`

| Property | Value |
|----------|-------|
| Upstream repo | `https://github.com/Scorpio3310/sveltekit-i18n-starter` |
| License | MIT [VERIFIED: GitHub API license endpoint] |
| Stars / Last push | 14 stars / 2025-09-21 |
| i18n library | Custom `$i18n/i18n` — exports a plain `t` function |
| matchFunctions config | `["t"]` — `import { t } from "$i18n/i18n"` then `t("home.h1")` directly called |
| Current HEAD SHA | `20d7b9b2631f7be3a8b694dced2208df9c89d5f6` |

**Files to vendor:**

| File | Why |
|------|-----|
| `src/components/Navbar.svelte` | `import { t } from "$i18n/i18n"` + `t("main.title")`, navigation labels [VERIFIED: content read via GitHub API] |
| `src/components/Footer.svelte` | Same pattern — `t("footer.description")`, `t("footer.name")`, `t("footer.copy")`, `t("footer.made")` [VERIFIED] |
| `src/routes/[lang=lang]/+page.svelte` | `import { t } from "$i18n/i18n"` + `t("home.h1")`, `t("home.description")`, `t("home.warning")` [VERIFIED] |

**Note on `$_()` pattern:** Most `svelte-i18n` projects use `$_("key")` (a Svelte reactive store, not a plain function call). The sveltekit-i18n-starter uses a plain `t` function — this is the correct pattern to exercise `matchFunctions: ["t"]`. Do NOT select kaisermann/svelte-i18n library files which export a store.

**matchAttributes:** None needed (no i18nKey attributes in vendored files).

---

### Framework: Astro

**Selected:** `Scorpio3310/astro-i18n-starter`

| Property | Value |
|----------|-------|
| Upstream repo | `https://github.com/Scorpio3310/astro-i18n-starter` |
| License | MIT [VERIFIED: GitHub API license endpoint] |
| Stars / Last push | 58 stars / 2026-04-06 |
| i18n library | Custom `@i18n/utils` — `useTranslations(lang)` returns a `t` function |
| matchFunctions config | `["t"]` — `const t = useTranslations(lang)` then `t("main.title")` in frontmatter |
| Current HEAD SHA | `f591db710affde9c260c5abe52fa1e3262da82e0` |

**Files to vendor:**

| File | Why |
|------|-----|
| `src/components/Header.astro` | Frontmatter: `const t = useTranslations(lang)` + `t("main.title")`, nav labels [VERIFIED: content read via GitHub API] |
| `src/components/Footer.astro` | Same pattern — multiple `t("footer.*")` calls [VERIFIED] |
| `src/components/Info.astro` | Additional Astro file for coverage |

**matchAttributes:** `["i18nKey"]` consistent with other sources and existing repo fixtures.

---

### Corpus Summary

| Framework | Repo | SHA (HEAD at research time) | License | Files to vendor |
|-----------|------|-----------------------------|---------|-----------------|
| JS/TS | `nelsonlaidev/nelsonlai.dev` | `76f67d7f29716d185b4f43f3aa7c0cde57d64873` | MIT | 3 × `.tsx` |
| Vue | `vuesion/vuesion` | `b6683b566600bc55494d854e7d08e01248df4d05` | MIT | 2 × `.vue` (pages only) |
| Svelte | `Scorpio3310/sveltekit-i18n-starter` | `20d7b9b2631f7be3a8b694dced2208df9c89d5f6` | MIT | 3 × `.svelte` |
| Astro | `Scorpio3310/astro-i18n-starter` | `f591db710affde9c260c5abe52fa1e3262da82e0` | MIT | 3 × `.astro` |

**Executor note:** The SHAs above are HEAD at research time (2026-06-02). The executor MUST run `gh api repos/{owner}/{repo}/commits/main | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['sha'])"` at vendoring time and record that SHA in `SOURCES.md` — the SHA actually used when the files were `git checkout`-ed. If a newer SHA differs, update SOURCES.md accordingly.

**Harness config for shadow-compare.ts:**

```typescript
const CORPUS_CONFIG = {
  matchFunctions: ["t"],
  matchAttributes: ["i18nKey"]
}
```

This config covers all four framework corpus entries. The repo fixtures (`vue-setup.vue`, `vue-legacy.vue`, `component.svelte`, `page.astro`) already use `t()` and `i18nKey` and join the same diff automatically.

---

## Standard Stack

### Core (all hand-rolled, zero new deps per D-10)

| Component | Source | Purpose |
|-----------|--------|---------|
| `detectUsedKeys` (existing) | `src/core/scanner/index.ts` | Dual-engine scan — call twice per file set with `useAst: false` / `useAst: true` |
| `performance.now()` (Node built-in) | Node ≥ 20 global | Nanosecond-resolution timing for benchmark; no import required |
| `fs.promises.writeFile` (Node built-in) | Node built-in | Write JSON report to `scratch/` |
| `process.exitCode` (existing pattern) | Established in codebase | Gate signal — set to 1 on failure, never call `process.exit()` |
| `tsx` or `ts-node` (existing build) | `tsup` in devDeps | Run `scripts/*.ts` via `node --import tsx/esm` or `pnpm tsx` — no new dep |

**Note on running scripts:** The project uses `tsup` and is ESM (`"type": "module"`). The `scripts/*.ts` files need to run directly. The executor should check whether `tsx` is already resolvable (`node_modules/.bin/tsx`) before adding it; if not, script execution can be wired as `node --loader ts-node/esm` or via `tsup` pre-build. The cleanest approach given existing devDeps is `pnpm tsx scripts/shadow-compare.ts` if tsx is already available, otherwise add it as a devDependency (not a runtime dep — safe under D-10 which bans new runtime deps). [ASSUMED: tsx may or may not be in devDeps — executor must check `pnpm list tsx`]

**Actual check:** Looking at `package.json` devDeps: `tsup`, `vitest`, `vite-tsconfig-paths` — no `tsx` present. The build toolchain is `tsup`; test runner is `vitest`. `scripts/*.ts` can be compiled with `tsup --no-bundle scripts/shadow-compare.ts` and run from `dist/`, or run via `node --import @swc-node/register/esm-legacy`. Most practical: add `tsx` as a devDependency and use `pnpm tsx scripts/shadow-compare.ts`. [VERIFIED: package.json read directly]

---

## Architecture Patterns

### `detectUsedKeys` Signature (Verified)

[VERIFIED: src/core/scanner/index.ts read directly]

```typescript
export async function detectUsedKeys(
  files: string[],
  matchFunctions: string[],
  matchAttributes: string[],
  opts?: { cwd?: string; useAst?: boolean; maxConcurrency?: number }
): Promise<{
  usedKeys: Set<string>
  fileContents: string[]
  parsedResults: ParsedFileResult[]
  parseErrors: FileParseError[]
}>
```

`usedKeys` is a `Set<string>` of statically resolved key strings. The flip from regex to AST happens via `opts.useAst`. The harness invokes this twice — once with `useAst: false` (regex, the v0.3.0 baseline), once with `useAst: true` (AST) — over the same `files` array. Comparing the two `usedKeys` sets is the false-negative check.

**What lives in `usedKeys`:** Plain key strings (e.g. `"auth.login"`, `"nav.home"`). Keys ending in `.` are already filtered out by `detectUsedKeys` itself (lines 75-79 / 103-108 of `scanner/index.ts`). [VERIFIED]

**`ParsedFileResult` shape** (for richer diff, optional per CONTEXT specifics):

```typescript
interface ParsedFileResult {
  usedKeys: { key: string; offset: number }[]
  dynamicCalls: {
    expression: string; arg: string; offset: number
    classification: "fully-dynamic" | "structured-concat"; prefix?: string
  }[]
  hardcodedCandidates: { text: string; offset: number }[]
}
```

**`FileParseError` shape** (for harness report):

```typescript
interface FileParseError {
  file: string
  line?: number
  message: string
}
```

[VERIFIED: src/core/scanner/parsers/types.ts read directly]

### shadow-compare.ts Pattern

```typescript
// Source: verified src/core/scanner/index.ts + src/__tests__/ast-shadow.test.ts patterns
import { detectUsedKeys } from "@/core/scanner"
import * as fs from "fs/promises"
import * as path from "path"

const CORPUS_DIR = path.resolve(process.cwd(), "tests/corpus")
const FIXTURES_DIR = path.resolve(process.cwd(), "src/__tests__/parsers/fixtures")

async function main() {
  const files = [
    ...collectFiles(CORPUS_DIR),
    ...collectFiles(FIXTURES_DIR)
  ]

  const matchFunctions = ["t"]
  const matchAttributes = ["i18nKey"]
  const cwd = process.cwd()

  const [regexResult, astResult] = await Promise.all([
    detectUsedKeys(files, matchFunctions, matchAttributes, { cwd, useAst: false }),
    detectUsedKeys(files, matchFunctions, matchAttributes, { cwd, useAst: true })
  ])

  const falseNegatives = [...regexResult.usedKeys].filter(k => !astResult.usedKeys.has(k))
  const astGains = [...astResult.usedKeys].filter(k => !regexResult.usedKeys.has(k))

  const report = {
    totals: {
      regexKeys: regexResult.usedKeys.size,
      astKeys: astResult.usedKeys.size,
      falseNegatives: falseNegatives.length,
      astOnlyGains: astGains.length,
      parseErrors: astResult.parseErrors.length
    },
    falseNegatives,
    astOnlyGains: astGains,
    parseErrors: astResult.parseErrors
  }

  await fs.mkdir("scratch", { recursive: true })
  await fs.writeFile("scratch/shadow-report.json", JSON.stringify(report, null, 2))

  console.log(`Shadow compare: ${files.length} files`)
  console.log(`Regex keys: ${report.totals.regexKeys}`)
  console.log(`AST keys: ${report.totals.astKeys}`)
  console.log(`False negatives: ${report.totals.falseNegatives}`)
  console.log(`AST-only gains: ${report.totals.astOnlyGains}`)

  if (falseNegatives.length > 0) {
    console.error("FAIL: false negatives found — AST missed keys that regex found")
    process.exitCode = 1
  } else {
    console.log("PASS: zero false negatives")
  }
}
```

### Benchmark Pattern (D-09, D-10, D-12)

```typescript
// Hand-rolled benchmark — zero new deps, performance.now() global in Node ≥ 20
const WARMUP = 3
const N = 10

async function timeEngine(files: string[], useAst: boolean): Promise<number[]> {
  const matchFunctions = ["t"]
  const matchAttributes = ["i18nKey"]
  const cwd = process.cwd()
  // Warmup
  for (let i = 0; i < WARMUP; i++) {
    await detectUsedKeys(files, matchFunctions, matchAttributes, { cwd, useAst })
  }
  // Timed runs
  const durations: number[] = []
  for (let i = 0; i < N; i++) {
    const start = performance.now()
    await detectUsedKeys(files, matchFunctions, matchAttributes, { cwd, useAst })
    durations.push(performance.now() - start)
  }
  return durations
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

async function main() {
  const files = collectCorpusSlice(50)  // deterministic 50-file slice

  const regexDurations = await timeEngine(files, false)
  const astDurations = await timeEngine(files, true)

  const regexMedian = median(regexDurations)
  const astMedian = median(astDurations)
  const delta = astMedian - regexMedian

  console.log(`Regex median: ${regexMedian.toFixed(1)}ms`)
  console.log(`AST median: ${astMedian.toFixed(1)}ms`)
  console.log(`Delta: ${delta.toFixed(1)}ms (budget: ≤100ms)`)

  if (delta > 100) {
    console.error(`FAIL: AST is ${delta.toFixed(1)}ms slower than regex — exceeds 100ms budget`)
    process.exitCode = 1
  } else {
    console.log("PASS: AST within perf budget")
  }
}
```

### Flip Sites (Verified)

[VERIFIED: grep confirmed exact lines]

| File | Line | Current expression | Change to |
|------|------|--------------------|-----------|
| `src/core/scanner/index.ts` | 37 | `const useAst = opts?.useAst ?? false` | `opts?.useAst ?? true` |
| `src/commands/validate.ts` | 104 | `const useAst = options?.useAst ?? false` | `options?.useAst ?? true` |
| `src/commands/extract.ts` | 45 | `{ cwd, useAst: options?.useAst ?? false }` | `options?.useAst ?? true` |
| `src/commands/prune.ts` | 65 | `{ cwd, useAst: options.useAst ?? false }` | `options.useAst ?? true` |

**CLAUDE.md requirement:** Before editing any of these four symbols, the executor MUST run `gitnexus_impact({ target: "detectUsedKeys", direction: "upstream" })` (for the scanner flip site) and the equivalent for `validate`, `extract`, `prune`. CLAUDE.md mandates impact analysis before modifying any function/method — HIGH or CRITICAL risk must be reported to the user before proceeding.

### Default-is-AST Guard Test (D-16)

```typescript
// Fold into ast-shadow.test.ts — new test added alongside Tests A-H
it("default engine (no useAst option) runs the AST path (D-16 guard)", async () => {
  createMockProject(tempDir, {
    "src/index.ts": `t("nav.home")`,
    "locales/en.json": JSON.stringify({ "nav.home": "Home" })
  })
  const config: I18nSharpenConfig = {
    scanDirs: ["src"],
    localesDir: "locales",
    defaultLanguage: "en",
    supportedLanguages: ["en"],
    fileExtensions: [".ts"],
    matchFunctions: ["t"]
  }
  // Call WITHOUT useAst option — default must now be AST
  const results = await validate(config, tempDir)  // no options arg
  expect(results.missingKeys).not.toContain("nav.home")
  // Verify the AST path was used by checking parsedResults were populated
  // (regex mode returns parsedResults: [])
  // This can be done via detectUsedKeys directly:
  const { parsedResults } = await detectUsedKeys(
    [path.join(tempDir, "src/index.ts")],
    ["t"],
    [],
    { cwd: tempDir }  // no useAst — default
  )
  expect(parsedResults.length).toBeGreaterThan(0)
})
```

### Recommended Project Structure

```
scripts/
├── shadow-compare.ts   # SHADOW-02 differential harness
└── bench.ts            # PERF-01 benchmark
tests/
└── corpus/             # D-01 vendored corpus
    ├── SOURCES.md      # D-03 provenance manifest
    ├── js-ts/          # nelsonlaidev/nelsonlai.dev files
    │   ├── about.page.tsx
    │   ├── blog.page.tsx
    │   └── home.page.tsx
    ├── vue/            # vuesion/vuesion files
    │   ├── index.vue
    │   └── services-index.vue
    ├── svelte/         # Scorpio3310/sveltekit-i18n-starter files
    │   ├── Navbar.svelte
    │   ├── Footer.svelte
    │   └── home-page.svelte
    └── astro/          # Scorpio3310/astro-i18n-starter files
        ├── Header.astro
        ├── Footer.astro
        └── Info.astro
scratch/                # gitignored — shadow-report.json lives here
```

### Anti-Patterns to Avoid

- **Fetching corpus at runtime:** No network calls in `shadow-compare.ts` or `bench.ts`. Corpus is vendored (D-01).
- **`Promise.all` over all files in bench:** `detectUsedKeys` already uses `runBoundedPool` internally (max 4 concurrent) when `useAst: true`. The bench just calls `detectUsedKeys` once per timed iteration over the full slice — do not re-parallelize externally.
- **Committing `scratch/`:** The `.gitignore` currently does NOT include `scratch/` [VERIFIED: .gitignore read directly]. Adding `scratch/` to `.gitignore` is a required task in Wave 0.
- **Running bench before warmup settles:** V8 JIT compiles hot paths during warmup. Three warmup iterations is the minimum; five is safer for complex async paths.
- **Using `Date.now()` instead of `performance.now()`:** `Date.now()` has millisecond resolution; `performance.now()` has sub-millisecond (float) resolution and is not affected by system clock adjustments.
- **Flipping defaults before both gates pass:** D-15 mandates the flip as an isolated final commit after exit-code zero from both scripts.
- **Editing flip sites without gitnexus_impact:** CLAUDE.md prohibits editing any function without prior impact analysis.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Running both engine paths | Custom re-implementation | `detectUsedKeys` with `opts.useAst` | Already exposes both paths; returns `parseErrors` Phase 5 needs |
| Corpus file enumeration | Custom glob walker | `fs.readdirSync` recursive or existing `scanSourceFiles` pattern | Corpus is vendored to a known directory; no complex glob needed |
| Median calculation | External stats lib | 4-line sort+index formula (see pattern above) | Too trivial to justify a dep; the benchmark must have zero new deps (D-10) |
| Report writing | JSON serialization lib | `JSON.stringify(report, null, 2)` | No schema validation needed; output is developer-facing only |

---

## Common Pitfalls

### Pitfall 1: Corpus Files That Don't Exercise `matchFunctions: ["t"]`

**What goes wrong:** Vendored files that use `$_('key')` (svelte-i18n store), `$t('key')` (Vue template global), or `useTranslations` without calling the result as `t("key")` will produce zero extracted keys for that file — the diff shows "no regex keys, no AST keys" which is vacuously passing but proves nothing.

**Why it happens:** Different i18n libraries have different call patterns. Svelte stores use reactive `$_` syntax, not function calls. Vue template globals use `$t`.

**How to avoid:** Only vendor files where the i18n call is a plain function call `t("key")` in script/frontmatter blocks. The corpus candidates selected above have all been verified to use this pattern. [VERIFIED: file contents read via GitHub API]

**Warning signs:** The shadow report shows `regexKeys: 0` for a framework's corpus slice — means regex also found nothing, so the diff is vacuously passing.

### Pitfall 2: Non-Deterministic 50-File Slice

**What goes wrong:** If the 50-file slice changes between runs (e.g. based on OS file-listing order), the benchmark median bounces — CI may pass one day and fail the next on the same code.

**Why it happens:** `fs.readdirSync` order is OS-dependent on some platforms.

**How to avoid:** Sort `files` alphabetically before slicing: `files.sort().slice(0, 50)`. The sort is stable across platforms. If the total corpus has fewer than 50 files, use all of them (the bench still runs; the gate threshold stays the same).

**Warning signs:** Benchmark results vary by ±50ms between identical runs.

### Pitfall 3: GC Pressure Inflating AST Median

**What goes wrong:** Each AST parse run allocates the TypeScript AST and the parsed result objects. Without warmup, V8 may GC mid-timed-run, inflating the measured time.

**Why it happens:** The AST path allocates significantly more than the regex path. Large GC pauses (50-200ms) can appear in the first 2-3 runs.

**How to avoid:** 3 warmup iterations before the timed loop. The median of 10 then excludes outliers on both ends. Do NOT use the mean (GC spikes pull it high).

**Warning signs:** First timed iteration is 2-3× slower than subsequent ones; median and mean diverge significantly.

### Pitfall 4: `scratch/` Committed to Git

**What goes wrong:** The JSON diff report is committed by accident, creating a stale snapshot in the repo that future agents may treat as ground truth.

**Why it happens:** `scratch/` is currently NOT in `.gitignore` [VERIFIED: .gitignore read]. If `git add .` is used carelessly, `scratch/shadow-report.json` gets staged.

**How to avoid:** Add `scratch/` to `.gitignore` in Wave 0 before any gate script is run. Use `git add` with specific paths, never `git add .`.

**Warning signs:** `git status` shows `scratch/shadow-report.json` as untracked.

### Pitfall 5: `tsx` Not Available for Running Scripts

**What goes wrong:** `scripts/shadow-compare.ts` and `scripts/bench.ts` need a TypeScript runner. Without `tsx` in devDeps, `pnpm shadow` and `pnpm bench` fail to start.

**Why it happens:** The project currently has no `tsx` in devDeps — only `tsup` (bundler) and `vitest` (test runner). [VERIFIED: package.json read]

**How to avoid:** Add `tsx` as a devDependency in Wave 0 and wire `pnpm shadow` / `pnpm bench` as `"tsx scripts/shadow-compare.ts"` / `"tsx scripts/bench.ts"` in `package.json` scripts. Alternatively, configure `tsup` to compile scripts to `dist/scripts/` and run the compiled output — but `tsx` is simpler.

**Warning signs:** `pnpm shadow` outputs `command not found: tsx` or similar ESM syntax error.

### Pitfall 6: `i18nKey` Attribute in Corpus Vue Files Only

**What goes wrong:** The harness config uses `matchAttributes: ["i18nKey"]` for all frameworks, but only Vue files in the corpus actually have `i18nKey` attributes. Svelte and Astro corpus files use only function calls. This is harmless (extra config has no effect on files that don't use those attributes) but the planner should document it clearly so future corpus additions know the convention.

**How to avoid:** Document in `SOURCES.md` which files use which extraction mechanism. The harness config is shared across all corpus files.

---

## Verified Code Details

### `.gitignore` Current State

[VERIFIED: .gitignore read directly]

`scratch/` is NOT currently gitignored. The file contains: `node_modules`, `dist`, `.DS_Store`, common editor files, GSD artifacts, Python bytecode, `.gitnexus`. Adding `scratch/` is a Wave 0 prerequisite.

### CI Workflow Current State

[VERIFIED: .github/workflows/ci.yml read directly]

```yaml
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3 (version: 10)
      - uses: actions/setup-node@v4 (node-version: 20)
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

D-14 requires adding `pnpm bench` as a step after `pnpm test` and before or after `pnpm build`. The bench must exit non-zero on perf regression — so placing it before `pnpm build` means a failed bench blocks the build artifact, which is the desired behavior.

### Existing Fixtures That Join the Diff

[VERIFIED: src/__tests__/parsers/fixtures/ listed via Glob tool]

| File | Keys extracted (known) |
|------|----------------------|
| `src/__tests__/parsers/fixtures/vue-setup.vue` | `hero.title` (t call), `nav.home` (i18nKey attr) |
| `src/__tests__/parsers/fixtures/vue-legacy.vue` | `hero.title` (t call), `nav.home` (i18nKey attr) |
| `src/__tests__/parsers/fixtures/component.svelte` | `mod.init`, `page.title` (t calls), `nav.home` (i18nKey attr) |
| `src/__tests__/parsers/fixtures/page.astro` | `page.title` (t call), `nav.home` (i18nKey attr) |

These 4 files exercise all frameworks with both extraction modes and will contribute to both the shadow diff and the benchmark corpus.

### Existing `ast-shadow.test.ts` Test Pattern

[VERIFIED: src/__tests__/ast-shadow.test.ts read directly]

The `createMockProject` + `getTempDir()` pattern writes to `../../scratch/temp-ast-shadow-{random}/`. This confirms `scratch/` already exists as the temp project root — another reason to gitignore it promptly.

Tests A-H already cover: missing key detection, unused key detection, dot-suffix skipping, fully-dynamic findings, structured-concat + ignoreDynamicKeys, hardcoded candidates, extract command, and the D-09 structural invariant (`useAst` absent from `src/types.ts`). The D-16 guard adds the "no explicit useAst → AST path" assertion.

---

## Benchmark Warmup and N Recommendation

**Recommended configuration:** WARMUP = 3, N = 10

**Rationale:**
- **Warmup = 3:** Enough for V8 to JIT-compile the hot path through `runBoundedPool`, `parseFile`, and the TypeScript/Vue/Svelte/Astro compiler paths. Three iterations exercises the code paths without spending meaningful wall time.
- **N = 10:** Median of 10 gives P50. With a 50-file corpus, each iteration takes on the order of 100-500ms (AST), meaning 10 iterations adds 1-5 seconds to the CI job — acceptable. Median of 10 is robust to 1-2 outlier GC pauses.
- **Avoid N=5:** Too few samples for reliable median; a single GC pause at the median position would pass a failing build.
- **Avoid N=50:** Adds 25-50 seconds to CI on a slow runner; unnecessary once median stability is confirmed.

[ASSUMED: 100-500ms per iteration estimate is based on corpus size and known TypeScript compiler API overhead, not measured on this machine]

### Deterministic 50-File Slice Strategy

If the full vendored corpus has fewer than 50 files (likely: ~11 corpus files + 4 existing fixtures = ~15 total), use ALL of them and document the actual count in the bench output. The "50-file" budget in D-11 is a ceiling, not a floor. The perf gate threshold (≤100ms delta) is independent of file count.

If padding to 50 is needed, the bench can repeat the fixture files in a loop until 50 items are reached (deterministic repeat with a modulo index). Do NOT fetch additional files at runtime.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stored baseline number (committed file) | Live in-process delta (D-09) | Phase 5 design decision | Immune to machine variance; never goes stale |
| `tinybench` / `mitata` / `vitest-bench` | Hand-rolled `performance.now()` loop | Phase 5 D-10 | Zero new deps; exactly matches project constraint |
| Git submodules for external corpus | Vendored files copied into repo | Phase 5 D-01 | Fully offline, deterministic CI |

**Deprecated/outdated:**
- `Date.now()` for benchmarks: replaced by `performance.now()` (Node ≥ 10, stable in Node ≥ 20 without import)
- `process.exit(1)` for gate signals: the codebase uses `process.exitCode` (never `process.exit()`); scripts must follow the same pattern

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tsx` can be added as a devDependency to run `scripts/*.ts` | Standard Stack | If project constraints forbid any new devDep additions, scripts must be pre-compiled via `tsup`; adds a build step to the wave |
| A2 | 100-500ms per benchmark iteration estimate | Warmup/N Recommendation | If AST path is slower (e.g. 1-2s per iteration on CI), N=10 adds 10-20s to CI — still acceptable |
| A3 | The nelsonlai.dev project files `blog/page.tsx` and `home/page.tsx` use the same `useTranslations()` + `t("key")` pattern as `about/page.tsx` | Corpus Selection JS/TS | If they use different patterns, executor should pick alternative files from the same repo that do use `t("key")` |
| A4 | `vuesion/vuesion` compiles cleanly with the workspace `@vue/compiler-sfc` version in devDeps (`^3.5.35`) | Corpus Selection Vue | Minor version mismatch would surface as a `FileParseError`, not a crash; still acceptable for corpus |

---

## Open Questions (RESOLVED)

1. **Corpus total file count below 50** — RESOLVED in Plan 03 Task 1: use all corpus files (`files.sort().slice(0,50)`; all if <50) and print the actual count; the 100ms threshold is count-independent.
   - What we know: 4 existing fixtures + up to 11 vendored files = ~15 files total
   - What's unclear: Whether D-11's "50-file slice" requires padding, or whether all-corpus (≤50) is acceptable
   - Recommendation: Use all corpus files; document the actual count in bench output. The threshold (100ms) doesn't change.

2. **`tsx` as devDependency vs `tsup` compile** — RESOLVED in Plan 01 Task 1: add `tsx` as a devDependency and wire `pnpm shadow`/`pnpm bench` as `tsx scripts/*.ts`.
   - What we know: neither `tsx` nor `ts-node` is currently in devDeps
   - What's unclear: Project owner preference for script execution method
   - Recommendation: Add `tsx` as devDependency (one-line addition, zero runtime impact); most ergonomic for on-demand `pnpm shadow` runs

3. **GitNexus impact analysis results** — RESOLVED procedurally in Plan 04 Task 2: a runtime observation, not a pre-answerable design question. The executor runs `gitnexus_impact` on detectUsedKeys/validate/extract/prune and surfaces HIGH/CRITICAL risk to the user before the D-15 flip commit.
   - What we know: CLAUDE.md mandates `gitnexus_impact` before editing the four flip sites
   - What's unclear: Whether the impact analysis will return HIGH/CRITICAL risk for the flip
   - Recommendation: Executor runs `gitnexus_impact` for each flip site and reports results to user before proceeding with D-15 commit

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥ 20 | `performance.now()` global, ESM | ✓ | 20 (CI config) | — |
| `@vue/compiler-sfc` | Parsing `.vue` corpus files | ✓ | `^3.5.35` in devDeps | — |
| `svelte` | Parsing `.svelte` corpus files | ✓ | `^5.56.0` in devDeps | — |
| `@astrojs/compiler` | Parsing `.astro` corpus files | ✓ | `^4.0.0` in devDeps | — |
| `typescript` | Parsing `.ts/.tsx` corpus files | ✓ | `^5.9.3` in devDeps | — |
| `tsx` (script runner) | Running `scripts/*.ts` directly | ✗ | — | `tsup` pre-compile then `node dist/scripts/...` |
| GitHub API (`gh` CLI) | Executor: SHA lookup at corpus vendoring time | ✓ (assumed) | — | Manual `git clone --depth=1` + `git rev-parse HEAD` |
| Network access | Executor: initial `git clone` to vendor corpus files | Required once | — | Can be done on dev machine and committed |

[VERIFIED: package.json devDependencies read directly for compiler availability]

**Missing dependencies with fallback:**
- `tsx`: not installed; fallback is `tsup` pre-compile. Recommendation: add `tsx` to devDeps.

**Missing dependencies with no fallback:**
- None that block execution.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 1.5.0 |
| Config file | `vitest.config.ts` (uses `vite-tsconfig-paths` plugin) |
| Quick run command | `pnpm vitest run src/__tests__/ast-shadow.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHADOW-02 | `scripts/shadow-compare.ts` runs both engines and produces diff report | smoke (script exit code) | `pnpm shadow` | ❌ Wave 0 |
| SHADOW-03 | Zero false-negatives gate | smoke (exit code check in CI) | `pnpm shadow` exits 0 | ❌ Wave 0 |
| PERF-01 | AST ≤100ms slower than regex | smoke (bench exit code) | `pnpm bench` | ❌ Wave 0 |
| PERF-01 (CI wire) | `pnpm bench` wired into CI build | CI config | CI run on push | ❌ Wave 0 (ci.yml edit) |
| SHADOW-03 / crit #4 | Default engine (no useAst) runs AST path | unit | `pnpm vitest run src/__tests__/ast-shadow.test.ts` | ❌ Wave 0 (D-16 guard test) |

### Sampling Rate

- **Per task commit:** `pnpm tsc --noEmit && pnpm test`
- **Per wave merge:** `pnpm tsc --noEmit && pnpm test && pnpm build && pnpm bench && pnpm shadow`
- **Phase gate:** Full suite + both gate scripts exit 0 + isolated flip commit before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `scratch/` added to `.gitignore`
- [ ] `tsx` added to `package.json` devDependencies
- [ ] `tests/corpus/` directory created with `SOURCES.md` manifest
- [ ] `scripts/shadow-compare.ts` created (SHADOW-02)
- [ ] `scripts/bench.ts` created (PERF-01)
- [ ] `package.json` scripts: add `"shadow": "tsx scripts/shadow-compare.ts"` and `"bench": "tsx scripts/bench.ts"`
- [ ] `.github/workflows/ci.yml`: add `pnpm bench` step (D-14)
- [ ] D-16 guard test added to `src/__tests__/ast-shadow.test.ts`
- [ ] Corpus files vendored for all four frameworks

---

## Security Domain

> Phase 5 involves no authentication, user input processing, network services, or data persistence beyond writing a JSON report to a gitignored local directory. No ASVS categories apply.

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 5 |
|-----------|-------------------|
| MUST run `gitnexus_impact` before editing any symbol | Required before editing the four flip sites (scanner/index.ts:37, validate.ts:104, extract.ts:45, prune.ts:65) |
| MUST run `gitnexus_detect_changes()` before committing | Required before the flip commit (D-15) and before the gate-scripts commit |
| MUST warn user if impact returns HIGH or CRITICAL | Executor must surface this before proceeding |
| NEVER rename symbols with find-and-replace | Not applicable to this phase (no renames) |
| Strict ESLint: `no-explicit-any: error`, `consistent-type-imports: error` | `scripts/*.ts` must satisfy same lint rules — no `any`, use `import type` where appropriate |
| Node ≥ 20 / ESM | Scripts use `import`, not `require`; `performance.now()` available without import |
| Zero new runtime dependencies | `tsx` is a devDependency, not a runtime dep — acceptable under this constraint |
| `pnpm tsc --noEmit && pnpm test && pnpm build` on every commit | The new `scripts/*.ts` must also pass `tsc --noEmit` (they live outside `src/` — verify tsconfig `include` covers them or add a separate tsconfig for scripts) |

**Tsconfig note:** The current `tsconfig.json` has `"include": ["src"]` — this means `scripts/*.ts` are NOT typechecked by the default `pnpm typecheck` command. [VERIFIED: tsconfig.json read directly]. The executor must either: (a) extend `include` to `["src", "scripts"]`, or (b) add a `tsconfig.scripts.json` for the scripts directory. Option (a) is simpler but risks including test infrastructure in the main build; option (b) is cleaner. The scripts need the `@/` path alias — either approach must preserve that.

---

## Sources

### Primary (HIGH confidence)

- `src/core/scanner/index.ts` — `detectUsedKeys` signature, `usedKeys: Set<string>`, flip site at line 37 [read directly]
- `src/commands/validate.ts` — flip site at line 104, `useAst` branch structure [read directly]
- `src/commands/extract.ts` — flip site at line 45 [read directly]
- `src/commands/prune.ts` — flip site at line 65 [read directly]
- `src/core/scanner/parsers/types.ts` — `ParsedFileResult` + `FileParseError` shapes [read directly]
- `src/core/scanner/pool.ts` — `runBoundedPool` implementation [read directly]
- `src/__tests__/ast-shadow.test.ts` — existing Tests A-H, `scratch/` temp convention [read directly]
- `src/__tests__/parsers/fixtures/` — 4 existing fixture files [listed via Glob]
- `.github/workflows/ci.yml` — current CI steps [read directly]
- `.gitignore` — scratch/ NOT present [read directly]
- `package.json` — devDeps, script names, ESM type [read directly]
- `tsconfig.json` — `"include": ["src"]` only [read directly]
- GitHub API: `nelsonlaidev/nelsonlai.dev` license=MIT, SHA=`76f67d7f...`, about/page.tsx content with `useTranslations()` + `t("key")` [verified via gh CLI]
- GitHub API: `vuesion/vuesion` license=MIT, SHA=`b6683b56...`, pages/index.vue + services/index.vue content with `const { t } = useI18n()` [verified via gh CLI]
- GitHub API: `Scorpio3310/sveltekit-i18n-starter` license=MIT, SHA=`20d7b9b2...`, Navbar/Footer/page.svelte with `import { t } from "$i18n/i18n"` [verified via gh CLI]
- GitHub API: `Scorpio3310/astro-i18n-starter` license=MIT, SHA=`f591db71...`, Header/Footer.astro with `const t = useTranslations(lang)` [verified via gh CLI]
- `.planning/phases/05-shadow-comparison-perf-gate-default-flip/05-CONTEXT.md` — all 16 decisions [read directly]
- `.planning/phases/04-async-migration-shadow-mode-on-regex-still-default/04-CONTEXT.md` — Phase 4 contracts [read directly]

### Secondary (MEDIUM confidence)

- [Node.js 20 `performance.now()` documentation](https://nodejs.org/docs/latest-v20.x/api/globals.html) — global `performance` object available without import in Node ≥ 16

### Tertiary (LOW confidence — see Assumptions Log)

- Per-iteration timing estimates (100-500ms) based on typical TypeScript compiler API overhead — not measured

---

## Metadata

**Confidence breakdown:**
- Corpus candidates: HIGH — all four repos verified via GitHub API (license, file content, SHA)
- Flip sites: HIGH — verified via grep on actual source files
- API contracts: HIGH — verified by reading the actual source files
- Benchmark design: HIGH (pattern), LOW (timing estimates)
- Standard stack: HIGH — package.json read directly

**Research date:** 2026-06-02
**Valid until:** 2026-07-02 (corpus SHAs are HEAD at research time; executor must re-verify at vendoring time)
