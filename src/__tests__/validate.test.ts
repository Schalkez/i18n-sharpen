import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance
} from "vitest"
import { validate } from "../commands/validate"
import { extract } from "../commands/extract"
import { readLocaleFile, flattenObject } from "../utils"
import * as path from "path"
import * as fs from "fs"

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
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
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
})
