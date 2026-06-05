import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { validate } from "@/commands/validate"
import { I18nSharpenError } from "@/core/errors"
import type { I18nSharpenConfig } from "@/types"

let tempDir: string

function project(files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(tempDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, "utf8")
  }
}

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

beforeEach(() => {
  tempDir = path.resolve(
    __dirname,
    `../../../scratch/validate-extra-${Math.random().toString(36).slice(2, 11)}`
  )
  fs.mkdirSync(tempDir, { recursive: true })
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe("validate: looseKeyMatch second pass", () => {
  it("counts a key referenced as a raw string literal (not via t())", async () => {
    project({
      // The key never appears inside t(); only as a bare string literal.
      "src/index.ts": `const ref = "loose.key"; t("real.key")`,
      "locales/en.json": JSON.stringify({
        "loose.key": "Loose",
        "real.key": "Real"
      })
    })

    const withoutLoose = await validate(baseConfig(), tempDir)
    expect(withoutLoose.unusedKeys).toContain("loose.key")

    const withLoose = await validate(
      baseConfig({ looseKeyMatch: true }),
      tempDir
    )
    expect(withLoose.unusedKeys).not.toContain("loose.key")
  })
})

describe("validate: locale loading edge cases", () => {
  it("warns when a non-default language file is missing", async () => {
    const warn = vi.spyOn(console, "log") // log.warn routes to console.log
    project({
      "src/index.ts": `t("a")`,
      "locales/en.json": JSON.stringify({ a: "A" })
    })
    await validate(baseConfig({ supportedLanguages: ["en", "fr"] }), tempDir)
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Locale file not found for language 'fr'/)
    )
  })

  it("reports cross-locale alignment when a second language is partial", async () => {
    project({
      "src/index.ts": `t("a"); t("b")`,
      "locales/en.json": JSON.stringify({ a: "A", b: "B" }),
      "locales/fr.json": JSON.stringify({ a: "Ah" })
    })
    const results = await validate(
      baseConfig({ supportedLanguages: ["en", "fr"] }),
      tempDir
    )
    expect(results.keysOnlyInLanguages).toContainEqual({
      from: "en",
      to: "fr",
      keys: ["b"]
    })
  })

  it("throws when the default-language locale file is absent", async () => {
    project({ "src/index.ts": `t("a")` })
    await expect(validate(baseConfig(), tempDir)).rejects.toBeInstanceOf(
      I18nSharpenError
    )
  })

  it("warns when a configured scanDir does not exist", async () => {
    const warn = vi.spyOn(console, "log")
    project({ "locales/en.json": JSON.stringify({}) })
    await validate(baseConfig({ scanDirs: ["src", "missing-dir"] }), tempDir)
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Scan directory does not exist/)
    )
  })
})
