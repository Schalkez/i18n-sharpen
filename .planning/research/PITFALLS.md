# Pitfalls Research

**Domain:** AST-replacing-regex i18n CLI scanner (v0.4.0 rewrite)
**Researched:** 2026-05-31
**Confidence:** HIGH (all critical pitfalls verified against official sources and confirmed bug reports)

---

## Critical Pitfalls

### Pitfall 1: `@babel/traverse` ESM `.default` interop crash

**What goes wrong:**
`@babel/traverse` ships as CommonJS. When imported from native ESM (which `i18n-sharpen` is), Node.js wraps the entire `module.exports` as the `default` export. Calling `traverse(ast, visitors)` crashes with `TypeError: traverse is not a function`. The function is at `traverse.default`.

**Why it happens:**
The package has `__esModule: true` in its CommonJS build, which causes bundlers and runtimes to disagree on where the callable lives. tsup (esbuild-based) does not automatically unwrap this unless `cjsInterop: true` is set, and even then results vary across Node versions.

**How to avoid:**
Two options — choose one and commit to it:

Option A (recommended for correctness): Import with explicit `.default` unwrap at call-site:
```typescript
import traverseModule from "@babel/traverse"
const traverse = (traverseModule as unknown as { default: typeof traverseModule }).default ?? traverseModule
```

Option B (avoid `@babel/traverse` entirely): Hand-walk the AST using `@babel/types`'s `traverseFast`, or use a lightweight alternative (`babel-walk` is ~8-16x faster and Babel-AST-aware; `astray` is ~8x faster and ESM-native). Neither has the `.default` trap. For i18n-sharpen's use case (read-only visitor, no node mutation), hand-walking is sufficient and removes the problem entirely.

**Warning signs:**
- CI passes locally (CJS-emitting test runner) but crashes in ESM integration test.
- `TypeError: traverse is not a function` at runtime only, no TypeScript compile error.
- The bug is silent until the first `.vue`/`.tsx` file is actually parsed.

**Phase to address:**
Phase 1 (Infrastructure) — choose the traversal strategy before writing any visitor code. Changing it later forces rewriting all visitors.

---

### Pitfall 2: `errorRecovery: true` does not prevent all throws

**What goes wrong:**
The seed plan relies on `errorRecovery: true` to avoid crashing on syntax errors, but this only recovers from a subset of errors. Semantic-level violations (invalid setter params, broken template literals with `tokens: true`, certain reserved-word sequences) still throw a hard exception, bypassing the recovery path entirely. A CI run on a partially-broken user file aborts unexpectedly.

**Why it happens:**
`@babel/parser`'s recovery mechanism targets syntactic errors. Semantic errors — those that require knowledge of surrounding context — are checked separately and throw before recovery can intercept them. This is a known limitation confirmed in babel/babel issues #12074, #16371, and #14054.

**How to avoid:**
Always wrap `parse()` in a `try/catch` even when `errorRecovery: true` is set. The error model must be: collect any `ast.errors` array entries, but also catch thrown exceptions. On catch, emit a structured warning for that file and continue — do NOT abort the run. Only escalate to fatal if the compiler binary itself is missing (separate code path).

```typescript
try {
  const ast = parse(source, { errorRecovery: true, ... })
  if (ast.errors.length > 0) {
    // log warnings, continue with partial AST
  }
  return walkAst(ast)
} catch (e) {
  // Emit I18nSharpenError with kind: "file-parse-error", include filename + message
  // Return empty ParsedFileResult — do not rethrow
}
```

**Warning signs:**
- Tests pass on well-formed fixtures but fail on intentionally-broken test files.
- `errorRecovery: true` is present in code but no surrounding `try/catch` exists.
- The seed plan's "throw on any syntax error" principle (since revised in STATE.md review note #1) resurfaces in implementation.

