import fc from "fast-check"
import { describe, it, expect } from "vitest"
import { computeLineOffsets, offsetToLine } from "@/core/scanner/lines"

describe("computeLineOffsets", () => {
  it("returns [0, 0] for empty string", () => {
    expect(computeLineOffsets("")).toEqual([0, 0])
  })
  it("returns [0, 0] for single-line string", () => {
    expect(computeLineOffsets("abc")).toEqual([0, 0])
  })
  it("indexes line starts for multi-line content", () => {
    // "a\nb\nc": line 1 starts at 0, line 2 at 2, line 3 at 4.
    expect(computeLineOffsets("a\nb\nc")).toEqual([0, 0, 2, 4])
  })
})

describe("offsetToLine", () => {
  it("returns 1 for offset 0 in any non-empty string", () => {
    expect(offsetToLine(computeLineOffsets("abc"), 0)).toBe(1)
  })
  it.each([
    [0, 1],
    [3, 1], // \n itself ends line 1
    [4, 2], // 'd' starts line 2
    [7, 2],
    [8, 3]
  ])("offset %i in 'abc\\ndef\\nghi' → line %i", (off, line) => {
    const offsets = computeLineOffsets("abc\ndef\nghi")
    expect(offsetToLine(offsets, off)).toBe(line)
  })
})

describe("offsetToLine property: matches naive split reference", () => {
  it("agrees with slow path for random strings + offsets", () => {
    fc.assert(
      fc.property(
        fc.string({
          unit: fc.constantFrom("a", "b", "c", "\n"),
          maxLength: 200
        }),
        fc.nat(),
        (s, rawOff) => {
          if (s.length === 0) return // skip degenerate
          const off = rawOff % s.length
          const naive =
            Array.from(s.slice(0, off)).filter((c) => c === "\n").length + 1
          const fast = offsetToLine(computeLineOffsets(s), off)
          expect(fast).toBe(naive)
        }
      )
    )
  })
})
