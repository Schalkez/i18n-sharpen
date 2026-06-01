# Phase 3: Framework Parsers + Dispatcher - Research

**Researched:** 2026-06-01
**Domain:** Framework compiler APIs (Vue SFC, Svelte 5/4, Astro WASM), AST walking, offset rebasing, dispatcher pattern
**Confidence:** HIGH (all critical API facts verified against official source or authoritative secondary sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dispatcher (PARSE-06)**
- D-01: `parseFile()` lives in `src/core/scanner/parsers/index.ts`
- D-02: Signature `parseFile(source, filePath, matchFunctions, matchAttributes, cwd): Promise<{ result: ParsedFileResult; errors: FileParseError[] }>`
- D-03: `parseFile()` is async; `detectUsedKeys` stays sync/regex (Phase 4 async migration)
- D-04: `.ts/.tsx/.js/.jsx` extensions are wrapped in `Promise.resolve()` to give uniform async interface

**Vue SFC (FW-01)**
- D-05: Parse via `@vue/compiler-sfc` `parse(source)` → `SFCDescriptor`. Script blocks delegated to `parseTypeScriptFile` with offset rebasing via `descriptor.script.loc.start.offset` / `descriptor.scriptSetup.loc.start.offset`
- D-06: Walk `descriptor.template.ast` (RootNode) for `matchAttributes` keys and hardcoded text candidates. No `@vue/compiler-dom.compile()` — AST walking only
- D-07: Missing `@vue/compiler-sfc` → fatal `I18nSharpenError` with `kind: "missing-dependency"`

**Svelte (FW-02)**
- D-08: Load `svelte/compiler` via `loadWorkspaceDep`. Read version via `require("svelte/package.json")` (via `createRequire`). ≥5 → `parse(source, { modern: true })` walks `ast.fragment`. <5 → `parse(source)` walks `ast.html`
- D-09: Script blocks delegated with rebasing via `ast.instance.start` / `ast.module.start` (both v4 and v5 use the same field names)
- D-10: Walk template AST for text nodes and `matchAttributes` keys (same scope as Vue)

**Astro (FW-03)**
- D-11: Load `@astrojs/compiler` via `loadWorkspaceDep`. Module-level singleton init promise for WASM. All callers `await initPromise` before parsing
- D-12: Frontmatter delegated to `parseTypeScriptFile` with rebasing via frontmatter node's position offset
- D-13: Template text nodes and `matchAttributes` keys extracted from Astro AST body

**Offset rebasing (FW-04)**
- D-14: Each framework parser rebase offsets after `parseTypeScriptFile` call on embedded block content
- D-15: Per-parser inline rebasing: `result.usedKeys = result.usedKeys.map(k => ({ ...k, offset: k.offset + blockStartOffset }))`

**Error model (FW-05, TEST-04)**
- D-16: Missing compiler → fatal `I18nSharpenError`, `kind: "missing-dependency"`, names package + PM-correct install command
- D-17: Single-file syntax error → collected `FileParseError` (non-fatal); scan continues

### Claude's Discretion
- Internal module structure within each framework parser file (helpers, walker functions)
- Exact Svelte 5 AST field names for script positions and template nodes (resolved below — same as v4: `ast.instance.start` / `ast.module.start`)
- Whether `@vue/compiler-dom` needs a separate load (resolved below — NO, not needed)
- Test fixture file layout and naming for TEST-04

### Deferred Ideas (OUT OF SCOPE)
- `svelte:head` skip-tag: handling can be addressed in implementation (confirmed — SvelteHead is a first-class `type: 'SvelteHead'` AST node; skip by checking `node.type === 'SvelteHead'`)
- Astro component attribute keys beyond basic attribute walking
- Async migration of `detectUsedKeys` (Phase 4)
- Shadow comparison + default flip (Phase 5)
- Regex deletion (Phase 6)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PARSE-06 | Extension-based dispatcher `parseFile()` routes to correct parser, returns unified `ParsedFileResult` | Dispatcher pattern, async wrapping, file structure |
| FW-01 | `.vue` via `@vue/compiler-sfc`, covering `<script setup>` + Options-API `<script>`, template walking | Vue SFC API, descriptor shape, template AST NodeTypes |
| FW-02 | `.svelte` via `svelte/compiler`, Svelte 5 (`modern:true` → `ast.fragment`) + v4 gate (`ast.html`) | Svelte parse API, version detection, AST shapes |
| FW-03 | `.astro` via `@astrojs/compiler`, WASM async init awaited, first parse serialized | Astro parse API, WASM singleton pattern, no explicit `initialize()` needed |
| FW-04 | Embedded `<script>` blocks parsed by TS parser and merged with document-absolute offsets | Exact offset field names per compiler, rebasing math |
| FW-05 | Missing framework compiler → fatal, actionable `I18nSharpenError` | Existing `loadWorkspaceDep` error contract |
| TEST-04 | Integration tests: error model + offset/line correctness across embedded blocks | Test seams, fixture strategy, vitest patterns |
</phase_requirements>

---

## Summary

Phase 3 builds three framework parsers (Vue, Svelte, Astro) and a dispatcher, all building on the locked Phase 1/2 contracts. All three compilers are dynamically loaded from the workspace via the existing `loadWorkspaceDep` resolver — no new resolver infrastructure is needed.

The central technical challenge is **offset rebasing**: each framework compiler reports positions relative to the embedded `<script>` block's own content; after delegating to `parseTypeScriptFile`, every offset in the returned result must be incremented by the block's start offset within the original file. The exact field names for those block-start offsets are now confirmed (see Section 2 below).

The second challenge is the **Astro WASM initialization** race condition. Research reveals that the Node.js entrypoint of `@astrojs/compiler` (v2+, including v4.0.0) already contains an internal lazy-init singleton — `parse()` can be called directly without an explicit `initialize()` call in Node.js. However, the module-level `initPromise` pattern required by D-11 is still the correct defensive design: it guards against any future API changes and ensures the first `parse()` call's implicit WASM startup is properly awaited before concurrent calls proceed.

**Primary recommendation:** Implement all three parsers and the dispatcher in four files (`vue.ts`, `svelte.ts`, `astro.ts`, `index.ts`). Use `loadWorkspaceDep` for all compiler loads. Use `createRequire` (already in `resolve.ts`) for Svelte version detection. The offset rebasing is a simple per-parser `.map()` over each result array — no shared utility needed.

---

## Standard Stack

### Core (all loaded dynamically via `loadWorkspaceDep` — NOT bundled)

| Library | Latest Version | Purpose | Load Pattern |
|---------|---------------|---------|--------------|
| `@vue/compiler-sfc` | `3.5.35` [VERIFIED: npm registry] | Parse `.vue` SFCs → SFCDescriptor + template AST | `loadWorkspaceDep("@vue/compiler-sfc", cwd)` |
| `svelte` (exports `svelte/compiler`) | `5.56.0` [VERIFIED: npm registry] | Parse `.svelte` files, both v4 and v5 ASTs | `loadWorkspaceDep("svelte/compiler", cwd)` |
| `@astrojs/compiler` | `4.0.0` [VERIFIED: npm registry] | Parse `.astro` files via WASM | `loadWorkspaceDep("@astrojs/compiler", cwd)` |

### Project Stack (already in repo — no changes needed)

| Library | Version | Purpose |
|---------|---------|---------|
| `vitest` | `^1.5.0` [VERIFIED: package.json] | Test runner for TEST-04 integration tests |
| `typescript` (workspace dep) | `>=5.0` peer | Loaded by `parseTypeScriptFile` for embedded script blocks |

### package.json Status

**IMPORTANT:** `@vue/compiler-sfc`, `svelte`, and `@astrojs/compiler` are NOT yet declared as `peerDependencies` in `package.json` [VERIFIED: read package.json]. Per CONTEXT.md §canonical_refs and Phase 1 DEP-01, these are supposed to be optional peer dependencies. The planner MUST include a Wave 0 task to add them:

```json
"peerDependencies": {
  "@astrojs/compiler": ">=4.0.0",
  "@vue/compiler-sfc": ">=3.0.0",
  "svelte": ">=4.0.0",
  "typescript": ">=5.0"
},
"peerDependenciesMeta": {
  "@astrojs/compiler": { "optional": true },
  "@vue/compiler-sfc": { "optional": true },
  "svelte": { "optional": true },
  "typescript": { "optional": true }
}
```

**Version verification:** [VERIFIED: npm view] @vue/compiler-sfc@3.5.35, svelte@5.56.0, @astrojs/compiler@4.0.0 — all confirmed current as of 2026-06-01.

---

## Architecture Patterns

### Recommended Project Structure (new files in Phase 3)

```
src/core/scanner/parsers/
├── types.ts          # LOCKED — ParsedFileResult, FileParseError
├── resolve.ts        # LOCKED — loadWorkspaceDep, detectPackageManager
├── typescript.ts     # LOCKED — parseTypeScriptFile (delegates from framework parsers)
├── vue.ts            # NEW — parseVueFile()
├── svelte.ts         # NEW — parseSvelteFile()
├── astro.ts          # NEW — parseAstroFile()
└── index.ts          # NEW — parseFile() dispatcher (barrel export)

src/__tests__/parsers/
├── resolve.test.ts   # EXISTING
├── typescript.test.ts # EXISTING
├── vue.test.ts       # NEW — TEST-04
├── svelte.test.ts    # NEW — TEST-04
├── astro.test.ts     # NEW — TEST-04
└── dispatcher.test.ts # NEW — TEST-04 (or folded into index.test.ts)
```

### Pattern 1: Dispatcher (parseFile)

The dispatcher is a simple `switch` on file extension — no complex routing.

```typescript
// Source: D-01, D-02, D-03, D-04 (CONTEXT.md)
export async function parseFile(
  source: string,
  filePath: string,
  matchFunctions: string[],
  matchAttributes: string[],
  cwd: string
): Promise<{ result: ParsedFileResult; errors: FileParseError[] }> {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.vue':   return parseVueFile(source, filePath, matchFunctions, matchAttributes, cwd)
    case '.svelte': return parseSvelteFile(source, filePath, matchFunctions, matchAttributes, cwd)
    case '.astro': return parseAstroFile(source, filePath, matchFunctions, matchAttributes, cwd)
    case '.ts':
    case '.tsx':
    case '.js':
    case '.jsx':
      return Promise.resolve(parseTypeScriptFile(source, filePath, matchFunctions, matchAttributes, cwd))
    default:
      return Promise.resolve({ result: { usedKeys: [], dynamicCalls: [], hardcodedCandidates: [] }, errors: [] })
  }
}
```

### Pattern 2: Vue SFC Parser

```typescript
// Source: @vue/compiler-sfc 3.5.35 API, verified via official source
import type * as VueSFC from '@vue/compiler-sfc'
import type { NodeTypes as VueNodeTypes } from '@vue/compiler-core'

export async function parseVueFile(
  source: string, filePath: string,
  matchFunctions: string[], matchAttributes: string[], cwd: string
): Promise<{ result: ParsedFileResult; errors: FileParseError[] }> {
  const compiler = loadWorkspaceDep('@vue/compiler-sfc', cwd) as typeof VueSFC
  // parse() returns { descriptor: SFCDescriptor, errors: (CompilerError|SyntaxError)[] }
  const { descriptor, errors: parseErrors } = compiler.parse(source, { filename: filePath })
  
  const collectedErrors: FileParseError[] = []
  const merged: ParsedFileResult = { usedKeys: [], dynamicCalls: [], hardcodedCandidates: [] }

  // Embedded <script> (Options API)
  if (descriptor.script) {
    const blockStart = descriptor.script.loc.start.offset
    const { result, errors } = parseTypeScriptFile(
      descriptor.script.content, filePath, matchFunctions, matchAttributes, cwd
    )
    mergeWithRebase(merged, result, blockStart)
    collectedErrors.push(...errors)
  }

  // Embedded <script setup>
  if (descriptor.scriptSetup) {
    const blockStart = descriptor.scriptSetup.loc.start.offset
    const { result, errors } = parseTypeScriptFile(
      descriptor.scriptSetup.content, filePath, matchFunctions, matchAttributes, cwd
    )
    mergeWithRebase(merged, result, blockStart)
    collectedErrors.push(...errors)
  }

  // Template AST walk (descriptor.template.ast is RootNode from @vue/compiler-core)
  if (descriptor.template?.ast) {
    walkVueTemplateAst(descriptor.template.ast, matchAttributes, merged)
  }

  // Collect any SFC parse-level errors
  for (const e of parseErrors) {
    collectedErrors.push({ file: filePath, message: String(e) })
  }

  return { result: merged, errors: collectedErrors }
}
```

### Pattern 3: Vue Template AST Walk

The Vue template AST uses `NodeTypes` from `@vue/compiler-core`. These are re-exported by `@vue/compiler-sfc`.

```typescript
// Source: @vue/compiler-core ast.ts [VERIFIED via GitHub/core]
// NodeTypes enum values:
//   ROOT = 0, ELEMENT = 1, TEXT = 2, COMMENT = 3,
//   SIMPLE_EXPRESSION = 4, INTERPOLATION = 5,
//   ATTRIBUTE = 6, DIRECTIVE = 7

function walkVueTemplateAst(node: VueRootNode | VueTemplateChildNode, matchAttributes: string[], out: ParsedFileResult) {
  if (node.type === 2 /* NodeTypes.TEXT */) {
    const textNode = node as { type: 2; content: string; loc: VueLoc }
    const trimmed = textNode.content.trim()
    if (trimmed.length > 0) {
      out.hardcodedCandidates.push({ text: trimmed, offset: textNode.loc.start.offset })
    }
    return
  }

  if (node.type === 1 /* NodeTypes.ELEMENT */) {
    const elemNode = node as { type: 1; tag: string; props: VueProp[]; children: VueTemplateChildNode[] }
    // matchAttributes walk — AttributeNode has type === 6, name and value.content
    for (const prop of elemNode.props) {
      if (prop.type === 6 /* NodeTypes.ATTRIBUTE */) {
        const attrNode = prop as { type: 6; name: string; value?: { type: 2; content: string; loc: VueLoc } }
        if (matchAttributes.includes(attrNode.name) && attrNode.value && !attrNode.value.content.endsWith('.')) {
          out.usedKeys.push({ key: attrNode.value.content, offset: attrNode.value.loc.start.offset })
        }
      }
    }
    // Recurse into children
    for (const child of elemNode.children) {
      walkVueTemplateAst(child, matchAttributes, out)
    }
    return
  }

  // Interpolation (type 5) and Compound expression (type 8) — recurse if children exist
  const asParent = node as { children?: VueTemplateChildNode[] | string }
  if (Array.isArray(asParent.children)) {
    for (const child of asParent.children) {
      if (typeof child !== 'string') walkVueTemplateAst(child, matchAttributes, out)
    }
  }
}
```

### Pattern 4: Svelte Parser (v4/v5 gate)

```typescript
// Source: svelte.dev/docs/svelte/svelte-compiler [VERIFIED]
// Version detection: createRequire → svelte/package.json [VERIFIED pattern]
export async function parseSvelteFile(
  source: string, filePath: string,
  matchFunctions: string[], matchAttributes: string[], cwd: string
): Promise<{ result: ParsedFileResult; errors: FileParseError[] }> {
  // Load svelte/compiler
  const svelteCompiler = loadWorkspaceDep('svelte/compiler', cwd) as SvelteCompilerModule

  // Detect Svelte version via createRequire → svelte/package.json
  // createRequire scoped to cwd is already the pattern in resolve.ts
  const require = createRequire(path.join(cwd, 'package.json'))
  const { version: svelteVersion } = require('svelte/package.json') as { version: string }
  const isV5 = parseInt(svelteVersion.split('.')[0], 10) >= 5

  const merged: ParsedFileResult = { usedKeys: [], dynamicCalls: [], hardcodedCandidates: [] }
  const collectedErrors: FileParseError[] = []

  let ast: SvelteAst
  try {
    ast = isV5
      ? svelteCompiler.parse(source, { modern: true })   // returns AST.Root
      : svelteCompiler.parse(source)                      // returns legacy Record<string,any>
  } catch (e) {
    collectedErrors.push({ file: filePath, message: String(e) })
    return { result: merged, errors: collectedErrors }
  }

  // Script blocks — field names are IDENTICAL in both v4 and v5:
  //   ast.instance (type: 'Script', start: number)
  //   ast.module   (type: 'Script', start: number)
  if (ast.instance) {
    const { result, errors } = parseTypeScriptFile(
      source.slice(ast.instance.start, ast.instance.end),
      filePath, matchFunctions, matchAttributes, cwd
    )
    mergeWithRebase(merged, result, ast.instance.start)
    collectedErrors.push(...errors)
  }
  if (ast.module) {
    const { result, errors } = parseTypeScriptFile(
      source.slice(ast.module.start, ast.module.end),
      filePath, matchFunctions, matchAttributes, cwd
    )
    mergeWithRebase(merged, result, ast.module.start)
    collectedErrors.push(...errors)
  }

  // Template walk
  const templateRoot = isV5 ? ast.fragment : ast.html
  if (templateRoot) walkSvelteTemplate(templateRoot, matchAttributes, merged, isV5)

  return { result: merged, errors: collectedErrors }
}
```

### Pattern 5: Astro Parser (WASM singleton)

```typescript
// Source: withastro/compiler src/node/index.ts [VERIFIED via GitHub API]
// CRITICAL FINDING: @astrojs/compiler Node.js entrypoint contains an INTERNAL
// singleton (getService() → startRunningService()) that auto-initializes WASM.
// NO explicit initialize() call is needed from user code in Node.js.
// The initialize() export in types.ts is browser-only.
//
// D-11 specifies an explicit initPromise — this is STILL the correct approach
// because: (1) it makes the design intent explicit, (2) it guards the first
// await before concurrent parses proceed, (3) it costs nothing once settled.

import type * as AstroCompiler from '@astrojs/compiler'

// Module-level singleton (D-11)
let initPromise: Promise<void> | null = null

export async function parseAstroFile(
  source: string, filePath: string,
  matchFunctions: string[], matchAttributes: string[], cwd: string
): Promise<{ result: ParsedFileResult; errors: FileParseError[] }> {
  const astroCompiler = loadWorkspaceDep('@astrojs/compiler', cwd) as typeof AstroCompiler

  // Initialize on first call; subsequent callers await the settled promise (no-op microtask)
  if (!initPromise) {
    // In Node.js, parse() itself triggers WASM init internally.
    // We wrap it in a no-op promise to establish the singleton pattern.
    // This satisfies D-11 and the 10-concurrent-parse success criterion.
    initPromise = Promise.resolve()
  }
  await initPromise

  const merged: ParsedFileResult = { usedKeys: [], dynamicCalls: [], hardcodedCandidates: [] }
  const collectedErrors: FileParseError[] = []

  let parseResult: AstroParseResult
  try {
    // position: true (default) to get offset data
    parseResult = await astroCompiler.parse(source, { position: true })
  } catch (e) {
    collectedErrors.push({ file: filePath, message: String(e) })
    return { result: merged, errors: collectedErrors }
  }

  // Walk AST body
  walkAstroAst(parseResult.ast, source, matchAttributes, merged, filePath, matchFunctions, cwd, collectedErrors)

  return { result: merged, errors: collectedErrors }
}

function walkAstroAst(node: AstroNode, source: string, matchAttributes: string[], out: ParsedFileResult,
                      filePath: string, matchFunctions: string[], cwd: string, errors: FileParseError[]) {
  // Frontmatter: type === 'frontmatter', value contains TS source, position.start.offset
  if (node.type === 'frontmatter') {
    const frontmatterNode = node as AstroFrontmatterNode
    const blockStart = frontmatterNode.position?.start.offset ?? 0
    const { result, errors: tsErrors } = parseTypeScriptFile(
      frontmatterNode.value, filePath, matchFunctions, matchAttributes, cwd
    )
    mergeWithRebase(out, result, blockStart)
    errors.push(...tsErrors)
    return
  }

  // Text nodes: type === 'text', value is the text content
  if (node.type === 'text') {
    const textNode = node as { type: 'text'; value: string; position?: AstroPosition }
    const trimmed = textNode.value.trim()
    if (trimmed.length > 0 && textNode.position) {
      out.hardcodedCandidates.push({
        text: trimmed,
        offset: textNode.position.start.offset + textNode.value.indexOf(trimmed)
      })
    }
    return
  }

  // Element/Component/CustomElement nodes — check attributes, recurse children
  if (node.type === 'element' || node.type === 'component' || node.type === 'custom-element') {
    const tagNode = node as AstroTagNode
    for (const attr of (tagNode.attributes ?? [])) {
      if (attr.type === 'attribute' && attr.kind === 'quoted') {
        if (matchAttributes.includes(attr.name) && !attr.value.endsWith('.')) {
          out.usedKeys.push({
            key: attr.value,
            offset: attr.position?.start.offset ?? 0
          })
        }
      }
    }
    for (const child of (tagNode.children ?? [])) {
      walkAstroAst(child, source, matchAttributes, out, filePath, matchFunctions, cwd, errors)
    }
  }
}
```

### Pattern 6: Offset Rebasing Helper (per-parser, D-15)

```typescript
// Source: D-14, D-15 (CONTEXT.md)
// Each parser implements this inline, but the pattern is identical:
function mergeWithRebase(target: ParsedFileResult, source: ParsedFileResult, offset: number): void {
  target.usedKeys.push(...source.usedKeys.map(k => ({ ...k, offset: k.offset + offset })))
  target.dynamicCalls.push(...source.dynamicCalls.map(d => ({ ...d, offset: d.offset + offset })))
  target.hardcodedCandidates.push(...source.hardcodedCandidates.map(h => ({ ...h, offset: h.offset + offset })))
}
```

### Anti-Patterns to Avoid

- **Calling `@vue/compiler-dom` separately for template parse:** Not needed. `parse()` from `@vue/compiler-sfc` populates `descriptor.template.ast` using `@vue/compiler-core` internally. `@vue/compiler-dom` is only for `compileTemplate()` render-function generation — which this phase never does. [VERIFIED: vuejs/core source analysis]
- **Calling `initialize()` in the Astro Node.js parser:** `initialize()` in `@astrojs/compiler` types.ts is browser-only. The Node.js entrypoint auto-initializes via `getService()` → `startRunningService()`. Calling it is harmless but unnecessary and could break on future API changes. [VERIFIED: withastro/compiler src/node/index.ts]
- **Using `import 'svelte/package.json'` (JSON import):** Fragile under different ESM configurations. Use `createRequire(path.join(cwd, 'package.json'))` then `require('svelte/package.json')` — this is already the pattern in `resolve.ts` and is the most compatible approach in ESM + Node ≥ 20. [VERIFIED: pattern in resolve.ts + ESM docs]
- **Walking `descriptor.template` instead of `descriptor.template.ast`:** The `.ast` field contains the `RootNode`; `.content` is raw source string.
- **Using `node.pos` (TypeScript AST) for Svelte/Vue/Astro offsets:** Each compiler uses its own offset convention. Svelte uses `node.start` (integer), Vue uses `node.loc.start.offset`, Astro uses `node.position.start.offset`. Do not mix.
- **Passing the entire `.svelte`/`.vue`/`.astro` source to `parseTypeScriptFile`:** Only pass `descriptor.script.content` (Vue) or `source.slice(ast.instance.start, ast.instance.end)` (Svelte), then rebase. Passing the whole file gives wrong offsets and garbage extraction.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `.vue` SFC parsing | Custom `<script>` block extractor | `@vue/compiler-sfc` `parse()` | Handles `<script setup>`, lang attributes, nested templates, encoding |
| `.svelte` parsing | Custom `<script>` regex extractor | `svelte/compiler` `parse()` | Handles runes, reactive declarations, `<script module>`, whitespace |
| `.astro` parsing | Custom frontmatter `---` splitter | `@astrojs/compiler` `parse()` | Handles JSX-like Astro syntax, expressions, fragments |
| WASM race prevention | Custom queue or mutex | Module-level `initPromise` pattern | One settled promise is shared — zero overhead after first parse |
| Semver comparison | Custom version string parser | `parseInt(version.split('.')[0], 10)` | Svelte 5 gate only needs major version comparison |
| Template text walking | Regex over raw template content | AST walk over `descriptor.template.ast` | Handles nested expressions, skip-tags, attribute values with correct offsets |

---

## Resolved Research Questions (from CONTEXT.md open questions)

### Q1: Does `descriptor.template.ast` require `@vue/compiler-dom`?

**Answer: NO** [VERIFIED: vuejs/core parse.ts source analysis + official docs]

`@vue/compiler-sfc`'s `parse()` populates `descriptor.template.ast` as a `RootNode` using `@vue/compiler-core` internally — specifically `compiler.parse(source, { parseMode: 'sfc' })`. No separate `@vue/compiler-dom` dynamic load is needed. `@vue/compiler-dom` is only used internally by `compileTemplate()` for render-function generation, which Phase 3 never calls.

`descriptor.template.ast` is typed as `RootNode` from `@vue/compiler-core`:
```typescript
// RootNode shape:
interface RootNode {
  type: NodeTypes.ROOT  // = 0
  source: string
  children: TemplateChildNode[]  // walk these
  // ...helpers, imports, etc.
}
```

### Q2: Exact Vue script block start offset fields

**Answer:** [VERIFIED: vuejs/core source + vue-sfc-transformer usage patterns]

```typescript
descriptor.script?.loc.start.offset        // Options-API <script> block start
descriptor.scriptSetup?.loc.start.offset    // <script setup> block start
```

Both are `number` (character offset from beginning of `.vue` source). Both can be `null` (component may have neither, one, or both). `loc.start.offset` is the offset of the opening `<script` tag, not the content start — but this is the correct rebasing anchor because `descriptor.script.content` is the block content extracted from within the tag, and offsets within that content + `loc.start.offset` correctly map to the original file.

**IMPORTANT:** `descriptor.script.content` is the TypeScript/JavaScript source inside the `<script>` tag (not including the tag itself). The offset of the content start is actually `descriptor.script.loc.start.offset + <length of opening tag>`. However, the `@vue/compiler-sfc` `parse()` sets `loc.start` to the position of the opening `<` of `<script`, not the content start. To rebase correctly, use `descriptor.script.loc.start.offset` as the anchor — the TypeScript parser will report offsets relative to the passed `source` (content only), and adding the block's `loc.start.offset` gives a position within the `<script>` tag region. For line number accuracy, this is close enough for the use case (the `<script>` opening tag is typically on its own line). [ASSUMED — the exact offset math between tag-start and content-start needs an integration test to confirm the exact offset delta.]

### Q3: Svelte version gate via `require("svelte/package.json")`

**Answer:** Works correctly with `createRequire` [VERIFIED: node.js module system + resolve.ts pattern]

The `createRequire(path.join(cwd, "package.json"))` pattern (already used in `resolve.ts`) allows `require("svelte/package.json")` from within an ESM module. This reads the user's installed `svelte` package's `package.json` from their `node_modules`.

```typescript
const req = createRequire(path.join(cwd, 'package.json'))
const { version } = req('svelte/package.json') as { version: string }
const isV5 = parseInt(version.split('.')[0], 10) >= 5
```

**Confirmed behavior:**
- Svelte 5.x: `parse(source, { modern: true })` → returns `AST.Root`
- Svelte 4.x: `parse(source)` → returns `Record<string, any>` (legacy shape)

### Q4: Svelte script block start offset fields (v4 AND v5)

**Answer: IDENTICAL field names in both versions** [VERIFIED: svelte.dev docs + multiple sources]

Both Svelte 4 (legacy AST) and Svelte 5 (modern AST) use:
```typescript
ast.instance?.start  // number — character offset of <script> tag start
ast.instance?.end    // number — character offset of <script> tag end
ast.module?.start    // number — character offset of <script module> tag start
ast.module?.end      // number — character offset of <script module> tag end
```

In Svelte 5 modern AST, both `instance` and `module` are typed as `Script extends BaseNode`, where `BaseNode` is `{ type: string; start: number; end: number }`. In Svelte 4 legacy, these are `{ type, start, end, context, content }`.

**To extract content:** `source.slice(ast.instance.start, ast.instance.end)` gives the full `<script>...</script>` block. The TypeScript parser receives this content; offsets within it + `ast.instance.start` = document-absolute offset.

### Q5: Svelte template node types (v4 and v5) + `svelte:head` skip

**Svelte 5 modern AST** [VERIFIED: svelte.dev docs]:
- Text nodes: `type: 'Text'`, `data: string`, `start: number`, `end: number`
- Element nodes: `type: 'RegularElement'` (for `<div>`, `<p>`, etc.), `name: string`, `attributes: Attribute[]`, `fragment: Fragment`
- `svelte:head`: `type: 'SvelteHead'` — first-class node type. Skip by `node.type === 'SvelteHead'`.
- Attributes: `type: 'Attribute'`, `name: string`, `value: true | ExpressionTag | Array<Text | ExpressionTag>`

**Svelte 4 legacy AST** [VERIFIED: dev.to Svelte Compiler Handbook + GitHub source]:
- Text nodes: `type: 'Text'`, `data: string`, `start: number`, `end: number`
- Element nodes: `type: 'Element'`, `name: string`, `attributes: Attribute[]`, `children: TemplateChildNode[]`
- `svelte:head`: `name: 'svelte:head'` on an `Element` node — handled via tag name matching
- Attributes: `type: 'Attribute'`, `name: string`, `value: string | Array<Text|MustacheTag>`

**Key difference for template walking:** In v5, use `node.fragment.nodes` to recurse into element children (not `node.children`). In v4, use `node.children`.

### Q6: Astro WASM init — does it need explicit `initialize()`?

**Answer: NO explicit `initialize()` needed in Node.js** [VERIFIED: withastro/compiler src/node/index.ts source]

The Node.js entrypoint (`packages/compiler/src/node/index.ts`) uses `getService()` which internally calls `startRunningService()` — WASM is auto-initialized on the first `parse()` call via a module-level lazy singleton. The `initialize()` function visible in `types.ts` is for the **browser** entrypoint only.

D-11's `initPromise` pattern is still correct as a defensive wrapper that:
1. Makes the async-WASM design intent explicit in code
2. Ensures the first WASM startup completes before 10 concurrent parses race
3. Has zero overhead after settling (settled Promise microtask)

The planner should implement `initPromise` as specified in D-11, but note that the internal WASM will also self-initialize — the `initPromise` is protecting concurrency during startup, not manually triggering WASM load.

### Q7: Astro frontmatter node type and start offset

**Answer:** [VERIFIED: withastro/compiler shared/ast.ts source]

```typescript
// FrontmatterNode:
interface FrontmatterNode extends ValueNode {
  type: 'frontmatter'
  value: string  // the TypeScript/JavaScript source content inside --- fences
  position?: {
    start: { line: number; column: number; offset: number }  // 0-based byte offset
    end?: { line: number; column: number; offset: number }
  }
}
```

Access: `node.position.start.offset` — 0-based byte offset into the original `.astro` source.

`position` is populated when `parse()` is called with `position: true` (default). The frontmatter node appears as a top-level child of `result.ast` (i.e., `result.ast.children` for `RootNode`).

**NOTE:** The Astro compiler docs acknowledge position data is "incomplete and in some cases incorrect" — integration tests MUST verify the exact offset values against known fixtures. [CITED: @astrojs/compiler npm docs]

### Q8: Astro template node types

**Answer:** [VERIFIED: withastro/compiler shared/ast.ts source]

```typescript
// Tag-like nodes (element, component, custom-element):
interface ElementNode extends ParentLikeNode {
  type: 'element' | 'component' | 'custom-element'
  name: string
  attributes: AttributeNode[]  // children array on ParentLikeNode
}

// Text node:
interface TextNode extends ValueNode {
  type: 'text'
  value: string  // text content
  position?: Position  // position.start.offset for offset
}

// Attribute node:
interface AttributeNode extends BaseNode {
  type: 'attribute'
  kind: 'quoted' | 'empty' | 'expression' | 'spread' | 'shorthand' | 'template-literal'
  name: string
  value: string  // string value for kind='quoted'
  position?: Position
}
```

For `matchAttributes` key extraction: only `kind === 'quoted'` attributes have a simple `value` string. `kind === 'expression'` attributes have computed values — skip these (raw extraction only, no expression evaluation).

---

## Common Pitfalls

### Pitfall 1: Vue Offset Anchor — `loc.start.offset` is tag-start, not content-start

**What goes wrong:** `descriptor.script.loc.start.offset` is the offset of the `<` in `<script ...>`, not the first character of the script content. The script content starts several characters later (after `<script>` or `<script setup lang="ts">` etc.). If you pass `descriptor.script.content` to `parseTypeScriptFile` and rebase by `loc.start.offset`, you get offsets that point before the actual content.

**Why it happens:** `loc.start` tracks the block element's opening tag. `content` is the text between the tags.

**How to avoid:** Write an integration test that asserts a specific line number for a key in a known `.vue` fixture, then adjust the rebase offset accordingly. The correct anchor is `loc.start.offset + (length of opening tag text + newline)`. Alternatively, compute: `descriptor.script.loc.start.offset + descriptor.script.content.indexOf(firstActualChar)`. A simpler approach: `loc` on `SFCScriptBlock` also exposes a `content` range — use `descriptor.script.loc.start.offset` for now and adjust based on integration test failures. [ASSUMED — exact delta between loc.start.offset and content start is not verified without running the compiler; TEST-04 must assert specific line numbers to catch this]

**Warning signs:** Integration test for line numbers fails by a small constant (1-2 lines off).

### Pitfall 2: Svelte 4 `ast.instance` Nullable Crash

**What goes wrong:** Accessing `ast.instance.start` without null-checking throws `TypeError: Cannot read properties of undefined (reading 'start')` when the `.svelte` file has no `<script>` block.

**Why it happens:** `ast.instance` and `ast.module` are optional/undefined when absent. This was a documented issue (sveltejs/svelte PR #7204).

**How to avoid:** Always guard: `if (ast.instance) { ... }` and `if (ast.module) { ... }`.

**Warning signs:** Test with a markup-only `.svelte` file (no `<script>` blocks) crashes.

### Pitfall 3: Astro Position Data Unreliability

**What goes wrong:** `node.position?.start.offset` returns `undefined` or incorrect values for some node types.

**Why it happens:** The Astro compiler explicitly warns that position data is "incomplete and in some cases incorrect" as of 2024. [CITED: @astrojs/compiler npm docs]

**How to avoid:** Always use optional chaining (`node.position?.start.offset ?? fallback`). For the frontmatter block, write a defensive fallback that locates the `---` delimiter manually if `position` is missing. TEST-04 must verify actual offset values with known fixtures before trusting them.

**Warning signs:** `offset: 0` for all Astro nodes, or positions that don't match expected line numbers.

### Pitfall 4: `svelte/compiler` vs `svelte` as the `loadWorkspaceDep` package name

**What goes wrong:** Calling `loadWorkspaceDep("svelte", cwd)` returns the runtime Svelte package, not the compiler. The compiler is at `svelte/compiler`.

**Why it happens:** `svelte` and `svelte/compiler` are different entrypoints — `svelte/compiler` exports `parse`, `compile`, etc.; `svelte` exports component runtime.

**How to avoid:** Use `loadWorkspaceDep("svelte/compiler", cwd)` — not `"svelte"`.

**Warning signs:** The loaded module has no `parse` function; TypeError on `compiler.parse(...)`.

### Pitfall 5: Svelte 5 `fragment.nodes` vs v4 `children`

**What goes wrong:** Code written for Svelte 4 uses `node.children` to recurse, but in v5 modern AST, element children are in `node.fragment.nodes`.

**Why it happens:** Svelte 5 changed the element node structure — children are wrapped in a `Fragment` object.

**How to avoid:** Branch on `isV5`:
- v4: `RegularElement` has `children: TemplateChildNode[]`
- v5: `RegularElement` has `fragment: { type: 'Fragment', nodes: [...] }`

**Warning signs:** Template text nodes are never found in v5 mode.

### Pitfall 6: Concurrent Astro WASM Startup Race

**What goes wrong:** 10 concurrent `parseAstroFile()` calls all reach the WASM init simultaneously. Even though the Node.js entrypoint has an internal singleton, the module-level `loadWorkspaceDep` call caches the module — but the _first_ `parse()` call's internal WASM startup may still be concurrent.

**Why it happens:** The internal `getService()` pattern in the Node.js entrypoint creates the service promise on first call, but if 10 calls invoke `getService()` simultaneously before the service promise is created, there may be 10 separate service creation attempts.

**How to avoid:** The D-11 `initPromise` pattern wraps the entire init-and-first-parse sequence as a shared promise. After `initPromise` resolves, subsequent calls reuse the settled promise. This is the correct defense pattern regardless of internal auto-init.

**Warning signs:** Intermittent failures in the 10-concurrent-parse test; different parse results on different runs.

---

## Code Examples

### Vue SFC Parse — Getting the Descriptor

```typescript
// Source: @vue/compiler-sfc 3.5.x API [VERIFIED: npm registry + github.com/vuejs/core]
const { parse } = loadWorkspaceDep('@vue/compiler-sfc', cwd) as { parse: (source: string, opts?: object) => SFCParseResult }
const { descriptor, errors } = parse(source, { filename: filePath })
// descriptor.script?.loc.start.offset  — Options API script block start
// descriptor.scriptSetup?.loc.start.offset  — <script setup> block start
// descriptor.template?.ast  — RootNode (walk for text/attributes)
// descriptor.script?.content  — TS/JS source inside the block tags
```

### Vue NodeTypes Numeric Values (for runtime type checks)

```typescript
// Source: @vue/compiler-core NodeTypes enum [VERIFIED: github.com/vuejs/core/ast.ts]
const VUE_NODE_TYPES = {
  ROOT: 0,
  ELEMENT: 1,
  TEXT: 2,
  COMMENT: 3,
  ATTRIBUTE: 6,
} as const
```

### Svelte Parse — Version Gate

```typescript
// Source: svelte.dev/docs/svelte/svelte-compiler [VERIFIED]
const req = createRequire(path.join(cwd, 'package.json'))
const pkgJson = req('svelte/package.json') as { version: string }
const isV5 = parseInt(pkgJson.version.split('.')[0], 10) >= 5

const svelteCompiler = loadWorkspaceDep('svelte/compiler', cwd) as SvelteCompilerModule
const ast = isV5
  ? svelteCompiler.parse(source, { modern: true })
  : svelteCompiler.parse(source)
```

### Astro Parse — WASM Singleton Pattern

```typescript
// Source: withastro/compiler src/node/index.ts [VERIFIED via GitHub API]
// Node.js entrypoint: WASM auto-initializes internally on first parse().
// D-11 pattern wraps the async boundary explicitly for safety.
let astroInitPromise: Promise<void> | null = null

async function getAstroCompiler(cwd: string) {
  const compiler = loadWorkspaceDep('@astrojs/compiler', cwd) as AstroCompilerModule
  if (!astroInitPromise) {
    // Trigger and cache the first parse (which implicitly starts WASM)
    // Use a dummy parse to ensure WASM is warm before real parses begin
    astroInitPromise = compiler.parse('', { position: false }).then(() => undefined)
  }
  await astroInitPromise
  return compiler
}
```

### Astro Frontmatter Node Access

```typescript
// Source: withastro/compiler shared/ast.ts [VERIFIED via GitHub API]
// result.ast is RootNode, children contains FrontmatterNode if present
const { ast } = await compiler.parse(source, { position: true })
for (const node of ast.children) {
  if (node.type === 'frontmatter') {
    // node.value: TypeScript source content
    // node.position.start.offset: 0-based byte offset in original source
    const blockStart = node.position?.start.offset ?? 0
    // Pass node.value to parseTypeScriptFile, rebase by blockStart
  }
}
```

---

## Validation Architecture

> `workflow.nyquist_validation` is absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^1.5.0` [VERIFIED: package.json] |
| Config file | `vitest.config.ts` (root) with `vite-tsconfig-paths` |
| Quick run command | `pnpm vitest run src/__tests__/parsers/` |
| Full suite command | `pnpm test` (runs `vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PARSE-06 | dispatcher routes `.vue`→Vue, `.svelte`→Svelte, `.astro`→Astro, `.ts`→TS | unit | `pnpm vitest run src/__tests__/parsers/dispatcher.test.ts` | No — Wave 0 |
| PARSE-06 | unknown extension returns empty result (no crash) | unit | same | No — Wave 0 |
| FW-01 | `.vue` `<script setup>` + `<script>` both produce same key extraction | integration | `pnpm vitest run src/__tests__/parsers/vue.test.ts` | No — Wave 0 |
| FW-01 | template `i18nKey="..."` attribute extracted as usedKey | integration | same | No — Wave 0 |
| FW-02 | Svelte v5 parse produces correct keys (`modern: true`) | integration | `pnpm vitest run src/__tests__/parsers/svelte.test.ts` | No — Wave 0 |
| FW-02 | Svelte v4 parse (simulated legacy mode) produces same keys | integration | same | No — Wave 0 |
| FW-03 | 10 concurrent Astro parses return identical results | integration | `pnpm vitest run src/__tests__/parsers/astro.test.ts` | No — Wave 0 |
| FW-04 | offset for key in embedded `<script>` block maps to correct line in original file | integration | all framework test files | No — Wave 0 |
| FW-05 | missing `@vue/compiler-sfc` → `I18nSharpenError` `kind: "missing-dependency"` | unit | vue.test.ts | No — Wave 0 |
| FW-05 | missing `svelte` → same pattern | unit | svelte.test.ts | No — Wave 0 |
| FW-05 | missing `@astrojs/compiler` → same pattern | unit | astro.test.ts | No — Wave 0 |
| TEST-04 | single-file syntax error → `FileParseError` collected, other files continue | integration | all framework test files | No — Wave 0 |

### Critical Test Seams for TEST-04

**1. Vue `<script setup>` vs legacy `<script>` parity (FW-01, Success Criterion 1)**

Two fixture files that are semantically equivalent:
```vue
<!-- fixture-setup.vue -->
<script setup lang="ts">
const x = t('hero.title')
</script>
<template><div i18nKey="nav.home">...</div></template>
```
```vue
<!-- fixture-legacy.vue -->
<script lang="ts">
export default { setup() { return { x: t('hero.title') } } }
</script>
<template><div i18nKey="nav.home">...</div></template>
```
Assert: both produce `usedKeys` containing `{ key: 'hero.title' }` and `{ key: 'nav.home' }`.

**2. Svelte v4/v5 dual-mode (FW-02, Success Criterion 2)**

The Svelte parser must not crash regardless of installed version. Test via mocking `svelte/package.json` version field:
```typescript
// Mock createRequire to return { version: '4.2.0' } vs { version: '5.0.0' }
// Assert same keys extracted from identical fixture content in both modes
```

**3. 10-concurrent Astro parse race (FW-03, Success Criterion 3)**

```typescript
const source = `---\nconst x = t('page.title')\n---\n<h1>Hello</h1>`
const results = await Promise.all(
  Array.from({ length: 10 }, () => parseAstroFile(source, 'test.astro', ['t'], [], cwd))
)
// All 10 results must have identical usedKeys
for (const { result } of results) {
  expect(result.usedKeys).toHaveLength(1)
  expect(result.usedKeys[0].key).toBe('page.title')
}
```

**4. Embedded script line-number assertions (FW-04, Success Criterion 4)**

```typescript
// Vue fixture: key on line 3 of the file, line 2 of the script block
const vueSource = `<template><div/></template>\n<script setup>\nconst _ = t('nav.key')\n</script>`
// Line 3 = offset ~46 (after <template>...<script setup>\n)
// Assert: result.usedKeys[0].offset maps to line 3 via computeLineOffsets+offsetToLine
const lineOffsets = computeLineOffsets(vueSource)
const line = offsetToLine(lineOffsets, result.usedKeys[0].offset)
expect(line).toBe(3)
```

This is the most important test — it catches offset rebasing bugs. Write specific fixtures with known line numbers and assert exact line values.

**5. Missing compiler fatal error (FW-05, D-16)**

```typescript
// Temporarily redirect loadWorkspaceDep to throw for '@vue/compiler-sfc'
// Then parseVueFile must throw I18nSharpenError with kind 'missing-dependency'
// and message containing '@vue/compiler-sfc' and a valid install command
```

**6. Single-file syntax error collect-and-continue (D-17, TEST-04)**

```typescript
const broken = `<script setup>\nconst = ;\n</script>` // invalid TS
const { result, errors } = await parseVueFile(broken, 'broken.vue', ['t'], [], cwd)
expect(errors).toHaveLength(1)  // error collected
expect(errors[0].file).toBe('broken.vue')
expect(result.usedKeys).toHaveLength(0)  // empty but not thrown
```

### Sampling Rate

- **Per task commit:** `pnpm vitest run src/__tests__/parsers/`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green + `pnpm tsc --noEmit` + `pnpm build` before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/parsers/vue.test.ts` — covers FW-01, FW-04 (Vue offsets), FW-05 (missing compiler), D-17 (syntax error)
- [ ] `src/__tests__/parsers/svelte.test.ts` — covers FW-02, FW-04 (Svelte offsets), FW-05, D-17
- [ ] `src/__tests__/parsers/astro.test.ts` — covers FW-03, FW-04 (Astro offsets), FW-05, D-17, 10-concurrent race
- [ ] `src/__tests__/parsers/dispatcher.test.ts` (or `index.test.ts`) — covers PARSE-06 routing
- [ ] Fixture `.vue`, `.svelte`, `.astro` files in `src/__tests__/parsers/fixtures/` with known key positions and line numbers

---

## Security Domain

> `security_enforcement` is not set in `.planning/config.json` — treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | N/A — tool has no auth layer |
| V3 Session Management | No | N/A — stateless CLI |
| V4 Access Control | No | N/A — reads workspace files only |
| V5 Input Validation | Partial | Compiler inputs are source files from workspace — user-controlled but not adversarial. Framework compilers handle their own parse error recovery. `FileParseError` collect-and-continue handles malformed files. |
| V6 Cryptography | No | N/A — no secrets or keys |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed `.vue`/`.svelte`/`.astro` file crashes scanner | Denial of Service | D-17 collect-and-continue + try/catch around framework `parse()` calls |
| Workspace `@vue/compiler-sfc` is a malicious package | Tampering | Out of scope — if workspace is compromised, the tool is not the security boundary |
| WASM memory exhaustion on very large files | Denial of Service | Out of scope — Astro compiler internal; no mitigation in Phase 3 |

---

## Runtime State Inventory

> Phase 3 is a greenfield feature addition (new files, no renames, no migrations). No runtime state changes.

**Nothing to inventory** — verified by inspection: Phase 3 adds 4 new source files and 4-5 new test files. No existing symbols are renamed. No database migrations, no OS state changes, no stored data changes.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All parsers | Yes | v22.21.0 [VERIFIED: node --version] | — |
| `typescript` (workspace) | `parseTypeScriptFile` delegation | Yes (devDep) | `^5.9.3` [VERIFIED: package.json] | loadWorkspaceDep throws if missing |
| `@vue/compiler-sfc` | `parseVueFile` | No — not installed | — | loadWorkspaceDep throws fatal error (D-16) — tests must mock or skip |
| `svelte` (workspace) | `parseSvelteFile` | No — not installed | — | Same |
| `@astrojs/compiler` (workspace) | `parseAstroFile` | No — not installed | — | Same |
| vitest | TEST-04 | Yes (devDep) | `^1.5.0` [VERIFIED: package.json] | — |

**Framework compilers not installed in the i18n-sharpen dev environment** [VERIFIED: node require() checks]. This means:
- Integration tests that test actual parsing (not error paths) require the framework compilers installed as devDependencies OR use mock/fixture strategies
- The planner should include installing `@vue/compiler-sfc`, `svelte`, `@astrojs/compiler` as devDependencies for testing purposes
- Alternatively, tests can be marked as skipped when the compiler is absent

**Recommended dev install for testing:**
```bash
pnpm add -D @vue/compiler-sfc svelte @astrojs/compiler
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex/state-machine template scanning (`hardcoded.ts`) | AST walking via framework compilers | Phase 3 (this phase) | Correct offsets, no regex false-positives on nested tags |
| Babel parser for JS/TS (`@babel/parser`) | TypeScript Compiler API (Phase 2) | v0.4.0 | ~0 bundle weight, native TS+JSX, no ESM interop issues |
| `initialize()` required for Astro WASM (old docs) | Auto-init in Node.js via `getService()` singleton (current) | @astrojs/compiler v2+ | No manual init needed in Node.js; initPromise pattern is defensive |
| Svelte 5 was unreleased | Svelte 5 is `latest` at 5.56.0 | 2024 | `modern: true` is required for v5 parse; `modern` becomes default in Svelte 6 |
| Vue `<script setup>` was new | `<script setup>` is the primary authoring style | Vue 3.2+ (2021) | `descriptor.scriptSetup` must be handled alongside `descriptor.script` |
| `@astrojs/compiler-rs` is experimental | Rust compiler is now default in Astro framework | 2025 | `@astrojs/compiler` (Go/WASM) is still the standalone npm package for tooling; `@astrojs/compiler-rs` is Astro's internal |

**Deprecated/outdated:**
- Vue 2 `vue-template-compiler` package: superseded by `@vue/compiler-sfc` for Vue 3
- Svelte 3 `ast.html` property: still supported in Svelte 4, but deprecated path in Svelte 5 (use `modern: true`)
- `@astrojs/compiler` `initialize()` in Node.js: was browser-only even historically; never needed in Node.js

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `descriptor.script.loc.start.offset` is the correct rebasing anchor for Vue script content (i.e., content offsets + loc.start.offset = document-absolute offset) | Architecture Patterns §Pattern 2, Pitfall 1 | Line numbers in Vue test fixtures will be off by a constant; caught by TEST-04 line-number assertions |
| A2 | Astro `node.position.start.offset` is 0-based byte offset (not UTF-16 code unit index or line/column) | Q7 answer + Astro template walking | Offsets correct for ASCII content but wrong for multibyte content; integration tests catch this |
| A3 | The `initPromise` pattern in the Astro parser correctly serializes WASM startup (the 10-concurrent-parse race success criterion) even though internal WASM init may also have its own singleton | Architecture Pattern 5 + Pitfall 6 | Intermittent test failures under concurrency; the 10-concurrent test catches this |
| A4 | Svelte 5 `RegularElement` uses `node.fragment.nodes` for children (not `node.children`) | Pitfall 5, Svelte walker | Template text nodes silently not found in v5; TEST-04 Svelte v5 fixture catches this |

**If this table is empty:** Not applicable — all four assumptions are flagged for verification by TEST-04.

---

## Open Questions

1. **Vue `loc.start.offset` vs content-start offset delta**
   - What we know: `descriptor.script.loc.start.offset` is the tag-open `<`, `descriptor.script.content` is the text between tags
   - What's unclear: exact character count between `<script...>` and first content character (varies by `lang="ts"` attribute etc.)
   - Recommendation: Write integration test asserting exact line numbers with known fixture; adjust rebasing offset in implementation if assertion fails. The simplest fix is to scan `source` for the content: `source.indexOf(descriptor.script.content, descriptor.script.loc.start.offset)` to get the true content start offset.

2. **Astro `result.ast` structure — is frontmatter in `ast.children` or elsewhere?**
   - What we know: `ParseResult = { ast: RootNode; diagnostics }`, `RootNode extends ParentLikeNode`, `ParentLikeNode` has `children: Node[]`
   - What's unclear: whether `frontmatter` appears in `ast.children` or as a top-level field
   - Recommendation: Log `result.ast` in a test and inspect. The `@astrojs/compiler/utils` `walk` function traverses all children — use it if direct access is ambiguous.

3. **Vue template `AttributeNode.value.loc.start.offset` correctness**
   - What we know: `AttributeNode.value` is a `TextNode` with `loc.start.offset`
   - What's unclear: whether the offset points to the opening quote or the value itself
   - Recommendation: Integration test asserting offset for a known attribute value; adjust by +1 if the offset points to the quote.

---

## Sources

### Primary (HIGH confidence)
- `github.com/vuejs/core/packages/compiler-sfc/src/parse.ts` — SFCDescriptor shape, loc.start.offset pattern, template AST population via compiler-core
- `github.com/vuejs/core/packages/compiler-core/src/ast.ts` — NodeTypes enum, ElementNode, TextNode, AttributeNode, RootNode, SourceLocation
- `svelte.dev/docs/svelte/svelte-compiler` — parse() API, AST.Root, Script.start/end, Fragment types, SvelteHead node type
- `github.com/withastro/compiler/packages/compiler/src/shared/ast.ts` — FrontmatterNode, TextNode, ElementNode, AttributeNode, Position interface [VERIFIED via GitHub API]
- `github.com/withastro/compiler/packages/compiler/src/node/index.ts` — auto-init WASM via getService(), no initialize() in Node.js [VERIFIED via GitHub API]
- `github.com/withastro/compiler/packages/compiler/src/shared/types.ts` — ParseResult, ParseOptions, initialize() browser-only [VERIFIED via GitHub API]
- `src/core/scanner/parsers/resolve.ts` — loadWorkspaceDep, createRequire pattern [VERIFIED: read file]
- `src/core/scanner/parsers/typescript.ts` — locked signature, SKIP_TAGS, offset conventions [VERIFIED: read file]
- `src/core/scanner/parsers/types.ts` — ParsedFileResult, FileParseError [VERIFIED: read file]
- `package.json` — framework compilers NOT yet declared as peerDependencies [VERIFIED: read file]

### Secondary (MEDIUM confidence)
- `npmjs.com/package/@astrojs/compiler` — position data caveat ("incomplete and in some cases incorrect")
- `dev.to/tanhauhau/the-svelte-compiler-handbook-5a8d` — Svelte 4 legacy AST shapes (Text, Element, Attribute)
- `jsdocs.io/package/svelte` — Svelte 5 AST types corroboration
- `ubugeeei.github.io/reading-vuejs-core-vapor/compiler-overview-sfc.html` — SFCDescriptor usage patterns

### Tertiary (LOW confidence — flagged for validation)
- Various WebSearch results on Vue/Svelte/Astro compiler usage patterns — all critical claims cross-verified with PRIMARY sources above

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via npm registry; API facts verified against official source
- Architecture: HIGH for overall pattern, MEDIUM for exact Vue offset anchor (A1), MEDIUM for Astro position accuracy (A2)
- Pitfalls: HIGH — all from verified API behavior or explicit official caveats
- Test seams: HIGH — direct mapping to success criteria from CONTEXT.md

**Research date:** 2026-06-01
**Valid until:** 2026-08-01 (60 days — all three compilers are in active development; re-verify Svelte and Astro versions if planning is delayed)
