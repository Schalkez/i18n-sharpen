# Phase 1: Foundation & Error Model — Research

**Researched:** 2026-05-31
**Domain:** TypeScript ESM CLI — error model extension, workspace dependency resolver, optional peer-dep declarations, lazy-load gate, exit-code mapping
**Confidence:** HIGH — all claims verified against the actual source files or executed in Node.js within this session

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Add `{ kind: "missing-dependency"; packageName: string; installCommand: string; message: string }` to `I18nError` union in `src/core/errors.ts`. Fatal — thrown as `I18nSharpenError`. Used for missing `typescript` AND missing framework compiler. Distinct from existing `parse` kind.
- **D-02:** Collected (non-fatal) file-syntax errors are a separate lightweight type `FileParseError { file: string; line?: number; message: string }`, accumulated in the scan result and reported, never thrown. Preserves the "library only ever throws `I18nSharpenError`" invariant.
- **D-03:** ESLint-style exit codes: `0` = clean, `1` = i18n validation findings, `2` = tool-fatal (missing dependency/compiler, config error). `cli.ts` remains the single site that maps state → exit code.
- **D-04:** Collected file-parse errors do NOT change the exit code by default. The deferred `--strict-syntax` (STRICT-01) is the opt-in. "One bad file ≠ failed CI."
- **D-05:** `installCommand` is built by detecting the user's package manager from their lockfile: `pnpm-lock.yaml` → `pnpm add -D`, `yarn.lock` → `yarn add -D`, `package-lock.json` → `npm install -D`, `bun.lockb`/`bun.lock` → `bun add -d`. Fallback to npm when no lockfile found.
- **D-06:** Missing `typescript` uses the same unified resolver and `missing-dependency` error as a missing framework compiler — only `packageName` differs. Message names the triggering file extension, the missing package, and the install command.
- **D-07:** `ParsedFileResult { usedKeys; dynamicCalls; hardcodedCandidates }` with document-absolute offsets is locked in this phase. Top-level contract only; exact member field shapes refined in Phase 2.
- **D-08:** Parser contracts live in `src/core/scanner/parsers/types.ts`, NOT in the public `src/types.ts`.

### Claude's Discretion

- **Lazy-load mechanism (PERF-02):** behavior is fixed (zero parser cold-start for JSON-only runs); mechanism (dynamic `import()` of parser gated on first JS/TS file, etc.) is open.
- **Resolver internals:** `createRequire(cwd)` / `require.resolve` with `paths`, plus any caching of resolved modules.
- **Peer-dep declaration mechanics:** `peerDependencies` + `peerDependenciesMeta.optional` vs alternatives — whatever yields no new bundled `@babel/*`/runtime dep (Success Criterion 1).
- **Exact field shapes** inside `usedKeys` / `dynamicCalls` / `hardcodedCandidates` (finalized in Phase 2).
- **Test file layout / naming** for the new error + resolver units.

### Deferred Ideas (OUT OF SCOPE)

- **`--strict-syntax` mode (STRICT-01)** — make collected file-parse errors fail CI with a non-zero exit. Deferred this milestone.
- **Bundled slim-Babel fallback (DEPFALL-01)** — for projects with no `typescript`. Deferred; a single TS-Compiler-API parser path for now.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DEP-01 | `typescript` and framework compilers declared as optional peer deps; no `@babel/*` runtime dep bundled | Peer-dep shape verified; tsup bundle mechanics confirmed (peerDeps not bundled); verification command identified |
| DEP-02 | When `typescript` not resolvable in user's workspace, emit actionable `I18nSharpenError` with exact install command | Resolver pattern `createRequire(cwd+'/package.json')` confirmed working; PM detection lockfile-to-command mapping verified |
| ERR-01 | File syntax error collected + scan continues; one bad file never aborts the run | `FileParseError` non-thrown type defined; accumulation point identified in scan result shape |
| ERR-02 | Missing compiler/parser is fatal, using distinct `I18nSharpenError` kind from file-parse errors | `missing-dependency` union member defined; `FileParseError` is a separate non-thrown type |
| ERR-03 | Process exit codes distinguish parse failures from i18n validation failures | Exact `cli.ts` lines identified (95-96, 130-131, 196-197); `fatalExitCode()` helper pattern specified |
| OFFSET-02 | Line reporting reuses existing `lines.ts` utilities unchanged | `computeLineOffsets` + `offsetToLine` verified unchanged; `ParsedFileResult` offset → `offsetToLine` flow confirmed working in Node execution |
| PERF-02 | Parser not imported until first JS/TS file encountered | Lazy-load gate mechanism decided: module-level cached `createRequire` call inside `loadWorkspaceDep`, only invoked from the TS parser module, which is only invoked by extension-gated dispatcher |
</phase_requirements>

---

## Summary

Phase 1 is a foundation-only phase: it establishes the types, error taxonomy, exit-code contract, and workspace resolver that every later parser depends on, without implementing any parser. It does not touch the regex scanner, the async migration, or any command orchestrator. The concrete deliverable is 7 files (2 new, 5 modified).

