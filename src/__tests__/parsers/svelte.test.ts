import * as fs from "node:fs"
import * as path from "node:path"
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi } from "vitest"
import { I18nSharpenError } from "@/core/errors"
import { computeLineOffsets, offsetToLine } from "@/core/scanner/lines"
import * as resolveModule from "@/core/scanner/parsers/resolve"
import * as svelteParser from "@/core/scanner/parsers/svelte"

describe("Svelte Parser", () => {
  const cwd = process.cwd()
  const compPath = path.join(__dirname, "fixtures", "component.svelte")
  const compSrc = fs.readFileSync(compPath, "utf8")

  it("FW-02: extracts keys from module script, instance script, and template", async () => {
    const { result } = await svelteParser.parseSvelteFile(
      compSrc,
      compPath,
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )
    const keys = result.usedKeys.map((k) => k.key).sort()
    expect(keys).toEqual(["mod.init", "nav.home", "page.title"])
  })

  it("FW-04: offset for key in embedded instance <script> maps to correct line", async () => {
    const { result } = await svelteParser.parseSvelteFile(
      compSrc,
      compPath,
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )
    const pageKey = result.usedKeys.find((k) => k.key === "page.title")!
    expect(pageKey).toBeDefined()
    const offsets = computeLineOffsets(compSrc)
    expect(offsetToLine(offsets, pageKey.offset)).toBe(5)
  })

  it("FW-02: v4 legacy mode (ast.html) extracts the same keys", async () => {
    const spy = vi.spyOn(svelteParser, "readSvelteMajor").mockReturnValue(4)
    try {
      const { result } = await svelteParser.parseSvelteFile(
        compSrc,
        compPath,
        ["t", "i18n.t"],
        ["i18nKey"],
        cwd
      )
      const keys = result.usedKeys.map((k) => k.key).sort()
      expect(keys).toEqual(["mod.init", "nav.home", "page.title"])
    } finally {
      spy.mockRestore()
    }
  })

  it("FW-05: missing compiler throws fatal I18nSharpenError", async () => {
    const spy = vi
      .spyOn(resolveModule, "loadWorkspaceDep")
      .mockImplementationOnce(() => {
        throw new I18nSharpenError({
          kind: "missing-dependency",
          packageName: "svelte",
          installCommand: "npm install -D svelte",
          message: "Cannot find module 'svelte/compiler'"
        })
      })
    try {
      await expect(
        svelteParser.parseSvelteFile(
          compSrc,
          compPath,
          ["t", "i18n.t"],
          ["i18nKey"],
          cwd
        )
      ).rejects.toThrowError(I18nSharpenError)
    } finally {
      spy.mockRestore()
    }
  })

  it("TEST-04: single-file syntax error yields FileParseError without throwing", async () => {
    const brokenSrc = `<script>const x = {</script>`
    const spy = vi
      .spyOn(resolveModule, "loadWorkspaceDep")
      .mockImplementationOnce(() => {
        return {
          parse: () => {
            throw new Error("Simulated parse error")
          }
        }
      })
    try {
      const { result, errors } = await svelteParser.parseSvelteFile(
        brokenSrc,
        "broken.svelte",
        ["t", "i18n.t"],
        ["i18nKey"],
        cwd
      )
      expect(result.usedKeys).toHaveLength(0)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].file).toBe("broken.svelte")
    } finally {
      spy.mockRestore()
    }
  })
})
