---
phase: 4
slug: async-migration-shadow-mode-on-regex-still-default
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-01
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `04-RESEARCH.md` § "Validation Architecture" (line 507).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^1.5.0 |
| **Config file** | repo root (vitest picks up `*.test.ts` co-located with source) |
| **Quick run command** | `pnpm vitest run <path-to-changed-test>` |
| **Full suite command** | `pnpm test` (`vitest run`) |
| **Type gate** | `pnpm typecheck` (`tsc --noEmit`) |
| **Estimated runtime** | ~10–20 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run the relevant `pnpm vitest run <file>` for the touched module.
- **After every plan wave:** Run `pnpm test` AND `pnpm typecheck`.
- **Before `/gsd-verify-work`:** Full suite green + `tsc --noEmit` clean + `pnpm build` succeeds.
- **Max feedback latency:** ~20 seconds.

---

## Per-Task Verification Map

> Planner fills task IDs once plans exist. Every requirement below MUST map to at least one task with an `<automated>` verify command.

| Task ID | Plan | Wave | Requirement | Secure Behavior | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------------|-----------|-------------------|--------|
| 04-XX-XX | XX | 0 | ASYNC-03 | N/A | unit (regression) | `pnpm vitest run src/core/scanner` | ⬜ pending |
| 04-XX-XX | XX | 0 | ASYNC-04 | N/A | unit (concurrency-peak) | `pnpm vitest run <pool test>` | ⬜ pending |
| 04-XX-XX | XX | 0 | SHADOW-01 | N/A | integration (`useAst:true` e2e) | `pnpm vitest run <ast-shadow test>` | ⬜ pending |
| 04-XX-XX | XX | N | ASYNC-01 | N/A | unit + type | `pnpm typecheck && pnpm vitest run src/core/scanner` | ⬜ pending |
| 04-XX-XX | XX | N | ASYNC-02 | N/A | type + suite | `pnpm typecheck && pnpm test` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Validation Architecture (criterion → check)

| Criterion | Requirement | Proof |
|-----------|-------------|-------|
| 1. async cascade + tsc clean | ASYNC-01, ASYNC-02 | `pnpm typecheck` exits 0, zero errors, after every `validate`/`extract`/`prune`/`cli.ts` caller updated |
| 2. regex-default == v0.3.0 (no regression) | SHADOW-01 | Existing suite green under `useAst:false` default (`pnpm test`) — no test modified except adding `await` |
| 3. `looseKeyMatch` after async | ASYNC-03 | New regression test: key present only in stripped-comment content still found via `fileContents[i]` after `await detectUsedKeys(...)` |
| 4. bounded pool max 4, no `Promise.all` over files | ASYNC-04 | New test: instrumented fake parse fn asserts `peakConcurrency <= 4`; second assertion with `maxConcurrency:2` override caps at 2; grep proves no `Promise.all(files...)` in scanner |
| 5. `useAst:true` end-to-end | SHADOW-01 | New `ast-shadow` integration test runs key validate/extract scenarios with `useAst:true` via opts param; all pass |

---

## Wave 0 Requirements

New test scaffolding to create before/with the implementation tasks:

- [ ] **looseKeyMatch-after-async regression** (ASYNC-03) — asserts `fileContents` populated and bare-string inclusion still works post-`await`.
- [ ] **Worker-pool concurrency-peak test** (ASYNC-04) — instrumented `fakeParse` tracking peak in-flight count ≤ 4 (and ≤ 2 with override).
- [ ] **`useAst:true` end-to-end integration test** (SHADOW-01, criterion #5) — flips the flag via opts and runs validate/extract scenarios.
- [ ] Existing `detectUsedKeys` call sites in tests ported to `await` (`src/core/scanner.test.ts:168` + any others found during planning).

*Existing vitest infrastructure covers the rest — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | — | — |

*All phase behaviors have automated verification (criteria 1–5 are all command-/test-checkable).*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 new test files above)
- [ ] No watch-mode flags (use `vitest run`, never `vitest` watch)
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
