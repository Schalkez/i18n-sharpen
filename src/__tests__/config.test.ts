import { describe, it, expect } from "vitest"
import { loadConfig } from "../config"
import * as path from "path"
import * as fs from "fs"

describe("config: loadConfig", () => {
  it("should load configuration with default fallbacks", () => {
    const config = loadConfig(path.resolve(__dirname, "../.."))
    expect(config.defaultLanguage).toBe("en")
    expect(config.supportedLanguages).toContain("en")
    expect(config.matchFunctions).toContain("t")
    expect(config.matchAttributes).toContain("i18nKey")
  })

  it("should load an explicit config path via the configPath argument", () => {
    const tmpDir = path.resolve(
      __dirname,
      `../../scratch/cfg-${Math.random().toString(36).slice(2, 9)}`
    )
    fs.mkdirSync(tmpDir, { recursive: true })
    const cfgPath = path.join(tmpDir, "custom.json")
    fs.writeFileSync(
      cfgPath,
      JSON.stringify({
        scanDirs: ["src"],
        localesDir: "locales",
        defaultLanguage: "fr",
        supportedLanguages: ["fr", "en"],
        matchFunctions: ["tt"]
      }),
      "utf8"
    )
    try {
      const config = loadConfig(tmpDir, cfgPath)
      expect(config.defaultLanguage).toBe("fr")
      expect(config.matchFunctions).toContain("tt")
      // relative path resolves against cwd
      const config2 = loadConfig(tmpDir, "custom.json")
      expect(config2.defaultLanguage).toBe("fr")
      // missing file throws
      expect(() => loadConfig(tmpDir, "nonexistent.json")).toThrow(
        /Config file not found/
      )
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
