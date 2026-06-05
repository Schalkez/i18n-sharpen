import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockInstance
} from "vitest"
import { warnLegacyDefaultNamespace } from "@/commands/_shared/migration-warnings"
import type { I18nSharpenConfig } from "@/types"

const cfg = (extra: Partial<I18nSharpenConfig> = {}): I18nSharpenConfig => ({
  scanDirs: ["src"],
  localesDir: "locales",
  defaultLanguage: "en",
  supportedLanguages: ["en"],
  localesLayout: "namespaced",
  ...extra
})

// log.warn routes to console.log
let warn: MockInstance

beforeEach(() => {
  warn = vi.spyOn(console, "log").mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("warnLegacyDefaultNamespace", () => {
  it("warns when a legacy default.json exists without a common sibling", () => {
    warnLegacyDefaultNamespace(cfg(), {
      en: { default: "/x/en/default.json" }
    })
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/legacy/i))
  })

  it("does nothing for non-namespaced layout", () => {
    warnLegacyDefaultNamespace(cfg({ localesLayout: "flat" }), {
      en: { default: "/x/en/default.json" }
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it("does nothing when defaultNamespace is explicitly configured", () => {
    warnLegacyDefaultNamespace(cfg({ defaultNamespace: "default" }), {
      en: { default: "/x/en/default.json" }
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it("does not warn when a common sibling already exists", () => {
    warnLegacyDefaultNamespace(cfg(), {
      en: { default: "/x/en/default.json", common: "/x/en/common.json" }
    })
    expect(warn).not.toHaveBeenCalled()
  })

  it("skips JS/TS default files (only json/yaml trigger the migration)", () => {
    warnLegacyDefaultNamespace(cfg(), { en: { default: "/x/en/default.ts" } })
    expect(warn).not.toHaveBeenCalled()
  })

  it("skips a default path with no file extension", () => {
    warnLegacyDefaultNamespace(cfg(), { en: { default: "/x/en/default" } })
    expect(warn).not.toHaveBeenCalled()
  })

  it("ignores languages that have no default namespace file", () => {
    warnLegacyDefaultNamespace(cfg(), { en: { common: "/x/en/common.json" } })
    expect(warn).not.toHaveBeenCalled()
  })
})
