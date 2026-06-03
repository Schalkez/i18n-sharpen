# Phase 6: Cleanup & Release — Research

**Researched:** 2026-06-03
**Domain:** Code deletion + release mechanics (TypeScript/ESM codebase, vitest, tsup)
**Confidence:** HIGH — all findings verified by direct file reads of the actual source tree

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Prep + tag, do NOT publish. Bump `package.json` to 0.4.0, write BREAKING CHANGELOG, commit, create annotated git tag `v0.4.0`. Stop short of `npm publish`.
- **D-02:** Version is 0.4.0.
- **D-03:** CHANGELOG BREAKING section documents: (1) async public API — `validate`/`extract`/`prune` now return `Promise`; (2) new optional peer deps with per-framework install instructions; (3) regex→AST engine change.
- **D-04:** Delete `scripts/shadow-compare.ts` and the `shadow` package script.
- **D-05:** Repurpose `scripts/bench.ts` to AST-only absolute timing (strip the live regex-delta half; keep warmup + median-of-N harness + 50-file slice). Keep the `bench` script.
- **D-06:** Repurposed bench is REPORT-ONLY in CI — exits 0 regardless of timing. Keep the `pnpm bench` step in CI.
- **D-07:** Full README update: (1) fix Programmatic API sync→async; (2) add "Migration to 0.4.0" section; (3) update install docs for optional peer deps.
- **D-08:** Surgical, verify-then-delete. Confirm behavioral assertions live in parser tests before dropping any test.
- **D-09:** Repoint surviving shared-function tests — don't delete them. `isHardcodedIgnored` moves to `text.ts`; shared utilities retested from new import paths.
- **D-10:** De-flag `ast-shadow.test.ts` `useAst: true` calls; keep all tests.
- **Carry-forward:** `isHardcodedIgnored` must move to `text.ts` BEFORE `hardcoded.ts` is deleted.
- **Carry-forward:** `fileContents` must remain in `detectUsedKeys` return for `looseKeyMatch`.

### Claude's Discretion

- CHANGELOG migration-snippet depth and exact wording.
- Commit ordering and atomicity of deletions.
- Repurposed bench's exact implementation (warmup count, N, output format) — dependency-free, report-only.
- The precise per-file/per-function test disposition — mapped during research (this document).
- Whether `escapeRegex` removal needs a consumer grep first — recommended and done below.
- Whether `utils.ts` survives if it only re-exported regex helpers — researched below.

### Deferred Ideas (OUT OF SCOPE)

- `npm publish` / GitHub release automation.
- `--strict-syntax` (STRICT-01).
- Optional parse cache (CACHE-01).
- Bundled slim-Babel fallback (DEPFALL-01).
- Larger shadow corpus / public `maxConcurrency` / engine config.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CLEAN-01 | Delete `regex.ts`/`dynamic.ts`/`hardcoded.ts`/`scanner.ts` shim; move `isHardcodedIgnored`→`text.ts` first; drop `escapeRegex` re-export from `utils.ts`; remove `useAst` flag from `detectUsedKeys` and its four consumers | Blast radius fully mapped below; `isHardcodedIgnored` move verified safe; `utils.ts` survival analysis done; all import sites enumerated |
| CLEAN-02 | BREAKING CHANGELOG: async API, new optional peer deps + per-framework install instructions, regex→AST engine change | CHANGELOG format verified; existing peer deps confirmed; README sync-API snippet identified at line 206 |
</phase_requirements>

---

## Summary

Phase 6 is a pure deletion + release phase. The AST engine is the default; the regex engine exists only as dead code. All decisions are locked. The single highest-risk work item is the surgical test cleanup: getting the test-disposition map wrong means silently losing behavioral coverage or leaving tests that reference deleted modules.

The key structural discovery is that `validate.ts` imports seven symbols from `@/core/scanner` that are only used inside the `if (!useAst)` branch — `buildKeyRegex`, `buildAttrRegex`, `buildDynamicCallRegex`, `isStaticStringLiteral`, `classifyDynamicCall`, `scanTemplateTextNodes` — and one symbol (`isHardcodedIgnored`) that is used in BOTH branches (line 285 in the regex branch, line 314 in the AST branch). The implication: `isHardcodedIgnored` must be moved to `text.ts` first and the import in `validate.ts` updated before any regex files are deleted, or the typecheck will fail.

The `utils.ts` file is NOT solely an `escapeRegex` re-exporter: it also re-exports six other scanner primitives (`getFiles`, `stripComments`, `isStaticStringLiteral`, `getBaseKey`, `isKeyUsed`, `matchWildcard`) plus seven `locale-io` primitives plus the full `log` helper object. It must survive, but the `escapeRegex` re-export line must be removed (along with `isStaticStringLiteral` if that is no longer exported from `@/core/scanner` — see discussion below).

**Primary recommendation:** Move `isHardcodedIgnored` → `text.ts` and update all import sites as the first isolated commit. Then delete the regex-branch dead code from `validate.ts` + the four modules (`regex.ts`, `dynamic.ts`, `hardcoded.ts`, `scanner.ts` shim). Then handle tests. Then bench repurpose. Then release artifacts.

---

## Standard Stack

This phase introduces no new libraries. The existing toolchain governs all work.

| Tool | Version | Purpose |
|------|---------|---------|
| vitest | ^1.5.0 | Test runner — `pnpm test` |
| tsup | ^8.0.2 | Build — `pnpm build` |
| tsx | ^4.22.4 | Run scripts — `pnpm bench`, `pnpm shadow` |
| tsc | ^5.9.3 (dev) | Typecheck gate — `pnpm tsc --noEmit` |

**Quality gate (every commit):** `pnpm tsc --noEmit && pnpm test && pnpm build`

The typecheck gate also covers `scripts/` via `tsconfig.scripts.json`:
```bash
pnpm typecheck  # runs: tsc --noEmit && tsc -p tsconfig.scripts.json --noEmit
```

[VERIFIED: `package.json` scripts field, direct file read]

---

## Architecture Patterns

### Commit Ordering (Safety Spine)

The correct commit order is determined by which deletions make the typecheck fail if done out of sequence:

