# Phase 1: Auto-Sorting Keys + Namespace Hardening — Research

**Researched:** 2026-05-28
**Domain:** TypeScript locale-file I/O pipeline (sort utility, config schema extension, CLI flag wiring, atomic multi-file writes)
**Confidence:** HIGH — all findings come from direct reading of current source files in this repository

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: `sortKeys?: "alpha" | "source" | "preserve"` config option, zod enum-validated. Default = `"preserve"`.
- D-02: `--sort=alpha|source|preserve` CLI flag overrides config per invocation.
- D-03: Alpha comparator = `Intl.Collator('en', { sensitivity: 'base', numeric: true })`.
- D-04: Sort is recursive across all nesting levels.
- D-05: Source mode uses `Set` insertion order from `detectUsedKeys`; requires `scanSourceFiles` to return paths in a stable order.
- D-06: Sort applies to both flat and namespaced layouts, both in `extract` and `prune`.
- D-07: `defaultNamespace?: string` on `I18nSharpenConfig`. Default value = `"common"` (breaking change for v0.3.0).
- D-08: Migration warning path for legacy `default.json` — log warning, do NOT auto-rename.
- D-09: `--clean-empty` flag + `prune.cleanEmpty?: boolean` config for `prune` only; namespaced layout only; never deletes `<lang>/` parent directory.
- D-10: `writeLocaleFilesAtomic(plans: WritePlan[])` — Phase A writes all `.tmp`, Phase B renames in order; failed rename mid-loop logs partial state, leaves remaining `.tmp` on disk, no rollback.

### Claude's Discretion
- Placement of `sort.ts` in `src/core/locale-io/` (sibling of `transform.ts` and `io.ts`)
- Internal naming for `WritePlan` type (extract to `locale-io/index.ts` or keep in `prune/plans.ts`)
- Exact wording of log messages (follow `pc.cyan` / `pc.yellow` / `log.warn` patterns)
- Whether to export `writeLocaleFilesAtomic` from public API — CONTEXT.md recommends keeping internal

### Deferred Ideas (OUT OF SCOPE)
- Auto-rename `default.json` → `common.json` on `--force`
- Interactive prompt for `--clean-empty`
- Custom sort comparator via callback
- Per-namespace sort modes
- Sorting flat layout differently from namespaced
- Nested namespace directories (`locales/en/auth/login.json`)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SORT-01 | `sortKeys` config option (`"alpha" \| "source" \| "preserve"`) | `I18nSharpenConfigSchema` in `schema.ts` — pattern for adding optional enum fields confirmed |
| SORT-02 | `--sort=alpha\|source\|preserve` CLI flag overrides config | `cli.ts` pattern for per-command options confirmed via `--force` / `--dry-run` model |
| SORT-03 | Default = `"preserve"` (zero diff for 0.2.x users) | No current sort; preserve = pass-through, confirmed no behavior change |
| SORT-04 | Alpha mode deterministic across all locales | `Intl.Collator('en', ...)` confirmed stable on Node 22 / ICU 77.1; all locales receive same comparator |
| SORT-05 | Source mode ordered by first-appearance in scanned code | `detectUsedKeys` uses `Set` (insertion-ordered); `scanSourceFiles` NOT sorted — **action required** (see RG-2) |
| SORT-06 | Sorting preserves nested object structure | Sort operates on nested object directly (not via flatten/unflatten round-trip) — confirmed feasible |
| NSWRITE-03 | Keys without `ns:` prefix fall into configurable `defaultNamespace` | Two hardcoded `"default"` occurrences found at `extract.ts:185` and `plans.ts:257` — exact replacement sites confirmed |
| NSWRITE-04 | Namespace files preserved unless `--clean-empty` passed | Current code never deletes namespace files; new `cleanEmpty` guard added to prune only |
| NSWRITE-05 | Cross-file atomicity for prune (no partial state) | `writeLocaleFile` already does per-file `.tmp`+rename; `writeLocaleFilesAtomic` composes on top |
</phase_requirements>

---

## Phase Summary

Phase 1 adds a `sortKeys` config/CLI option that controls key ordering when `extract` or `prune` writes locale files (`"alpha"` / `"source"` / `"preserve"`, defaulting to `"preserve"` for zero-diff on existing users), plus three targeted hardening changes to the namespaced write path: a `defaultNamespace` config field replacing the hardcoded `"default"` string in two locations, a `--clean-empty` CLI flag that deletes empty namespace files after prune (namespaced layout only), and a new `writeLocaleFilesAtomic` helper that writes all files to `.tmp` first and renames atomically so a mid-prune failure never leaves the locale set in a mixed pruned/unpruned state. All changes are either additive or protected behind new flags; no existing behavior changes without opt-in.

