import { describe, it, expect } from "vitest"
import { isHardcodedIgnored } from "@/core/scanner/text"

describe("isHardcodedIgnored", () => {
  it("ignores punctuation-only strings", () => {
    expect(isHardcodedIgnored("::")).toBe(true)
    expect(isHardcodedIgnored("---")).toBe(true)
    expect(isHardcodedIgnored("&bull;")).toBe(true)
    expect(isHardcodedIgnored("|")).toBe(true)
    expect(isHardcodedIgnored("!")).toBe(true)
  })

  it("ignores numbers-only strings and numeric/percentage values", () => {
    expect(isHardcodedIgnored("123")).toBe(true)
    expect(isHardcodedIgnored("45.6%")).toBe(true)
    expect(isHardcodedIgnored("1,000")).toBe(true)
    expect(isHardcodedIgnored("-99")).toBe(true)
  })

  it("ignores HTML entities", () => {
    expect(isHardcodedIgnored("&nbsp;")).toBe(true)
    expect(isHardcodedIgnored("&times;")).toBe(true)
    expect(isHardcodedIgnored("&#39;")).toBe(true)
    expect(isHardcodedIgnored("&#x20;")).toBe(true)
    expect(isHardcodedIgnored("&amp;")).toBe(true)
    expect(isHardcodedIgnored("Normal text with &nbsp;")).toBe(false)
  })

  it("does NOT ignore acronyms or uppercase UI strings by default", () => {
    expect(isHardcodedIgnored("OK")).toBe(false)
    expect(isHardcodedIgnored("SAVE")).toBe(false)
    expect(isHardcodedIgnored("HTML")).toBe(false)
    expect(isHardcodedIgnored("API")).toBe(false)
  })

  it("ignores custom string literals if configured", () => {
    const customIgnores = ["HTML", "API", "^[0-9]+\\.[0-9]+\\.[0-9]+$"]
    expect(isHardcodedIgnored("HTML", customIgnores)).toBe(true)
    expect(isHardcodedIgnored("API", customIgnores)).toBe(true)
    expect(isHardcodedIgnored("1.0.0", customIgnores)).toBe(true)

    // Normal text still not ignored
    expect(isHardcodedIgnored("OK", customIgnores)).toBe(false)
    expect(isHardcodedIgnored("Hello", customIgnores)).toBe(false)
  })
})
