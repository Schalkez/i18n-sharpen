import * as fs from "node:fs"
import * as path from "node:path"
import { describe, it, expect } from "vitest"
import { parseFile, parseTypeScriptFile } from "@/core/scanner/parsers"

describe("Dispatcher (parseFile)", () => {
  const cwd = process.cwd()

  it("PARSE-06: .ts parity - direct and dispatched yield same keys", async () => {
    const src = "const x = t('a.b')"
    const direct = parseTypeScriptFile(
      src,
      "x.ts",
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )
    const { result } = await parseFile(
      src,
      "x.ts",
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )
    expect(result.usedKeys.map((k) => k.key)).toEqual(
      direct.result.usedKeys.map((k) => k.key)
    )
    expect(result.usedKeys.some((k) => k.key === "a.b")).toBe(true)
  })

  it("PARSE-06: unknown extension yields empty result without throwing", async () => {
    const { result, errors } = await parseFile(
      "whatever",
      "notes.txt",
      ["t"],
      [],
      cwd
    )
    expect(result).toEqual({
      usedKeys: [],
      dynamicCalls: [],
      hardcodedCandidates: []
    })
    expect(errors).toEqual([])
  })

  it("PARSE-06: routes .vue correctly", async () => {
    const vueSrc = fs.readFileSync(
      path.join(__dirname, "fixtures", "vue-setup.vue"),
      "utf8"
    )
    const { result } = await parseFile(
      vueSrc,
      "vue-setup.vue",
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )
    expect(result.usedKeys.some((k) => k.key === "hero.title")).toBe(true)
  })

  it("PARSE-06: routes .svelte correctly", async () => {
    const svelteSrc = fs.readFileSync(
      path.join(__dirname, "fixtures", "component.svelte"),
      "utf8"
    )
    const { result } = await parseFile(
      svelteSrc,
      "component.svelte",
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )
    expect(result.usedKeys.some((k) => k.key === "page.title")).toBe(true)
  })

  it("PARSE-06: routes .astro correctly", async () => {
    const astroSrc = fs.readFileSync(
      path.join(__dirname, "fixtures", "page.astro"),
      "utf8"
    )
    const { result } = await parseFile(
      astroSrc,
      "page.astro",
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )
    expect(result.usedKeys.some((k) => k.key === "page.title")).toBe(true)
  })
})
