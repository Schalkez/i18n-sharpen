import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, afterEach } from "vitest"
import {
  flattenObject,
  buildNestedObject,
  setNestedValue,
  getNestedValue,
  readLocaleFile,
  writeLocaleFile,
  findLocaleFile,
  loadAllLocales,
  loadNamespacedLocales,
  FORBIDDEN_KEY_SEGMENTS
} from "@/core/locale-io"

const tmp = (slug: string): string =>
  path.resolve(
    __dirname,
    `../../scratch/locale-io-${slug}-${Math.random().toString(36).slice(2, 9)}`
  )

describe("locale-io: prototype-pollution guards", () => {
  it("setNestedValue rejects __proto__ segments", () => {
    const o: Record<string, unknown> = {}
    setNestedValue(o, "__proto__.polluted", "x")
    expect(
      (Object.prototype as unknown as Record<string, unknown>).polluted
    ).toBeUndefined()
  })

  it("flattenObject skips forbidden segments at the top level", () => {
    const flat = flattenObject({
      __proto__: { evil: "yes" },
      good: "ok"
    })
    expect(Object.keys(flat)).toEqual(["good"])
  })

  it("exports a frozen-look set of forbidden segments", () => {
    expect(FORBIDDEN_KEY_SEGMENTS.has("__proto__")).toBe(true)
    expect(FORBIDDEN_KEY_SEGMENTS.has("prototype")).toBe(true)
    expect(FORBIDDEN_KEY_SEGMENTS.has("constructor")).toBe(true)
  })
})

describe("locale-io: nested helpers", () => {
  it("getNestedValue returns undefined for missing paths", () => {
    expect(getNestedValue({ a: { b: 1 } }, "a.b.c")).toBeUndefined()
  })
  it("buildNestedObject is the inverse of flattenObject for legal keys", () => {
    const nested = { a: { b: { c: "deep" } } }
    expect(buildNestedObject(flattenObject(nested))).toEqual(nested)
  })
  it("flattenObject preserves arrays and complex values", () => {
    const nested = {
      section: {
        title: "Terms",
        items: [
          { text: "Item 1", value: 1 },
          { text: "Item 2", value: 2 }
        ],
        tags: ["a", "b"]
      }
    }
    const flat = flattenObject(nested)
    expect(flat).toEqual({
      "section.title": "Terms",
      "section.items": [
        { text: "Item 1", value: 1 },
        { text: "Item 2", value: 2 }
      ],
      "section.tags": ["a", "b"]
    })
    expect(buildNestedObject(flat)).toEqual(nested)
  })
})

