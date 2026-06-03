---
phase: 5
slug: shadow-comparison-perf-gate-default-flip
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-02
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (via `vite-tsconfig-paths`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm vitest run src/__tests__/ast-shadow.test.ts` |
| **Full suite command** | `pnpm test` |
| **Gate scripts** | `pnpm shadow` (SHADOW-02/03, exit 0 = zero false-negatives) · `pnpm bench` (PERF-01, exit 0 = ≤100ms delta) |
| **Estimated runtime** | ~10–30s full suite; +1–5s per gate script |

---

## Sampling Rate

- **After every task commit:** Run `pnpm tsc --noEmit && pnpm test`
- **After every plan wave:** Run `pnpm tsc --noEmit && pnpm test && pnpm build`
- **After gate-script tasks land:** `pnpm shadow` (must exit 0) and `pnpm bench` (must exit 0) before the flip task
- **Before `/gsd-verify-work`:** Full suite green + both gate scripts exit 0 + flip is the last commit
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Task IDs are finalized by the planner. The requirement→behavior→command mapping below is the contract each plan task must satisfy.

| Requirement | Behavior | Test Type | Automated Command | File Exists |
|-------------|----------|-----------|-------------------|-------------|
| SHADOW-02 | `scripts/shadow-compare.ts` runs regex + AST over corpus, emits JSON report + stdout summary | smoke (script runs, report written) | `pnpm shadow` | ❌ W0 |
| SHADOW-03 | Zero false-negatives → `shadow-compare` exits 0; any false-negative → exit 1 | smoke (exit code) | `pnpm shadow` exits 0 | ❌ W0 |
| PERF-01 | AST median − regex median ≤ 100ms over the deterministic slice | smoke (exit code) | `pnpm bench` exits 0 | ❌ W0 |
| PERF-01 (CI) | `pnpm bench` wired into `.github/workflows/ci.yml` build-test job | CI config | grep `bench` in ci.yml; CI run on push | ❌ W0 |
| SHADOW-03 / crit #4 | Default engine (no explicit `useAst`) runs the AST path (D-16 guard) | unit | `pnpm vitest run src/__tests__/ast-shadow.test.ts` | ❌ W0 |
| crit #4 | Full suite passes with AST as the default driver | unit/integration | `pnpm test` | ✅ (extends after flip) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scratch/` added to `.gitignore` (currently NOT ignored — report + test temp dirs write there)
- [ ] `tsx` added to `package.json` devDependencies (no runtime dep added — honors D-10)
- [ ] `scripts/*.ts` brought under typecheck (extend `tsconfig.json` `include` to `["src","scripts"]` or add `tsconfig.scripts.json`; preserve `@/` alias)
- [ ] `tests/corpus/` created + `SOURCES.md` provenance manifest (D-03)
- [ ] Corpus files vendored for all four frameworks (D-01/D-02, SHAs pinned per RESEARCH.md)
- [ ] `scripts/shadow-compare.ts` created (SHADOW-02)
- [ ] `scripts/bench.ts` created (PERF-01)
- [ ] `package.json` scripts: `"shadow"` and `"bench"` entries
- [ ] `.github/workflows/ci.yml`: `pnpm bench` step added (D-14)
- [ ] D-16 default-is-AST guard test added to `src/__tests__/ast-shadow.test.ts`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Corpus SHA re-pinning at vendoring time | SHADOW-02 (D-03) | Requires live `gh api`/`git clone` to fetch + record exact SHA used | Executor runs `gh api repos/{owner}/{repo}/commits/main`, vendors files, records actual SHA in `SOURCES.md` |
| GitNexus impact analysis before flip | SHADOW-03 (CLAUDE.md) | MCP impact call + human risk review per project rules | Run `gitnexus_impact` on each flip site; report HIGH/CRITICAL to user before the flip commit |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
