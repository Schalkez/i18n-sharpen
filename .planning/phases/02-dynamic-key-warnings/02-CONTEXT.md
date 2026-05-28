# Phase 2: Dynamic Key Warnings — Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase upgrades the validator's dynamic-key detection. Today, `validate` emits a single undifferentiated `log.warn("Potential dynamic translation key reference...")` per non-static `t(...)` call. Phase 2 ships:

1. Two-class classification of dynamic calls: **fully-dynamic** (`t(myVar)`, `t(getKey())`, `` t(`${prefix}.error`) ``, `t(cond ? "a" : "b")`) vs **structured-concat** (`t("error." + code)`, `` t(`error.${code}`) ``, `t("a." + x + ".b")`).
2. Leading-static prefix extraction for structured-concat keys.
3. `ignoreDynamicKeys: string[]` config (glob patterns) that suppresses matching dynamics entirely.
4. Grouped console summary at end of validate (replaces per-call warn).
5. New "Dynamic keys" section in the markdown coverage report with 2 sub-tables.
6. Line numbers added to both console + markdown outputs.
7. Confirmation that dynamic-key findings do NOT contribute to exit code 1 (DKEY-03).

**NOT in scope (Deferred):**
- AST-based parsing (Babel / TS compiler) — violates zero-dep philosophy. Regex remains.
- `failOnDynamicKeys: true` strict mode — defer to v0.4 unless requested.
- Per-locale or per-language dynamic-key suppression.
- "Smart" duplicate dedupe (same expr in 5 files → one entry). Each file:line gets its own row.

</domain>

<decisions>
## Implementation Decisions

### Classification rules

- **D-01:** Bare identifier and function-call args are both **fully-dynamic**. `t(myVar)`, `t(getKey())`, `t(obj.method())` all cluster together. No sub-split.
- **D-02:** Template literal with leading interpolation (`` t(`${prefix}.error`) ``) is **fully-dynamic** — no static prefix to surface.
- **D-03:** Concat with dynamic in the middle (`t("a." + x + ".b")`) is **structured-concat** with prefix = **longest leading static segment** (e.g., `a.`). Trailing static is dropped.
- **D-04:** Conditional expressions `t(cond ? "a" : "b")` are **fully-dynamic**. We do NOT split into virtual static calls — that would require an AST and is out of scope.

### Static prefix extraction

- **D-05:** Surface **only the leading prefix** for structured-concat. `t(`error.${code}.detail`)` → `error.` (drop `.detail`). Consistent with D-03.
- **D-06:** **No minimum prefix length filter.** Surface every extracted prefix, even single-char `e.`. User decides via `ignoreDynamicKeys`.
- **D-07:** Prefix is **normalized** — strip surrounding quotes/backticks. Both `t("error." + x)` and `` t(`error.${x}`) `` yield prefix string `error.` (no quotes).
- **D-08:** **Console output shows prefix + raw call expr; markdown report shows prefix only.** Console: `error.  ← t(`error.${err.code}`) (src/auth.ts:42)`. Report row: `| error. | src/auth.ts | 42 |`.

### `ignoreDynamicKeys` semantics

- **D-09:** Pattern type is **glob** via the existing `matchWildcard` helper ([src/core/scanner/text.ts:155](src/core/scanner/text.ts:155)). Reuse the same syntax users already know from `ignoreKeys`.
- **D-10:** Patterns match against the **extracted prefix string only**, NOT the raw call expression. Fully-dynamic keys (no prefix) match against the empty string `""` OR via the universal `*` pattern.
- **D-11:** Fully-dynamic warnings ARE suppressible — set `ignoreDynamicKeys: ["*"]` to silence everything. A user who doesn't care about dynamic keys at all can opt out completely with one line.
- **D-12:** Ignored dynamics are **removed entirely** from BOTH console summary and markdown report. Same semantics as the existing `ignoreKeys` config — zero pollution downstream.

### Output & backwards-compat