describe("locale-io: write/read roundtrip", () => {
  const dir = tmp("rw")
  afterEach(() => {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it("writes JSON with trailing newline and reads it back identically", () => {
    fs.mkdirSync(dir, { recursive: true })
    const f = path.join(dir, "en.json")
    writeLocaleFile(f, { a: { b: "c" } })
    const raw = fs.readFileSync(f, "utf8")
    expect(raw.endsWith("\n")).toBe(true)
    expect(readLocaleFile(f)).toEqual({ a: { b: "c" } })
  })

  it("readLocaleFile tolerates UTF-8 BOM", () => {
    fs.mkdirSync(dir, { recursive: true })
    const f = path.join(dir, "en.json")
    fs.writeFileSync(f, "﻿" + JSON.stringify({ k: "v" }), "utf8")
    expect(readLocaleFile(f)).toEqual({ k: "v" })
  })

  it("readLocaleFile returns {} for empty / whitespace-only files", () => {
    fs.mkdirSync(dir, { recursive: true })
    const f = path.join(dir, "en.json")
    fs.writeFileSync(f, "   \n  ", "utf8")
    expect(readLocaleFile(f)).toEqual({})
  })

  it("reads .cjs files correctly and evicts require cache", () => {
    fs.mkdirSync(dir, { recursive: true })
    const f1 = path.join(dir, "en.cjs")
    fs.writeFileSync(f1, "module.exports = { val: 1 };", "utf8")
    expect(readLocaleFile(f1)).toEqual({ val: 1 })

    // Verify cache eviction by overwriting the same file path and reading again
    fs.writeFileSync(f1, "module.exports = { val: 2 };", "utf8")
    expect(readLocaleFile(f1)).toEqual({ val: 2 })
  })

  it("throws clear parse error for syntax error in .cjs files", () => {
    fs.mkdirSync(dir, { recursive: true })
    const f = path.join(dir, "invalid.cjs")
    fs.writeFileSync(f, "module.exports = { val: ", "utf8")
    expect(() => readLocaleFile(f)).toThrow(
      /Failed to parse JS\/CJS locale file/
    )
  })

  it("falls back to jiti for ESM .js files and throws when jiti is missing", () => {
    const f = path.join(dir, "non-existent.js")
    expect(() => readLocaleFile(f)).toThrow(/requires the 'jiti' package/)
  })

  it("throws helpful error for .ts files when jiti is missing", () => {
    fs.mkdirSync(dir, { recursive: true })
    const f = path.join(dir, "en.ts")
    fs.writeFileSync(f, "export default { val: 1 };", "utf8")
    expect(() => readLocaleFile(f)).toThrow(/requires the 'jiti' package/)
  })
})

describe("locale-io: writeLocaleFile atomicity", () => {
  const dir = tmp("atomic")
  afterEach(() => {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it("writes via .tmp + rename (no .tmp left behind on success)", () => {
    fs.mkdirSync(dir, { recursive: true })
    const target = path.join(dir, "en.json")
    writeLocaleFile(target, { a: 1 })
    expect(fs.existsSync(target)).toBe(true)
    expect(fs.existsSync(target + ".tmp")).toBe(false)
  })

  it("cleans up the .tmp file when renameSync fails (target is a directory)", () => {
    fs.mkdirSync(dir, { recursive: true })
    const target = path.join(dir, "en.json")
    // Make target a non-empty directory so renameSync(file, dir) fails on
    // Windows with ENOTEMPTY/EPERM — exercises the cleanup branch.
    fs.mkdirSync(target)
    fs.writeFileSync(path.join(target, "blocker.txt"), "x")
    expect(() => {
      writeLocaleFile(target, { a: 1 })
    }).toThrow()
    expect(fs.existsSync(target + ".tmp")).toBe(false)
  })

  it("refuses to overwrite .ts/.tsx/.mjs/.cjs/.js locale files", () => {
    fs.mkdirSync(dir, { recursive: true })
    const original = "export default { a: 1 }\n"
    for (const ext of [".ts", ".tsx", ".mjs", ".cjs", ".js"]) {
      const target = path.join(dir, `en${ext}`)
      fs.writeFileSync(target, original, "utf8")
      expect(() => {
        writeLocaleFile(target, { a: 2 })
      }).toThrow(/Refusing to write JS\/TS locale file/)
      // Source content must be preserved unchanged.
      expect(fs.readFileSync(target, "utf8")).toBe(original)
      // No .tmp leftover.
      expect(fs.existsSync(target + ".tmp")).toBe(false)
    }
  })
})

describe("locale-io: findLocaleFile + loadAllLocales", () => {
  const dir = tmp("find")
  afterEach(() => {
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  })

  it("findLocaleFile prefers .json over .yaml when both exist", () => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "en.json"), "{}")
    fs.writeFileSync(path.join(dir, "en.yaml"), "")
    const found = findLocaleFile(dir, "en")
    expect(found && path.basename(found)).toBe("en.json")
  })

  it("loadNamespacedLocales merges per-namespace files with ns: prefix", () => {
    fs.mkdirSync(path.join(dir, "en"), { recursive: true })
    fs.writeFileSync(
      path.join(dir, "en", "common.json"),
      JSON.stringify({ greeting: "hi" })
    )
    fs.writeFileSync(
      path.join(dir, "en", "auth.json"),
      JSON.stringify({ login: { title: "Sign in" } })
    )
    const result = loadNamespacedLocales(dir, ["en"])
    expect(result.localesFlat.en).toEqual({
      "common:greeting": "hi",
      "auth:login.title": "Sign in"
    })
    expect(result.localeNamespaces.en.common).toContain("common.json")
    expect(result.localeNamespaces.en.auth).toContain("auth.json")
    expect(result.localeKeySets.en.has("common:greeting")).toBe(true)
  })

  it("loadNamespacedLocales calls onMissing for languages without dirs", () => {
    const missing: string[] = []
    const result = loadNamespacedLocales(dir, ["fr"], (l) => missing.push(l))
    expect(missing).toEqual(["fr"])
    expect(result.localesFlat.fr).toEqual({})
  })

  it("loadAllLocales calls onMissing for languages without files", () => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, "en.json"), JSON.stringify({ k: "v" }))
    const missing: string[] = []
    const result = loadAllLocales(dir, ["en", "fr"], (lang) => {
      missing.push(lang)
    })
    expect(missing).toEqual(["fr"])
    expect(result.localesFlat.en).toEqual({ k: "v" })
    expect(result.localesFlat.fr).toEqual({})
    expect(result.localeKeySets.en.has("k")).toBe(true)
  })
})
