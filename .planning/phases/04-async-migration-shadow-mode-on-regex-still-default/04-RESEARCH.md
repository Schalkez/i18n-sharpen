# Phase 4: Async Migration (shadow mode on, regex still default) - Research

**Researched:** 2026-06-01
**Domain:** TypeScript async refactor, bounded-concurrency pool, validate.ts AST wiring
**Confidence:** HIGH (all findings from direct source inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `detectUsedKeys` returns `{ usedKeys, fileContents, parsedResults, parseErrors }`.
- **D-02:** `validate` and `extract` become `async`. `prune` already async. `cli.ts` adds `await` to validate/extract call sites.
- **D-03:** `pnpm tsc --noEmit` must pass with zero errors after every caller is updated.
- **D-04:** When `useAst: true`, `parsedResults` fully drives `validate` (used keys, keyToFilesMap, dynamic findings, hardcoded candidates). The regex re-scan loop runs only in regex mode.
- **D-05:** `validate` branches on `useAst` into two equivalent code paths for `ValidationResults`.
- **D-06:** Hardcoded candidates are raw/structural from parsers. Caller still applies `isHardcodedIgnored`. `--check-hardcoded` gates hardcoded work in both modes.
- **D-07:** `looseKeyMatch` operates on `fileContents` (string includes), independent of `useAst`. Regression test required (ASYNC-03).
- **D-08:** `useAst` is internal only — NOT added to `I18nSharpenConfig`, zod schema, public `src/types.ts`, or `cli.ts`. Default false everywhere.
- **D-09:** Tests flip `useAst` directly via opts. No public/CLI/env-var way to enable AST path in Phase 4.
- **D-10:** New signature: `detectUsedKeys(files, matchFunctions, matchAttributes, opts?): Promise<{usedKeys, fileContents, parsedResults, parseErrors}>` where `opts = { cwd?: string; useAst?: boolean; maxConcurrency?: number }`.
- **D-11:** Hand-rolled zero-dependency async worker pool, N=4. No `p-limit`. Never `Promise.all` over all files.
- **D-12:** `maxConcurrency` is internal test/harness override only, default 4. Not user-configurable.
- **D-13:** Pool runs only in AST mode. Regex mode preserves synchronous `readFileSync + stripComments` path unchanged.
- **D-14:** `parseErrors: FileParseError[]` aggregated from each `parseFile` call's errors array. `validate`/`extract`/`prune` log them as `log.warn`. Regex mode produces empty array.

### Claude's Discretion

- Internal worker-pool structure (queue vs atomic index counter), file/module location, and naming.
- Whether the `validate` AST branch is inline `if (useAst)` or extracted helper functions.
- Exact `log.warn` wording/format for collected `parseErrors`.
- `opts` field defaulting mechanics (`cwd ?? process.cwd()`, `maxConcurrency ?? 4`, `useAst ?? false`).
- Updating JSDoc usage examples in `src/index.ts` to show `await validate(...)` / `await extract(...)`.
- How `extract` and `prune` consume the AST path (lighter consumers than `validate`).

### Deferred Ideas (OUT OF SCOPE)

- Public `maxConcurrency` config field / CLI flag.
- Exposing the AST engine to users via config/CLI/env-var.
- Shadow differential harness + perf gate + default flip (Phase 5).
- Deleting regex/dynamic/hardcoded modules and removing the `useAst` flag (Phase 6).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ASYNC-01 | `detectUsedKeys` becomes async and returns `{ usedKeys, fileContents, parsedResults }` (extended to 4-field with `parseErrors` per D-01) | Exact current signature documented below; new signature fully specified in D-10 |
| ASYNC-02 | `validate`/`extract`/`prune` and public API return `Promise`; `cli.ts` awaits them | All four call sites documented with exact line numbers |
| ASYNC-03 | `fileContents` still returned; regression test for `looseKeyMatch` after async refactor | `looseKeyMatch` block documented (validate.ts lines 191-213); test shape specified in Validation Architecture |
| ASYNC-04 | Bounded-concurrency pool, no unbounded `Promise.all` over all files | Worker-pool pattern documented; concurrency-assertion test shape specified |
| SHADOW-01 | AST path gated behind flag; regex stays default | `useAst` propagation path through all consumers documented; branch anatomy for validate.ts specified |

</phase_requirements>

---

## Summary

Phase 4 is a pure refactoring phase: no new features are visible to end users. The primary code changes are (1) making `detectUsedKeys` async with a hand-rolled bounded-concurrency pool that only activates when `useAst:true`, (2) cascading `async`/`await` through `validate`, `extract`, `prune`, `src/index.ts` (re-export shapes), and two `cli.ts` call sites, and (3) wiring the Phase 3 `parseFile()` dispatcher as a real code path behind the `useAst` flag inside `validate.ts` so the AST branch produces equivalent `ValidationResults`.

The regex path is entirely untouched structurally: the `readFileSync + stripComments` loop in `detectUsedKeys` is preserved character-for-character, the `buildKeyRegex/buildAttrRegex/buildDynamicCallRegex` loop in `validate.ts` runs only when `useAst:false`, and the async overhead in regex mode is a no-op (the pool is never entered).

The heaviest single task is wiring `validate.ts`'s AST branch: it must reconstruct `keyToFilesMap`, `fullyDynamicFindings`, `structuredConcatFindings`, and `hardcodedFindings` from `parsedResults[i]` (document-absolute offsets, `dynamicCalls`, `hardcodedCandidates`) so they are byte-equivalent to what the regex loop produces, including `offsetToLine` calls and the `isHardcodedIgnored` quality filter.

**Primary recommendation:** Implement in three waves — (1) async signature + regex-mode cascade + all call sites + tsc clean, (2) worker-pool + AST wiring in validate/extract/prune, (3) regression tests + useAst:true end-to-end gate.

---

## Current Code Shapes (VERIFIED by source inspection)

### `src/core/scanner/index.ts` — `detectUsedKeys` (current)

```typescript
// Lines 23-55 (entire function)
export function detectUsedKeys(
  files: string[],
  matchFunctions: string[],
  matchAttributes: string[]
): { usedKeys: Set<string>; fileContents: string[] }
```

**Body structure:**
1. `buildKeyRegex(matchFunctions)` + `buildAttrRegex(matchAttributes)` — build regexes once.
2. `files.map(file => { readFileSync(file, 'utf8') → stripComments(content) })` — synchronous, returns `fileContents: string[]` parallel to `files`. Read errors return `""`.
3. `for (const cleanContent of fileContents)` — double `matchAll` loop building `usedKeys: Set<string>`. Keys ending in `.` skipped.
4. Returns `{ usedKeys, fileContents }`.

**The module also barrel-exports** (lines 1-10): `./files`, `./regex`, `./text`, `./dynamic`, `./lines`, `./hardcoded` — all of these are re-exported via `@/core/scanner` and consumed by `validate.ts`.

### `src/core/scanner/parsers/index.ts` — `parseFile()` (Phase 3 dispatcher)

```typescript
// Lines 11-63
export async function parseFile(
  source: string,
  filePath: string,
  matchFunctions: string[],
  matchAttributes: string[],
  cwd: string
): Promise<{ result: ParsedFileResult; errors: FileParseError[] }>
```

Routes by `path.extname(filePath).toLowerCase()`. `.ts/.tsx/.js/.jsx` get `Promise.resolve(parseTypeScriptFile(...))`. Unknown extensions return empty result with no errors. [VERIFIED: src/core/scanner/parsers/index.ts]

### `src/core/scanner/parsers/types.ts` — `ParsedFileResult` + `FileParseError`

```typescript
interface ParsedFileResult {
  usedKeys: { key: string; offset: number }[]        // document-absolute offsets
  dynamicCalls: {
    expression: string
    arg: string
    offset: number
    classification: "fully-dynamic" | "structured-concat"
    prefix?: string
  }[]
  hardcodedCandidates: { text: string; offset: number }[]
}

interface FileParseError {
  file: string
  line?: number
  message: string
}
```

[VERIFIED: src/core/scanner/parsers/types.ts]

### `src/commands/validate.ts` — Current synchronous implementation

**Function signature (line 41-45):**
```typescript
export function validate(
  config: I18nSharpenConfig,
  cwd: string = process.cwd(),
  options?: { checkHardcoded?: boolean }
): ValidationResults
```

**Block 1 — `detectUsedKeys` call (lines 100-108):**
```typescript
const { usedKeys, fileContents } = detectUsedKeys(
  files,
  matchFunctions,
  matchAttributes
)
```

**Block 2 — `keyToFilesMap` object (lines 111-128):**
Not a `Map` directly — it is an object with `.has(key)`, `.get(key)`, `.add(key, file)` methods wrapping a `Map<string, Set<string>>` internally. Used by `printValidationResults` and `writeMarkdownReport`. The AST branch must build this same structure.

**Block 3 — regex re-scan loop (lines 130-188):**
Builds `keyRegex`, `attrRegex`, `dynamicCallRegex`. Iterates `for (let i = 0; i < files.length; i++)`. Per file:
- `cleanContent = fileContents[i]`
- `relativePath = normalizeDisplayPath(path.relative(cwd, file))`
- `keyRegex.matchAll` → `keyToFilesMap.add(key, relativePath)` (skip `.`-ending)
- `attrRegex.matchAll` → `keyToFilesMap.add(key, relativePath)` (skip `.`-ending)
- `computeLineOffsets(cleanContent)` → `lineOffsets`
- `dynamicCallRegex.matchAll` per match: `isStaticStringLiteral` guard → `offsetToLine` → `classifyDynamicCall` → push to `fullyDynamicFindings` or `structuredConcatFindings` → `ignoreDynamicKeys` suppression check

**Block 4 — `looseKeyMatch` second pass (lines 191-213):**
```typescript
if (config.looseKeyMatch) {
  for (const key of defaultKeys) {
    if (usedKeys.has(key)) continue
    const dq = `"${key}"`, sq = `'${key}'`, bq = `\`${key}\``
    for (let i = 0; i < files.length; i++) {
      if (fileContents[i].includes(dq) || ...) {
        usedKeys.add(key)
        keyToFilesMap.add(key, ...)
      }
    }
  }
}
```

Uses `fileContents` (stripped-comment strings), independent of `useAst` — must run after either code path. [VERIFIED: validate.ts line 192]

**Block 5 — hardcoded scan (lines 219-249):**
Only when `options?.checkHardcoded`. Per eligible file (`.tsx/.jsx/.vue/.svelte/.astro`):
- Reads raw content via `fs.readFileSync` (NOT `fileContents` — uses raw source, not stripped)
- Calls `scanTemplateTextNodes(content, isJsx)` → `candidates: HardcodedTextCandidate[]`
- `computeLineOffsets(content)` → `lineOffsets`
- `customIgnores = config.hardcoded?.ignore ?? []`
- For each candidate: `isHardcodedIgnored(cand.text, customIgnores)` gate → push `HardcodedFinding`

**IMPORTANT:** The regex hardcoded path reads the raw file again (not `fileContents`). The AST path gets `hardcodedCandidates` from `parsedResults[i]` (structural, already trimmed, document-absolute offsets from `ParsedFileResult`). The caller must still apply `isHardcodedIgnored` (D-06). The `computeLineOffsets` call in the AST branch uses the raw source (to match offset semantics correctly with document-absolute offsets from the parser).

**Final `ValidationResults` assembly (lines 280-295):**
```typescript
const results: ValidationResults = {
  ...,
  dynamicKeys: { fullyDynamic: fullyDynamicFindings, structuredConcat: structuredConcatFindings },
  hardcodedStrings: options?.checkHardcoded ? hardcodedFindings : undefined
}
```

### `src/commands/extract.ts` — Current synchronous

```typescript
export function extract(
  config: I18nSharpenConfig,
  cwd: string = process.cwd()
): void
```

Calls `detectUsedKeys(files, matchFunctions, matchAttributes)` at line 40, destructures only `{ usedKeys }`. Does NOT use `fileContents` or `parsedResults`. [VERIFIED: extract.ts line 40]

### `src/commands/prune.ts` — Already async

```typescript
export async function prune(
  config: I18nSharpenConfig,
  cwd: string = process.cwd(),
  options: PruneOptions = {}
): Promise<PruneResult>
```

Calls `detectUsedKeys(files, matchFunctions, matchAttributes)` at lines 61-65, destructures `{ usedKeys, fileContents }`. Uses `fileContents` downstream (passed to `pruneFlat`/`pruneNamespaced`/`collectFlatCandidates`/etc. for `looseKeyMatch` in prune pipeline). [VERIFIED: prune.ts lines 61-65]

### `src/cli.ts` — Call sites needing `await`

- **validate call site:** `cli.ts` line 97 — `const results = validate(config, cwd, {...})` — synchronous today. Must become `const results = await validate(config, cwd, {...})` and the `.action()` callback must become `async`.
- **extract call site:** `cli.ts` line 144 — `extract(config, cwd)` — synchronous today. Must become `await extract(config, cwd)` and the `.action()` callback must become `async`.
- **prune call site:** `cli.ts` line 206 — `await prune(config, cwd, {...})` — **already awaited**. The `.action()` is already `async`. No change needed here.

[VERIFIED: cli.ts lines 91-115 (validate action), 126-150 (extract action), 177-217 (prune action)]

### `src/index.ts` — Public re-exports

All four functions re-exported by name only (`export { validate } from "./commands/validate"` etc.). No wrapper. When `validate` and `extract` become `async`, the exported types automatically become `Promise`-returning — no change needed to `src/index.ts` structure beyond optional JSDoc update. [VERIFIED: src/index.ts]

### `src/types.ts` — No `useAst` field (D-08 confirmed)

`I18nSharpenConfig` interface contains no `useAst`, `maxConcurrency`, or parser engine fields. [VERIFIED: src/types.ts] — `useAst` must NOT be added here.

### Test files calling `detectUsedKeys` — sites requiring `await`

| File | Line | Current call |
|------|------|-------------|
| `src/core/scanner.test.ts` | 168 | `const { usedKeys } = detectUsedKeys([f], ["t"], [])` |
| `src/commands/validate.ts` | 104-108 | `const { usedKeys, fileContents } = detectUsedKeys(...)` |
| `src/commands/extract.ts` | 40 | `const { usedKeys } = detectUsedKeys(...)` |
| `src/commands/prune.ts` | 61-65 | `const { usedKeys, fileContents } = detectUsedKeys(...)` |

The `validate.test.ts` and `extract.test.ts` integration tests call `validate(...)` and `extract(...)` (the command functions) directly, not `detectUsedKeys`. Those must become `await validate(...)` / `await extract(...)` once the commands are async.

[VERIFIED: grep of `detectUsedKeys` across `src/`]

---

## Architecture Patterns

### New `detectUsedKeys` Signature (D-10)

```typescript
// src/core/scanner/index.ts
export async function detectUsedKeys(
  files: string[],
  matchFunctions: string[],
  matchAttributes: string[],
  opts?: { cwd?: string; useAst?: boolean; maxConcurrency?: number }
): Promise<{
  usedKeys: Set<string>
  fileContents: string[]
  parsedResults: ParsedFileResult[]
  parseErrors: FileParseError[]
}>
```

**Regex mode (default, `useAst ?? false`):** Runs the existing synchronous `readFileSync + stripComments + matchAll` logic unchanged. Returns `parsedResults: []` and `parseErrors: []` to satisfy the return type. Zero behavioral change.

**AST mode (`useAst: true`):** Reads each file, calls the bounded worker pool with `parseFile`, aggregates `{ result, errors }`, returns `parsedResults` parallel to `files` and aggregated `parseErrors`.

### Bounded Worker Pool Pattern (D-11, ASYNC-04)

Zero-dependency, Node ≥ 20 compatible. Uses a shared atomic index counter (simplest pattern — no queue overhead for this use case):

```typescript
// Conceptual shape — exact naming/location is Claude's discretion
async function runBoundedPool<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  maxConcurrency: number
): Promise<void> {
  let nextIndex = 0

  async function drain(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++
      await worker(items[i], i)
    }
  }

  const workers = Array.from({ length: Math.min(maxConcurrency, items.length) }, drain)
  await Promise.all(workers)
}
```

Key property: `Promise.all` is called on **N worker coroutines** (max 4), NOT on `files`. Each worker drains from a shared index counter. At any moment, at most N files are in flight. [ASSUMED] — this is a standard bounded-concurrency pattern in Node.js; verified against well-known patterns.

**Critical distinction from ASYNC-04 violation:** `Promise.all(files.map(f => parseFile(...)))` = unbounded (forbidden). `Promise.all([drain(), drain(), drain(), drain()])` = N workers bounded (allowed).

### Validate AST Branch — Field-by-Field Mapping (D-04, D-05)

When `useAst: true`, `parsedResults[i]` (parallel to `files[i]`) provides all data. The mapping:

| Regex source | AST source | Notes |
|---|---|---|
| `keyRegex.matchAll(cleanContent)` → `keyToFilesMap.add(key, file)` | `parsedResults[i].usedKeys[j].key` → `keyToFilesMap.add(key, file)` | Skip `.`-ending keys same as regex |
| `attrRegex.matchAll(cleanContent)` → `keyToFilesMap.add(key, file)` | Already merged into `parsedResults[i].usedKeys` by the parser | Attribute keys are in the same `usedKeys` array |
| `usedKeys.add(key)` from keyRegex+attrRegex loops | `for (const { key } of parsedResults[i].usedKeys)` → `usedKeys.add(key)` | Skip `.`-ending |
| `dynamicCallRegex.matchAll` → `classifyDynamicCall(arg)` | `parsedResults[i].dynamicCalls[j].classification` + `.prefix` | Classification already done by parser (Phase 2 D-02) |
| `match.index` → `offsetToLine(lineOffsets, matchIndex)` | `parsedResults[i].dynamicCalls[j].offset` → `offsetToLine(lineOffsets, offset)` | `lineOffsets` computed from `fileContents[i]` or raw source; offsets are document-absolute (OFFSET-01) |
| `match[0]` as `expression` string | `parsedResults[i].dynamicCalls[j].expression` | Already the call expression string (Phase 2 D-03) |
| `classifyDynamicCall(arg).prefix` | `parsedResults[i].dynamicCalls[j].prefix ?? ""` | Empty string for fully-dynamic |
| `ignoreDynamicKeys` suppression | Same logic applied to `.prefix` from AST finding | Identical suppression code |
| `scanTemplateTextNodes(rawContent, isJsx)` | `parsedResults[i].hardcodedCandidates` | AST candidates are already trimmed, document-absolute |
| `computeLineOffsets(rawContent)` for hardcoded | `computeLineOffsets(rawContent)` for hardcoded | Use raw source for offset mapping (same as regex path) |
| `isHardcodedIgnored(cand.text, customIgnores)` | `isHardcodedIgnored(cand.text, customIgnores)` | D-06: caller applies quality filter in both paths |

**`lineOffsets` in AST mode:** The parser produces document-absolute offsets. The caller uses `computeLineOffsets` on the raw file content (passed as `source` to `parseFile`) to convert offsets → line numbers. For `fileContents[i]` (stripped-comment source), `computeLineOffsets` is used for `dynamicCalls` offset mapping. For hardcoded candidates, raw content `lineOffsets` are used.

**`looseKeyMatch` (lines 191-213):** Runs unchanged in both modes — it only reads `fileContents` (string includes), `defaultKeys`, `usedKeys`, and `keyToFilesMap`. Independent of `useAst`. The `fileContents` returned from `detectUsedKeys` in AST mode must still be the stripped-comment strings (read + `stripComments` during the read step regardless of mode).

**`--check-hardcoded` gate:** Same `options?.checkHardcoded` boolean in both paths. AST path skips eligible-extensions loop; uses `parsedResults[i].hardcodedCandidates` directly.

### Validate/Extract/Prune AST Consumption Summary

**`extract.ts`:** Only needs `usedKeys` from `detectUsedKeys`. AST path: `usedKeys` is derived from `parsedResults[i].usedKeys` inside `detectUsedKeys` (same logic as regex — build `Set<string>` from all parsed keys). No change to `extract`'s body beyond `await` and `async`.

**`prune.ts`:** Needs `usedKeys` + `fileContents`. Same as extract plus `fileContents` pass-through. `fileContents` must be populated in both modes (regex: from stripComments; AST: read file + stripComments during the read phase). No structural change to prune's body beyond `await` and `async`.

**`validate.ts`:** The heavy consumer. Needs the full mapping above. Must `await detectUsedKeys(...)` and then branch on `useAst` to select the code path that builds `keyToFilesMap`, `fullyDynamicFindings`, `structuredConcatFindings`, and `hardcodedFindings`.

### `parseErrors` Logging (D-14)

After `await detectUsedKeys(...)` in each command:
```typescript
for (const err of parseErrors) {
  log.warn(`Parse warning: ${err.file}${err.line ? `:${err.line}` : ''}: ${err.message}`)
}
```
Exact wording is Claude's discretion. Regex mode returns `[]` so the loop is a no-op in default mode.

---

## Standard Stack

All Phase 4 code uses the existing project stack — no new dependencies.

| Component | Version | Notes |
|-----------|---------|-------|
| TypeScript | ^5.9.3 (devDep) | Strict mode, ESM, `moduleResolution: "bundler"` |
| Vitest | ^1.5.0 | `pnpm test` = `vitest run` |
| tsup | ^8.0.2 | `pnpm build` = tsup |
| Node | ≥ 20 | ESM module type |

[VERIFIED: package.json]

**No new runtime dependencies.** Pool is hand-rolled (D-11). No `p-limit`, no `piscina`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Worker threads / child processes | Any thread pool | Plain `async/await` coroutine drain pattern | Files are I/O + in-process parsing; thread overhead is unwarranted |
| Concurrency limiting | `p-limit` npm package | Hand-rolled N-drain pattern (D-11) | Zero-dep constraint; pattern is ~10 lines |
| File reading | Custom async file reader | `fs.readFile` (async) or keep `readFileSync` + async pool structure | Already established; pick based on mode |

---

## Common Pitfalls

### Pitfall 1: `fileContents` unpopulated in AST mode
**What goes wrong:** If the AST branch does not run `stripComments` on each file, `fileContents[i]` is missing, and `looseKeyMatch` (which checks `fileContents[i].includes(dq)`) finds nothing — silently missing keys.
**Why it happens:** The regex path builds `fileContents` as a side effect of the existing `files.map` loop. Easy to forget to replicate in AST mode.
**How to avoid:** In both modes, always build `fileContents: string[]` from `stripComments(rawSource)` — even in AST mode where it is not used for key extraction.
**Warning signs:** `looseKeyMatch: true` tests failing under `useAst:true` but not `useAst:false`.

### Pitfall 2: `parsedResults` not parallel to `files`
**What goes wrong:** The pool processes files in non-deterministic order if results are pushed as they complete. `validate.ts` assumes `parsedResults[i]` corresponds to `files[i]`.
**Why it happens:** Async completion order != submission order.
**How to avoid:** Pre-allocate `parsedResults = new Array(files.length)` and write `parsedResults[i] = result` by index, not push.

### Pitfall 3: Unbounded `Promise.all` in regex mode
**What goes wrong:** Accidentally wrapping the regex `fileContents` map in `Promise.resolve` → `Promise.all`. Not wrong per se (sync ops), but violates the mental model and could mislead reviewers.
**How to avoid:** Regex mode stays synchronous. The async wrapper is on `detectUsedKeys` itself; the internal body stays sync for regex.

### Pitfall 4: `useAst` leaking into public types
**What goes wrong:** Adding `useAst` to `I18nSharpenConfig` or the Zod config schema — violates D-08, surfaces an internal flag publicly.
**How to avoid:** Only add `useAst` to the `opts` parameter type of `detectUsedKeys`. Thread it through `validate`/`extract`/`prune` options parameters (which are already internal, not `I18nSharpenConfig`).

**Concretely:** `validate(config, cwd, options)` where `options` currently has `{ checkHardcoded?: boolean }` — extend it to `{ checkHardcoded?: boolean; useAst?: boolean; cwd?: string }` (internal only, not in `I18nSharpenConfig`). Same pattern for `extract` and `prune`.

### Pitfall 5: `classifyDynamicCall` called on AST data that is already classified
**What goes wrong:** Calling `classifyDynamicCall(arg)` on `parsedResults[i].dynamicCalls[j].arg` — double-classification. The parser already produced `.classification` and `.prefix`.
**How to avoid:** In AST branch, read `.classification` and `.prefix` directly from the `ParsedFileResult.dynamicCalls` entry.

### Pitfall 6: `offsetToLine` on wrong content string in AST mode
**What goes wrong:** Using `computeLineOffsets(fileContents[i])` (stripped source) for hardcoded candidates but the parser's hardcoded offsets are relative to the raw (unstripped) source.
**Why it happens:** The regex hardcoded path reads raw content (`fs.readFileSync`). The parser also processes raw content. `fileContents[i]` is stripped — offsets in `hardcodedCandidates` may not align with it.
**How to avoid:** For hardcoded candidates in AST mode, use `computeLineOffsets(rawSource)` where `rawSource` is the original file content (also needed for `parseFile` anyway).

### Pitfall 7: `validate`/`extract` `.action()` callbacks not marked `async`
**What goes wrong:** Adding `await validate(...)` inside a non-async Commander `.action()` callback — TypeScript error, and unhandled promise in runtime.
**How to avoid:** Change both `.action((cmdOpts) => { ... })` to `.action(async (cmdOpts) => { ... })`.

---

## Code Examples

### Worker Pool (Verified pattern — Node.js async coroutine drain)

```typescript
// Source: [ASSUMED] — standard Node.js bounded concurrency pattern
async function runPool(
  count: number,
  worker: (index: number) => Promise<void>
): Promise<void> {
  let next = 0
  const total = count
  async function drain(): Promise<void> {
    while (next < total) {
      const i = next++
      await worker(i)
    }
  }
  const slots = Math.min(maxConcurrency, total)
  await Promise.all(Array.from({ length: slots }, drain))
}
```

Called as:
```typescript
const parsedResults: ParsedFileResult[] = new Array(files.length)
const parseErrors: FileParseError[] = []

