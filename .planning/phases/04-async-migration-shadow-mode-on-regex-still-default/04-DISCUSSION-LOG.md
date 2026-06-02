# Phase 4: Async Migration (shadow mode on, regex still default) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 4-async-migration-shadow-mode-on-regex-still-default
**Areas discussed:** AST wiring depth, useAst flag surface, detectUsedKeys signature, Concurrency pool, Parse-error handling

---

## Gray-area selection

| Option | Description | Selected |
|--------|-------------|----------|
| AST wiring depth | How much of validate parsedResults drives when useAst:true | ✓ |
| useAst flag surface | Internal param / config field / hidden CLI flag / env var | ✓ |
| detectUsedKeys signature | Options object vs positional growth vs hybrid | ✓ |
| Concurrency pool | Hand-rolled vs p-limit; configurable vs fixed | ✓ |

**User's choice:** All four areas selected.

---

## AST Wiring Depth

| Option | Description | Selected |
|--------|-------------|----------|
| Full wiring | In AST mode, parsedResults drives used keys, key→file map, dynamic findings AND hardcoded candidates; regex re-scan loop runs only in regex mode | ✓ |
| Keys + key→files only | AST drives used keys + key→file map; dynamic + hardcoded still regex even in AST mode | |
| Keys only (minimal) | AST produces only usedKeys; everything else stays regex | |

**User's choice:** Full wiring
**Notes:** Makes roadmap criterion #5 ("wired end-to-end, testable") real and lets the Phase 5 shadow diff compare true end-to-end ValidationResults. validate branches on useAst into two equivalent code paths (D-04/D-05).

---

## useAst Flag Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Internal option only | Param on detectUsedKeys + threaded through command options args; no public config/CLI/env surface | ✓ |
| Config field (public) | Add useAst/experimentalAst to I18nSharpenConfig (zod + public types) | |
| Hidden CLI flag | Undocumented --experimental-ast in cli.ts | |
| Env var | e.g. I18N_SHARPEN_AST=1 | |

**User's choice:** Internal option only
**Notes:** Lowest commitment mid-milestone; public surface stays byte-identical with the regex default. Tests + Phase 5 harness flip it directly (D-08/D-09).

---

## detectUsedKeys Signature

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: 3 positional + opts | Keep (files, matchFunctions, matchAttributes) positional, add trailing opts for cwd/useAst/maxConcurrency | ✓ |
| Full options object | detectUsedKeys({ files, matchFunctions, matchAttributes, cwd, useAst, maxConcurrency }) | |
| Grow positional args | (files, matchFunctions, matchAttributes, cwd, useAst?, maxConcurrency?) | |

**User's choice:** Hybrid: 3 positional + opts
**Notes:** Async migration already forces `await` at every call site; hybrid keeps ported regex tests' 3 positional args and avoids a 6-arg smell (D-10).

---

## Concurrency Pool

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled, fixed 4 | Zero-dep worker pool; concurrency hardcoded to 4, no public knob | ✓ |
| Hand-rolled, configurable | Same pool, maxConcurrency exposed as a user knob | |
| Tiny dependency (p-limit) | Use p-limit for the pool | |

**User's choice:** Hand-rolled, fixed 4
**Notes:** Honors the tiny-dep constraint (no new runtime dep). maxConcurrency kept as an internal test/harness override only, not user-configurable (D-11/D-12).

---

## Parse-error handling (follow-up opened by Full wiring)

| Option | Description | Selected |
|--------|-------------|----------|
| Return + log warnings | detectUsedKeys returns collected parseErrors; validate/extract/prune log them as warnings | ✓ |
| Return, don't display yet | Thread parseErrors through return but don't print until Phase 5 | |
| Log internally, keep 3-field return | log.warn inside detectUsedKeys; no new return field | |

**User's choice:** Return + log warnings
**Notes:** Extends ASYNC-01's return shape with `parseErrors: FileParseError[]` (D-01/D-14). Collect-and-continue (ERR-01) stays visible behind the flag; Phase 5's shadow harness gets the error data programmatically.

---

## Claude's Discretion

- Internal worker-pool structure (queue vs index counter), naming, file location.
- Inline `if (useAst)` vs extracted helpers for the validate branch (must yield equivalent ValidationResults).
- `log.warn` wording for collected parseErrors.
- opts defaulting (`cwd ?? process.cwd()`, `maxConcurrency ?? 4`, `useAst ?? false`).
- JSDoc/example updates in src/index.ts to show `await`.

## Deferred Ideas

- Public maxConcurrency config field / CLI flag.
- Exposing the AST engine to users (config/CLI/env) — default flip is Phase 5, flag removed Phase 6.
- Shadow harness + perf gate + default flip (Phase 5).
- Regex module deletion + isHardcodedIgnored relocation + flag removal (Phase 6).
- `--strict-syntax` mode (STRICT-01).
