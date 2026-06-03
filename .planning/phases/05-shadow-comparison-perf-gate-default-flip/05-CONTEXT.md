# Phase 5: Shadow Comparison, Perf Gate & Default Flip - Context

**Gathered:** 2026-06-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the **verification gates** that prove the AST engine is safe, then flip it on. Three deliverables:

1. **`scripts/shadow-compare.ts`** — runs the regex path and the AST path over the same corpus (repo fixtures + ≥1 real OSS project per framework) and emits a machine-readable diff report (SHADOW-02).
2. **`pnpm bench`** — a 50-file perf gate that fails the build if the AST path is more than 100 ms slower than the v0.3.0 regex baseline (PERF-01).
3. **The default flip** — `useAst` default goes `false → true` **only after** the corpus diff shows zero false-negatives and the perf gate passes (SHADOW-03).

**In scope:** SHADOW-02 (differential harness + diff report), SHADOW-03 (zero-false-negative gate before flip), PERF-01 (benchmark + perf-regression gate), and criterion #4 (full suite passes with AST as the default driver).

**Out of scope:** Deleting `regex.ts`/`dynamic.ts`/`hardcoded.ts`/`scanner.ts` shim, relocating `isHardcodedIgnored` → `text.ts`, removing the `useAst` flag entirely, the BREAKING CHANGELOG, and the 0.4.0 version bump — all Phase 6 (CLEAN-01/CLEAN-02). Exposing `useAst`/engine/concurrency as a public/user-facing option (rejected in Phase 4, D-08/D-09).

</domain>

<decisions>
## Implementation Decisions

### Corpus strategy (feeds SHADOW-02)
- **D-01:** The real-OSS corpus is **vendored** — a curated subset of real files copied into the repo (e.g. `tests/corpus/`), committed. Fully offline, deterministic CI, no network flakiness. Not git submodules, not fetch-on-demand.
- **D-02:** **One representative real OSS project per framework** (JS/TS, Vue, Svelte, Astro) — the SHADOW-02 minimum. Tight signal, fast runs, easy diff triage. The vendored corpus sits alongside the existing repo fixtures (`src/__tests__/parsers/fixtures/`), which also feed the diff.
- **D-03:** Provenance is recorded in a **`SOURCES.md` manifest**: each corpus source's upstream repo URL, exact commit SHA, the paths/files taken, and license. Makes the corpus reproducible and license-clean.
- **D-04:** **Constraint for source selection:** corpus projects MUST be **permissively licensed** (MIT/Apache-2.0/BSD) so the files can be legally vendored. They should also contain real `matchFunctions`-style i18n usage (`t("...")` calls / configured attributes) so the diff actually exercises key extraction. *Selecting and pinning the specific OSS projects + SHAs is the researcher's job (STATE.md open decision #3).*

### Diff report format (SHADOW-02 / criterion #2)
- **D-05:** `scripts/shadow-compare.ts` emits a **structured JSON report** (per-file + totals: false-negatives, AST-only gains, parse errors) **plus a concise human summary to stdout** (headline counts + pass/fail verdict).
- **D-06:** The report is written to **`scratch/` (gitignored)**, regenerated each run — it's a derived artifact, not committed. The **exit code is the authoritative verdict**, not a stored file. (`scratch/` must be added to `.gitignore` — see code_context.)
- **D-07:** A **false-negative** (any key the regex path found that the AST path missed) makes `shadow-compare` **exit non-zero**, mechanically blocking the flip until it is zero. This directly enforces SHADOW-03 — no human judgment required. No triage-allowlist escape valve.
- **D-08:** **AST-only gains** (keys AST finds that regex missed) are **documented in the report but non-blocking** — they never affect the gate verdict. Gains are the expected upside of the rewrite; criterion #2 only requires they be documented.

