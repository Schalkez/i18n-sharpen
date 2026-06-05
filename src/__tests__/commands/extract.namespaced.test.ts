import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { extract } from "@/commands/extract"
import { readLocaleFile, flattenObject } from "@/core/locale-io"
import type { I18nSharpenConfig } from "@/types"

let tempDir: string

function project(files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(tempDir, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, "utf8")
  }
}

const nsConfig = (
  extra: Partial<I18nSharpenConfig> = {}
): I18nSharpenConfig => ({
  scanDirs: ["src"],
  localesDir: "locales",
  defaultLanguage: "en",
  supportedLanguages: ["en"],
  fileExtensions: [".ts"],
  matchFunctions: ["t"],
  localesLayout: "namespaced",
  defaultNamespace: "common",
  ...extra
})

beforeEach(() => {
  tempDir = path.resolve(
    __dirname,
    `../../scratch/extract-ns-${Math.random().toString(36).slice(2, 11)}`
  )
  fs.mkdirSync(tempDir, { recursive: true })
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(tempDir, { recursive: true, force: true })
})

describe("extract: namespaced layout", () => {
  it("routes colon-prefixed keys to their namespace file and default keys to common", async () => {
    project({
      "src/index.ts": `t("home:title"); t("greeting")`,
      "locales/en/common.json": JSON.stringify({ greeting: "Hi" })
    })

    await extract(nsConfig(), tempDir)

    const home = flattenObject(
      readLocaleFile(path.join(tempDir, "locales/en/home.json"))
    )
    expect(home).toEqual({ title: "title" })

    const common = flattenObject(
      readLocaleFile(path.join(tempDir, "locales/en/common.json"))
    )
    // existing key preserved, no new key added (greeting already present)
    expect(common).toEqual({ greeting: "Hi" })
  })

  it("does nothing and reports all-present when every namespaced key exists", async () => {
    project({
      "src/index.ts": `t("home:title"); t("greeting")`,
      "locales/en/common.json": JSON.stringify({ greeting: "Hi" }),
      "locales/en/home.json": JSON.stringify({ title: "Title" })
    })

    const before = fs.readFileSync(
      path.join(tempDir, "locales/en/home.json"),
      "utf8"
    )
    await extract(nsConfig(), tempDir)
    const after = fs.readFileSync(
      path.join(tempDir, "locales/en/home.json"),
      "utf8"
    )
    // Untouched — nothing to extract.
    expect(after).toBe(before)
  })
})
