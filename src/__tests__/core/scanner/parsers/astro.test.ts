import * as fs from "node:fs"
import * as path from "node:path"
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi } from "vitest"
import { I18nSharpenError } from "@/core/errors"
import { computeLineOffsets, offsetToLine } from "@/core/scanner/lines"
import { parseAstroFile } from "@/core/scanner/parsers/astro"
import * as resolveModule from "@/core/scanner/parsers/resolve"

describe("Astro Parser", () => {
  const cwd = process.cwd()
  const pagePath = path.join(__dirname, "fixtures", "page.astro")
  const pageSrc = fs.readFileSync(pagePath, "utf8")

  it("FW-03: 10 concurrent parses return identical results (no WASM race)", async () => {
    const promises = Array.from({ length: 10 }, () =>
      parseAstroFile(pageSrc, pagePath, ["t", "i18n.t"], ["i18nKey"], cwd)
    )
    const results = await Promise.all(promises)
    const baseline = results[0].result.usedKeys.map((k) => k.key).sort()
    expect(baseline).toEqual(["nav.home", "page.title"])
    for (const { result } of results) {
      expect(result.usedKeys.map((k) => k.key).sort()).toEqual(baseline)
    }
  })

  it("FW-04: frontmatter key offset maps to correct line", async () => {
    const { result } = await parseAstroFile(
      pageSrc,
      pagePath,
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )
    const pageKey = result.usedKeys.find((k) => k.key === "page.title")!
    expect(pageKey).toBeDefined()
    const offsets = computeLineOffsets(pageSrc)
    expect(offsetToLine(offsets, pageKey.offset)).toBe(2)
  })

  it("FW-05: missing compiler throws fatal I18nSharpenError", async () => {
    const spy = vi
      .spyOn(resolveModule, "loadWorkspaceDep")
      .mockImplementationOnce(() => {
        throw new I18nSharpenError({
          kind: "missing-dependency",
          packageName: "@astrojs/compiler",
          installCommand: "npm install -D @astrojs/compiler",
          message: "Cannot find module '@astrojs/compiler'"
        })
      })
    try {
      await expect(
        parseAstroFile(pageSrc, pagePath, ["t", "i18n.t"], ["i18nKey"], cwd)
      ).rejects.toThrowError(I18nSharpenError)
    } finally {
      spy.mockRestore()
    }
  })

  it("TEST-04: broken frontmatter yields FileParseError without throwing", async () => {
    const brokenSrc = `---\nconst x = {\n---\n<h1>Astro</h1>`
    const spy = vi
      .spyOn(resolveModule, "loadWorkspaceDep")
      .mockImplementationOnce(() => {
        return {
          parse: () => Promise.reject(new Error("Simulated parse error"))
        }
      })
    try {
      const { result, errors } = await parseAstroFile(
        brokenSrc,
        "broken.astro",
        ["t", "i18n.t"],
        ["i18nKey"],
        cwd
      )
      expect(result.usedKeys).toHaveLength(0)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].file).toBe("broken.astro")
    } finally {
      spy.mockRestore()
    }
  })
})
