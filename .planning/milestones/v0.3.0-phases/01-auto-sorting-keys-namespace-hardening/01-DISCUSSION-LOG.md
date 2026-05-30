# Phase 1: Auto-Sorting Keys + Namespace Hardening — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `01-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-28
**Phase:** 01-auto-sorting-keys-namespace-hardening
**Areas discussed:** Default namespace migration, Sort algorithm details, --clean-empty semantics, Cross-file atomicity strategy

---

## Pre-discussion scout finding

Before opening gray areas, scout discovered that **NSWRITE-01 and NSWRITE-02 (the "build the namespaced extract/prune routing" requirements) were already shipped** in commit `54712ab feat(extract,prune): wire namespaced write-routing [gap-1]`, which landed after the v0.2.0 PHASE-EXECUTION-REPORT was written. Tests at `src/__tests__/extract.test.ts:61` and `src/__tests__/prune.test.ts:232` confirm functional coverage.

This reframed Phase 1 from "build the namespace write path" to "harden + complete the small remaining work + add the SORT feature on top". The user chose to merge Phase 1 (NSWRITE) into Phase 2 (SORT) as a result, reducing the milestone from 6 phases to 5. Roadmap restructured before discussion began.

## Default namespace migration

### Q1: Default value cho `defaultNamespace` config option nên là gì?

| Option | Description | Selected |
|--------|-------------|----------|
| Giữ `"default"` (compat) | Default = `"default"` đúng như hardcoded hiện tại. Zero breaking change cho user đang dùng namespaced layout. | |
| Chuyển sang `"common"` (forward) | Default = `"common"` theo ý REQUIREMENTS.md. Breaking change cho ai đang dùng namespaced + key không prefix. Document trong CHANGELOG. | ✓ (Claude pick) |
| Không default — bắt buộc prefix | Trong namespaced mode, bắt mọi key phải có `ns:` prefix. | |
| Có default, value tùy user | Có option, default `"default"` để compat. | |

**User's choice:** "best practice là gì tùy bạn quyết" — delegated to Claude.
**Claude's decision (recorded in CONTEXT.md):** Default = `"common"`. Reasoning: i18next, vue-i18n, react-i18next all default to `"common"`. Pre-1.0 milestone is the right place to align with ecosystem convention. v0.3.0 is the major version bump that already plans breaking changes (CLEANUP-01 removes `I18nCopConfig`).

### Q2: Nếu đổi default sang `"common"`, có cần migration script không?

| Option | Description | Selected |
|--------|-------------|----------|
| Không cần script | Document trong CHANGELOG. Đơn giản. | |
| Auto-detect + warn | Khi extract/prune phát hiện `default.json` + chưa set `defaultNamespace` + default value mới là `"common"` → warn rõ. | ✓ (Claude pick) |
| Detect + auto-rename khi `--force` | Tự rename `default.json` → `common.json`. Risky. | |

**User's choice:** "best practice tùy bạn quyết" — delegated to Claude.
**Claude's decision:** Auto-detect + warn. Reasoning: matches the project's "never touch user data silently" principle (same logic as `prune` dry-run default). Warn provides clear migration path with two named options (set config OR rename file).

## Sort algorithm details

### Q1: Khi `sortKeys: "alpha"`, so sánh key bằng cách nào?

| Option | Description | Selected |
|--------|-------------|----------|
| ASCII case-sensitive (đơn giản) | `string.localeCompare` default. "Apple" < "banana". Deterministic. | |
| Case-insensitive locale-aware (Intl.Collator) | `Intl.Collator(undefined, { sensitivity: 'base', numeric: true })`. Natural numeric sort. | ✓ (Claude pick, with fixed locale `'en'`) |
| ASCII case-insensitive + numeric (tự viết) | Tự viết compare: lowercase + tách số. Deterministic, không phụ thuộc locale. | |

**User's choice:** "tôi cần cover đủ các case là ok" — user wants comprehensive coverage.
**Claude's decision:** `Intl.Collator('en', { sensitivity: 'base', numeric: true })`. Reasoning: covers case-insensitive, natural numeric (`key1 < key2 < key10`), handles Unicode keys (Vietnamese/Japanese fixture files), zero-dep. Pinned locale `'en'` for cross-machine determinism (system-locale default would drift on different CI runners).

### Q2: Sort recursive cho nested object hay chỉ top-level?

