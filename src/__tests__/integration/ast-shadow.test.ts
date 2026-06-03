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
import { detectUsedKeys } from "@/core/scanner"
import type { I18nSharpenConfig } from "@/types"

// ast-shadow.test.ts — SHADOW-01 / criterion #5
// Proves the useAst:true path is fully wired end-to-end (D-04/D-05/D-09).
// useAst is flipped only through the internal options param — no public config / CLI / env var.

describe("ast-shadow: useAst:true end-to-end (SHADOW-01)", () => {
  let tempDir: string
  let logSpy: MockInstance
  let errorSpy: MockInstance
  let warnSpy: MockInstance

  function getTempDir(): string {
    return path.resolve(
      __dirname,
      `../../scratch/temp-ast-shadow-${Math.random().toString(36).slice(2, 11)}`
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

  // ── A: used-key detection ──────────────────────────────────────────────
  it("detects a missing key via the AST path (Test A)", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `t("auth.login")`,
      "locales/en.json": JSON.stringify({})
    })
    const config: I18nSharpenConfig = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }
    const results = await validate(config, tempDir)
    expect(results.missingKeys).toContain("auth.login")
  })

  // ── B: unused key detection ────────────────────────────────────────────
  it("reports an unused key in AST mode (Test B)", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `t("auth.login")`,
      "locales/en.json": JSON.stringify({
        "auth.login": "Login",
        "auth.unused": "Unused"
      })
    })
    const config: I18nSharpenConfig = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }
    const results = await validate(config, tempDir)
    expect(results.unusedKeys).toContain("auth.unused")
    expect(results.missingKeys).not.toContain("auth.login")
  })

  // ── C: keys ending in "." are skipped (parity with regex path) ─────────
  it("skips keys ending with a dot in AST mode (Test C)", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `
        t("nav.home")
        t("dynamic.prefix.")
      `,
      "locales/en.json": JSON.stringify({ "nav.home": "Home" })
    })
    const config: I18nSharpenConfig = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }
    const results = await validate(config, tempDir)
    expect(results.missingKeys).not.toContain("dynamic.prefix.")
    expect(results.unusedKeys).not.toContain("dynamic.prefix.")
  })

  // ── D: fully-dynamic findings ──────────────────────────────────────────
  it("surfaces fully-dynamic key findings in AST mode (Test D)", async () => {
    createMockProject(tempDir, {
      "src/auth.ts": `
        t("user.greeting")
        t(getKey())
        t(\`\${prefix}.error\`)
        t(cond ? "a" : "b")
      `,
      "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
    })
    const config: I18nSharpenConfig = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }
    const results = await validate(config, tempDir)
    expect(results.dynamicKeys.fullyDynamic.length).toBeGreaterThanOrEqual(3)
    for (const f of results.dynamicKeys.fullyDynamic) {
      expect(f.line).toBeGreaterThan(0)
    }
  })

  // ── E: structured-concat findings + ignoreDynamicKeys suppression ──────
  it("classifies structured-concat findings and respects ignoreDynamicKeys in AST mode (Test E)", async () => {
    createMockProject(tempDir, {
      "src/auth.ts": `
        t("user.greeting")
        t("error." + code)
        t(\`status.\${state}\`)
      `,
      "locales/en.json": JSON.stringify({ "user.greeting": "Hi" })
    })
    const baseConfig = (
      extra: Partial<I18nSharpenConfig> = {}
    ): I18nSharpenConfig => ({
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"],
      ...extra
    })

    // Both prefixes detected
    const resultsFull = await validate(baseConfig(), tempDir)
    const prefixesFull = resultsFull.dynamicKeys.structuredConcat
      .map((f) => f.prefix)
      .sort()
    expect(prefixesFull).toContain("error.")
    expect(prefixesFull).toContain("status.")

    // ignoreDynamicKeys: ["error.*"] suppresses only error. prefix
    const resultsSuppressed = await validate(
      baseConfig({ ignoreDynamicKeys: ["error.*"] }),
      tempDir
    )
    const prefixesSuppressed =
      resultsSuppressed.dynamicKeys.structuredConcat.map((f) => f.prefix)
    expect(prefixesSuppressed).not.toContain("error.")
    expect(prefixesSuppressed).toContain("status.")
  })

  // ── F: hardcoded candidates with checkHardcoded:true ──────────────────
  it("detects hardcoded strings in AST mode with checkHardcoded:true (Test F)", async () => {
    createMockProject(tempDir, {
      "locales/en.json": JSON.stringify({}),
      "src/App.tsx": `
        export function App() {
          return (
            <div className="container">
              <h1>Hello World</h1>
              <input placeholder="Enter text" />
            </div>
          )
        }
      `
    })
    const config: I18nSharpenConfig = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".tsx"],
      hardcoded: {
        attributes: ["placeholder"]
      }
    }

    // Without checkHardcoded: hardcodedStrings is undefined
    const resultsWithout = await validate(config, tempDir)
    expect(resultsWithout.hardcodedStrings).toBeUndefined()

    // With checkHardcoded: true — findings include the visible text nodes
    const resultsWith = await validate(config, tempDir, {
      checkHardcoded: true
    })
    expect(resultsWith.hardcodedStrings).toBeDefined()
    const texts = (resultsWith.hardcodedStrings ?? []).map((f) => f.text).sort()
    expect(texts).toContain("Hello World")
    expect(texts).toContain("Enter text")
  })

  // ── G: extract with useAst:true ────────────────────────────────────────
  it("extract with useAst:true writes keys to the locale file (Test G)", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `t("nav.home")`,
      "locales/en.json": JSON.stringify({})
    })
    const config: I18nSharpenConfig = {
      scanDirs: ["src"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      matchFunctions: ["t"]
    }
    await expect(extract(config, tempDir)).resolves.not.toThrow()
    const locale = readLocaleFile(path.join(tempDir, "locales/en.json"))
    expect(flattenObject(locale)).toHaveProperty("nav.home")
  })

  // ── H: D-09 structural invariant — useAst absent from public types ─────
  it("useAst is not present in src/types.ts (D-09 invariant)", () => {
    const typesPath = path.resolve(__dirname, "../../types.ts")
    const content = fs.readFileSync(typesPath, "utf8")
    expect(content).not.toContain("useAst")
  })

  // ── I: D-16 default-is-AST guard test ───────────────────────────────────
  it("uses AST as the default engine when useAst is omitted (D-16)", async () => {
    createMockProject(tempDir, {
      "src/index.ts": `t("auth.login")`
    })

    // Call with NO useAst option.
    // In regex mode, parsedResults is []. In AST mode, it's populated.
    const { parsedResults } = await detectUsedKeys(
      [path.join(tempDir, "src/index.ts")],
      ["t"],
      [],
      { cwd: tempDir }
    )

    // This asserts that the AST path was executed by default.
    expect(parsedResults.length).toBeGreaterThan(0)
  })
})
