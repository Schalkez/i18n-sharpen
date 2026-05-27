# REVIEW-FIX Report

- Date: 2026-05-28T03:30:00Z (start) / 2026-05-28T04:08:00Z (end)
- REVIEW.md source: C:\Users\PC\Works\Personal\i18n-sharpen\REVIEW.md
- Total findings: 33
- Fixed: 33
- Skipped: 0
- Started: 5078d2e (pre-gsd-autorun)
- Ended: 6afed70
- Total commits: 19 (some commits bundle 2-3 related findings that touched the same code regions)

## Notes

- `mcp__gitnexus__impact` / `mcp__gitnexus__detect_changes` MCP tools were
  NOT available in this session — the `.mcp.json` declares the gitnexus
  server but no `mcp__gitnexus__*` tools were registered in the tool
  table. Per spec, this is documented in every commit message as
  "Note: gitnexus MCP tools not available in this session." Impact was
  assessed manually via Read/Grep of the call graph.
- Verify suite (`pnpm typecheck && pnpm test && pnpm build`) passed after
  EVERY commit. No commit was reverted.
- All 11 existing tests continue to pass.
- Pre-existing tag `pre-gsd-autorun` (5078d2e) preserved as revert point.

## Fixed

### CR-01 — Prototype pollution via locale keys / extracted code keys
- File: src/utils.ts:75-97 (setNestedValue), src/utils.ts:46-69 (flattenObject)
- Commit: 508971a
- Risk: low
- Verify: passed

### CR-02 — Untrusted regex construction (ReDoS + injection)
- File: src/config.ts:18-30, src/commands/validate.ts:79-87, extract.ts:28-32, prune.ts:28-32
- Commit: 1597dbf (combined with HI-02)
- Risk: low
- Verify: passed