---

## Locked Decisions Acknowledged

| ID | Decision | Confirmed |
|----|----------|-----------|
| D-01 | `sortKeys?: "alpha" \| "source" \| "preserve"` with zod enum validation | Config shape verified in `src/types.ts` and `src/config/schema.ts` — pattern is clear |
| D-02 | `--sort` CLI flag per-command override | `src/cli.ts` per-command `.option()` pattern confirmed via `--force` / `--dry-run` model |
| D-03 | `Intl.Collator('en', { sensitivity: 'base', numeric: true })` | Verified live on Node v22.21.0 / ICU 77.1; numeric sort works as expected |
| D-04 | Recursive sort across all nesting levels | `sort.ts` will recurse into `Record<string, unknown>` values — no existing facility conflicts |
| D-05 | Source mode = `Set` insertion order from `detectUsedKeys` | `Set` insertion order confirmed in scanner; `scanSourceFiles` does NOT sort entries (see RG-2) |
| D-06 | Sort applies to flat and namespaced layouts, both `extract` and `prune` | Write paths confirmed in `extract.ts` and `plans.ts` — single `sortLocaleObject` call site applies to both |
| D-07 | `defaultNamespace` default = `"common"` | Breaking change confirmed correct; migration warning path ready to implement |
| D-08 | Warning for legacy `default.json`, no auto-rename | Warning logic is additive; no file-mutation risk |
| D-09 | `--clean-empty` deletes only empty namespaced files; flat layout exempt | `prune` only; flat layout exemption noted in `plans.ts` structure |
| D-10 | Two-phase atomicity — write all `.tmp` then rename; no rollback after partial commit | `writeLocaleFile` internals read at `io.ts:205-216` — composable pattern confirmed |
| D-11 | Tests required (each mode × layout × edge cases × property-based) | Vitest + fast-check infrastructure confirmed, 72 tests currently passing |
| D-12 | No test for system locale drift; `Intl.Collator('en', ...)` trusted | Verified stable on current Node; documented |

---

## Codebase Surface

### Files to Modify

| File | Change | Key Lines |
|------|--------|-----------|
| `src/types.ts` | Add `sortKeys?: "alpha" \| "source" \| "preserve"`, `defaultNamespace?: string`, `prune.cleanEmpty?: boolean` | Lines 1-56 (entire `I18nSharpenConfig` interface) |
| `src/config/schema.ts` | Add zod validation for `sortKeys` (enum), `defaultNamespace` (string), `prune.cleanEmpty` (boolean) | Lines 73-96 (`I18nSharpenConfigSchema`) |
| `src/commands/extract.ts` | (1) Replace `"default"` at line 185 with `config.defaultNamespace ?? "common"`. (2) Add D-08 migration warning. (3) Pass `sortKeys` into write path. (4) Switch to `writeLocaleFilesAtomic`. | Lines 157-288 (`extractNamespaced`), line 185 |
| `src/commands/prune/plans.ts` | (1) Replace `"default"` at line 257 with `config.defaultNamespace ?? "common"`. (2) `executePrunePlans` → `writeLocaleFilesAtomic`. (3) Add `cleanEmptyNamespaceFiles` helper. (4) Pass `sortKeys` into write path. | Lines 16-23 (`WritePlan`), 29-96 (`executePrunePlans`), 197-309 (`pruneNamespaced`) |
| `src/core/locale-io\index.ts` | Re-export new `sort.ts` exports and `writeLocaleFilesAtomic` | Currently 2 lines — add export lines |
| `src/core/locale-io\io.ts` | Add `writeLocaleFilesAtomic(plans: WritePlan[])` | After `writeLocaleFile` (line 217+) |
| `src/cli.ts` | Add `--sort <mode>` option to `extract` and `prune` commands; add `--clean-empty` to `prune` | Lines 65-136 |
| `src/core/scanner/files.ts` | Sort entries in `getFiles` for stable source-mode ordering (see RG-2) | Lines 30-43 |

### Files to Create

| File | Purpose |
|------|---------|
| `src/core/locale-io/sort.ts` | `sortLocaleObject(obj, mode, keyOrder?)` — recursive sort utility; exports `SortMode` type |
| `src/__tests__/sort.test.ts` | Unit + property-based tests for sort utility (D-11, D-12) |
| `src/__tests__/atomic.test.ts` | Unit tests for `writeLocaleFilesAtomic` failure modes (D-11) |

