import { describe, it, expect } from "vitest"
import { isStaticStringLiteral } from "@/core/scanner/text"

describe("text: isStaticStringLiteral", () => {
  it("accepts a bare single/double/backtick literal", () => {
    expect(isStaticStringLiteral(`"key"`)).toBe(true)
    expect(isStaticStringLiteral(`'key'`)).toBe(true)
    expect(isStaticStringLiteral("`key`")).toBe(true)
  })

  it("accepts a literal followed by an options object", () => {
    expect(isStaticStringLiteral(`"key", { count: 2 }`)).toBe(true)
  })

  it("rejects template literals with interpolation", () => {
    expect(isStaticStringLiteral("`error.${code}`")).toBe(false)
  })

  it("rejects concatenation and trailing tokens", () => {
    expect(isStaticStringLiteral(`"a" + b`)).toBe(false)
  })

  it("rejects non-string args and too-short input", () => {
    expect(isStaticStringLiteral("getKey()")).toBe(false)
    expect(isStaticStringLiteral("")).toBe(false)
    expect(isStaticStringLiteral(`"`)).toBe(false)
  })

  it("handles escaped quotes inside the literal", () => {
    expect(isStaticStringLiteral(`"a\\"b"`)).toBe(true)
  })

  it("rejects an unterminated literal", () => {
    expect(isStaticStringLiteral(`"unterminated`)).toBe(false)
  })
})
