import * as fs from "node:fs"
import * as path from "node:path"
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi } from "vitest"
import { I18nSharpenError } from "@/core/errors"
import { computeLineOffsets, offsetToLine } from "@/core/scanner/lines"
import * as resolveModule from "@/core/scanner/parsers/resolve"
import { parseVueFile } from "@/core/scanner/parsers/vue"

describe("Vue Parser", () => {
  const cwd = process.cwd()
  const setupPath = path.join(__dirname, "fixtures", "vue-setup.vue")
  const legacyPath = path.join(__dirname, "fixtures", "vue-legacy.vue")
  const setupSrc = fs.readFileSync(setupPath, "utf8")
  const legacySrc = fs.readFileSync(legacyPath, "utf8")

  it("FW-01: extracts identical keys from <script setup> and legacy <script>", async () => {
    const { result: setupResult } = await parseVueFile(
      setupSrc,
      setupPath,
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )
    const { result: legacyResult } = await parseVueFile(
      legacySrc,
      legacyPath,
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )

    const setupKeys = setupResult.usedKeys.map((k) => k.key).sort()
    const legacyKeys = legacyResult.usedKeys.map((k) => k.key).sort()

    expect(setupKeys).toEqual(["hero.title", "nav.home"])
    expect(legacyKeys).toEqual(["hero.title", "nav.home"])
  })

  it("FW-04: offset for key in embedded <script setup> maps to correct line in original file", async () => {
    const { result } = await parseVueFile(
      setupSrc,
      setupPath,
      ["t", "i18n.t"],
      ["i18nKey"],
      cwd
    )
    const heroKey = result.usedKeys.find((k) => k.key === "hero.title")!
    expect(heroKey).toBeDefined()
    const offsets = computeLineOffsets(setupSrc)
    expect(offsetToLine(offsets, heroKey.offset)).toBe(3)
  })

  it("FW-05: missing compiler throws fatal I18nSharpenError", async () => {
    const spy = vi
      .spyOn(resolveModule, "loadWorkspaceDep")
      .mockImplementationOnce(() => {
        throw new I18nSharpenError({
          kind: "missing-dependency",
          packageName: "@vue/compiler-sfc",
          installCommand: "npm install -D @vue/compiler-sfc",
          message: "Cannot find module '@vue/compiler-sfc'"
        })
      })
    try {
      await expect(
        parseVueFile(setupSrc, setupPath, ["t", "i18n.t"], ["i18nKey"], cwd)
      ).rejects.toThrowError(I18nSharpenError)
    } finally {
      spy.mockRestore()
    }
  })

  it("TEST-04: single-file syntax error yields FileParseError without throwing", async () => {
    const brokenSrc = `<script setup lang="ts">\nconst x = {\n</script>`
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
      const { result, errors } = await parseVueFile(
        brokenSrc,
        "broken.vue",
        ["t", "i18n.t"],
        ["i18nKey"],
        cwd
      )
      expect(result.usedKeys).toHaveLength(0)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0].file).toBe("broken.vue")
    } finally {
      spy.mockRestore()
    }
  })
})