---

## Symbol Impact Map

### `writeLocaleFile` (`src/core/locale-io/io.ts:178`)
**Callers:**
- `extractFlat` (extract.ts:130) — direct loop
- `extractNamespaced` (extract.ts:269) — direct loop
- `executePrunePlans` (plans.ts:63) — direct loop

**Change:** `writeLocaleFilesAtomic` will call `writeLocaleFile` internally (per-file still atomic). The loop-based callers in extract and prune will be replaced with a single `writeLocaleFilesAtomic` call.
**Risk:** LOW — `writeLocaleFile` itself is not modified; behavior preserved for single-file callers.

### `extractNamespaced` (`src/commands/extract.ts:157`)
**Callers:**
- `extract` (extract.ts:44) — conditional on `localesLayout === "namespaced"`

**Changes needed:**
1. Line 185: `"default"` → `config.defaultNamespace ?? "common"` [VERIFIED: extract.ts:185]
2. Add D-08 migration warning scan (after `loadNamespacedLocales` returns, before write loop)
3. Replace looping `writeLocaleFile` (lines 261-278) with `writeLocaleFilesAtomic`
4. Apply `sortLocaleObject` to each `nestedJson` before adding to write items

**Risk:** MEDIUM — touches existing namespaced extract path. One existing test (`extract.test.ts:61`) asserts the `default.json` output by name; after D-07 that test must be updated to expect `common.json`.

### `executePrunePlans` (`src/commands/prune/plans.ts:29`)
**Callers:**
- `pruneFlat` (plans.ts:190)
- `pruneNamespaced` (plans.ts:301) — via `flatPlans` adapter

**Changes needed:**
1. Replace `writeLocaleFile` loop (lines 61-72) with `writeLocaleFilesAtomic`
2. Add `--clean-empty` deletion step (namespaced only) after rename phase
3. Sort each `plan.nestedJson` before passing to write helper

**Risk:** MEDIUM — central write path for prune. The `WritePlan` interface (lines 16-23) will need to be usable by `writeLocaleFilesAtomic`; may need extraction or re-export from `locale-io`.

### `pruneNamespaced` (`src/commands/prune/plans.ts:197`)
**Callers:**
- `prune` (commands/prune/index.ts) — conditional on `localesLayout === "namespaced"`

**Changes needed:**
1. Line 257: `"default"` → `config.defaultNamespace ?? "common"` [VERIFIED: plans.ts:257]
2. Wire `cleanEmpty` behavior (detect post-prune empty `nestedJson`s, pass to deletion helper)

**Risk:** LOW for existing behavior; the empty-file deletion is guarded behind `cleanEmpty` flag.

### `scanSourceFiles` / `getFiles` (`src/core/scanner/files.ts`)
**Callers:**
- `extract` (extract.ts:34)
- `prune` (commands/prune/index.ts)
- `validate` (commands/validate/index.ts)

**Change needed for D-05:** `getFiles` uses `fs.readdirSync` which returns entries in OS-filesystem order — not sorted. On Windows NTFS this is typically creation order; on Linux ext4 it is usually alphabetical but not guaranteed. [VERIFIED: live analysis confirms no sort step in `getFiles`]

**Action required:** Add `entries.sort((a, b) => a.name.localeCompare(b.name))` after `readdirSync` in `getFiles`. This is a **pre-existing correctness gap** for source-mode. The sort is also benign for alpha/preserve modes — it makes file traversal stable cross-platform.

**Risk:** LOW — purely additive ordering, no behavioral change to key detection. All three commands benefit. Test on Windows/Linux CI confirms behavior.

### `loadNamespacedLocales` (`src/core/locale-io/io.ts:281`)
**Callers:**
- `extractNamespaced` (extract.ts:164)
- `pruneNamespaced` (plans.ts:206)

**Change:** No modification to this function. The D-08 migration warning scan uses its `localeNamespaces` return value (the map of `ns → filePath`) to detect `default.*` files without `common.*` sibling.
**Risk:** NONE.

---

## Open Questions Resolved

### RG-1: `sort.ts` module placement and shape

**Answer:** [VERIFIED: src/core/locale-io/ directory listing]

Place as `src/core/locale-io/sort.ts`, sibling to `transform.ts` and `io.ts`. Export from `src/core/locale-io/index.ts`.

