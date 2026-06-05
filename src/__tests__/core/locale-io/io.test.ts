import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, afterEach, vi } from "vitest"
import {
  readLocaleFile,
  writeLocaleFile,
  writeLocaleFilesAtomic,
  findLocaleFile,
  loadAllLocales,
  loadNamespacedLocales
} from "@/core/locale-io"

const created: string[] = []

function makeDir(): string {
  const dir = path.resolve(
    __dirname,
    `../../../scratch/io-${Math.random().toString(36).slice(2, 11)}`
  )
  fs.mkdirSync(dir, { recursive: true })
  created.push(dir)
  return dir
}

function write(dir: string, name: string, content: string): string {
  const p = path.join(dir, name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, content, "utf8")
  return p
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const dir of created.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("io: readLocaleFile formats", () => {
  it("parses JSON and strips a UTF-8 BOM", () => {
    const dir = makeDir()
    const p = write(dir, "en.json", "﻿" + JSON.stringify({ a: "A" }))
    expect(readLocaleFile(p)).toEqual({ a: "A" })
  })

  it("returns {} for an empty / whitespace-only file", () => {
    const dir = makeDir()
    expect(readLocaleFile(write(dir, "en.json", "   \n  "))).toEqual({})
  })

  it("returns {} when JSON parses to a non-object (array)", () => {
    const dir = makeDir()
    expect(readLocaleFile(write(dir, "en.json", "[1,2,3]"))).toEqual({})
  })

  it("parses YAML locale files", () => {
    const dir = makeDir()
    const p = write(dir, "en.yaml", "greeting: Hello\nnested:\n  key: V")
    expect(readLocaleFile(p)).toEqual({
      greeting: "Hello",
      nested: { key: "V" }
    })
  })

  it("returns {} when YAML is a scalar / array (non-object)", () => {
    const dir = makeDir()
    expect(readLocaleFile(write(dir, "en.yaml", "- a\n- b"))).toEqual({})
  })

  it("loads a .cjs module via require", () => {
    const dir = makeDir()
    const p = write(dir, "en.cjs", "module.exports = { hello: 'world' }")
    expect(readLocaleFile(p)).toEqual({ hello: "world" })
  })

  it("throws a helpful error for an unparseable .cjs module", () => {
    const dir = makeDir()
    const p = write(dir, "en.cjs", "module.exports = ( syntax error")
    expect(() => readLocaleFile(p)).toThrow(/Failed to parse JS\/CJS/)
  })
})

describe("io: write guards", () => {
  it("refuses to overwrite a .ts locale file", () => {
    const dir = makeDir()
    expect(() => {
      writeLocaleFile(path.join(dir, "en.ts"), { a: "A" })
    }).toThrow(/Refusing to write JS\/TS/)
  })

  it("writeLocaleFilesAtomic refuses JS/TS targets and commits JSON atomically", () => {
    const dir = makeDir()
    expect(() => {
      writeLocaleFilesAtomic([
        { filePath: path.join(dir, "x.mjs"), nestedJson: {} }
      ])
    }).toThrow(/Refusing to write JS\/TS/)

    const jsonPath = path.join(dir, "en.json")
    writeLocaleFilesAtomic([{ filePath: jsonPath, nestedJson: { a: "A" } }])
    expect(JSON.parse(fs.readFileSync(jsonPath, "utf8"))).toEqual({ a: "A" })
    // No leftover .tmp files.
    expect(fs.existsSync(`${jsonPath}.tmp`)).toBe(false)
  })

  it("writeLocaleFilesAtomic is a no-op for an empty plan list", () => {
    expect(() => {
      writeLocaleFilesAtomic([])
    }).not.toThrow()
  })

  it("writes YAML when the target extension is .yaml", () => {
    const dir = makeDir()
    const p = path.join(dir, "en.yaml")
    writeLocaleFile(p, { greeting: "Hi" })
    expect(fs.readFileSync(p, "utf8")).toContain("greeting: Hi")
  })
})

describe("io: findLocaleFile", () => {
  it("warns and picks the first match when duplicates exist", () => {
    const dir = makeDir()
    write(dir, "en.json", "{}")
    write(dir, "en.yaml", "{}")
    const warn = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const found = findLocaleFile(dir, "en")
    expect(found).not.toBeNull()
    expect(path.basename(found ?? "")).toBe("en.json")
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/Multiple locale files found/)
    )
  })

  it("returns null when no locale file exists", () => {
    expect(findLocaleFile(makeDir(), "zz")).toBeNull()
  })
})

describe("io: loaders with missing languages (default onMissing no-op)", () => {
  it("loadAllLocales tolerates a missing language without a callback", () => {
    const dir = makeDir()
    write(dir, "en.json", JSON.stringify({ a: "A" }))
    const { localesFlat, localePaths } = loadAllLocales(dir, ["en", "fr"])
    expect(localesFlat.en).toEqual({ a: "A" })
    expect(localesFlat.fr).toEqual({})
    expect(localePaths.fr).toBeNull()
  })

  it("loadNamespacedLocales merges namespace files and tolerates a missing lang dir", () => {
    const dir = makeDir()
    write(dir, "en/common.json", JSON.stringify({ greeting: "Hi" }))
    write(dir, "en/auth.json", JSON.stringify({ login: { title: "Login" } }))
    const { localesFlat, localeNamespaces } = loadNamespacedLocales(dir, [
      "en",
      "fr"
    ])
    expect(localesFlat.en).toEqual({
      "common:greeting": "Hi",
      "auth:login.title": "Login"
    })
    expect(Object.keys(localeNamespaces.en).sort()).toEqual(["auth", "common"])
    expect(localesFlat.fr).toEqual({})
  })
})
