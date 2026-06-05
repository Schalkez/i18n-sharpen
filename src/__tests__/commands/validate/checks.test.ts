import { describe, it, expect } from "vitest"
import {
  findMissingKeys,
  findUnusedKeys,
  findAlignmentMismatches,
  findPlaceholderKeys
} from "@/commands/validate/checks"

const set = (...keys: string[]) => new Set(keys)

describe("checks: findMissingKeys", () => {
  it("reports keys absent from the default locale", () => {
    const missing = findMissingKeys(set("a", "b", "c"), set("a", "b"), {})
    expect(missing).toEqual(["c"])
  })

  it("treats a key as present when a plural-suffix variant exists", () => {
    const missing = findMissingKeys(set("count", "gone"), set("count_one"), {
      pluralSuffixes: ["_one", "_other"]
    })
    expect(missing).toEqual(["gone"])
  })

  it("returns nothing when every used key is defined", () => {
    expect(findMissingKeys(set("a"), set("a"), {})).toEqual([])
  })
})

describe("checks: findUnusedKeys", () => {
  it("flags defined keys never used in code", () => {
    const unused = findUnusedKeys(["used", "stale"], set("used"), {})
    expect(unused).toEqual(["stale"])
  })

  it("respects ignoreKeys wildcards", () => {
    const unused = findUnusedKeys(
      ["used", "stale", "debug.a", "debug.b"],
      set("used"),
      { ignoreKeys: ["debug.*"] }
    )
    expect(unused).toEqual(["stale"])
  })
})

describe("checks: findAlignmentMismatches", () => {
  it("captures keys missing in a target AND extra keys only in the target", () => {
    const config = { defaultLanguage: "en", supportedLanguages: ["en", "fr"] }
    const defaultKeys = ["a", "b"]
    const mismatches = findAlignmentMismatches(
      config,
      defaultKeys,
      set("a", "b"),
      { en: { a: "A", b: "B" }, fr: { a: "A", c: "C" } },
      { en: set("a", "b"), fr: set("a", "c") }
    )

    expect(mismatches).toContainEqual({ from: "en", to: "fr", keys: ["b"] })
    expect(mismatches).toContainEqual({ from: "fr", to: "en", keys: ["c"] })
  })

  it("skips the default language and returns nothing when aligned", () => {
    const config = { defaultLanguage: "en", supportedLanguages: ["en", "fr"] }
    const mismatches = findAlignmentMismatches(
      config,
      ["a"],
      set("a"),
      { en: { a: "A" }, fr: { a: "A" } },
      { en: set("a"), fr: set("a") }
    )
    expect(mismatches).toEqual([])
  })
})

describe("checks: findPlaceholderKeys", () => {
  it("splits placeholders into active (used) and unused buckets", () => {
    const result = findPlaceholderKeys(
      { supportedLanguages: ["en"] },
      set("ph.active"),
      {
        en: {
          "ph.active": "ph.active",
          "ph.unused": "ph.unused",
          translated: "A real value"
        }
      }
    )

    expect(result.activePlaceholderKeys).toEqual([
      { key: "ph.active", lang: "en" }
    ])
    expect(result.unusedPlaceholderKeys).toEqual([
      { key: "ph.unused", lang: "en" }
    ])
  })
})
