import * as path from "path"
import { describe, it, expect } from "vitest"
import * as api from "@/index"
import { loadConfig, validate, extract, prune, I18nSharpenError } from "@/index"

/**
 * Guards the published package surface. `src/index.ts` is what npm consumers
 * import; if a re-export breaks or a symbol is dropped, this fails loudly.
 */
describe("public API (src/index.ts)", () => {
  it("exposes the documented runtime exports", () => {
    expect(typeof loadConfig).toBe("function")
    expect(typeof validate).toBe("function")
    expect(typeof extract).toBe("function")
    expect(typeof prune).toBe("function")
    expect(typeof I18nSharpenError).toBe("function")
  })

  it("does not leak unexpected runtime exports", () => {
    // Type-only exports are erased at runtime, so the surface is exactly
    // the five runtime symbols above.
    expect(Object.keys(api).sort()).toEqual(
      [
        "I18nSharpenError",
        "extract",
        "loadConfig",
        "prune",
        "translate",
        "validate"
      ].sort()
    )
  })

  it("wires loadConfig through to the config loader", () => {
    const config = loadConfig(path.resolve(__dirname, ".."))
    expect(config.defaultLanguage).toBe("en")
    expect(config.matchFunctions).toContain("t")
  })

  it("re-exports the error class used by the rest of the API", () => {
    const err = new I18nSharpenError({ kind: "config", message: "boom" })
    expect(err).toBeInstanceOf(Error)
    expect(err.error.kind).toBe("config")
  })
})
