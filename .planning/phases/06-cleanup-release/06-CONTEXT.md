# Phase 6: Cleanup & Release - Context

**Gathered:** 2026-06-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Two jobs, now that AST is the verified default (Phase 5 flipped `useAst` → true and both gates passed):

1. **Cleanup (CLEAN-01)** — Delete the now-dead regex scanner code and the shadow `useAst` flag. Delete `regex.ts`, `dynamic.ts`, `hardcoded.ts`, and the `scanner.ts` shim; move `isHardcodedIgnored` into `text.ts` *first*; drop the `escapeRegex` re-export from `utils.ts`; remove the `useAst` flag from `detectUsedKeys` and its four consumers.
2. **Release (CLEAN-02)** — Write the BREAKING CHANGELOG, bump the version to **0.4.0**, and tag it.

**In scope:** CLEAN-01 (delete regex engine + flag), CLEAN-02 (BREAKING CHANGELOG), the 0.4.0 version bump + annotated git tag, repurposing/removing the transitional gate tooling (`shadow-compare.ts` / `bench.ts`), a full README update for the breaking changes, and a surgical test cleanup that confirms behavioral coverage survives.

**Out of scope:** `npm publish` and any public release action (deliberate manual/CI step the user runs after this phase). New features. Anything from the deferred list below (CACHE-01, STRICT-01, DEPFALL-01, larger corpus). Re-litigating locked decisions (TS Compiler API engine, async API, internal-only `useAst`).

</domain>

<decisions>
## Implementation Decisions

### Release scope & mechanics (CLEAN-02 + version bump)
- **D-01:** **Prep + tag, do NOT publish.** This phase bumps `package.json` version to **0.4.0**, writes the BREAKING CHANGELOG, commits, and creates an **annotated git tag `v0.4.0`** — matching the existing tag convention (`v0.2.1`…`v0.3.0` all tagged). It stops short of `npm publish`; the actual public release stays a deliberate manual/CI action the user takes afterward.
- **D-02:** Version is **0.4.0** (already locked by the milestone — minor bump, pre-1.0, async API is the "breaking" change that justifies it). No question remained here.
- **D-03:** CHANGELOG's BREAKING section documents the three CLEAN-02 items: (1) async public API — `validate`/`extract`/`prune` now return `Promise`; (2) new optional peer deps (`typescript`, `@vue/compiler-sfc`, `svelte`, `@astrojs/compiler`) with per-framework install instructions; (3) the regex→AST engine change. Migration-snippet depth/wording is Claude's discretion.

### Transitional gate tooling (Phase 5's deferred decision)
- **D-04:** **Delete `scripts/shadow-compare.ts` and the `shadow` package script.** It was a one-time pre-flip parity proof that diffs regex-vs-AST; with regex gone there is nothing to diff, so it serves no further purpose.
- **D-05:** **Repurpose `scripts/bench.ts` into an absolute AST-only perf benchmark.** It currently computes a *live regex-vs-AST delta* (Phase 5 D-09) — impossible once regex is deleted. Convert it to measure the AST path's absolute timing over the existing 50-file slice (keep the warmup + median-of-N hand-rolled approach; zero new deps). Keep the `bench` package script.
- **D-06:** **The repurposed bench is REPORT-ONLY in CI — it does not fail the build.** Keep the `pnpm bench` step in `.github/workflows/ci.yml` but make it print AST timing numbers for visibility without a hard threshold. Rationale: Phase 5 D-09 deliberately avoided absolute baselines because CI-runner speed varies machine-to-machine; a hard absolute gate would flake. This keeps a perf signal without false failures.

### README / docs (release correctness)
- **D-07:** **Full README update.** Three edits: (1) fix the Programmatic API examples (`README.md` §"Programmatic API", ~line 206) from the now-incorrect **sync** form to **async** (`const results = await validate(...)`, `await extract(...)`, `await prune(...)`, `await`-ed in the `try` block); (2) add a **"Migration to 0.4.0"** section (sync→async callers must `await`; new optional peer deps) alongside the existing "Migration from 0.0.x/0.1.x"; (3) update install docs to mention the optional per-framework compiler peer deps. Shipping a breaking release with docs that show an API that no longer works is unacceptable.

### Test cleanup (CLEAN-01 / ROADMAP criterion #2)
- **D-08:** **Surgical, verify-then-delete.** Before deleting any test, confirm its behavioral assertions already exist in the AST parser tests (`src/__tests__/parsers/*.test.ts`). Only drop tests that are provably regex-internal **and** covered elsewhere. Never silently lose behavioral coverage; the full suite must stay green.
- **D-09:** **Repoint surviving shared-function tests, don't delete them.** `isHardcodedIgnored` tests move to follow it into `text.ts` (import from `@/core/scanner/text`). Any shared utility currently tested via `src/core/scanner.test.ts` (e.g. `stripComments`, `isKeyUsed`, `getBaseKey`, `matchWildcard`) that still backs the AST path or `looseKeyMatch` must keep its coverage, repointed to wherever the function now lives — only the genuinely regex-internal helpers (`buildKeyRegex`, `buildAttrRegex`, etc.) die with `regex.ts`.
- **D-10:** **De-flag `ast-shadow.test.ts`, keep it.** With the `useAst` flag removed, `useAst: true` arguments won't type-check. Remove the now-redundant flag from those calls rather than deleting the tests — they are real end-to-end AST behavioral tests (Tests A–H + the Phase 5 D-16 default-is-AST guard) and should survive de-flagged.

