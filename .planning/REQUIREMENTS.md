# Requirements: i18n-sharpen v0.3.0

**Defined:** 2026-05-28
**Last updated:** 2026-05-28 after Phase 1 scout (NSWRITE-01/02 found already shipped, Phase 1 merged into SORT)
**Core Value:** Keep translation files sharp, tidy, and synchronized — without losing data.

## Already shipped (carried over from v0.2.x post-release)

These requirements were drafted as part of v0.3.0 but discovered during Phase 1 scout to be **already implemented** in commit `54712ab feat(extract,prune): wire namespaced write-routing [gap-1]` (landed after the PHASE-EXECUTION-REPORT was written for v0.2.0). Tests confirm they pass:

- ✅ **NSWRITE-01**: In `namespaced` layout, `extract` writes new keys to the correct `<localesDir>/<lang>/<namespace>.{json,yaml}` file based on the `ns:key.path` prefix found in source code — verified by `src/__tests__/extract.test.ts:61`
- ✅ **NSWRITE-02**: In `namespaced` layout, `prune` removes unused keys from the correct namespace file with no cross-namespace bleed — verified by `src/__tests__/prune.test.ts:232`

These two reqs are now considered Validated and tracked in `PROJECT.md`. No further work in v0.3.0.

## v0.3.0 Requirements

Requirements for the Developer Experience milestone. Each maps to roadmap phases.

### Auto-sorting keys + Namespace hardening (SORT + NSWRITE remnants) — Phase 1

Phase 1 was originally split (NSWRITE / SORT) but merged because NSWRITE-01/02 shipped early; remaining NSWRITE work is small and touches the same locale write path as SORT.

#### Auto-sorting (SORT)

- [x] **SORT-01**: User can configure key ordering for `extract`/`prune` writes via `sortKeys` config option (`"alpha" | "source" | "preserve"`)
- [x] **SORT-02**: User can override ordering per invocation via `--sort=alpha|source|preserve` CLI flag
- [x] **SORT-03**: Default ordering is `"preserve"` (no behavior change vs 0.2.x) — opt-in to sort
- [x] **SORT-04**: Alpha mode produces deterministic key order across all locale languages (no drift between `en.json` and `ja.json`)
- [x] **SORT-05**: Source mode orders keys by first-appearance in scanned code (stable when code order is stable)
- [x] **SORT-06**: Sorting preserves nested object structure — never flattens dotted keys into a flat map

#### Namespace hardening (NSWRITE remnants)

- [x] **NSWRITE-03**: A key referenced without `ns:` prefix in `namespaced` layout falls into a configurable `defaultNamespace` config option (decide migration path: keep current `"default"` for compat, or move to `"common"` and document as breaking — see Phase 1 CONTEXT.md)
- [x] **NSWRITE-04**: Namespace files preserve their on-disk structure — never auto-deleted (even when empty) unless an explicit `--clean-empty` CLI flag is passed
- [x] **NSWRITE-05**: Cross-file atomicity for prune in `namespaced` layout — partial failure of one namespace write doesn't leave the user with a mix of pruned-and-unpruned files (strategy TBD: two-phase commit vs in-memory staging — see Phase 1 CONTEXT.md)

### Improved dynamic-key warnings (DKEY) — Phase 2

- [x] **DKEY-01**: Validator classifies dynamic keys into "fully-dynamic" (`t(myVar)`) vs "structured-concat" (`t("error." + code)`, `` t(`error.${code}`) ``)
- [x] **DKEY-02**: Structured-concat keys surface their static prefix in the report so the user knows which namespace/section is involved
- [x] **DKEY-03**: Fully-dynamic keys are reported separately and do NOT pollute the "missing keys" failure list
- [x] **DKEY-04**: Warnings for either class can be silenced per pattern via `ignoreDynamicKeys` config (string[] of prefixes or globs)
- [x] **DKEY-05**: CI-friendly: dynamic-key counts appear in the markdown coverage report

### Interactive Pruning CLI (IPRUNE) — Phase 3

- [x] **IPRUNE-01**: User can run `prune --interactive` to enter a TUI flow showing candidate unused keys
- [x] **IPRUNE-02**: User can navigate the candidate list with arrow keys (↑/↓) and toggle keep/delete with Space
- [x] **IPRUNE-03**: User can confirm selection with Enter — only the marked-for-delete keys are pruned
- [x] **IPRUNE-04**: User can cancel with Esc or Ctrl+C — no file changes occur, exit code 130
- [x] **IPRUNE-05**: Interactive mode honors `--force` semantics: writes to disk only after explicit confirm; otherwise stays in dry-run preview
- [x] **IPRUNE-06**: Interactive mode is gracefully skipped in non-TTY environments (CI) — falls back to dry-run + warning

### Hardcoded string detection (HSTR) — Phase 4