Recommended API:

```typescript
// src/core/locale-io/sort.ts
export type SortMode = "alpha" | "source" | "preserve"

/**
 * Recursively sort keys in a locale object.
 * - alpha: Intl.Collator('en', { sensitivity: 'base', numeric: true })
 * - source: keyOrder Set (insertion order from detectUsedKeys)
 * - preserve: identity (return same object reference)
 */
export function sortLocaleObject(
  obj: Record<string, unknown>,
  mode: SortMode,
  keyOrder?: Set<string>
): Record<string, unknown>
```

No existing sort utility exists in `src/core/locale-io/` — confirmed by directory listing showing only `index.ts`, `transform.ts`, `io.ts`.

### RG-2: `scanSourceFiles` ordering — is it stable?

**Answer:** [VERIFIED: live code analysis + Node v22.21.0 test]

`getFiles` in `src/core/scanner/files.ts` calls `fs.readdirSync(dir, { withFileTypes: true })` with **no subsequent sort**. On Windows NTFS the order is creation/allocation order; on Linux ext4 it is hash-bucket order (not alphabetical). The order is therefore **NOT stable across platforms or across file-creation sequences**.

**Required fix:** Add `entries.sort((a, b) => a.name.localeCompare(b.name))` immediately after the `readdirSync` call in `getFiles` (line 27). This guarantees stable traversal order for source mode and also prevents CI flakiness on Linux when source mode is enabled.

Note: the existing `usedKeys` is a `Set` — JS `Set` preserves insertion order deterministically once files are visited in stable order. So fixing `getFiles` is the only prerequisite.

### RG-3: `WritePlan` reuse — extract to `locale-io`?

**Answer:** [VERIFIED: src/commands/prune/plans.ts:16-23]

`WritePlan` is currently a **file-private `interface`** in `plans.ts` (not exported). `writeLocaleFilesAtomic` needs it. Options:

1. **Export `WritePlan` from `plans.ts`** (minimal change, but `locale-io` importing from `commands/prune` inverts the dependency direction).
2. **Move `WritePlan` to `src/core/locale-io/io.ts`** and import it in `plans.ts` (correct direction: core ← commands).
3. **Redefine inline in `io.ts`** with just the fields `writeLocaleFilesAtomic` needs (`filePath` + object).

**Recommendation:** Option 2 — move to `src/core/locale-io/io.ts` (or define a minimal `WriteLocaleFilePlan` there). The `WritePlan` in `plans.ts` has prune-specific fields (`prunedKeys`, `displayName`); `writeLocaleFilesAtomic` only needs `{ langPath: string; nestedJson: Record<string, unknown> }`. Define a new minimal `WriteLocalePlan` in `io.ts` and let `WritePlan` in `plans.ts` extend or alias it.

### RG-4: `writeLocaleFile` internals — exact failure modes

**Answer:** [VERIFIED: src/core/locale-io/io.ts:178-217]

Current implementation:
1. Formats content (JSON.stringify or YAML.stringify, ensures trailing newline)
2. Writes to `${filePath}.tmp` via `fs.writeFileSync(tmpPath, content, "utf8")`
3. Renames `.tmp` → `filePath` via `fs.renameSync(tmpPath, filePath)`
4. On rename failure: attempts `fs.unlinkSync(tmpPath)` (suppresses secondary unlink error), then re-throws the original rename error

**Failure modes for `writeLocaleFilesAtomic`:**

| Phase | Failure | Current behavior | `writeLocaleFilesAtomic` behavior |
|-------|---------|-----------------|-----------------------------------|
| Phase A: writeFileSync | ENOENT (parent dir missing) | throws immediately | catch → delete all `.tmp` written so far → throw `I18nSharpenError({ kind: "filesystem" })` |
| Phase A: writeFileSync | ENOSPC (disk full) | throws immediately | same as above |
| Phase A: writeFileSync | EACCES (permission) | throws immediately | same as above |
| Phase B: renameSync | ENOENT (`.tmp` was deleted externally) | `.tmp` cleanup attempted, original error thrown | log "partial commit: files 1..N renamed, files N+1..M remain as .tmp"; throw |
| Phase B: renameSync | EPERM / EACCES | `.tmp` cleanup attempted, original error thrown | same partial commit log |
| Phase B: renameSync | ENOTEMPTY (target is non-empty dir) | `.tmp` cleanup attempted, original error thrown | same partial commit log |