### Carried forward from prior phases (locked — not re-asked)
- Delete `regex.ts` / `dynamic.ts` / `hardcoded.ts` / `scanner.ts` shim; **move `isHardcodedIgnored` → `text.ts` FIRST** (STATE.md carry-forward); drop the `escapeRegex` re-export from `utils.ts`; remove the `useAst` flag from `detectUsedKeys` (`src/core/scanner/index.ts`) and its four flip-site consumers (`validate.ts`, `extract.ts`, `prune.ts`, plus `cli.ts` which passes nothing). (CLEAN-01)
- `useAst` is internal-only and is being removed entirely — no env-var/config/CLI flag is exposed in its place (Phase 4 D-08/D-09; "permanent regex fallback" is Out-of-Scope).
- `fileContents` (stripped-comment source per file) must remain in `detectUsedKeys`'s return so `looseKeyMatch` keeps working (Phase 4 carry-forward) — deleting regex code must not drop it.

### Claude's Discretion
- CHANGELOG migration-snippet depth and exact wording (a sync→async `await` code example is encouraged but not mandated).
- Commit ordering/atomicity of the deletions (e.g. move `isHardcodedIgnored`→`text.ts` + repoint imports in one commit before the bulk delete; the version-bump + tag as the isolated final step). Keep each step independently revertable.
- The repurposed bench's exact implementation — warmup count, N iterations, output format — provided it stays dependency-free and report-only.
- The precise per-file/per-function test disposition (which assertions in `scanner.test.ts` survive vs die) — mapped during research per the D-08 verify-before-delete principle.
- Whether `escapeRegex` removal needs a grep for remaining consumers first (recommended) and whether `utils.ts` survives at all if it only re-exported regex helpers.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external `docs/` ADRs or design specs exist in this repo — requirements and decisions live entirely in `.planning/` and the source tree.

### Requirements & success criteria
- `.planning/REQUIREMENTS.md` — **CLEAN-01** (delete regex modules + flag; move `isHardcodedIgnored`→`text.ts`; drop `escapeRegex` re-export) and **CLEAN-02** (BREAKING CHANGELOG: async API, peer deps + install, regex→AST). Plus the Out-of-Scope table ("permanent regex fallback" rejected) and deferred CACHE-01/STRICT-01/DEPFALL-01.
- `.planning/ROADMAP.md` §"Phase 6: Cleanup & Release" — the **3 success criteria** this phase is verified against (modules deleted + `isHardcodedIgnored` moved first + `escapeRegex` re-export removed + flag removed; full suite passes with only regex-internal tests gone; CHANGELOG BREAKING section present).

### Upstream phase context (build to these)
- `.planning/phases/05-shadow-comparison-perf-gate-default-flip/05-CONTEXT.md` — **most important upstream ref.** Phase 5 flipped the default and explicitly deferred the bench/shadow fate to this phase (§Deferred Ideas). The four flip sites are listed there: `scanner/index.ts:37`, `validate.ts:104`, `extract.ts:45`, `prune.ts:65` — now `?? true`, and the `useAst` argument disappears from all of them here.
- `.planning/phases/04-async-migration-shadow-mode-on-regex-still-default/04-CONTEXT.md` — origin of the internal-only `useAst` flag (D-08/D-09) and the `fileContents`/`looseKeyMatch` preservation requirement.
- `.planning/STATE.md` §Accumulated Context — carry-forwards: `isHardcodedIgnored`→`text.ts` is a Phase 6 pre-condition; `fileContents` must survive.

### Cleanup targets (the code this phase deletes / edits)
- `src/core/scanner/regex.ts`, `src/core/scanner/dynamic.ts`, `src/core/scanner/hardcoded.ts` — **deleted** (behavioral coverage already ported to parser tests).
- `src/core/scanner.ts` — the shim, **deleted** (and its re-exports audited for stragglers).
- `src/core/scanner/text.ts` — **target** for `isHardcodedIgnored` (move it here before deleting `hardcoded.ts`).
- `src/core/scanner/index.ts` — `detectUsedKeys`; remove the `useAst` branch/flag; keep `fileContents` in the return.
- `src/utils.ts` — drop the `escapeRegex` re-export (grep for consumers first).
- `src/commands/validate.ts`, `src/commands/extract.ts`, `src/commands/prune.ts`, `src/cli.ts` — the `useAst` consumers; strip the flag now that AST is the only path.

