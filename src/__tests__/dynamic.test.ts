import { describe, it, expect } from "vitest"
import {
  classifyDynamicCall,
  extractLeadingPrefix
} from "@/core/scanner/dynamic"

describe("classifyDynamicCall — fully-dynamic (D-01, D-02, D-04)", () => {
  it.each([
    ["myVar"],
    ["getKey()"],
    ["obj.method()"],
    ["`${prefix}.error`"],
    ['cond ? "a" : "b"']
  ])("classifies %s as fully-dynamic", (input) => {
    expect(classifyDynamicCall(input).kind).toBe("fully-dynamic")
  })
})

describe("classifyDynamicCall — structured-concat (D-03, D-05, D-06)", () => {
  it.each([
    ['"error." + code', "error."],
    ["`error.${code}`", "error."],
    ['"a." + x + ".b"', "a."], // D-03: trailing dropped
    ["`error.${code}.detail`", "error."], // D-05
    ['"e." + x', "e."], // D-06: no min length
    ["'error.' + x", "error."], // single quotes
    ['"error." + code, { option: true }', "error."] // FIX-1 regression check
  ])("classifies %s with prefix %s", (input, prefix) => {
    const result = classifyDynamicCall(input)
    expect(result.kind).toBe("structured-concat")
    if (result.kind === "structured-concat") {
      expect(result.prefix).toBe(prefix)
    }
  })
})

describe("extractLeadingPrefix — normalization (D-07)", () => {
  it.each([
    ['"error."', "error."],
    ["'error.'", "error."],
    ["`error.`", "error."]
  ])("strips quotes/backticks from %s", (input, expected) => {
    expect(extractLeadingPrefix(input)).toBe(expected)
  })

  it("returns null when no leading static segment", () => {
    expect(extractLeadingPrefix("myVar")).toBeNull()
    expect(extractLeadingPrefix("`${x}.error`")).toBeNull()
  })
})
