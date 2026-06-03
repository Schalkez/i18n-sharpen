# Phase 5: Shadow Comparison, Perf Gate & Default Flip - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 5-Shadow Comparison, Perf Gate & Default Flip
**Areas discussed:** Corpus strategy, Diff report format, Benchmark & baseline, Flip mechanics & CI

---

## Corpus strategy

### Q: How should the real OSS corpus live in the repo?
| Option | Description | Selected |
|--------|-------------|----------|
| Vendored subset | Curated real files copied into `tests/corpus/`, committed, with SOURCES.md (repo@SHA + license). Offline, deterministic CI. | ✓ |
| Git submodules | Real OSS repos as submodules pinned to SHAs; lean repo but CI submodule init + slower checkout. | |
| Fetch-on-demand | Script downloads pinned tarballs at run time into a gitignored dir; needs network. | |

**User's choice:** Vendored subset
**Notes:** Fits the tiny/CI-friendly ethos; deterministic and offline.

### Q: How broad should the real-OSS portion be per framework?
| Option | Description | Selected |
|--------|-------------|----------|
| One project / framework | One representative real OSS project per framework — SHADOW-02 minimum. | ✓ |
| 2-3 projects / framework | Broader coverage, slower, more diff noise. | |
| File-count target | Aim for a total real-file count regardless of project boundaries. | |

**User's choice:** One project / framework

### Q: How should corpus provenance be pinned/recorded?
| Option | Description | Selected |
|--------|-------------|----------|
| SOURCES.md manifest | Manifest listing repo URL, commit SHA, paths taken, license. | ✓ |
| Manifest + checksum | SOURCES.md plus a checksum/lockfile to verify no drift. | |
| Inline header comments | Provenance as per-file comment headers instead of a manifest. | |

**User's choice:** SOURCES.md manifest
**Notes:** Permissive-license requirement folded in as a source-selection constraint (D-04).

---

## Diff report format

### Q: What should scripts/shadow-compare.ts emit?
| Option | Description | Selected |
|--------|-------------|----------|
| JSON + stdout summary | Structured JSON (per-file + totals) plus a concise human verdict to stdout. | ✓ |
| JSON only | Machine-readable file only, no summary. | |
| Markdown report | Human-first Markdown tables, less machine-friendly. | |

**User's choice:** JSON + stdout summary

### Q: Where does the diff report get written?
| Option | Description | Selected |
|--------|-------------|----------|
| scratch/ (gitignored) | Derived artifact regenerated each run; exit code is the verdict. | ✓ |
| Committed snapshot | Durable in-repo audit evidence. | |
| stdout only | No file; redirect manually. | |

**User's choice:** scratch/ (gitignored)
**Notes:** `scratch/` must be added to `.gitignore` (currently not ignored).

### Q: What happens when a false-negative is found?
| Option | Description | Selected |
|--------|-------------|----------|
| Hard-block, exit non-zero | Any FN blocks the flip mechanically until zero (enforces SHADOW-03). | ✓ |
| Report-only | Always exit 0; human decides whether to flip. | |
| Triage allowlist | Move FNs into a documented allowlist so the gate passes. | |

**User's choice:** Hard-block, exit non-zero

### Q: How are AST-only gains treated?
| Option | Description | Selected |
|--------|-------------|----------|
| Documented, non-blocking | Listed in the report; never affect the gate. | ✓ |
| Require sign-off | Each gain explicitly acknowledged before flip. | |

**User's choice:** Documented, non-blocking

---

## Benchmark & baseline

### Q: How is the v0.3.0 regex baseline established?
| Option | Description | Selected |
|--------|-------------|----------|
| Live in-process delta | Run regex + AST in one process; compare delta directly (regex==v0.3.0). Self-calibrating, no variance/staleness. | ✓ |
| Recorded baseline number | Measure once, commit, compare against stored value. Fragile to variance. | |

**User's choice:** Live in-process delta

### Q: What is the benchmark built with?
| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled timer | `performance.now()` + warmup + N iterations; zero new deps. | ✓ |
| tinybench devDep | Richer stats, but a new devDependency. | |
| vitest bench | No new dep, but awkward to wrap a hard build-failing threshold. | |