**Key insight:** Phase A failures are safe (no originals touched). Phase B failures are the "limited failure window" D-10 documents — once `n` files have been renamed, those `n` originals are already overwritten. Rollback would require writing them back, which is itself error-prone. D-10 explicitly documents this as acceptable.

### RG-5: Where `"default"` is hardcoded — complete audit

**Answer:** [VERIFIED: grep across entire src/]

Exactly two occurrences, confirming CONTEXT.md:

- `src/commands/extract.ts:185` — `const ns = colonIdx >= 0 ? fullKey.slice(0, colonIdx) : "default"`
- `src/commands/prune/plans.ts:257` — `const ns = colonIdx >= 0 ? namespacedKey.slice(0, colonIdx) : "default"`

The other `"default"` occurrences in `io.ts` (lines 76, 117) refer to JS module default export detection (`"default" in mod`) — unrelated to namespace names. No other namespace-name hardcodings found.

**Side effect for tests:** `src/__tests__/extract.test.ts:99-104` asserts that `locales/en/default.json` is created for un-prefixed keys. After D-07, this test must be updated to expect `locales/en/common.json` (or a `defaultNamespace: "default"` config must be passed to the test to preserve the old behavior).

### RG-6: Config schema integration pattern

**Answer:** [VERIFIED: src/config/schema.ts and src/types.ts]

Pattern for optional config fields is clear:
- Optional flat fields: `z.string().optional()`, `z.boolean().optional()`, `z.enum([...]).optional()`
- Nested optional object: `z.object({ force: z.boolean().optional() }).optional()` — existing `prune` object at lines 91-95

New fields to add:

```typescript
// In I18nSharpenConfigSchema (schema.ts)
sortKeys: z.enum(["alpha", "source", "preserve"]).optional(),
defaultNamespace: z.string().nonempty().optional(),
prune: z.object({
  force: z.boolean().optional(),
  cleanEmpty: z.boolean().optional()   // NEW
}).optional()

// In I18nSharpenConfig (types.ts) — parallel additions
sortKeys?: "alpha" | "source" | "preserve"
defaultNamespace?: string
prune?: {
  force?: boolean
  cleanEmpty?: boolean  // NEW
}
```

`DEFAULT_CONFIG` in `schema.ts` does not need a `sortKeys` or `defaultNamespace` entry (undefined = `"preserve"` and `"common"` respectively — defaults handled at use site).

### RG-7: CLI option pattern

**Answer:** [VERIFIED: src/cli.ts]

Pattern is `commander` `.option(flags, description, defaultValue)` on each subcommand. Per-command options (not global) match the D-02 requirement.

Current `prune` command uses `.option("--force", ...)` and `.option("--dry-run", ...)` with the handler receiving `cmdOpts: { dryRun?: boolean; force?: boolean }`.

For `--sort`, commander parses `--sort=alpha` as `cmdOpts.sort === "alpha"`. The flag needs a value argument:

```typescript
// On both extract and prune commands:
.option("--sort <mode>", "Sort key order: alpha, source, or preserve", undefined)
// cmdOpts: { sort?: string }
// Validation: check cmdOpts.sort against the three valid values; throw/warn on invalid

// On prune command only:
.option("--clean-empty", "Delete namespace files that are empty after pruning", false)
// cmdOpts: { cleanEmpty?: boolean }
```

Config merge: CLI flag wins over config file. Pattern is `cmdOpts.force === true` — same pattern for `sort` and `cleanEmpty`.

### RG-8: Test infrastructure

**Answer:** [VERIFIED: src/__tests__/, src/core/locale-io.test.ts, src/core/locale-io.prop.test.ts]

**Test framework:** Vitest 1.5.x + fast-check 4.8.x (confirmed in package.json). All 72 tests currently green.

**Integration test pattern** (`src/__tests__/extract.test.ts`, `prune.test.ts`):
- `createMockProject(tempDir, { "path": "content" })` creates temp dir + files
- `beforeEach` / `afterEach` with `vi.spyOn(console, ...)` to suppress log output
- `afterEach` deletes `tempDir` with `fs.rmSync`
- Assertions via `readLocaleFile` + `flattenObject` + `toMatchObject`/`toEqual`

**Unit test pattern** (`src/core/locale-io.test.ts`):
- `tmp(slug)` generates a unique scratch directory under `../../scratch/`
- `afterEach` cleanup with `fs.rmSync`
- fs failure simulation: `fs.mkdirSync(target)` + blocker file to force `renameSync` to fail (line 137-140)
- Tests cover: write/read roundtrip, atomicity, BOM, JS/CJS loading

