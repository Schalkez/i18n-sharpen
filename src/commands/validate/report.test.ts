import { describe, it, expect } from "vitest"
import type { ValidationResults } from "@/types"
import { renderMarkdownReport, type KeyToFilesLookup } from "./report"

const emptyLookup: KeyToFilesLookup = {
  has: () => false,
  get: () => undefined
}

function baseResults(
  overrides: Partial<ValidationResults> = {}
): ValidationResults {
  return {
    missingKeys: [],
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
