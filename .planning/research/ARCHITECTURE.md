# Architecture Research

**Domain:** CLI tool — per-framework AST scanner integration into a layered TypeScript ESM codebase
**Researched:** 2026-05-31
**Confidence:** HIGH (based on direct source inspection + seed plan; no external research needed for an integration question)

---

## Standard Architecture

### Existing Layer Map (do not redesign — integrate into this)

```
┌──────────────────────────────────────────────────────────────┐
│  Entry Points                                                │
│  ┌──────────────┐  ┌───────────────────────────────────┐    │
│  │  src/cli.ts  │  │  src/index.ts (public npm API)    │    │
│  │ (sole catch) │  │  re-exports validate/extract/prune│    │
│  └──────┬───────┘  └──────────────┬────────────────────┘    │
├─────────┼────────────────────────┼────────────────────────  │
│  Command Orchestrators           │                           │
│  ┌──────▼──────────┐  ┌──────────▼──┐  ┌────────────────┐  │
│  │ commands/        │  │ commands/    │  │ commands/      │  │
│  │ validate.ts      │  │ extract.ts   │  │ prune.ts       │  │
│  └──────┬───────────┘  └──────┬──────┘  └────────┬───────┘  │
├─────────┼────────────────────┼────────────────────┼──────── │
│  Core Primitives (pure — no I/O side-effects in callers)    │
│  ┌───────▼──────────────────────────────────────────────┐   │
│  │  src/core/scanner/                                    │   │
│  │  ┌─────────────┐  ┌──────────┐  ┌────────────────┐  │   │
│  │  │ index.ts    │  │ text.ts  │  │ lines.ts       │  │   │
│  │  │ detectUsed  │  │ stripC.. │  │ computeLine..  │  │   │
│  │  │ Keys()      │  │ isStatic │  │ offsetToLine   │  │   │
│  │  └─────────────┘  └──────────┘  └────────────────┘  │   │
│  │  ┌──────────────┐  ┌──────────┐  ┌──────────────┐   │   │
│  │  │ regex.ts     │  │ dynamic  │  │ hardcoded.ts  │   │   │
│  │  │ (DELETE v0.4)│  │ (DELETE) │  │ (DELETE)      │   │   │
│  │  └──────────────┘  └──────────┘  └──────────────┘   │   │
│  │  ┌──────────────────────────────────────────────┐    │   │
│  │  │  parsers/ subtree  [NEW in v0.4.0]           │    │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │    │   │
│  │  │  │ types.ts │ │resolve.ts│ │  babel.ts    │ │    │   │
│  │  │  └──────────┘ └──────────┘ └──────────────┘ │    │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────────┐ │    │   │
│  │  │  │  vue.ts  │ │svelte.ts │ │  astro.ts    │ │    │   │
│  │  │  └──────────┘ └──────────┘ └──────────────┘ │    │   │
│  │  │  ┌────────────────────────────────────────┐  │    │   │
│  │  │  │  index.ts — parseFile() dispatcher     │  │    │   │
│  │  │  └────────────────────────────────────────┘  │    │   │
│  │  └──────────────────────────────────────────────┘    │   │
│  └───────────────────────────────────────────────────────┘  │
│  ┌────────────────────┐  ┌──────────────────────────────┐   │
│  │ src/core/locale-io │  │ src/core/errors.ts            │   │
│  │ (unchanged)        │  │ I18nSharpenError (unchanged)  │   │
│  └────────────────────┘  └──────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status in v0.4.0 |
|-----------|----------------|-----------------|
| `src/cli.ts` | Sole `I18nSharpenError` catch site; sets `process.exitCode`; wraps all three commands with `await` | MODIFY: add `await` to `validate`/`extract` actions |
| `src/index.ts` | Public npm API re-exports | MODIFY: type signatures change (sync → Promise) |
| `src/commands/validate.ts` | Orchestrates locale loading + key scanning + check passes | MODIFY: `validate()` → async |
| `src/commands/extract.ts` | Orchestrates key scanning + locale file update | MODIFY: `extract()` → async |
| `src/commands/prune.ts` | Orchestrates key scanning + locale file pruning (already async for TUI) | MODIFY: `detectUsedKeys` call → await |
| `src/core/scanner/index.ts` | `detectUsedKeys()` barrel + aggregation | MODIFY: → async, use `parseFile()` pool |
| `src/core/scanner/parsers/index.ts` | Extension-based dispatcher → `ParsedFileResult` | NEW |
| `src/core/scanner/parsers/types.ts` | `ParsedFileResult` interface | NEW |
| `src/core/scanner/parsers/resolve.ts` | Dynamic workspace dep loader, fatal on missing | NEW |
| `src/core/scanner/parsers/babel.ts` | JS/TS/JSX/TSX AST parser | NEW |
| `src/core/scanner/parsers/vue.ts` | Vue SFC parser, delegates script to babel | NEW |
| `src/core/scanner/parsers/svelte.ts` | Svelte 5 parser, delegates script to babel | NEW |
| `src/core/scanner/parsers/astro.ts` | Astro WASM parser, delegates frontmatter to babel | NEW |
| `src/core/scanner/text.ts` | `stripComments`, `isStaticStringLiteral`, `getBaseKey`, `matchWildcard`, `isKeyUsed` + receives `isHardcodedIgnored` from `hardcoded.ts` | KEEP (add `isHardcodedIgnored`) |
| `src/core/scanner/lines.ts` | `computeLineOffsets`, `offsetToLine` | KEEP unchanged |
| `src/core/scanner/files.ts` | `getFiles`, `scanSourceFiles` | KEEP unchanged |
| `src/core/scanner/regex.ts` | Regex builders | DELETE (after AST is default) |
| `src/core/scanner/dynamic.ts` | `classifyDynamicCall`, `extractLeadingPrefix` | DELETE (after AST is default) |
| `src/core/scanner/hardcoded.ts` | `scanTemplateTextNodes`, `isHardcodedIgnored` | DELETE (after AST is default, move `isHardcodedIgnored` first) |
| `src/core/scanner.ts` | Deprecated shim (`export * from "./scanner/index"`) | DELETE (after AST is default) |

---

## `ParsedFileResult` Interface

Defined in `src/core/scanner/parsers/types.ts`. All offsets are **absolute** byte offsets into the full file content string (not block-relative — offset rebasing is the parser's responsibility before returning this structure).

```typescript
export interface ParsedFileResult {
  /** Static translation keys: t("key"), i18nKey="key" */
  usedKeys: { key: string; offset: number }[]
  /** Dynamic/non-static calls: t(variable), t("prefix." + x) */
  dynamicCalls: { expression: string; arg: string; offset: number }[]
  /** Hardcoded text candidates: <div>Hello</div>, placeholder="Enter name" */
  hardcodedCandidates: { text: string; offset: number }[]
}
```

The **offset field is always document-absolute** by contract. The parser layer (not the caller) adds any block start offsets.

---

## Extension-Based Dispatcher

`src/core/scanner/parsers/index.ts` exports a single async function:

```typescript
export async function parseFile(
  filePath: string,
  content: string,
  config: ScannerConfig,
  cwd: string
): Promise<ParsedFileResult>
```

Routing logic:

| Extension | Routed to | Notes |
|-----------|-----------|-------|
| `.ts`, `.tsx`, `.js`, `.jsx` | `babel.ts` | Direct Babel parse |
| `.vue` | `vue.ts` | SFC descriptor split → babel for script block |
| `.svelte` | `svelte.ts` | Svelte 5 parse (with `{ modern: true }`) → babel for `ast.instance.content` |
| `.astro` | `astro.ts` | WASM async init → babel for frontmatter |
| Anything else | Reject or return empty result | Defensively return `{ usedKeys: [], dynamicCalls: [], hardcodedCandidates: [] }` |

No fallback to regex — an AST parse error is surfaced as a collected file-level error (see Error Model section).

---

## Reusing Babel for Embedded Script Blocks

All framework parsers (vue, svelte, astro) extract script content as a plain string and call the same Babel parser function. The extraction pattern for each:

| Framework | How to extract script string | Babel input |
|-----------|------------------------------|-------------|
| Vue SFC | `descriptor.script?.content` or `descriptor.scriptSetup?.content` | Pass raw script content; record `descriptor.script?.loc.start.offset` as `blockStart` |
| Svelte 5 | `ast.instance.content` (modern AST) or legacy `ast.module.content` | Record the character offset of `<script>` opening tag as `blockStart` |
| Astro | Frontmatter fenced block content (between `---` delimiters) | `blockStart = 3` (length of opening `---\n`) |

The helper signature in each framework parser:

```typescript
function parseBabelBlock(
  scriptContent: string,
  blockStart: number, // absolute offset of this block's first char in the full file
  config: ScannerConfig
): Pick<ParsedFileResult, "usedKeys" | "dynamicCalls">
```

The `babel.ts` parser accepts an optional `offsetDelta` parameter. Every offset it produces is incremented by `offsetDelta` before being stored in the returned arrays. This is the **offset rebasing** mechanism.

---

## Offset Rebasing Design

**Problem:** Babel reports offsets relative to the string it was given. For an embedded `<script>` block in a Vue file, `offset 0` in Babel's output refers to byte 0 of `descriptor.script.content`, not byte 0 of the full `.vue` file. Without rebasing, all reported line numbers for script-block findings will be wrong (typically off by the number of template lines).

**Solution:** Each framework parser records the absolute offset of where its script block begins in the full file content string. This value is passed as `offsetDelta` to the Babel parser helper. Every `{ key, offset }`, `{ expression, arg, offset }`, and `{ text, offset }` object produced by Babel has `offset = babelOffset + offsetDelta` applied before the object is pushed to the result array.

**For template/HTML portions** of Vue/Svelte/Astro files, the framework AST provides node positions in the parsed tree. These positions must similarly be validated as absolute (most framework AST nodes report positions relative to the full source string passed to their `parse()` call — no delta needed there, since the full file content is passed to the framework compiler).

**`offsetToLine` usage:** Because `computeLineOffsets` + `offsetToLine` already live in `lines.ts` and accept absolute offsets, callers in `validate.ts` and `prune.ts` need no changes to the line-number computation path. The rebased offsets flow correctly into the existing utility.

---

## Async Migration and Blast Radius

### Cascade (smallest → largest scope)

The sync → async migration propagates upward in strict dependency order:

1. `src/core/scanner/parsers/*.ts` — all new, already async (dynamic `import()` for framework compilers requires it)
2. `src/core/scanner/parsers/index.ts` — `parseFile()` is async by design
3. `src/core/scanner/index.ts` — `detectUsedKeys()` currently sync; must become async to call `parseFile()`
4. `src/commands/validate.ts` — calls `detectUsedKeys()` at line 104; function signature `validate()` → `async`
5. `src/commands/extract.ts` — calls `detectUsedKeys()` at line 40; `extract()` → `async`, return type `Promise<void>`
6. `src/commands/prune.ts` — calls `detectUsedKeys()` at line 61; already `async` (TUI path); add `await` to `detectUsedKeys` call
7. `src/index.ts` — re-exports all three; docblock examples must be updated; type signatures change to Promise (breaking change for programmatic callers)
8. `src/cli.ts` — validate and extract action handlers currently synchronous; must become `async` and use `await`

**The `prune` action in `cli.ts` is already `async`** (added in v0.3.0 for TUI). The `validate` and `extract` actions are not. Both must become `async` action callbacks.

**Exact bounded file set (GitNexus confirmed ~6-8 files):**

| File | Change type | Risk note |
|------|-------------|-----------|
| `src/core/scanner/index.ts` | MODIFY signature | Breaks all callers |
| `src/commands/validate.ts` | MODIFY signature | Direct callers: `cli.ts` only |
| `src/commands/extract.ts` | MODIFY signature | Direct callers: `cli.ts` only |
| `src/commands/prune.ts` | ADD await | Already async; minimal risk |
| `src/index.ts` | Update type docs | Public API breaking change |
| `src/cli.ts` | Add async + await | 2 action handlers need async |
| `src/__tests__/validate.test.ts` | MODIFY | Add `await` to all `validate()` calls |
| `src/__tests__/extract.test.ts` | MODIFY | Add `await` to all `extract()` calls |
| `src/__tests__/prune.test.ts` | Minor update | Already awaiting |

### `fileContents` and `looseKeyMatch` Preservation

`validate.ts` uses `fileContents` (parallel to `files`, index-aligned) in two places:
1. Lines 142–189: secondary regex pass to build `keyToFilesMap` and collect `dynamicCalls` per file
2. Lines 192–213: `looseKeyMatch` feature — searches `cleanContent` for `"key"`, `'key'`, `` `key` `` using `String.includes()`

**`fileContents` MUST still be returned from `detectUsedKeys()`** after the async migration. The return type in the seed plan correctly preserves this:

```typescript
// src/core/scanner/index.ts (async rewrite)
return {
  usedKeys: Set<string>,
  fileContents: string[],           // stripComments(raw) per file, preserved for looseKeyMatch
  parsedResults: Map<string, ParsedFileResult>  // new: keyed by absolute file path
}
```

The `stripComments` step must still run on raw file content (read via `fs.readFileSync`) to produce `fileContents`, independently of the AST parse. The AST parse runs on the raw (un-stripped) content.

**When `validate.ts` is refactored**, the secondary dynamic-call regex loop (lines 130–189 in current source) can be replaced by consuming `parsedResults.get(file)?.dynamicCalls` from the AST output. The `keyToFilesMap` population can similarly use `parsedResults.get(file)?.usedKeys`. The `looseKeyMatch` second pass (lines 192–213) continues to use `fileContents` unchanged.

---

## Bounded-Concurrency Parse Pool

Turning the async migration into a performance win requires limiting how many files are parsed concurrently. Parsing all N files simultaneously with `Promise.all()` can exhaust memory on large codebases.

**Pattern:** A concurrency-capped pool using a semaphore or `p-limit`-style approach.

Since the project constraint says "keep dep tree tiny," implement without adding `p-limit`. A minimal in-process pool:

```typescript
async function parseFilesWithConcurrency(
  files: string[],
  concurrency: number,
  parseOne: (file: string) => Promise<ParsedFileResult>
): Promise<ParsedFileResult[]>
```

Implementation uses a queue + N in-flight Promise slots. Concurrency default: `Math.min(files.length, 4)` (4 parallel parses saturates I/O without memory pressure; tune via `PARSE_CONCURRENCY` env var for experimentation).

This pool lives in `src/core/scanner/index.ts` as an internal helper, not exported. The public interface is still `detectUsedKeys()`.

---

## Error Model: Collect-and-Continue vs Fatal

Two distinct error behaviors — they must not be conflated:

### Collect-and-Continue: Single-file Syntax Error

When Babel (or a framework compiler) fails to parse a single file:
- Catch the parse error inside `detectUsedKeys`'s per-file iteration
- Construct an `I18nSharpenError({ kind: "parse", message: "...", path: filePath, line: errorLine })`
- Push to an accumulator `parseErrors: I18nSharpenError[]`
- Continue processing remaining files
- After all files are processed, if `parseErrors.length > 0`: log each error with `log.warn()`, and (if in validate context) surface them in the return value

Babel's `errorRecovery: true` option allows it to continue parsing despite minor syntax errors. When `ast.errors.length > 0` after parsing, the parser should log each error position but still use the partially-recovered AST. Only when Babel throws outright (completely unparseable file) should the file be skipped and added to `parseErrors`.

**Exit code behavior:** Parse errors on individual files should not override a clean validation exit (exit 0 if no i18n key issues) but should be visible in output. They can be optionally surfaced as exit 1 behind a `--strict-syntax` flag (out of scope for initial implementation; defer).

### Fatal: Missing Framework Compiler

When `loadWorkspaceDep()` fails to find a required compiler in the user's workspace `node_modules`:
- **Throw `I18nSharpenError` immediately** — do not attempt to continue
- The error `kind` is `"config"` (it is a setup/configuration problem, not a file parse problem)
- Message must be actionable: include the package name and the exact install command
- Example: `"Cannot scan .vue files: package '@vue/compiler-sfc' not found in your project's node_modules. Run: pnpm add -D @vue/compiler-sfc"`
- `cli.ts` catches this as it catches all `I18nSharpenError`s — no special handling needed

This distinction maps to the `I18nError` discriminated union that already exists in `src/core/errors.ts`. The `"parse"` kind (with optional `line` field) is exactly right for file-level syntax errors. The `"config"` kind is right for missing compilers.

**Error propagation and exit codes:**

| Situation | Error kind | Exit code | Behavior |
|-----------|------------|-----------|----------|
| Missing compiler | `config` | 1 | Throw immediately, cli.ts catches, prints `[config]` message |
| File syntax error | `parse` | 0 or 1 | Collected, logged as warnings, scan continues; exit 1 only on i18n key failures |
| i18n key validation failure | `validation` | 1 | Existing behavior, unchanged |

---

## Shadow-Mode Architecture

The shadow-mode harness is a build-order and test-infrastructure concern, not a runtime concern. The production code path does not contain shadow-mode branching; it is implemented in the test/tooling layer.

### Shadow-Mode Flag

A CLI flag `--ast` (or env `I18N_SHARPEN_AST=1`) enables the AST parser path. Without the flag, `detectUsedKeys` continues to use the existing regex path. This flag gating lives in `detectUsedKeys()` in `src/core/scanner/index.ts`.

```typescript
// Simplified — actual implementation uses an options param
export async function detectUsedKeys(
  files: string[],
  matchFunctions: string[],
  matchAttributes: string[],
  cwd: string,
  options?: { useAst?: boolean }
): Promise<{ usedKeys: Set<string>; fileContents: string[]; parsedResults: Map<string, ParsedFileResult> }>
```

When `options.useAst` is false (the default), the function falls back to the current regex pipeline synchronously. When true, the async parse pool runs.

**NOTE:** This means the function must always be async (to support the AST path), but when using the regex fallback, it executes synchronously inside an `async` wrapper. This is the correct trade-off: all callers become async once, but the actual execution is fast-path synchronous for regex.

### Differential Test Harness

A standalone test script (not part of the main test suite, lives in `scripts/shadow-compare.ts` or similar) that:
1. Runs `detectUsedKeys` with `useAst: false` on a corpus directory
2. Runs `detectUsedKeys` with `useAst: true` on the same corpus
3. Diffs `usedKeys` sets — reports keys found by AST but not regex, and keys found by regex but not AST
4. Writes a report to stdout (or a file) with false-positive and false-negative rates

This script gates the "flip the default" milestone: the diff must be zero false-negatives (AST misses no key that regex found) before `useAst` becomes the default.

### Build Order: Shadow-Mode Before Delete

The delete phase (removing `regex.ts`, `dynamic.ts`, `hardcoded.ts`, `scanner.ts` shim) is explicitly a **separate phase** — it cannot be merged with the AST implementation phase. The delete phase is only safe after:
1. AST parser produces zero false-negatives on the test corpus
2. `useAst: true` is flipped to the default
3. All behavioral tests pass with AST as the driver

---

## Recommended Project Structure (v0.4.0 target)

```
src/
├── cli.ts                          # MODIFY: validate/extract actions → async
├── index.ts                        # MODIFY: type sigs → Promise
├── types.ts                        # unchanged
├── utils.ts                        # MODIFY: remove escapeRegex re-export
├── config/                         # unchanged
├── commands/
│   ├── validate.ts                 # MODIFY: → async, use parsedResults
│   ├── extract.ts                  # MODIFY: → async
│   ├── prune.ts                    # MODIFY: await detectUsedKeys
│   ├── validate/                   # unchanged
│   └── _shared/                    # unchanged
└── core/
    ├── errors.ts                   # unchanged (kinds already cover parse + config)
    ├── locale-io/                  # unchanged
    └── scanner/
        ├── index.ts                # MODIFY: async detectUsedKeys + parse pool
        ├── text.ts                 # MODIFY: receives isHardcodedIgnored
        ├── lines.ts                # KEEP unchanged
        ├── files.ts                # KEEP unchanged
        ├── regex.ts                # KEEP (shadow phase); DELETE later
        ├── dynamic.ts              # KEEP (shadow phase); DELETE later
        ├── hardcoded.ts            # KEEP (shadow phase); DELETE later
        ├── scanner.ts              # KEEP shim (shadow phase); DELETE later
        └── parsers/                # NEW subtree
            ├── types.ts            # ParsedFileResult interface
            ├── resolve.ts          # loadWorkspaceDep() — fatal on missing
            ├── babel.ts            # @babel/parser + traverse; offset delta param
            ├── vue.ts              # @vue/compiler-sfc; delegates script → babel
            ├── svelte.ts           # svelte/compiler (modern: true); delegates → babel
            ├── astro.ts            # @astrojs/compiler (WASM async init); → babel
            └── index.ts            # parseFile() dispatcher
```

---

## Data Flow Change

### Before (v0.3.0 — 3 separate regex passes per file)

```
files[]
  → fs.readFileSync (per file)
  → stripComments → fileContents[]
  → keyRegex.matchAll (pass 1: usedKeys)
  → attrRegex.matchAll (pass 2: usedKeys continued)
  → dynamicCallRegex.matchAll (pass 3: dynamicCalls)
  → validate.ts: scanTemplateTextNodes (pass 4: hardcoded, only for eligible exts)
```

### After (v0.4.0 — single parseFile() call per file)

```
files[]
  → fs.readFileSync (per file, still needed for fileContents/looseKeyMatch)
  → stripComments → fileContents[] (still needed, runs independently)
  → [concurrent parse pool]
      → parseFile(filePath, rawContent, config, cwd)   ← ONE call per file
          → babel / vue / svelte / astro parser
          → returns ParsedFileResult {
              usedKeys: [...],        ← replaces passes 1+2
              dynamicCalls: [...],    ← replaces pass 3
              hardcodedCandidates:[...] ← replaces pass 4
            }
  → parsedResults: Map<filePath, ParsedFileResult>
  → aggregate: usedKeys (Set), dynamicCalls, hardcodedCandidates

detectUsedKeys returns: { usedKeys, fileContents, parsedResults }
```

**Key data-flow implication for `validate.ts`:** The current secondary loop (lines 130–189 of `validate.ts`) that re-runs `keyRegex`, `attrRegex`, and `dynamicCallRegex` per file to build `keyToFilesMap` and `dynamicFindings` can be replaced by iterating `parsedResults`. The `looseKeyMatch` block (lines 192–213) is unchanged — it still reads from `fileContents`.

---

## Architectural Patterns

### Pattern 1: Offset-Delta Babel Helper

**What:** `babel.ts` accepts an `offsetDelta: number` parameter (default 0). Every offset produced by Babel traversal is incremented by `offsetDelta` before being stored in the `ParsedFileResult`. Framework parsers compute `offsetDelta` by finding where their script block starts in the full file string.

**When to use:** Any framework parser that extracts a substring and hands it to Babel.

**Trade-offs:** Simple and zero-overhead. Correct for all cases where the script content is a contiguous substring of the full file (which is always true for embedded script blocks).

```typescript
// In vue.ts — schematic
const scriptContent = descriptor.script?.content ?? ""
const blockStart = descriptor.script?.loc.start.offset ?? 0
const scriptResult = await parseBabelBlock(scriptContent, blockStart, config)
// All scriptResult.usedKeys[*].offset values are now absolute
```

### Pattern 2: Collect-then-Continue Error Accumulation

**What:** Inside the per-file iteration of `detectUsedKeys`, each `parseFile()` call is wrapped in a try/catch. Errors are pushed to `syntaxErrors: I18nSharpenError[]`, then the loop continues. After the loop, if `syntaxErrors.length > 0`, they are logged with `log.warn()`.

**When to use:** File-level parse errors only. Not for missing compilers (those are fatal).

**Trade-offs:** Prevents one bad file from killing a CI run. The cost is slightly noisy output — acceptable for a scanner tool.

### Pattern 3: `loadWorkspaceDep` with `createRequire`

**What:** Uses Node's `module.createRequire(cwd + "/package.json")` to resolve framework compiler packages from the user's workspace `node_modules`, not the CLI's `node_modules`. The resolved module is dynamically `import()`-ed and cached in a module-level `Map<string, unknown>` to avoid re-loading on repeated calls.

**When to use:** All dynamic framework compiler loads (`@vue/compiler-sfc`, `svelte/compiler`, `@astrojs/compiler`).

**Trade-offs:** Works correctly in all installation layouts (global npx, local devDep, monorepo). The `createRequire` path is the established pattern for tools that need workspace deps. Caching prevents startup overhead on large repos.

---

## Anti-Patterns

### Anti-Pattern 1: Big-bang rewrite — implement AST + delete regex in one phase

**What people do:** Write all AST parsers, delete all regex files, update all tests in a single PR.

**Why it's wrong:** No differential validation. If AST misses edge cases that regex handled (even poorly), there is no way to detect the regression before shipping. The `forwardRef<A,B>` and `<m.div>` cases are exactly the kind of edge cases that require corpus comparison.

**Do this instead:** AST behind a flag first. Shadow-compare on a real corpus. Flip default. Delete in a subsequent phase.

### Anti-Pattern 2: Crashing on file syntax errors

**What people do:** Let `parseFile()` throw propagate to `detectUsedKeys()` which throws to the command which throws to `cli.ts` — aborting the entire run.

**Why it's wrong:** A scanner tool must survive one bad file in a 500-file codebase. CI must not fail because a developer has a work-in-progress file with a syntax error.

**Do this instead:** Catch per-file errors inside the iteration loop, accumulate them, log as warnings, continue. Only missing compilers are fatal (because there is no way to proceed without them).

### Anti-Pattern 3: Deleting behavioral tests when deleting regex code

**What people do:** Delete `dynamic.test.ts`, `hardcoded.test.ts`, `scanner.test.ts` when deleting the regex modules.

**Why it's wrong:** Those test files contain input→output behavioral cases that must still be true under the AST implementation. Deleting them removes the regression coverage.

**Do this instead:** Port the behavioral test cases (the `{ input, expectedOutput }` fixtures) into new AST parser test files. Delete only the tests that exercise regex internals (e.g., `buildKeyRegex` output, `extractLeadingPrefix` regex mechanics). The golden edge cases — `<m.div>` dot-notation and `forwardRef<A,B>` generics — must become explicit AST test cases.

### Anti-Pattern 4: Using `Promise.all()` on all files simultaneously

**What people do:** `const results = await Promise.all(files.map(f => parseFile(f, ...)))`

**Why it's wrong:** On a large codebase (500+ files), this spawns 500 concurrent file reads + AST parses. Memory spikes, I/O thrashing, possible OOM on resource-constrained CI containers.

**Do this instead:** A concurrency-capped pool (4 concurrent parses as a starting default, tunable via env var). Bounded concurrency is the correct default for file-system-intensive parallel work.

### Anti-Pattern 5: Block-relative offsets in ParsedFileResult

**What people do:** Return offsets relative to the script block content string (as Babel naturally provides them) and let callers add the block start.

**Why it's wrong:** Callers (validate.ts, extract.ts) should not need to know about offset rebasing — that is a parser implementation detail. Leaking block-relative offsets forces every caller to track per-file block offsets, breaking the clean interface.

**Do this instead:** The `ParsedFileResult.usedKeys[*].offset` (and all other offsets) are always document-absolute. The rebasing happens inside the framework parser, before the result is returned.

---

## Integration Points

### New Components (parsers/ subtree) — Integration with Existing Code

| New component | Integrates with | Integration mechanism |
|--------------|-----------------|----------------------|
| `parsers/types.ts` | `scanner/index.ts`, `commands/validate.ts` | Import type `ParsedFileResult` |
| `parsers/resolve.ts` | `parsers/vue.ts`, `parsers/svelte.ts`, `parsers/astro.ts` | Called as `loadWorkspaceDep<T>(name, cwd)` |
| `parsers/babel.ts` | `parsers/vue.ts`, `parsers/svelte.ts`, `parsers/astro.ts`, `parsers/index.ts` | Called with script content + `offsetDelta` |
| `parsers/index.ts` (parseFile) | `scanner/index.ts` | Called per file inside the concurrency pool |

### Modified Files — Exact Call-Site Changes

| Modified file | Current call | New call |
|--------------|-------------|----------|
| `scanner/index.ts` | `buildKeyRegex(...)` / regex loops | `await parseFile(file, content, config, cwd)` |
| `commands/validate.ts` | `detectUsedKeys(files, fns, attrs)` | `await detectUsedKeys(files, fns, attrs, cwd)` |
| `commands/validate.ts` | `buildDynamicCallRegex` + regex loop | `parsedResults.get(file)?.dynamicCalls` |
| `commands/validate.ts` | `scanTemplateTextNodes(content, isJsx)` | `parsedResults.get(file)?.hardcodedCandidates` |
| `commands/extract.ts` | `detectUsedKeys(files, fns, attrs)` | `await detectUsedKeys(files, fns, attrs, cwd)` |
| `commands/prune.ts` | `detectUsedKeys(files, fns, attrs)` | `await detectUsedKeys(files, fns, attrs, cwd)` |
| `cli.ts` validate action | `const results = validate(config, cwd, opts)` | `const results = await validate(config, cwd, opts)` |
| `cli.ts` extract action | `extract(config, cwd)` | `await extract(config, cwd)` |

### `looseKeyMatch` Second Pass — No Change Required

The `looseKeyMatch` feature in `validate.ts` (lines 192–213) uses `fileContents[i]` and `files[i]` by parallel index. This coupling is preserved unchanged:
- `fileContents` is still returned from `detectUsedKeys()`
- `fileContents[i]` still corresponds to `files[i]` (same index)
- `fileContents[i]` is still `stripComments(rawContent)` (not AST output)

---

## Suggested Build Order (Phase Derivation)

### Phase A: Foundation and Interface (no behavior change)

1. Add `@babel/parser` + `@babel/traverse` to `package.json` dependencies
2. Create `src/core/scanner/parsers/types.ts` — `ParsedFileResult` interface
3. Create `src/core/scanner/parsers/resolve.ts` — `loadWorkspaceDep()` with fatal error
4. Write tests for `resolve.ts` — missing package throws `I18nSharpenError{kind:"config"}`

All existing tests must still pass (no behavior change yet).

### Phase B: Babel Core Parser

1. Create `src/core/scanner/parsers/babel.ts`:
   - Parse with `errorRecovery: true`
   - Traverse: `CallExpression` visitors for `usedKeys` + `dynamicCalls`
   - Traverse: `JSXText` + `JSXAttribute` visitors for `hardcodedCandidates`
   - Accept `offsetDelta: number` parameter; apply to all offsets
2. Write tests in `src/__tests__/parsers/babel.test.ts`:
   - Port behavioral cases from `scanner.test.ts` and `dynamic.test.ts`
   - Add golden cases: `<m.div>` dot-notation, `forwardRef<HTMLInputElement, InputProps>` generics (must not corrupt results)
   - Test `offsetDelta` rebasing: verify offsets are correctly shifted

### Phase C: Framework Parsers

For each of Vue, Svelte, Astro (can be done in parallel or sequentially):

1. Create `parsers/vue.ts` — `@vue/compiler-sfc`, offset rebase for script blocks
2. Create `parsers/svelte.ts` — Svelte 5 `{ modern: true }` AST, offset rebase
3. Create `parsers/astro.ts` — WASM async init, offset rebase for frontmatter
4. Write tests for each framework parser (use inline fixture strings — no real files needed)
5. Create `parsers/index.ts` — extension dispatcher

### Phase D: Async Migration (shadow mode on, regex still default)

1. Rewrite `src/core/scanner/index.ts`:
   - `detectUsedKeys` → async
   - Bounded-concurrency pool (4 default)
   - Shadow-mode flag: `options?.useAst` (default: `false`)
   - When `useAst: false`: fall through to existing regex path (synchronously, inside async wrapper)
   - When `useAst: true`: use `parseFile()` pool
   - Always return `{ usedKeys, fileContents, parsedResults }` (parsedResults is empty Map when regex path)
2. Update `src/commands/validate.ts` → async
3. Update `src/commands/extract.ts` → async
4. Update `src/commands/prune.ts` → add `await` to `detectUsedKeys` call
5. Update `src/index.ts` — type signatures (Promise return types in JSDoc)
6. Update `src/cli.ts` — make validate and extract action handlers async
7. Update test files: `validate.test.ts`, `extract.test.ts` — add `await`

All existing tests must still pass (regex is still the default driver).

### Phase E: Shadow Comparison and Default Flip

1. Write (or run) `scripts/shadow-compare.ts` against a real project corpus
2. Confirm: zero false-negatives (AST finds all keys regex found + more)
3. Document any AST-only gains and regex-only losses
4. Flip default: change `options?.useAst` default to `true` in `detectUsedKeys`
5. Run full test suite — all tests must pass with AST as default
6. Run perf benchmark — must not regress past 100ms overhead baseline

### Phase F: Cleanup (separate PR/phase from Phase E)

Only after Phase E is complete and the default is flipped:

1. Delete `src/core/scanner/regex.ts`
2. Delete `src/core/scanner/dynamic.ts`
3. Delete `src/core/scanner/hardcoded.ts` (first move `isHardcodedIgnored` to `text.ts`)
4. Delete `src/core/scanner.ts` (deprecated shim — update any direct importers)
5. Update `src/utils.ts` — remove `escapeRegex` re-export
6. Update `src/core/scanner/index.ts` barrel — remove re-exports of deleted modules
7. Port-delete test files: delete only the regex-internal tests from `scanner.test.ts`, `dynamic.test.ts`, `hardcoded.test.ts`; confirm all behavioral cases exist in `parsers/` test files
8. Remove the `options.useAst` flag (AST is now the only path; no shadow mode needed)
9. Add BREAKING CHANGELOG entry for the async public API

---

## Sources

- Direct source inspection of `src/core/scanner/{index,text,lines,hardcoded,dynamic}.ts`
- Direct source inspection of `src/commands/{validate,extract,prune}.ts`
- Direct source inspection of `src/cli.ts`, `src/index.ts`, `src/core/errors.ts`
- `.planning/v0.4.0-SEED-PLAN.md` (file-by-file change table, interface definitions)
- `.planning/STATE.md` (accumulated context notes 1–7, GitNexus blast-radius assessment)
- `.planning/PROJECT.md` (constraints, key decisions, async migration rationale)
- Confidence: HIGH — all integration points verified by reading the actual source files

---
*Architecture research for: i18n-sharpen v0.4.0 AST Parser Rewrite*
*Researched: 2026-05-31*
