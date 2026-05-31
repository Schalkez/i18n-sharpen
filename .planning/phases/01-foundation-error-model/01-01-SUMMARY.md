# Phase 1 / Plan 01 — Execution Summary

**Milestone:** v0.4.0 — AST Parser Rewrite
**Phase:** 01-foundation-error-model
**Executed by:** Antigravity (worker for Claude Code GSD)
**Date:** 2026-05-31

---

## Files Changed (7)

| # | File | Action | Provides |
|---|------|--------|----------|
| 1 | `src/core/scanner/parsers/types.ts` | NEW | `ParsedFileResult` (D-07) + `FileParseError` (D-02, D-08) locked contracts |
| 2 | `src/core/scanner/parsers/resolve.ts` | NEW | `loadWorkspaceDep` + `detectPackageManager` workspace dep resolver (DEP-02, D-05, D-06) |
| 3 | `src/core/errors.ts` | MODIFY | `I18nError` union extended with 5th `missing-dependency` kind (D-01, ERR-02) |
| 4 | `src/cli.ts` | MODIFY | `fatalExitCode()` exported helper + 3 catch blocks wired to 0/1/2 exit codes (ERR-03, D-03, D-04) |
| 5 | `package.json` | MODIFY | `peerDependencies.typescript >= 5.0` (optional) + `peerDependenciesMeta` (DEP-01) |
| 6 | `src/__tests__/parsers/resolve.test.ts` | NEW | 11 tests: PM detection (6), loadWorkspaceDep success/failure/cache (4), PERF-02 lazy-load spy (1) |
| 7 | `src/__tests__/cli-exit-codes.test.ts` | NEW | 6 tests: `fatalExitCode` mapping (missing-dep → 2, others → 1) |
| — | `src/core/errors.test.ts` | MODIFY | Extended union coverage + field round-trip test (+2 tests) |

## Success Criteria Confirmation

### Criterion 1: No bundled @babel ✅
```
pnpm build → ESM ⚡️ Build success
grep @babel/ dist/**  → 0 matches
grep require("typescript") dist/** → 0 matches
peerDependenciesMeta.typescript.optional === true ✅
```

### Criterion 2: Actionable missing-typescript error, no crash ✅
```
resolve.test.ts:
  ✓ throws I18nSharpenError of kind 'missing-dependency' when the package is absent
  ✓ the thrown error names the package and includes a PM-correct install command
```

### Criterion 3: Two distinct error code paths in unit tests ✅
```
errors.test.ts:
  ✓ error.kind narrows to the discriminated union variants (incl. missing-dependency)
  ✓ carries missing-dependency fields (packageName + installCommand)
  → missing-dependency = fatal, thrown I18nSharpenError
  → FileParseError = plain interface, type-checked by tsc, never thrown (D-02)
```

### Criterion 4: Exit codes documented & verified ✅
```
cli-exit-codes.test.ts:
  ✓ returns 2 for a missing-dependency error (tool-fatal)
  ✓ returns 1 for a config error
  ✓ returns 1 for a validation error
  ✓ returns 1 for a parse error (collected parse kind)
  ✓ returns 1 for a non-I18nSharpenError (plain Error)
  ✓ returns 1 for a thrown non-Error value
```

### Criterion 5: Parser not imported for JSON-only runs ✅
```
resolve.test.ts:
  ✓ loadWorkspaceDep is NOT invoked when no JS/TS file is processed (vi.spyOn)
```

## Locked Contracts for Phase 2

### ParsedFileResult (src/core/scanner/parsers/types.ts)

```typescript
export interface ParsedFileResult {
  usedKeys: { key: string; offset: number }[]
  dynamicCalls: { expression: string; arg: string; offset: number }[]
  hardcodedCandidates: { text: string; offset: number }[]
}
```

All offsets are **document-absolute** — they feed `offsetToLine` (src/core/scanner/lines.ts) unchanged (OFFSET-02). Phase 2 parsers MUST produce this exact shape.

### FileParseError (src/core/scanner/parsers/types.ts)

```typescript
export interface FileParseError {
  file: string
  line?: number
  message: string
}
```

Plain data interface — NOT an Error subclass, NEVER thrown. Accumulated during scan. Phase 2 parsers collect these for files that fail to parse.

## Decisions Realized

| ID | Decision | Implementation |
|----|----------|---------------|
| D-01 | `missing-dependency` kind distinct from `parse` | 5th union member in `I18nError`, `kind: "missing-dependency"` |
| D-02 | `FileParseError` is plain data, never thrown | `interface FileParseError` — no `extends Error`, no `class` |
| D-03 | ESLint-style exit codes 0/1/2 | `fatalExitCode()`: missing-dep → 2, others → 1 |
| D-04 | i18n findings stay 0/1 | `process.exitCode = hasErrors ? 1 : 0` unchanged (line ~109) |
| D-05 | PM-correct install command | `detectPackageManager()` checks lockfile presence |
| D-06 | Unified treatment for typescript & framework compilers | Same `loadWorkspaceDep()` for all, only `packageName` differs |
| D-07 | `ParsedFileResult` locked in Phase 1 | 3 arrays with document-absolute offsets |
| D-08 | Parser types NOT in public `src/types.ts` | Kept in `src/core/scanner/parsers/types.ts` |

## Assumptions Exercised

| ID | Assumption | Outcome |
|----|-----------|---------|
| A1 | Sync `createRequire` resolver (no async needed for module loading) | ✅ Works — `require()` is inherently sync |
| A2 | cwd-only PM detection (lockfile in project root) | ✅ Sufficient — covers pnpm/yarn/npm/bun |

## Manual Follow-Up (Not Yet Run)

Per 01-VALIDATION.md: in a temp dir with only `package.json` + `pnpm-lock.yaml` (no `typescript`), run a real `npx i18n-sharpen validate` scan on a `.ts` file. Assert:
- stderr names the file extension + `pnpm add -D typescript`
- `echo $?` prints `2`

This is an end-to-end check requiring Phase 2/3 dispatcher wiring. Unit tests fully cover the resolver + exit-code logic now.

## Test Suite Results

```
18 test files passed (18)
203 tests passed (203)
0 failures
0 regressions in pre-existing v0.3.0 tests (185)
18 new tests added
```
