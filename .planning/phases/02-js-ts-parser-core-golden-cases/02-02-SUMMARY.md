# Plan 02-02 — Execution Summary

**Executed by:** Antigravity
**Date:** 2026-06-01

## Branches Added

1. **Call-expression branch** (PARSE-02 + PARSE-04) — static keys extracted from `t("key")` / `i18n.t("key")` / `` t(`key`) ``; dynamic args classified structurally
2. **Attribute branch** (PARSE-03 + D-08 gain) — `i18nKey="x"` literal AND `i18nKey={"x"}` / `` i18nKey={`x`} `` container form extracted
3. **JSX text branch** (PARSE-05) — raw text nodes with `node.pos + indexOf(trimmed)` offsets
4. **JSX expression branch** (PARSE-05) — static strings inside `{...}` extracted

## Helpers

- `matchesCallee()` — D-07: bare (no dot) matches last-segment; dotted matches full-path
- `getLeadingStringLiteral()` — walks left chain of `+` BinaryExpressions
- `classifyArg()` — D-02: structural classification from AST node kind

## Constraint Confirmation

- Import boundary clean: no imports from `./index`, `./regex`, `./dynamic`, `./hardcoded`, `./text`
- No `isHardcodedIgnored` call in parser (D-11): raw candidates only
- No static `from "typescript"` import
- `.`-terminated key exclusion preserved (D-09)
