---
phase: 6
slug: cleanup-release
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-03
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> This is a DELETION + RELEASE phase: the core validation is "the existing full
> suite stays green after every deletion" plus closing the 8 coverage gaps
> (GAP-01..08) the research found in `scanTemplateTextNodes` before it is deleted.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm tsc --noEmit && pnpm test && pnpm build` (the established quality gate; `tsc` also covers `scripts/` via `tsconfig.scripts.json`) |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm tsc --noEmit && pnpm test` (typecheck is the deletion verifier — a dangling import to a deleted module fails immediately)
- **After every plan wave:** Run the full gate `pnpm tsc --noEmit && pnpm test && pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green with the regex modules gone
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

> Filled by the planner against the final task breakdown. The anchoring rule:
> NO regex-internal test is dropped until the equivalent behavioral assertion is
> proven present in `src/__tests__/parsers/*.test.ts` (D-08 verify-before-delete).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 6-00-XX | 00 | 0 | CLEAN-01 | — | GAP-01..08 ported: `scanTemplateTextNodes` behaviors now asserted in `typescript.test.ts` | unit | `pnpm test src/__tests__/parsers/typescript.test.ts` | ✅ | ⬜ pending |
| 6-XX-XX | XX | 1+ | CLEAN-01 | — | Full suite green after each deletion | unit | `pnpm tsc --noEmit && pnpm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/parsers/typescript.test.ts` — add the 8 missing `scanTemplateTextNodes` behavioral cases (GAP-01..GAP-08 from RESEARCH.md) BEFORE `hardcoded.test.ts`'s `scanTemplateTextNodes` describe blocks are dropped. This is the only genuine coverage gap; everything else is already covered or is a repoint/de-flag.

*All other test changes are REPOINT (move imports to the function's new home) or DEFLAG (strip `useAst: true`), not new coverage — so the existing infrastructure covers them.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CHANGELOG BREAKING section is accurate & complete | CLEAN-02 | Documentation correctness is not unit-testable | Read `CHANGELOG.md` 0.4.0 section: confirms async API, optional peer deps + per-framework install, regex→AST engine change |
| README async examples compile/run as shown | CLEAN-02 (D-07) | Doc-snippet correctness | Verify §Programmatic API uses `await validate/extract/prune`; §Migration to 0.4.0 present; install section lists optional peer deps |
| Annotated `v0.4.0` git tag created | CLEAN-02 (D-01) | Git tagging is a manual/release action | `git tag -n v0.4.0` shows annotated tag; `package.json` version is `0.4.0` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (GAP-01..08)
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
