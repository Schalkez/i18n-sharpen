# Feature Backlog

Ideas and proposals captured for future milestones. Not committed to roadmap yet — use this to trace off when planning next milestone.

*Last updated: 2026-06-03*

---

## Legend

| Status | Meaning |
|--------|---------|
| ✅ Done | Already shipped |
| 🟢 High | High value, feasible, should plan soon |
| 🟡 Medium | Worth doing, but not urgent |
| 🔴 Low | Complex or out of scope for now |

---

## FEAT-01 — Translation Impact Analysis
**Status:** 🟢 High  
**Source:** ChatGPT proposal + internal discussion

When a key is renamed or deleted, show the full blast radius instead of just "key missing".

```bash
i18n-sharpen impact auth.login.button

Affected files (3):
  LoginPage.tsx:14
  LoginForm.tsx:8
  MobileHeader.tsx:5

Affected locales (4): en, vi, ja, ko
```

**Why high priority:** The AST parser (v0.4.0) already builds a file→keys index.
Reversing it to keys→files is ~minimal work on top of existing infra.
Enterprise teams ask for this immediately when refactoring key names.

**Implementation notes:**
- Build reverse index in `detectUsedKeys` return: `keyMap: Map<string, string[]>`
- New `impact` CLI subcommand reads the map and formats output
- No new dependencies needed

---

## FEAT-02 — AST-based Dead Translation Detection (extended frameworks)
**Status:** ✅ Largely done (v0.4.0)

TS/JS/Vue/Svelte/Astro parsers shipped. Dynamic key patterns (`t(\`auth.${x}\`)`) detected as structured-concat warnings.

**Remaining gap:**
- Flutter/Dart (`LocaleKeys.auth_login.tr()`, `context.t.auth.login`) — new parser needed
- Easy-i18n / i18next namespace syntax edge cases

**Track as:** separate DART-01 ticket if Flutter demand comes in.

---

## FEAT-03 — Translation Coverage Dashboard
**Status:** 🟡 Medium  
**Source:** ChatGPT proposal

```
English:    100% (412/412 keys)
Vietnamese: 100% (412/412 keys)
Japanese:    82% (338/412 keys)  ← 74 missing
Korean:      76% (313/412 keys)  ← 99 missing

Drill down (Japanese):
  auth.*:     100%
  settings.*:  72%  ← 28 missing
  premium.*:   54%  ← 46 missing
```

**Why medium:** Data already exists in validate output. Mostly a formatting/reporting
layer on top of what's computed today. High PM/stakeholder appeal.

**Implementation notes:**
- `validate --coverage` flag
- JSON output mode for CI integration (`--format json`)
- Optional: markdown table for PR comments

---

## FEAT-04 — AI Translation Quality Review
**Status:** 🔴 Low (out of scope for CLI core)  
**Source:** ChatGPT proposal

Check translation accuracy, tone consistency, truncation risk via LLM.

**Why low:** Requires external AI API call + user pays per-token costs. Better
suited as an optional plugin or GitHub Action wrapper, not core CLI.

**If revisited:** Make API key optional (`ANTHROPIC_API_KEY` env), run heuristics
only when key absent, AI when key present.

---

## FEAT-05 — Screenshot-based UI Overflow Detection
**Status:** 🔴 Low (different product scope)  
**Source:** ChatGPT proposal

Run headless browser, screenshot each locale, flag text overflow (e.g. German
"Anwendungseinstellungen" overflowing a Settings button).

**Why low:** Needs browser automation infra (Playwright/Puppeteer), visual diffing,
and app-specific setup. This is a separate product (similar to Chromatic/Percy)
rather than a CLI i18n checker feature. Would massively expand scope.

---

## FEAT-06 — Translation Ownership (i18n CODEOWNERS)
**Status:** 🟡 Medium  
**Source:** ChatGPT proposal

Config-driven namespace → team mapping. Validate output tags findings with owner.

```json
// i18n-sharpen.json
{
  "ownership": {
    "auth.*":    "auth-team",
    "payment.*": "payment-team",
    "profile.*": "profile-team"
  }
}
```