```
Commit 1: Move isHardcodedIgnored to text.ts + repoint all import sites
  - text.ts gains isHardcodedIgnored (copy from hardcoded.ts)
  - validate.ts: update import from "@/core/scanner" to "@/core/scanner/text"
                 (or keep importing from "@/core/scanner" — index.ts re-exports text.ts contents)
  - hardcoded.test.ts: repoint isHardcodedIgnored import to "@/core/scanner/text"
  - Gate: pnpm tsc --noEmit && pnpm test && pnpm build

Commit 2: Delete regex-path dead code from validate.ts + strip useAst flag from all four consumers
  - Remove if (!useAst) branch from validate.ts (lines 141-200)
  - Remove unused imports: buildKeyRegex, buildAttrRegex, buildDynamicCallRegex,
    isStaticStringLiteral, classifyDynamicCall, scanTemplateTextNodes from validate.ts
  - extract.ts: remove useAst: options?.useAst ?? true -> remove the options.useAst access;
    the detectUsedKeys call passes no useAst (or drops the option entirely)
  - prune.ts: same pattern
  - scanner/index.ts: remove useAst parameter from detectUsedKeys signature + remove the if/else branch;
    keep the AST path; keep fileContents in the return
  - Gate: pnpm tsc --noEmit && pnpm test && pnpm build

Commit 3: Delete regex.ts, dynamic.ts, hardcoded.ts, scanner.ts shim + bulk-update tests
  - Delete src/core/scanner/regex.ts
  - Delete src/core/scanner/dynamic.ts
  - Delete src/core/scanner/hardcoded.ts
  - Delete src/core/scanner.ts (the shim)
  - Remove escapeRegex + isStaticStringLiteral from utils.ts re-exports (they are gone)
  - Remove export * from "./regex", "./dynamic", "./hardcoded" from scanner/index.ts
  - Drop regex-internal tests from scanner.test.ts (see test-disposition map)
  - Delete dynamic.test.ts
  - Drop scanTemplateTextNodes describe block from hardcoded.test.ts
  - Repoint isHardcodedIgnored import in hardcoded.test.ts -> "@/core/scanner/text"
  - Gate: pnpm tsc --noEmit && pnpm test && pnpm build

Commit 4: De-flag ast-shadow.test.ts (remove useAst: true from all calls)
  - Gate: pnpm tsc --noEmit && pnpm test && pnpm build

Commit 5: Repurpose scripts/bench.ts to AST-only; delete scripts/shadow-compare.ts
  - Remove shadow script from package.json
  - Update CI bench step to remove hard-threshold exit (see bench repurpose below)
  - Gate: pnpm typecheck && pnpm test && pnpm build

Commit 6: Release artifacts — README, CHANGELOG, version bump
  - README: sync→async Programmatic API examples
  - README: add "Migration to 0.4.0" section after "Migration from 0.0.x/0.1.x"
  - README: add optional peer deps to Installation section
  - CHANGELOG: add [0.4.0] BREAKING section
  - package.json: "version": "0.3.0" -> "0.4.0"
  - Gate: pnpm tsc --noEmit && pnpm test && pnpm build

Commit 7 (final, isolated): git tag v0.4.0
```

[ASSUMED] — The commit ordering above is this researcher's recommendation based on the dependency graph. The planner may split or merge commits.

---

## Test-Disposition Map

This is the highest-value deliverable. Every test in the four slated-to-change test files is classified as DROP, REPOINT, DEFLAG, or KEEP.

### File 1: `src/core/scanner.test.ts`

Import: `from "./scanner"` (the shim at `src/core/scanner.ts`). After the shim is deleted, this import path breaks. The surviving tests must be repointed to concrete module paths.

| describe | it | Function Tested | Disposition | Evidence / New Import |
|----------|----|-----------------|-------------|----------------------|
| `scanner: stripComments edge cases` | preserves // inside a double-quoted URL | `stripComments` | **REPOINT** | `stripComments` lives in `text.ts` (exported); still used by `fileContents` path. New import: `@/core/scanner/text`. Coverage also exists in `core.test.ts` describe "core: stripComments" but tests different inputs — keep this describe block too. |
| `scanner: stripComments edge cases` | preserves // inside a template literal | `stripComments` | **REPOINT** | same |
| `scanner: stripComments edge cases` | does not let */ inside a string terminate a block comment | `stripComments` | **REPOINT** | same |
| `scanner: stripComments edge cases` | preserves escaped quotes inside strings | `stripComments` | **REPOINT** | same |
| `scanner: stripComments edge cases` | handles template literal interpolation containing comments | `stripComments` | **REPOINT** | same |
| `scanner: isStaticStringLiteral` | (all 9 its) | `isStaticStringLiteral` | **DROP** | `isStaticStringLiteral` is only used in the regex branch (`validate.ts` line 168, inside `if (!useAst)`). After the regex branch is deleted, `isStaticStringLiteral` has no production caller. The AST parser does not call it — the TS Compiler API handles static-vs-dynamic classification natively in the visitor. Coverage gap check: `typescript.test.ts` describe "static keys (PARSE-02 parity)" covers the behavioral outcome (static keys extracted, dynamic keys classified). `isStaticStringLiteral` as a standalone utility has no surviving caller. **DROP all 9 its.** |
| `scanner: getBaseKey + isKeyUsed` | strips the matching plural suffix | `getBaseKey` | **REPOINT** | `getBaseKey` lives in `text.ts`. Used by `validate/checks.ts` and `validate/output.ts` (imports from `@/core/scanner`). New import for this test: `@/core/scanner/text`. |
| `scanner: getBaseKey + isKeyUsed` | returns key unchanged when no suffix matches | `getBaseKey` | **REPOINT** | same |
| `scanner: getBaseKey + isKeyUsed` | isKeyUsed treats plural variants of a used base as used | `isKeyUsed` | **REPOINT** | `isKeyUsed` lives in `text.ts`. Used by `prune/plans.ts`, `validate/checks.ts`. New import: `@/core/scanner/text`. |
| `scanner: getBaseKey + isKeyUsed` | isKeyUsed honors ignoreKeys wildcards | `isKeyUsed` | **REPOINT** | same |
| `scanner: matchWildcard` | matches literal ? as a character | `matchWildcard` | **REPOINT** | `matchWildcard` lives in `text.ts`. Used by `validate.ts` (AST branch line 215). Also tested in `core.test.ts` describe "core: matchWildcard". New import: `@/core/scanner/text`. May merge with `core.test.ts` to avoid redundancy, or keep separate. |
| `scanner: matchWildcard` | star is universal | `matchWildcard` | **REPOINT** | same |
| `scanner: regex builders` | buildKeyRegex matches the configured function name | `buildKeyRegex` | **DROP** | `buildKeyRegex` lives in `regex.ts` which is deleted. No surviving caller after regex branch removal. Behavioral outcome (key extraction) is covered by `typescript.test.ts` describe "static keys". **DROP.** |
| `scanner: regex builders` | buildAttrRegex matches the configured attributes | `buildAttrRegex` | **DROP** | same — `buildAttrRegex` lives in `regex.ts`. Behavioral outcome covered by `typescript.test.ts` "extracts attribute key from i18nKey". **DROP.** |
| `scanner: regex builders` | buildKeyRegex escapes regex-meta in function names | `buildKeyRegex` | **DROP** | same — no surviving caller. **DROP.** |
| `scanner: regex builders` | buildKeyRegex handles empty matchFunctions array | `buildKeyRegex` | **DROP** | same. **DROP.** |
| `scanner: regex builders` | buildAttrRegex handles empty matchAttributes array | `buildAttrRegex` | **DROP** | same. **DROP.** |
| `scanner: detectUsedKeys` | returns the set of statically-resolvable keys and ignores comments | `detectUsedKeys` | **KEEP** | `detectUsedKeys` remains in `scanner/index.ts` (the AST path is now the only path). This test already passes with `useAst: true` (AST is default, no `useAst` arg passed). No import change needed if the test file is renamed to import from `@/core/scanner/index` instead of the deleted shim. |
| `scanner: detectUsedKeys` | looseKeyMatch still finds a key present only in stripped content after async refactor | `detectUsedKeys` | **KEEP** | same — this is the ASYNC-03 regression test for `fileContents`. Critical to keep. |

