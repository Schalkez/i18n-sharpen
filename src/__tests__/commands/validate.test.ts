import * as fs from "fs"
import * as path from "path"
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance
} from "vitest"
import { extract } from "@/commands/extract"
import { validate } from "@/commands/validate"
import { readLocaleFile, flattenObject } from "@/core/locale-io"
import type { I18nSharpenConfig } from "@/types"

describe("validate: integration", () => {
  let tempDir: string
  let logSpy: MockInstance
  let errorSpy: MockInstance
  let warnSpy: MockInstance

  function getTempDir(): string {
    return path.resolve(
      __dirname,
      `../../scratch/temp-test-${Math.random().toString(36).slice(2, 11)}`
    )
  }

  function createMockProject(dir: string, files: Record<string, string>) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    for (const [relPath, content] of Object.entries(files)) {
      const absPath = path.join(dir, relPath)
      fs.mkdirSync(path.dirname(absPath), { recursive: true })
      fs.writeFileSync(absPath, content, "utf8")
    }
  }

  beforeEach(() => {
    tempDir = getTempDir()
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {
      /* mock */
    })
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
      /* mock */
    })
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {
      /* mock */
    })
  })

  afterEach(() => {
    logSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("should ignore translation keys ending with a dot in validate and extract", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('normal.key')
        t('normal.missing')
        t('dynamic.prefix.')
      `,
      "locales/en.json": JSON.stringify({ "normal.key": "Normal Key" })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }

    const validateRes = await validate(config, tempDir)
    expect(validateRes.missingKeys).toContain("normal.missing")
    expect(validateRes.missingKeys).not.toContain("dynamic.prefix.")

    await extract(config, tempDir)
    const extractedLocale = readLocaleFile(
      path.join(tempDir, "locales/en.json")
    )
    expect(flattenObject(extractedLocale)).toEqual({
      "normal.key": "Normal Key",
      "normal.missing": "normal.missing"
    })
    expect(extractedLocale["dynamic.prefix."]).toBeUndefined()
  })

  it("should support wildcard bypass using ignoreKeys", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `t('normal.key')`,
      "locales/en.json": JSON.stringify({
        "normal.key": "Normal Key",
        "status.success": "Success",
        "status.error": "Error",
        "unused.key": "Unused"
      })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      ignoreKeys: ["status.*"]
    }

    const validateRes = await validate(config, tempDir)
    expect(validateRes.unusedKeys).toContain("unused.key")
    expect(validateRes.unusedKeys).not.toContain("status.success")
    expect(validateRes.unusedKeys).not.toContain("status.error")
  })

  it("should handle plural suffix alignment", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `t('count')`,
      "locales/en.json": JSON.stringify({
        count_one: "One item",
        count_other: "Other items",
        unrelated_other: "Unrelated"
      })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      pluralSuffixes: ["_one", "_other"]
    }

    const validateRes = await validate(config, tempDir)
    expect(validateRes.unusedKeys).toContain("unrelated_other")
    expect(validateRes.unusedKeys).not.toContain("count_one")
    expect(validateRes.unusedKeys).not.toContain("count_other")
    expect(validateRes.missingKeys).not.toContain("count")
  })

  it("should scan JSX/HTML attributes for translation keys", async () => {
    createMockProject(tempDir, {
      "src/index.tsx": `
        export function App() {
          return (
            <div>
              <h1 i18nKey="header.title">Title</h1>
              <p id="paragraph.body">Body</p>
              <span customAttr="ignored.key">Ignored</span>
            </div>
          )
        }
      `,
      "locales/en.json": JSON.stringify({})
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".tsx"],
      matchAttributes: ["i18nKey", "id"]
    }

    const validateRes = await validate(config, tempDir)
    expect(validateRes.missingKeys).toContain("header.title")
    expect(validateRes.missingKeys).toContain("paragraph.body")
    expect(validateRes.missingKeys).not.toContain("ignored.key")

    await extract(config, tempDir)
    const extractedLocale = readLocaleFile(
      path.join(tempDir, "locales/en.json")
    )
    expect(flattenObject(extractedLocale)).toEqual({
      "header.title": "header.title",
      "paragraph.body": "paragraph.body"
    })
  })

  it("should scan .vue / .svelte / .astro files with framework attributes [phase-8]", async () => {
    createMockProject(tempDir, {
      "src/Hello.vue": `<template>
        <h1 :label="vue.label">{{ $t('vue.greeting') }}</h1>
        <span v-t="'vue.directive'">x</span>
      </template>`,
      "src/Card.svelte": `<script>import { t } from "i18n"</script>
        <p>{t('svelte.body')}</p>
        <button i18n="svelte.button.label">Click</button>`,
      "src/Page.astro": `---
        const greet = t("astro.greet")
        ---
        <h1 t:lang="en" i18n="astro.title">Hi</h1>`,
      "locales/en.json": JSON.stringify({})
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".vue", ".svelte", ".astro"],
      matchFunctions: ["t", "$t"],
      matchAttributes: ["i18n", ":label", "v-t"]
    }

    const validateRes = await validate(config, tempDir)
    expect(validateRes.missingKeys).toContain("vue.greeting")
    expect(validateRes.missingKeys).toContain("svelte.body")
    expect(validateRes.missingKeys).toContain("astro.greet")
    expect(validateRes.missingKeys).toContain("vue.label")
    expect(validateRes.missingKeys).toContain("svelte.button.label")
    expect(validateRes.missingKeys).toContain("astro.title")
  })

  describe("validate: dynamic keys (Phase 2)", () => {
    const mixedSource = `
      t("user.greeting")
      t(getKey())
      t(\`\${prefix}.error\`)
      t(cond ? "a" : "b")
      t("error." + code)
      t(\`status.\${state}\`)
    `

    const baseConfig = (extra: Partial<I18nSharpenConfig> = {}) =>
      ({
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en"],
        fileExtensions: [".ts"],
        matchFunctions: ["t"],
        ...extra
      }) as I18nSharpenConfig

    it("classifies a mixed source into fully-dynamic and structured-concat (DKEY-01)", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      const results = await validate(baseConfig(), tempDir)

      expect(results.dynamicKeys.fullyDynamic.length).toBe(3)
      expect(results.dynamicKeys.structuredConcat.length).toBe(2)

      const prefixes = results.dynamicKeys.structuredConcat
        .map((f) => f.prefix)
        .sort()
      expect(prefixes).toEqual(["error.", "status."])

      for (const f of [
        ...results.dynamicKeys.fullyDynamic,
        ...results.dynamicKeys.structuredConcat
      ]) {
        expect(f.line).toBeGreaterThan(0)
      }
    })

    it("ignoreDynamicKeys: ['*'] silences every finding (D-11)", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      const results = await validate(
        baseConfig({ ignoreDynamicKeys: ["*"] }),
        tempDir
      )
      expect(results.dynamicKeys.fullyDynamic.length).toBe(0)
      expect(results.dynamicKeys.structuredConcat.length).toBe(0)
    })

    it("ignoreDynamicKeys: ['error.*'] suppresses only matching prefixes (D-10)", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      const results = await validate(
        baseConfig({ ignoreDynamicKeys: ["error.*"] }),
        tempDir
      )

      const prefixes = results.dynamicKeys.structuredConcat.map((f) => f.prefix)
      expect(prefixes).not.toContain("error.")
      expect(prefixes).toContain("status.")
      // Fully-dynamic findings have empty prefix → "error.*" does NOT match → all retained.
      expect(results.dynamicKeys.fullyDynamic.length).toBe(3)
    })

    it("dynamic findings never contribute to the failure boolean (DKEY-03 / D-16)", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      const results = await validate(baseConfig(), tempDir)

      // The CLI catch-site (validate.ts:227-230) constructs hasError from
      // these three; dynamic findings MUST NOT be added.
      expect(results.missingKeys.length).toBe(0)
      expect(results.activePlaceholderKeys.length).toBe(0)
      expect(results.keysOnlyInLanguages.length).toBe(0)

      // Sanity: findings actually exist — we are not trivially passing.
      expect(
        results.dynamicKeys.fullyDynamic.length +
          results.dynamicKeys.structuredConcat.length
      ).toBeGreaterThan(0)
    })

    it("markdown report contains '## Dynamic Keys' with both sub-tables (DKEY-05)", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      await validate(baseConfig({ outputReport: "report.md" }), tempDir)
      const report = fs.readFileSync(path.join(tempDir, "report.md"), "utf8")

      expect(report).toContain("## Dynamic Keys")
      expect(report).toContain("### Fully-dynamic keys (3)")
      expect(report).toContain("### Structured-concat keys (2)")
    })

    it("markdown report surfaces the leading prefix in structured-concat rows (DKEY-02)", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      await validate(baseConfig({ outputReport: "report.md" }), tempDir)
      const report = fs.readFileSync(path.join(tempDir, "report.md"), "utf8")

      expect(report).toMatch(/\|\s*`error\.`\s*\|/)
      expect(report).toMatch(/\|\s*`status\.`\s*\|/)
    })

    // FIX-1 regression coverage — i18next-style options-object usage
    it("does NOT misclassify t('key', { options }) as dynamic (FIX-1)", async () => {
      createMockProject(tempDir, {
        "locales/en.json": JSON.stringify({
          "user.greeting": "Hello {{name}}"
        }),
        "src/a.ts": [
          `t("user.greeting", { name: "John" })`,
          `t('user.greeting', { name: 'Jane' })`,
          't(`user.greeting`, { name: "Pat" })'
        ].join("\n")
      })

      const results = await validate(baseConfig(), tempDir)

      expect(results.dynamicKeys.fullyDynamic).toHaveLength(0)
      expect(results.dynamicKeys.structuredConcat).toHaveLength(0)
      // And the static key IS counted as used (existing buildKeyRegex behavior, regression check):
      expect(results.missingKeys).toHaveLength(0)
    })

    it("still classifies concat-WITH-options as structured-concat (FIX-1)", async () => {
      createMockProject(tempDir, {
        "locales/en.json": JSON.stringify({}),
        "src/a.ts": [
          `t("error." + code, { option: true })`,
          `t("status." + s, { count: 2 })`
        ].join("\n")
      })

      const results = await validate(baseConfig(), tempDir)

      expect(results.dynamicKeys.structuredConcat).toHaveLength(2)
      const prefixes = results.dynamicKeys.structuredConcat
        .map((f) => f.prefix)
        .sort()
      expect(prefixes).toEqual(["error.", "status."])
    })

    // FIX-2 regression coverage — backticks in template-literal expressions
    it("renders backtick-containing expressions as valid CommonMark inline code (FIX-2)", async () => {
      createMockProject(tempDir, {
        "locales/en.json": JSON.stringify({}),
        "src/a.ts": "t(`error.${code}`)\n"
      })

      await validate(baseConfig({ outputReport: "report.md" }), tempDir)
      const report = fs.readFileSync(path.join(tempDir, "report.md"), "utf8")

      // Expression cell must use DOUBLE-backtick wrap (with padding spaces) because
      // the expression contains a backtick. Backslash-escape is invalid CommonMark.
      expect(report).toMatch(/\|\s*``\s*t\(`error\.\$\{code\}`\)\s*``\s*\|/)
      // Negative: NO backslash-escape pattern should appear.
      expect(report).not.toMatch(/\\`/)
    })

    // New tests for missing dynamic keys validation and autoIgnoreDynamicPrefixes
    it("fails validation when a dynamic key prefix has zero keys in the default locale", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": `t("error." + code)`,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" }) // No key starting with "error."
      })
      const results = await validate(baseConfig(), tempDir)
      expect(results.missingDynamicKeys).toHaveLength(1)
      expect(results.missingDynamicKeys[0].prefix).toBe("error.")
    })

    it("passes validation when a dynamic key prefix has at least one key in the default locale", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": `t("error." + code)`,
        "locales/en.json": JSON.stringify({
          "error.generic": "An error occurred"
        })
      })
      const results = await validate(baseConfig(), tempDir)
      expect(results.missingDynamicKeys).toHaveLength(0)
    })

    it("does not fail validation for a missing dynamic key prefix if it is ignored via ignoreDynamicKeys", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": `t("error." + code)`,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      const results = await validate(
        baseConfig({ ignoreDynamicKeys: ["error.*"] }),
        tempDir
      )
      // Since it is suppressed, it is not in missingDynamicKeys or structuredConcat
      expect(results.missingDynamicKeys).toHaveLength(0)
    })

    it("does not report keys as unused if autoIgnoreDynamicPrefixes is true (default)", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": `t("error." + code)`,
        "locales/en.json": JSON.stringify({
          "error.generic": "An error occurred"
        })
      })
      const results = await validate(baseConfig(), tempDir)
      // "error.generic" would normally be unused because there is no static reference in code.
      // But since autoIgnoreDynamicPrefixes is true, it is treated as used/ignored.
      expect(results.unusedKeys).toHaveLength(0)
    })

    it("reports keys as unused if autoIgnoreDynamicPrefixes is false", async () => {
      createMockProject(tempDir, {
        "src/auth.ts": `t("error." + code)`,
        "locales/en.json": JSON.stringify({
          "error.generic": "An error occurred"
        })
      })
      const results = await validate(
        baseConfig({ autoIgnoreDynamicPrefixes: false }),
        tempDir
      )
      // Since autoIgnoreDynamicPrefixes is false, "error.generic" is marked as unused.
      expect(results.unusedKeys).toContain("error.generic")
    })
  })

  describe("hardcoded string checks", () => {
    it("detects untranslated text nodes, attributes, and JSX literals", async () => {
      createMockProject(tempDir, {
        "locales/en.json": JSON.stringify({ welcome: "Welcome" }),
        "src/App.tsx": `
          export function App() {
            return (
              <div className="container">
                <h1>Hello World</h1>
                <input placeholder="Enter text" label={t("welcome")} />
                <p>{"Goodbye"}</p>
                <p>{\`Template String\`}</p>
                <span>{t("welcome")}</span>
              </div>
            )
          }
        `
      })

      const config = {
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en"],
        fileExtensions: [".tsx"],
        hardcoded: {
          attributes: ["placeholder"]
        }
      }

      // Without checkHardcoded flag
      const resultsWithout = await validate(config, tempDir)
      expect(resultsWithout.hardcodedStrings).toBeUndefined()

      // With checkHardcoded flag
      const resultsWith = await validate(config, tempDir, {
        checkHardcoded: true
      })
      expect(resultsWith.hardcodedStrings).toBeDefined()
      expect(resultsWith.hardcodedStrings).toHaveLength(4)

      const findings = (resultsWith.hardcodedStrings ?? [])
        .map((f) => f.text)
        .sort()
      expect(findings).toEqual([
        "Enter text",
        "Goodbye",
        "Hello World",
        "Template String"
      ])

      // Markdown report generated with hardcoded strings table
      await validate({ ...config, outputReport: "report.md" }, tempDir, {
        checkHardcoded: true
      })
      const report = fs.readFileSync(path.join(tempDir, "report.md"), "utf8")
      expect(report).toContain("## Hardcoded Strings")
      expect(report).toContain("Hello World")
      expect(report).toContain("Enter text")
      expect(report).toContain("Goodbye")
      expect(report).toContain("Template String")
    })

    it("should detect untranslated fallback keys matching the default language value", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `
          t('title')
          t('desc')
        `,
        "locales/en.json": JSON.stringify({
          title: "Welcome",
          desc: "Description"
        }),
        "locales/ja.json": JSON.stringify({
          title: "Welcome",
          desc: "説明"
        })
      })

      const config = {
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en", "ja"],
        fileExtensions: [".ts"],
        matchFunctions: ["t"],
        strictFallbacks: true
      }

      const results = await validate(config, tempDir)
      expect(results.untranslatedFallbackKeys).toBeDefined()
      const fallbacks = results.untranslatedFallbackKeys ?? []
      expect(fallbacks).toHaveLength(1)
      expect(fallbacks[0].key).toBe("title")
      expect(fallbacks[0].lang).toBe("ja")
      expect(fallbacks[0].value).toBe("Welcome")

      await validate({ ...config, outputReport: "report.md" }, tempDir)
      const reportContent = fs.readFileSync(
        path.join(tempDir, "report.md"),
        "utf8"
      )
      expect(reportContent).toContain("## ⚠️ Untranslated Fallbacks")
      expect(reportContent).toContain('value matches default: `"Welcome"`')
    })

    it("should not detect empty-string default values as fallbacks", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `
          t('title')
          t('desc')
        `,
        "locales/en.json": JSON.stringify({
          title: "",
          desc: "Description"
        }),
        "locales/ja.json": JSON.stringify({
          title: "",
          desc: "説明"
        })
      })

      const config = {
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en", "ja"],
        fileExtensions: [".ts"],
        matchFunctions: ["t"],
        strictFallbacks: true
      }

      const results = await validate(config, tempDir)
      expect(results.untranslatedFallbackKeys).toBeDefined()
      const fallbacks = results.untranslatedFallbackKeys ?? []
      expect(fallbacks).toHaveLength(0)
    })

    it("should respect ignoreFallbackKeys to exclude matches from fallback check", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `
          t('brand')
          t('title')
        `,
        "locales/en.json": JSON.stringify({
          brand: "SplitWay",
          title: "Welcome"
        }),
        "locales/ja.json": JSON.stringify({
          brand: "SplitWay",
          title: "Welcome"
        })
      })

      const config = {
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en", "ja"],
        fileExtensions: [".ts"],
        matchFunctions: ["t"],
        strictFallbacks: true,
        ignoreFallbackKeys: ["brand"]
      }

      const results = await validate(config, tempDir)
      expect(results.untranslatedFallbackKeys).toBeDefined()
      const fallbacks = results.untranslatedFallbackKeys ?? []
      expect(fallbacks).toHaveLength(1)
      expect(fallbacks[0].key).toBe("title")
    })

    it("should calculate correct codeKeyCoverage without exceeding 100% when ignoreKeys are active", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `
          t('title')
          t('ignored_key')
        `,
        "locales/en.json": JSON.stringify({
          title: "Welcome",
          ignored_key: "Ignore Me",
          other_unused: "Stale"
        })
      })

      const config = {
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en"],
        fileExtensions: [".ts"],
        matchFunctions: ["t"],
        ignoreKeys: ["ignored_key", "other_unused"]
      }

      const results = await validate(config, tempDir)
      expect(results.codeKeyCoverage).toBe("100.00")
      expect(results.utilizationPercent).toBe("100.00")
    })
  })
})