**Property-based test pattern** (`src/core/locale-io.prop.test.ts`):
- `fc.letrec` for recursive structure generation
- `fc.property(tree, fn)` wrapped in `fc.assert`
- `fc.stringMatching(/^[A-Za-z0-9_-]+$/)` for safe keys (avoids dot-collision)

**For sort tests, needed patterns:**
- Idempotency: `fc.property(tree, sortMode, obj => sort(sort(obj)) deepEquals sort(obj))`
- Key-set preservation: `fc.property(tree, obj => flatKeys(sort(obj)) deepEquals flatKeys(obj))`
- Numeric ordering: `['key10', 'key2', 'key1']` → `['key1', 'key2', 'key10']`
- Unicode: `['über', 'apple', 'äpfel']` — case-insensitive sensitivity check
- Nested recursion: `{a: {z: 1, a: 2}}` → `{a: {a: 2, z: 1}}`

**For `writeLocaleFilesAtomic` tests:**
- Use `vi.spyOn(fs, 'writeFileSync')` to simulate Phase A failure on file N
- Use `vi.spyOn(fs, 'renameSync')` to simulate Phase B failure on file N
- Assert `.tmp` file count after each failure type

### RG-9: `I18nSharpenError` discriminated union

**Answer:** [VERIFIED: src/core/errors.ts]

The `{ kind: "filesystem"; message: string; path: string; cause?: unknown }` variant already exists in `I18nError`. No new variant is needed. `writeLocaleFilesAtomic` will throw:

```typescript
throw new I18nSharpenError({
  kind: "filesystem",
  message: `Atomic write failed: could not write .tmp file for '${plan.langPath}': ${(err as Error).message}`,
  path: plan.langPath,
  cause: err
})
```

The existing CLI catch in `cli.ts:19-23` handles `I18nSharpenError` by printing `[filesystem] <message>` — no CLI changes needed for error reporting.

---

## Validation Architecture

Gates proving each locked decision was implemented correctly:

| Decision | Validation Gate | Test File | Command |
|----------|----------------|-----------|---------|
| D-01 | Config schema accepts and rejects each `sortKeys` value; config tests | `src/__tests__/config.test.ts` (extend) | `pnpm test --run config` |
| D-02 | `--sort=alpha` overrides config `sortKeys: "preserve"` in integration test | `src/__tests__/extract.test.ts` (new) | `pnpm test --run extract` |
| D-03 | `Intl.Collator` produces: `key1 < key2 < key10`, `apple == Apple`, Unicode stable | `src/__tests__/sort.test.ts` (new) | `pnpm test --run sort` |
| D-04 | Nested `{a: {z: 1, a: 2}}` → `{a: {a: 2, z: 1}}` after alpha sort | `src/__tests__/sort.test.ts` (new) | `pnpm test --run sort` |
| D-05 | Source mode: keys in file-occurrence order; stable across two runs with same source | `src/__tests__/extract.test.ts` (new) | `pnpm test --run extract` |
| D-06 | Sort applied in flat extract, namespaced extract, flat prune, namespaced prune | `src/__tests__/extract.test.ts` + `prune.test.ts` (new cases) | `pnpm test` |
| D-07 | Un-prefixed key in namespaced layout → `common.json` by default; `defaultNamespace: "auth"` → `auth.json` | `src/__tests__/extract.test.ts` (update + new) | `pnpm test --run extract` |
| D-08 | Warning logged when `default.json` exists + `common.json` absent + `defaultNamespace` unset | `src/__tests__/extract.test.ts` (new, capture `warnSpy`) | `pnpm test --run extract` |
| D-09 | `--clean-empty`: empty ns file deleted; dry-run shows "Would delete"; flat `{}` NOT deleted | `src/__tests__/prune.test.ts` (new) | `pnpm test --run prune` |
| D-10 Phase A | Phase A failure → all `.tmp` cleaned, no original touched | `src/__tests__/atomic.test.ts` (new, `vi.spyOn(fs, 'writeFileSync')`) | `pnpm test --run atomic` |
| D-10 Phase B | Phase B failure mid-rename → log captures committed vs pending files; `.tmp` remain | `src/__tests__/atomic.test.ts` (new, `vi.spyOn(fs, 'renameSync')`) | `pnpm test --run atomic` |
| D-11 | Property: `sort(sort(obj)) === sort(obj)` (idempotent); `flatKeys(sort(obj)) === flatKeys(obj)` (no key loss) | `src/core/locale-io.prop.test.ts` (extend) | `pnpm test --run prop` |
| D-12 | (No test — `Intl.Collator('en', ...)` trusted to be stable per ICU version contract) | N/A | N/A |