**scanner.test.ts summary:**
- 5 its: REPOINT (`stripComments` describe — change import to `@/core/scanner/text`)
- 4 its: REPOINT (`getBaseKey`/`isKeyUsed` describe — same new import)
- 2 its: REPOINT (`matchWildcard` describe — same new import, or merge into `core.test.ts`)
- 9 its: DROP (`isStaticStringLiteral` describe — no surviving caller)
- 5 its: DROP (`regex builders` describe — module deleted)
- 2 its: KEEP (`detectUsedKeys` describe — update import from `./scanner` → `@/core/scanner/index`)

The file itself is not deleted — the surviving tests are repointed, the dead describes are removed, and the import is updated.

[VERIFIED: direct read of `src/core/scanner.test.ts`, `src/core/scanner/text.ts`, `src/core/scanner/regex.ts`]

---

### File 2: `src/__tests__/dynamic.test.ts`

Import: `from "@/core/scanner/dynamic"` — this module is deleted.

Functions tested: `classifyDynamicCall`, `extractLeadingPrefix`.

**Question:** Is `classifyDynamicCall`/`extractLeadingPrefix` called in any surviving production code?

Answer (verified by grep): NO. After the `if (!useAst)` branch is removed from `validate.ts`, `classifyDynamicCall` has zero surviving callers. `extractLeadingPrefix` is only called internally by `classifyDynamicCall`. Neither function is referenced anywhere in the AST parser path — the AST parser (TypeScript Compiler API visitor) performs its own dynamic classification natively.

**Coverage check for DROP:** The behavioral outcome of `classifyDynamicCall` — that `t("error." + code)` produces a structured-concat warning with prefix `"error."` — IS covered in:
- `src/__tests__/parsers/typescript.test.ts` describe `"dynamic classification (PARSE-04 parity)"`, it.each with all 7 structured-concat inputs + 5 fully-dynamic inputs. Exact behavioral cases are ported verbatim.
- `src/__tests__/ast-shadow.test.ts` Test D (fully-dynamic findings) and Test E (structured-concat + ignoreDynamicKeys suppression).

| describe | it | Disposition | Coverage Evidence |
|----------|----|-------------|-------------------|
| `classifyDynamicCall — fully-dynamic` | (5 it.each rows) | **DROP** | `typescript.test.ts` "dynamic classification (PARSE-04 parity)" — fully-dynamic it.each covers same 5 inputs |
| `classifyDynamicCall — structured-concat` | (7 it.each rows) | **DROP** | `typescript.test.ts` "dynamic classification (PARSE-04 parity)" — structured-concat it.each covers same 7 inputs |
| `extractLeadingPrefix — normalization` | strips quotes/backticks (3 rows) | **DROP** | Internal implementation detail of `classifyDynamicCall`; behavior tested end-to-end via the structured-concat classification cases. No direct equivalent needed. |
| `extractLeadingPrefix — normalization` | returns null when no leading static segment (2 rows) | **DROP** | Same — tested indirectly via fully-dynamic classification cases. |

**COVERAGE GAP CHECK:** None found. All behavioral assertions in `dynamic.test.ts` are covered by `typescript.test.ts` PARSE-04 parity tests.

**Disposition: DELETE `src/__tests__/dynamic.test.ts` entirely.** (No surviving tests; no repoints needed.)

[VERIFIED: direct read of both files; grep for `classifyDynamicCall` across all `src/`]

---

### File 3: `src/__tests__/hardcoded.test.ts`

Import: `from "@/core/scanner/hardcoded"` — this module is deleted AFTER `isHardcodedIgnored` is moved to `text.ts`.

Functions tested: `scanTemplateTextNodes`, `isHardcodedIgnored`.

**`scanTemplateTextNodes` analysis:** This function lives in `hardcoded.ts` and is only called inside the `if (!useAst)` branch of `validate.ts` (line 280). After that branch is removed, `scanTemplateTextNodes` has zero surviving production callers. The AST parser extracts hardcoded candidates natively via the TypeScript Compiler API traversal.

**Coverage check for `scanTemplateTextNodes` DROP:** The behavioral outcome of `scanTemplateTextNodes` — detecting text nodes, attribute values, JSX expression literals — IS covered in:
- `typescript.test.ts` describe `"hardcoded text candidates (PARSE-05 parity)"`: covers basic text node, multiple nodes with offsets, trim-with-correct-offset, JSX expression string literal, allowlisted attributes, non-allowlisted attribute exclusion.
- `typescript.test.ts` describe `"SKIP_TAGS (PARSE-05)"`: covers script/style/code/pre/svg/noscript/iframe exclusion.
- `typescript.test.ts` golden cases: `<m.div>` dot-notation (TEST-02), `forwardRef<A,B>` (TEST-03).

**COVERAGE GAPS in `scanTemplateTextNodes` DROP:**

| `hardcoded.test.ts` it | Covered in parser tests? | Gap? |
|------------------------|--------------------------|------|
| extracts basic text nodes between HTML tags | `typescript.test.ts` "extracts basic text node with offset" — YES | No gap |
| extracts multiple text nodes with correct offsets | `typescript.test.ts` "extracts multiple text nodes with offsets" — YES (Hello/World/! offsets) | No gap |
| handles whitespace and trims candidates while maintaining correct offset | `typescript.test.ts` "trims and keeps correct offset" — YES | No gap |
| extracts user-visible attributes (placeholder/label/title/alt/aria-label) | `typescript.test.ts` "extracts allowlisted attribute values" covers placeholder; other attrs covered via the attribute allowlist test | **PARTIAL GAP** — `hardcoded.test.ts` tests all 5 attrs in one test (placeholder + label + First Name + Avatar + Tooltip + Submit Form); `typescript.test.ts` only explicitly covers placeholder. The AST parser does extract all 5 attribute types (they share the same allowlist). This should be verified by adding a multi-attr test to `typescript.test.ts` before deleting. |
| ignores non-text attributes or dynamic expressions | `typescript.test.ts` "does NOT extract non-allowlisted attributes" — partial (type/name). Dynamic expression `placeholder={t("name")}` — NOT explicitly covered in parser tests. **COVERAGE GAP.** |
| extracts simple JSX/template string literals inside expressions | `typescript.test.ts` "extracts static string in JSX expression" — covers `{'Welcome to App'}`. Multi-expression `{ "Goodbye" }` and `` {`Hello`} `` — NOT explicitly tested. **PARTIAL GAP.** |
| handles braces inside string literals and comments in JSX expressions | Not explicitly covered in parser tests. **COVERAGE GAP.** |
| ignores dynamic or complex JSX expressions (t("key"), concatenation, ternary) | Not explicitly covered as a describe block. `typescript.test.ts` implicitly tests by showing only static strings are extracted but the negative cases (`t("key")`, `"Hello " + user`, `1 + 2`, ternary) are not confirmed to emit nothing. **COVERAGE GAP.** |
| ignores script, style, code, pre, svg, comment blocks | `typescript.test.ts` "excludes all SKIP_TAGS" covers script/style/code/pre/svg/noscript/iframe. Comment blocks (`<!-- ... -->`) not explicitly tested. **MINOR GAP.** |
| handles comparison operators inside expression attributes without breaking tag mode | Not in parser tests. **COVERAGE GAP.** |
| extracts nested JSX elements inside expressions | Not in parser tests. **COVERAGE GAP.** |
| handles comparison operators in quoted attributes (Vue/HTML) | Specific to Vue mode (`isJsx=false`). AST parser uses TS Compiler API directly — not applicable to the same call signature. **NO EQUIVALENT NEEDED** (Vue files are handled by `parsers/vue.ts`, not `scanTemplateTextNodes`). |
| `scanTemplateTextNodes` fast-check property (never throws) | No equivalent in parser tests. **COVERAGE GAP** — but this tests robustness, not behavioral correctness. |