await runPool(files.length, async (i) => {
  const source = await fs.promises.readFile(files[i], 'utf8')
  const { result, errors } = await parseFile(source, files[i], matchFunctions, matchAttributes, cwd)
  parsedResults[i] = result
  parseErrors.push(...errors)
})
```

Note: `parseErrors.push(...errors)` races between workers — use a mutex or accumulate per-slot and flatten after, OR note that Array.push in Node.js is thread-safe for the single-threaded event loop (microtask interleaving does not split a push call). Safe in Node.js async/await (not threads). [ASSUMED]

### Concurrency Test — Peak Tracking

```typescript
// For ASYNC-04 verification
it('pool never exceeds maxConcurrency concurrent invocations', async () => {
  let peakConcurrency = 0
  let currentConcurrency = 0
  const files = Array.from({ length: 10 }, (_, i) => `file${i}.ts`)

  const instrumentedParseFile = async (_source: string, _path: string) => {
    currentConcurrency++
    peakConcurrency = Math.max(peakConcurrency, currentConcurrency)
    await new Promise(resolve => setTimeout(resolve, 5))
    currentConcurrency--
    return { result: { usedKeys: [], dynamicCalls: [], hardcodedCandidates: [] }, errors: [] }
  }

  // Call detectUsedKeys with useAst:true and injected parse fn
  // (exact injection mechanism is Claude's discretion — could be opts.parseFn or tested via pool helper directly)
  await runPool(files.length, async (i) => instrumentedParseFile('', files[i]), 4)

  expect(peakConcurrency).toBeLessThanOrEqual(4)
})
```

### looseKeyMatch Regression Test (ASYNC-03)

```typescript
it('looseKeyMatch still finds key present only in stripped content after async refactor', async () => {
  // Key appears only in a comment-stripped form — it is NOT in a t("...") call
  // so detectUsedKeys regex would not add it to usedKeys, but looseKeyMatch should
  const src = `// The key "feature.flag" is referenced here for documentation`
  // Write file with key only in comment-stripped content
  // (stripComments removes line comments, leaving the bare string '"feature.flag"')
  // Actually: the key must survive stripComments to be found by looseKeyMatch.
  // A better test: key in a string literal outside a t() call:
  const src2 = `const KEY = "feature.flag" // referenced but not via t()`
  fs.writeFileSync(f, src2, 'utf8')

  const { usedKeys, fileContents } = await detectUsedKeys([f], ['t'], [])
  // usedKeys does NOT contain "feature.flag" (not in t(...))
  expect(usedKeys.has('feature.flag')).toBe(false)
  // fileContents[0] DOES contain '"feature.flag"' (survives stripComments)
  expect(fileContents[0]).toContain('"feature.flag"')
  // Now simulate what validate's looseKeyMatch does:
  expect(fileContents[0].includes('"feature.flag"')).toBe(true)
})
```

---

## Validation Architecture

> Nyquist validation is ENABLED (`workflow.nyquist_validation` absent from `.planning/config.json` = treated as enabled). [VERIFIED: .planning/config.json]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^1.5.0 |
| Config file | `vitest.config.ts` (minimal — just `tsconfigPaths` plugin) |
| Quick run command | `pnpm test` (= `vitest run`) |
| Full suite command | `pnpm test` |
| Typecheck command | `pnpm tsc --noEmit` (also `pnpm typecheck`) |
| Build command | `pnpm build` |
| Quality gate command | `pnpm tsc --noEmit && pnpm test && pnpm build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ASYNC-01 | `detectUsedKeys` returns `{ usedKeys, fileContents, parsedResults, parseErrors }` | unit | `pnpm test -- --reporter=verbose src/core/scanner.test.ts` | ✅ (extend existing) |
| ASYNC-02 | `validate`/`extract`/`prune` return `Promise`; `cli.ts` awaits | type + integration | `pnpm tsc --noEmit` + `pnpm test` | ✅ (extend existing) |
| ASYNC-03 | `fileContents` preserved; looseKeyMatch regression | unit | `pnpm test -- src/core/scanner.test.ts` | ❌ Wave 0 — new test |
| ASYNC-04 | Bounded pool max 4, no `Promise.all` over all files | unit | `pnpm test -- src/core/scanner/pool.test.ts` (new file) | ❌ Wave 0 — new file |
| SHADOW-01 | AST path gated; regex stays default; `useAst:true` passes all tests | integration | `pnpm test` (with useAst:true flag flipped in tests) | ❌ Wave 0 — new tests |