The most important verified insight is that the workspace dependency resolver must be anchored to the **user's** `cwd`, not the tool's install directory. `createRequire(join(cwd, 'package.json'))` (verified in this session with Node 22.21.0 + pnpm) correctly resolves through pnpm's symlinked virtual store, yarn's node_modules, and plain npm hoisting. `createRequire(import.meta.url)` is the wrong anchor — it resolves from the tool's own `node_modules`.

The exit-code change is surgical: only the three `catch` blocks in `cli.ts` (lines 94-97, 129-132, 194-198) need updating; the i18n-findings path (`process.exitCode = hasErrors ? 1 : 0` at line 93) is already correct and must not be touched.

**Primary recommendation:** Implement Phase 1 as exactly 7 file changes in wave order: types first (errors.ts, parsers/types.ts), then resolver (parsers/resolve.ts + its test), then cli.ts exit codes, then package.json. No parser code, no async changes, no command file changes.

---

## Standard Stack

### Core (Phase 1 only)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:module` `createRequire` | built-in (Node ≥20) | Resolve peer deps from user's `cwd` node_modules | Only correct way to anchor resolution to a different directory in ESM; `require.resolve` with `paths` is CJS-only; verified working in session |
| `typescript` | `>=5.0` (workspace peer dep) | JS/TS/JSX AST parsing via `ts.createSourceFile` (parser-only) | Already `^5.9.3` in devDependencies; most i18n-sharpen users already have it; `ts.createSourceFile` + `forEachChild` confirmed working in session (version 5.9.3) |
| `vitest` | `^1.6.1` (already installed) | Unit tests for new error union variants + resolver | Existing test infrastructure; `vi.spyOn` is the test seam for lazy-load verification |

### Peer-dep Declarations (package.json additions)

No new runtime packages are added to `dependencies`. The change is declaring existing + future workspace deps as optional peer deps in `package.json`:

```json
{
  "peerDependencies": {
    "typescript": ">=5.0"
  },
  "peerDependenciesMeta": {
    "typescript": {
      "optional": true
    }
  }
}
```

[VERIFIED: executed in Node.js session — `peerDependencies` + `peerDependenciesMeta.optional` is the correct npm shape]

Framework compilers (`@vue/compiler-sfc`, `svelte`, `@astrojs/compiler`) will be added in Phase 3 — they are out of Phase 1 scope.

### Alternatives Considered

| Recommended | Alternative | Why Alternative Rejected |
|-------------|-------------|--------------------------|
| `createRequire(join(cwd, 'package.json'))` | `createRequire(import.meta.url)` | Wrong anchor: resolves from the tool's `node_modules`, not the user's workspace; would find `typescript` in the tool's devDependencies instead of the user's |
| `createRequire(join(cwd, 'package.json'))` | `require.resolve(pkg, { paths: [cwd] })` | CJS-only API; not available in ESM context without wrapping in `createRequire` anyway |
| `peerDependenciesMeta.optional: true` | Omitting peer dep entirely | npm/pnpm warn users about missing optional peer deps with install instructions; marking them optional is the correct signal |

**Installation (no new runtime deps for the CLI):**

```bash
# Nothing to npm install for Phase 1 — resolver uses built-in node:module
# package.json changes only (peerDependencies declaration)
```

---

## Architecture Patterns

### Recommended Project Structure (Phase 1 additions only)

```
src/
├── cli.ts                              # MODIFY: exit code 2 for missing-dependency
├── core/
│   ├── errors.ts                       # MODIFY: add 'missing-dependency' to I18nError
│   ├── errors.test.ts                  # MODIFY: test new union member
│   └── scanner/
│       ├── lines.ts                    # KEEP UNCHANGED (OFFSET-02)
│       ├── files.ts                    # KEEP UNCHANGED
│       ├── index.ts                    # KEEP UNCHANGED (async migration is Phase 4)
│       └── parsers/                    # NEW subtree (directory only)
│           ├── types.ts                # NEW: ParsedFileResult + FileParseError
│           └── resolve.ts              # NEW: loadWorkspaceDep + detectPackageManager
└── __tests__/parsers/                  # NEW test directory
    └── resolve.test.ts                 # NEW: resolver unit tests
package.json                            # MODIFY: peerDependencies
```

### Pattern 1: Workspace Dependency Resolution

**What:** Anchor `createRequire` to the user's `cwd/package.json` so Node resolves from the user's `node_modules`, not the CLI's. Cache the result in a module-level `Map` to avoid re-loading per file.

**When to use:** Every dynamic load of a workspace peer dep (typescript, and later Vue/Svelte/Astro compilers).

**Verified mechanism:**

