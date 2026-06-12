import { describe, it, expect } from "vitest"
import {
  renderMarkdownReport,
  type KeyToFilesLookup
} from "@/commands/validate/report"
import type { ValidationResults } from "@/types"

const emptyLookup: KeyToFilesLookup = {
  has: () => false,
  get: () => undefined
}

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

describe("validate/report: renderMarkdownReport", () => {
  it("renders the all-green report when there are no issues", () => {
    const md = renderMarkdownReport({
      defaultBasename: "en.json",
      results: baseResults(),
      keyToFilesMap: emptyLookup,
      getBaseKey: (k) => k
    })
    expect(md).toContain("✅ Missing Keys")
    expect(md).toContain("✅ Locale Alignment")
    expect(md).toContain("✅ Unused Keys")
    expect(md).not.toContain("❌")
  })

  it("renders missing-keys section with the per-key file list", () => {
    const lookup: KeyToFilesLookup = {
      has: (k) => k === "missing.k",
      get: (k) => (k === "missing.k" ? ["src/a.ts"] : undefined)
    }
    const md = renderMarkdownReport({
      defaultBasename: "en.json",
      results: baseResults({ missingKeys: ["missing.k"] }),
      keyToFilesMap: lookup,
      getBaseKey: (k) => k
    })
    expect(md).toContain("❌ Missing Keys (1)")
    expect(md).toContain("`missing.k`")
    expect(md).toContain("`src/a.ts`")
  })

  it("renders the unused-placeholders section when present", () => {
    const md = renderMarkdownReport({
      defaultBasename: "en.json",
      results: baseResults({
        unusedPlaceholderKeys: [
          { key: "b.key", lang: "fr" },
          { key: "a.key", lang: "en" }
        ]
      }),
      keyToFilesMap: emptyLookup,
      getBaseKey: (k) => k
    })
    expect(md).toContain("Unused Placeholders (2)")
    expect(md).toContain("`a.key` [`EN`]")
    // sorted by key: a.key before b.key
    expect(md.indexOf("a.key")).toBeLessThan(md.indexOf("b.key"))
  })

  it("renders the hardcoded all-clear section when the check ran with zero findings", () => {
    const md = renderMarkdownReport({
      defaultBasename: "en.json",
      results: baseResults({ hardcodedStrings: [] }),
      keyToFilesMap: emptyLookup,
      getBaseKey: (k) => k
    })
    expect(md).toContain("✅ Hardcoded Strings")
    expect(md).toContain("No un-translated hardcoded strings detected")
  })

  it("renders alignment mismatches with sorted keys", () => {
    const md = renderMarkdownReport({
      defaultBasename: "en.json",
      results: baseResults({
        keysOnlyInLanguages: [{ from: "en", to: "fr", keys: ["z", "a", "m"] }]
      }),
      keyToFilesMap: emptyLookup,
      getBaseKey: (k) => k
    })
    expect(md).toContain("Keys in en but missing in fr (3)")
    // Sort order in output should be a, m, z
    const aPos = md.indexOf("`a`")
    const mPos = md.indexOf("`m`")
    const zPos = md.indexOf("`z`")
    expect(aPos).toBeLessThan(mPos)
    expect(mPos).toBeLessThan(zPos)
  })
})
