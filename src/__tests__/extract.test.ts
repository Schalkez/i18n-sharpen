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
      farewell: "farewell"
    })

    const authLocale = readLocaleFile(
      path.join(tempDir, "locales/en/auth.json")
    )
    expect(flattenObject(authLocale)).toMatchObject({
      "login.title": "login.title"
    })

    const defaultLocale = readLocaleFile(
      path.join(tempDir, "locales/en/default.json")
    )
    expect(flattenObject(defaultLocale)).toMatchObject({
      "noprefix.key": "noprefix.key"
    })
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
})
