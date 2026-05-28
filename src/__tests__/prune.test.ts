import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance
} from "vitest"
import { prune } from "../commands/prune"
import { readLocaleFile, flattenObject } from "../utils"
import * as path from "path"
import * as fs from "fs"

describe("prune: integration", () => {
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

  it("prune is dry-run by default and does not modify files", () => {
    createMockProject(tempDir, {
      "src/index.ts": `t('used.key')`,
      "locales/en.json": JSON.stringify({
        "used.key": "Used",
        "stale.key": "Stale"
      })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }

    const before = fs.readFileSync(
      path.join(tempDir, "locales/en.json"),
      "utf8"
    )
    const result = prune(config, tempDir)
    expect(result.dryRun).toBe(true)
    expect(result.written).toBe(false)
    expect(result.totalPruned).toBe(1)
    expect(result.perLocale[0].prunedKeys).toEqual(["stale.key"])
    const after = fs.readFileSync(path.join(tempDir, "locales/en.json"), "utf8")
    expect(after).toBe(before)
  })

  it("prune writes when config.prune.force is true", () => {
    createMockProject(tempDir, {
      "src/index.ts": `t('used.key')`,
      "locales/en.json": JSON.stringify({
        "used.key": "Used",
        "stale.key": "Stale"
      })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      prune: { force: true }
    }

    const result = prune(config, tempDir)
    expect(result.dryRun).toBe(false)
    expect(result.written).toBe(true)
    const pruned = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(pruned)).toEqual({ "used.key": "Used" })
  })

  it("prune options.dryRun overrides config.prune.force", () => {
    createMockProject(tempDir, {
      "src/index.ts": `t('used.key')`,
      "locales/en.json": JSON.stringify({
        "used.key": "Used",
        "stale.key": "Stale"
      })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      prune: { force: true }
    }

    const before = fs.readFileSync(
      path.join(tempDir, "locales/en.json"),
      "utf8"
    )
    const result = prune(config, tempDir, { dryRun: true })
    expect(result.dryRun).toBe(true)
    expect(result.written).toBe(false)
    const after = fs.readFileSync(path.join(tempDir, "locales/en.json"), "utf8")
    expect(after).toBe(before)
  })

  it("should ignore keys ending with a dot in prune", () => {
    createMockProject(tempDir, {
      "src/index.ts": `t('normal.key')`,
      "locales/en.json": JSON.stringify({
        "normal.key": "Normal Key",
        "dynamic.prefix.": "Dynamic Prefix Value",
        "unused.key": "Unused Key"
      })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }

    prune(config, tempDir, { force: true })
    const prunedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(prunedLocale)).toEqual({
      "normal.key": "Normal Key"
    })
  })

  it("should support wildcard bypass using ignoreKeys to prevent pruning", () => {
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

    prune(config, tempDir, { force: true })
    const prunedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(prunedLocale)).toEqual({
      "normal.key": "Normal Key",
      "status.success": "Success",
      "status.error": "Error"
    })
  })

  it("should handle plural suffix alignment in prune", () => {
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

    prune(config, tempDir, { force: true })
    const prunedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(prunedLocale)).toEqual({
      count_one: "One item",
      count_other: "Other items"
    })
  })

  it("prune with namespaced layout prunes per namespace file [gap-1]", () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('common:greeting')
        t('auth:login.title')
      `,
      "locales/en/common.json": JSON.stringify({
        greeting: "Hello",
        farewell: "Goodbye"
      }),
      "locales/en/auth.json": JSON.stringify({
        login: { title: "Login", subtitle: "Welcome back" }
      })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      localesLayout: "namespaced" as const,
      prune: { force: true }
    }

    const result = prune(config, tempDir)
    expect(result.written).toBe(true)

    const commonLocale = readLocaleFile(
      path.join(tempDir, "locales/en/common.json")
    )
    expect(flattenObject(commonLocale)).toEqual({ greeting: "Hello" })
    expect(flattenObject(commonLocale)).not.toHaveProperty("farewell")

    const authLocale = readLocaleFile(
      path.join(tempDir, "locales/en/auth.json")
    )
    expect(flattenObject(authLocale)).toEqual({ "login.title": "Login" })
    expect(flattenObject(authLocale)).not.toHaveProperty("login.subtitle")

    const fileNames = result.perLocale.map((e) => path.basename(e.file))
    expect(fileNames).toContain("common.json")
    expect(fileNames).toContain("auth.json")
  })
})
