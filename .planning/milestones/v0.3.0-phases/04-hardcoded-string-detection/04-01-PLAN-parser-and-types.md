---
phase: 04-hardcoded-string-detection
plan: 01
type: execute
wave: 1
depends_on: []
files_created:
  - src/core/scanner/hardcoded.ts
  - src/__tests__/hardcoded.test.ts
files_modified:
  - src/types.ts
  - src/config/schema.ts
autonomous: true
requirements:
  - HSTR-01
  - HSTR-03
  - HSTR-04
tags:
  - parser
  - regex
  - schema
  - unit-tests
  - property-based-testing
---

<objective>
Phase 4, Plan 1: Implement the core HTML/JSX/Template State Machine parser in `src/core/scanner/hardcoded.ts`, configure the validation schema rules in `schema.ts`, define internal types, and set up exhaustive unit and property-based test suites in `src/__tests__/hardcoded.test.ts`.

Purpose: This plan establishes the parsing algorithm to detect un-translated text nodes, static attributes, and simple JSX expression literals in `.tsx`, `.jsx`, `.vue`, `.svelte`, and `.astro` files without adding external HTML or compiler dependencies.
</objective>

<execution_context>
GSD State-Machine template scanner and Zod schema extensions.
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/04-hardcoded-string-detection/04-CONTEXT.md
@.planning/phases/04-hardcoded-string-detection/04-RESEARCH.md
@.planning/phases/04-hardcoded-string-detection/04-VALIDATION.md
</context>

<interfaces>

We will add a Zod schema extension for `hardcoded` optional config section:
```typescript
export interface I18nSharpenConfig {
  // ...
  hardcoded?: {
    ignore?: string[]
  }
}
```

We will export the core template parser function:
```typescript
export interface HardcodedTextCandidate {
  text: string
  offset: number
}

/**
 * Scan source text char-by-char to find un-translated text node, attribute, 
 * and expression literal candidates.
 * Strips out script, style, comments, and complex brace expressions.
 */
export function scanTemplateTextNodes(source: string): HardcodedTextCandidate[]
```

We will export the ignore pattern filter logic:
```typescript
/**
 * Test whether a trimmed candidate string matches default filters
 * (punctuation, numbers) or custom user ignore globs/regexes.
 */
export function isHardcodedIgnored(
  text: string,
  customIgnores?: string[]
): boolean
```
</interfaces>

<validation_gates>
- `scanTemplateTextNodes` successfully extracts `"Hello"` from `<div>Hello</div>`.
- `scanTemplateTextNodes` extracts `"Enter Name"` from `<input placeholder="Enter Name" />`.
- `scanTemplateTextNodes` extracts `"Welcome"` from `<div>{"Welcome"}</div>`.
- `scanTemplateTextNodes` skips dynamic expression placeholders like `<input placeholder={t("name")} />`.
- `scanTemplateTextNodes` skips complex expressions like `<div>{"Hello " + user}</div>`.
- `scanTemplateTextNodes` skips all contents inside `<script>`, `<style>`, `<code>`, `<pre>`, `<svg>`, and `<path>` blocks.
- `isHardcodedIgnored` ignores punctuation-only and numbers-only.
- `isHardcodedIgnored` does NOT ignore uppercase strings (e.g., `"OK"`, `"SAVE"`) by default.
- Fast-check property test verifies the state machine never throws on random template sequences.
- Typecheck (`pnpm tsc --noEmit`) and lint (`pnpm lint`) exit successfully.
</validation_gates>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Create unit test file with parser and ignore scenarios</name>
  <files>src/__tests__/hardcoded.test.ts</files>
  <action>
    Create `src/__tests__/hardcoded.test.ts` containing:
    - Table-driven unit tests mapping template strings to expected text node outputs (Text Nodes, Attributes, JSX Expressions, Mixed, Vue templates, Comments, Style/Script blocks).
    - Tests for punctuation-only, numbers-only, acronyms, and custom ignore configurations.
    - Fast-check property tests generating random tag structures to check parser stability.
  </action>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Implement types and configuration schema</name>
  <files>
    - src/types.ts
    - src/config/schema.ts
  </files>
  <action>
    - Add `hardcoded?: { ignore?: string[] }` options and validation schemas.
    - Extend `ValidationResults` with `hardcodedStrings?: HardcodedFinding[]`.
  </action>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Implement State Machine Parser and Ignore filter</name>
  <files>src/core/scanner/hardcoded.ts</files>
  <action>
    - Implement `scanTemplateTextNodes` state machine using character pointer loop.
    - Add parsing for text-heavy attributes (like placeholder, label, title, alt, aria-label) when encountering tag bounds.
    - Add parsing for simple string literals when balancing expressions (like `{"text"}`).
    - Implement default ignore regexes (punctuation, numbers) and `isHardcodedIgnored`.
    - Export functions through `src/core/scanner/index.ts`.
  </action>
</task>

<task type="auto" tdd="false">
  <name>Task 4: Run verification gate</name>
  <files>src/__tests__/hardcoded.test.ts</files>
  <action>
    Run `pnpm test` and ensure all new hardcoded unit tests are green.
  </action>
</task>

</tasks>
