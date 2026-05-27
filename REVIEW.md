---
project: i18n-sharpen
reviewed: 2026-05-27T00:00:00Z
depth: deep
files_reviewed: 8
files_reviewed_list:
  - src/cli.ts
  - src/config.ts
  - src/utils.ts
  - src/types.ts
  - src/index.ts
  - src/commands/validate.ts
  - src/commands/extract.ts
  - src/commands/prune.ts
findings:
  critical: 2
  high: 9
  medium: 12
  low: 10
  total: 33
status: issues_found
---

# i18n-sharpen — Code Review Report

**Reviewed:** 2026-05-27
**Depth:** deep (cross-file, correctness-focused)
**Files reviewed:** 8 (all source modules under `src/`)

## Summary

`i18n-sharpen` is a small, well-organized TypeScript CLI for validating, extracting, and pruning i18n keys. The architecture is clean: a CLI entry (`cli.ts`), config loader (`config.ts`), shared utilities (`utils.ts`), shared types (`types.ts`), and three command implementations (`validate`/`extract`/`prune`).

However, the review surfaced multiple **correctness bugs** that will produce wrong results in real codebases, particularly:

1. The key-extraction regex **does not match template literals** (backtick strings) despite the code claiming it does and pretending to in the dynamic-key warning logic. The character class `['"\\\`]` actually matches `'`, `"`, `\`, and `` ` `` — `\\\`` is `\` followed by `` ` ``, not an escaped backtick. Combined with the `\b...\(` boundary, the regex also rejects legitimate calls like `i18n.t("key")` because `.t` does not start at a word boundary after `.`. (Actually `\b` *is* a boundary between `.` and `t`, so `.t(` matches — but `obj['t']('key')` and many other call styles don't.)
2. `stripComments` incorrectly mangles URLs and any `//` preceded by a character that isn't backslash or colon — but it **also fails to strip** comments whose `//` is at the start of a line (handled by `^`), AND it leaves the third character of a `://` URL untouched while corrupting any string containing `// ` in dynamic content (e.g. JSX inline `<a href="https://...">` is preserved by the `:` exemption, but `const x = "a // b"` will have everything after `//` stripped).
3. **Prototype-pollution risk** in `setNestedValue` / `unflattenObject`: a key like `__proto__.polluted` or `constructor.prototype.x` will mutate `Object.prototype`. Since key strings come from scanned source files (semi-trusted) AND from `i18n-sharpen.json` config (user-controlled), this is exploitable in shared-tooling scenarios.
4. The "second-pass" loose-match logic (validate.ts:154–182, prune.ts:83–100) marks **any** locale key as "used" if its quoted form appears literally anywhere in source — including inside comments that the dot-after-backslash quirk failed to strip, inside string concatenations, or inside completely unrelated code (e.g. an object literal `{ "user.name": foo }`). This causes false negatives in `prune` (keeps stale keys forever) and silently masks missing-key errors in `validate`.
5. Windows path handling: `excludeDirs` uses `file` (the bare directory name) which is fine, but `relativePath` uses `path.relative` which on Windows returns backslash-separated paths — these are then displayed to the user and embedded into markdown reports without normalization.

There are also several smaller bugs (operator-precedence bug at `validate.ts:323`, missing schema validation for `cwd`, no atomic write, ReDoS-prone unbounded `[a-zA-Z0-9_\-.]+`, etc.).

Below is the full classified list. Severity guide:
- **CRITICAL** — security or data-loss risk
- **HIGH** — wrong output / silently incorrect behavior that users will rely on
- **MEDIUM** — edge case bug or UX-breaking footgun
- **LOW** — style/robustness nit

---

## CRITICAL Issues

### CR-01: Prototype pollution via locale keys / extracted code keys

**File:** `src/utils.ts:75-97` (`setNestedValue`), also exercised by `src/utils.ts:124-134` (`unflattenObject`) and indirectly by `extract.ts:107` and `prune.ts:158`.

**Issue:** `setNestedValue` walks a dot-separated path and assigns into `current[part]` with no check that `part` is `__proto__`, `constructor`, or `prototype`. If a key like `__proto__.polluted` is extracted from source code (or, more realistically, present in a malicious or untrusted `en.json` locale shared via a translation service), running `extract` or `prune` will pollute `Object.prototype` for the lifetime of the Node process. Because this CLI also reads and serializes user JSON, the polluted prototype can flow into other consumers if the library is imported (it is — `src/index.ts` exports `loadConfig`/`extract`/`prune` as a library API).

The key extraction regex (`[a-zA-Z0-9_\-.]+`) allows `__proto__` (underscores and letters), so the attack surface is reachable through any contributed source file. It is also reachable through a malicious `i18n-sharpen.json` whose `ignoreKeys` or other arrays — but more importantly through any locale JSON file the tool reads, since locale keys are unflattened back to a tree.

**Root cause:** No allow/deny list for forbidden path segments.

**Recommended fix:** In `setNestedValue`, reject or skip parts equal to `__proto__`, `prototype`, or `constructor`. Same check should run in `flattenObject` when descending. Alternatively use `Object.create(null)` for intermediate objects, though that would change JSON output shape.

---

### CR-02: Untrusted regex construction — ReDoS and injection via `matchFunctions` / `matchAttributes`

**File:** `src/commands/validate.ts:79-87`, `src/commands/extract.ts:28-32`, `src/commands/prune.ts:28-32`.

**Issue:** `matchFunctions` and `matchAttributes` come from the user-controlled config file (`i18n-sharpen.json` or `package.json#i18nSharpen`) and are concatenated directly into a regex without escaping:

```ts
const functionsJoined = (config.matchFunctions || ["t", "getTranslation"]).join("|")
const keyRegex = new RegExp("\\b(?:" + functionsJoined + ")\\s*\\(\\s*(['\"\\`])([a-zA-Z0-9_\\-.]+)\\1", "g")
```

A `matchFunctions` value of `["(.+)+"]` (catastrophic-backtracking pattern) or `[".*"]` will either crash with malformed-regex or hang on a moderate input file. While the threat model is "user configures their own project", `i18n-sharpen.json` may come from a cloned repo, a template, or a CI job that pulls config from a less-trusted source.

Additionally the unbounded `[a-zA-Z0-9_\-.]+` capture is itself mildly ReDoS-prone in pathological inputs because of overlapping `.` boundaries, though Node's regex engine handles this in linear time — the bigger issue is regex injection.

**Recommended fix:** Escape each entry in `matchFunctions`/`matchAttributes` with a regex-escape helper before joining; validate via Zod that entries are simple identifiers (`/^[A-Za-z_$][A-Za-z0-9_$.]*$/`).

---

## HIGH Severity Issues

### HI-01: `stripComments` regex corrupts non-comment code containing `//`

