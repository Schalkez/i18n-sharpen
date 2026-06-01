---
phase: 3
slug: framework-parsers-dispatcher
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-01
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `03-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest `^1.5.0` [VERIFIED: package.json] |
| **Config file** | `vitest.config.ts` (root) with `vite-tsconfig-paths` |
| **Quick run command** | `pnpm vitest run src/__tests__/parsers/` |
| **Full suite command** | `pnpm test` (runs `vitest run`) |
| **Estimated runtime** | ~10 seconds (parser subset); full suite < 30s |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run src/__tests__/parsers/`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd-verify-work`:** Full suite green + `pnpm tsc --noEmit` + `pnpm build`
- **Max feedback latency:** ~10 seconds (parser subset)

---

## Per-Task Verification Map

> Task IDs are assigned by the planner. This map binds each phase requirement to its
> automated test seam and the test file that must exist (all are Wave 0 deliverables).

| Plan/Test File | Wave | Requirement | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|----------------|------|-------------|-----------------|-----------|-------------------|-------------|--------|
| `dispatcher.test.ts` | by-plan | PARSE-06 | routes `.vue`→Vue, `.svelte`→Svelte, `.astro`→Astro, `.ts/.tsx/.js/.jsx`→TS; unknown ext → empty result, no crash | unit | `pnpm vitest run src/__tests__/parsers/dispatcher.test.ts` | ❌ W0 | ⬜ pending |
| `vue.test.ts` | by-plan | FW-01 | `<script setup>` and legacy `<script>` produce identical key extraction; template `i18nKey="..."` extracted as usedKey | integration | `pnpm vitest run src/__tests__/parsers/vue.test.ts` | ❌ W0 | ⬜ pending |
| `svelte.test.ts` | by-plan | FW-02 | v5 (`modern: true`, `ast.fragment`) and v4 (`ast.html`) both parse same fixture → same keys, no crash | integration | `pnpm vitest run src/__tests__/parsers/svelte.test.ts` | ❌ W0 | ⬜ pending |
| `astro.test.ts` | by-plan | FW-03 | 10 concurrent parses return identical results (no WASM init race) | integration | `pnpm vitest run src/__tests__/parsers/astro.test.ts` | ❌ W0 | ⬜ pending |
| all framework test files | by-plan | FW-04 | offset for key in embedded `<script>` maps to correct line in **original** file (specific line-number assertions) | integration | `pnpm vitest run src/__tests__/parsers/` | ❌ W0 | ⬜ pending |
| `vue/svelte/astro.test.ts` | by-plan | FW-05 | missing compiler → fatal `I18nSharpenError` `kind: "missing-dependency"` naming package + install command | unit | per-parser test file | ❌ W0 | ⬜ pending |
| all framework test files | by-plan | TEST-04 | single-file syntax error → `FileParseError` collected (not thrown); other files continue | integration | `pnpm vitest run src/__tests__/parsers/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Critical Test Seams (from research)

1. **Vue `<script setup>` vs legacy `<script>` parity** (FW-01, SC-1) — two semantically equivalent fixtures; assert both yield the same `usedKeys` (`hero.title` + template `nav.home`).
2. **Svelte v4/v5 dual-mode** (FW-02, SC-2) — mock `createRequire`/`svelte/package.json` `version` to drive both `{ modern: true }` (`ast.fragment`) and legacy (`ast.html`) paths against the same fixture; assert same keys, no crash.
3. **10-concurrent Astro parse race** (FW-03, SC-3) — `Promise.all` of 10 `parseAstroFile` calls on the same source; assert all 10 `usedKeys` identical.
4. **Embedded-script line-number assertions** (FW-04, SC-4) — fixtures with a key on a known line; assert `offsetToLine(computeLineOffsets(src), offset)` equals the exact original-file line. **This is the highest-value seam** — it catches offset-rebasing bugs (e.g. Vue's `loc.start.offset` pointing at `<` of the tag, not content start — research assumption A1).
5. **Missing-compiler fatal error** (FW-05, SC-5) — redirect `loadWorkspaceDep` to throw for the compiler; assert `I18nSharpenError` with `kind: "missing-dependency"`, message naming package + valid install command.
6. **Single-file syntax-error collect-and-continue** (TEST-04, D-17) — broken script block; assert `errors.length === 1`, `errors[0].file` set, `result.usedKeys` empty, nothing thrown.

---

## Wave 0 Requirements

- [ ] `src/__tests__/parsers/vue.test.ts` — FW-01, FW-04 (Vue offsets), FW-05, D-17 (syntax error)
- [ ] `src/__tests__/parsers/svelte.test.ts` — FW-02, FW-04 (Svelte offsets), FW-05, D-17
- [ ] `src/__tests__/parsers/astro.test.ts` — FW-03, FW-04 (Astro offsets), FW-05, D-17, 10-concurrent race
- [ ] `src/__tests__/parsers/dispatcher.test.ts` (or `index.test.ts`) — PARSE-06 routing
- [ ] Fixture `.vue`, `.svelte`, `.astro` files (or inline source strings) with **known key positions and line numbers**
- [ ] Framework peer deps installed as devDependencies (`@vue/compiler-sfc`, `svelte`, `@astrojs/compiler`) — research found `package.json` is missing these; required before any framework test can run

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | All phase behaviors have automated verification | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (test files + fixtures + peer-dep install)
- [ ] No watch-mode flags (use `vitest run`, not `vitest`)
- [ ] Feedback latency < 10s for parser subset
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