- **D-13:** Console output replaces per-call `log.warn` with **a grouped summary at the end of `validate`**. Two sections (`Fully-dynamic keys (N)` / `Structured-concat keys (M)`), each listing entries. The current per-call warn is REMOVED. This is a visible behavior change but acceptable for v0.3.0 (milestone authority for breaking outputs; CHANGELOG note required).
- **D-14:** Markdown report gains a new top-level **`## Dynamic Keys`** section with two sub-tables:
  - `### Fully-dynamic keys (N)` — columns: `File | Line | Expression`
  - `### Structured-concat keys (M)` — columns: `Prefix | File | Line | Expression`
- **D-15:** Both console summary and markdown report include **line numbers**. Requires tracking byte-offset → line-number in the scanner (one extra pass per file via `content.slice(0, match.index).split("\n").length` or a precomputed line-index array — planner's choice).
- **D-16:** Exit code is **unchanged**. Dynamic-key findings — fully-dynamic OR structured-concat — never contribute to `exit 1`. Validate exits non-zero only when there are real missing keys, alignment mismatches, or other pre-existing failure modes. This explicitly confirms DKEY-03.

### Claude's Discretion

The user accepted all recommended defaults. Remaining technical choices delegated to planner/researcher:

- Where to put the dynamic-key classifier — likely a new module `src/core/scanner/dynamic.ts` (sibling of `text.ts` / `regex.ts`) exporting `classifyDynamicCall(arg: string): { kind: "fully-dynamic" | "structured-concat"; prefix?: string }`.
- Where to plug into validate: replace the inline `log.warn` block in `src/commands/validate.ts:133-141` with a collector that accumulates `DynamicKeyFinding[]` for later reporting.
- New `ValidationResults` field shape — likely `dynamicKeys: { fullyDynamic: DynamicKeyFinding[]; structuredConcat: StructuredConcatFinding[] }`.
- Line-number computation strategy — precompute a `lineOffsets` array per file once, then binary-search by match offset (O(log n) per match). Avoids quadratic `slice + split` for files with many calls.
- Whether to expose `classifyDynamicCall` from the public API. **Recommendation: keep internal** for now.
- Whether to add a `validate --no-dynamic-keys` CLI flag for quick suppression. **Recommendation: NO** — config-only suppression via `ignoreDynamicKeys`; flag adds CLI surface without proportional value.

### Folded Todos

None — `gsd-tools todo match-phase 2` returned zero matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/PROJECT.md` — Vision, constraints (no heavy deps, additive-only philosophy, zero-config defaults).
- `.planning/REQUIREMENTS.md` — DKEY-01..05 mapped to this phase. Includes Out of Scope list.
- `.planning/ROADMAP.md` — Phase 2 success criteria (5 items).
- `CLAUDE.md` (project root) — GitNexus impact-analysis workflow (mandatory before editing symbols).

### Existing code (read before changing)
- `src/core/scanner/regex.ts` — `buildKeyRegex`, `buildAttrRegex`, `buildDynamicCallRegex` (line 51 — the regex that already captures full first-arg for non-static calls). Reuse as-is.
- `src/core/scanner/text.ts` — `isStaticStringLiteral` (line 114), `matchWildcard` (line 155), `stripComments`. The classifier should be built on top of `isStaticStringLiteral`.
- `src/core/scanner/index.ts` — `detectUsedKeys` already skips keys ending with `.` (line 41); dynamic detection complements this.
- `src/commands/validate.ts` lines 116-141 — current dynamic-key detection inline (single warn per call). This block is what Phase 2 replaces.
- `src/commands/validate/checks.ts` — pure checks pattern (`findMissingKeys`, `findUnusedKeys`, etc.). New `classifyDynamicCalls(...)` function should follow this signature style.
- `src/commands/validate/report.ts` — `renderMarkdownReport` (line 49). Needs new `## Dynamic Keys` section + sub-tables.
- `src/types.ts` — `I18nSharpenConfig` (add `ignoreDynamicKeys`) and `ValidationResults` (add `dynamicKeys` field).
- `src/config/schema.ts` — zod schema for `ignoreDynamicKeys: z.array(z.string()).optional()`.
- `src/__tests__/validate.test.ts` — integration test pattern + log spy.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`buildDynamicCallRegex`** ([scanner/regex.ts:51](src/core/scanner/regex.ts:51)) — already captures the first-arg payload of every `<fn>(...)` call. Phase 2 just adds classification on top of its matches.
- **`isStaticStringLiteral`** ([scanner/text.ts:114](src/core/scanner/text.ts:114)) — already returns false for template literals with `${}`, concat with quotes, and bare identifiers. This is the first cut: `false` → it's dynamic → classify further.
- **`matchWildcard`** ([scanner/text.ts:155](src/core/scanner/text.ts:155)) — glob matcher used by `isKeyUsed`. Phase 2's `ignoreDynamicKeys` should call this with the extracted prefix.
- **`renderMarkdownReport`** ([validate/report.ts:49](src/commands/validate/report.ts:49)) — pure renderer accepting structured args. Easy to extend with a new Dynamic Keys section.
- **`log.warn` / `log.info`** ([utils.ts](src/utils.ts)) — output helpers.

### Established Patterns
- **Pure-check signature** — `findMissingKeys(usedKeys, defaultKeySet, config)` returns a plain array. Phase 2's `classifyDynamicCalls(callsByFile, config)` should follow.
- **Validator orchestrator** — `src/commands/validate.ts` loops files once, builds intermediate state, then calls pure checks. Phase 2 plugs the new classifier into this same loop.
- **Markdown report assembly** — `renderMarkdownReport` returns a single template string. New sections append cleanly.
- **Type extension via `I18nSharpenConfig`** — add optional field + zod schema entry. Migrations / defaults are minimal because absence means "no ignores."

### Integration Points
- `src/commands/validate.ts:116-141` — replace inline warn block with collector.
- `src/commands/validate/report.ts` — add `## Dynamic Keys` section to `renderMarkdownReport`.
- `src/types.ts` — extend `ValidationResults` (add `dynamicKeys`) and `I18nSharpenConfig` (add `ignoreDynamicKeys`).
- `src/config/schema.ts` — add `ignoreDynamicKeys: z.array(z.string()).optional()`.
- `src/__tests__/validate.test.ts` — extend with classification test cases.
- New: `src/core/scanner/dynamic.ts` — `classifyDynamicCall`, `extractLeadingPrefix`.

</code_context>

<specifics>
## Specific Ideas

- User chose all recommended defaults — signals trust in conservative engineering decisions for this phase, similar to Phase 1.
- The grouped summary output (D-13) is a deliberate UX upgrade: instead of N scattered `log.warn` lines, user sees one organized block. Cost: visible behavior change vs v0.2.x. v0.3.0 milestone authority covers this; CHANGELOG entry under BREAKING-OR-NOTABLE.
- Line numbers (D-15) elevate this from a "you have dynamic keys somewhere" warning into actionable "click-to-jump" output. Cheap to add (O(file size) for offset map), high value.
- `ignoreDynamicKeys: ["*"]` (D-11) is the explicit escape hatch for teams that don't want any of this. Documenting it in README mitigates "this feature is loud" complaints.

</specifics>

<deferred>
## Deferred Ideas

- **AST-based extraction** — would let us handle `t(cond ? "a" : "b")` correctly (split into virtual static calls), property-access `t(messages.error)`, etc. Defer to v0.4+ when/if user explicitly asks. Violates zero-dep guarantee.
- **`failOnDynamicKeys: true`** strict-mode config — defer until user demand surfaces. Single-issue users can implement via `validate --json | jq` post-processing today.
- **Per-locale dynamic-key suppression** — `ignoreDynamicKeys: { en: [...], fr: [...] }` — over-engineered for v0.3.0. One global list is enough.
- **Smart dedupe** — same dynamic expression in 5 files → list once with file count. Adds report complexity, hides info user might need. Skip.
- **JSX attribute dynamic keys** — `<Comp title={t(var)}>` is already covered transparently by `buildDynamicCallRegex` matching any `t(...)` in cleaned source. No special-cased attribute logic needed.
- **`--no-dynamic-keys` CLI flag** — config-only via `ignoreDynamicKeys` is enough; don't expand CLI surface.

### Reviewed Todos (not folded)
None reviewed — todo match returned zero.

</deferred>

---

*Phase: 02-dynamic-key-warnings*
*Context gathered: 2026-05-28*
