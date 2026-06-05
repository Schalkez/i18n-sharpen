import {
  describe,
  it,
  expect,
  afterEach,
  beforeEach,
  vi,
  type MockInstance
} from "vitest"

describe("utils: log glyphs", () => {
  let logSpy: MockInstance
  let errSpy: MockInstance

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
    errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it("uses emoji glyphs by default", async () => {
    vi.stubEnv("NO_EMOJI", "")
    vi.resetModules()
    const { log } = await import("@/utils")
    log.success("ok")
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("✅"))
  })

  it("falls back to plain-text glyphs when NO_EMOJI is set", async () => {
    vi.stubEnv("NO_EMOJI", "1")
    vi.resetModules()
    const { log } = await import("@/utils")
    log.success("ok")
    log.warn("careful")
    log.error("boom")
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[OK]"))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("[WARN]"))
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("[ERR]"))
  })

  it("treats NO_EMOJI=false as emoji-enabled", async () => {
    vi.stubEnv("NO_EMOJI", "false")
    vi.resetModules()
    const { log } = await import("@/utils")
    log.success("ok")
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("✅"))
  })

  it("info and header pass through to console.log", async () => {
    vi.resetModules()
    const { log } = await import("@/utils")
    log.info("plain")
    log.header("TITLE")
    expect(logSpy).toHaveBeenCalledWith("plain")
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("TITLE"))
  })
})
