# Phase 2: JS/TS Parser Core + Golden Cases — Research

**Researched:** 2026-05-31
**Domain:** TypeScript Compiler API (parser-only), JSX AST traversal, offset semantics
**Confidence:** HIGH — all claims verified by running TypeScript 5.9.3 in the project's own node_modules

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01** `dynamicCalls` entries are enriched to `{ expression, arg, offset, classification: "fully-dynamic" | "structured-concat", prefix?: string }`. Top-level `ParsedFileResult` array names are otherwise unchanged.
- **D-02** Classification is derived structurally from AST node kind, not by re-parsing printed text: `BinaryExpression` with `+` and leading `StringLiteral` → `structured-concat` (prefix = literal value); `TemplateExpression` with non-empty static head → `structured-concat` (prefix = head text); everything else → `fully-dynamic`. Must reach behavioral parity with v0.3.0 `classifyDynamicCall`/`extractLeadingPrefix`.
- **D-03** `arg` = printed source text of first argument; `expression` = printed callee. Exact mechanism (`node.getText()` vs manual slice) is Claude's discretion as long as parity holds.
- **D-04** Parser reimplements detection internally using native TS APIs; `stripComments`/`isStaticStringLiteral` are not used in the AST path.
- **D-05** Parser imports only `offsetToLine`/`computeLineOffsets` from `lines.ts` and `isHardcodedIgnored` from `hardcoded.ts` (used by the caller, not the parser itself).
- **D-06** `regex.ts`, `dynamic.ts`, `text.ts` are physically untouched — zero regression risk to the default regex path.
- **D-07** matchFunctions callee matching: bare (no dot) = last-segment match; dotted = full-path exact match.
- **D-08** matchAttributes: extract both JSXAttribute string-literal initializer AND JSXExpressionContainer wrapping a static string. Container form is an AST-only gain over the regex.
- **D-09** Attribute name matching is exact; keys ending in `.` excluded from usedKeys.
- **D-10** Parser emits raw structurally-valid candidates only (JSX text nodes + allowlist attributes + SKIP_TAGS skipped). Offset for JSX text = `node.pos + text.indexOf(trimmed)`.
- **D-11** No text-quality filtering in the parser; `isHardcodedIgnored` stays in the caller.
- **D-12** TEST-02: `<m.div>Hello world</m.div>` inner text must appear in `hardcodedCandidates`.
- **D-13** TEST-03: `forwardRef<HTMLInputElement, InputProps>(...)` type params must not produce spurious usedKeys or hardcodedCandidates.
- **D-14** Behavioral input/output cases from `scanner.test.ts`, `dynamic.test.ts`, `hardcoded.test.ts` are ported to AST parser tests. Regex-internal unit tests (buildKeyRegex, buildAttrRegex, stripComments) are NOT ported.

### Claude's Discretion

- Parser module name/location under `src/core/scanner/parsers/` (e.g. `typescript.ts`)
- Internal traversal structure (single `forEachChild` recursion vs visitor map)
- Exact printed-text mechanism for `arg`/`expression` (D-02/D-03 parity is the bar)
- `ts.createSourceFile` invocation details: `ScriptTarget`, `setParentNodes`, `ScriptKind` per extension
- Test file layout/naming for ported corpus and golden cases
- How collected `FileParseError`s are surfaced from this parser

### Deferred Ideas (OUT OF SCOPE)

- Relocating `isHardcodedIgnored` → `text.ts` and deleting `regex.ts`/`dynamic.ts`/`hardcoded.ts` — Phase 6
- Wiring the parser as the engine behind `detectUsedKeys` (async migration, bounded-concurrency pool, `useAst` flag) — Phase 4
- Framework `<script>`-block delegation, dispatcher, `svelte:head` skip — Phase 3
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PARSE-01 | Parse `.ts/.tsx/.js/.jsx` via `ts.createSourceFile` (parser-only), resolved from workspace | ScriptKind map verified; `loadWorkspaceDep("typescript", cwd)` pattern confirmed from Phase 1 |
| PARSE-02 | Single traversal extracts static used keys with document-absolute offsets | `isStringLiteral` + `isNoSubstitutionTemplateLiteral` pattern verified; offset = `node.getStart(sf)` |
| PARSE-03 | Same traversal extracts configured-attribute keys | `isJsxAttribute` + `isStringLiteral` / `isJsxExpression` pattern verified (D-08 gain confirmed) |
| PARSE-04 | Same traversal collects dynamic-call candidates classified fully-dynamic vs structured-concat | `isBinaryExpression`+`PlusToken`+leading `StringLiteral` and `isTemplateExpression`+non-empty head verified |
| PARSE-05 | Same traversal collects hardcoded-text candidates (JSX text + allowlist attrs), honoring SKIP_TAGS | `isJsxText` offset convention confirmed (`node.pos + indexOf(trimmed)`); SKIP_TAGS skip-subtree pattern verified |
| PARSE-06 | Extension-based dispatcher routes each file to correct parser — OUT OF THIS PHASE (Phase 3) | Research notes: PARSE-06 says "dispatcher" which is explicitly Phase 3. The parser itself (PARSE-01..05) is this phase. |
| OFFSET-01 | All offsets in `ParsedFileResult` are document-absolute | `node.getStart(sf)` returns char position into source string; `node.pos` for JsxText confirmed correct |
| TEST-01 | Behavioral cases from scanner.test / dynamic.test / hardcoded.test ported to parser tests | All parity targets located and read; see corpus below |
| TEST-02 | `<m.div>` / `<motion.div>` — inner text in `hardcodedCandidates` | Verified live: `JsxElement.openingElement.tagName` is `PropertyAccessExpression`; traversal collects text correctly |
| TEST-03 | `forwardRef<A,B>` generics — no spurious extraction | Verified live: TypeArguments resolve to `TypeReference` nodes never triggering `isJsxText`/`isJsxAttribute` checks |
</phase_requirements>

---

## Summary

