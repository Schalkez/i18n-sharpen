import * as fs from "fs"
import { PassThrough } from "node:stream"
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
import { prune, __setInteractiveIOForTests } from "@/commands/prune"
import { readLocaleFile, flattenObject } from "@/core/locale-io"

/* eslint-disable no-control-regex */
function stripAnsi(s: string) {
  return s.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    ""
  )
}
/* eslint-enable no-control-regex */

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

  it("prune is dry-run by default and does not modify files", async () => {
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
    const result = await prune(config, tempDir)
    expect(result.dryRun).toBe(true)
    expect(result.written).toBe(false)
    expect(result.totalPruned).toBe(1)
    expect(result.perLocale[0].prunedKeys).toEqual(["stale.key"])
    const after = fs.readFileSync(path.join(tempDir, "locales/en.json"), "utf8")
    expect(after).toBe(before)
  })

  it("prune writes when config.prune.force is true", async () => {
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

    const result = await prune(config, tempDir)
    expect(result.dryRun).toBe(false)
    expect(result.written).toBe(true)
    const pruned = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(pruned)).toEqual({ "used.key": "Used" })
  })

  it("prune options.dryRun overrides config.prune.force", async () => {
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
    const result = await prune(config, tempDir, { dryRun: true })
    expect(result.dryRun).toBe(true)
    expect(result.written).toBe(false)
    const after = fs.readFileSync(path.join(tempDir, "locales/en.json"), "utf8")
    expect(after).toBe(before)
  })

  it("should ignore keys ending with a dot in prune", async () => {
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

    await prune(config, tempDir, { force: true })
    const prunedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(prunedLocale)).toEqual({
      "normal.key": "Normal Key"
    })
  })

  it("should support wildcard bypass using ignoreKeys to prevent pruning", async () => {
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

    await prune(config, tempDir, { force: true })
    const prunedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(prunedLocale)).toEqual({
      "normal.key": "Normal Key",
      "status.success": "Success",
      "status.error": "Error"
    })
  })

  it("should handle plural suffix alignment in prune", async () => {
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

    await prune(config, tempDir, { force: true })
    const prunedLocale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(prunedLocale)).toEqual({
      count_one: "One item",
      count_other: "Other items"
    })
  })

  it("prune with namespaced layout prunes per namespace file [gap-1]", async () => {
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

    const result = await prune(config, tempDir)
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

  it("deletes empty namespace file when cleanEmpty is true and force is true (namespaced)", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('common:greeting')
      `,
      "locales/en/common.json": JSON.stringify({
        greeting: "Hello"
      }),
      "locales/en/auth.json": JSON.stringify({
        stale: "stale value"
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
      prune: { force: true, cleanEmpty: true }
    }

    const result = await prune(config, tempDir)
    expect(result.written).toBe(true)

    expect(fs.existsSync(path.join(tempDir, "locales/en/common.json"))).toBe(
      true
    )
    expect(fs.existsSync(path.join(tempDir, "locales/en/auth.json"))).toBe(
      false
    )
  })

  it("logs Would delete but does not physically delete empty namespace file when cleanEmpty is true and dryRun is true", async () => {
    const authPath = path.join(tempDir, "locales/en/auth.json")
    createMockProject(tempDir, {
      "src/index.ts": `
        t('common:greeting')
      `,
      "locales/en/common.json": JSON.stringify({
        greeting: "Hello"
      }),
      "locales/en/auth.json": JSON.stringify({
        stale: "stale value"
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
      prune: { force: false, cleanEmpty: true }
    }

    const result = await prune(config, tempDir)
    expect(result.written).toBe(false)
    expect(fs.existsSync(authPath)).toBe(true)

    const hasDeleteLog = logSpy.mock.calls.some(
      (call) =>
        typeof call[0] === "string" &&
        call[0].includes("Would delete") &&
        call[0].includes("auth.json")
    )
    expect(hasDeleteLog).toBe(true)
  })

  it("keeps empty namespace file with empty object when cleanEmpty is false", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('common:greeting')
      `,
      "locales/en/common.json": JSON.stringify({
        greeting: "Hello"
      }),
      "locales/en/auth.json": JSON.stringify({
        stale: "stale value"
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
      prune: { force: true, cleanEmpty: false }
    }

    const result = await prune(config, tempDir)
    expect(result.written).toBe(true)

    const authFile = path.join(tempDir, "locales/en/auth.json")
    expect(fs.existsSync(authFile)).toBe(true)
    const content = JSON.parse(fs.readFileSync(authFile, "utf8")) as unknown
    expect(content).toEqual({})
  })

  it("never deletes main lang file in flat layout even when cleanEmpty is true", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        // no keys
      `,
      "locales/en.json": JSON.stringify({
        stale: "stale value"
      })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      prune: { force: true, cleanEmpty: true }
    }

    const result = await prune(config, tempDir)
    expect(result.written).toBe(true)

    const flatFile = path.join(tempDir, "locales/en.json")
    expect(fs.existsSync(flatFile)).toBe(true)
    const content = JSON.parse(fs.readFileSync(flatFile, "utf8")) as unknown
    expect(content).toEqual({})
  })

  it("sorts remaining keys alphabetically on disk when sortKeys is alpha in prune", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t('z_key')
        t('a_key')
        t('m_key')
      `,
      "locales/en.json": JSON.stringify({
        z_key: "z",
        stale_key: "stale",
        m_key: "m",
        a_key: "a"
      })
    })

    const config = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      sortKeys: "alpha" as const,
      prune: { force: true }
    }

    await prune(config, tempDir)

    const rawFileContent = fs.readFileSync(
      path.join(tempDir, "locales/en.json"),
      "utf8"
    )
    const idxA = rawFileContent.indexOf("a_key")
    const idxM = rawFileContent.indexOf("m_key")
    const idxZ = rawFileContent.indexOf("z_key")
    expect(idxA).toBeLessThan(idxM)
    expect(idxM).toBeLessThan(idxZ)
    expect(rawFileContent).not.toContain("stale_key")
  })

  describe("prune: interactive integration", () => {
    function mockInteractiveIO() {
      const stdin = new PassThrough() as PassThrough & {
        isTTY: boolean
        setRawMode: (b: boolean) => void
      }
      const stdout = new PassThrough() as PassThrough & {
        isTTY: boolean
        columns?: number
        rows?: number
      }
      stdin.isTTY = true
      stdout.isTTY = true
      stdin.setRawMode = () => {
        /* noop */
      }
      const exitCalls: number[] = []
      const exit = (code: number) => {
        exitCalls.push(code)
      }
      const captured: string[] = []
      stdout.on("data", (c: Buffer) => captured.push(c.toString("utf8")))
      return {
        stdin,
        stdout,
        exit,
        exitCalls,
        getOutput: () => captured.join("")
      }
    }

    it("interactive + force writes only TUI-selected (toDelete) keys", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('used.key')`,
        "locales/en.json": JSON.stringify({
          "used.key": "Used",
          "stale.a": "A",
          "stale.b": "B"
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

      const io = mockInteractiveIO()
      __setInteractiveIOForTests({
        stdin: io.stdin,
        stdout: io.stdout,
        exit: io.exit
      })

      // Schedule keys: Space (check stale.a), Arrow Down, Space (check stale.b), Enter
      setImmediate(() => {
        io.stdin.write(" ") // check stale.a
        setImmediate(() => {
          io.stdin.write("\x1b[B") // down to stale.b
          setImmediate(() => {
            io.stdin.write(" ") // check stale.b
            setImmediate(() => {
              io.stdin.write("\r") // enter
            })
          })
        })
      })

      const result = await prune(config, tempDir, {
        interactive: true,
        force: true
      })
      __setInteractiveIOForTests(undefined)

      expect(result.written).toBe(true)
      expect(result.totalPruned).toBe(2)
      const after = readLocaleFile(path.join(tempDir, "locales/en.json"))
      expect(flattenObject(after)).toEqual({ "used.key": "Used" })
    })

    it("interactive without --force prints preview and does not write", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('used.key')`,
        "locales/en.json": JSON.stringify({
          "used.key": "Used",
          "stale.a": "A",
          "stale.b": "B"
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

      const io = mockInteractiveIO()
      __setInteractiveIOForTests({
        stdin: io.stdin,
        stdout: io.stdout,
        exit: io.exit
      })

      setImmediate(() => {
        io.stdin.write(" ") // select stale.a
        setImmediate(() => io.stdin.write("\r"))
      })

      const result = await prune(config, tempDir, { interactive: true })
      __setInteractiveIOForTests(undefined)

      expect(result.written).toBe(false)
      expect(result.dryRun).toBe(true)
      expect(result.totalPruned).toBe(1) // only one key would be pruned

      const content = readLocaleFile(path.join(tempDir, "locales/en.json"))
      expect(flattenObject(content)).toHaveProperty("stale.b") // not touched

      const warnLog = stripAnsi(
        logSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n")
      )
      expect(warnLog).toContain("Re-run with --interactive --force to apply.")

      const infoLog = stripAnsi(
        logSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n")
      )
      expect(infoLog).toContain(
        "PRUNE PREVIEW (interactive — no files written)"
      )
      expect(infoLog).toContain(
        "Interactive selection: kept 1 keys, removed 1 keys."
      )
    })

    it("interactive --dry-run behaves identically to interactive alone", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('used.key')`,
        "locales/en.json": JSON.stringify({
          "used.key": "Used",
          "stale.a": "A"
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

      const io = mockInteractiveIO()
      __setInteractiveIOForTests({
        stdin: io.stdin,
        stdout: io.stdout,
        exit: io.exit
      })

      setImmediate(() => {
        io.stdin.write(" ") // select stale.a
        setImmediate(() => io.stdin.write("\r"))
      })

      const result = await prune(config, tempDir, {
        interactive: true,
        dryRun: true
      })
      __setInteractiveIOForTests(undefined)

      expect(result.written).toBe(false)
      expect(result.dryRun).toBe(true)
      expect(result.totalPruned).toBe(1)
    })

    it("interactive with no unused keys short-circuits and skips TUI", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('used.key')`,
        "locales/en.json": JSON.stringify({ "used.key": "Used" })
      })
      const config = {
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en"],
        fileExtensions: [".ts"],
        matchFunctions: ["t"]
      }

      const io = mockInteractiveIO()
      __setInteractiveIOForTests({
        stdin: io.stdin,
        stdout: io.stdout,
        exit: io.exit
      })

      const result = await prune(config, tempDir, { interactive: true })
      __setInteractiveIOForTests(undefined)

      expect(result.totalPruned).toBe(0)
      expect(io.getOutput()).toBe("") // TUI was never drawn
    })

    it("non-TTY + interactive falls back to dry-run preview of all keys", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('used.key')`,
        "locales/en.json": JSON.stringify({
          "used.key": "Used",
          "stale.a": "A"
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

      const originalIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, "isTTY", {
        value: false,
        configurable: true
      })

      try {
        const result = await prune(config, tempDir, { interactive: true })
        expect(result.written).toBe(false)
        expect(result.dryRun).toBe(true)
        expect(result.totalPruned).toBe(1)

        const warnLog = logSpy.mock.calls
          .map((c) => String(c[0] ?? ""))
          .join("\n")
        expect(warnLog).toContain(
          "--interactive requires a TTY; falling back to dry-run preview of all candidates."
        )
      } finally {
        Object.defineProperty(process.stdin, "isTTY", {
          value: originalIsTTY,
          configurable: true
        })
      }
    })

    it("non-TTY + interactive + force refuses to write and warns", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('used.key')`,
        "locales/en.json": JSON.stringify({
          "used.key": "Used",
          "stale.a": "A"
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

      const originalIsTTY = process.stdin.isTTY
      Object.defineProperty(process.stdin, "isTTY", {
        value: false,
        configurable: true
      })

      try {
        const result = await prune(config, tempDir, {
          interactive: true,
          force: true
        })
        expect(result.written).toBe(false)
        expect(result.dryRun).toBe(true)
        expect(result.totalPruned).toBe(1)

        const warnLog = logSpy.mock.calls
          .map((c) => String(c[0] ?? ""))
          .join("\n")
        expect(warnLog).toContain(
          "--interactive requires a TTY; --force ignored to avoid unintended bulk prune."
        )
        expect(warnLog).toContain(
          "Falling back to dry-run preview of all candidates."
        )
      } finally {
        Object.defineProperty(process.stdin, "isTTY", {
          value: originalIsTTY,
          configurable: true
        })
      }
    })

    it("interactive + cleanEmpty + force in namespaced layout deletes empty ns files", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('common:greeting')`,
        "locales/en/common.json": JSON.stringify({ greeting: "Hello" }),
        "locales/en/auth.json": JSON.stringify({ stale: "Stale Value" })
      })
      const config = {
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en"],
        fileExtensions: [".ts"],
        matchFunctions: ["t"],
        localesLayout: "namespaced" as const,
        prune: { cleanEmpty: true }
      }

      const io = mockInteractiveIO()
      __setInteractiveIOForTests({
        stdin: io.stdin,
        stdout: io.stdout,
        exit: io.exit
      })

      setImmediate(() => {
        io.stdin.write(" ") // select the unused auth:stale key
        setImmediate(() => io.stdin.write("\r"))
      })

      const result = await prune(config, tempDir, {
        interactive: true,
        force: true
      })
      __setInteractiveIOForTests(undefined)

      expect(result.written).toBe(true)
      expect(fs.existsSync(path.join(tempDir, "locales/en/common.json"))).toBe(
        true
      )
      expect(fs.existsSync(path.join(tempDir, "locales/en/auth.json"))).toBe(
        false
      ) // deleted empty ns
    })

    it("interactive with insufficient terminal height falls back to dry-run preview and warns", async () => {
      createMockProject(tempDir, {
        "src/index.ts": `t('used.key')`,
        "locales/en.json": JSON.stringify({
          "used.key": "Used",
          "stale.a": "A",
          "stale.b": "B"
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

      const io = mockInteractiveIO()
      io.stdout.rows = 2 // needs 3 rows (2 candidates + 1)
      __setInteractiveIOForTests({
        stdin: io.stdin,
        stdout: io.stdout,
        exit: io.exit
      })

      const result = await prune(config, tempDir, {
        interactive: true,
        force: true
      })
      __setInteractiveIOForTests(undefined)

      expect(result.written).toBe(false)
      expect(result.dryRun).toBe(true)
      expect(result.totalPruned).toBe(2)

      const warnLog = stripAnsi(
        logSpy.mock.calls.map((c) => String(c[0] ?? "")).join("\n")
      )
      expect(warnLog).toContain(
        "Interactive picker needs 3 rows but the terminal has 2."
      )
      expect(warnLog).toContain(
        "Falling back to dry-run preview — resize the terminal taller"
      )
    })
  })
})