### HI-01 — stripComments corrupts strings containing //
- File: src/utils.ts:39-41
- Commit: 2ce9532
- Risk: medium (foundation of all three commands' scanning)
- Verify: passed

### HI-02 — Key-extraction regex backslash-in-char-class
- File: src/commands/validate.ts:80, extract.ts:29, prune.ts:29
- Commit: 1597dbf (combined with CR-02)
- Risk: low
- Verify: passed

### HI-03 — dynamicRegex misses concatenation / template-literal calls
- File: src/commands/validate.ts:87, 138-150
- Commit: 54dde88
- Risk: low
- Verify: passed

### HI-04 — Operator precedence bug in active-placeholder file list
- File: src/commands/validate.ts:323
- Commit: 4f4bb89
- Risk: low
- Verify: passed

### HI-05 — Loose second-pass over-matches by design
- File: src/commands/validate.ts:154-182, src/commands/prune.ts:83-100
- Commit: 53cf350
- Risk: medium (default-config behavior change; loose pass now opt-in via `looseKeyMatch: true`)
- Verify: passed

### HI-06 — Library functions call process.exit
- File: src/commands/{validate,extract,prune}.ts
- Commit: 8713955
- Risk: low (CLI behaviour unchanged; library callers can now catch)
- Verify: passed

### HI-07 — findLocaleFile silently shadows duplicates
- File: src/utils.ts:140-149
- Commit: 952dbd9
- Risk: low (output-only)
- Verify: passed

### HI-08 — Partial writes if a locale file fails mid-loop
- File: src/commands/extract.ts:70-100, src/commands/prune.ts:140-170
- Commit: c637c0e (combined with MD-08)
- Risk: medium (write semantics for both extract and prune)
- Verify: passed

### HI-09 — Empty / BOM / whitespace locale file edge cases
- File: src/utils.ts:154-162
- Commit: 8461a20
- Risk: low
- Verify: passed

### MD-01 — getFiles infinite loop on symlink cycles
- File: src/utils.ts:10-34
- Commit: c93a786 (combined with MD-02)
- Risk: low
- Verify: passed

### MD-02 — getFiles uses O(2N) syscalls
- File: src/utils.ts:10-34
- Commit: c93a786 (combined with MD-01)
- Risk: trivial
- Verify: passed

### MD-03 — excludeDirs matches by basename only
- File: src/utils.ts:24
- Commit: a25c68e (combined with MD-04)
- Risk: trivial (JSDoc-only)
- Verify: passed

### MD-04 — Dotted keys ambiguous with nesting
- File: src/utils.ts:46-69
- Commit: a25c68e (combined with MD-03)
- Risk: trivial (warning + JSDoc)
- Verify: passed

### MD-05 — supportedLanguages format unvalidated (path escape vector)
- File: src/config.ts:18-30
- Commit: 0e0881e (combined with MD-06)
- Risk: low
- Verify: passed

### MD-06 — path.resolve escape from cwd
- File: src/commands/{validate,extract,prune}.ts:10
- Commit: 0e0881e (combined with MD-05) — implemented as warn-only in loadConfig
- Risk: low
- Verify: passed

### MD-07 — outputReport written without ensuring parent dir
- File: src/commands/validate.ts:374-486
- Commit: 672d95e (combined with MD-09)
- Risk: trivial
- Verify: passed

### MD-08 — No atomic write
- File: src/utils.ts:167-182
- Commit: c637c0e (combined with HI-08) — write-then-rename
- Risk: medium (cross-volume rename can fail on Windows but is then surfaced cleanly)
- Verify: passed

### MD-09 — `_not_` separator collides with language codes
- File: src/commands/validate.ts:262-267, 336 — replaced with structured LocaleAlignmentMismatch[]
- Commit: 672d95e (combined with MD-07)
- Risk: medium (BREAKING public API shape change for ValidationResults.keysOnlyInLanguages; acceptable per unpublished v0.1.0)
- Verify: passed

### MD-10 — Windows backslash paths leak into reports
- File: src/commands/validate.ts (path.relative call sites)
- Commit: 3764c4d (combined with MD-11, MD-12)
- Risk: trivial
- Verify: passed

### MD-11 — Regex `lastIndex` reset fragile
- File: src/commands/{validate,extract,prune}.ts
- Commit: 3764c4d (combined with MD-10, MD-12) — converted to `for ... of content.matchAll(regex)`
- Risk: trivial
- Verify: passed

### MD-12 — `outputReport: ""` undocumented semantics
- File: src/types.ts (JSDoc)
- Commit: 3764c4d (combined with MD-10, MD-11)
- Risk: trivial
- Verify: passed

### LO-01 — process.exit truncates piped stdout
- File: src/cli.ts
- Commit: 15fb0c3 (combined with LO-02, LO-03) — switched to process.exitCode
- Risk: trivial
- Verify: passed

### LO-02 — loadConfig swallows package.json read errors
- File: src/config.ts:52-54
- Commit: 15fb0c3 (combined with LO-01, LO-03)
- Risk: trivial
- Verify: passed

### LO-03 — loadConfig accepts nonexistent cwd
- File: src/config.ts:32
- Commit: 15fb0c3 (combined with LO-01, LO-02)
- Risk: trivial
- Verify: passed

### LO-04 — Magic numbers / strings scattered
- File: src/config.ts:6-16 — centralized scanDirs/localesDir into DEFAULT_CONFIG with JSDoc
- Commit: 9f29c8a (combined with LO-05, LO-06)
- Risk: trivial
- Verify: passed

### LO-05 — Unused localesData accumulator in prune
- File: src/commands/prune.ts:63
- Commit: 9f29c8a (combined with LO-04, LO-06)
- Risk: trivial
- Verify: passed

### LO-06 — isKeyUsed / getBaseKey duplicated
- File: src/commands/validate.ts:196-216 ≡ src/commands/prune.ts:114-134
- Commit: 9f29c8a (combined with LO-04, LO-05) — moved to utils.ts as shared helpers
- Risk: low
- Verify: passed

### LO-07 — keyToFilesMap O(n^2) via Array.includes
- File: src/commands/validate.ts:116, 132, 177
- Commit: 8b4b54e — internal Set<string>, Array.from at display
- Risk: trivial
- Verify: passed

### LO-08 — matchWildcard does not escape `?`
- File: src/utils.ts:189
- Commit: 6afed70 (combined with LO-09, LO-10)
- Risk: trivial
- Verify: passed

### LO-09 — Hardcoded version in cli.ts
- File: src/cli.ts:14
- Commit: 6afed70 (combined with LO-08, LO-10) — reads package.json via import.meta.url
- Risk: trivial
- Verify: passed

### LO-10 — Emoji unsupported on Windows cmd.exe
- File: src/utils.ts:205-211
- Commit: 6afed70 (combined with LO-08, LO-09) — NO_EMOJI env var fallback
- Risk: trivial
- Verify: passed

## Skipped

None — every finding in REVIEW.md was applied and verified.

## Summary

- Critical: 2/2
- High: 9/9
- Medium: 12/12
- Low: 10/10

## Next steps

1. **API breaking change** in `ValidationResults.keysOnlyInLanguages`
   (MD-09): old shape was `Record<\`\${from}_not_\${to}\`, string[]>`,
   new shape is `LocaleAlignmentMismatch[]` (`{from, to, keys}[]`).
   Document this in the package CHANGELOG / README before publishing
   v0.1.0 to npm.

2. **Default-config behavior change** in `looseKeyMatch` (HI-05): the
   second-pass "string anywhere in file" matching is now off by
   default. If any existing user workflow depended on it, they must
   add `"looseKeyMatch": true` to their config.

3. **Suggested follow-up tests** to lock in the fixes:
   - `stripComments` round-trips strings containing `//` and `/*` (HI-01).
   - `setNestedValue` rejects `__proto__.x` etc. (CR-01).
   - `extract` produces no partial writes when a later locale fails to
     parse (HI-08).
   - `validate` flags `t("k" + suffix)` and `` t(`p.${x}`) `` (HI-03).
   - `validate.keysOnlyInLanguages` shape is `LocaleAlignmentMismatch[]`
     (MD-09).

4. **gitnexus index refresh**: when the gitnexus MCP tools become
   available again, run `npx gitnexus analyze` so the new symbols
   (`escapeRegex`, `isStaticStringLiteral`, `normalizeDisplayPath`,
   `getBaseKey`, `isKeyUsed`, `FORBIDDEN_KEY_SEGMENTS`) are indexed.

5. **CRLF / LF warnings**: prettier + simple-git-hooks normalize line
   endings on commit; the `LF will be replaced by CRLF` warnings during
   commits are cosmetic and expected on Windows.