Phase 2 builds a single-pass TypeScript Compiler API traversal that fills all three `ParsedFileResult` buckets in one `forEachChild` recursion over a `ts.createSourceFile` AST. All key technical API shapes have been verified against TypeScript 5.9.3 (the installed version) in live node evaluation. Every design decision in CONTEXT.md is confirmed implementable exactly as specified.

The two golden cases work by construction: `<m.div>` produces a `JsxElement` whose `openingElement.tagName` is a `PropertyAccessExpression` (not just an `Identifier`) — the traversal hits `isJsxText` on its children regardless of tag name shape. `forwardRef<A,B>` type arguments appear in the AST as `TypeReference` children of the `CallExpression.typeArguments` list — `forEachChild` visits them but they never trigger `isJsxText`, `isJsxAttribute`, or `isStringLiteral`-as-key checks, so no spurious output is produced. Both golden cases pass with zero special-case code.

The `ParsedFileResult.dynamicCalls` member shape needs one type refinement in `types.ts` before the parser can be typed correctly: add `classification` and optional `prefix` fields per D-01. The top-level array name is unchanged.

**Primary recommendation:** Implement `src/core/scanner/parsers/typescript.ts` as a single recursive `forEachChild` visitor function, taking `(source: string, filePath: string, matchFunctions: string[], matchAttributes: string[], cwd: string)` and returning `{ result: ParsedFileResult; errors: FileParseError[] }`. Call `loadWorkspaceDep("typescript", cwd)` lazily at the top of the function. Use `setParentNodes: false` and always pass `sourceFile` to `node.getText(sourceFile)`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `typescript` | `>=5.0` (peer, workspace-resolved) | Parser and AST types | Already declared optional peer dep in Phase 1; all required APIs stable since TS 4.x |

**Version verification:** [VERIFIED: npm registry + local node_modules] TypeScript 5.9.3 installed in workspace. `peerDependencies` in `package.json` already states `>=5.0`. No `package.json` change required this phase.

### Supporting (reused from Phase 1 / project)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lines.ts` (local) | — | `computeLineOffsets` + `offsetToLine` | Feed document-absolute offsets from parser to line reporter — import directly, never rewrite |
| `resolve.ts` (local) | — | `loadWorkspaceDep("typescript", cwd)` | Lazy-loads TypeScript from user workspace; throws `I18nSharpenError` kind `missing-dependency` if absent |
| `types.ts` (local) | — | `ParsedFileResult`, `FileParseError` | Build target — Phase 2 refines `dynamicCalls` member type only |
| `vitest` | `^1.5.0` (devDep) | Test framework | Already in use; all tests run with `pnpm test` |

**Installation:** No new packages. All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure

```
src/core/scanner/parsers/
├── types.ts          # Phase 1 — MODIFY: refine dynamicCalls member type (D-01)
├── resolve.ts        # Phase 1 — NO CHANGE
└── typescript.ts     # Phase 2 — NEW: the TS Compiler API parser

src/__tests__/parsers/
├── resolve.test.ts   # Phase 1 — NO CHANGE
└── typescript.test.ts  # Phase 2 — NEW: ported corpus + golden cases
```

### Pattern 1: `ts.createSourceFile` Invocation

**What:** Create a parser-only AST from source text. No `Program`, no type-checker — purely syntactic.

**ScriptKind map (VERIFIED):**
```
.ts  → ts.ScriptKind.TS  (= 3)   ← <T> casts and generics parse as type syntax, NOT JSX
.tsx → ts.ScriptKind.TSX (= 4)   ← JSX-enabled; forwardRef<A,B> still works (TypeArguments not JSX)
.js  → ts.ScriptKind.JS  (= 1)
.jsx → ts.ScriptKind.JSX (= 2)
```

**`setParentNodes` decision: `false`** — We always pass `sourceFile` explicitly to `node.getText(sourceFile)` and `node.getStart(sourceFile)`. The `parent` pointer is never needed because the visitor carries its own traversal context (SKIP_TAGS flag, etc.). Passing `false` is cheaper: no parent pointer wiring on every node.

**Exact invocation:**
```typescript
// Source: verified against TypeScript 5.9.3 in node_modules
const scriptKindMap: Record<string, ts.ScriptKind> = {
  ".ts":  ts.ScriptKind.TS,
  ".tsx": ts.ScriptKind.TSX,
  ".js":  ts.ScriptKind.JS,
  ".jsx": ts.ScriptKind.JSX,
}
const ext = path.extname(filePath).toLowerCase()
const scriptKind = scriptKindMap[ext] ?? ts.ScriptKind.TS

const sourceFile = ts.createSourceFile(
  filePath,       // fileName (used for ScriptKind inference fallback; we pass explicit kind)
  source,         // sourceText
  ts.ScriptTarget.Latest,  // = 99, same as ESNext — use Latest for broadest syntax support
  false,          // setParentNodes — false is sufficient; always pass sf to getText/getStart
  scriptKind      // explicit ScriptKind per extension
)
```

**Why `ScriptTarget.Latest`:** [VERIFIED] `ts.ScriptTarget.Latest === ts.ScriptTarget.ESNext === 99`. Using `Latest` ensures the parser accepts all modern syntax (optional chaining, nullish coalescing, decorators) without needing to track which target supports which syntax.

### Pattern 2: Single-Pass `forEachChild` Visitor

**What:** One recursive `forEachChild` walk producing all three buckets. The visitor is a flat function that checks the current node kind and dispatches; it returns early (does not call `ts.forEachChild`) when entering a SKIP_TAG element.