### Tooling, CI & release artifacts
- `scripts/shadow-compare.ts` — **deleted** (D-04); plus the `shadow` script in `package.json`.
- `scripts/bench.ts` — **repurposed** to AST-only absolute timing (D-05); the live regex-delta logic is removed.
- `.github/workflows/ci.yml` (line ~41, `run: pnpm bench`) — keep the bench step but make it report-only (D-06).
- `package.json` — version `0.3.0` → `0.4.0`; remove `shadow` script, keep `bench`; peer deps + `peerDependenciesMeta` already declared (no change needed there).
- `CHANGELOG.md` — add the 0.4.0 BREAKING section (D-03).
- `README.md` — §"Programmatic API" (~line 206, sync→async) and §"Migration from 0.0.x/0.1.x" (~line 229, add 0.4.0) and install section (~line 31, peer deps) (D-07).

### Tests touched
- `src/core/scanner.test.ts` — imports the deleted `./scanner` shim; split surviving shared-fn tests (repoint) from regex-internal (drop) per D-08/D-09.
- `src/__tests__/dynamic.test.ts` — imports deleted `@/core/scanner/dynamic`; drop only after confirming `classifyDynamicCall`/`extractLeadingPrefix` behavior is covered in parser tests.
- `src/__tests__/hardcoded.test.ts` — imports `isHardcodedIgnored` (repoint to `text.ts`) + `scanTemplateTextNodes` (drop if ported).
- `src/__tests__/ast-shadow.test.ts` — de-flag `useAst: true` calls, keep tests (D-10).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/core/scanner/text.ts`** — already exists; the destination for `isHardcodedIgnored`. Moving the function here before deleting `hardcoded.ts` keeps a single shared home for text-detection helpers.
- **`scripts/bench.ts`** — already has a working warmup + median-of-N hand-rolled timing harness and the deterministic 50-file slice; only the regex-comparison half needs to be stripped out, not a rewrite.
- **`src/__tests__/parsers/*.test.ts`** (`typescript`, `vue`, `svelte`, `astro`, `dispatcher`) — the behavioral source-of-truth that must already contain the ported cases; D-08's verify-before-delete check reads these to confirm coverage before dropping a regex test.

### Established Patterns
- **Quality gate on every commit:** `pnpm tsc --noEmit && pnpm test && pnpm build` (typecheck also covers `scripts/` via `tsc -p tsconfig.scripts.json`). Strict ESLint (`no-explicit-any: error`, `consistent-type-imports: error`), ESM, Node ≥ 20, `tsup`. Every deletion commit must pass this — a dangling import to a deleted module fails typecheck immediately, which is the safety net.
- **Tag convention:** annotated tags `v{semver}` (`v0.2.1`…`v0.3.0`). `v0.4.0` follows suit.
- **`prepublishOnly: pnpm build`** already guards the eventual publish — reinforces that publish is a separate, deliberate step (D-01).

### Integration Points
- **`detectUsedKeys` return shape** — removing the `useAst` branch must not change the returned `{ usedKeys, fileContents, parsedResults, parseErrors }`; callers and `looseKeyMatch` depend on it.
- **Typecheck as deletion verifier** — after deleting each module, `pnpm tsc --noEmit` surfaces every orphaned import across `src/` and `scripts/`; use it to drive the cleanup to completeness.
- **CI bench step** — `.github/workflows/ci.yml` runs `pnpm bench`; the repurposed report-only bench must exit 0 regardless of timing so the build stays green (D-06).

</code_context>

<specifics>
## Specific Ideas

- The anchoring principle for the whole phase: **"the typechecker is the deletion verifier."** Because every commit is gated on `pnpm tsc --noEmit && pnpm test && pnpm build`, a dangling reference to any deleted module fails the build immediately — so the cleanup is provably complete when the gate is green with the regex files gone.
- **Prep-but-don't-publish** (D-01): build the release fully (version + CHANGELOG + tag) so a human/CI does the final `npm publish` as one deliberate command. `prepublishOnly` already runs the build.
- **Both Phase 5 gate tools were transitional by design** — `shadow-compare` is deleted outright; `bench` survives only by shedding its regex-delta half and becoming a soft AST-only signal. This was anticipated in Phase 5 (§Specific Ideas, §Deferred Ideas).
- README correctness is treated as a *release blocker*, not a nicety: a 0.4.0 that ships docs showing the old synchronous API would actively mislead users on the one thing that changed.

</specifics>

<deferred>
## Deferred Ideas

- **`npm publish` / GitHub release automation** — out of scope by D-01; the user runs the public release deliberately after this phase tags `v0.4.0`.
- **`--strict-syntax` (STRICT-01)** — make collected `FileParseError`s fail CI; deferred to a future milestone.
- **Optional parse cache (CACHE-01)** — mtime/hash-keyed skip of unchanged files; deferred until large-repo perf demand.
- **Bundled slim-Babel fallback (DEPFALL-01)** — for no-TypeScript workspaces; deferred unless users report friction.
- **Larger shadow corpus / public `maxConcurrency` / engine config** — all rejected/deferred in Phase 5; nothing here revives them.

*(No reviewed-but-deferred todos — `todo match-phase 6` returned none. No scope creep raised during discussion.)*

</deferred>

---

*Phase: 06-cleanup-release*
*Context gathered: 2026-06-03*
