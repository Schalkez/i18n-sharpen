# Phase 4: Hardcoded String Detection — Context

**Gathered:** 2026-05-30
**Status:** Plan Approved / Ready for Execution

<domain>
## Phase Boundary

This phase introduces a new hardcoded string detection feature inside the `validate` command, triggered by the `validate --check-hardcoded` flag. It scans source files (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.astro`) for un-translated user-visible strings:
1. **Text nodes** between HTML/template tags.
2. **Text attributes** (`placeholder`, `label`, `title`, `alt`, `aria-label`) that are assigned a static string literal.
3. **JSX/expression literals** (`{"Hello"}`) that are simple raw strings inside expression blocks.

If any un-translated strings are found, they are reported with file path, line number, and a text snippet. The check supports dynamic ignore filters (punctuation, numbers, and custom user-provided regex) and is CI-friendly: it causes `validate` to exit with code `1` on failure and includes a dedicated section in the markdown report.

**NOT in scope (Deferred):**
- Automated code rewriting / wrapping tags with `t(...)` in place — AI or developer responsibility.
- Scanning raw JS/TS files for hardcoded string literals outside of JSX templates — out of scope.
- Viewport/TUI editor for hardcoded string replacement — out of scope.
</domain>

<decisions>
## Implementation Decisions

### Core Detection Engine
- **D-01: Hand-roll a lightweight State Machine template parser.** No AST parser dependencies (keeping the CLI lightweight and dependency-light). The parser will parse JSX/HTML template zones to extract:
  - Raw text nodes outside tags and code blocks.
  - Text-heavy attributes with static values (e.g. `placeholder="Text"`).
  - Expression interpolation blocks (`{...}`, `{{...}}`) containing simple string literals.
  Located at `src/core/scanner/hardcoded.ts`.
- **D-02: Precise line mapping.** Leverage the `offsetToLine` and `computeLineOffsets` helpers from Phase 2 to map the index offset of detected hardcoded string text nodes to exact 1-indexed line numbers.
- **D-03: Dynamic filters and ignore criteria.** Filter out text nodes/attributes that match the following default rules or user overrides in `hardcoded.ignore`:
  - Empty strings or whitespace-only.
  - Punctuation-only (e.g., `&bull;`, `|`, `-`, `/`, `::`).
  - Numbers-only (e.g., `123`, `50%`).
  - Custom regex patterns provided via config.
  - Note: All-caps acronyms are NOT ignored by default to avoid skipping UI terms (like `OK`, `SAVE`). Users must add specific terms to `hardcoded.ignore` if they want to skip them.

### CLI & Reporting
- **D-04: Add `--check-hardcoded` to validate command.** Add option in `src/cli.ts` under the `validate` command, destructure, and forward to the `validate()` orchestrator.
- **D-05: Exit-code-1 on detection.** If `--check-hardcoded` is provided and at least one hardcoded string is found, the process exit code must be set to `1` (or `process.exitCode = 1`), enabling CI/CD pipelines to fail. If the flag is not set, hardcoded string detection does not run, and exit code remains unaffected.
- **D-06: Markdown report section.** Extend `renderMarkdownReport` in `src/commands/validate/report.ts` to output a "Hardcoded Strings" table showing path, line, and snippet when findings exist.
</decisions>

## API & Schema Changes

### Configuration Schema (`src/types.ts` & `src/config/schema.ts`)
Add `hardcoded` optional config section:
```typescript
export interface I18nSharpenConfig {
  // ...
  hardcoded?: {
    ignore?: string[] // custom string/regex patterns to ignore
  }
}
```

### Validation Outputs (`src/types.ts`)
Extend `ValidationResults` to include `hardcodedStrings`:
```typescript
export interface HardcodedFinding {
  file: string
  line: number
  text: string
}

export interface ValidationResults {
  // ...
  hardcodedStrings?: HardcodedFinding[]
}
```
