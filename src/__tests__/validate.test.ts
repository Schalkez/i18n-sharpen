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

  it("should ignore translation keys ending with a dot in validate and extract", () => {
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

    const validateRes = validate(config, tempDir)
    expect(validateRes.missingKeys).toContain("normal.missing")
    expect(validateRes.missingKeys).not.toContain("dynamic.prefix.")

    extract(config, tempDir)
    const extractedLocale = readLocaleFile(
      path.join(tempDir, "locales/en.json")
    )
    expect(flattenObject(extractedLocale)).toEqual({
      "normal.key": "Normal Key",
      "normal.missing": "normal.missing"
    })
    expect(extractedLocale["dynamic.prefix."]).toBeUndefined()
  })

  it("should support wildcard bypass using ignoreKeys", () => {
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

    const validateRes = validate(config, tempDir)
    expect(validateRes.unusedKeys).toContain("unused.key")
    expect(validateRes.unusedKeys).not.toContain("status.success")
    expect(validateRes.unusedKeys).not.toContain("status.error")
  })

  it("should handle plural suffix alignment", () => {
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

    const validateRes = validate(config, tempDir)
    expect(validateRes.unusedKeys).toContain("unrelated_other")
    expect(validateRes.unusedKeys).not.toContain("count_one")
    expect(validateRes.unusedKeys).not.toContain("count_other")
    expect(validateRes.missingKeys).not.toContain("count")
  })

  it("should scan JSX/HTML attributes for translation keys", () => {
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

    const validateRes = validate(config, tempDir)
    expect(validateRes.missingKeys).toContain("header.title")
    expect(validateRes.missingKeys).toContain("paragraph.body")
    expect(validateRes.missingKeys).not.toContain("ignored.key")

    extract(config, tempDir)
    const extractedLocale = readLocaleFile(
      path.join(tempDir, "locales/en.json")
    )
    expect(flattenObject(extractedLocale)).toEqual({
      "header.title": "header.title",
      "paragraph.body": "paragraph.body"
    })
  })

  it("should scan .vue / .svelte / .astro files with framework attributes [phase-8]", () => {
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

    const validateRes = validate(config, tempDir)
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

    it("classifies a mixed source into fully-dynamic and structured-concat (DKEY-01)", () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      const results = validate(baseConfig(), tempDir)

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

    it("ignoreDynamicKeys: ['*'] silences every finding (D-11)", () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      const results = validate(
        baseConfig({ ignoreDynamicKeys: ["*"] }),
        tempDir
      )
      expect(results.dynamicKeys.fullyDynamic.length).toBe(0)
      expect(results.dynamicKeys.structuredConcat.length).toBe(0)
    })

    it("ignoreDynamicKeys: ['error.*'] suppresses only matching prefixes (D-10)", () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      const results = validate(
        baseConfig({ ignoreDynamicKeys: ["error.*"] }),
        tempDir
      )

      const prefixes = results.dynamicKeys.structuredConcat.map((f) => f.prefix)
      expect(prefixes).not.toContain("error.")
      expect(prefixes).toContain("status.")
      // Fully-dynamic findings have empty prefix → "error.*" does NOT match → all retained.
      expect(results.dynamicKeys.fullyDynamic.length).toBe(3)
    })

    it("dynamic findings never contribute to the failure boolean (DKEY-03 / D-16)", () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      const results = validate(baseConfig(), tempDir)

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

    it("markdown report contains '## Dynamic Keys' with both sub-tables (DKEY-05)", () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      validate(baseConfig({ outputReport: "report.md" }), tempDir)
      const report = fs.readFileSync(path.join(tempDir, "report.md"), "utf8")

      expect(report).toContain("## Dynamic Keys")
      expect(report).toContain("### Fully-dynamic keys (3)")
      expect(report).toContain("### Structured-concat keys (2)")
    })

    it("markdown report surfaces the leading prefix in structured-concat rows (DKEY-02)", () => {
      createMockProject(tempDir, {
        "src/auth.ts": mixedSource,
        "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
      })
      validate(baseConfig({ outputReport: "report.md" }), tempDir)
      const report = fs.readFileSync(path.join(tempDir, "report.md"), "utf8")

      expect(report).toMatch(/\|\s*`error\.`\s*\|/)
      expect(report).toMatch(/\|\s*`status\.`\s*\|/)
    })

    // FIX-1 regression coverage — i18next-style options-object usage
    it("does NOT misclassify t('key', { options }) as dynamic (FIX-1)", () => {
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

      const results = validate(baseConfig(), tempDir)

      expect(results.dynamicKeys.fullyDynamic).toHaveLength(0)
      expect(results.dynamicKeys.structuredConcat).toHaveLength(0)
      // And the static key IS counted as used (existing buildKeyRegex behavior, regression check):
      expect(results.missingKeys).toHaveLength(0)
    })

    it("still classifies concat-WITH-options as structured-concat (FIX-1)", () => {
      createMockProject(tempDir, {
        "locales/en.json": JSON.stringify({}),
        "src/a.ts": [
          `t("error." + code, { option: true })`,
          `t("status." + s, { count: 2 })`
        ].join("\n")
      })

      const results = validate(baseConfig(), tempDir)

      expect(results.dynamicKeys.structuredConcat).toHaveLength(2)
      const prefixes = results.dynamicKeys.structuredConcat
        .map((f) => f.prefix)
        .sort()
      expect(prefixes).toEqual(["error.", "status."])
    })

    // FIX-2 regression coverage — backticks in template-literal expressions
    it("renders backtick-containing expressions as valid CommonMark inline code (FIX-2)", () => {
      createMockProject(tempDir, {
        "locales/en.json": JSON.stringify({}),
        "src/a.ts": "t(`error.${code}`)\n"
      })

      validate(baseConfig({ outputReport: "report.md" }), tempDir)
      const report = fs.readFileSync(path.join(tempDir, "report.md"), "utf8")

      // Expression cell must use DOUBLE-backtick wrap (with padding spaces) because
      // the expression contains a backtick. Backslash-escape is invalid CommonMark.
      expect(report).toMatch(/\|\s*``\s*t\(`error\.\$\{code\}`\)\s*``\s*\|/)
      // Negative: NO backslash-escape pattern should appear.
      expect(report).not.toMatch(/\\`/)
    })
  })
})