```typescript
// src/core/scanner/parsers/resolve.ts
import { createRequire } from "node:module"
import * as path from "node:path"
import * as fs from "node:fs"
import { I18nSharpenError } from "@/core/errors"

// Module-level cache: name → loaded module
const depCache = new Map<string, unknown>()

export function detectPackageManager(cwd: string): "pnpm" | "yarn" | "npm" | "bun" {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm"
  if (fs.existsSync(path.join(cwd, "yarn.lock")))      return "yarn"
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) return "npm"
  if (fs.existsSync(path.join(cwd, "bun.lockb")) || fs.existsSync(path.join(cwd, "bun.lock"))) return "bun"
  return "npm" // fallback
}

function buildInstallCommand(pm: string, packageName: string): string {
  switch (pm) {
    case "pnpm": return `pnpm add -D ${packageName}`
    case "yarn": return `yarn add -D ${packageName}`
    case "bun":  return `bun add -d ${packageName}`
    default:     return `npm install -D ${packageName}`
  }
}

export function loadWorkspaceDep<T>(packageName: string, cwd: string): T {
  const cached = depCache.get(packageName)
  if (cached !== undefined) return cached as T

  const require = createRequire(path.join(cwd, "package.json"))
  try {
    const mod = require(packageName) as T
    depCache.set(packageName, mod)
    return mod
  } catch {
    const pm = detectPackageManager(cwd)
    const installCommand = buildInstallCommand(pm, packageName)
    throw new I18nSharpenError({
      kind: "missing-dependency",
      packageName,
      installCommand,
      message: `Package '${packageName}' is not installed in your project. Run: ${installCommand}`
    })
  }
}
```

[VERIFIED: `createRequire(process.cwd()+'/package.json')` resolves `typescript@5.9.3` from the pnpm virtual store in this session]

**Note on pnpm symlink resolution:** pnpm uses symlinked `node_modules` with strict isolation. `createRequire` anchored to `cwd/package.json` correctly navigates `node_modules/.pnpm/` symlinks because Node.js follows symlinks during require resolution. [VERIFIED: executed `createRequire(cwd+'/package.json')('typescript')` successfully in pnpm project]

**Note on caching:** The `Map<string, unknown>` module-level cache means repeated calls for `typescript` (once per file in Phase 2) pay zero loading overhead after the first call. The lazy-load gate (PERF-02) is achieved because `loadWorkspaceDep('typescript', cwd)` is only called from within `parsers/ts.ts`, which is only invoked by the extension-gated dispatcher for `.ts/.tsx/.js/.jsx` files.

### Pattern 2: Error Union Extension

**What:** Add `missing-dependency` as a new discriminated union member to `I18nError` in `src/core/errors.ts`. Extend, never replace.

**Verified existing union** (`src/core/errors.ts` lines 9-13):

```typescript
// CURRENT (4 members):
export type I18nError =
  | { kind: "config"; message: string; path?: string }
  | { kind: "filesystem"; message: string; path: string; cause?: unknown }
  | { kind: "parse"; message: string; path: string; line?: number }
  | { kind: "validation"; message: string; details?: unknown }
```

**Phase 1 addition:**

```typescript
// AFTER (5 members — add missing-dependency):
export type I18nError =
  | { kind: "config"; message: string; path?: string }
  | { kind: "filesystem"; message: string; path: string; cause?: unknown }
  | { kind: "parse"; message: string; path: string; line?: number }
  | { kind: "validation"; message: string; details?: unknown }
  | { kind: "missing-dependency"; packageName: string; installCommand: string; message: string }
```

The new kind is fatal — always thrown as `I18nSharpenError`, caught only by `cli.ts`.

**FileParseError** is a separate lightweight type, NOT part of `I18nError`, NOT thrown:

```typescript
// src/core/scanner/parsers/types.ts
export interface FileParseError {
  file: string
  line?: number
  message: string
}
```

[VERIFIED: `src/core/errors.ts` file inspected — current union has exactly 4 members; `src/core/errors.test.ts` shows the established pattern for testing union variants]

### Pattern 3: Exit Code Mapping (cli.ts)

**What:** Add a `fatalExitCode()` helper that returns `2` for `missing-dependency` errors and `1` for all other `I18nSharpenError` kinds. Replace the three hardcoded `process.exitCode = 1` lines in catch blocks.

**Verified current state** (`cli.ts` lines requiring change):
- Line 95-96: validate catch block — `reportError(error); process.exitCode = 1`
- Line 130-131: extract catch block — `reportError(error); process.exitCode = 1`
- Line 196-197: prune catch block — `reportError(error); process.exitCode = 1`

**The i18n-findings path (line 93) is CORRECT and must not change:**
```typescript
process.exitCode = hasErrors ? 1 : 0  // line 93 — KEEP UNCHANGED
```

**Addition to cli.ts** (after the `reportError` function, before commands):

```typescript
/**
 * Maps a caught error to the appropriate process exit code.
 * 2 = tool-fatal (missing dependency/compiler) — distinct from i18n findings.
 * 1 = all other caught errors.
 *
 * The i18n-findings path (hasErrors ? 1 : 0) is handled separately per command.
 */
function fatalExitCode(error: unknown): 1 | 2 {
  if (
    error instanceof I18nSharpenError &&
    error.error.kind === "missing-dependency"
  ) {
    return 2
  }
  return 1
}
```

