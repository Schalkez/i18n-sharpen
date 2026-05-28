import { describe, it, expect } from "vitest"
import { I18nSharpenError, type I18nError } from "./errors"

describe("I18nSharpenError", () => {
  it("preserves the structured error union as a public property", () => {
    const err = new I18nSharpenError({
      kind: "config",
      message: "bad config",
      path: "/x.json"
    })
    expect(err.error.kind).toBe("config")
    if (err.error.kind === "config") {
      expect(err.error.path).toBe("/x.json")
    }
  })

  it("uses the structured message when no explicit message is passed", () => {
    const err = new I18nSharpenError({
      kind: "parse",
      message: "parse failed",
      path: "/y.json"
    })
    expect(err.message).toBe("parse failed")
  })

  it("lets the caller override the rendered message", () => {
    const err = new I18nSharpenError(
      { kind: "validation", message: "internal" },
      "user-facing"
    )
    expect(err.message).toBe("user-facing")
    expect(err.error.message).toBe("internal")
  })

  it("instances are Error subclasses (instanceof works across catches)", () => {
    const err = new I18nSharpenError({
      kind: "filesystem",
      message: "x",
      path: "/"
    })
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(I18nSharpenError)
    expect(err.name).toBe("I18nSharpenError")
  })

  it("error.kind narrows to the discriminated union variants", () => {
    const cases: I18nError[] = [
      { kind: "config", message: "c" },
      { kind: "filesystem", message: "f", path: "/" },
      { kind: "parse", message: "p", path: "/" },
      { kind: "validation", message: "v" }
    ]
    for (const c of cases) {
      const e = new I18nSharpenError(c)
      expect(["config", "filesystem", "parse", "validation"]).toContain(
        e.error.kind
      )
    }
  })
})
