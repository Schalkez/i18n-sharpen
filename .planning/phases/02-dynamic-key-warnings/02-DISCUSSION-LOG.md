# Phase 2: Dynamic Key Warnings — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 02-dynamic-key-warnings
**Areas discussed:** Classification rules, Static prefix extraction, ignoreDynamicKeys semantics, Output & backwards-compat

---

## Classification rules

### Q1: Bare identifier vs function call — cluster both as fully-dynamic, or split?

| Option | Description | Selected |
|--------|-------------|----------|
| Both fully-dynamic | Cluster `t(myVar)` + `t(getKey())` together. No static prefix in either case. | ✓ |
| Split bare-ident vs computed-call | Two separate classes for greppability. More report noise. | |
| Only bare ident, skip calls | Ignore `t(getKey())` entirely. Loses visibility. | |

**User's choice:** Both fully-dynamic (recommended)
**Notes:** Simplest semantically — no surfaceable prefix in either case.

---

### Q2: Template literal lead-interp — `` t(`${prefix}.error`) ``

| Option | Description | Selected |
|--------|-------------|----------|
| Fully-dynamic | No leading static prefix → no useful info to surface. | ✓ |
| Structured-concat with `<dynamic>.error` marker | Preserve trailing static + dynamic placeholder. Match logic complex. | |

**User's choice:** Fully-dynamic (recommended)
**Notes:** Consistent with leading-prefix-only extraction policy (D-05).

---

### Q3: Middle concat — `t("a." + x + ".b")`

| Option | Description | Selected |
|--------|-------------|----------|
| Structured-concat, prefix = `a.` (leading) | Take longest leading static segment. Drop trailing. | ✓ |
| Structured-concat, prefix = `a.<*>.b` | Keep both head and tail. Richer info, complex matching. | |
| Fully-dynamic, no extraction | Conservative; loses prefix opportunity. | |

**User's choice:** Prefix=`a.` (recommended)
**Notes:** Sets policy for D-05 (leading-prefix-only across all structured-concat cases).

---

### Q4: Conditional — `t(cond ? "a" : "b")`

| Option | Description | Selected |
|--------|-------------|----------|
| Fully-dynamic | Treat as opaque expression. Edge case is rare. | ✓ |
| Split into 2 virtual static calls | Add both `"a"` and `"b"` to usedKeys. Needs real parser → violates zero-dep. | |
| Skip silently | Hide from user. Not recommended — lose visibility. | |

**User's choice:** Fully-dynamic (recommended)
**Notes:** Deferred AST-based correct handling to v0.4+.

---

## Static prefix extraction

### Q5: Trailing static after dynamic — surface or drop?

| Option | Description | Selected |
|--------|-------------|----------|
| Only leading prefix | `error.` from `` `error.${code}.detail` ``. Drop `.detail`. | ✓ |
| Leading + tail marker | `error.<*>.detail`. More info, noisier. | |
| Leading + tail as 2 fields | Struct `{prefix, tail}`. Over-engineered. | |

**User's choice:** Only leading prefix (recommended)

---

### Q6: Minimum prefix length filter?

| Option | Description | Selected |
|--------|-------------|----------|
| No filter — surface all | User decides via ignoreDynamicKeys. Zero-config friendly. | ✓ |
| Skip prefix < 3 chars | Drop `a.`, `e.`. Needs config option. | |
| Skip if no trailing `.` | Only surface namespace-like prefixes. | |

**User's choice:** No filter (recommended)

---

### Q7: Quote handling — raw or normalized?

| Option | Description | Selected |
|--------|-------------|----------|
| Normalized (raw static text only) | Both `"error."` and `` `error.` `` → prefix string `error.`. | ✓ |
| Keep raw including quotes | Show quote style in output. Easier debug, noisier. | |

**User's choice:** Normalized (recommended)

---

### Q8: Original-expression display in output?

| Option | Description | Selected |
|--------|-------------|----------|
| Console: prefix + raw expr. Report: prefix only | Best of both — debug in terminal, compact in report. | ✓ |
| Both compact (prefix only) | Uniform but loses debug context in console. | |
| Both verbose | Maximum info; noisy markdown. | |

