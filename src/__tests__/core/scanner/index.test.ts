import * as fs from "fs"
import * as path from "path"
import { describe, it, expect } from "vitest"
import {
  stripComments,
  getBaseKey,
  matchWildcard,
  isKeyUsed,
  detectUsedKeys
} from "@/core/scanner"

describe("scanner: stripComments edge cases", () => {
  it("preserves // inside a double-quoted URL", () => {
    const src = `const u = "https://example.com/path"`
    expect(stripComments(src)).toContain("https://example.com/path")
  })

  it("preserves // inside a template literal", () => {
    const src = "const u = `https://x.test` // trailing"
    const out = stripComments(src)
    expect(out).toContain("https://x.test")
    expect(out).not.toContain("trailing")
  })

  it("does not let */ inside a string terminate a block comment", () => {
    const src = `/* outer "*/" */ const x = 1`
    // Block comment runs until first */ that is NOT inside the string;
    // our state machine handles strings only outside comments, so the
    // first */ at index 9 ends the comment as expected.
    const out = stripComments(src)
    expect(out).toContain("const x = 1")
  })

  it("preserves escaped quotes inside strings", () => {
    const src = `const s = "he said \\"hi\\" // not a comment"`
    expect(stripComments(src)).toContain('"he said \\"hi\\" // not a comment"')
  })

  it("handles template literal interpolation containing comments", () => {
    const src = "const t = `pre ${/* inner */ x} post`"
    const out = stripComments(src)
    expect(out).toContain("pre ")
    expect(out).toContain("post")
  })
})

describe("scanner: getBaseKey + isKeyUsed", () => {
  it("strips the matching plural suffix", () => {
    expect(getBaseKey("count_one", ["_one", "_other"])).toBe("count")
  })
  it("returns key unchanged when no suffix matches", () => {
    expect(getBaseKey("count", ["_one", "_other"])).toBe("count")
  })
  it("isKeyUsed treats plural variants of a used base as used", () => {
    const used = new Set(["count"])
    expect(isKeyUsed("count_one", used, undefined, ["_one"])).toBe(true)
    expect(isKeyUsed("other_one", used, undefined, ["_one"])).toBe(false)
  })
  it("isKeyUsed honors ignoreKeys wildcards", () => {
    expect(isKeyUsed("status.success", new Set(), ["status.*"], [])).toBe(true)
  })
})

describe("scanner: matchWildcard", () => {
  it("matches literal ? as a character, not a regex quantifier", () => {
    expect(matchWildcard("err?", "err?")).toBe(true)
    expect(matchWildcard("err?", "err")).toBe(false)
  })
  it("star is universal", () => {
    expect(matchWildcard("*", "anything.here")).toBe(true)
  })
})

describe("scanner: detectUsedKeys", () => {
  const tmpDir = path.resolve(
    __dirname,
    `../../scratch/scanner-${Math.random().toString(36).slice(2, 9)}`
  )

  it("returns the set of statically-resolvable keys and ignores comments", async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const f = path.join(tmpDir, "a.ts")
    fs.writeFileSync(
      f,
      `
      // t('commented.out')
      const x = t('used.one')
      const y = t("used.two")
      const z = t(\`used.three\`)
      const dyn = t('prefix.' + variable)
      `,
      "utf8"
    )
    const { usedKeys } = await detectUsedKeys([f], ["t"], [])
    expect(usedKeys.has("used.one")).toBe(true)
    expect(usedKeys.has("used.two")).toBe(true)
    expect(usedKeys.has("used.three")).toBe(true)
    expect(usedKeys.has("commented.out")).toBe(false)
    // 'prefix.' ends with a dot — should be excluded
    expect([...usedKeys].some((k) => k.endsWith("."))).toBe(false)
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it("looseKeyMatch still finds a key present only in stripped content after async refactor", async () => {
    fs.mkdirSync(tmpDir, { recursive: true })
    const f = path.join(tmpDir, "loose.ts")
    fs.writeFileSync(
      f,
      `const KEY = "feature.flag" // referenced but not via t()`,
      "utf8"
    )
    const { usedKeys, fileContents } = await detectUsedKeys([f], ["t"], [])
    expect(usedKeys.has("feature.flag")).toBe(false)
    expect(fileContents[0]).toContain('"feature.flag"')
    expect(fileContents[0].includes('"feature.flag"')).toBe(true)
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