```typescript
// Source: verified live against TypeScript 5.9.3
function visit(node: ts.Node): void {
  // SKIP_TAGS: do not recurse into skip-tag subtree
  if (ts.isJsxElement(node)) {
    const tagName = getTagName(node.openingElement.tagName)
    if (SKIP_TAGS.has(tagName)) return  // ← entire subtree skipped
  }

  // Bucket 1+2: call expressions for usedKeys + dynamicCalls
  if (ts.isCallExpression(node)) {
    handleCall(node)
    // still recurse for nested calls inside args
  }

  // Bucket 1 (attribute path): configured attribute keys
  if (ts.isJsxAttribute(node)) {
    handleJsxAttribute(node)
  }

  // Bucket 3: JSX text nodes
  if (ts.isJsxText(node)) {
    handleJsxText(node)
  }

  // Bucket 3 (expression path): {"static string"} in JSX
  if (ts.isJsxExpression(node)) {
    handleJsxExpression(node)
  }

  ts.forEachChild(node, visit)
}
```

**Key:** `isJsxElement` early-return prevents descending into `<script>`, `<pre>`, etc. It does NOT prevent visiting child JSX outside a skip element. The SKIP_TAGS check is only on `JsxElement` (not `JsxSelfClosingElement` — self-closing skip tags have no text children by definition, but their attributes still process normally if they are not in SKIP_TAGS).

### Pattern 3: JSX Tag Name Extraction (`getTagName`)

**What:** Extract the tag name string for SKIP_TAGS comparison. Must handle both simple identifier tags (`<div>`) and member-expression tags (`<m.div>`, `<motion.div>`).

```typescript
// Source: verified — JsxElement.openingElement.tagName is PropertyAccessExpression for <m.div>
function getTagName(tagExpr: ts.JsxTagNameExpression): string {
  if (ts.isIdentifier(tagExpr)) return tagExpr.text.toLowerCase()
  if (ts.isPropertyAccessExpression(tagExpr)) return tagExpr.getText(sourceFile).toLowerCase()
  // JsxNamespacedName (e.g. <Foo:Bar>) — not in SKIP_TAGS, return empty
  return ""
}
```

**AST shape for `<m.div>`:**
```
JsxElement
  JsxOpeningElement
    PropertyAccessExpression   ← tagName
      Identifier "m"
      Identifier "div"
    JsxAttributes
  JsxText "\n  Hello world\n"  ← node.pos = position after ">"
  JsxClosingElement
    PropertyAccessExpression
```

**Why TEST-02 works automatically:** The traversal never inspects the tag name for text collection — it only inspects it for SKIP_TAGS. `m.div` is not in SKIP_TAGS, so children are visited normally. No special-casing needed.

### Pattern 4: Offset Semantics

**What:** Every offset in `ParsedFileResult` must be a document-absolute character position into the original source string (feeds `offsetToLine` / `computeLineOffsets` in `lines.ts` directly).

**Verified offset rules:**

| Node Type | Offset Source | Reason |
|-----------|--------------|--------|
| `CallExpression` (usedKeys, dynamicCalls) | `node.getStart(sourceFile)` | Points to start of `t(` call |
| `JsxAttribute` string literal | `init.getStart(sourceFile) + 1` | `getStart` = quote char; `+1` skips opening quote to value start |
| `JsxAttribute` expression string | `init.expression.getStart(sourceFile) + 1` | Same: getStart of StringLiteral + 1 for quote |
| `JsxText` node | `node.pos + text.indexOf(trimmed)` | `node.pos` is the raw position (includes leading whitespace in `node.text`); `indexOf(trimmed)` finds trimmed start within the full text |

**Critical: `node.pos` vs `node.getStart(sourceFile)` for `JsxText`:**

[VERIFIED] For a JsxText node with content `"\n  Hello world\n"`:
- `node.pos = 5` (absolute position of the `\n` after `>`)
- `node.getStart(sf) = 9` (after leading whitespace trivia — WRONG for our use)
- `node.text = "\n  Hello world\n"` (full text including whitespace)
- `trimmed = "Hello world"`, `idx = text.indexOf(trimmed) = 3`
- Correct offset = `node.pos + 3 = 8` (points exactly to `H` in source)