**`isHardcodedIgnored` analysis:** This function is called at `validate.ts` line 314 inside the AST branch — it is a SURVIVING function. It must move from `hardcoded.ts` to `text.ts`.

| `hardcoded.test.ts` it (isHardcodedIgnored describe) | Disposition |
|------------------------------------------------------|-------------|
| ignores punctuation-only strings | **REPOINT** — move to file testing `@/core/scanner/text` after the function moves |
| ignores numbers-only strings and numeric/percentage values | **REPOINT** |
| ignores HTML entities | **REPOINT** |
| does NOT ignore acronyms or uppercase UI strings by default | **REPOINT** |
| ignores custom string literals if configured | **REPOINT** |

**hardcoded.test.ts summary:**

- All `scanTemplateTextNodes` tests: DROP (but see COVERAGE GAPS above — several behavioral cases need to be added to `typescript.test.ts` first per D-08)
- `scanTemplateTextNodes` fast-check property: DROP (robustness-only, not behavioral)
- All `isHardcodedIgnored` tests: REPOINT to new home after move to `text.ts`

**Disposition:** The `hardcoded.test.ts` file is NOT deleted — the `isHardcodedIgnored` describe block survives (repointed). The `scanTemplateTextNodes` describe blocks are removed. The file import changes from `@/core/scanner/hardcoded` to `@/core/scanner/text`.

[VERIFIED: direct read of `hardcoded.test.ts`, `typescript.test.ts`]

---

### File 4: `src/__tests__/ast-shadow.test.ts`

This file has NO deletion or repointing — all tests survive and must continue to pass. The only change is removing `useAst: true` from call sites (D-10).

```typescript
// Current (must change — won't type-check after useAst removed from DetectUsedKeysOptions):
const results = await validate(config, tempDir, { useAst: true })
const { parsedResults } = await detectUsedKeys([...], ["t"], [], { cwd: tempDir })

// After de-flagging:
const results = await validate(config, tempDir)
const { parsedResults } = await detectUsedKeys([...], ["t"], [], { cwd: tempDir })
// (Test I already passes no useAst — it tests the DEFAULT, so it requires no change)
```

| Test | Description | Disposition |
|------|-------------|-------------|
| Test A | detects a missing key via the AST path | **DEFLAG** — remove `{ useAst: true }` from `validate(...)` call |
| Test B | reports an unused key in AST mode | **DEFLAG** |
| Test C | skips keys ending with a dot in AST mode | **DEFLAG** |
| Test D | surfaces fully-dynamic key findings in AST mode | **DEFLAG** |
| Test E | classifies structured-concat and respects ignoreDynamicKeys | **DEFLAG** (two `validate(...)` calls inside this test) |
| Test F | detects hardcoded strings with checkHardcoded:true | **DEFLAG** (two calls: `validate(config, tempDir, { useAst: true })` and `validate(config, tempDir, { useAst: true, checkHardcoded: true })`) |
| Test G | extract with useAst:true writes keys to locale file | **DEFLAG** — remove `{ useAst: true }` from `extract(...)` call |
| Test H | useAst is not present in src/types.ts (D-09 invariant) | **KEEP unchanged** — structural check, no useAst in the test itself |
| Test I | uses AST as the default engine when useAst is omitted (D-16) | **KEEP unchanged** — already passes no useAst; remains valid default-is-AST guard |

**De-flagging detail:** After removing `useAst` from `detectUsedKeys`'s `opts` parameter, the TypeScript compiler will reject any call that passes `useAst: true` — which is the safety net that surfaces all sites needing de-flagging. `pnpm tsc --noEmit` will enumerate them.

[VERIFIED: direct read of `ast-shadow.test.ts`; confirmed Test I already passes no useAst]

---

## COVERAGE GAPS (Actions Required Before Deletion)

Per D-08 (verify-then-delete), the following gaps must be closed by adding tests to `src/__tests__/parsers/typescript.test.ts` BEFORE `src/__tests__/hardcoded.test.ts`'s `scanTemplateTextNodes` describe blocks are removed:

| Gap ID | Missing Coverage | What to Add to `typescript.test.ts` |
|--------|-----------------|--------------------------------------|
| GAP-01 | Multi-attribute extraction (label, title, alt, aria-label beyond placeholder) | Add test: parse `<input placeholder="P" label="L" title="T" alt="A" aria-label="AL" />` and confirm all 5 appear in `hardcodedCandidates` |
| GAP-02 | Dynamic expression exclusion (`placeholder={t("name")}`, `label={myLabel}`) | Add test: parse `<input placeholder={t("name")} label={myLabel} />` and confirm `hardcodedCandidates` is empty |
| GAP-03 | Multiple JSX expression literals in one element (`{ "Goodbye" }`, `` {`Hello`} ``) | Add test: parse `<div>{'Welcome'} and {"Goodbye"} and {`Hello`}</div>` and confirm all three are found |
| GAP-04 | Brace/comment handling inside JSX string expressions | Add test: parse `<div>{ /* comment */ 'Welcome }' }</div>` and confirm `Welcome }` appears in candidates |
| GAP-05 | Dynamic/complex JSX expression exclusion (ternary, concatenation, non-string) | Add test: parse `<div>{t("key")}</div><div>{"Hello " + user}</div><div>{1 + 2}</div>` and confirm empty `hardcodedCandidates` |
| GAP-06 | HTML comment blocks excluded | Add test: parse `<!-- skip me --><div>Keep Me</div>` and confirm only "Keep Me" appears |
| GAP-07 | Comparison operators in tag attributes without breaking tag parsing | Add test: parse `<div title={x > 0}>hello</div>` and confirm "hello" appears in candidates |
| GAP-08 | Nested JSX inside expressions | Add test: parse `<div>{isActive && <span>Hello</span>}</div>` and confirm "Hello" appears |

