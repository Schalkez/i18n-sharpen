import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from "vitest"
import { flattenObject, unflattenObject, getNestedValue, setNestedValue, stripComments, writeLocaleFile, readLocaleFile, matchWildcard } from "./utils"
import { loadConfig } from "./config"
import { validate } from "./commands/validate"
import { extract } from "./commands/extract"
import { prune } from "./commands/prune"
import * as path from "path"
import * as fs from "fs"

describe("i18n-sharpen core logic", () => {
  it("should flatten a nested object using dot notation", () => {
    const nested = {
      common: {
        loading: "Loading...",
        dialog: {
          confirm: "OK"
        }
      }
    }
    const flat = flattenObject(nested)
    expect(flat).toEqual({
      "common.loading": "Loading...",
      "common.dialog.confirm": "OK"
    })
  })

  it("should unflatten a dot-notation object back to nested structure", () => {
    const flat = {
      "common.loading": "Loading...",
      "common.dialog.confirm": "OK"
    }
    const nested = unflattenObject(flat)
    expect(nested).toEqual({
      common: {
        loading: "Loading...",
        dialog: {
          confirm: "OK"
        }
      }
    })
  })

  it("should get and set nested values using path keys", () => {
    const obj = {}
    setNestedValue(obj, "user.profile.name", "Alice")
    expect(obj).toEqual({
      user: {
        profile: {
          name: "Alice"
        }
      }
    })
    expect(getNestedValue(obj, "user.profile.name")).toBe("Alice")
    expect(getNestedValue(obj, "user.profile.age")).toBeUndefined()
  })

  it("should strip code comments correctly", () => {
    const code = `
      // This is a single line comment
      const t = "hello"; /* This is a 
      multiline comment */
      const url = "http://example.com"; // another comment
    `
    const clean = stripComments(code)
    expect(clean).toContain('const t = "hello";')
    expect(clean).toContain('const url = "http://example.com";')
    expect(clean).not.toContain("This is a single line comment")
    expect(clean).not.toContain("multiline comment")
  })

  it("should load configuration with default fallbacks", () => {
    const config = loadConfig(path.resolve(__dirname, ".."))
    expect(config.defaultLanguage).toBe("en")
    expect(config.supportedLanguages).toContain("en")
    expect(config.matchFunctions).toContain("t")
    expect(config.matchAttributes).toContain("i18nKey")
  })

  it("should parse and stringify YAML locale files correctly", () => {
    const tmpYamlFile = path.resolve(__dirname, "../scratch/test-temp-lang.yaml")
    const dir = path.dirname(tmpYamlFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const testObj = {
      common: {
        save: "Save Info",
        nested: {
          confirm: "Yes"
        }
      }
    }
    writeLocaleFile(tmpYamlFile, testObj)

    const parsed = readLocaleFile(tmpYamlFile)
    expect(parsed).toEqual(testObj)

    if (fs.existsSync(tmpYamlFile)) {
      fs.unlinkSync(tmpYamlFile)
    }
  })

  it("should match wildcards correctly", () => {
    expect(matchWildcard("status.*", "status.success")).toBe(true)
    expect(matchWildcard("status.*", "status.failed")).toBe(true)
    expect(matchWildcard("status.*", "other.status.success")).toBe(false)
    expect(matchWildcard("*.success", "status.success")).toBe(true)
    expect(matchWildcard("error.codes.*", "error.codes.404")).toBe(true)
  })
})

describe("i18n-sharpen command integration", () => {
  let tempDir: string
  const originalExit = process.exit
  let logSpy: MockInstance
  let errorSpy: MockInstance
  let warnSpy: MockInstance

  function getTempDir(): string {
    return path.resolve(__dirname, `../scratch/temp-test-${Math.random().toString(36).slice(2, 11)}`)
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
    // Prevent process.exit from terminating the test runner
    process.exit = (code?: number) => {
      throw new Error(`process.exit called with code ${code}`)
    }
    // Suppress console output to keep test logs clean
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    process.exit = originalExit
    logSpy.mockRestore()
    errorSpy.mockRestore()
    warnSpy.mockRestore()
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("should ignore translation keys ending with a dot in validate, extract, and prune", () => {
    // Step 1: Validate and Extract
    // Code has normal.key, normal.missing, and dynamic.prefix. (which ends with a dot)
    // locales only has normal.key.
    let files = {
      "src/index.ts": `
        t('normal.key')
        t('normal.missing')
        t('dynamic.prefix.')
      `,
      "locales/en.json": JSON.stringify({
        "normal.key": "Normal Key"
      })
    }
    createMockProject(tempDir, files)

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }

    const validateRes = validate(config, tempDir)
    // normal.missing should be missing, but dynamic.prefix. must be ignored and NOT missing
    expect(validateRes.missingKeys).toContain("normal.missing")
    expect(validateRes.missingKeys).not.toContain("dynamic.prefix.")

    // Extract should extract normal.missing but NOT dynamic.prefix.
    extract(config, tempDir)
    const extractedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(extractedLocale)).toEqual({
      "normal.key": "Normal Key",
      "normal.missing": "normal.missing"
    })
    expect(extractedLocale["dynamic.prefix."]).toBeUndefined()

    // Step 2: Prune
    // We update locales to have normal.key and dynamic.prefix. (plus an unused.key)
    // Code only has normal.key (so no literal matching for dynamic.prefix.)
    files = {
      "src/index.ts": `
        t('normal.key')
      `,
      "locales/en.json": JSON.stringify({
        "normal.key": "Normal Key",
        "dynamic.prefix.": "Dynamic Prefix Value",
        "unused.key": "Unused Key"
      })
    }
    createMockProject(tempDir, files)

    // Run validate, both dynamic.prefix. and unused.key should be unused
    const validateRes2 = validate(config, tempDir)
    expect(validateRes2.unusedKeys).toContain("dynamic.prefix.")
    expect(validateRes2.unusedKeys).toContain("unused.key")

    // Run prune, both should be pruned
    prune(config, tempDir)
    const prunedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(prunedLocale)).toEqual({
      "normal.key": "Normal Key"
    })
  })

  it("should support wildcard bypass using ignoreKeys to prevent pruning/unused warnings", () => {
    const files = {
      "src/index.ts": `
        t('normal.key')
      `,
      "locales/en.json": JSON.stringify({
        "normal.key": "Normal Key",
        "status.success": "Success",
        "status.error": "Error",
        "unused.key": "Unused"
      })
    }
    createMockProject(tempDir, files)

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

    prune(config, tempDir)
    const prunedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(prunedLocale)).toEqual({
      "normal.key": "Normal Key",
      "status.success": "Success",
      "status.error": "Error"
    })
  })

  it("should handle plural suffix alignment", () => {
    const files = {
      "src/index.ts": `
        t('count')
      `,
      "locales/en.json": JSON.stringify({
        "count_one": "One item",
        "count_other": "Other items",
        "unrelated_other": "Unrelated"
      })
    }
    createMockProject(tempDir, files)

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

    prune(config, tempDir)
    const prunedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(prunedLocale)).toEqual({
      "count_one": "One item",
      "count_other": "Other items"
    })
  })

  it("should scan JSX/HTML attributes for translation keys", () => {
    const files = {
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
    }
    createMockProject(tempDir, files)

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
    const extractedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(extractedLocale)).toEqual({
      "header.title": "header.title",
      "paragraph.body": "paragraph.body"
    })
  })
})

