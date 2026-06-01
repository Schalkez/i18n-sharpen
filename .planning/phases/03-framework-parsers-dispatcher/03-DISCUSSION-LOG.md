# Phase 3: Framework Parsers + Dispatcher - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-01
**Phase:** 03-framework-parsers-dispatcher
**Areas discussed:** Async boundary, Vue template extraction, Svelte version detection, Dispatcher location & signature

---

## Async boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Async from day one | parseFile() ships as async Promise<ParsedFileResult>. detectUsedKeys stays sync/regex (Phase 4 wires cascade). Cleanest — Astro can't be sync. | ✓ |
| Sync wrapper with internal async | parseFile() is sync; Astro pre-initializes WASM eagerly. Fragile — WASM init is async by spec. | |
| Defer all async to Phase 4 | Phase 3 builds Vue/Svelte only; Astro stubbed. Risks pushing scope into Phase 4. | |

**User's choice:** Async from day one (Recommended)
**Notes:** Confirmed cleanest approach. detectUsedKeys stays sync/regex until Phase 4.

---

## Vue template extraction

| Option | Description | Selected |
|--------|-------------|----------|
| matchAttributes keys + hardcoded text | Walk descriptor.template.ast for both attribute keys and text nodes. Same three-bucket output as TS parser. @vue/compiler-sfc only. | ✓ |
| matchAttributes keys only | Attribute keys only; skip hardcoded text from templates. Simpler but breaks PARSE-05 parity. | |
| Script blocks only, skip template | Ignore <template>; only extract from <script>/<script setup>. Defers template extraction. | |

**User's choice:** matchAttributes keys + hardcoded text (Recommended)
**Notes:** Researcher to verify whether @vue/compiler-dom is needed to access descriptor.template.ast (as FW-01 specifies).

---

## Svelte version detection

| Option | Description | Selected |
|--------|-------------|----------|
| Semver from package.json | Read svelte/package.json version. >=5 uses ast.fragment + {modern: true}; <5 uses ast.html. Explicit. | ✓ |
| VERSION export from compiler | Svelte exports VERSION constant. One property read. Falls back to package.json if absent. | |
| AST shape probe at runtime | Try parse(source, {modern: true}); check ast.fragment existence. Duck-typed. | |

**User's choice:** Semver from package.json (Recommended)
**Notes:** Explicit and easy to understand in future. Researcher to verify exact Svelte 5 AST field names for script block positions via Context7.

---

## Dispatcher location & signature

| Option | Description | Selected |
|--------|-------------|----------|
| parsers/index.ts barrel, same params | parseFile() in parsers/index.ts. Same positional params as parseTypeScriptFile. No new patterns. | ✓ |
| parsers/index.ts barrel, config object | parseFile() in parsers/index.ts, ParseFileOptions object. More extensible but new pattern. | |
| dedicated dispatcher.ts, same params | parseFile() in parsers/dispatcher.ts; index.ts re-exports. Extra file for one function. | |

**User's choice:** parsers/index.ts barrel, same params (Recommended)
**Notes:** Consistent with Phase 2 patterns. parseFile() wraps parseTypeScriptFile in Promise.resolve() for JS/TS extensions to give uniform async interface.

---

## Claude's Discretion

- Internal module structure of each framework parser file
- Exact Svelte 5 AST field names (researcher verifies via Context7)
- Whether @vue/compiler-dom needs a separate loadWorkspaceDep call (researcher verifies)
- Test fixture layout for TEST-04 integration tests

## Deferred Ideas

- `svelte:head` skip tag handling in Svelte template walker
- Astro component attribute key extraction scope

---

*Discussion completed: 2026-06-01*
