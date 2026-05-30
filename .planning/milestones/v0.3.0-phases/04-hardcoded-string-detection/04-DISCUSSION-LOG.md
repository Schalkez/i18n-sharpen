# Phase 4: Hardcoded String Detection — Discussion Log

**Date:** 2026-05-30
**Participants:** Developer, Assistant

---

## Design Decisions Resolved

We have aligned on the following design decisions to meet industry best practices for comprehensive i18n validation:

### 1. Scope Boundary: Expanded to Attributes and JSX Expression Literals
- **Text Nodes**: Scan all raw text directly between HTML/template tags.
- **Attributes**: Scan text-heavy attributes that contain user-visible strings: `placeholder`, `label`, `title`, `alt`, `aria-label`.
  - Report any static string literals assigned to these attributes (e.g., `placeholder="Enter name"` or `placeholder='Enter name'`).
  - Do NOT flag dynamic expressions (e.g., `placeholder={t("name")}` or references).
- **JSX Expression Literals**: Scan expressions that evaluate to a simple raw string literal.
  - E.g., `<div>{"Hello"}</div>` or `<div>{'World'}</div>` are flagged.
  - Dynamic expressions like `<div>{"Hello " + user}</div>` or variables are skipped.

### 2. Default Exclude Tags & Files
- Standard HTML/Template tags ignored by default:
  - `<script>`, `<style>`, `<code>`, `<pre>`, `<svg>`, `<path>`, `<noscript>`, `<iframe>`.
- Framework-specific blocks:
  - Svelte `<svelte:head>`, Astro `<style>` blocks, and HTML comments `<!-- ... -->`.

### 3. Punctuation & Acronym Filters
- **Punctuation-only**: Ignored by default.
- **Numbers-only**: Ignored by default.
- **All-caps acronyms**: **NOT ignored by default**. UI terms like `OK` or `SAVE` must be translated. Technical acronyms (e.g. `HTML`, `API`) must be configured manually by the user in `hardcoded.ignore` if they wish to skip them.
- Custom regex strings in `hardcoded.ignore` are supported.
