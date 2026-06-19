import * as fs from "fs"
import * as path from "path"
import readline from "readline"
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance
} from "vitest"
import { translate } from "@/commands/translate"
import { readLocaleFile, flattenObject } from "@/core/locale-io"

describe("translate: command", () => {
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
    vi.restoreAllMocks()
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("should interactively prompt and write translations for missing keys", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('greeting')
        t('farewell')
      `,
      "locales/en.json": JSON.stringify({
        greeting: "Hello"
      }),
      "locales/ja.json": JSON.stringify({
        greeting: "こんにちは"
      })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en", "ja"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }

    // Mock readline.createInterface
    let callCount = 0
    const questionMock = vi
      .fn()
      .mockImplementation((_query: string, callback: (ans: string) => void) => {
        callCount++
        if (callCount === 1) {
          callback("Goodbye")
        } else if (callCount === 2) {
          callback("さようなら")
        } else {
          callback("")
        }
      })

    const closeMock = vi.fn()
    vi.spyOn(readline, "createInterface").mockReturnValue({
      question: questionMock as unknown as (
        query: string,
        callback: (answer: string) => void
      ) => void,
      close: closeMock,
      on: vi.fn()
    } as unknown as readline.Interface)

    await translate(config, tempDir)

    // Verify translations were written
    const enLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(enLocale)).toEqual({
      greeting: "Hello",
      farewell: "Goodbye"
    })

    const jaLocale = readLocaleFile(path.join(tempDir, "locales/ja.json"))
    expect(flattenObject(jaLocale)).toEqual({
      greeting: "こんにちは",
      farewell: "さようなら"
    })
  })
})