- [x] **HSTR-01**: New `validate --check-hardcoded` flag scans text nodes between tags in `.tsx`/`.jsx`/`.vue`/`.svelte`/`.astro` that are NOT wrapped in `t()`
- [x] **HSTR-02**: Report includes file path, line number, and the offending text snippet
- [x] **HSTR-03**: User can configure ignore patterns via `hardcoded.ignore` config (punctuation-only, numbers-only, all-caps acronyms, custom regex)
- [x] **HSTR-04**: Detection respects `excludeDirs` and `fileExtensions` from existing config
- [x] **HSTR-05**: Exit code reflects findings — when `--check-hardcoded` is set, hardcoded strings cause exit 1 (so CI can fail)
- [x] **HSTR-06**: Markdown report includes a "Hardcoded strings" section when the check is enabled

### Cleanup (CLEANUP) — Phase 5

- [x] **CLEANUP-01**: `I18nCopConfig` type alias is removed from `src/types.ts` and `src/index.ts` exports
- [x] **CLEANUP-02**: CHANGELOG documents the removal under BREAKING with migration snippet (same wording as the 0.2.0 deprecation notice)
- [x] **CLEANUP-03**: Any internal references to `I18nCopConfig` (including in tests/docs) migrated to `I18nSharpenConfig`

## Future Requirements (deferred to v0.4.x+)

### CI/CD integration enhancements (Giai đoạn 2)

- **CIOUT-01**: Output validation results as JSON for machine consumption
- **CIOUT-02**: Output validation results as JUnit XML for CI dashboards (GitHub Actions, GitLab, Jenkins)

### Locale TS/JS file support (Giai đoạn 2 — read already shipped in 0.2.2)

- **LCLTS-01**: Investigate safe write-back to `.ts`/`.js` locale files (currently refused — would require AST surgery, defer until clear demand)

### AI / Auto-translation (Giai đoạn 3)

- **AI-01**: Integration with Google Translate / DeepL for draft translations of missing keys
- **AI-02**: Integration with LLM APIs (GPT/Gemini/Claude) for draft translations

### Editor integration (Giai đoạn 4)

- **VSCODE-01**: Package scanner core as a VS Code extension that highlights undefined keys inline

## Out of Scope

Explicitly excluded from v0.3.0. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Auto-translation via LLM/Google/DeepL | Giai đoạn 3 of ROADMAP — separate milestone, has API key handling concerns |
| VS Code Extension | Giai đoạn 4 of ROADMAP — separate distribution, different lifecycle |
| Writing to `.ts`/`.js` locale files | Explicitly refused in 0.2.3 for safety; would need AST parsing (heavy dep) |
| Runtime i18n features | Tool stays build/CI-time only; no runtime overhead |
| New i18n function detection beyond `t()` / config-driven matchers | Already covered by `matchFunctions` config — no new built-in detectors |
| Nested namespace directories (e.g. `locales/en/auth/login.json`) | Current flat-directory layout already covers common cases; defer until clear demand |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NSWRITE-01 | — | ✅ Shipped pre-milestone (commit `54712ab`) |
| NSWRITE-02 | — | ✅ Shipped pre-milestone (commit `54712ab`) |
| SORT-01 | Phase 1 | Pending |
| SORT-02 | Phase 1 | Pending |
| SORT-03 | Phase 1 | Pending |
| SORT-04 | Phase 1 | Pending |
| SORT-05 | Phase 1 | Pending |
| SORT-06 | Phase 1 | Pending |
| NSWRITE-03 | Phase 1 | Pending |
| NSWRITE-04 | Phase 1 | Pending |
| NSWRITE-05 | Phase 1 | Pending |
| DKEY-01 | Phase 2 | Pending |
| DKEY-02 | Phase 2 | Pending |
| DKEY-03 | Phase 2 | Pending |
| DKEY-04 | Phase 2 | Pending |
| DKEY-05 | Phase 2 | Pending |
| IPRUNE-01 | Phase 3 | Pending |
| IPRUNE-02 | Phase 3 | Pending |
| IPRUNE-03 | Phase 3 | Pending |
| IPRUNE-04 | Phase 3 | Pending |
| IPRUNE-05 | Phase 3 | Pending |
| IPRUNE-06 | Phase 3 | Pending |
| HSTR-01 | Phase 4 | Pending |
| HSTR-02 | Phase 4 | Pending |
| HSTR-03 | Phase 4 | Pending |
| HSTR-04 | Phase 4 | Pending |
| HSTR-05 | Phase 4 | Pending |
| HSTR-06 | Phase 4 | Pending |
| CLEANUP-01 | Phase 5 | Pending |
| CLEANUP-02 | Phase 5 | Pending |
| CLEANUP-03 | Phase 5 | Pending |

**Coverage:**
- v0.3.0 requirements: 29 active (NSWRITE-01/02 moved out as already-shipped)
- Mapped to phases: 29
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-28*
*Last updated: 2026-05-28 after Phase 1 scout discovery (NSWRITE-01/02 already shipped)*
