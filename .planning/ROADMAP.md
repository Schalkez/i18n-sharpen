**Plans**: 5 plans (5 waves)
- [ ] 06-01-PLAN.md — Wave 0: port GAP-01..08 scanTemplateTextNodes behaviors into typescript.test.ts (verify-before-delete gate; D-08) (CLEAN-01)
- [ ] 06-02-PLAN.md — Wave 1: move isHardcodedIgnored → text.ts + repoint importers (deletion-spine pre-condition) (CLEAN-01)
- [ ] 06-03-PLAN.md — Wave 2: remove useAst flag from detectUsedKeys + 4 consumers; delete regex/dynamic/hardcoded/shim; trim utils + barrel; surgical test cleanup (CLEAN-01)
- [ ] 06-04-PLAN.md — Wave 3: delete shadow-compare + script (D-04); repurpose bench.ts AST-only (D-05); CI bench report-only (D-06) (CLEAN-01)
- [ ] 06-05-PLAN.md — Wave 4: README async + Migration to 0.4.0 + peer-dep notes (D-07); CHANGELOG 0.4.0 BREAKING (D-03); bump 0.3.0→0.4.0; annotated v0.4.0 tag (D-01) — no publish (CLEAN-02)

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
| 6. Cleanup & Release | v0.4.0 | 0/5 | Not started | - |
