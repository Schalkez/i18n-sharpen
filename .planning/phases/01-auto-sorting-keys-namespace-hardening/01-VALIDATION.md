---
phase: 1
slug: auto-sorting-keys-namespace-hardening
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-28
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 1.x + fast-check (property-based) |
| **Config file** | `vitest.config.ts` (existing) |
| **Quick run command** | `pnpm test --run` |
| **Full suite command** | `pnpm tsc --noEmit && pnpm test --run && pnpm build` |
| **Estimated runtime** | ~3 seconds (full vitest suite, current baseline 72 tests) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run`
- **After every plan wave:** Run `pnpm tsc --noEmit && pnpm test --run && pnpm build`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

> Populated by gsd-planner after task IDs are assigned. Source of gates: see RESEARCH.md §Validation Architecture (D-01..D-12 table).

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD     | TBD  | TBD  | TBD         | —          | TBD             | TBD       | TBD               | TBD         | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/__tests__/sort.test.ts` — new file. Covers D-03/D-04/D-05/D-06/D-11. Includes property-based idempotency + keys-set invariance via fast-check.
- [ ] `src/__tests__/atomic.test.ts` — new file. Covers D-10 Phase A (`vi.spyOn(fs, 'writeFileSync')`) and Phase B (`vi.spyOn(fs, 'renameSync')`) failure modes.
- [ ] No framework installation needed — vitest + fast-check already present.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-machine `Intl.Collator` determinism (D-12) | SORT-03 | Cannot meaningfully test from a single Node version inside CI | Trust ICU contract; document Node-version policy in CHANGELOG if drift is observed in field |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (`sort.test.ts`, `atomic.test.ts`)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