### Success Criteria Verification

**Criterion 1 — `tsc` clean after cascade:**
- Command: `pnpm tsc --noEmit`
- Expectation: exit code 0, zero errors
- What it catches: missing `await`, wrong return types, `useAst` accidentally on public types
- When: after every wave

**Criterion 2 — regex-default == v0.3.0 no-regression:**
- Command: `pnpm test`
- Expectation: all existing tests pass, including `validate.test.ts`, `extract.test.ts`, `prune.test.ts`, `scanner.test.ts`, `hardcoded.test.ts`, `dynamic.test.ts`
- What it catches: any behavioral change to the regex default path
- When: after Wave 1 (async cascade only), must be green before Wave 2

**Criterion 3 — `looseKeyMatch`-after-async regression test (ASYNC-03):**
- New test in `src/core/scanner.test.ts` (or `src/__tests__/async-migration.test.ts`)
- Assertion shape:
  ```typescript
  // Write file with key as bare string literal (not inside t())
  fs.writeFileSync(f, `const KEY = "feature.flag"`, 'utf8')
  const { usedKeys, fileContents } = await detectUsedKeys([f], ['t'], [])
  expect(usedKeys.has('feature.flag')).toBe(false)           // not in t() call
  expect(fileContents[0]).toContain('"feature.flag"')         // survives stripComments
  // Simulate looseKeyMatch behavior:
  expect(fileContents[0].includes('"feature.flag"')).toBe(true) // looseKeyMatch would find it
  ```