**File:** `src/utils.ts:39-41`

**Issue:** The regex is:

```ts
return code.replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "$1")
```

The intent appears to be "strip `//` line comments, but not when preceded by `\` (regex literal) or `:` (URL like `https://`)". Problems:

1. **It strips inside string literals.** `const tooltip = "Use a // b separator"` becomes `const tooltip = "Use a` — and any `t("...")` after it on the same line is lost. This directly causes missed key extraction.
2. **Template-literal multiline content** is not protected either.
3. The `:` guard only checks one character. `t("foo")  //bar` strips to `t("foo")` (good), but `t( /*x*/ "foo")` is fine. However `t("ab://x")` — fine because `:` is preceded by `b`, not `/`, so the regex `[^\\:]\/\/` matches `b//` and strips `//x")`. This is a real false-negative source.
4. Block comments containing `*/` inside a string (e.g. `const s = "*/"; /* real */`) terminate the wrong comment.

**Impact:** Missing keys and noisy "potential dynamic key" warnings; extract may fail to find legitimate static keys.

**Recommended fix:** Use a real tokenizer (e.g. `acorn` for JS/TS), or at minimum a state-machine that tracks `"`, `'`, `` ` `` string contexts before applying the comment regex. As a quick mitigation, document the limitation and only strip when no quoted string opens earlier on the line.

---

### HI-02: Key-extraction regex does not match template literals

**File:** `src/commands/validate.ts:80`, `src/commands/extract.ts:29`, `src/commands/prune.ts:29`.

**Issue:** The character class `(['"\\\`])` in the source string `"(['\"\\\`])"` is, after JS string un-escaping, `(['"\\\`])` — which in regex means "any of `'`, `"`, `\`, `` ` ``". The intent was clearly to permit single quote, double quote, or backtick — but the `\\` in the source produces a *literal backslash* in the regex (so a call like `t(\foo)` would technically match if it weren't malformed). More importantly, while backtick *is* permitted (the `` ` `` at the end), **a template literal containing an interpolation like `` t(`prefix.${x}`) `` will not be captured** because the `[a-zA-Z0-9_\-.]+` body stops at `$`.

The bigger issue: the regex *does* match plain template literals like `` t(`my.key`) ``, but only because of an accidental backslash inclusion. And it captures the entire backtick literal as a "key" — which is fine for static literals, but means the team is relying on a buggy regex.

Also the back-reference `\1` requires the closing quote to match the opening quote, which is correct.

**Impact:** Inconsistent matching of template literals; backslash technically allowed as a quote char (harmless but indicates the regex was not written intentionally).

**Recommended fix:** Use `(['"`])` (no backslash) in the character class, and document that template literals with `${}` interpolation are flagged as dynamic (which is in fact what the dynamicRegex tries to do — but see HI-03).

---

### HI-03: `dynamicRegex` produces false positives and misses real dynamic calls

**File:** `src/commands/validate.ts:87, 138-150`

**Issue:** The regex `\b(?:fn)\s*\(\s*([^'"\`\s][^)]*)\)` requires the first non-whitespace character inside the parentheses to **not** be a quote. So:

- `t( "key")` (space then quote) is correctly skipped.
- `t(getKey())` is matched and `arg = "getKey()"` — warned (good).
- `t("k" + suffix)` is **not** matched because it starts with `"` — so a real dynamic concatenation is **silently missed**.
- `t(\`pre.\${x}\`)` is also **missed** for the same reason: it starts with a backtick, which is in the excluded set, so the `isStaticString` check is never reached. Yet the comment at line 86 explicitly says the regex is meant to handle `` t(`prefix.${variable}`) `` — it does not.
- The `[^)]*` body cannot contain `)`, so `t(a().b)` truncates the match early.

**Impact:** Users will not be warned about the most common kind of dynamic key (string concatenation or templated key) — exactly the case the warning was designed to catch.

**Recommended fix:** Match calls whose first argument is *not a pure static literal* (regardless of quote prefix). The match should include literal-starting arguments and then test whether the *whole* first argument is a single static string.

---

### HI-04: Operator precedence bug in placeholder file-reference display

**File:** `src/commands/validate.ts:323`

**Issue:**

```ts
const files = keyToFilesMap.get(key) || getBaseKey(key) === key ? [] : keyToFilesMap.get(getBaseKey(key)) || []
```

Operator precedence parses as:

```ts
const files = (keyToFilesMap.get(key) || (getBaseKey(key) === key)) ? [] : ...
```

So if `keyToFilesMap.get(key)` returns *any* truthy array (even a populated one), the result is `[]` — meaning the file list is **wiped** for keys that *are* found in `keyToFilesMap`. The fallback branch only runs when the get returns `undefined` AND `getBaseKey(key) !== key`.

This is the opposite of the apparent intent ("prefer `keyToFilesMap.get(key)`, fall back to base key").

**Impact:** Active-placeholder warnings always print empty `(referenced in: )` for keys that actually were referenced; the markdown report does the same.

**Recommended fix:**

```ts
const direct = keyToFilesMap.get(key)
const baseFiles = getBaseKey(key) !== key ? keyToFilesMap.get(getBaseKey(key)) : undefined
const files = direct ?? baseFiles ?? []
```

---

### HI-05: Loose "string-anywhere-in-file" pass over-matches by design

**File:** `src/commands/validate.ts:154-182` and identical logic in `src/commands/prune.ts:83-100`.

**Issue:** After the regex extraction, the validator/pruner does a second pass: for every key in the default locale, it checks `cleanContent.includes("\"" + key + "\"")` (and `'…'`, `` `…` ``). This causes:

- **False positives in prune** — a stale, never-referenced key like `"old.error.message"` will be considered "used" merely because the string literal `"old.error.message"` appears once anywhere (a debug log, a TypeScript discriminated-union literal, a JSDoc, etc.). Result: prune silently keeps stale keys forever.
- **Cross-key collision** — for a key like `"a"`, every occurrence of `"a"` in any source file marks it as used (including JSX `className="a"`).
- **No word boundary**, so `"submit"` matches `"submit-button"`.

**Impact:** Prune is unreliable. Validate's unused-key count is consistently understated.

**Recommended fix:** Either remove this pass entirely (rely on regex), or guard it with stricter constraints (e.g. require the literal to appear *inside a known call expression* — which is what the regex already does), or make this pass opt-in via config (`looseKeyMatch: true`).

---

### HI-06: Locale-file error in `validate` calls `process.exit(1)` from inside a library function

**File:** `src/commands/validate.ts:40, 46`, also `extract.ts:14, 78, 112` and `prune.ts:14, 77, 163`.

**Issue:** `validate`/`extract`/`prune` are exported from `index.ts` as a public library API, but they call `process.exit(1)` on errors. A library caller cannot recover or catch this — `process.exit` is fatal and bypasses Node's `try/catch`.

**Impact:** Anyone using `i18n-sharpen` programmatically (e.g. in a build script, test runner, or pre-commit hook wrapper) will see their entire host process killed on a single bad locale file.

**Recommended fix:** Throw `Error` (or a typed `I18nSharpenError`) from the library functions; let only `cli.ts` translate to exit codes. The CLI already has a `try/catch` that calls `process.exit(1)` — push all exit logic up there.

---

### HI-07: `findLocaleFile` extension order silently shadows files

**File:** `src/utils.ts:140-149`

**Issue:** The function returns the **first** existing extension in the order `[".json", ".yaml", ".yml"]`. If a project accidentally has both `en.json` and `en.yaml` (e.g. mid-migration), `en.yaml` is silently ignored. There is no warning. Worse: `extract` will only update `en.json`, leaving `en.yaml` untouched and forever drifting.

**Impact:** Silent data divergence during migrations.

**Recommended fix:** Detect duplicates and emit a warning (or error) when more than one locale file exists for the same language code.

---

### HI-08: `extract` uses the locale-file path before it is guaranteed to be set

**File:** `src/commands/extract.ts:70-100`

**Issue:** Control flow:

```ts
let langPath = findLocaleFile(...)
if (!langPath) {
  langPath = path.join(localesDirAbs, `${lang}.json`)
} else {
  try { langJson = readLocaleFile(langPath); flatJson = flattenObject(langJson) }
  catch (...) { process.exit(1) }
}
```

If the file does **not** exist, `langJson` and `flatJson` are empty (good), but no `mkdir -p` is performed for `localesDirAbs` if it was newly required, *and* the file is later created on disk. However, the top of `extract` already verifies `localesDirAbs` exists. The real bug here is: if `findLocaleFile` returns `null` but then a partially-corrupt `en.yaml` exists that was filtered out only by case-insensitive `path.extname` matching on Windows — the new `en.json` will be created next to it, and the YAML is now orphaned with no warning.

Less subtle: when the existing locale file fails to parse, `process.exit(1)` runs after all earlier languages have already been mutated and written. There is no transactional rollback. A crash mid-loop on language 3 of 5 leaves languages 1–2 mutated and 3–5 untouched.

**Impact:** Partial writes leave locale files inconsistent.

**Recommended fix:** Read+parse all locale files up-front, then write all of them only after every parse succeeds (or write to a temp file and rename atomically).

---

### HI-09: Empty/whitespace locale file edge cases

**File:** `src/utils.ts:154-162`

**Issue:**

```ts
return JSON.parse(content || "{}")
```

This handles the truly-empty case, but **not** whitespace-only files, BOM-prefixed files, or files with trailing commas/comments (JSON5-style). A locale file containing `"\n"` will throw. A file beginning with the UTF-8 BOM (`\uFEFF`) will throw because `JSON.parse` rejects it. Many Windows editors save with BOM.

Also, `YAML.parse(content)` may return `null` for an empty/whitespace YAML — the code handles `null` with `|| {}`, but a YAML containing only `null` will also be coerced to `{}`, silently discarding the user's intent.

**Impact:** Reasonable real-world locale files crash the tool on Windows.

**Recommended fix:** Strip BOM before parsing (`content.replace(/^\uFEFF/, "")`); treat whitespace-only as `{}`; document JSON-strictness.

---

## MEDIUM Severity Issues

### MD-01: `getFiles` does not handle symlinks; can infinite-loop on symlink cycles

**File:** `src/utils.ts:10-34`

**Issue:** `fs.statSync` follows symlinks. A directory symlink that points back to an ancestor (or even just a sibling that has been scanned) causes infinite recursion and re-reads. There is no `visited` set. On Windows, `fs.statSync` will also follow junction points.

**Fix:** Use `fs.lstatSync` and skip symlinks, or track visited inode/path set.

---

### MD-02: `getFiles` is fully synchronous and reads the entire tree before processing

**File:** `src/utils.ts:10-34`

**Issue:** Large monorepos (10k+ files) will block the event loop for seconds. Not a correctness issue but a UX/scale concern. Also `fs.readdirSync` followed by per-entry `fs.statSync` is O(2N) syscalls; `fs.readdirSync(dir, { withFileTypes: true })` would halve that.

**Fix:** Use `withFileTypes` to get `Dirent` and skip the extra `statSync`.

---

### MD-03: `excludeDirs` matches by basename only

**File:** `src/utils.ts:24`

**Issue:** `excludeDirs.includes(file)` only matches the directory's own name, so a user cannot exclude `src/legacy` while keeping `legacy` as a name elsewhere. Conversely, excluding `coverage` also excludes every `coverage` subdirectory anywhere. There is no glob support despite the README potentially implying it.

**Fix:** Document that excludeDirs is basename-match, OR support path/glob patterns.

---

### MD-04: Keys containing literal dots are ambiguous with nesting

**File:** `src/utils.ts:46-69, 75-97`

**Issue:** `flattenObject` and `setNestedValue` use `.` as both a path separator *and* a permitted character in flat keys. If a locale contains `{ "user.name": "X", "user": { "name": "Y" } }`, after flatten both yield `user.name` — one overwrites the other depending on iteration order, and the unflatten round-trip cannot recover the original shape. The extraction regex also permits `.` in keys (`[a-zA-Z0-9_\-.]+`), so `t("user.name")` is indistinguishable from `t("user").name`.

**Fix:** Document the restriction; warn when a flat key collides with a nested path in `flattenObject`.

---

### MD-05: No validation of supportedLanguages format

**File:** `src/config.ts:18-30`

**Issue:** `supportedLanguages` is `z.array(z.string()).nonempty()` — any nonempty string is accepted, including `"../../etc/passwd"`. While `findLocaleFile` joins this onto `localesDirAbs`, a malicious config could read/write arbitrary files via `path.join(localesDirAbs, "../../something")`. This is local-only (user owns their config), but in CI contexts where config is fetched from PRs, it's a real concern.

**Fix:** Validate language codes as `/^[a-zA-Z0-9_-]+$/` in Zod.

---

### MD-06: `path.resolve(cwd, config.localesDir)` allows escape from cwd

**File:** `src/commands/validate.ts:10`, `extract.ts:10`, `prune.ts:10`

**Issue:** If `localesDir` in config is `"../../../etc"`, `path.resolve` happily produces `/etc`. The tool then reads and (in `extract`/`prune`) writes there. Same applies to `scanDirs` and `outputReport`. The CLI does not warn when paths resolve outside cwd.

**Fix:** After resolving, verify the resolved path starts with `cwd` (or warn loudly). This is also a defense-in-depth measure for CR-01.

---

### MD-07: `outputReport` written without ensuring parent dir exists

**File:** `src/commands/validate.ts:374-486`

**Issue:** If `outputReport: "reports/i18n.md"` and the `reports/` directory doesn't exist, `fs.writeFileSync` throws ENOENT. The error is uncaught here (it propagates to the CLI's catch), but the validate function has already completed all work; the only loss is the report.

**Fix:** `fs.mkdirSync(path.dirname(reportPath), { recursive: true })` before writing.

---

### MD-08: No atomic write; SIGINT mid-write corrupts locale files

**File:** `src/utils.ts:167-182` (`writeLocaleFile`), used by extract.ts:109 and prune.ts:160.

**Issue:** `fs.writeFileSync(filePath, content, "utf8")` is not atomic. If the process is killed mid-write (Ctrl-C during a large file), the locale file is truncated. For a tool that boasts "prune" as a feature, this is a notable data-loss risk.

**Fix:** Write to `filePath + ".tmp"` then `fs.renameSync(tmp, filePath)`. Rename is atomic on the same filesystem on POSIX and on NTFS (Windows) for the same volume.

---

### MD-09: `keysOnlyInLanguages` key uses `_not_` separator that can collide with language codes

**File:** `src/commands/validate.ts:262-267, 336`

**Issue:** The composite key is `${defaultLanguage}_not_${lang}`. If a language code contains `_not_` (it cannot in BCP-47, but the schema permits arbitrary strings — see MD-05), the later `key.split("_not_")` is ambiguous. With validation added per MD-05 this becomes moot, but right now it's brittle.

**Fix:** Use an object `{ from: string; to: string; keys: string[] }[]` instead of string-encoded keys.

---

### MD-10: Windows backslash paths leak into reports

**File:** `src/commands/validate.ts:102, 164, 310, 405-407` etc.

**Issue:** `path.relative(cwd, file)` on Windows returns `src\commands\validate.ts`. These paths are embedded into the markdown report and into console output. Most renderers display them fine, but they make the report platform-specific and they break copy/paste-into-shell on POSIX. The pattern `${f}` inside backticks in the report also means a backslash before a backtick in a path (very rare but legal on POSIX) could break Markdown.

**Fix:** Normalize with `relativePath.split(path.sep).join("/")` for display.

---

### MD-11: `keyRegex.lastIndex = 0` reset is correct, but the regex is re-used across files unsafely

**File:** `src/commands/validate.ts:106, 122, 138`

**Issue:** Already mitigated by manual `lastIndex = 0` resets, but if any future refactor forgets the reset, the `/g` flag will skip matches in subsequent files. A safer pattern is `for (const match of cleanContent.matchAll(regex))` which doesn't depend on shared state. Tooling pitfall; not currently broken.

**Fix:** Switch to `matchAll`.

---

### MD-12: `outputReport: ""` is treated as "produce report at empty path"

**File:** `src/config.ts:66` and `src/commands/validate.ts:374`

**Issue:** The merge logic is `fileConfig.outputReport !== undefined ? fileConfig.outputReport : DEFAULT_CONFIG.outputReport`. A user setting `"outputReport": ""` to disable reporting will instead produce `path.resolve(cwd, "")` = `cwd`, and `fs.writeFileSync` writes the report **into the cwd as a file with no name** — which actually errors (`EISDIR`). The check `if (config.outputReport)` at validate.ts:374 *does* short-circuit on empty string, so the actual outcome is "no report and no warning". But the intent (vs. accidentally falling back to default) is undocumented.

**Fix:** Document `""` semantics explicitly, or treat it as "disabled" via an explicit `false` value.

---

## LOW Severity Issues

### LO-01: `process.exit` inside `.action()` swallows pending I/O

`src/cli.ts:32, 36, 47, 51, 62, 66` — Calling `process.exit(0)` immediately after `validate()`/`extract()`/`prune()` can truncate `console.log` output on Windows when stdout is piped. Use `process.exitCode = 0` and let Node drain naturally.

### LO-02: `loadConfig` swallows package.json read errors silently

`src/config.ts:52-54` — A corrupt `package.json` is ignored with no warning. If the user *intended* to put `i18nSharpen` config there, they'll be confused why defaults are applied.

### LO-03: `loadConfig` does not validate that the `cwd` argument is a real directory

`src/config.ts:32` — Passing a nonexistent `cwd` silently produces a config (because `existsSync` returns false for both candidate paths) using all defaults. The user sees zero error.

### LO-04: Magic numbers / strings

`src/config.ts:6-16` — `outputReport: "i18n-coverage.md"`, default suffixes, default scan dir `"src"` are all hard-coded. Acceptable, but worth a single `constants.ts`.

### LO-05: Unused `localesData` in `prune`

`src/commands/prune.ts:63` — `localesData` is populated but never read after the flatten step. Dead code.

### LO-06: `isKeyUsed` is duplicated verbatim between validate and prune

`src/commands/validate.ts:196-216` ≡ `src/commands/prune.ts:114-134`. `getBaseKey` is also duplicated. Move to `utils.ts`.

### LO-07: `keyToFilesMap` accumulates references in array; `O(n²)` due to `includes`

`src/commands/validate.ts:116, 132, 177` — Each `files.includes(relativePath)` is linear. Use `Set<string>` and convert to array at the end. (Performance issue, technically out of scope per CLAUDE.md, but trivial.)

### LO-08: `matchWildcard` does not escape `*` inside character classes

`src/utils.ts:189` — The escape pass `replace(/[.+^${}()|[\]\\]/g, "\\$&")` does not escape `?`, so a pattern `a?b` is interpreted as regex `a?b` (zero-or-one) rather than literal `?` or wildcard `?`. Likely fine because `?` is rarely in keys, but inconsistent with the documented "wildcard" pattern.

### LO-09: `version` is hard-coded in cli.ts

`src/cli.ts:14` — `.version("0.1.0")` will drift from `package.json#version`. Read it dynamically.

### LO-10: Emoji in console output assumes terminal support

`src/utils.ts:205-211` and many other places — Windows `cmd.exe` (still common) renders `✅` as `?`. picocolors handles colors but not emoji. Consider providing a fallback or `--no-emoji` flag.

---

## Cross-File Observations

1. The three commands (`validate`, `extract`, `prune`) each independently re-implement file scanning, regex construction, and key extraction. Any fix to the regex (HI-02, HI-03) must be applied in **three places**. Recommend extracting `extractKeysFromFiles(files, config): { usedKeys: Set<string>; keyToFiles: Map<...> }` into `utils.ts`.

2. The library API surface (`index.ts`) re-exports `validate`, `extract`, `prune` — but their signatures `(config, cwd)` accept `cwd` as a *positional* string. A library caller has no easy way to: (a) avoid `process.exit` (see HI-06), (b) silence the `console.log`/`log.*` output, or (c) get structured results from `extract`/`prune` (they return `void`).

3. No tests visible in the review scope (only `src/i18n-sharpen.test.ts` exists per the directory listing but was not in scope). Given the regex bugs above (HI-01, HI-02, HI-03, HI-04), a snapshot suite of representative source files would catch most of them.

4. Cross-platform: `path.join` and `path.resolve` are correct, but **display** of paths and the `path.extname(...).toLowerCase()` calls assume case-insensitive matching on Windows — yet `extensions: [".json", ".yaml", ".yml"]` is already lowercase, so a `.JSON` file on Windows would be matched, while on Linux it would not. This is a hidden cross-platform behavior difference.

---

## Priority Fix List (in order)

1. **CR-01** Prototype pollution in `setNestedValue` (1-line fix, very high impact).
2. **HI-04** Operator-precedence bug at validate.ts:323 (1-line fix, visible UX bug).
3. **HI-01** Rewrite `stripComments` to be string-context-aware.
4. **HI-05** Decide whether the loose second-pass should exist; if yes, scope it tightly.
5. **HI-06** Stop calling `process.exit` inside library functions.
6. **HI-03** Fix `dynamicRegex` to catch concatenation/template-literal cases.
7. **CR-02** Escape regex inputs from config.
8. **MD-08** Atomic writes.
9. **MD-05 / MD-06** Tighten path/lang-code validation.
10. Everything else.

---

_Reviewed: 2026-05-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
_No source files were modified during this review._
