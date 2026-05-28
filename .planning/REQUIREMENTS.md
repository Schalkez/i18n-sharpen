# Requirements: i18n-sharpen v0.3.0

**Defined:** 2026-05-28
**Core Value:** Keep translation files sharp, tidy, and synchronized — without losing data.

## v0.3.0 Requirements

Requirements for the Developer Experience milestone. Each maps to roadmap phases.

### Auto-sorting keys (SORT)

- [ ] **SORT-01**: User can configure key ordering for `extract`/`prune` writes via `sortKeys` config option (`"alpha" | "source" | "preserve"`)
- [ ] **SORT-02**: User can override ordering per invocation via `--sort=alpha|source|preserve` CLI flag
- [ ] **SORT-03**: Default ordering is `"preserve"` (no behavior change vs 0.2.x) — opt-in to sort
- [ ] **SORT-04**: Alpha mode produces deterministic key order across all locale languages (no drift between `en.json` and `ja.json`)
- [ ] **SORT-05**: Source mode orders keys by first-appearance in scanned code (stable when code order is stable)
- [ ] **SORT-06**: Sorting preserves nested object structure — never flattens dotted keys into a flat map

### Interactive Pruning CLI (IPRUNE)

- [ ] **IPRUNE-01**: User can run `prune --interactive` to enter a TUI flow showing candidate unused keys
- [ ] **IPRUNE-02**: User can navigate the candidate list with arrow keys (↑/↓) and toggle keep/delete with Space
- [ ] **IPRUNE-03**: User can confirm selection with Enter — only the marked-for-delete keys are pruned
- [ ] **IPRUNE-04**: User can cancel with Esc or Ctrl+C — no file changes occur, exit code 130
- [ ] **IPRUNE-05**: Interactive mode honors `--force` semantics: writes to disk only after explicit confirm; otherwise stays in dry-run preview
- [ ] **IPRUNE-06**: Interactive mode is gracefully skipped in non-TTY environments (CI) — falls back to dry-run + warning

### Improved dynamic-key warnings (DKEY)

- [ ] **DKEY-01**: Validator classifies dynamic keys into "fully-dynamic" (`t(myVar)`) vs "structured-concat" (`t("error." + code)`, `` t(`error.${code}`) ``)
- [ ] **DKEY-02**: Structured-concat keys surface their static prefix in the report so the user knows which namespace/section is involved
- [ ] **DKEY-03**: Fully-dynamic keys are reported separately and do NOT pollute the "missing keys" failure list
- [ ] **DKEY-04**: Warnings for either class can be silenced per pattern via `ignoreDynamicKeys` config (string[] of prefixes or globs)
- [ ] **DKEY-05**: CI-friendly: dynamic-key counts appear in the markdown coverage report

### Hardcoded string detection (HSTR)

- [ ] **HSTR-01**: New `validate --check-hardcoded` flag scans text nodes between tags in `.tsx`/`.jsx`/`.vue`/`.svelte`/`.astro` that are NOT wrapped in `t()`
- [ ] **HSTR-02**: Report includes file path, line number, and the offending text snippet
- [ ] **HSTR-03**: User can configure ignore patterns via `hardcoded.ignore` config (punctuation-only, numbers-only, all-caps acronyms, custom regex)
- [ ] **HSTR-04**: Detection respects `excludeDirs` and `fileExtensions` from existing config
- [ ] **HSTR-05**: Exit code reflects findings — when `--check-hardcoded` is set, hardcoded strings cause exit 1 (so CI can fail)
- [ ] **HSTR-06**: Markdown report includes a "Hardcoded strings" section when the check is enabled

### Namespace write-routing (NSWRITE) — finishes Phase 7 of 0.2.0

- [ ] **NSWRITE-01**: In `namespaced` layout, `extract` writes new keys to the correct `<localesDir>/<lang>/<namespace>.{json,yaml}` file based on the `ns:key.path` prefix found in source code
- [ ] **NSWRITE-02**: In `namespaced` layout, `prune` removes unused keys from the correct namespace file with no cross-namespace bleed
- [ ] **NSWRITE-03**: A key referenced without `ns:` prefix in `namespaced` layout falls into a configurable `defaultNamespace` (default: `"common"`)
- [ ] **NSWRITE-04**: Namespace files preserve their on-disk structure — never merged, never auto-deleted (even when empty) unless an explicit `--clean-empty` flag is passed
- [ ] **NSWRITE-05**: Atomic writes (`.tmp` + rename) extend per-namespace — partial failure of one namespace doesn't corrupt another

### Cleanup (CLEANUP)

- [ ] **CLEANUP-01**: `I18nCopConfig` type alias is removed from `src/types.ts` and `src/index.ts` exports
- [ ] **CLEANUP-02**: CHANGELOG documents the removal under BREAKING with migration snippet (same wording as the 0.2.0 deprecation notice)
- [ ] **CLEANUP-03**: Any internal references to `I18nCopConfig` (including in tests/docs) migrated to `I18nSharpenConfig`

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

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| NSWRITE-01 | Phase 1 | Pending |
| NSWRITE-02 | Phase 1 | Pending |
| NSWRITE-03 | Phase 1 | Pending |
| NSWRITE-04 | Phase 1 | Pending |
| NSWRITE-05 | Phase 1 | Pending |
| SORT-01 | Phase 2 | Pending |
| SORT-02 | Phase 2 | Pending |
| SORT-03 | Phase 2 | Pending |
| SORT-04 | Phase 2 | Pending |
| SORT-05 | Phase 2 | Pending |
| SORT-06 | Phase 2 | Pending |
| DKEY-01 | Phase 3 | Pending |
| DKEY-02 | Phase 3 | Pending |
| DKEY-03 | Phase 3 | Pending |
| DKEY-04 | Phase 3 | Pending |
| DKEY-05 | Phase 3 | Pending |
| IPRUNE-01 | Phase 4 | Pending |
| IPRUNE-02 | Phase 4 | Pending |
| IPRUNE-03 | Phase 4 | Pending |
| IPRUNE-04 | Phase 4 | Pending |
| IPRUNE-05 | Phase 4 | Pending |
| IPRUNE-06 | Phase 4 | Pending |
| HSTR-01 | Phase 5 | Pending |
| HSTR-02 | Phase 5 | Pending |
| HSTR-03 | Phase 5 | Pending |
| HSTR-04 | Phase 5 | Pending |
| HSTR-05 | Phase 5 | Pending |
| HSTR-06 | Phase 5 | Pending |
| CLEANUP-01 | Phase 6 | Pending |
| CLEANUP-02 | Phase 6 | Pending |
| CLEANUP-03 | Phase 6 | Pending |

**Coverage:**
- v0.3.0 requirements: 31 total
- Mapped to phases: 31
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-28*
*Last updated: 2026-05-28 after roadmap creation*
