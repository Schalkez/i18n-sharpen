# Contributing to i18n-sharpen

Thank you for your interest in contributing! This document covers how to get started.

## Development Setup

```bash
git clone https://github.com/Schalkez/i18n-sharpen.git
cd i18n-sharpen
pnpm install
```

**Requirements:** Node.js ≥ 20, pnpm ≥ 9.

## Development Workflow

```bash
pnpm test          # run test suite (vitest)
pnpm typecheck     # TypeScript + scripts typecheck
pnpm lint          # ESLint strict-type-checked
pnpm build         # production build (tsup)
```

Every commit is gated on `pnpm tsc --noEmit && pnpm test && pnpm build` via pre-commit hook (lint-staged + simple-git-hooks). Fix typecheck and test failures before committing.

## Project Structure

```
src/
├── cli.ts                        # CLI entry — sole catch site for I18nSharpenError
├── commands/
│   ├── validate.ts               # validate orchestrator
│   ├── extract.ts                # extract orchestrator
│   └── prune.ts                  # prune orchestrator
├── config/
│   ├── schema.ts                 # Zod config schema
│   └── loader.ts                 # config file resolution + merge
├── core/
│   ├── scanner/
│   │   ├── index.ts              # detectUsedKeys — AST scan entry point
│   │   ├── parsers/              # per-framework AST parsers (TS/JS, Vue, Svelte, Astro)
│   │   ├── text.ts               # text-detection helpers (isHardcodedIgnored etc.)
│   │   ├── files.ts              # file discovery
│   │   └── lines.ts              # line/offset utilities
│   ├── locale-io/                # locale file read/write (JSON, YAML, JS/TS)
│   └── errors.ts                 # I18nSharpenError discriminated union
└── types.ts                      # public type exports
```

## Adding a New Parser

To add support for a new framework/file type:

1. Create `src/core/scanner/parsers/<framework>.ts` implementing the `ParsedFileResult` shape
2. Register it in `src/core/scanner/parsers/index.ts` dispatcher
3. Add golden-case tests in `src/__tests__/core/scanner/parsers/<framework>.test.ts`
4. Add the file extension to `DEFAULT_FILE_EXTENSIONS` in `src/config/index.ts`
5. Document the optional peer dep in README and CHANGELOG

## Submitting a Pull Request

1. Fork the repo and create a branch from `master`
2. Write tests for new behavior — we use vitest; property-based tests (fast-check) for core parsing
3. Make sure `pnpm typecheck && pnpm test && pnpm lint && pnpm build` all pass
4. Open a PR with a clear description of what and why

## Reporting Bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) issue template. Include:
- `i18n-sharpen` version (`npx i18n-sharpen --version`)
- Framework + file type being scanned
- Minimal config + source snippet that reproduces the issue

## Design Constraints

Please keep these in mind when proposing changes:

- **No heavy runtime deps.** The core dep tree (`commander`, `picocolors`, `yaml`, `zod`) must stay tiny. Framework compilers are optional peer deps loaded dynamically.
- **Safety first.** `prune` must remain dry-run by default. Anything writing to disk uses atomic writes (`.tmp` + rename).
- **AST graph is the moat.** New features should use the usage graph produced by `detectUsedKeys`, not add more regex/grep-based heuristics.
- **Framework-agnostic.** No hardcoded i18n library names. Detection is driven by `matchFunctions`/`matchAttributes` config.