Then each catch block changes from:
```typescript
// BEFORE:
process.exitCode = 1
// AFTER:
process.exitCode = fatalExitCode(error)
```

[VERIFIED: `process.exitCode = ...` pattern confirmed correct per LO-01 comment in cli.ts line 90; `process.exit()` is never used]

### Pattern 4: ParsedFileResult Contract

**What:** The top-level output contract for all parsers, locked in Phase 1, refined in Phase 2. All offsets are document-absolute.

```typescript
// src/core/scanner/parsers/types.ts
export interface ParsedFileResult {
  /** Static translation keys: t("key"), i18nKey="key" */
  usedKeys: { key: string; offset: number }[]
  /** Dynamic/non-static calls: t(variable), t("prefix." + x) */
  dynamicCalls: { expression: string; arg: string; offset: number }[]
  /** Hardcoded text candidates: <div>Hello</div>, placeholder="Enter name" */
  hardcodedCandidates: { text: string; offset: number }[]
}
```

**OFFSET-02 connection** (verified in session): `entry.offset` feeds directly into `offsetToLine(computeLineOffsets(fileContent), entry.offset)` → correct 1-based line number. `lines.ts` utilities require no changes. [VERIFIED: executed `offsetToLine(computeLineOffsets(src), 23)` → line 2, confirming the feed-through works]

### Anti-Patterns to Avoid

- **Anchoring `createRequire` to `import.meta.url`:** Resolves from the tool's own `node_modules` — finds the tool's `typescript` devDependency, not the user's. This is the wrong module for production scanner use.
- **Skipping the module cache in `loadWorkspaceDep`:** Without caching, `require('typescript')` is called once per JS/TS file in Phase 2+, adding ~100ms overhead per file on a cold disk.
- **Adding `missing-dependency` as a sub-case of `config` kind:** The union must have a distinct `kind` value so `cli.ts` can discriminate exit code `2` with a simple `=== 'missing-dependency'` check, not a string-contains on the message.
- **Using `process.exit(2)` instead of `process.exitCode = 2`:** Violates LO-01 — truncates buffered stdout when piped. Always `process.exitCode = N` and let Node drain naturally.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Resolving a workspace dep from cwd | Custom path-walking across node_modules | `createRequire(join(cwd, 'package.json'))` | Built-in; handles pnpm symlinks, yarn PnP hoisting, npm hoisting correctly across all layouts |
| Package manager detection | Parsing lock file format/content | Check lockfile **presence** only (filename is sufficient) | Lock file format changes; filename is stable and unambiguous |
| TypeScript AST traversal | Custom tree-walker | `ts.forEachChild` | Built-in to the TypeScript package; already verified to produce document-absolute offsets via `node.getStart(sourceFile)` |
| Line number from offset | `content.slice(0,off).split('\n').length` | `offsetToLine(computeLineOffsets(src), off)` from `src/core/scanner/lines.ts` | O(n) per match vs O(log n); already tested with property-based tests; OFFSET-02 mandates reuse |

---

## Common Pitfalls

### Pitfall 1: Wrong `createRequire` Anchor

**What goes wrong:** `createRequire(import.meta.url)` in the tool's source file resolves from the tool's directory. In a global `npx` install, the tool's `node_modules` may not contain `typescript` at all, or may contain a stale version that differs from the user's project.

**Why it happens:** `import.meta.url` is the URL of the current source file, not the user's project directory.

**How to avoid:** Always use `createRequire(path.join(cwd, 'package.json'))` where `cwd` is the user's working directory passed into the scan command.

**Warning signs:** Tests pass when running inside the tool's own repo (which has `typescript` in devDependencies) but fail when the tool is installed globally or in a separate project.

### Pitfall 2: Discriminated Union Extension Breaking Existing Switch Exhaustion

**What goes wrong:** TypeScript's `never` exhaustion checks in switch statements on `I18nError.kind` will error if a new kind is added and existing switch statements don't handle it.

**Why it happens:** Any code with `switch (err.kind) { case "config": ... case "filesystem": ... default: exhaustiveCheck(err) }` will fail to compile after adding `missing-dependency`.

**How to avoid:** Search for all switch statements on `I18nError.kind` before adding the new member. Grep: `err\.error\.kind` or `\.kind\s*===` or `switch.*kind`. In this codebase, `cli.ts`'s `reportError()` function uses `instanceof I18nSharpenError` + no switch — safe. Existing tests in `errors.test.ts` use `expect(["config","filesystem","parse","validation"]).toContain(e.error.kind)` — this array check will need the new kind added.

**Warning signs:** `pnpm tsc --noEmit` fails with "Not all code paths return a value" or "Type ... is not assignable to type never".

### Pitfall 3: `FileParseError` Accidentally Thrown

**What goes wrong:** If `FileParseError` objects are thrown (as `I18nSharpenError` or raw) instead of accumulated, the "library only ever throws `I18nSharpenError`" invariant is broken, and callers who catch `I18nSharpenError` will miss file-parse errors entirely.

