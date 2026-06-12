import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  printValidationResults,
  printDynamicKeysSummary,
  type KeyToFilesLookup
} from "@/commands/validate/output"
import type { ValidationResults } from "@/types"

function baseResults(
  overrides: Partial<ValidationResults> = {}
): ValidationResults {
  return {
    missingKeys: [],
    missingDynamicKeys: [],
    activePlaceholderKeys: [],
    unusedKeys: [],
    unusedPlaceholderKeys: [],
    keysOnlyInLanguages: [],
    codeKeyCoverage: "100.00",
    utilizationPercent: "100.00",
    totalDefinedKeys: 0,
    usedDefinedKeysCount: 0,
    dynamicKeys: { fullyDynamic: [], structuredConcat: [] },
    ...overrides
  }
}

let logged: string

const lookupFor = (map: Record<string, string[]>): KeyToFilesLookup => ({
  has: (k) => k in map,
  get: (k) => map[k]
})

beforeEach(() => {
  logged = ""
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged += args.join(" ") + "\n"
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("output: printValidationResults", () => {
  it("prints every failure section when results are fully populated", () => {
    printValidationResults(
      baseResults({
        missingKeys: ["m.key"],
        activePlaceholderKeys: [
          { key: "ph", lang: "en" },
          // base-key path: plural variant whose base is in the file map
          { key: "plur_one", lang: "en" }
        ],
        unusedKeys: ["stale"],
        unusedPlaceholderKeys: [{ key: "phu", lang: "fr" }],
        keysOnlyInLanguages: [{ from: "en", to: "fr", keys: ["b", "a"] }],
        hardcodedStrings: [{ file: "src/a.tsx", line: 3, text: "Hello" }],
        codeKeyCoverage: "50.00",
        utilizationPercent: "42.00",
        totalDefinedKeys: 4,
        usedDefinedKeysCount: 2
      }),
      lookupFor({ "m.key": ["src/a.ts"], plur: ["src/x.ts"] }),
      ["_one"]
    )

    expect(logged).toContain("Missing Keys (1)")
    expect(logged).toContain("m.key")
    expect(logged).toContain("src/a.ts")
    expect(logged).toContain("Active Placeholder")
    expect(logged).toContain("src/x.ts") // base-key file lookup hit
    expect(logged).toContain("Hardcoded Strings found (1)")
    expect(logged).toContain("src/a.tsx:3")
    expect(logged).toContain("Locale Alignment Mismatches")
    // alignment keys are sorted: a before b
    expect(logged.indexOf("- a")).toBeLessThan(logged.indexOf("- b"))
    expect(logged).toContain("Unused Keys in locales (1)")
    expect(logged).toContain("Unused Placeholder Keys in locales (1)")
    expect(logged).toContain("50.00%") // non-100 coverage (red branch)
  })

  it("prints all-clear success lines when there are no findings", () => {
    printValidationResults(baseResults(), lookupFor({}), [])
    expect(logged).toContain("Zero missing keys")
    expect(logged).toContain("Zero active placeholder keys")
    expect(logged).toContain("Perfect key alignment")
    expect(logged).toContain("Zero unused keys")
    expect(logged).toContain("100.00%")
    // hardcoded section is silent when the field is undefined
    expect(logged).not.toContain("hardcoded")
  })

  it("prints the hardcoded all-clear line when the check ran with no findings", () => {
    printValidationResults(
      baseResults({ hardcodedStrings: [] }),
      lookupFor({}),
      []
    )
    expect(logged).toContain("Zero un-translated hardcoded strings")
  })
})

describe("output: printDynamicKeysSummary", () => {
  it("is silent when there are no dynamic findings", () => {
    printDynamicKeysSummary({ fullyDynamic: [], structuredConcat: [] })
    expect(logged).toBe("")
  })

  it("prints both fully-dynamic and structured-concat sections", () => {
    printDynamicKeysSummary({
      fullyDynamic: [{ file: "src/a.ts", line: 1, expression: "t(getKey())" }],
      structuredConcat: [
        {
          prefix: "error.",
          file: "src/a.ts",
          line: 2,
          expression: "t(`error.${c}`)"
        }
      ]
    })
    expect(logged).toContain("DYNAMIC KEYS")
    expect(logged).toContain("Fully-dynamic keys (1)")
    expect(logged).toContain("t(getKey())")
    expect(logged).toContain("Structured-concat keys (1)")
    expect(logged).toContain("error.")
  })
})
