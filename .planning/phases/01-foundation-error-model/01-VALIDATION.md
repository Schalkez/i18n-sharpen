---
phase: 1
slug: foundation-error-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-31
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `01-RESEARCH.md` §Validation Architecture (all commands verified against the live toolchain).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.6.1 (already installed) |
| **Config file** | `vitest.config.ts` (uses `vite-tsconfig-paths` for the `@/` alias) |
| **Quick run command** | `pnpm vitest run <path/to/test.ts>` |
| **Full suite command** | `pnpm test` (= `vitest run`) |
| **Typecheck command** | `pnpm tsc --noEmit` |
| **Build verify command** | `pnpm build && (grep -r "@babel/" dist/ && exit 1 \|\| exit 0)` |
| **Estimated runtime** | ~10 seconds (small unit suite; build verify adds ~5s) |

---

## Sampling Rate

- **After every task commit:** `pnpm tsc --noEmit && pnpm vitest run <changed-test-file>`
- **After every plan wave:** `pnpm test && pnpm build`
- **Phase gate (before `/gsd-verify-work`):** `pnpm tsc --noEmit && pnpm test && pnpm build && grep -r "@babel/" dist/` must ALL pass
- **Max feedback latency:** ~10 seconds (quick run)

---

## Per-Task Verification Map

> Task IDs / Plan / Wave columns are assigned during planning (PLAN.md files do not exist yet).
> The rows below are the requirement→test contract the planner must satisfy: every requirement
> must map to at least one task whose `<acceptance_criteria>` runs the listed command.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | DEP-01 | — | N/A | build-grep | `pnpm build && (grep -r "@babel/" dist/ && exit 1 \|\| exit 0)` | ❌ W0 (build check) | ⬜ pending |
| TBD | TBD | TBD | DEP-01 | — | N/A | unit | `pnpm vitest run src/__tests__/parsers/resolve.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEP-02 | — | Missing dep → actionable `I18nSharpenError`, no crash | unit | `pnpm vitest run src/__tests__/parsers/resolve.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ERR-01 | — | `FileParseError` is plain data, never thrown | type+unit | `pnpm tsc --noEmit` + `pnpm vitest run src/__tests__/parsers/resolve.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ERR-02 | — | `missing-dependency` kind distinct from `parse` | unit | `pnpm vitest run src/core/errors.test.ts` | ✅ (needs extension) | ⬜ pending |
| TBD | TBD | TBD | ERR-03 | — | `fatalExitCode(missingDep)===2`, others `===1` | unit | `pnpm vitest run src/__tests__/cli-exit-codes.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | OFFSET-02 | — | `ParsedFileResult` offsets feed `offsetToLine` unchanged | unit | `pnpm vitest run src/__tests__/lines.test.ts` | ✅ (lines.ts unchanged) | ⬜ pending |
| TBD | TBD | TBD | PERF-02 | — | `loadWorkspaceDep` not called for JSON-only file list | unit | `pnpm vitest run src/__tests__/parsers/resolve.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

New test files / scaffolding that must exist before implementation tasks run:

- [ ] `src/core/scanner/parsers/` — directory must be created (does not exist yet)
- [ ] `src/__tests__/parsers/resolve.test.ts` — covers DEP-01, DEP-02, ERR-01, PERF-02 (detectPackageManager, loadWorkspaceDep success/failure/cache, lazy-load `vi.spyOn` assertion)
- [ ] `src/__tests__/cli-exit-codes.test.ts` — covers ERR-03 (`fatalExitCode` returns 2 for missing-dependency, 1 for others)
- [ ] Extend `src/core/errors.test.ts` — covers ERR-02 (add `missing-dependency` to the union-coverage assertion)

*OFFSET-02 reuses existing `src/__tests__/lines.test.ts` (lines.ts unchanged). DEP-01 build-grep is a CI check, not a test file.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real `npx i18n-sharpen` run in a workspace with no `typescript` exits 2 with the PM-correct install command | DEP-02 / ERR-03 | Full CLI integration against a separate temp project; unit tests mock the resolver | In a temp dir with only a `package.json` + `pnpm-lock.yaml` (no `typescript`), run the scan command on a `.ts` file; assert stderr names the file extension + `pnpm add -D typescript` and `echo $?` prints `2` |

*All other phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (parsers/ dir + 2 new test files + errors.test.ts extension)
- [ ] No watch-mode flags (`vitest run`, never `vitest --watch`)
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