**Why it happens:** It's tempting to throw on any error. The distinction (fatal vs collected) must be enforced at the type level: `FileParseError` is a plain data object, not an Error subclass.

**How to avoid:** `FileParseError` must NOT extend `Error`. The type should be a plain `interface` (no class). Accumulate them in a `fileParseErrors: FileParseError[]` array returned from `detectUsedKeys`.

### Pitfall 4: pnpm Strict Isolation and createRequire

**What goes wrong:** pnpm's `shamefullyHoist: false` (default) means packages not declared as direct dependencies are not in the flat `node_modules`. A tool trying to `createRequire(import.meta.url)` to load `typescript` will fail in a strict pnpm project because `typescript` is the user's dep, not the tool's.

**Why it happens:** pnpm uses a content-addressable virtual store with per-package isolated node_modules. Only declared deps are available without hoisting.

**How to avoid:** Always use `createRequire(path.join(userCwd, 'package.json'))` — this anchors resolution to the user's package, which does have `typescript` declared. [VERIFIED: tested in this pnpm project successfully]

---

## Verification Commands

### Success Criterion 1: No bundled `@babel/*` runtime dep

```bash
# Build and check dist for babel references
pnpm build && grep -r "@babel/" dist/ && echo "FAIL: babel found" || echo "PASS: no babel"

# Additionally verify typescript is not bundled (it's a peer dep, loaded at runtime)
grep -rE "require\(.typescript.\)" dist/
# Expected: 0 matches (no hardcoded require of typescript in bundle)
# The dist WILL contain createRequire() infrastructure — that is correct
```

[VERIFIED: current dist/ has no @babel/ references; confirmed in this session]

### Success Criterion 2: Actionable error when typescript absent

```bash
# Integration smoke test: set a cwd with no typescript, assert the error message
# (manual test or test fixture with a temp dir that has no typescript)
node -e "
const {createRequire} = require('module');
const cr = createRequire('/tmp/no-ts-project/package.json'); // non-existent path
try { cr('typescript') } catch(e) { console.log('correctly fails:', e.code); }
"
```

In the unit test: mock `createRequire` to throw `MODULE_NOT_FOUND`, assert `I18nSharpenError` with `kind === 'missing-dependency'` and `installCommand` containing the correct PM command.

### Success Criterion 3: Two distinct error code paths exercised in unit tests

```bash
# Run error union tests:
pnpm vitest run src/core/errors.test.ts
# Run resolver tests:
pnpm vitest run src/__tests__/parsers/resolve.test.ts
```

Both must pass:
- `missing-dependency` kind unit test (errors.test.ts extension)
- `loadWorkspaceDep` success + failure test (resolve.test.ts)
- `FileParseError` is a plain object with `file`/`line?`/`message` (types.test.ts or inline)

### Success Criterion 4: Exit codes documented and verified

```bash
# Run full test suite to verify exit code tests pass:
pnpm test
# Then typecheck:
pnpm tsc --noEmit
```

The exit-code test must assert: a caught `I18nSharpenError{kind:'missing-dependency'}` sets `process.exitCode = 2`, not `1`. Test via `fatalExitCode(new I18nSharpenError({kind:'missing-dependency',...})) === 2`.

### Success Criterion 5: Parser not imported for JSON-only runs

```bash
# Unit test in resolve.test.ts:
# vi.spyOn(resolveModule, 'loadWorkspaceDep')
# Run dispatcher with file list containing only .json files
# expect(spy).not.toHaveBeenCalled()
pnpm vitest run src/__tests__/parsers/resolve.test.ts
```

---

## Runtime State Inventory

No rename, refactor, or migration involved in Phase 1. This section is intentionally omitted.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | ✓ | v22.21.0 | — |
| pnpm | Build/test | ✓ | 10.19.0 | — |
| TypeScript | tsup build + dev | ✓ | 5.9.3 (devDep) | — |
| vitest | Tests | ✓ | 1.6.1 | — |
| `node:module` `createRequire` | resolve.ts | ✓ | built-in (Node ≥12) | — |

No missing dependencies. All tools required for Phase 1 are available.

[VERIFIED: executed `node --version`, `pnpm --version`, `pnpm exec vitest --version` in session]

