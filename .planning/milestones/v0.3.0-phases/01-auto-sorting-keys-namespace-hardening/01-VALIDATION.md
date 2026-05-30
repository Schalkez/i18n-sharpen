---
phase: 1
slug: auto-sorting-keys-namespace-hardening
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-28
updated: 2026-05-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x + fast-check (property-based) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `pnpm test --run` |
| **Full suite command** | `pnpm tsc --noEmit && pnpm test --run && pnpm build` |
| **Estimated runtime** | ~3 seconds (full vitest suite, current baseline 72 tests) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run`
- **After every plan wave:** Run `pnpm tsc --noEmit && pnpm test --run && pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

> Populated from the four PLAN.md files after revision 1 (checker Blocker #1).
> File-Exists column: ✅ = file already present in repo at planning time;
> ❌ W0 = file is created by the same task that verifies it (Wave 0 / co-creation;
> acceptable because the test file lands together with the production code in
> a TDD task, and the task's `<automated>` command runs both immediately).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01   | 1    | SORT-03, SORT-04, SORT-05, SORT-06 | T-01-01, T-01-03 | sortLocaleObject is pure, recursive, idempotent; getFiles traverses deterministically (no info-leak) | unit + property | `pnpm tsc --noEmit && pnpm test --run sort && pnpm test --run` | ❌ W0 (sort.ts + sort.test.ts co-created) | ⬜ pending |
| 1-01-02 | 01   | 1    | SORT-01, SORT-02, SORT-06 | T-01-02 | --sort CLI value validated against enum literal before assignment to config | integration | `pnpm tsc --noEmit && pnpm test --run && pnpm build` | ✅ (extract.test.ts) | ⬜ pending |
| 1-02-01 | 02   | 2    | NSWRITE-03 | T-02-01 | defaultNamespace zod-validated (nonempty); two hardcoded "default" sites replaced with `?? "common"` | integration | `pnpm tsc --noEmit && pnpm test --run extract && pnpm test --run` | ✅ (extract.test.ts) | ⬜ pending |
| 1-02-02 | 02   | 2    | NSWRITE-03 | T-02-01, T-02-02, T-02-03 | warnLegacyDefaultNamespace fires only on .json/.yaml/.yml default.* (per Warning #4); FORBIDDEN_KEY_SEGMENTS guard unaffected | integration | `pnpm tsc --noEmit && pnpm test --run extract && pnpm test --run && pnpm build` | ❌ W0 (migration-warnings.ts co-created with test fixtures in extract.test.ts) | ⬜ pending |
| 1-03-01 | 03   | 3    | NSWRITE-04 | T-03-01, T-03-02, T-03-03, T-03-04 | cleanEmpty doubly-gated (flag + namespaced layout); fs.unlinkSync only — never rmdirSync/rmSync; parent <lang>/ preserved | integration | `pnpm tsc --noEmit && pnpm test --run prune && pnpm test --run && pnpm build` | ✅ (prune.test.ts) | ⬜ pending |
| 1-04-01 | 04   | 4    | NSWRITE-05 | T-04-01, T-04-02, T-04-03, T-04-04, T-04-06 | writeLocaleFilesAtomic two-phase commit; Phase A failure cleans all .tmp; Phase B failure logs committed vs pending; JS/TS extension refused mid-batch | unit | `pnpm tsc --noEmit && pnpm test --run atomic && pnpm test --run` | ❌ W0 (writeLocaleFilesAtomic + atomic.test.ts co-created) | ⬜ pending |
| 1-04-02 | 04   | 4    | NSWRITE-05 | T-04-01, T-04-05 | extractNamespaced + executePrunePlans use writeLocaleFilesAtomic; extractFlat intentionally NOT migrated (per Warning #3); transform.ts FORBIDDEN_KEY_SEGMENTS guards unaffected | integration | `pnpm tsc --noEmit && pnpm test --run && pnpm build` | ✅ (extract.test.ts + prune.test.ts) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

### Threat-Reference Legend

| Threat ID | Plan | Disposition | Where Mitigated |
|-----------|------|-------------|-----------------|
| T-01-01 | 01 | accept | Existing FORBIDDEN_KEY_SEGMENTS in transform.ts gates input before sort sees it |
| T-01-02 | 01 | mitigate | cli.ts validates `cmdOpts.sort` against enum literal array; invalid → log.error + exit 1 |
| T-01-03 | 01 | accept | Traversal order not sensitive in single-process CLI |
| T-01-04 | 01 | accept | Locale objects bounded; sort O(n log n) over flatten's existing bounds |
| T-02-01 | 02 | mitigate | zod `z.string().nonempty()`; path traversal documented as user-trust-bound (config) |
| T-02-02 | 02 | accept | Warning text contains language codes only (non-sensitive) |
| T-02-03 | 02 | accept (regression) | Post-edit grep on FORBIDDEN_KEY_SEGMENTS verifies guard intact |
| T-03-01 | 03 | mitigate | Triple gate: explicit flag + layout check + post-write timing; per-file unlink only |
| T-03-02 | 03 | accept | Paths come from readdirSync of localesDir; cannot contain `/` or `\` |
| T-03-03 | 03 | mitigate | Acceptance criterion: `grep -n "rmdirSync\|rmSync" src/commands/prune/plans.ts` returns 0 |
| T-03-04 | 03 | accept (regression) | Post-edit grep verifies FORBIDDEN_KEY_SEGMENTS guard intact |
| T-04-01 | 04 | mitigate | Documented limited Phase B window; clear committed-vs-pending error message |
| T-04-02 | 04 | accept | .tmp files preserved by design per D-10 — never auto-rollback |
| T-04-03 | 04 | mitigate | Phase A cleanup loop; error message includes "No original files were modified" |
| T-04-04 | 04 | mitigate | JS_TS_EXTENSIONS guard delegated per plan in atomic helper |
| T-04-05 | 04 | accept (regression) | Post-edit grep on FORBIDDEN_KEY_SEGMENTS |
| T-04-06 | 04 | mitigate | atomic.test.ts case 4 asserts "Committed" + "Pending" substrings in error |

---

## Wave 0 Requirements

- [x] `src/__tests__/sort.test.ts` — created by Task 1-01-01 alongside `src/core/locale-io/sort.ts`. Covers D-03 / D-04 / D-05 / D-06 / D-11 including property-based idempotency + keys-set invariance via fast-check (per Plan 01-01 Task 1 Step D, ≥9 unit cases + ≥2 `fc.assert` property tests).
- [x] `src/__tests__/atomic.test.ts` — created by Task 1-04-01 alongside the `writeLocaleFilesAtomic` helper. Covers D-10 Phase A (`vi.spyOn(fs, 'writeFileSync')`) and Phase B (`vi.spyOn(fs, 'renameSync')`) failure modes plus happy / empty-plans / JS-TS-refusal cases (per Plan 01-04 Task 1 Step C, ≥5 `it(` cases, ≥2 `vi.spyOn(fs` calls).
- [x] No framework installation needed — vitest + fast-check already present in `package.json`.

**Co-creation rationale (Nyquist compliance):** Both Wave 0 test files are co-created with their corresponding production code within a single TDD task (`tdd="true"` in the PLAN frontmatter). The task's `<automated>` verify command runs the test against the just-written production code immediately, satisfying the Nyquist sampling requirement without a separate Wave 0 task. The checker explicitly accepted this co-creation pattern in Blocker #1's fix guidance ("every task has an `<automated>` verify; Wave 0 files `sort.test.ts` + `atomic.test.ts` are co-created in their plan tasks, not blocked on a separate wave").

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-machine `Intl.Collator` determinism (D-12) | SORT-03 | Cannot meaningfully test from a single Node version inside CI | Trust ICU contract; document Node-version policy in CHANGELOG if drift is observed in field |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — every row in the Per-Task Verification Map has a non-empty Automated Command column derived from the plan's `<verify><automated>` element.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify — every task in every wave runs `pnpm test --run` at minimum.
- [x] Wave 0 covers all MISSING references — `sort.test.ts` co-created in Task 1-01-01, `atomic.test.ts` co-created in Task 1-04-01; both file paths flagged ❌ W0 in the verification map.
- [x] No watch-mode flags — every Automated Command uses `--run` (non-watch).
- [x] Feedback latency < 10s — full vitest suite ~3s baseline; +sort/atomic/integration ≈ ≤5s expected.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** ready (revision 1 — populated per checker Blocker #1)