**Phase to address:**
Phase 2 (AST Parsers) — every parser module (`babel.ts`, `vue.ts`, `svelte.ts`, `astro.ts`) must use this double-guard pattern. Phase 3 (Dispatcher) must confirm the error model propagates correctly to callers.

---

### Pitfall 3: Svelte 5 AST shape change — `ast.html` vs `fragment`

**What goes wrong:**
The seed plan's Svelte parser (`svelte.ts`) references `ast.html` to traverse the HTML tree. In Svelte 5, `parse()` with `{ modern: true }` returns `AST.Root`, where the HTML content is at `ast.fragment` (type `Fragment`, not `html`). Without `{ modern: true }`, `ast.html` is present (Svelte 4 / legacy shape) but `ast.fragment` is absent. Code that hard-codes either path breaks on the wrong Svelte version.

**Why it happens:**
Svelte 5 introduced a new AST format for tool authors. `modern: false` (the default in Svelte 5) preserves backward-compatible shape. `modern: true` is the forward-compatible shape and will become the default in Svelte 6. The property name change (`html` → `fragment`) is a breaking renaming, not an additive change.

**How to avoid:**
Detect Svelte version at load time (read `svelte/package.json` major version after dynamic import), then branch:

```typescript
const majorVersion = parseInt(pkg.version.split('.')[0], 10)
if (majorVersion >= 5) {
  const ast = parse(source, { modern: true }) // AST.Root: ast.fragment
  walkFragment(ast.fragment)
} else {
  const ast = parse(source) // legacy: ast.html
  walkHtml(ast.html)
}
```

Do not rely on duck-typing alone — check for both `ast.fragment` and `ast.html` existence as a safety net, but version-gating is the primary guard.