### Benchmark & baseline (PERF-01 / criterion #3)
- **D-09:** The v0.3.0 baseline is established via a **live in-process delta**: `pnpm bench` runs **both** the regex path and the AST path over the same corpus in one process and compares directly (AST median − regex median ≤ 100 ms). Because Phase 4 guaranteed `regex default == v0.3.0 behavior`, the live regex path **is** the v0.3.0 baseline — self-calibrating, immune to machine-to-machine variance, never goes stale. Not a recorded/committed baseline number.
- **D-10:** The benchmark is **hand-rolled** — `performance.now()` with a warmup pass + N timed iterations, in `scripts/`. **Zero new dependencies** (honors the tiny-dep-tree constraint). No `tinybench`/`mitata`/vitest-bench.
- **D-11:** The 50-file benchmark corpus is a **fixed, deterministic 50-file slice of the vendored real-OSS corpus** (D-01). One source of truth; the perf number reflects the same real code `shadow-compare` diffs.
- **D-12:** Pass/fail uses the **median of N runs** (after warmup); `pnpm bench` **exits non-zero** when `(AST median − regex median) > 100 ms`, so the build fails. Median chosen for outlier resistance.

### Flip mechanics & CI (SHADOW-03 / criterion #4)
- **D-13:** **Clean flip, no escape-hatch.** Flip the four `?? false` default sites to `?? true` — `src/core/scanner/index.ts:37` (`detectUsedKeys`), `src/commands/validate.ts:104`, `src/commands/extract.ts:45`, `src/commands/prune.ts:65`. `useAst` stays **internal** (Phase 4 D-08/D-09); no env-var, config field, or CLI flag. Rationale: Phase 6 deletes the regex path entirely, so any regex-fallback hatch would break one phase later; the public surface stays byte-identical except the engine.
- **D-14:** **`pnpm bench` is wired into CI** (added to `.github/workflows/ci.yml`, the build-test job, per PERF-01 "fails the build"). **`pnpm shadow` is an on-demand script** for the one-time pre-flip parity proof — not a permanent CI gate, because it's a transitional tool deleted/changed in Phase 6.
- **D-15:** The default flip lands as an **isolated, final atomic commit** — build + prove both gates first, then change the four defaults last in their own commit. Trivially revertable; makes the "flip only after gates pass" ordering explicit in git history.
- **D-16:** Add a **default-is-AST guard test** asserting the default engine (calling `validate`/`detectUsedKeys` with no explicit `useAst`) now runs the AST path. This proves criterion #4 (the existing suite implicitly runs on AST) and guards against a silent flip-back. Keep the existing `useAst:true` ast-shadow tests as well.

### Claude's Discretion
- Exact JSON report schema/field names and the stdout summary wording/format.
- `package.json` script names (`bench`, `shadow`) and `scripts/` file layout/naming.
- Warmup count and N (iteration count) for the benchmark, provided the gate is stable.
- Exact directory name/structure for the vendored corpus (`tests/corpus/` is a suggestion).
- How the deterministic 50-file slice is selected from the corpus (alpha sort, a manifest list, first-N, etc.) as long as it's stable across runs.
- How `shadow-compare` reuses `detectUsedKeys` (it already exposes both paths via `opts.useAst` and returns `parseErrors`) vs. driving `parseFile`/regex more directly.
- Whether the default-is-AST guard is a dedicated test or an assertion folded into existing suites.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external `docs/` ADRs or design specs exist in this repo — requirements and decisions live entirely in `.planning/` and the source tree.