| Option | Description | Selected |
|--------|-------------|----------|
| Recursive (sort mọi level) | `{a: {z: 1, a: 2}}` → `{a: {a: 2, z: 1}}`. | ✓ |
| Chỉ top-level | Chỉ sort key cấp ngoài cùng. | |

**User's choice:** Recursive — explicit pick.
**Notes:** Only sub-question where the user expressed a definite preference. Captured directly in CONTEXT.md D-04.

### Q3: `sortKeys: "source"` order theo gì?

| Option | Description | Selected |
|--------|-------------|----------|
| Order detect scanner (now natural) | Set insertion order from `detectUsedKeys` = file order × line order in file. | ✓ (Claude pick) |
| Alphabetical-by-filename + natural-in-file | Sort file path trước theo alpha, rồi giữ line order. | |

**User's choice:** "best practice tùy bạn chọn" — delegated.
**Claude's decision:** Order from scanner. Reasoning: this is the existing natural behavior; JS Set preserves insertion order; matches how a human reading code expects keys to appear. Open verification gate for planner: confirm `scanSourceFiles` returns paths in stable order (sort directory entries) — needed for CI reproducibility.

## --clean-empty semantics

### Q1: `--clean-empty` nên delete cái gì?

| Option | Description | Selected |
|--------|-------------|----------|
| Chỉ namespace file (an toàn nhất) | Xóa `<lang>/<ns>.json` rỗng. Không động `<lang>/` directory. Không áp flat layout. | ✓ (Claude pick) |
| Namespace file + empty lang dir | Cũng xóa `<lang>/` nếu trống sau đó. Aggressive. | |
| Cả namespace và flat empty file | Cũng xóa `<lang>.json` flat layout nếu `{}`. | |

**User's choice:** "tùy bạn chọn best practice" — delegated.
**Claude's decision:** Chỉ namespace file. Reasoning: matches NSWRITE-04 spec; flat `<lang>.json` rỗng có thể là intentional (git presence, locale signaling); don't delete parent dir (user-intended structure).

### Q2: Có cần in summary trước khi xóa không?

| Option | Description | Selected |
|--------|-------------|----------|
| Log sau khi xóa (phù hợp `--force`) | Already passed `--force` → consent given. Dry-run shows `Would delete:`. | ✓ (Claude pick) |
| Prompt interactive mỗi file | Hỏi y/N từng file. Couples với IPRUNE TUI work. | |

**User's choice:** "bạn tự chọn best practice" — delegated.
**Claude's decision:** Log after (with dry-run preview). Reasoning: composes with existing `--force`/dry-run semantics; keeps Phase 1 independent of Phase 3 IPRUNE TUI work.

## Cross-file atomicity strategy

### Q1: Khi prune nhiều namespace file và 1 file fail, behavior nên là gì?

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory staging (mẫu có sẵn) | Sao chép pattern từ `extractFlat`. Parse fail isolation, không atomic với write-failure. | (already in place) |
| Two-phase commit (`.tmp` + rename loop) | Mọi write đi vào `.tmp` trước; rồi rename theo. Limited atomicity ở rename loop. | ✓ (Claude pick) |
| In-memory staging + rollback | Stage + restore originals nếu fail mid-write. Complex, edge case. | |
| Accept partial-fail + clear logging | Document, log rõ, không bảo vệ. | |

**User's choice:** "bạn tự chọn best practice" — delegated.
**Claude's decision:** Two-phase commit (Phase A: all `.tmp` first; Phase B: rename loop). Reasoning: in-memory staging already exists for parse failures; the upgrade closes the write-failure gap; rename loop has narrow failure window (renames are near-atomic at the OS level on POSIX/NTFS). Rollback option rejected because rollback can itself fail — adds complexity without solving the underlying problem.

### Q2: Có cần test edge case này không?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — cover trong tests | Mock writeLocaleFile fail at multiple stages. | ✓ |
| Document only | Trust OS atomic write. | |

**User's choice:** Yes — explicit pick. Captured in CONTEXT.md D-11.

## Claude's Discretion

The user delegated to Claude on most sub-questions ("best practice tùy bạn quyết"). All such decisions are recorded in CONTEXT.md with rationale. The only sub-question where the user expressed a definite preference was nested sort recursion (Q2 of Sort area).

## Deferred Ideas

Captured in CONTEXT.md `<deferred>` section: auto-rename on `--force`, interactive `--clean-empty` prompt, custom sort comparator API, per-namespace/per-layout sort modes, nested namespace directories.
