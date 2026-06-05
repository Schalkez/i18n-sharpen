import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, afterEach, vi } from "vitest"
import { loadConfig } from "@/config/loader"
import { I18nSharpenError } from "@/core/errors"

const created: string[] = []

function makeTmp(): string {
  const dir = path.resolve(
    __dirname,
    `../../scratch/loader-${Math.random().toString(36).slice(2, 11)}`
  )
  fs.mkdirSync(dir, { recursive: true })
  created.push(dir)
  return dir
}

function write(dir: string, name: string, content: string): string {
  const p = path.join(dir, name)
  fs.writeFileSync(p, content, "utf8")
  return p
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of created.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("config/loader: cwd validation", () => {
  it("throws a config error when cwd does not exist", () => {
    const missing = path.resolve(__dirname, "../../scratch/does-not-exist-xyz")
    try {
      loadConfig(missing)
      expect.unreachable("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(I18nSharpenError)
      expect((e as I18nSharpenError).error.kind).toBe("config")
      expect((e as I18nSharpenError).message).toMatch(/cwd does not exist/)
    }
  })

  it("throws a config error when cwd is a file, not a directory", () => {
    const dir = makeTmp()
    const file = write(dir, "not-a-dir.txt", "hi")
    expect(() => loadConfig(file)).toThrow(/cwd is not a directory/)
  })
})

describe("config/loader: explicit configPath", () => {
  it("resolves a relative configPath against cwd", () => {
    const dir = makeTmp()
    write(
      dir,
      "custom.json",
      JSON.stringify({
        scanDirs: ["app"],
        localesDir: "i18n",
        defaultLanguage: "de",
        supportedLanguages: ["de", "en"]
      })
    )
    const config = loadConfig(dir, "custom.json")
    expect(config.defaultLanguage).toBe("de")
    expect(config.scanDirs).toEqual(["app"])
  })

  it("throws when an explicit configPath points at a directory", () => {
    const dir = makeTmp()
    fs.mkdirSync(path.join(dir, "subdir"))
    expect(() => loadConfig(dir, "subdir")).toThrow(/is not a file/)
  })

  it("throws a parse error when an explicit config file is malformed JSON", () => {
    const dir = makeTmp()
    write(dir, "broken.json", "{ not valid json ")
    try {
      loadConfig(dir, "broken.json")
      expect.unreachable("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(I18nSharpenError)
      expect((e as I18nSharpenError).error.kind).toBe("parse")
      expect((e as I18nSharpenError).message).toMatch(/Failed to parse/)
    }
  })
})

describe("config/loader: auto-discovery", () => {
  it("discovers i18n-sharpen.json in cwd", () => {
    const dir = makeTmp()
    write(
      dir,
      "i18n-sharpen.json",
      JSON.stringify({
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "ja",
        supportedLanguages: ["ja"]
      })
    )
    const config = loadConfig(dir)
    expect(config.defaultLanguage).toBe("ja")
    expect(config.localesDir).toBe("locales")
  })

  it("warns (does not throw) when discovered i18n-sharpen.json is malformed", () => {
    const dir = makeTmp()
    write(dir, "i18n-sharpen.json", "{ broken ")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const config = loadConfig(dir)
    // Falls back to defaults instead of throwing.
    expect(config.defaultLanguage).toBe("en")
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to parse i18n-sharpen\.json/)
    )
  })

  it("reads the i18nSharpen field from package.json", () => {
    const dir = makeTmp()
    write(
      dir,
      "package.json",
      JSON.stringify({
        name: "demo",
        i18nSharpen: {
          scanDirs: ["lib"],
          localesDir: "trans",
          defaultLanguage: "ko",
          supportedLanguages: ["ko", "en"]
        }
      })
    )
    const config = loadConfig(dir)
    expect(config.defaultLanguage).toBe("ko")
    expect(config.scanDirs).toEqual(["lib"])
  })

  it("warns when package.json itself is malformed", () => {
    const dir = makeTmp()
    write(dir, "package.json", "{ broken ")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const config = loadConfig(dir)
    expect(config.defaultLanguage).toBe("en")
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Failed to read package\.json/)
    )
  })

  it("falls back to defaults when package.json has no i18nSharpen field", () => {
    const dir = makeTmp()
    write(dir, "package.json", JSON.stringify({ name: "demo" }))
    const config = loadConfig(dir)
    expect(config.defaultLanguage).toBe("en")
    expect(config.scanDirs).toEqual(["src"])
  })

  it("prefers an explicit i18n-sharpen.json over package.json", () => {
    const dir = makeTmp()
    write(
      dir,
      "i18n-sharpen.json",
      JSON.stringify({
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "fr",
        supportedLanguages: ["fr"]
      })
    )
    write(
      dir,
      "package.json",
      JSON.stringify({ i18nSharpen: { defaultLanguage: "es" } })
    )
    const config = loadConfig(dir)
    expect(config.defaultLanguage).toBe("fr")
  })
})

describe("config/loader: zod validation", () => {
  it("throws a config error listing invalid fields", () => {
    const dir = makeTmp()
    write(
      dir,
      "i18n-sharpen.json",
      JSON.stringify({
        scanDirs: [],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en"]
      })
    )
    try {
      loadConfig(dir)
      expect.unreachable("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(I18nSharpenError)
      expect((e as I18nSharpenError).error.kind).toBe("config")
      expect((e as I18nSharpenError).message).toMatch(/Invalid configuration/)
      expect((e as I18nSharpenError).message).toMatch(/scanDirs/)
    }
  })

  it("rejects a matchFunctions token that is not identifier-like", () => {
    const dir = makeTmp()
    write(
      dir,
      "i18n-sharpen.json",
      JSON.stringify({
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en"],
        matchFunctions: ["not a token!"]
      })
    )
    expect(() => loadConfig(dir)).toThrow(/Invalid configuration/)
  })
})

describe("config/loader: normalization & warnings", () => {
  it("adds defaultLanguage to supportedLanguages when missing", () => {
    const dir = makeTmp()
    write(
      dir,
      "i18n-sharpen.json",
      JSON.stringify({
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "vi",
        supportedLanguages: ["en", "fr"]
      })
    )
    const config = loadConfig(dir)
    expect(config.supportedLanguages).toContain("vi")
    // defaultLanguage is prepended.
    expect(config.supportedLanguages[0]).toBe("vi")
  })

  it("warns when localesDir resolves outside cwd", () => {
    const dir = makeTmp()
    write(
      dir,
      "i18n-sharpen.json",
      JSON.stringify({
        scanDirs: ["src"],
        localesDir: "../outside-locales",
        defaultLanguage: "en",
        supportedLanguages: ["en"]
      })
    )
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    loadConfig(dir)
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/localesDir .* resolves outside cwd/)
    )
  })

  it("warns when a scanDirs entry resolves outside cwd", () => {
    const dir = makeTmp()
    write(
      dir,
      "i18n-sharpen.json",
      JSON.stringify({
        scanDirs: ["../escape"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en"]
      })
    )
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    loadConfig(dir)
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/scanDirs entry .* resolves outside cwd/)
    )
  })

  it("warns when outputReport resolves outside cwd", () => {
    const dir = makeTmp()
    write(
      dir,
      "i18n-sharpen.json",
      JSON.stringify({
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "en",
        supportedLanguages: ["en"],
        outputReport: "../report.md"
      })
    )
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    loadConfig(dir)
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/outputReport .* resolves outside cwd/)
    )
  })
})