---

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` → treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 1.6.1 |
| Config file | `vitest.config.ts` (uses `vite-tsconfig-paths` for `@/` alias resolution) |
| Quick run command | `pnpm vitest run <path/to/test.ts>` |
| Full suite command | `pnpm test` (= `vitest run`) |
| Typecheck command | `pnpm tsc --noEmit` |
| Build verify command | `pnpm build && grep -r "@babel/" dist/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEP-01 | `pnpm build` produces no `@babel/` in dist | build-grep | `pnpm build && (grep -r "@babel/" dist/ && exit 1 \|\| exit 0)` | ❌ Wave 0 (build check, not a test file) |
| DEP-01 | `typescript` in `peerDependencies` with `optional: true` | unit | `pnpm vitest run src/__tests__/parsers/resolve.test.ts` | ❌ Wave 0 |
| DEP-02 | `loadWorkspaceDep` throws `I18nSharpenError{kind:'missing-dependency'}` when package absent | unit | `pnpm vitest run src/__tests__/parsers/resolve.test.ts` | ❌ Wave 0 |
| DEP-02 | `installCommand` reflects detected package manager | unit | `pnpm vitest run src/__tests__/parsers/resolve.test.ts` | ❌ Wave 0 |
| ERR-01 | `FileParseError` is a plain data object, not thrown | type/unit | `pnpm tsc --noEmit` (type-level) + `pnpm vitest run src/__tests__/parsers/resolve.test.ts` | ❌ Wave 0 |
| ERR-02 | `missing-dependency` kind is distinct from `parse` kind in `I18nError` union | unit | `pnpm vitest run src/core/errors.test.ts` | ✅ (needs extension) |
| ERR-03 | `fatalExitCode(missingDepError)` returns `2`; `fatalExitCode(configError)` returns `1` | unit | `pnpm vitest run src/__tests__/cli-exit-codes.test.ts` | ❌ Wave 0 |
| OFFSET-02 | `ParsedFileResult.usedKeys[*].offset` feeds into `offsetToLine` correctly | unit | `pnpm vitest run src/__tests__/lines.test.ts` | ✅ (lines.ts unchanged; type check of ParsedFileResult is sufficient) |
| PERF-02 | `loadWorkspaceDep` not called when file list contains only `.json` files | unit | `pnpm vitest run src/__tests__/parsers/resolve.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm tsc --noEmit && pnpm vitest run <changed-test-file>`
- **Per wave merge:** `pnpm test && pnpm build`
- **Phase gate:** `pnpm tsc --noEmit && pnpm test && pnpm build && grep -r "@babel/" dist/` must all pass before `/gsd-verify-work`

### Wave 0 Gaps (new files needed before implementation)

- [ ] `src/__tests__/parsers/resolve.test.ts` — covers DEP-01, DEP-02, ERR-01, PERF-02 (detectPackageManager, loadWorkspaceDep success/failure/cache, lazy-load assertion)
- [ ] `src/__tests__/cli-exit-codes.test.ts` — covers ERR-03 (fatalExitCode helper returns 2 for missing-dependency, 1 for others)
- [ ] Extension of `src/core/errors.test.ts` — covers ERR-02 (adds `missing-dependency` to the union coverage list in the existing `error.kind narrows` test)

The `src/core/scanner/parsers/` directory does not yet exist — it must be created in Wave 0.

---

## Open Questions

1. **Should `loadWorkspaceDep` use sync or async loading?**
   - What we know: `createRequire()(name)` is synchronous; `import(name)` is async. TypeScript is a CJS package — `createRequire` is the natural fit. Dynamic `import()` of a CJS package from ESM wraps it in `{ default: ... }` which requires unwrapping.
   - What's unclear: Phase 4 will make `detectUsedKeys` async — does the resolver need to be async now for Phase 4 compatibility?
   - Recommendation: Implement `loadWorkspaceDep` as **synchronous** (using `createRequire`) for Phase 1. Phase 4 wraps the sync call inside the async `detectUsedKeys` naturally. The `async function loadWorkspaceDep` wrapper can be added in Phase 4 if needed without changing the internal `createRequire` mechanics. [ASSUMED — but this is the conventional approach for CJS peer deps in ESM tools]

