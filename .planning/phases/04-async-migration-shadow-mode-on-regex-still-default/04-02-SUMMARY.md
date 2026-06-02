# Phase 4 Plan 02 Summary

**Status**: Completed

**Execution Details**:
- **Task 1**: Implemented the AST branch in `detectUsedKeys` inside `src/core/scanner/index.ts`. When `useAst: true`, it now maps `parseFile` over the files using the bounded worker pool (`runBoundedPool`). It collects `parsedResults` by index, aggregates `parseErrors`, builds `fileContents` via `stripComments` (so `looseKeyMatch` continues to work), and reduces the results into `usedKeys`.
- **Task 2**: Updated `validate` in `src/commands/validate.ts` to include a `useAst` branch. It consumes the exact same `parsedResults` outputs produced by `detectUsedKeys`, translates `dynamicCalls` into the respective `fullyDynamicFindings` and `structuredConcatFindings`, populates `keyToFilesMap`, and extracts hardcoded candidates, applying `isHardcodedIgnored`. It also outputs `parseErrors` to `log.warn`.
- **Task 3**: Threaded `useAst` internally through `extract.ts` and `prune.ts`, ensuring that `PruneOptions` remains fully transparent to the public API by applying a discrete extension. Added the `parseErrors` warning loop to these files as well.
- **Regression checks**: Verified that `useAst` does not pollute the public `I18nSharpenConfig` interface. 

**Verification Results**:
- `pnpm typecheck` successfully passes (0 type errors).
- `pnpm test` (Vitest) successfully executed all 253 tests across 24 suites.
- `pnpm build` successfully bundled the project.

The AST path is now fully wired behind the shadow feature flag (`useAst: true`) internally. The framework is ready for integration testing against Phase 3 golden cases in Plan 03!
