# Phase 1: Auto-Sorting Keys + Namespace Hardening — Context

**Gathered:** 2026-05-28
**Status:** Ready for planning

## Phase Boundary

This phase ships:
1. A `sortKeys` config option + `--sort` CLI flag that controls how `extract` and `prune` order keys when writing locale files. Three modes: `"alpha"`, `"source"`, `"preserve"`. Default `"preserve"` (zero-diff for existing users).
2. Hardening of the namespaced write path landed in commit `54712ab`: a configurable `defaultNamespace` (with a migration-aware default), a `--clean-empty` CLI flag, and cross-file atomicity for prune.

**NOT in scope for this phase** (would be new capabilities — note in Deferred):
- Per-locale custom sort orders, custom comparator API
- Sorting flat layout differently from namespaced layout
- TUI confirmation prompts for `--clean-empty` (composes badly with Phase 3 IPRUNE work — keep them independent)
- Nested namespace directories (`locales/en/auth/login.json`) — already explicitly Out of Scope in REQUIREMENTS.md

## Implementation Decisions

### Auto-sort (SORT)

- **D-01: Sort mode set** — Three modes via `sortKeys?: "alpha" | "source" | "preserve"` config option, validated by zod enum. Default = `"preserve"` (no behavior change vs 0.2.x).
- **D-02: CLI override** — `--sort=alpha|source|preserve` flag overrides config per invocation. Same validation as config schema.
- **D-03: Alpha comparator** — `Intl.Collator('en', { sensitivity: 'base', numeric: true })`. Reasons:
  - Case-insensitive ('apple' and 'Apple' sort equivalently — natural for human readers)
  - `numeric: true` enables natural sort: `key1 < key2 < key10` instead of lex `key1 < key10 < key2`
  - Fixed locale `'en'` for cross-machine determinism (system locale would drift)
  - Zero-dep (Intl built-in to Node 20+, which is the project's min version)
  - Handles non-ASCII keys (Unicode in fixture files) without crashing
- **D-04: Sort scope** — Recursive across all nesting levels. After sort, `{a: {z: 1, a: 2}}` becomes `{a: {a: 2, z: 1}}`. Output fully deterministic regardless of user edits.
- **D-05: Source mode** — Order keys by detection order — i.e. `Set` insertion order from `detectUsedKeys`. JS `Set` preserves insertion order; this matches "file order × line order in file" which is how human readers reason. Default is good as long as `scanSourceFiles` returns paths in a stable order.
  - **Verification gate for planner:** confirm `scanSourceFiles` sorts directory entries (or document the order). If not, add a sort to guarantee CI-stable output.
- **D-06: Composability** — Sort applies BOTH to flat layout (single file) and namespaced layout (per-namespace file). Applies BOTH in `extract` (after merging missing keys) and `prune` (after removing keys). Single sort utility in `src/core/locale-io/sort.ts` consumed by both commands.

### Namespace hardening (NSWRITE remnants)

- **D-07: `defaultNamespace` config option** — New `defaultNamespace?: string` field on `I18nSharpenConfig`. Default value: **`"common"`** (aligned with i18next/vue-i18n/react-i18next ecosystem convention).
  - Existing users with hardcoded `"default"` behavior: see D-08 migration.
- **D-08: Migration warning for legacy `"default"`** — When running `extract`/`prune` with `localesLayout: "namespaced"` AND `defaultNamespace` is unset AND a file named `default.{json,yaml}` exists in any `<localesDir>/<lang>/` directory AND no `common.{json,yaml}` exists in the same dir:
  - Log a warning: `Found legacy "default" namespace files (default.json). v0.3.0 changed the default namespace name to "common". Either: (a) set 'defaultNamespace: "default"' in your config to keep the current behavior, or (b) rename <lang>/default.json → <lang>/common.json.`
  - Do NOT auto-rename anything (user data sanctity, matches `prune` dry-run philosophy).
  - This is a CHANGELOG BREAKING entry for v0.3.0.
- **D-09: `--clean-empty` flag** — CLI flag (and `prune.cleanEmpty?: boolean` config) for `prune` only. When set:
  - Namespaced layout: after prune leaves a namespace file with 0 keys, delete the file. Log `Deleted N empty namespace files: <list>`. In dry-run, log `Would delete N empty namespace files: <list>`.
  - Flat layout: NOT applied — a `<lang>.json` with `{}` is preserved (user may intentionally keep it for git tracking, locale presence signaling, etc.).
  - Never deletes parent `<lang>/` directory (out of scope; risk of removing user-intended structure).
- **D-10: Cross-file atomicity** — Add a new helper `writeLocaleFilesAtomic(plans: WritePlan[])` in `src/core/locale-io/io.ts`:
  - Phase A: write every plan to `<filePath>.tmp` first. If any write fails, delete all `.tmp` files that were created, throw `I18nSharpenError({ kind: "filesystem", ... })`. **No on-disk changes** to original files.
  - Phase B: only when all `.tmp` files exist, rename each `.tmp` → final path in order. If a rename fails mid-loop, log clearly which files were committed and which were not, leave remaining `.tmp` files on disk for user inspection (don't try to roll back already-renamed files — rename rollback is itself error-prone).
  - Wire `extract` and `prune` (both layouts) to use this helper instead of looping over `writeLocaleFile` directly.
  - Document the limited "rename loop" failure window in JSDoc.

### Test coverage

- **D-11: Tests required**:
  - Sort: each mode × each layout × nested objects × Unicode keys × numeric suffixes (key1/key2/key10).
  - Default namespace: with and without `defaultNamespace` set, with legacy `default.json` file (warning path), with `common.json` (no warning).
  - `--clean-empty`: pruning leaves empty namespace → file deleted; dry-run preview shows "Would delete"; flat layout `<lang>.json` with `{}` NOT deleted.
  - Cross-file atomicity (mocks via `vi.spyOn(fs, 'writeFileSync')` or `fs.renameSync`):
    - Parse fail on file 3 → no writes happened (existing behavior).
    - Write fail mid `.tmp` writes → all `.tmp` files cleaned up, no on-disk changes to originals.
    - Rename fail mid loop → log captured, partial commit state documented, remaining `.tmp` files remain for inspection.
  - Property-based test (fast-check): sorting is idempotent (`sort(sort(x)) === sort(x)`); sorting preserves keys-set (no key lost, no key added).
- **D-12: No test for system locale drift** — relying on `Intl.Collator('en', ...)` to be stable across Node versions. ICU drift in Node has been negligible in 20.x.

### Claude's Discretion

The user said "best practice tùy bạn quyết" on most sub-questions. Decisions captured above (D-03, D-07, D-08, D-09 scope, D-10) are best-practice picks. Remaining discretion for the planner/researcher:

- Where in `src/core/locale-io/` to place the `sort.ts` module (sibling of `transform.ts` and `io.ts` is the natural fit).
- Internal naming conventions for the `WritePlan` type (already exists in `prune/plans.ts`; may need to extract to `locale-io/index.ts` for shared use by extract).
- Exact wording of the log messages — match the existing `pc.cyan` / `pc.yellow` / `log.warn` patterns.
- Whether to export `writeLocaleFilesAtomic` from the public API (`src/index.ts`) or keep it internal. **Recommendation: keep internal** for now — public API surface stays minimal.

### Folded Todos

None — `gsd-tools todo match-phase 1` returned zero matches.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level
- `.planning/PROJECT.md` — Project vision, constraints (no heavy deps, additive only, dry-run safety), Key Decisions.
- `.planning/REQUIREMENTS.md` — REQ-IDs SORT-01..06 + NSWRITE-03..05 mapped to this phase. Includes Out of Scope list.
- `.planning/ROADMAP.md` — Phase 1 success criteria.
- `.planning/MILESTONES.md` — v0.2.0 history; commit `54712ab` reference.
- `PHASE-EXECUTION-REPORT.md` (project root) — v0.2.0 phase execution report (note: was written before `54712ab` so it incorrectly lists namespace routing as a gap).
- `CLAUDE.md` (project root) — GitNexus impact-analysis workflow (mandatory before editing symbols).

### Existing code to read for context
- `src/core/locale-io/io.ts` — `writeLocaleFile`, `loadNamespacedLocales`, `LOCALE_EXTENSIONS`.
- `src/core/locale-io/transform.ts` — `flattenObject`, `unflattenObject`.
- `src/commands/extract.ts` — `extractFlat` (two-phase plan-then-write pattern to replicate), `extractNamespaced` (hardcoded `"default"` at line 185 — needs to read from `config.defaultNamespace`).
- `src/commands/prune/plans.ts` — `pruneFlat`, `pruneNamespaced`, `executePrunePlans` (lines 29-96 — where atomicity needs upgrading), `WritePlan` interface (line 16-23).
- `src/types.ts` — `I18nSharpenConfig` (add `sortKeys`, `defaultNamespace`, `prune.cleanEmpty`).
- `src/config/schema.ts` — zod schema (add validation for new options).
- `src/__tests__/extract.test.ts:61` — existing namespaced extract test (reference for new tests).
- `src/__tests__/prune.test.ts:232` — existing namespaced prune test.
- `src/core/locale-io.test.ts` — locale-io unit tests (atomicity, BOM handling — pattern to follow).
- `src/core/locale-io.prop.test.ts` — property-based test scaffold (pattern for sort idempotency test).

## Existing Code Insights

### Reusable Assets
- `flattenObject` / `unflattenObject` ([transform.ts](src/core/locale-io/transform.ts)) — converts between nested and dotted-flat maps. Sort can operate on either; nested form preserves structure naturally so probably sort the nested object directly.
- `writeLocaleFile` ([io.ts:178](src/core/locale-io/io.ts:178)) — already atomic per-file via `.tmp` + rename. Composes into the new `writeLocaleFilesAtomic`.
- `loadNamespacedLocales` ([io.ts:281](src/core/locale-io/io.ts:281)) — already enumerates `<langDir>/*.{json,yaml,js,cjs,mjs,ts,tsx}` per language. Use its output for "which namespace files might be empty after prune" check.
- `LOCALE_EXTENSIONS` ([io.ts:11](src/core/locale-io/io.ts:11)) — the canonical list of recognized locale extensions.
- `I18nSharpenError` ([core/errors.ts](src/core/errors.ts)) — discriminated union; use `{ kind: "filesystem", ... }` for atomicity errors.
- `log.warn`/`log.info`/`log.success` ([utils.ts](src/utils.ts)) — output helpers (avoid raw `console.*`; ESLint warns).

### Established Patterns
- **Two-phase plan-then-write** — `extractFlat` (extract.ts:69-119) and `pruneFlat`/`pruneNamespaced` (plans.ts:160, 247) already stage `writePlans` in memory before any write. The atomicity upgrade extends this pattern to "stage all `.tmp` files first, then rename".
- **Atomic single-file write** — `.tmp` + `renameSync` (io.ts:205-216). Catch rename failure, attempt to delete `.tmp`, rethrow. Pattern to extend in `writeLocaleFilesAtomic`.
- **Zod schema validation** — `I18nSharpenConfig` is zod-validated in `src/config/schema.ts`. New fields must be added there.
- **Dry-run preview format** — prune already has `executePrunePlans` (plans.ts:29-96) printing `Would prune N keys from <file>:` headers. Extend for `Would delete N empty namespace files:` cleanly.
- **Per-file logging with `pc.cyan(filename)`** — consistent across `extract` and `prune`.

### Integration Points
- `cli.ts` — add `--sort` flag to both `extract` and `prune` commands; add `--clean-empty` to `prune`. Existing pattern: `option("--force", "...")`.
- `extract.ts` line 185 + `prune/plans.ts` line 257 — replace hardcoded `"default"` with `config.defaultNamespace ?? "common"`.
- `extract.ts` and `prune/plans.ts` `executePrunePlans` — switch from looping `writeLocaleFile` to calling `writeLocaleFilesAtomic`.
- New module: `src/core/locale-io/sort.ts` — exports `sortLocaleObject(obj, mode, options)` recursively sorting keys.
- New module logic in `prune/plans.ts` — `cleanEmptyNamespaceFiles(plans, dryRun, layout)` helper. Only runs when `--clean-empty` and layout is namespaced.

## Specific Ideas

- The user said "best practice tùy bạn chọn" repeatedly. They trust technical decisions but want comprehensive edge-case coverage (their phrasing: "tôi cần cover đủ các case là ok"). This signals: lean on test coverage and property-based testing for the sort/atomicity logic.
- The user explicitly chose recursive sort for nested objects (not just top-level). This is the only deviation from "best practice tùy bạn" — they have an opinion here.
- Reset phase numbering decision (carried from milestone setup): start at Phase 1, not Phase 11.
- v0.3.0 IS the major-version-bump milestone where breaking changes are allowed (per PROJECT.md and CHANGELOG 0.2.0 announcement). So changing default ns to `"common"` is within milestone authority.

## Deferred Ideas

Came up during discussion but explicitly out of scope for Phase 1 (and v0.3.0):

- **Auto-rename `default.json` → `common.json` on `--force`** — risky, "do not touch user data silently" principle (matches prune dry-run default). Document migration instead.
- **Interactive prompt for `--clean-empty`** — would couple this work with Phase 3 IPRUNE TUI work. Keep flag-only behavior; let Phase 3 layer interactive selection if needed.
- **Custom sort comparator via callback** — Out of scope. If demand arises, expose in a later minor.
- **Per-namespace sort modes** — e.g., sort `auth` namespace alpha and `common` namespace source — too complex for marginal value. Single mode milestone-wide.
- **Sorting flat layout differently from namespaced** — same as above, single mode.
- **Nested namespace directories** (`locales/en/auth/login.json`) — already explicitly Out of Scope in REQUIREMENTS.md.

### Reviewed Todos (not folded)
None reviewed — todo match returned zero.

---

*Phase: 01-auto-sorting-keys-namespace-hardening*
*Context gathered: 2026-05-28*
