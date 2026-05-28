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
import { readLocaleFile, flattenObject } from "@/core/locale-io"

describe("extract: integration", () => {
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

  it("extract with namespaced layout writes into namespace files [gap-1]", () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('common:greeting')
        t('common:farewell')
        t('auth:login.title')
        t('noprefix.key')
      `,
      "locales/en/common.json": JSON.stringify({ greeting: "Hello" })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      localesLayout: "namespaced" as const
    }

    extract(config, tempDir)

    const commonLocale = readLocaleFile(
      path.join(tempDir, "locales/en/common.json")
    )
    expect(flattenObject(commonLocale)).toMatchObject({
      greeting: "Hello",
      farewell: "farewell",
      "noprefix.key": "noprefix.key"
    })

    const authLocale = readLocaleFile(
      path.join(tempDir, "locales/en/auth.json")
    )
    expect(flattenObject(authLocale)).toMatchObject({
      "login.title": "login.title"
    })
  })

  it("extract with custom defaultNamespace writes un-prefixed keys to custom namespace", () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('noprefix.key')
      `,
      "locales/en/auth.json": JSON.stringify({})
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      localesLayout: "namespaced" as const,
      defaultNamespace: "auth"
    }

    extract(config, tempDir)

    const authLocale = readLocaleFile(
      path.join(tempDir, "locales/en/auth.json")
    )
    expect(flattenObject(authLocale)).toMatchObject({
      "noprefix.key": "noprefix.key"
    })
  })

  it("extract with legacy defaultNamespace: 'default' writes un-prefixed keys to default.json", () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('noprefix.key')
      `,
      "locales/en/default.json": JSON.stringify({})
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      localesLayout: "namespaced" as const,
      defaultNamespace: "default"
    }

    extract(config, tempDir)

    const defaultLocale = readLocaleFile(
      path.join(tempDir, "locales/en/default.json")
    )
    expect(flattenObject(defaultLocale)).toMatchObject({
      "noprefix.key": "noprefix.key"
    })
  })

  it("warns about legacy default namespace when default.json exists, common.json is absent, and defaultNamespace is unset", () => {
    createMockProject(tempDir, {
      "src/index.ts": "t('noprefix.key')",
      "locales/en/default.json": JSON.stringify({ old: "val" })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      localesLayout: "namespaced" as const
    }

    extract(config, tempDir)

    // Filter logSpy calls to find the one containing the warning message
    const warningCall = logSpy.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("legacy")
    )
    expect(warningCall).toBeDefined()
    if (!warningCall) throw new Error("Expected warningCall to be defined")
    const warningMessage = warningCall[0] as string
    expect(warningMessage).toContain("default")
    expect(warningMessage).toContain("common")
    expect(warningMessage).toContain("defaultNamespace")
  })

  it("does not warn if common.json exists alongside default.json", () => {
    createMockProject(tempDir, {
      "src/index.ts": "t('noprefix.key')",
      "locales/en/default.json": JSON.stringify({ old: "val" }),
      "locales/en/common.json": JSON.stringify({ greeting: "Hello" })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      localesLayout: "namespaced" as const
    }

    extract(config, tempDir)
    const hasLegacyWarning = logSpy.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("legacy")
    )
    expect(hasLegacyWarning).toBe(false)
  })

  it("does not warn if defaultNamespace is explicitly set to default", () => {
    createMockProject(tempDir, {
      "src/index.ts": "t('noprefix.key')",
      "locales/en/default.json": JSON.stringify({ old: "val" })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      localesLayout: "namespaced" as const,
      defaultNamespace: "default"
    }

    extract(config, tempDir)
    const hasLegacyWarning = logSpy.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("legacy")
    )
    expect(hasLegacyWarning).toBe(false)
  })

  it("does not warn if layout is flat", () => {
    createMockProject(tempDir, {
      "src/index.ts": "t('noprefix.key')",
      "locales/en.json": JSON.stringify({ old: "val" })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }

    extract(config, tempDir)
    const hasLegacyWarning = logSpy.mock.calls.some(
      (call) => typeof call[0] === "string" && call[0].includes("legacy")
    )
    expect(hasLegacyWarning).toBe(false)
  })

  it("should ignore translation keys ending with a dot in extract", () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('normal.key')
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

    extract(config, tempDir)
    const extracted = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(extracted)).toEqual({ "normal.key": "Normal Key" })
    expect(extracted["dynamic.prefix."]).toBeUndefined()
  })

  it("sorts extracted keys alphabetically on disk when sortKeys is alpha", () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('z_key')
        t('a_key')
        t('m_key')
      `,
      "locales/en.json": JSON.stringify({})
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      sortKeys: "alpha" as const
    }

    extract(config, tempDir)

    const rawFileContent = fs.readFileSync(
      path.join(tempDir, "locales/en.json"),
      "utf8"
    )
    const idxA = rawFileContent.indexOf("a_key")
    const idxM = rawFileContent.indexOf("m_key")
    const idxZ = rawFileContent.indexOf("z_key")
    expect(idxA).toBeLessThan(idxM)
    expect(idxM).toBeLessThan(idxZ)
  })
})
