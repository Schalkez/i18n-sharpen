# Phase 2: JS/TS Parser Core + Golden Cases - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning

<domain>
## Phase Boundary

A single **TypeScript Compiler API** traversal (`ts.createSourceFile`, parser-only — no `Program`/type-checker), over `.ts/.tsx/.js/.jsx`, that extracts in **one pass**:

1. **Static used keys** — `t("k")` calls matching `matchFunctions` (PARSE-02)
2. **Configured-attribute keys** — `i18nKey="..."` matching `matchAttributes` (PARSE-03)
3. **Dynamic-call candidates** — non-static `t(...)` args, classified (PARSE-04)
4. **Hardcoded-text candidates** — JSX text + an attribute allowlist (PARSE-05)

…returned as the locked `ParsedFileResult` with **document-absolute offsets** (OFFSET-01, PARSE-06), plus the two golden edge-case tests (TEST-02 `<m.div>`, TEST-03 `forwardRef<A,B>`) and the ported v0.3.0 behavioral corpus (TEST-01).

The TypeScript module is **resolved from the user's workspace** (via the Phase 1 resolver), never bundled.

**Out of this phase:** framework compilers + the extension dispatcher `parseFile()` (Phase 3); the async migration / bounded-concurrency pool / `useAst` flag (Phase 4); shadow comparison + perf gate + default flip (Phase 5); deletion of the regex modules + helper relocation (Phase 6). The regex engine **remains the default** throughout this phase — the AST parser must merely *exist and pass ported tests*, not drive any command.

</domain>

<decisions>
## Implementation Decisions

