import { describe, it, expect } from "vitest"
import { fatalExitCode } from "@/cli"
import { I18nSharpenError } from "@/core/errors"

describe("fatalExitCode (ERR-03 — ESLint-style exit codes)", () => {
  it("returns 2 for a missing-dependency error (tool-fatal)", () => {
    const err = new I18nSharpenError({
      kind: "missing-dependency",
      packageName: "typescript",
      installCommand: "pnpm add -D typescript",
      message: "missing"
    })
    expect(fatalExitCode(err)).toBe(2)
  })

  it("returns 1 for a config error", () => {
    const err = new I18nSharpenError({ kind: "config", message: "bad config" })
    expect(fatalExitCode(err)).toBe(1)
  })

  it("returns 1 for a validation error", () => {
    const err = new I18nSharpenError({ kind: "validation", message: "v" })
    expect(fatalExitCode(err)).toBe(1)
  })

  it("returns 1 for a parse error (collected parse kind, not a missing dep)", () => {
    const err = new I18nSharpenError({
      kind: "parse",
      message: "p",
      path: "/x"
    })
    expect(fatalExitCode(err)).toBe(1)
  })

  it("returns 1 for a non-I18nSharpenError (plain Error)", () => {
    expect(fatalExitCode(new Error("boom"))).toBe(1)
  })

  it("returns 1 for a thrown non-Error value", () => {
    expect(fatalExitCode("a string")).toBe(1)
  })
})
