**Plans**: 5 plans (5 waves)
- [x] 06-01-PLAN.md — Wave 0: port GAP-01..08 scanTemplateTextNodes behaviors into typescript.test.ts (verify-before-delete gate; D-08) (CLEAN-01)
- [x] 06-02-PLAN.md — Wave 1: move isHardcodedIgnored → text.ts + repoint importers (deletion-spine pre-condition) (CLEAN-01)
- [x] 06-03-PLAN.md — Wave 2: remove useAst flag from detectUsedKeys + 4 consumers; delete regex/dynamic/hardcoded/shim; trim utils + barrel; surgical test cleanup (CLEAN-01)
- [x] 06-04-PLAN.md — Wave 3: delete shadow-compare + script (D-04); repurpose bench.ts AST-only (D-05); CI bench report-only (D-06) (CLEAN-01)
- [x] 06-05-PLAN.md — Wave 4: README async + Migration to 0.4.0 + peer-dep notes (D-07); CHANGELOG 0.4.0 BREAKING (D-03); bump 0.3.0→0.4.0; annotated v0.4.0 tag (D-01) — no publish (CLEAN-02)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Auto-Sorting Keys + Namespace Hardening | v0.3.0 | 4/4 | Complete | 2026-05-28 |
| 2. Dynamic Key Warnings | v0.3.0 | 3/3 | Complete | 2026-05-28 |
| 3. Interactive Pruning | v0.3.0 | 3/3 | Complete | 2026-05-30 |
| 4. Hardcoded String Detection | v0.3.0 | 2/2 | Complete | 2026-05-30 |
| 5. Deprecation Cleanup | v0.3.0 | 1/1 | Complete | 2026-05-30 |
| 1. Foundation & Error Model | v0.4.0 | 1/1 | Complete | 2026-05-31 |
| 2. JS/TS Parser Core + Golden Cases | v0.4.0 | 3/3 | Complete | 2026-06-01 |
| 3. Framework Parsers + Dispatcher | v0.4.0 | 5/5 | Complete | 2026-06-01 |
| 4. Async Migration | v0.4.0 | 1/1 | Complete | 2026-06-03 |
| 5. Shadow Comparison, Perf Gate & Default Flip | v0.4.0 | 4/4 | Complete | 2026-06-03 |
| 6. Cleanup & Release | v0.4.0 | 5/5 | Complete | 2026-06-03 |

---

## Backlog

Unsequenced ideas — not committed to any milestone yet. Promote with `/gsd-review-backlog` when ready to plan.

### Phase 999.1: Translation Impact Analysis (BACKLOG)

**Goal:** When a key is renamed or deleted, output the full blast radius — which files reference it, which locales are affected — instead of just "key missing". CLI: `i18n-sharpen impact auth.login.button`.
**Why:** AST parser (v0.4.0) already builds file→key index. Reversing it to key→[files] is minimal work on existing infra. Enterprise teams ask for this immediately when refactoring key names.
**Effort:** Low
**Requirements:** TBD
**Plans:** 0 plans (backlog)

Plans:
- [ ] TBD — promote with `/gsd-review-backlog` when ready

### Phase 999.2: Translation Coverage Dashboard (BACKLOG)

**Goal:** `validate --coverage` outputs completion % per locale and per namespace. Example: `Japanese: 82% (338/412 keys) — settings.*: 72%, premium.*: 54%`. JSON output mode for CI/PR comment integration.
**Why:** All data already computed by validate. Mostly a formatting/reporting layer. High PM and stakeholder appeal.
**Effort:** Low
**Requirements:** TBD
**Plans:** 0 plans (backlog)

Plans:
- [ ] TBD — promote with `/gsd-review-backlog` when ready

### Phase 999.3: Translation Ownership — i18n CODEOWNERS (BACKLOG)

**Goal:** Config-driven namespace→team mapping. Validate output tags each finding with the owning team. Example: `{ "ownership": { "auth.*": "auth-team", "payment.*": "payment-team" } }`. When `payment.checkout.button` is missing in `ja`, the report shows `[payment-team]`.
**Why:** Low implementation effort (config read + label injection). Very high value for monorepos with multiple teams. No new parser work needed.
**Effort:** Low
**Requirements:** TBD
**Plans:** 0 plans (backlog)

Plans:
- [ ] TBD — promote with `/gsd-review-backlog` when ready

### Phase 999.4: Key Refactor Command — AST Write-Back (BACKLOG)

**Goal:** Rename/restructure i18n keys across the entire codebase atomically — source files AND locale JSONs updated in one command. `i18n-sharpen refactor "auth.login.*" "auth.signin.*"`. Dry-run mode. No AI API key required for the core rename; optional `--suggest` mode can use AI for structure recommendations.
**Why:** Killer feature — no existing i18n tool does this well. AST read path (v0.4.0) is done; missing piece is AST write-back (ts-morph / jscodeshift) + JSON key rename. 90% of value needs no AI.
**Effort:** Medium
**Requirements:** TBD
**Plans:** 0 plans (backlog)

Plans:
- [ ] Phase 1 (no AI): explicit --from/--to rename, AST transform, atomic JSON rewrite
- [ ] Phase 2 (optional): --suggest mode with AI API key, graceful heuristic fallback without key
