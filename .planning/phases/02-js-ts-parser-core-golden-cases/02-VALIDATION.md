---
phase: 2
slug: js-ts-parser-core-golden-cases
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-31
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Scope: PARSE-01..05 + OFFSET-01 + TEST-01..03 (PARSE-06 dispatcher deferred to Phase 3).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.6.1 (devDependency `^1.5.0`) |
| **Config file** | `vitest.config.ts` (with `vite-tsconfig-paths` for `@/` alias) |
| **Quick run command** | `pnpm test -- src/__tests__/parsers/typescript.test.ts` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~3-8 seconds (quick), full suite covers 203 existing + new |

---

## Sampling Rate

- **After every task commit:** `pnpm tsc --noEmit && pnpm test -- src/__tests__/parsers/typescript.test.ts`
- **After every plan wave:** `pnpm tsc --noEmit && pnpm test && pnpm build`
- **Before `/gsd-verify-work`:** Full suite green (`pnpm test`)
- **Max feedback latency:** ~8 seconds (quick run)

---

## What "Working" Means

For any given source string, a single `ts.createSourceFile` traversal produces a `ParsedFileResult` whose `usedKeys`, `dynamicCalls`, and `hardcodedCandidates` match the behavioral contract of the v0.3.0 regex engine (ported corpus, TEST-01) — PLUS correctly handles the two golden cases the regex engine failed (`<m.div>` member-expression tags TEST-02; `forwardRef<A,B>` generics TEST-03). All offsets are document-absolute and feed `offsetToLine`/`computeLineOffsets` correctly (OFFSET-01).

The regex engine stays the default; the parser must merely exist and pass these tests this phase (additive, zero regression risk).

---

## Per-Requirement Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists |
|--------|----------|-----------|-------------------|-------------|
| PARSE-01 | `ts.createSourceFile` (parser-only) invoked per extension; TypeScript lazy-loaded via `loadWorkspaceDep` (no static import) | unit | `pnpm test -- src/__tests__/parsers/typescript.test.ts` | ❌ W0 |
| PARSE-02 | Static keys extracted: `t("k")`, `i18n.t("k")`, `` t(`k`) ``; keys ending `.` excluded; offsets document-absolute | unit | same | ❌ W0 |
| PARSE-03 | Attribute keys: `i18nKey="x"` (literal) AND `i18nKey={"x"}`/`` {`x`} `` (container, D-08 gain) | unit | same | ❌ W0 |
| PARSE-04 | Dynamic calls classified structurally: `"p." + x` → structured-concat(prefix), `` `p.${x}` `` → structured-concat(prefix), `var`/`fn()`/`cond?a:b`/leading-interp → fully-dynamic | unit | same | ❌ W0 |
| PARSE-05 | Hardcoded candidates: JSX text + allowlist attrs (`placeholder\|title\|alt\|aria-label\|label`); SKIP_TAGS subtrees excluded; RAW (no quality filter) | unit | same | ❌ W0 |
| OFFSET-01 | JsxText offset = `node.pos + indexOf(trimmed)`; call offset = `node.getStart(sf)`; attr value offset = literal start + 1; all feed `offsetToLine` | unit | same | ❌ W0 |
| TEST-01 | All behavioral cases from `scanner.test`, `dynamic.test`, `hardcoded.test` pass against the AST parser (ported, not deleted) | unit (corpus) | same | ❌ W0 |
| TEST-02 | `<m.div>Hello world</m.div>` → `hardcodedCandidates` contains `{text:"Hello world", offset:N}` | unit (golden) | same | ❌ W0 |
| TEST-03 | `forwardRef<HTMLInputElement, InputProps>(...)` → zero spurious usedKeys/hardcoded from type params; only `placeholder` values from JSX | unit (golden) | same | ❌ W0 |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Sampling Strategy (Nyquist)

The ported v0.3.0 corpus (TEST-01) **is** the Nyquist sample — it was the regression floor for the regex engine and captures the input→output contract at sufficient resolution. The two golden cases (TEST-02/03) are the NEW samples the regex engine could not satisfy. Together they bound the parser's behavioral space:

- **Static forms:** literal, namespaced, no-substitution template, attribute literal, attribute container (D-08) — ported `scanner.test` cases + new container case.
- **Dynamic forms:** fully-dynamic (identifier, call, conditional, leading-interp template) and structured-concat (binary `+` leading literal incl. chained `"a."+x+".b"`, template non-empty head) — ported `dynamic.test` cases.
- **Hardcoded forms:** JSX text, allowlisted attrs, `SKIP_TAGS` exclusions, JSX expression static strings, member-expression tags — ported `hardcoded.test` cases + new `<m.div>` case.

