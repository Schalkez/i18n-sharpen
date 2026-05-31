# Phase 1: Foundation & Error Model - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-31
**Phase:** 1-Foundation & Error Model
**Areas discussed:** Error-kind taxonomy, Exit code scheme, Install-command UX, Shared type scope

---

## Error-kind taxonomy

### Q1 — How to model the fatal missing compiler/`typescript` error in the `I18nError` union

| Option | Description | Selected |
|--------|-------------|----------|
| New `missing-dependency` kind | `{ kind:'missing-dependency'; packageName; installCommand; message }`, distinct from `parse`, structured + testable | ✓ |
| Generic `dependency` kind | `{ kind:'dependency'; message }`, hint baked into message only | |
| Let Claude decide | Pick during planning | |

**User's choice:** New `missing-dependency` kind
**Notes:** Structured fields support cli.ts rendering and the unit tests required by Success Criterion 3.

### Q2 — How to represent a COLLECTED (non-thrown) file-syntax error

| Option | Description | Selected |
|--------|-------------|----------|
| Separate data type | `FileParseError { file; line?; message }` accumulated in the result, NOT an I18nSharpenError | ✓ |
| Reuse I18nError shape | `{ kind:'parse', ... }` objects in a collected list for shape-consistency | |
| Let Claude decide | Decide during planning | |

**User's choice:** Separate data type
**Notes:** Preserves the documented "library only ever throws I18nSharpenError" invariant; collected errors are returned data, not thrown.

---

## Exit code scheme

### Q3 — Exit-code mapping for ERR-03

| Option | Description | Selected |
|--------|-------------|----------|
| 0 / 1 / 2 (ESLint-style) | 0 clean; 1 i18n findings; 2 tool-fatal (missing dep, config error) | ✓ |
| Keep 0/1, document only | 0 clean; 1 any failure — minimal change | |
| Finer: 0/1/2/3 | 0 clean; 1 validation; 2 missing-dependency; 3 file-parse | |

**User's choice:** 0 / 1 / 2 (ESLint-style)
**Notes:** Familiar to CI authors; cleanly satisfies ERR-03's "distinguish parse/tool failures from validation failures."

### Q4 — Do collected parse errors change the exit code by default?

| Option | Description | Selected |
|--------|-------------|----------|
| No — stays i18n-driven | Reported but exit stays 0/1; future `--strict-syntax` (STRICT-01) opts in | ✓ |
| Yes — force exit 2 | Any collected parse error makes the run exit non-zero | |
| Let Claude decide | Decide during planning | |

**User's choice:** No — stays i18n-driven
**Notes:** Keeps "one bad file ≠ failed CI"; leaves the hook for the deferred `--strict-syntax`.

---

## Install-command UX

### Q5 — What install command should the missing-dependency error show?

| Option | Description | Selected |
|--------|-------------|----------|
| Detect PM from lockfile | pnpm-lock→pnpm, yarn.lock→yarn, package-lock→npm, bun.lockb→bun; fallback npm | ✓ |
| Always `npm install -D` | Universal, simplest, wrong ceremony for pnpm/yarn | |
| Show all variants | Print npm + pnpm + yarn lines | |
| Let Claude decide | Decide during planning | |

**User's choice:** Detect PM from lockfile
**Notes:** Most actionable for the user's actual setup.

### Q6 — Treat missing `typescript` same as a missing framework compiler, or special-case?

| Option | Description | Selected |
|--------|-------------|----------|
| Unified treatment | One resolver, one `missing-dependency` error, different package name | ✓ |
| Special-case TS | Extra guidance noting TS is normally already present | |
| Let Claude decide | Decide during planning | |

**User's choice:** Unified treatment
**Notes:** Simplest and consistent across all 5 supported extensions.

---

## Shared type scope

### Q7 — Lock the `ParsedFileResult` contract in Phase 1 or defer to Phase 2?

| Option | Description | Selected |
|--------|-------------|----------|
| Lock contract now | Define `ParsedFileResult { usedKeys, dynamicCalls, hardcodedCandidates }` w/ document-absolute offsets in Phase 1 | ✓ |
| Defer to Phase 2 | Parser author defines it when writing the producer | |
| Let Claude decide | Decide during planning | |

**User's choice:** Lock contract now
**Notes:** Matches the roadmap framing ("shared types every parser depends on"); gives Phase 2/3 a stable target. Member field shapes still refined in Phase 2.

### Q8 — Which file holds the parser contracts?

| Option | Description | Selected |
|--------|-------------|----------|
| New parsers/types.ts | Dedicated `src/core/scanner/parsers/types.ts` (per seed), out of public surface | ✓ |
| Extend src/types.ts | Put them in the existing shared types file | |
| Let Claude decide | Decide during planning | |

**User's choice:** New parsers/types.ts
**Notes:** Keeps parser-internal contracts off the public `src/types.ts` API surface.

---

## Claude's Discretion

- Lazy-load mechanism for PERF-02 (behavior fixed: zero cold-start on JSON-only runs).
- Resolver internals (`createRequire(cwd)` / `require.resolve` paths, resolved-module caching).
- Peer-dep declaration mechanics (must add no new bundled runtime dep).
- Exact member field shapes inside `ParsedFileResult` (refined Phase 2).
- Test file layout / naming.

## Deferred Ideas

- `--strict-syntax` mode (STRICT-01) — make collected parse errors fail CI.
- Bundled slim-Babel fallback (DEPFALL-01) — for no-`typescript` projects.