**Sampling rates:**
- Per task commit: `pnpm test --run` (runs full vitest suite, ~3s on current baseline)
- Per wave merge: `pnpm tsc --noEmit && pnpm test --run && pnpm build`
- Phase gate (before `/gsd-verify-work`): full suite green + `pnpm build` clean

**Wave 0 gaps (test files to create before implementation):**
- [ ] `src/__tests__/sort.test.ts` — covers D-03, D-04, D-05, D-06, D-11 (property-based)
- [ ] `src/__tests__/atomic.test.ts` — covers D-10 Phase A and Phase B failure modes

---

## Recommended Plan Decomposition

The following boundary split is recommended. The planner decides final shape.

**Plan 01: Sort utility + config wiring**
- Create `src/core/locale-io/sort.ts` with `sortLocaleObject`
- Add `sortKeys` to `src/types.ts` and `src/config/schema.ts`
- Fix `getFiles` sorting (prerequisite for D-05)
- Wire `sortLocaleObject` call into `extractFlat`, `extractNamespaced`, `executePrunePlans`
- Add `--sort` flag to `cli.ts` for both `extract` and `prune`
- Tests: `sort.test.ts` (unit + property-based for D-03/D-04/D-05/D-11)
- Touches: `sort.ts` (new), `types.ts`, `schema.ts`, `extract.ts`, `plans.ts`, `cli.ts`, `files.ts`

**Plan 02: `defaultNamespace` + migration warning**
- Add `defaultNamespace` to `src/types.ts` and schema
- Replace two `"default"` hardcodings at `extract.ts:185` and `plans.ts:257`
- Add D-08 migration warning logic in `extractNamespaced` and `pruneNamespaced`
- Update `src/__tests__/extract.test.ts:99-104` (existing test asserts `default.json` → now `common.json`)
- Tests: new cases for `defaultNamespace: "auth"` routing, legacy warning, no-warning when `common.json` present
- Touches: `types.ts`, `schema.ts`, `extract.ts`, `plans.ts`, existing `extract.test.ts`

**Plan 03: `--clean-empty` flag**
- Add `prune.cleanEmpty` to `src/types.ts` and schema
- Add `cleanEmptyNamespaceFiles(plans, dryRun)` helper in `plans.ts`
- Wire into `pruneNamespaced` (namespaced layout only)
- Add `--clean-empty` flag to `cli.ts` prune command
- Tests: empty ns after prune → file deleted; dry-run "Would delete"; flat `{}` NOT deleted
- Touches: `types.ts`, `schema.ts`, `plans.ts`, `cli.ts`

**Plan 04: `writeLocaleFilesAtomic` + integration**
- Define minimal `WriteLocalePlan` type in `src/core/locale-io/io.ts`
- Implement `writeLocaleFilesAtomic` (Phase A + Phase B with partial-commit logging)
- Wire `extractNamespaced` and `executePrunePlans` to use it
- Re-export from `locale-io/index.ts` (internal only — not added to `src/index.ts`)
- Tests: `atomic.test.ts` (Phase A failure, Phase B failure, success path)
- Touches: `io.ts`, `locale-io/index.ts`, `extract.ts`, `plans.ts`

**Rationale for this order:** Plans 01-03 are independently testable; Plan 04 upgrades the write path and can be validated against the same integration tests from Plans 01-03. Plan 02 has a test update dependency (the existing `default.json` assertion) that must be handled before the plan is marked green.

---

## Security Domain

No new attack surface introduced. All inputs are:
- Config fields validated by zod schema before use
- File paths computed from `localesDir` + `lang` + `ns` (controlled values, not user input at runtime)
- Sort comparator is a pure function with no external input

Existing prototype-pollution guards in `flattenObject` / `setNestedValue` (`FORBIDDEN_KEY_SEGMENTS`) are unaffected.

---

## Environment Availability

Step 2.6: SKIPPED — Phase is code/config-only changes to an existing TypeScript project. No new external tools, services, or CLIs are introduced. Node v22.21.0 confirmed present; `pnpm`, `vitest`, `fast-check`, `typescript` all already installed and in use.

---

## Runtime State Inventory

Step 2.5: NOT APPLICABLE — this is a greenfield-within-existing-codebase phase, not a rename/refactor/migration. No stored data, live service config, OS registrations, secrets, or build artifacts reference strings being changed.

