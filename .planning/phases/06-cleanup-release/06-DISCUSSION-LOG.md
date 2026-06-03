# Phase 6: Cleanup & Release - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-03
**Phase:** 6-Cleanup & Release
**Areas discussed:** Release scope, Transitional tooling fate, README / docs update, Test cleanup approach

---

## Gray Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| Release scope | How far "Release" goes — version+CHANGELOG vs tag vs publish | ✓ |
| Transitional tooling fate | Fate of shadow-compare.ts / bench.ts after regex deletion | ✓ |
| README / docs update | README async-API correctness + migration + peer deps | ✓ |
| Test cleanup approach | Principle for dropping/repointing orphaned tests | ✓ |

**User's choice:** All four areas selected.

---

## Release scope

| Option | Description | Selected |
|--------|-------------|----------|
| Prep + git tag | Bump 0.4.0 + BREAKING CHANGELOG + commit + annotated tag v0.4.0; stop before npm publish | ✓ |
| Prep only (no tag) | Version + CHANGELOG + commit; no tag, no publish | |
| Full publish to npm | Above + `npm publish` (+ optional GitHub release) | |

**User's choice:** Prep + git tag.
**Notes:** Matches existing tag convention (v0.2.1…v0.3.0). Actual `npm publish` stays a deliberate manual/CI step after the phase.

---

## Transitional tooling fate

| Option | Description | Selected |
|--------|-------------|----------|
| Delete shadow, keep AST bench | Delete shadow-compare.ts + `shadow` script; repurpose bench.ts to absolute AST-only timing, keep `pnpm bench` in CI | ✓ |
| Delete both entirely | Remove both scripts + package scripts + the CI bench step | |
| Keep both, stub regex | Keep a minimal regex path alive for the tooling (rejected by milestone Out-of-Scope) | |

**User's choice:** Delete shadow, keep AST bench.

### Follow-up: repurposed bench CI behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Report-only smoke | Prints AST timing in CI, does not fail the build on a threshold | ✓ |
| Hard gate on absolute budget | Fail CI past an absolute ms budget (risks runner-variance flake) | |
| Drop from CI, local only | Remove the CI step; keep `pnpm bench` as a manual script | |

**User's choice:** Report-only smoke.
**Notes:** Honors Phase 5 D-09's rejection of absolute baselines (machine-to-machine variance) while retaining a perf signal.

---

## README / docs update

| Option | Description | Selected |
|--------|-------------|----------|
| Full README update | Async API examples + "Migration to 0.4.0" + optional peer-dep install instructions | ✓ |
| Minimal: fix wrong examples | Only correct sync→async code examples + short migration note | |
| CHANGELOG-only, defer README | Do only CLEAN-02's CHANGELOG; defer all README edits | |

**User's choice:** Full README update.
**Notes:** README Programmatic API currently shows the now-incorrect synchronous API (`const results = validate(...)`); shipping that with a breaking release would mislead users.

---

## Test cleanup approach

| Option | Description | Selected |
|--------|-------------|----------|
| Surgical: verify-then-delete | Confirm coverage exists in AST parser tests before dropping; repoint shared fns; de-flag ast-shadow rather than delete | ✓ |
| Delete-by-file | Drop dynamic/hardcoded/core-scanner test files wholesale; repoint only isHardcodedIgnored | |
| Researcher maps each test | Lock the principle, leave exact per-test disposition to researcher/planner | |

**User's choice:** Surgical: verify-then-delete.
**Notes:** Never silently lose behavioral coverage; suite stays green. `isHardcodedIgnored` tests repoint to `text.ts`; `ast-shadow.test.ts` `useAst:true` calls get de-flagged, not deleted.

---

## Claude's Discretion

- CHANGELOG migration-snippet depth/wording.
- Commit ordering/atomicity of deletions (move `isHardcodedIgnored` first, version-bump + tag as isolated final step).
- Repurposed bench implementation details (warmup, N, output format) — dependency-free, report-only.
- Exact per-function survival in `scanner.test.ts` (mapped during research).
- Whether `escapeRegex` removal needs a consumer grep first / whether `utils.ts` survives.

## Deferred Ideas

- `npm publish` / GitHub release automation (D-01 stops at tag).
- STRICT-01 (`--strict-syntax`), CACHE-01 (parse cache), DEPFALL-01 (slim-Babel fallback).
- Larger shadow corpus / public `maxConcurrency` / engine config (rejected/deferred in Phase 5).