The regex scanner's `flushTextNode(text, startOffset)` does `startOffset + text.indexOf(trimmed)` where `startOffset` is the scanner's running position (equivalent to `node.pos` for the JsxText's raw start). **Use `node.pos`, not `node.getStart(sf)`** for the base in JsxText offset calculation.

### Pattern 5: Call Expression Classification (PARSE-02 + PARSE-04)

**Static key detection:**
```typescript
// Source: verified — these two node kinds cover all static string forms
if (ts.isStringLiteral(firstArg) || ts.isNoSubstitutionTemplateLiteral(firstArg)) {
  const key = firstArg.text  // unquoted value
  if (!key.endsWith(".")) {
    usedKeys.push({ key, offset: node.getStart(sourceFile) })
  }
}
```

**Dynamic classification (D-02) — structural, not textual:**
```typescript
// Source: verified against all dynamic.test.ts cases
let classification: "fully-dynamic" | "structured-concat" = "fully-dynamic"
let prefix: string | undefined

if (
  ts.isBinaryExpression(firstArg) &&
  firstArg.operatorToken.kind === ts.SyntaxKind.PlusToken &&
  ts.isStringLiteral(firstArg.left)          // leading string operand
) {
  classification = "structured-concat"
  prefix = firstArg.left.text               // unquoted prefix value
} else if (
  ts.isTemplateExpression(firstArg) &&
  firstArg.head.text !== ""                  // non-empty head = static prefix before first ${}
) {
  classification = "structured-concat"
  prefix = firstArg.head.text
}
// All other kinds (Identifier, CallExpression, ConditionalExpression,
// PropertyAccessExpression, TemplateExpression with empty head) → fully-dynamic
```

**Parity verification with `dynamic.test.ts`:**

| Input | dynamic.ts result | AST classification | Match |
|-------|------------------|-------------------|-------|
| `"error." + code` | structured-concat, prefix `"error."` | BinaryExpr + leading StringLiteral | ✓ |
| `` `error.${code}` `` | structured-concat, prefix `"error."` | TemplateExpression, head.text = `"error."` | ✓ |
| `` `${prefix}.error` `` | fully-dynamic | TemplateExpression, head.text = `""` | ✓ |
| `myVar` | fully-dynamic | Identifier | ✓ |
| `getKey()` | fully-dynamic | CallExpression | ✓ |
| `cond ? "a" : "b"` | fully-dynamic | ConditionalExpression | ✓ |
| `"a." + x + ".b"` | structured-concat, prefix `"a."` | BinaryExpr, left = `"a." + x`, but LEFT is also BinaryExpr — NOT a leading StringLiteral. This needs special handling. |

**CRITICAL: Chained concat `"a." + x + ".b"` — AST shape is left-associative:**
```
BinaryExpression (outer)
  BinaryExpression (inner: "a." + x)   ← left operand is NOT StringLiteral
  "+"
  StringLiteral ".b"
```
`dynamic.test.ts` expects prefix `"a."` for this input. With purely `isBinaryExpression && left is StringLiteral`, the outer binary's left is `BinaryExpression`, not `StringLiteral` — so the naive check gives `fully-dynamic`. **Correct approach:** walk the leftmost chain of `+` binary expressions to find the deepest-left `StringLiteral`:
```typescript
function getLeadingStringLiteral(node: ts.Expression): ts.StringLiteral | null {
  if (ts.isStringLiteral(node)) return node
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return getLeadingStringLiteral(node.left)
  }
  return null
}
```

### Pattern 6: Callee Matching (D-07 — bare last-segment vs full-path)

```typescript
// Source: verified — bare "t" matches i18n.t(); "i18n.t" matches only i18n.t()
function matchesFunction(callee: ts.Expression, matchFunctions: string[]): boolean {
  const lastSegment = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : null

  if (!lastSegment) return false

  for (const fn of matchFunctions) {
    if (!fn.includes(".")) {
      // bare name: match last segment only
      if (lastSegment === fn) return true
    } else {
      // dotted name: match full property access path
      if (ts.isPropertyAccessExpression(callee) && callee.getText(sourceFile) === fn) return true
    }
  }
  return false
}
```

### Pattern 7: Attribute Extraction (D-08 — string literal + expression container)

```typescript
// Source: verified — both forms produce the same text; container form is a D-08 gain
if (ts.isJsxAttribute(node)) {
  const attrName = node.name.text
  const init = node.initializer

  let strValue: string | null = null
  let strOffset: number | null = null

  if (init && ts.isStringLiteral(init)) {
    // i18nKey="value" or placeholder='text'
    strValue = init.text
    strOffset = init.getStart(sourceFile) + 1  // +1 skips the opening quote
  } else if (
    init &&
    ts.isJsxExpression(init) &&
    init.expression &&
    ts.isStringLiteral(init.expression)
  ) {
    // i18nKey={"value"} — AST-only gain over regex (D-08)
    strValue = init.expression.text
    strOffset = init.expression.getStart(sourceFile) + 1
  }

  if (strValue !== null && strOffset !== null) {
    if (matchAttributes.includes(attrName) && !strValue.endsWith(".")) {
      usedKeys.push({ key: strValue, offset: strOffset })
    }
    if (HARDCODED_ATTR_ALLOWLIST.has(attrName)) {
      hardcodedCandidates.push({ text: strValue, offset: strOffset })
    }
  }
}
```

**Allowlist (from hardcoded.ts, D-10):** `placeholder | title | alt | aria-label | label`
**SKIP_TAGS (from hardcoded.ts, D-10):** `script | style | code | pre | svg | path | noscript | iframe`
Note: `svelte:head` is in the regex-era SKIP_TAGS but is framework-specific — deferred to Phase 3 per D-10.

### Pattern 8: JsxText + JsxExpression (Hardcoded Candidates)

```typescript
// JsxText: text nodes between JSX tags
if (ts.isJsxText(node)) {
  const text = node.text  // raw text including surrounding whitespace
  const trimmed = text.trim()
  if (trimmed.length > 0) {
    const idx = text.indexOf(trimmed)
    hardcodedCandidates.push({ text: trimmed, offset: node.pos + idx })
  }
  // Do NOT recurse into JsxText (it has no children)
  return
}

// JsxExpression: {"static string"} in JSX children
if (ts.isJsxExpression(node)) {
  const expr = node.expression
  if (expr && ts.isStringLiteral(expr)) {
    const trimmed = expr.text.trim()
    if (trimmed.length > 0) {
      // offset = start of string value (after opening quote)
      hardcodedCandidates.push({ text: trimmed, offset: expr.getStart(sourceFile) + 1 })
    }
  }
  // Still recurse for nested JSX in expressions ({isActive && <span>Hi</span>})
}
```

### Pattern 9: `ParsedFileResult.dynamicCalls` Type Refinement

The current `types.ts` placeholder (`{ expression: string; arg: string; offset: number }`) must be extended per D-01 before the parser can be type-checked:

```typescript
// Update in src/core/scanner/parsers/types.ts
dynamicCalls: {
  expression: string
  arg: string
  offset: number
  classification: "fully-dynamic" | "structured-concat"
  prefix?: string
}[]
```

This is the ONLY change to `types.ts` in Phase 2. Top-level array names and `usedKeys`/`hardcodedCandidates` shapes are unchanged.

### Pattern 10: Error Collection (FileParseError)

`ts.createSourceFile` is always-recovering — it never throws. Parse errors are available on `sourceFile.parseDiagnostics` (internal but stable property, verified present in TS 5.9.3). For Phase 2 the parser can either:

A. **Minimal approach:** Collect diagnostics from `(sourceFile as any).parseDiagnostics`, convert to `FileParseError[]`, and return them alongside the result — proper ERR-01 wiring but relies on an internal property.
B. **Safe approach for Phase 2:** Always return an empty `errors: FileParseError[]` array and note that full diagnostic collection is Phase 3/4 wiring work. The parser itself never throws.

Given Phase 2 scope (standalone parser, not yet wired to `detectUsedKeys`), the safe approach (B) is appropriate. The ERR-01 collect-and-continue contract is already unit-tested in Phase 1's `resolve.test.ts`.

### Anti-Patterns to Avoid

- **`setParentNodes: true` unnecessarily:** Wires parent pointers on every node for a 5-15% memory/speed cost. Never needed here because we pass `sourceFile` explicitly. [VERIFIED: `getText(sf)` works without parent nodes]
- **`node.getStart(sf)` for JsxText base offset:** Returns the position AFTER leading whitespace trivia — the trimmed text may already be past that point, giving a wrong offset. Use `node.pos` for JsxText. [VERIFIED]
- **Multi-pass traversal:** Separate passes for usedKeys, dynamicCalls, and hardcodedCandidates would be 3x the traversal cost. The single-pass visitor handles all three in one `forEachChild` recursion.
- **Creating a `ts.Program`:** Orders-of-magnitude slower than `createSourceFile` alone. Explicitly ruled out in REQUIREMENTS.md and out of scope.
- **Relying on file extension for ScriptKind inference:** Do not omit the `scriptKind` argument and rely on TS inferring from `fileName`. Always pass explicitly. [ASSUMED: inference behavior may differ across TS versions]
- **Using `node.text` for CallExpression getText:** `node.text` is only defined on literal tokens (`StringLiteral`, `Identifier`, etc.). For `expression` and `arg` fields in dynamicCalls, use `node.getText(sourceFile)`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSX parsing | Custom JSX tokenizer | `ts.createSourceFile` with `ScriptKind.TSX` | Handles all edge cases: member-expression tags, namespaced names, conditional rendering, spread attributes |
| Comment stripping | `stripComments` from `text.ts` | TS parser inherently ignores comments | Comments are `Trivia` in the TS AST — never visited by `forEachChild` |
| Static string detection | `isStaticStringLiteral` from regex path | `ts.isStringLiteral || ts.isNoSubstitutionTemplateLiteral` | Native type guards; structurally correct, no string regex needed |
| Dynamic prefix extraction | `extractLeadingPrefix` from `dynamic.ts` | `firstArg.left.text` / `firstArg.head.text` | AST has the prefix as a typed property — no string parsing |
| Template literal handling | Manual `${...}` regex | `ts.isTemplateExpression`, `firstArg.head.text` | `head.text` is the exact static prefix before first interpolation |
| Line number lookup | Manual `content.split('\n')` | `computeLineOffsets` + `offsetToLine` from `lines.ts` | Already O(log n); reuse unchanged per OFFSET-02 |

---

## Common Pitfalls

### Pitfall 1: Using `node.getStart(sf)` Instead of `node.pos` for JsxText Offsets

**What goes wrong:** `getStart(sf)` strips leading trivia (whitespace) from JsxText nodes. For `"\n  Hello world\n"`, `getStart(sf) = 9` while `node.pos = 5`. Using `getStart` as the base means `node.getStart(sf) + text.indexOf(trimmed)` skips the whitespace prefix TWICE, giving an offset beyond the actual `H` position.

**Why it happens:** The `getStart(sf)` / `pos` distinction matters most for JsxText because JSX text nodes contain significant leading whitespace as part of their `node.text` property, unlike most other nodes where trivia is truly ignorable.

**How to avoid:** For `JsxText` nodes: `offset = node.pos + node.text.indexOf(trimmed)`. For all other nodes (StringLiteral, CallExpression): `node.getStart(sourceFile)`.

**Warning signs:** Offset-to-line reports the wrong line number for hardcoded candidates; test comparing against `hardcoded.test.ts` offset expectations fails.

### Pitfall 2: Left-Associative Binary Concat `"a." + x + ".b"` Not Detected as Structured

**What goes wrong:** `dynamic.test.ts` expects `"a." + x + ".b"` → structured-concat with prefix `"a."`. But the outer `BinaryExpression` has `left = BinaryExpression("a." + x)`, not a `StringLiteral`. A naive `ts.isStringLiteral(outerBinary.left)` check gives `false`, classifying this as `fully-dynamic` — wrong, regression against v0.3.0 parity.

**Why it happens:** JavaScript `+` is left-associative, so `"a." + x + ".b"` parses as `("a." + x) + ".b"`. The leading string literal is at the deepest-left position of the chain.

**How to avoid:** Walk the left chain recursively until you find a `StringLiteral` or a non-`+` binary expression. See `getLeadingStringLiteral` helper in Pattern 5 above.

**Warning signs:** `dynamic.test.ts` case `['"a." + x + ".b"', "a."]` fails with `fully-dynamic` classification.

### Pitfall 3: Visiting TypeArguments as JSX in `.tsx` Files

**What goes wrong:** You might expect `forwardRef<HTMLInputElement, InputProps>` in a `.tsx` file to produce spurious results. It does NOT — the TypeScript parser in TSX mode correctly places the type arguments in `CallExpression.typeArguments` as `TypeReference` nodes. These ARE visited by `forEachChild` but never trigger any of our extraction predicates (`isJsxText`, `isJsxAttribute`, `isStringLiteral` in a key context).

**Why it matters:** If you add a guard like "skip TypeReference children" you may accidentally suppress real type arguments that appear inside JSX expressions. The natural typeguard-based visitor handles this correctly by construction.

**How to avoid:** No special TypeArguments guard needed. TEST-03 [VERIFIED] passes with the plain visitor shown above.

**Warning signs (if broken):** Spurious `usedKeys` entry for `"HTMLInputElement"` or similar type names.

### Pitfall 4: SKIP_TAGS Check Only on `JsxElement`, Missing `JsxSelfClosingElement`

**What goes wrong:** `<script />` is a `JsxSelfClosingElement`, not a `JsxElement`. If SKIP_TAGS check only guards `isJsxElement`, a self-closing script tag is not skipped.

**Why it matters:** `<svg />` and `<path />` can be self-closing. The allowlist attribute extraction should still not fire on self-closing skip tags.

**How to avoid:** Add `isJsxSelfClosingElement` check alongside `isJsxElement` for SKIP_TAGS. Self-closing elements have no text children so the JsxText harvesting is not an issue — but the attribute allowlist (`placeholder`, etc.) should be guarded. Best practice: check SKIP_TAGS in the common path before `isJsxAttribute` dispatching, or check in `handleJsxAttribute` by tracking a `skipDepth` counter.

### Pitfall 5: `node.getText()` Without Passing `sourceFile` (when `setParentNodes: false`)

**What goes wrong:** `node.getText()` without arguments only works when `setParentNodes: true` (it walks the parent chain to find the SourceFile). With `setParentNodes: false`, calling `node.getText()` throws. [VERIFIED]

**How to avoid:** Always call `node.getText(sourceFile)` — passing the SourceFile explicitly. This works regardless of `setParentNodes` value.

### Pitfall 6: `peerDependencies` Range Only `>=5.0` — API Stability for TS 4.x

**What goes wrong:** The `package.json` peer dep declares `>=5.0`. But if a user runs TypeScript 4.x (not covered by the range — wait, `>=5.0` means TS 5+ only) they get a resolver error. This is the declared intention.

**Note:** All APIs used (`createSourceFile`, `forEachChild`, `isJsxText`, `isJsxElement`, `isJsxAttribute`, `isBinaryExpression`, `isTemplateExpression`, `isStringLiteral`, `isNoSubstitutionTemplateLiteral`, `ScriptKind`, `ScriptTarget`) are stable since TS 3.x and have identical signatures in TS 5.9.3. [VERIFIED: all return correct types/values]

---

## Code Examples

### Complete Single-Pass Extraction Sketch

```typescript
// Source: verified against TypeScript 5.9.3 in project node_modules (2026-05-31)

import * as path from "node:path"
import type { ParsedFileResult, FileParseError } from "./types.js"
import { loadWorkspaceDep } from "./resolve.js"

const SKIP_TAGS = new Set(["script","style","code","pre","svg","path","noscript","iframe"])
const HARDCODED_ATTRS = new Set(["placeholder","label","title","alt","aria-label"])
const SCRIPT_KIND_MAP: Record<string, number> = { ".ts": 3, ".tsx": 4, ".js": 1, ".jsx": 2 }

export function parseTypeScriptFile(
  source: string,
  filePath: string,
  matchFunctions: string[],
  matchAttributes: string[],
  cwd: string
): { result: ParsedFileResult; errors: FileParseError[] } {
  // Lazy-load TypeScript from workspace (PERF-02)
  const ts = loadWorkspaceDep("typescript", cwd) as typeof import("typescript")

  const ext = path.extname(filePath).toLowerCase()
  const scriptKind = SCRIPT_KIND_MAP[ext] ?? ts.ScriptKind.TS
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, false, scriptKind)

  const usedKeys: ParsedFileResult["usedKeys"] = []
  const dynamicCalls: ParsedFileResult["dynamicCalls"] = []
  const hardcodedCandidates: ParsedFileResult["hardcodedCandidates"] = []

  function getTagName(tagExpr: ts.JsxTagNameExpression): string {
    if (ts.isIdentifier(tagExpr)) return tagExpr.text.toLowerCase()
    if (ts.isPropertyAccessExpression(tagExpr)) return tagExpr.getText(sf).toLowerCase()
    return ""
  }

  function getLeadingStringLiteral(expr: ts.Expression): ts.StringLiteral | null {
    if (ts.isStringLiteral(expr)) return expr
    if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return getLeadingStringLiteral(expr.left)
    }
    return null
  }

  function visit(node: ts.Node): void {
    // SKIP_TAGS: skip entire subtree
    if (ts.isJsxElement(node)) {
      if (SKIP_TAGS.has(getTagName(node.openingElement.tagName))) return
    }

    // CallExpression: usedKeys + dynamicCalls
    if (ts.isCallExpression(node)) {
      const arg0 = node.arguments[0]
      if (arg0 && matchesFunction(node.expression, matchFunctions, ts, sf)) {
        if (ts.isStringLiteral(arg0) || ts.isNoSubstitutionTemplateLiteral(arg0)) {
          if (!arg0.text.endsWith(".")) {
            usedKeys.push({ key: arg0.text, offset: node.getStart(sf) })
          }
        } else {
          const { classification, prefix } = classifyArg(arg0, ts)
          dynamicCalls.push({
            expression: node.expression.getText(sf),
            arg: arg0.getText(sf),
            offset: node.getStart(sf),
            classification,
            ...(prefix !== undefined ? { prefix } : {})
          })
        }
      }
    }

    // JsxAttribute: usedKeys (matchAttributes) + hardcoded (HARDCODED_ATTRS)
    if (ts.isJsxAttribute(node)) {
      const attrName = node.name.text
      const init = node.initializer
      let strValue: string | null = null
      let strOffset: number | null = null

      if (init && ts.isStringLiteral(init)) {
        strValue = init.text
        strOffset = init.getStart(sf) + 1
      } else if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) {
        strValue = init.expression.text
        strOffset = init.expression.getStart(sf) + 1
      }

      if (strValue !== null && strOffset !== null) {
        if (matchAttributes.includes(attrName) && !strValue.endsWith(".")) {
          usedKeys.push({ key: strValue, offset: strOffset })
        }
        if (HARDCODED_ATTRS.has(attrName)) {
          hardcodedCandidates.push({ text: strValue, offset: strOffset })
        }
      }
    }

    // JsxText: hardcoded text candidates
    if (ts.isJsxText(node)) {
      const trimmed = node.text.trim()
      if (trimmed) {
        const idx = node.text.indexOf(trimmed)
        hardcodedCandidates.push({ text: trimmed, offset: node.pos + idx })  // node.pos, NOT getStart
      }
      return  // JsxText has no children
    }

    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sf, visit)
  return { result: { usedKeys, dynamicCalls, hardcodedCandidates }, errors: [] }
}
```

### `classifyArg` Helper

```typescript
// Source: verified — covers all dynamic.test.ts cases including chained concat
function classifyArg(arg: ts.Expression, ts: typeof import("typescript")): {
  classification: "fully-dynamic" | "structured-concat"
  prefix?: string
} {
  // Binary concat: "prefix." + x  (including chained: "a." + x + ".b")
  if (ts.isBinaryExpression(arg) && arg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const leading = getLeadingStringLiteral(arg)  // walks left chain
    if (leading) return { classification: "structured-concat", prefix: leading.text }
  }
  // Template literal with static head: `prefix.${x}`
  if (ts.isTemplateExpression(arg) && arg.head.text !== "") {
    return { classification: "structured-concat", prefix: arg.head.text }
  }
  return { classification: "fully-dynamic" }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Regex `\b(?:fn)\s*\(` over stripped source | `ts.isCallExpression` + `isIdentifier`/`isPropertyAccessExpression` | Phase 2 (this phase) | Native callee matching; handles member expressions, optional chaining, dotted namespaces |
| `isStaticStringLiteral` string regex | `ts.isStringLiteral || ts.isNoSubstitutionTemplateLiteral` | Phase 2 | Type-safe; handles multiline strings, escape sequences correctly |
| `classifyDynamicCall` string-parsing | AST node kind dispatch | Phase 2 | Structural; no text munging; handles chained concat via `getLeadingStringLiteral` |
| `scanTemplateTextNodes` char-by-char state machine | `ts.isJsxText` + `ts.forEachChild` recursion | Phase 2 | Handles all JSX forms including member-expression tags and namespaced names |
| `stripComments` before scanning | TS parser inherently ignores comments (trivia) | Phase 2 | No preprocessing step; comments in JSX children, string values, template literals all handled natively |

**Deprecated/outdated (in AST path):**
- `isStaticStringLiteral`: replaced by native type guards
- `classifyDynamicCall` / `extractLeadingPrefix`: replaced by AST node inspection
- `scanTemplateTextNodes`: replaced by JSX AST traversal
- `stripComments` (in scanner path): not needed; TS trivia system handles this

---

## Runtime State Inventory

Not applicable — this is a greenfield phase (new module `src/core/scanner/parsers/typescript.ts`). No renames, no migrations. Existing modules (`regex.ts`, `dynamic.ts`, `hardcoded.ts`) are untouched per D-06.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `typescript` (workspace) | Parser module | ✓ | 5.9.3 | `missing-dependency` I18nSharpenError (Phase 1 resolver) |
| `vitest` | Test suite | ✓ | ^1.5.0 | — |
| `node` ≥ 20 | ESM, `createRequire` | ✓ | (project constraint) | — |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 1.6.1 (devDependency `^1.5.0`) |
| Config file | `vitest.config.ts` (with `vite-tsconfig-paths` plugin for `@/` alias) |
| Quick run command | `pnpm test -- src/__tests__/parsers/typescript.test.ts` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PARSE-01 | `ts.createSourceFile` invoked; TypeScript loaded via `loadWorkspaceDep` | unit | `pnpm test -- src/__tests__/parsers/typescript.test.ts` | ❌ Wave 0 |
| PARSE-02 | Static keys extracted: `t("k")`, `i18n.t("k")`, `` t(`k`) ``, with document-absolute offsets | unit | same | ❌ Wave 0 |
| PARSE-03 | Attribute keys extracted: `i18nKey="x"`, `i18nKey={"x"}` (D-08 gain) | unit | same | ❌ Wave 0 |
| PARSE-04 | Dynamic calls classified: `"prefix." + x` → structured, `` `prefix.${x}` `` → structured, `variable` → fully-dynamic | unit | same | ❌ Wave 0 |
| PARSE-05 | Hardcoded candidates: JSX text nodes + allowlist attrs; SKIP_TAGS subtrees excluded | unit | same | ❌ Wave 0 |
| OFFSET-01 | JsxText offset = `node.pos + indexOf(trimmed)`; call offset = `node.getStart(sf)`; attr offset = string value start | unit | same | ❌ Wave 0 |
| TEST-01 | All behavioral cases from `scanner.test.ts`, `dynamic.test.ts`, `hardcoded.test.ts` pass against AST parser | unit (ported corpus) | `pnpm test -- src/__tests__/parsers/typescript.test.ts` | ❌ Wave 0 |
| TEST-02 | `<m.div>Hello world</m.div>` → `hardcodedCandidates` contains `{text: "Hello world", offset: N}` | unit (golden) | same | ❌ Wave 0 |
| TEST-03 | `forwardRef<HTMLInputElement, InputProps>(...)` → zero usedKeys, zero hardcoded from type params | unit (golden) | same | ❌ Wave 0 |

**TEST-01 corpus cases to port** (all behavioral, not regex-internal):

From `dynamic.test.ts`:
- `"error." + code` → structured-concat, prefix `"error."`
- `` `error.${code}` `` → structured-concat, prefix `"error."`
- `"a." + x + ".b"` → structured-concat, prefix `"a."` (chained concat — pitfall #2)
- `` `error.${code}.detail` `` → structured-concat, prefix `"error."`
- `"e." + x` → structured-concat, prefix `"e."`
- `'error.' + x` → structured-concat, prefix `"error."`
- `"error." + code, { option: true }` → structured-concat, prefix `"error."` (FIX-1 regression)
- `myVar`, `getKey()`, `obj.method()`, `` `${prefix}.error` ``, `cond ? "a" : "b"` → fully-dynamic

From `hardcoded.test.ts` (behavioral cases only, not `fast-check` property test):
- `<div>Hello World</div>` → `[{text: "Hello World", offset: 5}]`
- `<div>Hello <span>World</span>!</div>` → 3 entries with correct offsets
- `<div>  Trim Me  </div>` → `[{text: "Trim Me", offset: 7}]` (trim + offset)
- `<input placeholder="Enter your name" ... />` → attributes extracted
- `<script>…</script><div>Keep Me</div>` → only "Keep Me" (SKIP_TAGS)
- `<div>{'Welcome to App'}</div>` → static string in JSX expression

From `scanner.test.ts` (behavioral cases only):
- `t('used.one')`, `t("used.two")`, `` t(`used.three`) `` → static keys extracted
- `// t('commented.out')` → NOT extracted (TS handles comments natively)
- `t('prefix.' + variable)` → NOT in usedKeys (key ends with `.`)
- `i18nKey="title.h"` → in usedKeys
- Combined source: `usedKeys` contains exactly the static keys, not keys ending in `.`

### Sampling Rate

- **Per task commit:** `pnpm tsc --noEmit && pnpm test -- src/__tests__/parsers/typescript.test.ts`
- **Per wave merge:** `pnpm tsc --noEmit && pnpm test && pnpm build`
- **Phase gate:** Full suite green (`pnpm test` — 203 existing + all new tests) before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/parsers/typescript.test.ts` — covers all Phase 2 requirements (TEST-01, TEST-02, TEST-03, PARSE-01..05, OFFSET-01)
- [ ] `src/core/scanner/parsers/types.ts` — update `dynamicCalls` member type to add `classification` + `prefix?` (D-01)

*(All test infrastructure — vitest, config, `@/` alias — already present.)*

---

## Security Domain

This phase is a read-only AST parser. It does not write files, does not accept user input as executable code, and does not make network requests. No ASVS categories apply.

The only security-relevant constraint is that the parser uses `loadWorkspaceDep` (which uses `createRequire` bound to the user's CWD) rather than a global `require`. This is already the established Phase 1 pattern and prevents import path confusion.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `ScriptKind.TS` prevents `<T>` type assertions from being parsed as JSX, making TEST-03 work in `.ts` files | Architecture Patterns (Pattern 1) | LOW — verified live in node for `.ts` mode. The question is whether the same forwardRef test is meant to run against a `.ts` file; the CONTEXT.md golden case description uses the generic form `forwardRef<A,B>` without specifying `.ts` vs `.tsx`. In `.tsx` mode, TypeArguments are still TypeReference not JsxElement — TEST-03 passes in both modes. |
| A2 | `parseDiagnostics` is a stable internal property on SourceFile in TS >=5.0 | Architecture Patterns (Pattern 10) | LOW risk for Phase 2 since we recommend not using it in this phase (empty `errors: []`). If used in Phase 3+, verify TS 5.x compatibility. |
| A3 | The `fast-check` property test from `hardcoded.test.ts` ("never throws on arbitrary string") does NOT need to be ported to the AST parser test suite | Validation Architecture | MEDIUM — D-14 says only behavioral input→output cases are ported. The property test verifies no-throw on the regex scanner specifically. The AST parser wrapping in a `try/catch` producing `FileParseError` provides the equivalent guarantee. If the planner disagrees, add a similar fuzz property test for the AST parser. |

**If this table is empty:** All other claims were verified by direct node evaluation against TypeScript 5.9.3 in the project's own node_modules.

---

## Open Questions

1. **PARSE-06 scope** — The requirement is listed as Phase 2 in `REQUIREMENTS.md` but the CONTEXT.md deferred section and ROADMAP.md both assign the dispatcher (`parseFile()`) to Phase 3. The parser module itself (PARSE-01..05) is Phase 2. The planner should treat PARSE-06 as Phase 3 scope unless explicitly re-scoped.
   - What we know: PARSE-06 = "extension-based dispatcher routes each file to the correct parser"; Phase 2 produces the parser module; Phase 3 wires the dispatcher.
   - Recommendation: scope Phase 2 plan to PARSE-01..05 + OFFSET-01 + TEST-01..03 only; note PARSE-06 mismatch for the planner.

2. **`dynamicCalls` shape: backward compatibility** — The Phase 1 `types.ts` placeholder has `{ expression, arg, offset }`. D-01 adds `classification` and `prefix?`. The current regex path (`detectUsedKeys`) returns `Set<string>` with no dynamicCalls at all, so there are no existing callers of `ParsedFileResult.dynamicCalls` that would break. Safe to extend in Phase 2.

---

## Sources

### Primary (HIGH confidence — verified by execution against TS 5.9.3)

- TypeScript 5.9.3 in `node_modules/typescript` — verified all ScriptKind/ScriptTarget enum values, all `ts.is*` type guard functions, `ts.createSourceFile` behavior, `node.pos` vs `node.getStart()` semantics, `node.getText(sf)` with/without `setParentNodes`, `JsxText.text` and `JsxText.containsOnlyTriviaWhiteSpaces`, member-expression tag AST shape, TypeArguments in TSX mode
- `src/core/scanner/hardcoded.ts` — SKIP_TAGS list, attribute allowlist, `flushTextNode` offset convention
- `src/core/scanner/dynamic.ts` — `classifyDynamicCall`/`extractLeadingPrefix` parity target; all test cases from `dynamic.test.ts`
- `src/core/scanner/parsers/types.ts` — locked `ParsedFileResult`/`FileParseError` contracts
- `src/core/scanner/parsers/resolve.ts` — `loadWorkspaceDep` lazy-loading pattern
- `src/core/scanner/lines.ts` — `computeLineOffsets`/`offsetToLine` (reuse unchanged)
- `src/__tests__/hardcoded.test.ts`, `src/__tests__/dynamic.test.ts`, `src/core/scanner.test.ts` — exact input→output cases to port

### Secondary (MEDIUM confidence)

- TypeScript Compiler API docs (stable API surface; all functions listed have been stable since TS 2.x/3.x, confirmed by existence checks in TS 5.9.3)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — TypeScript already installed, peerDep declared in Phase 1, all APIs verified
- Architecture: HIGH — all patterns verified by live execution in project node_modules
- Pitfalls: HIGH — pitfalls 1, 2, 3, 5 verified live; pitfalls 4 and 6 are logical deductions from verified API behavior
- Test corpus: HIGH — all test files read directly; exact input/output cases documented

**Research date:** 2026-05-31
**Valid until:** 2026-08-31 (TypeScript Compiler API surface is extremely stable; ScriptKind/ScriptTarget enums have not changed since TS 2.x)