Exception: the string `"default"` is used as a namespace name value in existing test locale files (`locales/en/default.json` in test fixture at `extract.test.ts:99`). This is a test-only fixture created and deleted per test run — no persistent on-disk state.

---

## Sources

### Primary (HIGH confidence — verified by direct source read)
- `src/core/locale-io/io.ts` — `writeLocaleFile` internals (lines 178-217), `loadNamespacedLocales` (lines 281-335), `LOCALE_EXTENSIONS`
- `src/core/locale-io/transform.ts` — `flattenObject`, `unflattenObject`, `buildNestedObject`
- `src/commands/extract.ts` — `extractNamespaced` (line 185 hardcoded `"default"` confirmed)
- `src/commands/prune/plans.ts` — `WritePlan` (lines 16-23), `executePrunePlans` (lines 29-96), `pruneNamespaced` (line 257 hardcoded `"default"` confirmed)
- `src/types.ts` — full `I18nSharpenConfig` interface (lines 1-56)
- `src/config/schema.ts` — `I18nSharpenConfigSchema` + `DEFAULT_CONFIG` pattern (lines 73-96)
- `src/cli.ts` — commander option wiring pattern (lines 65-136)
- `src/core/errors.ts` — `I18nError` discriminated union (`filesystem` variant confirmed)
- `src/core/scanner/files.ts` — `getFiles` / `scanSourceFiles` — `readdirSync` without sort confirmed
- `src/core/locale-io.test.ts` — test patterns (atomicity, fs failure mocking)
- `src/core/locale-io.prop.test.ts` — fast-check property test scaffold
- `src/__tests__/extract.test.ts` — integration test pattern; `default.json` assertion at line 99
- `src/__tests__/prune.test.ts` — namespaced prune test at line 232

### Secondary (HIGH confidence — live runtime verification)
- Node v22.21.0 + ICU 77.1: `Intl.Collator('en', { sensitivity: 'base', numeric: true })` verified to sort `key1 < key2 < key10` and treat `apple == Apple` — [VERIFIED: live node -e test]
- 72 vitest tests confirmed passing — [VERIFIED: pnpm test --run]

---

## RESEARCH COMPLETE

**Phase:** 1 — Auto-Sorting Keys + Namespace Hardening
**Confidence:** HIGH — all findings from direct source reads; zero assumed facts

### Key Findings

1. **Two `"default"` hardcodings, exactly where CONTEXT.md said:** `extract.ts:185` and `plans.ts:257`. Both are trivial single-line replacements. One existing test (`extract.test.ts:99`) asserts `default.json` by name and must be updated in Plan 02.

2. **`scanSourceFiles` is NOT sorted:** `getFiles` in `scanner/files.ts` calls `readdirSync` without sorting entries. This is a pre-existing correctness gap that must be fixed (one-line `entries.sort(...)` before the for-loop) as a prerequisite for source-mode determinism (D-05). Fixing it is safe for all three commands.

3. **`WritePlan` is file-private in `plans.ts`:** `writeLocaleFilesAtomic` needs a write-plan type. The correct architectural fix is to define a minimal `WriteLocalePlan` in `src/core/locale-io/io.ts` (dependency direction: core ← commands) and have `plans.ts`'s `WritePlan` reference it.

4. **`I18nSharpenError({ kind: "filesystem" })` already exists:** No new error variant needed. `writeLocaleFilesAtomic` can throw the existing variant directly.

5. **Test infrastructure is solid:** Vitest + fast-check already in use; `vi.spyOn(fs, 'renameSync')` / `vi.spyOn(fs, 'writeFileSync')` is the correct pattern for failure-mode simulation. Property-based scaffold in `locale-io.prop.test.ts` provides the exact model for idempotency tests.

### File Created
`.planning/phases/01-auto-sorting-keys-namespace-hardening/01-RESEARCH.md`

### Confidence Assessment
| Area | Level | Reason |
|------|-------|--------|
| Standard Stack | HIGH | Direct source reads; no external dependencies involved |
| Architecture | HIGH | All call paths verified; exact line numbers confirmed |
| Pitfalls | HIGH | `scanSourceFiles` ordering gap discovered live; `WritePlan` scoping confirmed; test fixture conflict identified |

### Open Questions
None — all 10 research goals resolved with verified source evidence.

### Ready for Planning
Research complete. Planner can now create PLAN.md files for the four recommended plan boundaries.