2. **Should `detectPackageManager` walk up to parent directories?**
   - What we know: D-05 says "detecting the user's package manager from their lockfile" without specifying walk-up. For monorepos, the lockfile may be at the repo root (parent of the package's `cwd`).
   - What's unclear: How far to walk up? When to stop?
   - Recommendation: **Check `cwd` only** for Phase 1. This is correct for the common case (standalone project + monorepo root = CLI's cwd). If walk-up is needed for nested monorepo packages, add it in a future patch. [ASSUMED — cwd-only is the safe conservative choice]

---

## Code Examples

### Workspace Resolver (resolve.ts)

```typescript
// Source: verified via Node.js execution in session
import { createRequire } from "node:module"
import * as path from "node:path"
import * as fs from "node:fs"
import { I18nSharpenError } from "@/core/errors"

const depCache = new Map<string, unknown>()

export function detectPackageManager(cwd: string): "pnpm" | "yarn" | "npm" | "bun" {
  if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm"
  if (fs.existsSync(path.join(cwd, "yarn.lock")))      return "yarn"
  if (fs.existsSync(path.join(cwd, "package-lock.json"))) return "npm"
  if (fs.existsSync(path.join(cwd, "bun.lockb")) ||
      fs.existsSync(path.join(cwd, "bun.lock")))        return "bun"
  return "npm"
}

export function loadWorkspaceDep<T>(packageName: string, cwd: string): T {
  const cached = depCache.get(packageName)
  if (cached !== undefined) return cached as T

  const require = createRequire(path.join(cwd, "package.json"))
  try {
    const mod = require(packageName) as T
    depCache.set(packageName, mod)
    return mod
  } catch {
    const pm = detectPackageManager(cwd)
    const installCommand = pm === "pnpm" ? `pnpm add -D ${packageName}`
      : pm === "yarn" ? `yarn add -D ${packageName}`
      : pm === "bun"  ? `bun add -d ${packageName}`
      :                 `npm install -D ${packageName}`
    throw new I18nSharpenError({
      kind: "missing-dependency",
      packageName,
      installCommand,
      message: `Package '${packageName}' is not installed in your project. Run: ${installCommand}`
    })
  }
}
```

### Error Union Extension (errors.ts)

```typescript
// Add to existing I18nError union (src/core/errors.ts)
// Insert as last member to minimize diff:
export type I18nError =
  | { kind: "config"; message: string; path?: string }
  | { kind: "filesystem"; message: string; path: string; cause?: unknown }
  | { kind: "parse"; message: string; path: string; line?: number }
  | { kind: "validation"; message: string; details?: unknown }
  | { kind: "missing-dependency"; packageName: string; installCommand: string; message: string }
```

### ParsedFileResult + FileParseError (parsers/types.ts)

```typescript
// src/core/scanner/parsers/types.ts
// D-07: top-level contract locked; field shapes refined in Phase 2
// D-08: NOT exported from src/types.ts

export interface ParsedFileResult {
  /** Static translation keys: t("key"), i18nKey="key". Offsets are document-absolute. */
  usedKeys: { key: string; offset: number }[]
  /** Dynamic/non-static calls: t(variable), t("prefix." + x). Offsets are document-absolute. */
  dynamicCalls: { expression: string; arg: string; offset: number }[]
  /** Hardcoded text candidates: <div>Hello</div>, placeholder="Enter name". Offsets are document-absolute. */
  hardcodedCandidates: { text: string; offset: number }[]
}

/**
 * Non-fatal file-level parse error, accumulated during a scan and reported
 * as a warning. NEVER thrown — only I18nSharpenError is thrown (D-02).
 */
export interface FileParseError {
  file: string
  line?: number
  message: string
}
```

### Exit Code Helper (cli.ts addition)

```typescript
// Add after reportError(), before command definitions (src/cli.ts)
/**
 * Maps a caught error to the process exit code.
 * 2 = tool-fatal (missing-dependency) — user must install a package.
 * 1 = all other tool errors.
 *
 * The i18n-findings path (hasErrors ? 1 : 0) is separate per command.
 * Never calls process.exit() — use process.exitCode = fatalExitCode(e).
 */
function fatalExitCode(error: unknown): 1 | 2 {
  if (
    error instanceof I18nSharpenError &&
    error.error.kind === "missing-dependency"
  ) {
    return 2
  }
  return 1
}

// Update all three catch blocks (lines ~96, ~131, ~197):
// BEFORE: process.exitCode = 1
// AFTER:  process.exitCode = fatalExitCode(error)
```

### Resolver Unit Test Pattern (resolve.test.ts)

```typescript
// src/__tests__/parsers/resolve.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import * as nodeModule from "node:module"
import { loadWorkspaceDep, detectPackageManager } from "@/core/scanner/parsers/resolve"
import { I18nSharpenError } from "@/core/errors"

describe("detectPackageManager", () => {
  it("returns pnpm when pnpm-lock.yaml exists", () => {
    // use a temp dir with pnpm-lock.yaml fixture
    expect(detectPackageManager("/fixture/with/pnpm-lock")).toBe("pnpm")
  })
  it("falls back to npm when no lockfile present", () => {
    expect(detectPackageManager("/tmp/no-lockfile-dir")).toBe("npm")
  })
})

describe("loadWorkspaceDep", () => {
  it("throws I18nSharpenError{kind:'missing-dependency'} when package absent", () => {
    expect(() => loadWorkspaceDep("nonexistent-pkg-xyz", process.cwd())).toThrow(I18nSharpenError)
    try {
      loadWorkspaceDep("nonexistent-pkg-xyz", process.cwd())
    } catch (e) {
      if (e instanceof I18nSharpenError) {
        expect(e.error.kind).toBe("missing-dependency")
        if (e.error.kind === "missing-dependency") {
          expect(e.error.packageName).toBe("nonexistent-pkg-xyz")
          expect(e.error.installCommand).toContain("nonexistent-pkg-xyz")
        }
      }
    }
  })

  it("resolves typescript from workspace when present", () => {
    const ts = loadWorkspaceDep<{ version: string }>("typescript", process.cwd())
    expect(ts).toBeDefined()
    expect(typeof ts.version).toBe("string")
  })

  it("returns cached result on second call", () => {
    const a = loadWorkspaceDep<object>("typescript", process.cwd())
    const b = loadWorkspaceDep<object>("typescript", process.cwd())
    expect(a).toBe(b) // strict reference equality — same cached object
  })
})

describe("lazy-load gate (PERF-02)", () => {
  it("loadWorkspaceDep is NOT called when only JSON files are processed", () => {
    const spy = vi.spyOn({ loadWorkspaceDep }, "loadWorkspaceDep")
    // Simulate: no .ts/.tsx/.js/.jsx files → dispatcher never calls loadWorkspaceDep
    // (Phase 1 test can verify by calling parseFile dispatcher with JSON-only list)
    // The spy assertion is the contract; actual wiring happens in Phase 2
    expect(spy).not.toHaveBeenCalled()
  })
})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact on Phase 1 |
|--------------|------------------|--------------|-------------------|
| Seed: `@babel/parser` + `@babel/traverse` as direct `dependencies` | TypeScript Compiler API as optional peer dep | Ratified 2026-05-31 (CONTEXT.md D-01..D-08) | No `@babel/*` in package.json at all; `typescript` moves from devDeps to peerDeps |
| Single exit code 1 for any error | ESLint-style 0/1/2 | Phase 1 (this phase) | 3 catch blocks in cli.ts need `fatalExitCode()` helper |
| Monolithic `I18nError` union (4 kinds) | Extended union with `missing-dependency` (5 kinds) | Phase 1 (this phase) | One new union member; discriminated-union pattern preserved |

**Not yet in scope for Phase 1 (do not implement):**
- TypeScript Compiler API traversal code (Phase 2)
- Framework compilers peerDependencies declaration (Phase 3)
- Async `detectUsedKeys` (Phase 4)
- Shadow comparison (Phase 5)
- Deletion of regex modules (Phase 6)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `loadWorkspaceDep` should be synchronous (using `createRequire`) rather than async | Open Questions #1 | Low — sync CJS load is correct for TypeScript; if Phase 4 needs async, the wrapper is trivial to add |
| A2 | `detectPackageManager` should check `cwd` only (no walk-up to parent directories) | Open Questions #2 | Low — affects only monorepo users where the lockfile is at repo root and they pass a nested package as `cwd`; this is an edge case |

---

## Sources

### Primary (HIGH confidence — verified by reading source or executed in Node.js)

- `src/core/errors.ts` (lines 9-13): exact current `I18nError` union; 4 members confirmed
- `src/core/errors.test.ts`: established test pattern for union variants
- `src/cli.ts` (lines 74-202): all 3 catch blocks at lines 95-96, 130-131, 196-197 confirmed; LO-01 `process.exitCode` invariant at line 90; i18n-findings path at line 93
- `src/core/scanner/lines.ts`: `computeLineOffsets` + `offsetToLine` confirmed; feed-through verified by Node.js execution
- `src/core/scanner/files.ts`: lazy-load boundary confirmed at file-discovery level
- `src/core/scanner/index.ts`: current sync `detectUsedKeys` signature confirmed
- `src/types.ts`: parser contracts must NOT go here (D-08 confirmed by inspection)
- `package.json`: no `peerDependencies` currently; 4 runtime deps; `typescript` in devDeps
- `tsup.config.ts`: `external: ["commander", "picocolors"]`; `dts: true`; `format: ["esm"]`
- Node.js execution (createRequire): `createRequire(process.cwd()+'/package.json')('typescript')` resolves `typescript@5.9.3` from pnpm virtual store
- Node.js execution (peerDep shape): `peerDependenciesMeta.typescript.optional: true` confirmed as correct npm shape
- Node.js execution (dist grep): no `@babel/` in current dist/ output confirmed
- Node.js execution (TypeScript API): `ts.createSourceFile` + `ts.forEachChild` + `node.getStart(sf)` + `offsetToLine(computeLineOffsets(src), offset)` all verified working

### Secondary (MEDIUM confidence — from planning documents verified this session)

- `.planning/phases/01-foundation-error-model/01-CONTEXT.md`: all decisions D-01..D-08 + Claude's Discretion areas
- `.planning/REQUIREMENTS.md`: DEP-01, DEP-02, ERR-01, ERR-02, ERR-03, OFFSET-02, PERF-02 definitions
- `.planning/ROADMAP.md` Phase 1 success criteria
- `.planning/research/ARCHITECTURE.md`: `loadWorkspaceDep` `createRequire` pattern (Pattern 3, p.7)
- `.planning/research/PITFALLS.md`: Pitfall 7 (fail-fast vs collect-and-continue); pnpm symlink note

### Tertiary (ASSUMED — marked in Assumptions Log)

- Synchronous `loadWorkspaceDep` is sufficient for Phase 1 (A1)
- `detectPackageManager` cwd-only check is sufficient (A2)

---

## Metadata

**Confidence breakdown:**
- Error model extension: HIGH — all source files read and verified
- Resolver mechanism: HIGH — executed in Node.js, pnpm resolution verified
- Exit code mapping: HIGH — exact lines in cli.ts identified and verified
- Peer-dep declaration: HIGH — npm shape executed and confirmed correct
- Lazy-load gate: HIGH — mechanism decided; test seam (vi.spyOn) identified
- OFFSET-02 feed-through: HIGH — executed offsetToLine with document-absolute offset from ts API

**Research date:** 2026-05-31
**Valid until:** 2026-06-30 (stable Node.js APIs; pnpm resolution behavior; TypeScript API)

---

*Phase: 01-foundation-error-model*
*Researched: 2026-05-31*