**Warning signs:**
- Svelte parser returns no extracted keys on Svelte 5 components.
- `ast.html` is `undefined` in Svelte 5; `ast.fragment` is `undefined` in Svelte 4.
- Compiler version pinning review (STATE.md note #7) flagged this explicitly.

**Phase to address:**
Phase 2 (AST Parsers, `svelte.ts`) — version detection must be part of the initial dynamic load, not an afterthought.

---

### Pitfall 4: `@astrojs/compiler` WASM requires awaited initialization

**What goes wrong:**
`@astrojs/compiler` is a Go compiler distributed as WASM. Calling `parse()` before the WASM binary is fully instantiated causes either a silent no-op or a hard crash. The `parse` function is itself async and returns a `Promise` — but if called before internal initialization completes, results are undefined.

**Why it happens:**
WASM modules must be instantiated asynchronously (fetched, compiled, and linked). The compiler's `parse()` function signature is `async`, but the initialization of the WASM runtime underneath it is lazy and not guaranteed to be complete on first call if multiple files trigger parsing in parallel before the first `await` resolves.

**How to avoid:**
Initialize the compiler once at startup (or on first `.astro` file encounter) and cache the initialized instance. Do not call `parse()` in parallel across multiple files until the init `await` has resolved. Pattern:

```typescript
let astroCompilerReady: Promise<void> | null = null

async function getAstroCompiler() {
  if (!astroCompilerReady) {
    const compiler = await import('@astrojs/compiler')
    // @astrojs/compiler may expose an `initialize` or the WASM init is triggered on first import
    // Cache the import promise itself to prevent re-initialization
    astroCompilerReady = Promise.resolve()
    return compiler
  }
  await astroCompilerReady
  return import('@astrojs/compiler')
}
```

Then `await parse(source)` as documented — never call it without `await`.

**Warning signs:**
- Astro files parse correctly in serial tests but fail intermittently under parallel test execution.
- WASM initialization errors surface only under load.
- STATE.md review note #7 flagged this explicitly.

**Phase to address:**
Phase 2 (AST Parsers, `astro.ts`) — the singleton initialization guard must be part of the module design, not retro-fitted after flaky tests appear.

---

### Pitfall 5: Vue SFC — `descriptor.scriptSetup` vs `descriptor.script`, and template compilation

**What goes wrong:**
A Vue SFC can have `<script>`, `<script setup>`, or both. Code that only walks `descriptor.script` misses all keys in `<script setup>` components (the dominant pattern in Vue 3). Code that walks only `descriptor.scriptSetup` misses Options API components. Additionally, `descriptor.template` must be compiled via `@vue/compiler-dom` to get a traversable AST for attribute-level key extraction — calling `parse()` on the raw template string returns compiler IR, not a simple text tree.

**Why it happens:**
The `@vue/compiler-sfc` `parse()` function splits the SFC into blocks but does NOT compile them. Each block's `.content` is raw source. Most examples focus on the script block and omit the template walk.

**How to avoid:**
Walk both blocks:
```typescript
const descriptor = parse(source).descriptor
const scriptContent = descriptor.scriptSetup?.content ?? descriptor.script?.content
// Pass scriptContent to babel.ts parser

// For template — use compiler-dom to get element tree
if (descriptor.template) {
  const { ast: templateAst } = compileTemplate({
    source: descriptor.template.content,
    filename,
    id: filename,
    compilerOptions: { mode: 'module' }
  })
  walkTemplateAst(templateAst)
}
```

**Warning signs:**
- Composition API (`<script setup>`) Vue files return zero used keys.
- Template attribute values (e.g., `i18n-key="..."`) are not extracted from `.vue` files.
- Integration tests use only legacy Options API fixtures.

**Phase to address:**
Phase 2 (AST Parsers, `vue.ts`) — test with both `<script>` and `<script setup>` fixtures before Phase 3 integration.

---

### Pitfall 6: Offset/line miscalculation across embedded `<script>` blocks

**What goes wrong:**
Babel (and other parsers) report AST node positions relative to the string passed into `parse()`. For embedded blocks in Vue/Svelte/Astro files, the string passed is `block.content` — not the full file. A node at offset 0 in `block.content` may be at line 15 in the original file. Reported line numbers are wrong (off by the block's start line), making error messages and IDE integrations point to the wrong location.

**Why it happens:**
Each block is parsed in isolation. The parser has no knowledge of the outer document's coordinate system. Babel offsets and line numbers reset to 0 at the start of whatever string it parses.

**How to avoid:**
After receiving Babel results, rebase all offsets before storing them in `ParsedFileResult`. Use the block's start location (available as `descriptor.template.loc.start`, `descriptor.script.loc.start`, etc. in Vue; `ast.instance.start` in Svelte):

```typescript
const blockStartOffset = descriptor.script.loc.start.offset // or .line
// For each result from babel.ts:
const rebasedOffset = result.offset + blockStartOffset
```

`lines.ts` (`computeLineOffsets` / `offsetToLine`) already exists in the codebase — reuse it with the full file source to convert the rebased offset back to a correct line number.

**Warning signs:**
- Reported line numbers for keys in `.vue` or `.svelte` files are consistently too low (often by the number of lines before the `<script>` block).
- Tests that only check `key` values pass, but tests that check `offset` or `line` fail.
- STATE.md review note #4 flagged this explicitly.

**Phase to address:**
Phase 2 (all framework parsers) — each parser is responsible for rebasing before returning. Phase 3 (Dispatcher integration tests) — add offset-correctness assertions to integration tests.

---

### Pitfall 7: Fail-fast on file syntax errors aborts the CI run

**What goes wrong:**
The original seed plan states "throw error" on any syntax error, which is correct behavior for a *compiler* but wrong for a *scanner*. A CI scanner must survive encountering one file with a bad syntax (generated file, partially-written buffer, vendor artifact). Aborting the full run on one bad file is a false-negative for all other files and violates the "CI-friendly" constraint.

**Why it happens:**
The seed plan conflates two distinct error categories:
- Missing compiler binary (user forgot to install `@vue/compiler-sfc`) — fatal, actionable, should abort with install instructions.
- One source file with a syntax error — non-fatal, should warn and skip, continue processing other files.

**How to avoid:**
Implement collect-and-continue at the dispatcher level:
```typescript
for (const file of files) {
  try {
    results.set(file, await parseFile(file, content, config, cwd))
  } catch (e) {
    if (e instanceof I18nSharpenError && e.error.kind === 'missing-compiler') {
      throw e // Fatal — re-throw immediately
    }
    // File-level parse error — collect warning, continue
    fileParseErrors.push({ file, error: e })
  }
}
```

Exit with a distinct non-zero code (e.g., `exit 2`) when file parse errors occurred so CI can detect degraded accuracy without a full abort.

**Warning signs:**
- A single malformed fixture in the test suite causes all other tests to fail.
- `I18nSharpenError` for missing compiler and for syntax error use the same error kind.
- The distinction between compiler-missing (fatal) and parse-error (warn) is absent from error type definitions.

**Phase to address:**
Phase 1 (Infrastructure / error model definition) — the `I18nSharpenError` discriminated union must have distinct `kind` values for `missing-compiler` vs `file-parse-error` before any parser is written.

---

### Pitfall 8: `fileContents` dropped during async refactor breaks `looseKeyMatch`

**What goes wrong:**
The `looseKeyMatch` feature in `validate.ts` uses `fileContents` (an array of stripped-comment source strings) to do `String.includes("key")` searches. If the async refactor of `detectUsedKeys` drops `fileContents` from its return value (easy to miss when rewriting the signature), `looseKeyMatch` silently stops working — keys that exist in comments get false-positive "missing key" reports.

**Why it happens:**
The new `ParsedFileResult` interface focuses on structured AST output. `fileContents` (raw stripped strings) feels redundant post-AST, but `looseKeyMatch` is deliberately a fuzzy fallback that operates on string content, not AST. It is architecturally separate.

**How to avoid:**
Keep `fileContents: string[]` in the `detectUsedKeys` return value. `stripComments` must still run on raw content before it enters the AST pipeline:

```typescript
// In detectUsedKeys:
const stripped = stripComments(rawContent)
fileContents.push(stripped)
const astResult = await parseFile(filePath, rawContent, config, cwd)
// ...
return { usedKeys, fileContents, parsedResults }
```

Add a regression test: assert that a key present only in a comment (stripped) is found by `looseKeyMatch` after the AST refactor.

**Warning signs:**
- `looseKeyMatch` path in `validate.ts` is not tested in the async-migration test update.
- `fileContents` is removed from `detectUsedKeys` return type during refactor.
- STATE.md seed plan explicitly notes this as a preservation requirement (L180-181).

**Phase to address:**
Phase 3 (Dispatcher & Integration, `detectUsedKeys` refactor) — include a looseKeyMatch regression test as a Phase 3 acceptance criterion.

---

### Pitfall 9: Async cascade breaks callers and tests without a plan

**What goes wrong:**
Making `detectUsedKeys` async propagates upward to `validate`, `extract`, `prune`, `cli.ts`, and `src/index.ts` (public API). Every test that calls these functions must be updated to `await` the result. Tests that don't add `await` silently pass (the assertion runs against a resolved Promise object, not the actual value) — a false green.

**Why it happens:**
Vitest does not enforce `await` at the test-level assertion unless `expect.hasAssertions()` is used. A forgotten `await` on `validate()` causes the test to compare a `Promise` object against an expected plain object — TypeScript may not catch this if the return type annotation is not yet updated.

**How to avoid:**
- Update TypeScript return types first (phase 3, before writing any async callers) — type errors surface all forgotten `await` sites.
- In every updated test file, add `expect.hasAssertions()` as the first line.
- Run `pnpm tsc --noEmit` before test suite as a gate — unawaited calls on typed async functions produce a TS error.
- Blast-radius reference (STATE.md): async cascade is bounded to ~6-8 files (`validate`, `extract`, `prune`, `cli.ts`, `index.ts`, plus their test files).

**Warning signs:**
- Test suite turns green after async migration but `pnpm tsc --noEmit` still has errors.
- Tests that previously took < 1ms now take 0ms (suspiciously fast) — likely unawaited.
- `Promise<ValidationResults>` appears in test assertion diffs.

**Phase to address:**
Phase 3 (Dispatcher & Integration) — type-first, then call sites, then tests, in that order. Do not update tests last without verifying type coverage.

---

## Golden Edge Cases — Must-Pass Test Targets

These two cases are the textbook motivation for replacing the regex scanner. They MUST be captured as named test cases in `src/__tests__/parsers/` and must pass before the AST parser is made the default.

### Golden Case A: Component dot-notation tag names — `<m.div>` / `<motion.div>`

**What the regex scanner does wrong:**
The regex tag-depth tracker splits on `.` and treats `m.div` as an unknown tag or misreads the closing tag, causing text node extraction to fail or produce corrupted results for the inner content.

**What the AST parser must do right:**
`JSXElement` nodes in Babel's AST have a `openingElement.name` of type `JSXMemberExpression` (`{ object: Identifier("m"), property: Identifier("div") }`). The visitor must handle `JSXMemberExpression` tag names (not just `JSXIdentifier`) and still extract the inner `JSXText` children.

**Test target:**
```
Input:  <m.div>Hello world</m.div>
         <motion.div className="x">Book now</motion.div>
Expected: hardcodedCandidates includes "Hello world" and "Book now"
```

**Phase to address:** Phase 2 (Babel parser) — add as a named test case in `babel.test.ts` before Phase 4 shadow-mode comparison.

---

### Golden Case B: TypeScript generics outside templates must not be parsed as JSX

**What the regex scanner does wrong:**
`forwardRef<HTMLInputElement, InputProps>(...)` — the angle brackets are parsed by the tag-depth tracker as an opening JSX tag `<HTMLInputElement, InputProps>`. This corrupts the depth counter, causing subsequent real JSX tags to be misclassified or extracted text to bleed across tag boundaries.

**What the AST parser must do right:**
Babel with `plugins: ["typescript", "jsx"]` correctly parses `forwardRef<HTMLInputElement, InputProps>(...)` as a `CallExpression` with a `typeParameters` node — never as a `JSXElement`. The two grammars are unambiguous in Babel's combined plugin mode.

**Test target:**
```typescript
Input:
  const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
    <input ref={ref} placeholder="Enter value" {...props} />
  ))

Expected:
  - NO spurious JSX key extraction from "HTMLInputElement" or "InputProps"
  - hardcodedCandidates includes "Enter value" (from placeholder attribute)
  - usedKeys is empty (no i18n function call present)
```

**Phase to address:** Phase 2 (Babel parser) — add as a named test case in `babel.test.ts`. This is the primary justification for the AST rewrite and must be verified before shadow-mode flip.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Big-bang rewrite + delete regex in one PR | Fewer PRs | No safety net if AST has regressions; impossible to bisect failures | Never — use shadow mode first |
| Skip offset rebasing, use block-relative lines | Simpler parser code | Wrong line numbers in all error messages; unusable for IDE integration | Never |
| Hard-code `modern: true` for Svelte without version check | Simpler branching | Crashes on Svelte 4 projects | Only if dropping Svelte 4 support explicitly |
| Use `@babel/traverse` despite ESM interop complexity | Familiar API | Runtime crash in ESM CI; hard to debug | Only with verified `.default` unwrap + integration test |
| Merge async migration and AST parser in one PR | Fewer commits | Impossible to attribute regressions; all tests break simultaneously | Never — migrate async first behind a feature boundary |
| Drop `fileContents` from `detectUsedKeys` return | Cleaner interface | `looseKeyMatch` silently breaks; false-positive missing-key reports | Never |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `@babel/traverse` in ESM | `import traverse from "@babel/traverse"; traverse(ast, ...)` | Unwrap `.default` explicitly or avoid the package (use `traverseFast` / `babel-walk`) |
| `svelte/compiler` parse | `ast.html` always | Version-gate: `ast.fragment` (modern) vs `ast.html` (legacy) |
| `@astrojs/compiler` | Call `parse()` concurrently before WASM init | Await a singleton init promise; serialize first call |
| `@vue/compiler-sfc` | Walk only `descriptor.script` | Walk `descriptor.scriptSetup ?? descriptor.script`; compile template separately |
| `@vue/compiler-dom` | Pass template HTML string directly to Babel | Pass through `compileTemplate()` first; Babel cannot parse Vue template syntax |
| Public API async migration | Update function body to `async`, forget to update callers | Type-first: update return type signatures, let TS errors find all call sites |
| Test async migration | Call `validate()` without `await` in test | `expect.hasAssertions()` + `pnpm tsc --noEmit` as mandatory gate |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Dynamic `import()` per file (re-importing compiler on each file) | Time grows linearly with file count; 10x slower than expected | Singleton cache per compiler module; import once, reuse | Any repo with > 20 framework files |
| Unbounded parallel parsing (`Promise.all` over all files) | Memory spike on large repos; OOM on monorepos | Bounded concurrency pool (p-limit or semaphore, max 4-8 concurrent) | Repos with > 500 source files |
| Serial parsing (one file at a time) | Sub-second baseline becomes 3-5s on medium repos | Bounded concurrency — async migration should be a perf WIN, not a loss | Any repo with > 50 files |
| No perf-regression gate | AST rewrite silently degrades speed; not caught until user complaint | Add benchmark against v0.3.0 baseline (`vitest bench`) with failure threshold | Immediately after Phase 3 integration |
| Loading Babel on CLI startup for non-JS projects | 100ms+ cold-start overhead even for JSON-only validation | Lazy-load Babel on first `.ts/.tsx/.js/.jsx` file, not at module init | All users who only validate JSON locales |

**Perf-regression gate (concrete):** Add a `pnpm bench` target in Phase 3 using `vitest bench`. Gate: AST path must be no more than 100ms slower than the v0.3.0 regex baseline on the same 50-file fixture corpus. The async migration with bounded concurrency should recover this budget by parallelizing previously-serial file reads.

---

## "Looks Done But Isn't" Checklist

- [ ] **Babel parser:** Handles `JSXMemberExpression` (dot-notation tags) as well as `JSXIdentifier` — verify with `<m.div>` golden case test
- [ ] **Babel parser:** TypeScript generics (`forwardRef<A,B>()`) parsed as `CallExpression`, not JSX — verify with `forwardRef` golden case test
- [ ] **Svelte parser:** Both Svelte 4 (`ast.html`) and Svelte 5 (`ast.fragment`, `modern: true`) paths exercised in tests
- [ ] **Astro parser:** WASM init serialized — concurrent test execution does not produce race conditions
- [ ] **Vue parser:** `<script setup>` components produce the same key extraction as `<script>` components
- [ ] **All framework parsers:** Offset rebasing applied before returning `ParsedFileResult` — offset-correctness test asserts line numbers match original file
- [ ] **`detectUsedKeys`:** `fileContents` still returned after async refactor — `looseKeyMatch` regression test passes
- [ ] **Error model:** `missing-compiler` and `file-parse-error` have distinct `kind` values in `I18nSharpenError`
- [ ] **CI resilience:** Single broken fixture file does not abort the test run or the CLI run
- [ ] **Async migration:** `pnpm tsc --noEmit` passes with zero errors after all callers updated — no unawaited `Promise` returns
- [ ] **Perf gate:** `pnpm bench` passes on 50-file fixture — no regression beyond 100ms vs v0.3.0 baseline
- [ ] **Shadow mode:** Differential test (regex vs AST) on real corpus shows zero regressions before Phase 4 flip

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| `@babel/traverse` `.default` ESM interop crash | Phase 1 (Infrastructure) — choose traversal strategy | Integration test: parse a `.tsx` file from ESM context without TypeError |
| `errorRecovery` still throws — no surrounding catch | Phase 2 (AST Parsers) — each parser module | Test: parse a deliberately malformed file; assert warning collected, run continues |
| Svelte 5 `ast.fragment` vs `ast.html` | Phase 2 (`svelte.ts`) | Two fixtures: one Svelte 4, one Svelte 5; both return correct keys |
| `@astrojs/compiler` WASM init race | Phase 2 (`astro.ts`) | Concurrent parse of 10 `.astro` files; no initialization error |
| Vue `scriptSetup` not walked | Phase 2 (`vue.ts`) | Fixture with `<script setup>` only; keys extracted |
| Offset/line rebasing wrong | Phase 2 (all framework parsers) | Assert `offset` values map to correct line in original file |
| Fail-fast on file syntax errors | Phase 1 (error model) + Phase 3 (dispatcher) | Inject one bad file into batch; assert other files still processed |
| `fileContents` dropped in async refactor | Phase 3 (dispatcher integration) | `looseKeyMatch` regression test passes post-refactor |
| Async cascade breaks callers/tests | Phase 3 (dispatcher integration) | `pnpm tsc --noEmit` zero errors; no unawaited Promise in tests |
| Golden case A: dot-notation tags | Phase 2 (Babel parser) | Named test `<m.div>` → `hardcodedCandidates` includes inner text |
| Golden case B: TS generics as JSX | Phase 2 (Babel parser) | Named test `forwardRef<A,B>()` → no spurious JSX extraction |
| Perf regression vs v0.3.0 | Phase 3 (integration) | `pnpm bench` gate — < 100ms overhead vs baseline |
| Bundle size creep | Phase 1 (dependency choice) | `pnpm build` bundle size reported in CI; alert if > 6MB total |

---

## Sources

- [TypeError: traverse is not a function — babel/babel Discussion #13093](https://github.com/babel/babel/discussions/13093)
- [Bug: Importing default export from @babel/generator does not work in ESM — babel/babel Issue #15269](https://github.com/babel/babel/issues/15269)
- [Bug: Babel TypeScript syntax throws with errorRecovery enabled — babel/babel Issue #16371](https://github.com/babel/babel/issues/16371)
- [Parser fail on errorRecovery mode — babel/babel Issue #12074](https://github.com/babel/babel/issues/12074)
- [Unexpected error thrown when parsing broken template literal — babel/babel Issue #14054](https://github.com/babel/babel/issues/14054)
- [@babel/parser official docs — errorRecovery semantics](https://babeljs.io/docs/babel-parser)
- [svelte/compiler — modern option, AST.Root, AST.Fragment](https://svelte.dev/docs/svelte/svelte-compiler)
- [@astrojs/compiler — parse is async, WASM-based](https://www.npmjs.com/package/@astrojs/compiler)
- [withastro/compiler — Go + WASM compiler](https://github.com/withastro/compiler)
- [@vue/compiler-sfc — SFCDescriptor, scriptSetup, source map offsets](https://www.jsdocs.io/package/@vue/compiler-sfc)
- [babel-walk — lightweight Babel AST traversal, 8-16x faster alternative](https://www.npmjs.com/package/babel-walk)
- [astray — ESM-native AST walker, 8x faster than @babel/traverse](https://github.com/lukeed/astray)
- [Vitest async testing patterns and unawaited assertion pitfalls](https://vitest.dev/guide/learn/async)
- Project internal: `.planning/STATE.md` — review notes #1-#7
- Project internal: `.planning/v0.4.0-SEED-PLAN.md` — proposed architecture and KEEP/DELETE table

---
*Pitfalls research for: AST-replacing-regex i18n CLI scanner (i18n-sharpen v0.4.0)*
*Researched: 2026-05-31*
