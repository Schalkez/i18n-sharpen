import * as fs from "fs"
import { PassThrough } from "node:stream"
import * as path from "path"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { prune, __setInteractiveIOForTests } from "@/commands/prune"
import { readLocaleFile, flattenObject } from "@/core/locale-io"
import type { I18nSharpenConfig } from "@/types"

/**
 * Exercises the interactive ORCHESTRATION in prune.ts (TTY detection, candidate
 * collection, cancel handling). The TUI renderer itself is covered separately
 * in interactive.test.ts.
 */
function mockStdio() {
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
  stdout.columns = 80
  stdout.rows = 24
  stdin.setRawMode = () => undefined
  stdout.on("data", () => undefined)
  return { stdin, stdout, exit: () => undefined }
}

const tick = () => new Promise((r) => setImmediate(r))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let tempDir: string

const config = (extra: Partial<I18nSharpenConfig> = {}): I18nSharpenConfig => ({
  scanDirs: ["src"],
  localesDir: "locales",
  defaultLanguage: "en",
  supportedLanguages: ["en"],
  fileExtensions: [".ts"],
  matchFunctions: ["t"],
  ...extra
})

beforeEach(() => {
  tempDir = path.resolve(
    __dirname,
    `../../../scratch/prune-iflow-${Math.random().toString(36).slice(2, 11)}`
  )
  fs.mkdirSync(path.join(tempDir, "src"), { recursive: true })
  fs.mkdirSync(path.join(tempDir, "locales"), { recursive: true })
  fs.writeFileSync(path.join(tempDir, "src/index.ts"), `t("used")`, "utf8")
  fs.writeFileSync(
    path.join(tempDir, "locales/en.json"),
    JSON.stringify({ used: "Used", dead1: "x", dead2: "y" }),
    "utf8"
  )
  vi.spyOn(console, "log").mockImplementation(() => undefined)
})

afterEach(() => {
  __setInteractiveIOForTests(undefined)
  process.exitCode = undefined
  vi.restoreAllMocks()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe("prune: interactive orchestration", () => {
  it("confirming the picker prunes the selected (all) candidates", async () => {
    const io = mockStdio()
    __setInteractiveIOForTests({ ...io, escDelay: 5 })
    const p = prune(config({ prune: { force: true } }), tempDir, {
      interactive: true,
      force: true
    })
    await sleep(60)
    io.stdin.write("a") // select all candidates
    await tick()
    io.stdin.write("\r") // confirm
    const result = await p
    expect(result.written).toBe(true)
    const locale = flattenObject(
      readLocaleFile(path.join(tempDir, "locales/en.json"))
    )
    expect(locale.dead1).toBeUndefined()
    expect(locale.dead2).toBeUndefined()
    expect(locale.used).toBe("Used")
  })

  it("Esc cancels with exit code 130 and writes nothing", async () => {
    const io = mockStdio()
    __setInteractiveIOForTests({ ...io, escDelay: 5 })
    const p = prune(config({ prune: { force: true } }), tempDir, {
      interactive: true,
      force: true
    })
    await sleep(60)
    io.stdin.write("\x1b") // Esc
    await sleep(20)
    const result = await p
    expect(result.written).toBe(false)
    expect(result.totalPruned).toBe(0)
    expect(process.exitCode).toBe(130)
    // locale untouched
    const locale = flattenObject(
      readLocaleFile(path.join(tempDir, "locales/en.json"))
    )
    expect(locale.dead1).toBe("x")
  })

  it("Ctrl+C (SIGINT) cancels with exit code 130 and writes nothing", async () => {
    const io = mockStdio()
    __setInteractiveIOForTests({ ...io, escDelay: 5 })
    const p = prune(config({ prune: { force: true } }), tempDir, {
      interactive: true,
      force: true
    })
    await sleep(60)
    io.stdin.write("\x03") // Ctrl+C
    const result = await p
    expect(result.written).toBe(false)
    expect(process.exitCode).toBe(130)
  })

  it("non-TTY interactive falls back to a dry-run preview", async () => {
    // No IO override AND no real TTY → isTTY false → fallback path.
    const result = await prune(config(), tempDir, { interactive: true })
    expect(result.dryRun).toBe(true)
    expect(result.written).toBe(false)
  })

  it("short-circuits the TUI when there are no unused keys", async () => {
    fs.writeFileSync(
      path.join(tempDir, "locales/en.json"),
      JSON.stringify({ used: "Used" }),
      "utf8"
    )
    const io = mockStdio()
    __setInteractiveIOForTests({ ...io, escDelay: 5 })
    const result = await prune(config(), tempDir, { interactive: true })
    // No candidates → defers to the normal pipeline without launching the TUI.
    expect(result.totalPruned).toBe(0)
  })
})