```bash
$ i18n-sharpen validate

[payment-team] payment.checkout.button — missing in ja, ko
[auth-team]    auth.login.title — missing in de
```

**Why medium:** Low implementation effort (config read + label injection in report).
Very high value for monorepos with multiple teams. No new parser work needed.

---

## FEAT-07 — Key Refactor Command (AST write-back)
**Status:** 🟢 High  
**Source:** ChatGPT proposal + internal discussion

Rename/restructure keys across the entire codebase in one command — source files
AND locale JSONs updated atomically.

```bash
# Rename namespace
i18n-sharpen refactor "auth.login.*" "auth.signin.*"

# Preview mode (no write)
i18n-sharpen refactor "auth.login.*" "auth.signin.*" --dry-run

# Merge scattered keys into namespace
i18n-sharpen refactor --merge "button.submit, button.cancel" --into "common.button.*"
```

**Why high:** 90% of the value requires no AI — pure AST transform + JSON rewrite.
The AST *read* path (v0.4.0) is done; the missing piece is AST *write-back* to
source files.

**Does NOT require AI API key.** AI is an optional enhancement for `--suggest`
mode only (suggesting structure improvements when intent is ambiguous).

**Implementation notes:**
- Phase 1 (no AI): explicit `--from / --to` rename, AST transform via ts-morph or
  jscodeshift, atomic JSON key rename
- Phase 2 (optional AI): `--suggest` flag, reads key structure, returns proposed
  groupings — requires API key, graceful fallback to heuristics without it
- Heuristics (no AI needed): detect camelCase vs snake_case inconsistencies,
  flag singleton namespaces, suggest grouping by common prefix

---

## FEAT-08 — Configurable Hardcoded Attributes (per-framework)
**Status:** ✅ Done (v0.4.1)

`hardcoded.attributes` and `hardcoded.ignore` now configurable in `i18n-sharpen.json`.
Defaults: `["placeholder", "label", "title", "alt", "aria-label"]`.

---

## Deferred from v0.4.0 (carry-forwards)

These were explicitly deferred during Phase 6 planning — not forgotten, just not now:

| ID | Description | Deferred reason |
|----|-------------|-----------------|
| STRICT-01 | `--strict-syntax`: make `FileParseError`s fail CI | Needs UX design for error suppression |
| CACHE-01 | mtime/hash parse cache to skip unchanged files | Wait for large-repo demand signal |
| DEPFALL-01 | Bundled slim-Babel fallback for no-TypeScript workspaces | Wait for user friction reports |

---

## Recommended milestone order

*Updated 2026-06-03 after external strategic review. See also PROJECT.md §Strategic Notes.*

The key insight from review: **every next feature should use the AST graph, not add more locale-file rules.** The graph is the moat.

| Milestone | Feature | Rationale |
|-----------|---------|-----------|
| **v0.5** | FEAT-01 Impact Analysis | 20% effort / 80% value. Reverse the existing index. Enterprise ask #1 on key rename. |
| **v0.6** | FEAT-07 Key Refactor (AST write-back) | Killer feature, no competition. AST read done; write-back is the missing piece. No AI needed for core. |
| **v0.7** | FEAT-06 Translation Ownership | Low effort, high monorepo value. Config-only change. |
| **v0.8** | FEAT-03 Coverage Dashboard | Formatting layer on existing validate output. PM/stakeholder appeal. |

**Defer indefinitely:**
- FEAT-04 (AI Translation Review) — external API cost, out of scope for CLI core
- FEAT-05 (Screenshot Validation) — different product scope entirely

**Promote if demand signals appear:**
- CACHE-01 — only if large-repo perf complaints come in
- DEPFALL-01 — only if no-TypeScript workspace friction reported
- STRICT-01 — only when UX design for error suppression is clear

---
*Note on FEAT-07 vs FEAT-01 order: original estimate had Refactor first, but external review correctly pointed out Impact Analysis has lower effort and higher immediate enterprise value — ship the quick win first, then the harder killer feature.*
