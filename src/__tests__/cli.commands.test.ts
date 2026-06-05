import * as fs from "fs"
import * as path from "path"
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  vi,
  type MockInstance
} from "vitest"
import { program } from "@/cli"
import { readLocaleFile, flattenObject } from "@/core/locale-io"

/**
 * Drives the commander command tree in-process via `program.parseAsync`.
 * Each command action loads config from a temp project, runs the underlying
 * command, and sets `process.exitCode` — that wiring is what we assert here.
 */
describe("cli: command actions", () => {
  let tempDir: string
  let errorSpy: MockInstance

  function getTempDir(): string {
    return path.resolve(
      __dirname,
      `../scratch/cli-${Math.random().toString(36).slice(2, 11)}`
    )
  }

  function createProject(dir: string, files: Record<string, string>) {
    for (const [relPath, content] of Object.entries(files)) {
      const absPath = path.join(dir, relPath)
      fs.mkdirSync(path.dirname(absPath), { recursive: true })
      fs.writeFileSync(absPath, content, "utf8")
    }
  }

  /** Read a locale file back as a flat { "a.b": value } map. */
  function readFlatLocale(rel: string): Record<string, string> {
    return flattenObject(readLocaleFile(path.join(tempDir, rel)))
  }

  /** Run the CLI with the given args, returning the resulting exit code. */
  async function run(...args: string[]): Promise<number | undefined> {
    process.exitCode = undefined
    await program.parseAsync(["-d", tempDir, ...args], { from: "user" })
    const code = process.exitCode
    process.exitCode = undefined
    return code
  }

  beforeAll(() => {
    // Prevent commander from calling process.exit() on parse errors.
    program.exitOverride()
  })

  beforeEach(() => {
    tempDir = getTempDir()
    fs.mkdirSync(tempDir, { recursive: true })
    vi.spyOn(console, "log").mockImplementation(() => undefined)
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  const cleanProject = {
    "i18n-sharpen.json": JSON.stringify({
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      outputReport: ""
    }),
    "src/index.ts": `t("a.b")`,
    "locales/en.json": JSON.stringify({ "a.b": "AB" })
  }

  describe("validate", () => {
    it("exits 0 when there are no findings", async () => {
      createProject(tempDir, cleanProject)
      expect(await run("validate")).toBe(0)
    })

    it("exits 1 when keys are missing", async () => {
      createProject(tempDir, {
        ...cleanProject,
        "src/index.ts": `t("a.b"); t("missing.key")`
      })
      expect(await run("validate")).toBe(1)
    })

    it("exits 1 and reports the error when an explicit config file is malformed", async () => {
      createProject(tempDir, { "i18n-sharpen.json": "{ broken " })
      // An explicit -c path forces a fatal parse error (a discovered config
      // would only warn and fall back to defaults).
      const code = await run("-c", "i18n-sharpen.json", "validate")
      expect(code).toBe(1)
      expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/\[parse\]/))
    })

    it("runs the hardcoded-string check when --check-hardcoded is passed", async () => {
      createProject(tempDir, {
        "i18n-sharpen.json": JSON.stringify({
          scanDirs: ["src"],
          localesDir: "locales",
          defaultLanguage: "en",
          supportedLanguages: ["en"],
          fileExtensions: [".tsx"],
          matchFunctions: ["t"],
          outputReport: ""
        }),
        "locales/en.json": JSON.stringify({}),
        "src/App.tsx": `export const App = () => <div><h1>Hardcoded heading text</h1></div>`
      })
      // A hardcoded JSX text node flips exitCode to 1 under --check-hardcoded.
      // (The opt-in behavior — passing without the flag — is covered at the
      // function level in validate.test.ts; commander retains boolean option
      // state across parseAsync calls on the shared program instance, so we
      // don't re-run the same command here.)
      expect(await run("validate", "--check-hardcoded")).toBe(1)
    })
  })

  describe("extract", () => {
    it("injects missing keys and exits 0", async () => {
      createProject(tempDir, {
        ...cleanProject,
        "src/index.ts": `t("a.b"); t("new.key")`
      })
      expect(await run("extract")).toBe(0)
      const locale = readFlatLocale("locales/en.json")
      expect(locale["new.key"]).toBeDefined()
    })

    it("accepts a valid --sort override", async () => {
      createProject(tempDir, cleanProject)
      expect(await run("extract", "--sort", "alpha")).toBe(0)
    })

    it("exits 1 on an invalid --sort mode", async () => {
      createProject(tempDir, cleanProject)
      expect(await run("extract", "--sort", "nonsense")).toBe(1)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Invalid sort mode/)
      )
    })
  })

  describe("prune", () => {
    const withUnused = {
      ...cleanProject,
      "locales/en.json": JSON.stringify({ "a.b": "AB", "dead.key": "Dead" })
    }

    it("dry-run by default leaves the locale file untouched and exits 0", async () => {
      createProject(tempDir, withUnused)
      expect(await run("prune")).toBe(0)
      const locale = readFlatLocale("locales/en.json")
      expect(locale["dead.key"]).toBe("Dead")
    })

    it("--force actually removes the unused key", async () => {
      createProject(tempDir, withUnused)
      expect(await run("prune", "--force")).toBe(0)
      const locale = readFlatLocale("locales/en.json")
      expect(locale["dead.key"]).toBeUndefined()
      expect(locale["a.b"]).toBe("AB")
    })

    it("accepts --clean-empty and a valid --sort", async () => {
      createProject(tempDir, withUnused)
      expect(
        await run("prune", "--force", "--clean-empty", "--sort", "source")
      ).toBe(0)
    })

    it("exits 1 on an invalid --sort mode", async () => {
      createProject(tempDir, withUnused)
      expect(await run("prune", "--sort", "bogus")).toBe(1)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Invalid sort mode/)
      )
    })
  })
})