**Minimum sufficient set:** ported corpus + 2 golden cases + offset assertions. No fuzzing required — the AST is deterministic and the contract is fully specified by existing tests. AST-only gains (D-08 container literals) must be asserted explicitly and logged as gains (not silently passed) for the Phase 5 corpus diff.

**Safely skipped this phase:** type-checker analysis (out of scope, parser-only); the `parseFile` dispatcher + framework files (Phase 3, PARSE-06); the `useAst` rewire / concurrency pool (Phase 4); perf gate + default flip (Phase 5). The `fast-check` no-throw property test is NOT ported (D-14 — structural, not behavioral; the AST parser never throws by construction).

---

## TEST-01 Corpus Cases to Port (behavioral only)

**From `dynamic.test.ts`** (parity target for D-02):
- `"error." + code` → structured-concat, prefix `"error."`
- `` `error.${code}` `` → structured-concat, prefix `"error."`
- `"a." + x + ".b"` → structured-concat, prefix `"a."` (chained concat — left-assoc walk)
- `` `error.${code}.detail` `` → structured-concat, prefix `"error."`
- `"error." + code, { option: true }` → structured-concat, prefix `"error."` (FIX-1 regression)
- `myVar`, `getKey()`, `obj.method()`, `` `${prefix}.error` ``, `cond ? "a" : "b"` → fully-dynamic

**From `hardcoded.test.ts`** (behavioral only — NOT the fast-check property test):
- `<div>Hello World</div>` → `[{text:"Hello World", offset:5}]`
- `<div>Hello <span>World</span>!</div>` → 3 entries, correct offsets
- `<div>  Trim Me  </div>` → `[{text:"Trim Me", offset:7}]` (trim + offset)
- `<input placeholder="Enter your name" />` → attribute extracted
- `<script>…</script><div>Keep Me</div>` → only "Keep Me" (SKIP_TAGS)
- `<div>{'Welcome to App'}</div>` → static string in JSX expression

**From `scanner.test.ts`** (behavioral only):
- `t('used.one')`, `t("used.two")`, `` t(`used.three`) `` → static keys extracted
- `// t('commented.out')` → NOT extracted (TS ignores comments natively)
- `t('prefix.' + variable)` → NOT in usedKeys (dynamic), classified in dynamicCalls
- `i18nKey="title.h"` → in usedKeys; keys ending `.` excluded

---

## Edge Cases & Failure Modes

| Edge Case | Risk | Mitigation |
|-----------|------|------------|
| Chained concat `"a."+x+".b"` | Outer binary's `left` is BinaryExpr, not StringLiteral → false fully-dynamic | `getLeadingStringLiteral` walks the left `+` chain (research Pattern 5) |
| `JsxText` leading/trailing whitespace | Offset miscalc vs `flushTextNode` | Use `node.pos + text.indexOf(trimmed)` — NOT `getStart(sf)` |
| Keys ending in `.` | Must be excluded from `usedKeys` | Preserve dynamic-prefix guard (D-09) |
| `.ts` file with `<T>` cast / `foo<A,B>()` generics | Must NOT parse as JSX (TEST-03 root cause) | `ScriptKind.TS` for `.ts` (JSX-disabled); `TSX` only for `.tsx` |
| Member-expression JSX tag `<m.div>` | Identifier-only special-casing would drop inner text | No special-casing; native `JsxText` traversal (TEST-02) |
| `node.getText()` w/o sourceFile under `setParentNodes:false` | Throws | Always `node.getText(sourceFile)` |
| Self-closing skip tags `<svg />` | SKIP_TAGS check only on `JsxElement` misses self-closing | Guard `isJsxSelfClosingElement` too |
| Comments containing `t()` | Must be ignored | AST excludes comments natively (no `stripComments`) |

---

## Wave 0 Requirements

- [ ] `src/__tests__/parsers/typescript.test.ts` — covers PARSE-01..05, OFFSET-01, TEST-01..03
- [ ] `src/core/scanner/parsers/types.ts` — refine `dynamicCalls` member type: add `classification: "fully-dynamic" | "structured-concat"` + `prefix?: string` (D-01)

*(All test infrastructure — vitest, config, `@/` alias — already present.)*

---

## Manual-Only Verifications

*None — all phase behaviors have automated unit verification.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter after planning

**Approval:** pending