**User's choice:** Console verbose / report compact (recommended)

---

## ignoreDynamicKeys semantics

### Q9: Pattern type

| Option | Description | Selected |
|--------|-------------|----------|
| Glob via existing `matchWildcard` | Reuse pattern syntax from `ignoreKeys`. Zero new dep. | ✓ |
| Literal prefix only | Simpler but less flexible. | |
| Regex | Maximum power, ReDoS risk, user-error prone. | |

**User's choice:** Glob (recommended)

---

### Q10: Match target

| Option | Description | Selected |
|--------|-------------|----------|
| Extracted prefix | Match against `error.` etc. Predictable. | ✓ |
| Raw call expression | Match against `t("error." + code)` full text. Escape-heavy. | |
| Both (OR semantics) | Flexible but unpredictable; risk of false-suppress. | |

**User's choice:** Extracted prefix (recommended)

---

### Q11: Can fully-dynamic be ignored?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, via `*` | `ignoreDynamicKeys: ["*"]` silences everything. One-liner escape hatch. | ✓ |
| No — structured-concat only | Force fully-dynamic visibility. | |
| Separate `silenceFullyDynamic: true` config | Two configs, clearer API. Over-engineered. | |

**User's choice:** Yes via `*` (recommended)

---

### Q12: Ignored dynamics — removed entirely or silent-but-counted?

| Option | Description | Selected |
|--------|-------------|----------|
| Removed entirely from report + console | Same semantics as existing `ignoreKeys`. Zero pollution. | ✓ |
| Silent console but counted in report | Hybrid; dual-source-of-truth. | |

**User's choice:** Removed entirely (recommended)

---

## Output & backwards-compat

### Q13: Console output mode

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped summary at end (replace per-call warn) | Two sections at end of validate. Cleaner full picture. | ✓ |
| Keep per-call warn + add summary | Backward-compatible but verbose. | |
| No per-call, no console summary (markdown only) | Surprising silence. | |

**User's choice:** Grouped summary, replace per-call (recommended)
**Notes:** Visible behavior change accepted for v0.3.0; CHANGELOG entry required.

---

### Q14: Markdown report layout

| Option | Description | Selected |
|--------|-------------|----------|
| Section "Dynamic Keys" with 2 sub-tables | Full picture, sortable, scannable. | ✓ |
| 1 row counts in Quality Metrics (no list) | Minimalist; user must rerun CLI to debug. | |
| Counts + top-10 sample per group | Compromise; actionable without noise. | |

**User's choice:** Section with 2 sub-tables (recommended)

---

### Q15: Line numbers in output?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, both console + report | `file.ts:42`. Requires line-offset tracking. High actionability. | ✓ |
| Only file path (current) | Grep manually. Less work. | |

**User's choice:** Yes both (recommended)

---

### Q16: Exit code & missing-key pollution — confirm spec?

| Option | Description | Selected |
|--------|-------------|----------|
| Confirm: dynamic-only = exit 0 | DKEY-03 explicit. Status quo correct. | ✓ |
| Add opt-in `failOnDynamicKeys: true` | Strict-mode for paranoid CI. Defer to v0.4. | |

**User's choice:** Confirm dynamic-only = exit 0 (recommended)
**Notes:** DKEY-03 spec confirmed. failOnDynamicKeys deferred.

---

## Claude's Discretion

The user delegated these implementation-level choices to planner/researcher:
- Module placement for `classifyDynamicCall` (likely `src/core/scanner/dynamic.ts`)
- `ValidationResults.dynamicKeys` field shape
- Line-offset computation strategy (precomputed array vs slice+split)
- Whether to expose `classifyDynamicCall` from public API (recommend internal)
- Whether to add `--no-dynamic-keys` CLI flag (recommend NO)

## Deferred Ideas

- AST-based parsing → v0.4+
- `failOnDynamicKeys: true` strict mode → v0.4+
- Per-locale dynamic suppression
- Smart dedupe across files
- JSX attribute special-cased logic (not needed — current regex covers)
- `--no-dynamic-keys` CLI flag

---

*Discussion log generated: 2026-05-28*