These 8 gaps correspond to tests that existed in `hardcoded.test.ts` and verified behaviors of `scanTemplateTextNodes` that the AST parser is also expected to implement. If the AST parser does NOT pass these tests, a real coverage regression exists and the corresponding `scanTemplateTextNodes` tests must NOT be dropped.

**The fast-check property test** ("never throws on arbitrary input") has no equivalent and does not need one — it tests robustness of the now-deleted regex-based implementation, not behavioral correctness of the AST path.

---

## Symbol-Deletion Blast Radius

### `useAst` flag — 4 flip sites + `detectUsedKeys` signature

All four flip sites confirmed by direct read (the default is already `?? true` post-Phase 5):

| File | Line | Current form | Change |
|------|------|--------------|--------|
| `src/core/scanner/index.ts` | 37 | `const useAst = opts?.useAst ?? true` | Remove entire `opts?.useAst` parameter; remove `if (useAst)` / `else` branches; keep AST path body unconditionally |
| `src/commands/validate.ts` | 104 | `const useAst = options?.useAst ?? true` | Remove this line; remove `if (!useAst)` block (lines 141-200); update hardcoded branch (`if (!useAst)` / `else` at line 270) to unconditional |
| `src/commands/extract.ts` | 45 | `{ cwd, useAst: options?.useAst ?? true }` | Remove `useAst:` from the opts object; detect if `options` param has other fields to retain |
| `src/commands/prune.ts` | 65 | `{ cwd, useAst: options.useAst ?? true }` | Same |
| `src/cli.ts` | n/a | Passes no `useAst` | No change needed — already confirmed |

[VERIFIED: direct read of all five files]

`detectUsedKeys`'s return shape after cleanup: `{ usedKeys: Set<string>, fileContents: string[], parsedResults: ParsedFileResult[], parseErrors: FileParseError[] }`. The `parseErrors` field stays (used by validate/extract/prune to emit warnings). `fileContents` stays (used by `looseKeyMatch` second pass in validate.ts).

### `escapeRegex` consumers

`escapeRegex` is defined in `regex.ts` and re-exported by:
1. `src/core/scanner/index.ts` — via `export * from "./regex"` (deleted with the module)
2. `src/utils.ts` — line 19, explicit re-export

External consumers of `escapeRegex` via any path: **NONE**. The grep for `escapeRegex` across all `src/` shows it only appears in `regex.ts` (definition + internal use by `buildKeyRegex`, `buildAttrRegex`, `buildDynamicCallRegex`) and `utils.ts` (re-export). No test file, no command, no other module imports `escapeRegex`.

**Action:** Remove the `escapeRegex` line from `utils.ts`'s re-export block. [VERIFIED]

### `isStaticStringLiteral` consumers after regex deletion

`isStaticStringLiteral` is defined in `text.ts` and used:
- `validate.ts` line 168 — inside `if (!useAst)` branch (deleted)
- `utils.ts` line 11 — re-export