### Requirements & success criteria
- `.planning/REQUIREMENTS.md` — definitions for **SHADOW-02, SHADOW-03, PERF-01** (this phase's reqs); the Out-of-Scope table (esp. "Permanent regex fallback alongside AST" — rejected, reinforces D-13); deferred **CACHE-01/STRICT-01**.
- `.planning/ROADMAP.md` §"Phase 5: Shadow Comparison, Perf Gate & Default Flip" — the **4 success criteria** this phase is verified against (machine-readable diff over real corpus; zero false-negatives + documented gains; `pnpm bench` ≤100 ms vs v0.3.0, fails build past it; suite passes with AST as default driver).

### Phase 4 (the engine + flag this phase consumes — build to these)
- `.planning/phases/04-async-migration-shadow-mode-on-regex-still-default/04-CONTEXT.md` — **the most important upstream ref.** `useAst` is internal-only (D-08/D-09); `detectUsedKeys` returns `{ usedKeys, fileContents, parsedResults, parseErrors }` with `parseErrors: FileParseError[]` (D-01) for the harness; the AST branch fully drives `validate` (D-04/D-05); concurrency fixed at 4 with internal-only `maxConcurrency` override (D-11/D-12); regex mode preserved byte-identical (D-13).

### Behavioral source-of-truth (the code the gates exercise / the flip touches)
- `src/core/scanner/index.ts` — `detectUsedKeys(files, matchFunctions, matchAttributes, opts?)`; **default flip site at line 37** (`opts?.useAst ?? false`). Both engine branches live here for `shadow-compare`/`bench` to invoke.
- `src/commands/validate.ts` — heavy consumer; **flip site at line 104**; the `useAst` branch (lines ~141, ~270) is what the diff compares end-to-end.
- `src/commands/extract.ts` — **flip site at line 45**.
- `src/commands/prune.ts` — **flip site at line 65**.
- `src/cli.ts` — passes **no** `useAst`, so it inherits whatever the default becomes (the flip's user-visible effect flows through here).
- `src/__tests__/ast-shadow.test.ts` — existing Phase 4 end-to-end `useAst:true` tests (Tests A–H); D-16's default-is-AST guard extends this coverage.
- `src/__tests__/parsers/fixtures/` — existing repo fixtures (`vue-setup.vue`, `vue-legacy.vue`, `component.svelte`, `page.astro`) that join the vendored corpus in the diff.

### Project decisions & constraints
- `.planning/PROJECT.md` §Constraints + §Key Decisions — **keep the runtime dep tree tiny / no new runtime deps** (drives D-10 hand-rolled bench); sub-second perf / ≤100 ms overhead budget (PERF-01); additive-only mid-milestone; Node ≥ 20 / ESM; strict ESLint quality gate (`no-explicit-any: error`, `consistent-type-imports: error`). Framework compilers are optional peer deps, present as devDeps for the corpus to parse.
- `.github/workflows/ci.yml` — current CI: `pnpm install --frozen-lockfile` → lint → typecheck → test → build on push/PR to main/master. D-14 adds a `pnpm bench` step here.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/core/scanner/index.ts` — `detectUsedKeys`** — already exposes both engines via `opts.useAst` and returns `parsedResults` + `parseErrors`. `shadow-compare` can call it twice (regex vs AST) per file/corpus and diff the `usedKeys` sets; `bench` times the two branches in-process (D-09).
- **`src/commands/validate.ts`** — already branches on `useAst` and produces equivalent `ValidationResults` (Phase 4 D-04/D-05). The diff can compare full end-to-end results, not just raw key sets.
- **`src/core/scanner/pool.ts` — `runBoundedPool`** — the bounded-concurrency pool (max 4) the AST path already uses; the bench measures the real concurrent path.
- **`src/__tests__/ast-shadow.test.ts`** — the temp-project + `scratch/` convention (random temp dirs under `../../scratch/`) is a working pattern the harness/bench and the D-16 guard test can reuse.
- **`src/__tests__/parsers/fixtures/`** — existing per-framework fixtures join the corpus.

### Established Patterns
- **`process.exitCode` / non-zero exit as the gate mechanism** — both `shadow-compare` (D-07) and `bench` (D-12) signal failure via exit code; only `I18nSharpenError` is ever thrown.
- **Quality gate on every commit:** `pnpm tsc --noEmit && pnpm test && pnpm build`; ESM, Node ≥ 20, `tsup`, strict ESLint; `@/` path alias in use. New `scripts/*.ts` must satisfy the same lint/type rules (no `any`).
- **Framework compilers as devDeps** — `@vue/compiler-sfc`, `svelte`, `@astrojs/compiler`, `typescript` are all installed in dev/CI, so the vendored corpus parses without extra setup.

### Integration Points
- **`scripts/shadow-compare.ts`** (new) — drives both engines over corpus, writes JSON to `scratch/`, prints summary, exits non-zero on any false-negative.
- **`scripts/` benchmark file** (new) — live regex-vs-AST delta over the 50-file slice; exits non-zero past +100 ms.
- **`package.json` scripts** — add `shadow` and `bench` entries (names at discretion).
- **`.github/workflows/ci.yml`** — add a `pnpm bench` step to the build-test job (D-14).
- **`.gitignore`** — add `scratch/` (currently NOT ignored; the report and existing test temp dirs write there).
- **`tests/corpus/` + `SOURCES.md`** (new) — vendored corpus and its provenance manifest.
- **The four flip sites** — `scanner/index.ts:37`, `validate.ts:104`, `extract.ts:45`, `prune.ts:65` (`?? false` → `?? true`), in an isolated final commit (D-15).

</code_context>

<specifics>
## Specific Ideas

- The phrase that anchors the phase: **"prove parity, then flip — never the other way around."** The flip (D-15) is mechanically gated behind two exit-code checks (D-07 zero false-negatives, D-12 perf budget), so the ordering is enforced by tooling, not discipline.
- **Both gate tools are transitional.** `shadow-compare` and the live-delta `bench` both depend on the regex path existing in the same process. Phase 6 deletes regex — so `shadow-compare` is deleted then, and the bench must either be deleted or repurposed to an absolute AST-only perf check (it can no longer compute a regex delta). D-14 keeps shadow on-demand (not a permanent CI gate) partly for this reason.
- The diff should ideally compare **full `ValidationResults`** (used keys, key→file map, dynamic findings, hardcoded candidates), not just the raw `usedKeys` set — Phase 4 D-04 wired the AST branch fully so that an end-to-end diff is meaningful. At minimum SHADOW-02/SHADOW-03 are about **used-key false-negatives**, but a richer diff catches dynamic/hardcoded drift too (gains/non-blocking).

</specifics>

<deferred>
## Deferred Ideas

- **Deleting `regex.ts`/`dynamic.ts`/`hardcoded.ts`/`scanner.ts` shim, relocating `isHardcodedIgnored` → `text.ts`, removing the `useAst` flag, BREAKING CHANGELOG, 0.4.0 version bump** — Phase 6 (CLEAN-01/CLEAN-02).
- **Repurposing/deleting `bench` and `shadow-compare` once regex is gone** — Phase 6 must handle these (both depend on the regex path). Possible: keep an absolute AST-only perf benchmark, delete the differential harness.
- **2-3 OSS projects per framework / a larger corpus** — rejected for now (D-02, one per framework). Revisit only if the single-project diff misses real-world patterns.
- **Triage-allowlist for false-negatives** — rejected (D-07, hard-block instead). Would only be reconsidered if a provably-benign FN blocks the flip.
- **Committed diff-report snapshot as an audit artifact** — rejected (D-06, scratch/ + exit code). Could be added later if an audit trail of the parity proof is wanted.
- **Public `maxConcurrency` / engine config field / CLI flag** — still deferred from Phase 4 (D-08/D-09/D-12); no large-repo demand yet.
- **`--strict-syntax` (make collected `FileParseError`s fail CI)** — deferred STRICT-01; the harness surfaces parse errors in its report but doesn't gate on them.

*(No reviewed-but-deferred todos — `todo match-phase 5` returned none. No scope creep raised during discussion.)*

</deferred>

---

*Phase: 05-shadow-comparison-perf-gate-default-flip*
*Context gathered: 2026-06-02*