- This ensures `fileContents` is populated and correct after the async refactor.

**Criterion 4 — bounded pool max 4, no `Promise.all` over all files (ASYNC-04):**
- New test in `src/__tests__/scanner-pool.test.ts` (or similar)
- Uses an instrumented parse function tracking `currentConcurrency` / `peakConcurrency`:
  ```typescript
  it('never exceeds maxConcurrency=4 concurrent parse invocations', async () => {
    let peak = 0, current = 0
    const fakeParse = async () => {
      current++; peak = Math.max(peak, current)
      await new Promise(r => setTimeout(r, 10))
      current--
      return { result: { usedKeys:[], dynamicCalls:[], hardcodedCandidates:[] }, errors:[] }
    }
    // 10 fake files, maxConcurrency=4
    await detectUsedKeys(tenFakeFiles, ['t'], [], { useAst:true, cwd, _parseFn: fakeParse })
    // OR test pool helper directly if _parseFn injection is not added
    expect(peak).toBeLessThanOrEqual(4)
  })
  it('with maxConcurrency=2, peak does not exceed 2', async () => {
    // same with opts.maxConcurrency=2
    expect(peak).toBeLessThanOrEqual(2)
  })
  ```
- Note: if `detectUsedKeys` does not expose `_parseFn`, test the pool helper (`runBoundedPool`) directly.

