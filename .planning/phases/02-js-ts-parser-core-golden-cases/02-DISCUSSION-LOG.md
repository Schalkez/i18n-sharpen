# Phase 2: JS/TS Parser Core + Golden Cases - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-31
**Phase:** 2-JS/TS Parser Core + Golden Cases
**Areas discussed:** dynamicCalls field shape, Helper reuse vs AST-subsume, matchFunctions/attrs matching, Hardcoded filter boundary

---

## dynamicCalls field shape

| Option | Description | Selected |
|--------|-------------|----------|
| Classify in parser, structurally | Parser emits `{expression, arg, offset, classification, prefix?}`; derive from AST node kind (BinaryExpression/TemplateExpression leading static → structured-concat+prefix; Identifier/Call/Conditional/leading-interp → fully-dynamic). No string re-munging. | ✓ |
| Keep raw, classify in caller | Parser emits only `{expression, arg, offset}`; reuse `classifyDynamicCall`/`extractLeadingPrefix` on printed text downstream. | |
| Extend shape, parser fills it | Richer shape, but parser internally still calls `classifyDynamicCall` on printed arg. | |

**User's choice:** Classify in parser, structurally
**Notes:** The AST already has the structure that `classifyDynamicCall` reverse-engineers from text; classify from node kind, must reach parity with v0.3.0 prefixes/verdicts (`dynamic.test.ts`).

---

## Helper reuse vs AST-subsume

| Option | Description | Selected |
|--------|-------------|----------|
| Subsume in parser, touch nothing | Parser reimplements detection internally (`ts.isStringLiteral`, structural classification); imports only `offsetToLine` + `isHardcodedIgnored`. Leave regex.ts/dynamic.ts/text.ts untouched; relocation/deletion deferred to Phase 6. | ✓ |
| Relocate shared helpers now | Move shared pure helpers (e.g. `isHardcodedIgnored` → `text.ts`) during Phase 2. | |
| Shared util module | Extract both-engine helpers into a neutral module imported by regex and AST paths. | |

**User's choice:** Subsume in parser, touch nothing
**Notes:** Keeps Phase 2 additive, zero regression risk to the still-default regex path.

---

## matchFunctions/attrs matching

### Q1 — Callee matching

| Option | Description | Selected |
|--------|-------------|----------|
| Bare=last-segment, dotted=full-path | Bare entry ("t") matches rightmost callee identifier (so `t()` and `i18n.t()` both match); dotted entry ("i18n.t") matches full PropertyAccess path exactly. | ✓ |
| Exact full-callee match only | "t" matches only bare `t()`; namespaced calls need explicit dotted config. Breaks regex parity. | |
| Last-segment for all entries | Match only rightmost identifier even for dotted entries; over-matches. | |

**User's choice:** Bare=last-segment, dotted=full-path
**Notes:** Preserves the regex `\b` floor → guarantees zero false-negatives at the Phase 5 shadow gate, while honoring namespaced config.

### Q2 — Attribute value forms

| Option | Description | Selected |
|--------|-------------|----------|
| Literal + container string literal | Extract `i18nKey="x"` AND `i18nKey={"x"}`/{`x`} where the container wraps a static string literal. Documented AST-only gain. | ✓ |
| Literal attributes only (strict parity) | Match only quoted-literal attributes, exactly mirroring regex. | |

**User's choice:** Literal + container string literal
**Notes:** Strict superset of regex; container form logged as a gain in the Phase 5 diff, never a false-negative. Attribute-name matching stays exact.

---

## Hardcoded filter boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Parser=structural, caller=quality | Parser emits raw structurally-valid candidates (JSX text + allowlisted string-literal attrs, skip SKIP_TAGS); caller keeps `isHardcodedIgnored`. `isHardcodedIgnored` stays in hardcoded.ts until Phase 6. | ✓ |
| Parser applies default filters too | Parser also drops punctuation/number/entity noise; only custom-ignore globs stay in caller. | |
| Parser does all filtering | Pass config custom-ignore patterns into the parser for fully-final candidates. | |

**User's choice:** Parser=structural, caller=quality
**Notes:** Mirrors current architecture, parity-preserving, keeps validate-command config out of the parser.

---

## Claude's Discretion

- Parser module name/location and internal traversal structure.
- Printed-text mechanism for `arg`/`expression` (provided parity holds).
- `ts.createSourceFile` details: `ScriptTarget`, `setParentNodes`, `ScriptKind` per extension.
- Test file layout/naming for ported corpus + golden cases.
- Mechanism of surfacing collected `FileParseError`s from the parser.

## Deferred Ideas

- `isHardcodedIgnored` relocation + regex-module deletion → Phase 6.
- Async `detectUsedKeys` rewire / concurrency pool / `useAst` flag → Phase 4.
- Framework `<script>` delegation, dispatcher, `svelte:head` skip → Phase 3.