### Dynamic-call shape & classification (PARSE-04)
- **D-01:** Each `dynamicCalls` entry is enriched beyond the Phase-1 placeholder shape to `{ expression, arg, offset, classification: "fully-dynamic" | "structured-concat", prefix?: string }`. This refines the member shape D-07 explicitly deferred from Phase 1; the top-level `ParsedFileResult` contract is otherwise unchanged.
- **D-02:** Classification is derived **structurally from the AST node kind**, NOT by re-parsing printed text:
  - `BinaryExpression` with `+` and a leading `StringLiteral` operand → `structured-concat` (prefix = the literal's value).
  - `TemplateExpression` with a non-empty static head (no leading interpolation) → `structured-concat` (prefix = the head text).
  - `Identifier`, `CallExpression`, `PropertyAccessExpression`, `ConditionalExpression`, or a template with leading interpolation → `fully-dynamic`.
  - This must reach **behavioral parity** with v0.3.0's `classifyDynamicCall`/`extractLeadingPrefix` output (see `dynamic.test.ts` cases) — same prefixes, same fully-dynamic vs structured-concat verdicts — but obtained from the tree, not from string munging.
- **D-03:** `arg` carries the printed source text of the first argument (for reporting/diagnostics); `expression` carries the printed callee/call as today's reporting expects. Exact printed-text source (`node.getText()` vs manual slice) is Claude's discretion as long as parity holds.

### Helper reuse strategy (Phase 2 is additive — regex still default)
- **D-04:** **Subsume detection in the parser; touch nothing.** The AST parser reimplements detection internally using native TS APIs (`ts.isStringLiteral`/`ts.isNoSubstitutionTemplateLiteral` replace `isStaticStringLiteral`; comments are ignored natively so `stripComments` is not used in the parse path; structural classification per D-02 replaces `classifyDynamicCall`).
- **D-05:** The parser imports **only the still-needed pure helpers**: `offsetToLine`/`computeLineOffsets` from `src/core/scanner/lines.ts` (reused unchanged, OFFSET-02) and `isHardcodedIgnored` from its current home in `src/core/scanner/hardcoded.ts` (used by the *caller*, not necessarily the parser — see D-10).
- **D-06:** `regex.ts`, `dynamic.ts`, and `text.ts` are left **physically untouched** — they remain live for the still-default regex path. No relocation, no shared-util extraction in this phase. All deletion/relocation (incl. moving `isHardcodedIgnored` → `text.ts`) is deferred to Phase 6, preserving its existing pre-condition note. **Zero regression risk to the default path** is the priority.

### Config matching semantics on the AST (parity floor for the Phase 5 shadow gate)
- **D-07:** **matchFunctions callee matching — bare = last-segment, dotted = full-path.** A config entry with **no dot** (e.g. `"t"`, `"$t"`) matches any call whose **rightmost callee identifier** equals it — so both `t("k")` and `i18n.t("k")` match (mirrors the regex `\b(?:fn)\s*\(` floor). A config entry **with a dot** (e.g. `"i18n.t"`) matches the **full `PropertyAccessExpression` path** exactly. This guarantees the AST finds at least everything the regex found (zero false-negatives) while honoring explicit namespaced config.
- **D-08:** **matchAttributes value forms — literal AND expression-container string literals.** Extract both `i18nKey="x"` / `'x'` / `` `x` `` (JSXAttribute → string-literal initializer) **and** `i18nKey={"x"}` / `{`x`}` (JSXExpressionContainer wrapping a static string literal). The container form is a deliberate **AST-only gain** over the regex (which only matched quoted literals) — it must be **documented as a gain** in the Phase 5 corpus diff, and is never a false-negative.
- **D-09:** Attribute **name** matching stays an **exact** match against `matchAttributes` entries. Keys ending in `.` continue to be excluded from `usedKeys` (the dynamic-prefix guard, preserved from `detectUsedKeys`).

### Hardcoded-candidate filter boundary (PARSE-05)
- **D-10:** **Parser does structural; caller does quality.** The parser emits **raw, structurally-valid** candidates only:
  - JSX text nodes → trimmed text with a **document-absolute offset pointing at the trimmed start** (parity with `flushTextNode`'s `startOffset + indexOf(trimmed)`).
  - String-literal values of attributes in the **allowlist** `placeholder | title | alt | aria-label | label`.
  - **Skip** text inside `SKIP_TAGS` (`script, style, code, pre, svg, path, noscript, iframe`; `svelte:head` is framework-specific → Phase 3). On the AST these are `JSXElement`s whose tag name matches.
- **D-11:** The parser applies **no text-quality filtering** — `isHardcodedIgnored` (punctuation-only / numbers-only / HTML-entity / config custom-ignore globs) stays in the **caller** (the `validate --check-hardcoded` consumer), exactly as today. The parser receives `matchFunctions`/`matchAttributes` but is kept free of `validate`-command config like custom-ignore patterns.

### Golden cases (the rewrite's motivating bugs)
- **D-12:** **TEST-02** — `<m.div>Hello world</m.div>` / `<motion.div>…`: a JSX tag name that is a `PropertyAccessExpression` (member-expression tag) must NOT break text collection; `"Hello world"` appears in `hardcodedCandidates`. (Native AST handles member-expression tags; this is verifying the traversal doesn't special-case identifier-only tags.)
- **D-13:** **TEST-03** — `forwardRef<HTMLInputElement, InputProps>(...)`: the generic **type arguments** must never be misread as JSX (the exact bug the regex scanner had). No spurious `usedKeys` or `hardcodedCandidates` from the type params; `hardcodedCandidates` contains only `placeholder` attribute values from inside the returned JSX. (Native AST distinguishes `TypeArguments` from JSX — this verifies it.)

### Test porting (TEST-01)
- **D-14:** Behavioral input→output cases from `scanner.test.ts`, `dynamic.test.ts`, and `hardcoded.test.ts` are **ported** onto the AST parser as parser-level tests (source string → `ParsedFileResult`). Only **regex-internal** unit tests (e.g. `buildKeyRegex`/`buildAttrRegex` shape tests, `stripComments` edge cases) are NOT ported — those modules still exist and keep their own tests until Phase 6. The behavioral *contract* (which keys/dynamic-calls/hardcoded-candidates a given source yields) must match.

### Claude's Discretion
- Parser module name/location under `src/core/scanner/parsers/` (e.g. `typescript.ts` / `ts.ts`) and internal traversal structure (single `forEachChild` recursion vs visitor map).
- Exact printed-text mechanism for `arg`/`expression` (`node.getText(sourceFile)` vs manual source slice) — provided D-02/D-03 parity holds.
- `ts.createSourceFile` invocation details: `ScriptTarget`, `setParentNodes`, and `ScriptKind` selection per extension (`.tsx`/`.jsx` → JSX-enabled; `.ts`/`.js` → JSX-disabled so `<T>` casts/generics parse correctly — relevant to TEST-03).
- Test file layout/naming for the ported corpus and golden cases (inline source strings vs fixture files).
- How collected `FileParseError`s are surfaced from this parser (the *mechanism* of collect-and-continue is wired more fully in later phases; Phase 1's `FileParseError` type is the carrier).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external `docs/` ADRs or design specs exist in this repo — requirements and decisions live entirely in `.planning/` and the source tree.

### Requirements & success criteria
- `.planning/REQUIREMENTS.md` — definitions for **PARSE-01..06, OFFSET-01, TEST-01, TEST-02, TEST-03** (this phase's reqs); the Out-of-Scope table (no `ts.createProgram`/type-checker; no auto-fix; detection stays config-driven).
- `.planning/ROADMAP.md` §"Phase 2: JS/TS Parser Core + Golden Cases" — the **5 success criteria** this phase is verified against (parser-only TS API; single-traversal `ParsedFileResult`; `<m.div>` text; `forwardRef<A,B>` no-spurious; ported behavioral cases pass).

### Locked contracts (Phase 1 — build to these)
- `src/core/scanner/parsers/types.ts` — the **`ParsedFileResult`** output contract (top-level shape locked; D-01 refines `dynamicCalls` member fields) and the **`FileParseError`** carrier (plain data, never thrown).
- `.planning/phases/01-foundation-error-model/01-CONTEXT.md` — Phase 1 decisions: `missing-dependency` fatal error kind, 0/1/2 exit codes, lazy parser loading (PERF-02), `D-07`/`D-08` contract-placement rationale.
- `.planning/phases/01-foundation-error-model/01-01-SUMMARY.md` — exact shipped contracts + the workspace resolver (`loadWorkspaceDep`/`detectPackageManager` in `src/core/scanner/parsers/resolve.ts`) the parser uses to obtain `typescript`.

### Project decisions & constraints
- `.planning/PROJECT.md` §Constraints + §Key Decisions — **TypeScript Compiler API as optional peer dep (not Babel)** ratified; framework-agnostic config-driven detection (`matchFunctions`/`matchAttributes`, no hardcoded i18n-function names); tiny-dependency-tree; Node ≥ 20 / ESM; strict ESLint quality gate.

### Behavioral source-of-truth to port (TEST-01) — read for the exact contract, do NOT modify
- `src/core/scanner/scanner.test.ts` — `detectUsedKeys` behavior (keys-ending-in-`.` excluded; comments ignored; static literal forms).
- `src/__tests__/dynamic.test.ts` — `classifyDynamicCall`/`extractLeadingPrefix` expected prefixes & fully-dynamic verdicts (the parity target for D-02).
- `src/__tests__/hardcoded.test.ts` — hardcoded-candidate expectations (the parity target for D-10/D-11).
- `src/core/scanner/hardcoded.ts` — `SKIP_TAGS`, attribute allowlist, `flushTextNode` offset semantics, and `isHardcodedIgnored` (the structural + quality behavior to match/preserve).
- `src/core/scanner/index.ts` — current synchronous `detectUsedKeys` signature/behavior the AST parser is the eventual engine behind.
- `src/core/scanner/lines.ts` — `computeLineOffsets`/`offsetToLine` (reuse unchanged, OFFSET-02).

### Implementation seed (PARTIALLY SUPERSEDED — read with care)
- `.planning/v0.4.0-SEED-PLAN.md` §"Phase 2: AST Parsers" — confirms the **single-traversal, three-extraction** design (used keys + dynamic calls + hardcoded candidates in one pass) and the attribute allowlist. **WARNING:** all `@babel/parser`/`@babel/traverse` specifics and `errorRecovery: true` are **SUPERSEDED** by the TypeScript Compiler API decision; use only the single-traversal *shape* and the three-bucket extraction concept.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/core/scanner/lines.ts`** — `computeLineOffsets()` + `offsetToLine()` (O(log n)). Reused unchanged (OFFSET-02); document-absolute offsets in `ParsedFileResult` feed straight in.
- **`src/core/scanner/parsers/resolve.ts`** (Phase 1) — `loadWorkspaceDep("typescript", …)` resolves the TS compiler from the user's workspace; emits the fatal `missing-dependency` `I18nSharpenError` with a PM-correct install command when absent. The parser calls this (lazily — PERF-02) instead of a static `import`.
- **`src/core/scanner/parsers/types.ts`** (Phase 1) — `ParsedFileResult` + `FileParseError`, the build target.
- **`src/core/scanner/hardcoded.ts`** — `SKIP_TAGS`, the `placeholder|label|title|alt|aria-label` allowlist, `flushTextNode` offset convention (trimmed-start), and `isHardcodedIgnored` (kept in the caller, D-11). The **behavioral parity target** for D-10/D-11 — left untouched (D-06).
- **`src/core/scanner/dynamic.ts`** — `classifyDynamicCall`/`extractLeadingPrefix`: the **parity target** for D-02's structural classifier. Left untouched (D-06).

### Established Patterns
- **Single-pass extraction** — the seed and PARSE-02..05 mandate one traversal producing all three buckets; do not multi-pass.
- **Keys ending in `.` excluded** from `usedKeys` (dynamic-prefix guard) — preserve from `detectUsedKeys`.
- **`process.exitCode`, never `process.exit()`**; only `I18nSharpenError` is ever thrown; collected file errors use `FileParseError` (never thrown).
- **Quality gate:** ESM, Node ≥ 20, `tsup`, strict ESLint (`no-explicit-any: error`, `consistent-type-imports: error`); every commit passes `pnpm tsc --noEmit && pnpm test && pnpm build`. `@/` path alias in use.

### Integration Points
- **New parser module** under `src/core/scanner/parsers/` — imports `resolve.ts` (load TS), `lines.ts` (offsets), produces `ParsedFileResult`.
- **`detectUsedKeys`** (`src/core/scanner/index.ts`) is NOT rewired in this phase — it stays synchronous/regex (Phase 4 does the async swap). The parser is built and tested standalone here.
- **`typescript` peer dep** — already declared optional in `package.json` (Phase 1); no `package.json` change expected this phase.

</code_context>

<specifics>
## Specific Ideas

- The two golden cases are the **named motivation** for the whole milestone: `<m.div>`/`<motion.div>` dot-notation tags (regex dropped the inner text) and `forwardRef<A,B>` generics (regex misread `<…>` as JSX). They are not just tests — they are the proof the engine swap was worth it. `ts.createSourceFile` with the correct `ScriptKind` per extension is what makes TEST-03 pass natively.
- **Parity is the contract, not the implementation** — ported tests assert the same *input→output* (keys, classifications, prefixes, candidates), obtained structurally. AST-only gains (e.g. D-08 container literals) are allowed and must be logged as gains for the Phase 5 diff, never silently.

</specifics>

<deferred>
## Deferred Ideas

- **Relocating `isHardcodedIgnored` → `text.ts`** and deleting `regex.ts`/`dynamic.ts`/`hardcoded.ts`/the `scanner.ts` shim — Phase 6 (CLEAN-01). Explicitly NOT done here (D-06).
- **Wiring the parser as the engine behind `detectUsedKeys`** (async signature, bounded-concurrency pool, `useAst` flag) — Phase 4.
- **Framework `<script>`-block delegation, dispatcher, `svelte:head` skip** — Phase 3.

*(No reviewed-but-deferred todos — `todo match-phase 2` returned none. No scope creep raised during discussion.)*

</deferred>

---

*Phase: 02-js-ts-parser-core-golden-cases*
*Context gathered: 2026-05-31*