**Criterion 5 — `useAst:true` end-to-end suite passes (SHADOW-01):**
- Strategy: write a test (or test suite runner) that re-runs the key behavioral integration tests from `validate.test.ts` and `extract.test.ts` with `useAst:true` threaded through `validate(config, cwd, { checkHardcoded, useAst:true })` / `extract(config, cwd, { useAst:true })`.
- Minimum coverage: static key extraction, dynamic key findings, hardcoded findings, `looseKeyMatch`.
- Location: `src/__tests__/ast-shadow.test.ts` (new file) — imports `validate`/`extract`, passes `useAst:true` through the internal options param, asserts same `ValidationResults` shape as regex mode.
- Command: `pnpm test`

### Wave 0 Gaps

- [ ] `src/core/scanner.test.ts` — extend with `looseKeyMatch`-after-async regression test (ASYNC-03)
- [ ] `src/__tests__/scanner-pool.test.ts` (new) — bounded pool concurrency assertions (ASYNC-04)
- [ ] `src/__tests__/ast-shadow.test.ts` (new) — `useAst:true` end-to-end integration tests (SHADOW-01 criterion #5)

None — existing test infrastructure (vitest, fixtures, integration test helpers) already covers the framework needed for new tests.

---

## Open Questions (RESOLVED)

1. **`fileContents` in AST mode — `readFile` async or `readFileSync`?**
   - What we know: The AST pool must read file content as the first step (to pass `source` to `parseFile`). In regex mode, `readFileSync` is used.
   - What's unclear: Should the AST path use `fs.promises.readFile` (async) or `fs.readFileSync` (sync, inside async pool)? Both work in Node.js async/await; async file reads could parallelize better.
   - **RESOLVED:** Use `fs.promises.readFile` inside the pool worker (fully async path); keep `readFileSync` in the regex path (no behavioral change). Implemented in 04-02 Task 1 (`source = await fs.promises.readFile(files[i], "utf8")`).

2. **`_parseFn` injection for pool testability**
   - What we know: Testing bounded concurrency requires either testing the pool helper directly or injecting a fake parse function.
   - What's unclear: Whether to add a hidden `_parseFn` param to `opts` for tests, or to export the pool helper as a testable unit.
   - **RESOLVED:** Export the pool helper `runBoundedPool` as a named export from a dedicated module (`src/core/scanner/pool.ts`) and test it directly with a fake worker — no test-only params on `opts`. Implemented in 04-01 Task 1 (`pool.ts` + `scanner-pool.test.ts`).

3. **`validate`/`extract` `options` type extension for `useAst`**
   - What we know: `validate(config, cwd, options?)` where `options` is `{ checkHardcoded?: boolean }`. `extract(config, cwd)` has no options param. `prune(config, cwd, options)` where `options` is `PruneOptions`.
   - **RESOLVED:** Extend `validate`'s third param to `{ checkHardcoded?: boolean; useAst?: boolean }` (inline, not in `types.ts`); add an internal `{ useAst?: boolean }` options param to `extract`; cast or widen `prune`'s options locally — all without changing `src/types.ts` (D-08). Implemented in 04-02 Tasks 2–3.

---

## Environment Availability

Step 2.6: No new external dependencies introduced in Phase 4. The bounded pool uses standard Node.js `Promise` primitives. `fs.promises.readFile` is Node built-in. No environment audit required beyond verifying Node ≥ 20 (already confirmed in constraints).

---

## Security Domain

Phase 4 introduces no new attack surface — it is a refactoring of existing scan logic. No new file-read paths, no new network calls, no new user-visible inputs. The same security posture as Phase 3 applies. Skipping ASVS section as no new threat patterns are introduced.

---

## Sources

### Primary (HIGH confidence — direct source inspection)
- `src/core/scanner/index.ts` — exact `detectUsedKeys` signature + body
- `src/commands/validate.ts` — regex re-scan loop, looseKeyMatch pass, hardcoded block, line numbers
- `src/commands/extract.ts` — `detectUsedKeys` call + return destructuring
- `src/commands/prune.ts` — async signature, `detectUsedKeys` call, `fileContents` usage
- `src/cli.ts` — exact call sites, async vs sync, line numbers
- `src/core/scanner/parsers/index.ts` — `parseFile` signature
- `src/core/scanner/parsers/types.ts` — `ParsedFileResult` + `FileParseError` shapes
- `src/core/scanner/hardcoded.ts` — `isHardcodedIgnored` signature, `scanTemplateTextNodes`
- `src/core/scanner/lines.ts` — `computeLineOffsets`/`offsetToLine`
- `src/types.ts` — confirmed `useAst` absent from `I18nSharpenConfig`
- `src/core/scanner.test.ts` — `detectUsedKeys` call site at line 168
- `src/index.ts` — re-export structure
- `.planning/config.json` — `workflow.nyquist_validation` absent = enabled
- `package.json` — `vitest ^1.5.0`, scripts

### Secondary (MEDIUM confidence — from CONTEXT.md decisions)
- `.planning/phases/04-async-migration-shadow-mode-on-regex-still-default/04-CONTEXT.md` — all D-01..D-14 decisions

### Tertiary (LOW confidence — assumed patterns)
- Bounded-concurrency pool pattern (index-counter drain) — standard Node.js pattern, not verified against a specific authoritative source in this session [ASSUMED]
- `parseErrors.push(...errors)` thread safety in Node.js event loop — safe by Node.js single-thread model [ASSUMED]

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Array.push` is safe from concurrent microtasks in Node.js event loop (no actual parallelism) | Code Examples | Low — Node.js is single-threaded; if wrong, use per-worker arrays + flatten |
| A2 | Bounded-concurrency pool drain pattern (N workers draining shared index counter) is equivalent to `p-limit` semantics for this use case | Architecture Patterns | Low — well-established pattern; worst case is re-implement with explicit queue |
| A3 | `fs.promises.readFile` is preferable to `readFileSync` inside async pool workers | Open Questions | Very low — both work; performance difference negligible for typical source trees |

---

## Metadata

**Confidence breakdown:**
- Current code shapes: HIGH — all verified by direct source reading
- Validate.ts mapping: HIGH — line-by-line documented from source
- Worker pool pattern: MEDIUM — standard pattern, [ASSUMED], not verified via external doc
- Test architecture: HIGH — based on existing Vitest infrastructure

**Research date:** 2026-06-01
**Valid until:** 2026-07-01 (source code may change; re-verify if source files are modified before planning)
