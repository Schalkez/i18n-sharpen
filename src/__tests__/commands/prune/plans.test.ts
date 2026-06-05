import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, afterEach } from "vitest"
import {
  collectFlatCandidates,
  collectNamespacedCandidates
} from "@/commands/prune/plans"
import { I18nSharpenError } from "@/core/errors"
import type { I18nSharpenConfig } from "@/types"

const created: string[] = []

function makeLocales(files: Record<string, string>): string {
  const dir = path.resolve(
    __dirname,
    `../../../scratch/plans-${Math.random().toString(36).slice(2, 11)}`
  )
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, "utf8")
  }
  created.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

const config = (extra: Partial<I18nSharpenConfig> = {}): I18nSharpenConfig => ({
  scanDirs: ["src"],
  localesDir: "locales",
  defaultLanguage: "en",
  supportedLanguages: ["en"],
  fileExtensions: [".ts"],
  matchFunctions: ["t"],
  ...extra
})

describe("plans: collectFlatCandidates", () => {
  it("returns the sorted set of unused keys", () => {
    const dir = makeLocales({
      "en.json": JSON.stringify({ used: "U", dead: "D", "z.key": "Z" })
    })
    const candidates = collectFlatCandidates(
      config(),
      dir,
      new Set(["used"]),
      []
    )
    expect(candidates).toEqual(["dead", "z.key"])
  })

  it("honors looseKeyMatch — keys referenced as raw string literals are kept", () => {
    const dir = makeLocales({
      "en.json": JSON.stringify({ used: "U", dead: "D", "loose.key": "L" })
    })
    const candidates = collectFlatCandidates(
      config({ looseKeyMatch: true }),
      dir,
      new Set(["used"]),
      [`const ref = "loose.key"`]
    )
    expect(candidates).toEqual(["dead"])
  })

  it("throws a parse error for a malformed locale file", () => {
    const dir = makeLocales({ "en.json": "{ broken " })
    try {
      collectFlatCandidates(config(), dir, new Set(), [])
      expect.unreachable("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(I18nSharpenError)
      expect((e as I18nSharpenError).error.kind).toBe("parse")
    }
  })

  it("returns an empty array when every key is used", () => {
    const dir = makeLocales({ "en.json": JSON.stringify({ a: "A" }) })
    expect(collectFlatCandidates(config(), dir, new Set(["a"]), [])).toEqual([])
  })
})

describe("plans: collectNamespacedCandidates", () => {
  const nsConfig = (extra: Partial<I18nSharpenConfig> = {}) =>
    config({
      localesLayout: "namespaced",
      defaultNamespace: "common",
      ...extra
    })

  it("returns unused namespaced keys in ns:key form", () => {
    const dir = makeLocales({
      "en/common.json": JSON.stringify({ used: "U", dead: "D" })
    })
    const candidates = collectNamespacedCandidates(
      nsConfig(),
      dir,
      new Set(["common:used"]),
      []
    )
    expect(candidates).toEqual(["common:dead"])
  })

  it("honors looseKeyMatch for namespaced keys", () => {
    const dir = makeLocales({
      "en/common.json": JSON.stringify({ used: "U", dead: "D" })
    })
    const candidates = collectNamespacedCandidates(
      nsConfig({ looseKeyMatch: true }),
      dir,
      new Set(["common:used"]),
      [`logger.warn("common:dead")`]
    )
    expect(candidates).toEqual([])
  })
})