**User's choice:** Hand-rolled timer

### Q: Where does the 50-file benchmark corpus come from?
| Option | Description | Selected |
|--------|-------------|----------|
| Slice of vendored corpus | Fixed deterministic 50-file slice of the same real-OSS corpus. | ✓ |
| Purpose-built synthetic | ~50 hand-authored representative fixtures. | |
| Existing repo fixtures | Reuse/expand current parser fixtures up to 50. | |

**User's choice:** Slice of vendored corpus

### Q: How does the gate decide pass/fail and enforce it?
| Option | Description | Selected |
|--------|-------------|----------|
| Median + non-zero exit | Median of N after warmup; exit non-zero if (AST median − regex median) > 100ms. | ✓ |
| Min/best-of-N | Fastest run of each engine; exit non-zero past +100ms. | |
| Mean of N | Arithmetic mean; more outlier-sensitive. | |

**User's choice:** Median + non-zero exit

---

## Flip mechanics & CI

### Q: Should the flip ship any user-facing escape-hatch to fall back to regex?
| Option | Description | Selected |
|--------|-------------|----------|
| No hatch (clean flip) | Flip four `?? false` defaults to true; useAst stays internal. | ✓ |
| Temporary env-var kill-switch | `I18N_SHARPEN_ENGINE=regex` safety hatch; deleted in Phase 6. | |
| Config/CLI opt-out flag | Real public flag; most surface, contradicts Phase 4. | |

**User's choice:** No hatch (clean flip)
**Notes:** Phase 6 deletes regex entirely, so any fallback hatch would break a phase later.

### Q: How should the shadow + perf gates relate to CI?
| Option | Description | Selected |
|--------|-------------|----------|
| Bench in CI, shadow on-demand | `pnpm bench` wired into CI (PERF-01 fails build); `pnpm shadow` an on-demand pre-flip proof. | ✓ |
| Both wired into CI | Both as CI steps/jobs; shadow is dead weight after Phase 6. | |
| Both manual/on-demand | Neither in CI; run once before flip. | |

**User's choice:** Bench in CI, shadow on-demand

### Q: How should the actual default flip be committed?
| Option | Description | Selected |
|--------|-------------|----------|
| Isolated final commit | Prove gates first; four-site default change lands last as its own atomic, revertable commit. | ✓ |
| Bundled with harness | Flip within the harness/bench commits; not independently revertable. | |

**User's choice:** Isolated final commit

### Q: What test change locks in the flip (criterion #4)?
| Option | Description | Selected |
|--------|-------------|----------|
| Default-is-AST guard | Regression test asserting the default engine is now AST; suite implicitly runs on AST. | ✓ |
| Keep explicit useAst:true tests | Rely on existing explicit-flag tests; doesn't prove the default changed. | |

**User's choice:** Default-is-AST guard

---

## Claude's Discretion

- JSON report schema/field names; stdout summary wording.
- `package.json` script names (`bench`, `shadow`) and `scripts/` layout.
- Warmup count and N (iterations) for the bench, provided the gate is stable.
- Vendored corpus directory name/structure; deterministic 50-file slice selection method.
- How `shadow-compare` invokes the engines (via `detectUsedKeys` opts vs `parseFile`/regex directly).
- Whether the default-is-AST guard is a dedicated test or folded into existing suites.

## Deferred Ideas

- Phase 6: delete regex modules, relocate `isHardcodedIgnored`, remove `useAst` flag, BREAKING CHANGELOG, 0.4.0 bump.
- Phase 6: repurpose/delete `bench` + `shadow-compare` (both depend on the regex path).
- 2-3 OSS projects per framework / larger corpus (rejected D-02).
- Triage-allowlist for false-negatives (rejected D-07).
- Committed diff-report audit snapshot (rejected D-06).
- Public `maxConcurrency` / engine config field / CLI flag (deferred from Phase 4).
- `--strict-syntax` mode (deferred STRICT-01).