After the `!useAst` branch is removed, `isStaticStringLiteral` has **zero production callers**. It still exists in `text.ts` (where it was always defined). The `utils.ts` re-export should be removed along with `escapeRegex`. The function itself may stay in `text.ts` (it's a well-tested, general-purpose utility with no harm in keeping it) — or be removed if the planner prefers. The re-export from `utils.ts` must go.

[VERIFIED: grep across all `src/`]

### `scanner.ts` shim re-exports audit

The shim `src/core/scanner.ts` is a single-line `export * from "./scanner/index"`. Its callers (files that import from `@/core/scanner` or `./scanner`):

| Importer | What it needs | Post-deletion action |
|----------|--------------|----------------------|
| `src/commands/validate.ts` | `scanSourceFiles`, `detectUsedKeys`, `buildKeyRegex`, `buildAttrRegex`, `buildDynamicCallRegex`, `isStaticStringLiteral`, `getBaseKey`, `classifyDynamicCall`, `computeLineOffsets`, `offsetToLine`, `matchWildcard`, `scanTemplateTextNodes`, `isHardcodedIgnored` | After cleanup: only `scanSourceFiles`, `detectUsedKeys`, `getBaseKey`, `computeLineOffsets`, `offsetToLine`, `matchWildcard`, `isHardcodedIgnored` survive. Update import to `@/core/scanner/index` (or keep as `@/core/scanner` — they're the same path once the shim is gone). Actually: shim deletion means `@/core/scanner` no longer resolves. All consumers must update to `@/core/scanner/index`. |
| `src/commands/extract.ts` | `scanSourceFiles`, `detectUsedKeys` | Update to `@/core/scanner/index` |
| `src/commands/prune.ts` | `scanSourceFiles`, `detectUsedKeys` | Update to `@/core/scanner/index` |
| `src/__tests__/ast-shadow.test.ts` | `detectUsedKeys` | Update to `@/core/scanner/index` |
| `src/__tests__/core.test.ts` | `stripComments`, `matchWildcard` | Update to `@/core/scanner/index` or `@/core/scanner/text` |
| `src/commands/prune/plans.ts` | `isKeyUsed` | Update to `@/core/scanner/index` or `@/core/scanner/text` |
| `src/commands/validate/checks.ts` | `isKeyUsed`, `getBaseKey` | Update import |
| `src/commands/validate/output.ts` | `getBaseKey` | Update import |
| `src/core/scanner.test.ts` | `from "./scanner"` (relative path to the shim) | Update to `./scanner/index` |
| `src/utils.ts` | `export * from "./core/scanner"` | Update to `./core/scanner/index`; remove `escapeRegex` and `isStaticStringLiteral` from explicit re-export list |

**Important:** The path alias `@/core/scanner` (without `/index`) resolves via TypeScript path aliases to the directory, which resolves `index.ts`. After deleting `scanner.ts` (the shim), `@/core/scanner` still resolves to `src/core/scanner/index.ts` because TypeScript resolves directory imports to `index.ts`. The shim deletion does NOT break `@/core/scanner` imports — it only removes the extra forwarding layer. This is safe.

[VERIFIED: confirmed by reading `src/core/scanner.ts` contents (single re-export) and checking tsconfig paths]

### What `scanner/index.ts` re-exports after cleanup

Currently `src/core/scanner/index.ts` has:
```typescript
export * from "./files"
export * from "./regex"   // DELETE THIS LINE
export * from "./text"
export * from "./dynamic" // DELETE THIS LINE
export * from "./lines"
export * from "./hardcoded" // DELETE THIS LINE (isHardcodedIgnored already moved to text.ts)
```

After cleanup, `index.ts` exports: everything from `files`, `text`, `lines`, plus `detectUsedKeys` itself.

The `buildKeyRegex`/`buildAttrRegex`/`buildDynamicCallRegex` re-exports disappear (regex.ts deleted). `classifyDynamicCall`/`extractLeadingPrefix` disappear (dynamic.ts deleted). `scanTemplateTextNodes` disappears (hardcoded.ts deleted).

---

## `utils.ts` Survival Analysis

`src/utils.ts` currently re-exports:
- From `./core/scanner`: `getFiles`, `stripComments`, `isStaticStringLiteral`, `getBaseKey`, `isKeyUsed`, `matchWildcard`, `escapeRegex`
- From `./core/locale-io`: 7 functions
- Own definition: `log` object (header/info/success/warn/error)

**Survival verdict: `utils.ts` MUST SURVIVE.** It contains the `log` object used by `cli.ts` (confirmed: `import { log } from "./utils"`), and the locale-io re-exports. Only two scanner re-exports are removed:
- `escapeRegex` — deleted module
- `isStaticStringLiteral` — no surviving external consumer (internal to `text.ts`; was only used by regex branch)

The remaining scanner re-exports (`getFiles`, `stripComments`, `getBaseKey`, `isKeyUsed`, `matchWildcard`) may stay or be pruned — they are deprecated back-compat aliases pointing to surviving `text.ts` functions. Since they still resolve correctly after the shim deletion (they'll re-export from `@/core/scanner/index` which re-exports `text.ts`), they can stay with minimal effort.

[VERIFIED: direct read of `src/utils.ts`]

---

## `scripts/bench.ts` Repurpose (D-05/D-06)

**Current `bench.ts` structure (lines verified by direct read):**

| Lines | Component | Keep/Strip |
|-------|-----------|------------|
| 1-35 | `walkDir` helper, constants (`WARMUP=3`, `N=10`, `THRESHOLD_MS=100`) | **KEEP** `walkDir`; strip `THRESHOLD_MS` |
| 37-54 | `timeEngine(files, useAst)` — times one engine over N iterations | **REPURPOSE** — remove `useAst` param; always call with no useAst option (AST path is now the only path) |
| 56-60 | `median()` | **KEEP** |
| 62-104 | `main()` — calls `timeEngine(slice, false)` then `timeEngine(slice, true)`, computes delta, exits non-zero if delta > THRESHOLD | **REPURPOSE** — remove the regex timing call and delta computation; keep AST timing call and report-only output; remove `process.exitCode = 1` (D-06: exit 0 regardless) |

**Repurposed `bench.ts` minimal logic:**
```typescript
// WARMUP and N stay; THRESHOLD_MS is removed
// timeEngine: remove useAst param, call detectUsedKeys without useAst (defaults to AST path)
// main: time AST only; print AST median; always exit 0 (no threshold check)
```

**CI update (`.github/workflows/ci.yml`):**
Current step at line 40-41:
```yaml
- name: Benchmark (perf gate)
  run: pnpm bench
```
After repurpose, the `bench` script exits 0 always. The step name should be updated to reflect it's now a reporting step, not a gate:
```yaml
- name: Benchmark (AST perf report)
  run: pnpm bench
```

[VERIFIED: direct read of `scripts/bench.ts` and `.github/workflows/ci.yml`]

---

## `scripts/shadow-compare.ts` Deletion (D-04)

`scripts/shadow-compare.ts` is confirmed to exist and calls `detectUsedKeys` with both `useAst: false` and `useAst: true` — impossible once the regex branch is deleted from `detectUsedKeys`. Delete the file.

`package.json` `shadow` script (`"shadow": "tsx scripts/shadow-compare.ts"`) — confirmed at line 27. Remove this entry.

[VERIFIED: direct read of `scripts/shadow-compare.ts` and `package.json`]

---

## README Edits (D-07)

**Location of sync API snippet to fix (lines 206-213, exact current text):**

```typescript
const results = validate(config, process.cwd())
console.log(`Coverage: ${results.codeKeyCoverage}%`)

extract(config, process.cwd())

// prune is dry-run by default — pass { force: true } to actually write.
const result: PruneResult = prune(config, process.cwd(), { force: true })
console.log(`Pruned ${result.totalPruned} keys`)
```

This must become async form:
```typescript
const results = await validate(config, process.cwd())
console.log(`Coverage: ${results.codeKeyCoverage}%`)

await extract(config, process.cwd())

// prune is dry-run by default — pass { force: true } to actually write.
const result: PruneResult = await prune(config, process.cwd(), { force: true })
console.log(`Pruned ${result.totalPruned} keys`)
```

The `try/catch` block at lines 216-224 must also be updated — `prune(config)` → `await prune(config)`.

**"Migration from 0.0.x / 0.1.x" section** starts at line 229. A new "Migration to 0.4.0" section must be inserted before or after it (recommendation: before, so newer migration appears first).

**Installation section** (lines 26-37) — add a note about optional peer deps after the basic install commands:
```bash
# Optional: install the compiler for your framework
pnpm add -D typescript          # required for .ts/.tsx/.js/.jsx scanning
pnpm add -D @vue/compiler-sfc   # required for .vue scanning
pnpm add -D svelte              # required for .svelte scanning
pnpm add -D @astrojs/compiler  # required for .astro scanning
```

[VERIFIED: direct read of `README.md` lines 189-240]

---

## Release Mechanics (D-01/D-02)

**Current version:** `"version": "0.3.0"` in `package.json` line 3. [VERIFIED]

**`peerDependencies` already declared** (no change needed):
```json
"peerDependencies": {
  "@astrojs/compiler": ">=4.0.0",
  "@vue/compiler-sfc": ">=3.0.0",
  "svelte": ">=4.0.0",
  "typescript": ">=5.0"
},
"peerDependenciesMeta": { ... all optional: true ... }
```
[VERIFIED: direct read of `package.json`]

**`prepublishOnly`: `"pnpm build"`** already exists. No change. [VERIFIED]

**Tag convention:** All existing tags (`v0.3.0`, `v0.2.3`, etc.) are **lightweight tags** (`git cat-file -t` returns `commit`, not `tag`). The CONTEXT.md says "annotated git tag `v0.4.0`" but the actual repo convention is lightweight tags. The planner should note this discrepancy: either follow the user's stated preference (annotated) or match the existing convention (lightweight). Recommendation: follow the user's stated D-01 decision ("annotated git tag") since they explicitly specified it, even though prior tags are lightweight. An annotated tag can carry a message summarizing the release.

[VERIFIED: `git cat-file -t v0.3.0` returns `commit` = lightweight; `git cat-file -t v0.2.3` same]

**CHANGELOG format** (verified by reading `CHANGELOG.md` lines 1-35): The format is:
```markdown
## [0.4.0] - YYYY-MM-DD

### Changed (BREAKING)
- ...
```
The 0.3.0 entry uses `## [0.3.0] - Unreleased` at the head. The 0.2.x entries use `## [0.2.3] - 2026-05-28`. Use today's date `2026-06-03` for 0.4.0.

**Scripts after cleanup:**
- Remove: `"shadow": "tsx scripts/shadow-compare.ts"`
- Keep: `"bench": "tsx scripts/bench.ts"` (repurposed)

[VERIFIED: direct read of `package.json` scripts]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Finding dangling imports after deletion | Manual grep | `pnpm tsc --noEmit` | TypeScript reports every orphaned import as an error; it's the complete audit tool |
| Identifying test coverage | Manual inspection | Grep for the behavioral assertion (the expected output) across `parsers/*.test.ts` | The test-disposition map in this document already does this work |
| Regex escaping | Custom function | (function deleted with `regex.ts`) | Not applicable post-deletion |

---

## Common Pitfalls

### Pitfall 1: Deleting `hardcoded.ts` before moving `isHardcodedIgnored`
**What goes wrong:** `validate.ts` line 314 calls `isHardcodedIgnored` inside the AST branch. Deleting `hardcoded.ts` first breaks the typecheck.
**How to avoid:** Commit 1 must complete and pass the gate before any module deletion.

### Pitfall 2: Treating `@/core/scanner` shim deletion as import-breaking
**What goes wrong:** Assuming all `import ... from "@/core/scanner"` paths break when `scanner.ts` is deleted.
**Why it doesn't:** TypeScript resolves `@/core/scanner` to the directory → `src/core/scanner/index.ts`. The shim `scanner.ts` is a sibling file that forwards to `index.ts`. Deleting `scanner.ts` leaves `@/core/scanner` resolving to `index.ts` unchanged.
**Exception:** `src/core/scanner.test.ts` uses `from "./scanner"` (relative, not `@/` alias) — this DOES break when `scanner.ts` is deleted. Update to `from "./scanner/index"`.

### Pitfall 3: Missing de-flagging in `ast-shadow.test.ts`
**What goes wrong:** After `useAst` is removed from `detectUsedKeys`'s options type, any passing `{ useAst: true }` causes a TypeScript error.
**How to detect early:** Run `pnpm tsc --noEmit` immediately after removing `useAst` from the `DetectUsedKeysOptions` type — it will list every failing call site.

### Pitfall 4: Dropping `scanTemplateTextNodes` tests before adding GAP coverage
**What goes wrong:** Behavioral coverage (multi-attribute extraction, dynamic-expression exclusion, nested JSX) is silently lost. The test suite stays green (no test fails) but behavioral regressions are undetected.
**How to avoid:** Add GAP-01 through GAP-08 to `typescript.test.ts` first, confirm they pass, THEN remove the `scanTemplateTextNodes` describe blocks from `hardcoded.test.ts`.

### Pitfall 5: `bench.ts` still references deleted `useAst` option
**What goes wrong:** After `useAst` is removed from the `detectUsedKeys` opts type, `bench.ts` calling `detectUsedKeys(files, fns, attrs, { cwd, useAst: false })` fails typecheck (via `tsconfig.scripts.json`).
**How to avoid:** The bench repurpose commit (Commit 5) must come after the flag removal commit (Commit 2), or at the latest by Commit 3.

### Pitfall 6: `validate.ts` import list not trimmed
**What goes wrong:** After removing the `!useAst` branch, the import statement still lists `buildKeyRegex`, `buildAttrRegex`, `buildDynamicCallRegex`, `isStaticStringLiteral`, `classifyDynamicCall`, `scanTemplateTextNodes`. These are now unused imports — ESLint `no-unused-vars` / `unused-imports` plugin will fail the lint gate.
**How to avoid:** Update the import list at the same time as deleting the branch.

---

## Code Examples

### Removing `useAst` from `detectUsedKeys` (scanner/index.ts)

```typescript
// BEFORE (current):
export async function detectUsedKeys(
  files: string[],
  matchFunctions: string[],
  matchAttributes: string[],
  opts?: { cwd?: string; useAst?: boolean; maxConcurrency?: number }
): Promise<{ usedKeys: Set<string>; fileContents: string[]; parsedResults: ParsedFileResult[]; parseErrors: FileParseError[] }> {
  const useAst = opts?.useAst ?? true
  const cwd = opts?.cwd ?? process.cwd()
  const maxConcurrency = opts?.maxConcurrency ?? 4

  if (useAst) { /* AST path */ }

  // regex path (deleted)
}

// AFTER (cleanup):
export async function detectUsedKeys(
  files: string[],
  matchFunctions: string[],
  matchAttributes: string[],
  opts?: { cwd?: string; maxConcurrency?: number }  // useAst removed
): Promise<{ usedKeys: Set<string>; fileContents: string[]; parsedResults: ParsedFileResult[]; parseErrors: FileParseError[] }> {
  const cwd = opts?.cwd ?? process.cwd()
  const maxConcurrency = opts?.maxConcurrency ?? 4

  // AST path directly — no if/else
}
```

[VERIFIED: direct read of `src/core/scanner/index.ts`]

### CHANGELOG 0.4.0 Section Format

Based on the existing format in `CHANGELOG.md`:

```markdown
## [0.4.0] - 2026-06-03

### Changed (BREAKING)

- **Async public API**: `validate()`, `extract()`, and `prune()` now return `Promise`.
  All callers must `await` the result.
  ```ts
  // Before (0.3.x):
  const results = validate(config, cwd)
  // After (0.4.0):
  const results = await validate(config, cwd)
  ```
- **New optional peer dependencies**: Framework source scanning now requires the
  workspace compiler for each framework you use. Install only what you need:
  ```bash
  pnpm add -D typescript          # .ts/.tsx/.js/.jsx scanning
  pnpm add -D @vue/compiler-sfc   # .vue scanning
  pnpm add -D svelte              # .svelte scanning
  pnpm add -D @astrojs/compiler  # .astro scanning
  ```
  A missing compiler emits an actionable error naming the exact install command.
- **AST engine**: The regex/state-machine scanner has been replaced by real
  per-framework AST parsers (TypeScript Compiler API for JS/TS; workspace
  compilers for Vue/Svelte/Astro). Extraction accuracy improves significantly.
  No configuration change required — the engine switch is transparent.
```

[VERIFIED: format matched against `CHANGELOG.md` existing entries]

---

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json` — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^1.5.0 |
| Config file | `vitest.config.ts` (uses `vite-tsconfig-paths` plugin for `@/` alias) |
| Quick run command | `pnpm test` (runs `vitest run`) |
| Full suite command | `pnpm tsc --noEmit && pnpm test && pnpm build` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLEAN-01 | `regex.ts`/`dynamic.ts`/`hardcoded.ts`/shim deleted; `isHardcodedIgnored` in `text.ts`; `escapeRegex` re-export gone; `useAst` flag gone | Structural (typecheck) | `pnpm tsc --noEmit` — fails if any orphaned import | ✅ (existing typecheck gate) |
| CLEAN-01 | `detectUsedKeys` returns correct results via AST-only path | unit | `pnpm test` (scanner.test.ts detectUsedKeys describe) | ✅ |
| CLEAN-01 | `isHardcodedIgnored` still functions after move to `text.ts` | unit | `pnpm test` (hardcoded.test.ts isHardcodedIgnored describe, repointed) | ✅ (repointed, not new) |
| CLEAN-01 | No behavioral coverage lost — AST parser tests cover all dropped behavioral cases | unit | `pnpm test` (typescript.test.ts — existing + GAPs 01-08) | ✅ existing / ❌ GAP-01..08 Wave 0 |
| CLEAN-01 | `ast-shadow.test.ts` still passes after de-flagging | integration | `pnpm test` | ✅ |
| CLEAN-02 | CHANGELOG BREAKING section present | manual | `grep "BREAKING" CHANGELOG.md` | ❌ Wave 0 (to write) |

### Sampling Rate

- **Per task commit:** `pnpm tsc --noEmit && pnpm test && pnpm build`
- **Per wave merge:** Same (this phase is one wave logically, with sequential commits)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/__tests__/parsers/typescript.test.ts` — add GAP-01 through GAP-08 covering multi-attribute extraction, dynamic expression exclusion, nested JSX, brace/comment handling, HTML comment skipping, comparison-operator tag parsing. These are the pre-conditions for the D-08 verify-before-delete step.

*(If gaps are added and all pass before deletion, no other new test files are needed — all other coverage already exists.)*

---

## Environment Availability

Step 2.6: All dependencies are existing devDependencies — no new external tools required.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pnpm | Scripts/CI | ✓ | 10 (CI), local | — |
| Node.js | All | ✓ | 20+ | — |
| tsx | `pnpm bench` / `pnpm shadow` | ✓ | ^4.22.4 (devDep) | — |
| typescript | Typecheck gate | ✓ | ^5.9.3 (devDep) | — |
| vitest | `pnpm test` | ✓ | ^1.5.0 (devDep) | — |
| git | Tagging | ✓ | system | — |

**Missing dependencies:** None.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | After deleting `scanner.ts` shim, `@/core/scanner` alias still resolves to `index.ts` | Blast Radius | Low — TypeScript directory resolution to `index.ts` is standard behavior |
| A2 | Commit ordering above (7 steps) is safe and each step passes the gate independently | Architecture Patterns | Medium — if a commit is wrong, the gate fails and surfaces the issue |
| A3 | GAP-01..GAP-08 behaviors are actually implemented correctly by the AST parser (not regressions) | Coverage Gaps | High — if the AST parser does NOT implement e.g. dynamic expression exclusion correctly, we lose coverage AND the test reveals a real bug |

---

## Open Questions

1. **`isStaticStringLiteral` in `utils.ts`**
   - What we know: it has no surviving production caller after the regex branch deletion
   - What's unclear: Should the re-export be removed from `utils.ts` (breaking external users who might import it from the package's public API)?
   - Recommendation: Remove from `utils.ts` re-exports. It was already `@deprecated` there. External users should not rely on it.

2. **Annotated vs lightweight tag for `v0.4.0`**
   - What we know: D-01 says "annotated git tag"; existing tags `v0.3.0`...`v0.2.0` are all lightweight
   - What's unclear: Whether the user intended a change in convention or was using "annotated" loosely
   - Recommendation: Follow D-01 literally — create an annotated tag (`git tag -a v0.4.0 -m "v0.4.0 — AST Parser Rewrite (BREAKING)"`) for this release since the user explicitly specified it.

3. **`classifyDynamicCall`/`extractLeadingPrefix` export removal from `utils.ts`**
   - What we know: `utils.ts` does NOT currently re-export these; they were only in `dynamic.ts` (confirmed by reading `utils.ts`)
   - What's unclear: Nothing — no action needed for `utils.ts` on these.

---

## Sources

### Primary (HIGH confidence — verified by direct file reads)
- `src/core/scanner/index.ts` — `detectUsedKeys` implementation, `useAst` default, both branches
- `src/core/scanner/text.ts` — surviving functions (`stripComments`, `isStaticStringLiteral`, `getBaseKey`, `matchWildcard`, `isKeyUsed`)
- `src/core/scanner/regex.ts` — `escapeRegex`, `buildKeyRegex`, `buildAttrRegex`, `buildDynamicCallRegex` (all deleted)
- `src/core/scanner/dynamic.ts` — `classifyDynamicCall`, `extractLeadingPrefix` (all deleted)
- `src/core/scanner/hardcoded.ts` — `scanTemplateTextNodes` (deleted), `isHardcodedIgnored` (moved)
- `src/core/scanner.ts` — the shim (single re-export, deleted)
- `src/commands/validate.ts` — all 7 scanner symbol usages; `useAst` branching structure
- `src/commands/extract.ts`, `src/commands/prune.ts`, `src/cli.ts` — `useAst` consumers
- `src/utils.ts` — complete re-export list; `log` object; confirmed `escapeRegex` and `isStaticStringLiteral` are the only scanner re-exports to remove
- `src/core/scanner.test.ts` — complete test disposition
- `src/__tests__/dynamic.test.ts` — complete test disposition
- `src/__tests__/hardcoded.test.ts` — complete test disposition
- `src/__tests__/ast-shadow.test.ts` — complete test disposition
- `src/__tests__/parsers/typescript.test.ts` — coverage verification for DROP decisions
- `scripts/bench.ts` — exact line breakdown for repurpose
- `scripts/shadow-compare.ts` — confirmed existence and deletion rationale
- `package.json` — version, scripts, peer deps
- `CHANGELOG.md` — format verification (first 60 lines)
- `README.md` — programmatic API snippet (lines 206-213), migration section (229+), install section (26-37)
- `.github/workflows/ci.yml` — CI bench step (lines 40-41)
- `vitest.config.ts` — test framework config

### Secondary (MEDIUM confidence)
- `.planning/phases/06-cleanup-release/06-CONTEXT.md` — locked decisions, carry-forwards
- `.planning/phases/05-shadow-comparison-perf-gate-default-flip/05-CONTEXT.md` — flip sites
- `.planning/REQUIREMENTS.md` — CLEAN-01, CLEAN-02 definitions

---

## Metadata

**Confidence breakdown:**
- Test-disposition map: HIGH — every test classified from direct file reads, with coverage citations
- Coverage gaps: HIGH — gaps identified by comparing hardcoded.test.ts cases against typescript.test.ts line by line
- Symbol blast radius: HIGH — verified by grep across all src/
- Bench repurpose: HIGH — exact line ranges read from scripts/bench.ts
- Release mechanics: HIGH — package.json, CHANGELOG, README all verified

**Research date:** 2026-06-03
**Valid until:** This research targets the current HEAD. Changes to the four flip sites, test files, or utils.ts before planning would invalidate specific line numbers (check before coding).
