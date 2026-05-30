# Phase 4: Hardcoded String Detection — Validation

**Researched:** 2026-05-30
**Status:** Scouting / Planning

---

## Automated Test Matrix

### 1. Unit Tests (`src/__tests__/hardcoded.test.ts`)

#### Parser Correctness Cases:
- **Test 1: Simple text node**
  - Input: `<div>Hello World</div>`
  - Output: Detect `"Hello World"`
- **Test 2: Wrapped in translate call**
  - Input: `<div>{t("greeting")}</div>`
  - Output: Detect nothing (0 findings)
- **Test 3: Mixed text and expressions**
  - Input: `<div>Hello {t("key")} World</div>`
  - Output: Detect `"Hello "` and `" World"`
- **Test 4: Vue template brace expressions**
  - Input: `<div>Welcome {{ name }} Guest</div>`
  - Output: Detect `"Welcome "` and `" Guest"`
- **Test 5: script and style tag skips**
  - Input: `<script>const text = "hardcoded";</script><style>.x { color: red; }</style><div>Visual Text</div>`
  - Output: Detect only `"Visual Text"` (ignores code/styles)
- **Test 6: HTML comments**
  - Input: `<div>Hello <!-- don't translate me --> World</div>`
  - Output: Detect `"Hello "` and `" World"` (ignores comment contents)

#### Ignore Pattern Cases:
- **Test 7: Numbers-only filter**
  - Input: `<div>123</div><div>4.5%</div><div> 99 - 100 </div>`
  - Output: Detect nothing (ignored by default number filters)
- **Test 8: Punctuation-only filter**
  - Input: `<div>&bull;</div><div> | </div><div> - </div>`
  - Output: Detect nothing (ignored by default punctuation filters)
- **Test 9: Acronyms filter**
  - Input: `<div>HTML</div><div>API</div><div>SEO</div>`
  - Output: Detect nothing (ignored by default acronym filters)
- **Test 10: Custom ignore configuration**
  - Input: `<div>SKIP_ME</div><div>KEEP_ME</div>` with `hardcoded.ignore = ["SKIP_ME"]`
  - Output: Detect `"KEEP_ME"` (ignores custom text match)

#### Property-Based Testing (Fast-Check):
- Generate random HTML tag layouts mixed with random text and curly bracket blocks. Ensure the state machine scanner never crashes (no index boundary errors, no stack overflows) and always parses brackets/tags deterministically.

---

### 2. Integration Tests (`src/__tests__/validate.test.ts`)

- **Test 1: `--check-hardcoded` fails the run**
  - Set up a mock project with a TSX file containing `<div>Hardcoded text</div>`. Run `validate` with `{ checkHardcoded: true }`.
  - Assert:
    - `result.status` (or exit code) is `1` (fail).
    - `result.hardcodedStrings` contains the finding with line numbers.
- **Test 2: `--check-hardcoded` passes on clean project**
  - Set up mock project where all texts are inside `t("key")`. Run `validate` with `{ checkHardcoded: true }`.
  - Assert:
    - Exit code is `0`.
- **Test 3: Ignore dirs and files**
  - Ensure hardcoded checks respect `excludeDirs` (e.g. `node_modules/`, `dist/`) and only scan permitted `fileExtensions`.
- **Test 4: Markdown output report inclusion**
  - Verify that when hardcoded strings are found and the markdown path is configured, a "Hardcoded Strings" table is generated in the markdown report.
