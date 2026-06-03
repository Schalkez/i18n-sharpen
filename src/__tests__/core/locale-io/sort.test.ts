import fc from "fast-check"
import { describe, it, expect } from "vitest"
import { flattenObject } from "@/core/locale-io"
import { sortLocaleObject } from "@/core/locale-io/sort"

describe("sortLocaleObject", () => {
  it("alpha mode sorts keys alphabetically case-insensitive and numeric-aware", () => {
    const input = {
      z: 1,
      a: 2,
      key10: 10,
      key2: 2,
      key1: 1
    }
    const output = sortLocaleObject(input, "alpha")
    expect(Object.keys(output)).toEqual(["a", "key1", "key2", "key10", "z"])
  })

  it("alpha mode handles case-insensitive stable sorting", () => {
    const input = {
      apple: 1,
      Apple: 2
    }
    const output = sortLocaleObject(input, "alpha")
    expect(Object.keys(output)).toEqual(["apple", "Apple"])
  })

  it("alpha mode recurses into nested objects", () => {
    const input = {
      z: 1,
      a: {
        y: 2,
        x: 1
      }
    }
    const output = sortLocaleObject(input, "alpha")
    expect(Object.keys(output)).toEqual(["a", "z"])
    expect(Object.keys(output.a as Record<string, unknown>)).toEqual(["x", "y"])
  })

  it("alpha mode is Unicode safe", () => {
    const input = {
      über: 1,
      apple: 2,
      äpfel: 3
    }
    const output = sortLocaleObject(input, "alpha")
    expect(Object.keys(output)).toEqual(["äpfel", "apple", "über"])
  })

  it("preserve mode returns the same reference unchanged", () => {
    const input = {
      z: 1,
      a: 2
    }
    const output = sortLocaleObject(input, "preserve")
    expect(output).toBe(input)
  })

  it("source mode sorts keys based on a Set", () => {
    const input = {
      c: 3,
      a: 1,
      b: 2
    }
    const order = new Set(["a", "b", "c"])
    const output = sortLocaleObject(input, "source", order)
    expect(Object.keys(output)).toEqual(["a", "b", "c"])
  })

  it("source mode appends unknown keys at the end in their insertion order", () => {
    const input = {
      c: 3,
      unknown2: 5,
      a: 1,
      unknown1: 4,
      b: 2
    }
    const order = new Set(["b", "a"])
    const output = sortLocaleObject(input, "source", order)
    // Order: b first, then a, then c, unknown2, unknown1 in their insertion order
    expect(Object.keys(output)).toEqual(["b", "a", "c", "unknown2", "unknown1"])
  })

  it("source mode supports nested recursive sorting using dotted keys in the order Set", () => {
    const input = {
      b: {
        y: 2,
        x: 1
      },
      a: {
        n: 2,
        m: 1
      }
    }
    const order = new Set(["a.m", "a.n", "b.x", "b.y", "b", "a"])
    const output = sortLocaleObject(input, "source", order)
    expect(Object.keys(output)).toEqual(["a", "b"])
    expect(Object.keys(output.a as Record<string, unknown>)).toEqual(["m", "n"])
    expect(Object.keys(output.b as Record<string, unknown>)).toEqual(["x", "y"])
  })

  it("preserves non-object values and null/arrays", () => {
    const input = {
      b: null,
      a: [1, 2, 3],
      c: "hello"
    }
    const output = sortLocaleObject(input, "alpha")
    expect(Object.keys(output)).toEqual(["a", "b", "c"])
    expect(output.b).toBeNull()
    expect(output.a).toEqual([1, 2, 3])
  })

  describe("property-based tests", () => {
    const safeKey = fc
      .stringMatching(/^[A-Za-z0-9_-]+$/)
      .filter(
        (k) => k !== "__proto__" && k !== "prototype" && k !== "constructor"
      )
    const safeValue = fc.string()

    const { tree } = fc.letrec<{ tree: Record<string, unknown> }>((tie) => ({
      tree: fc.dictionary(safeKey, fc.oneof(safeValue, tie("tree")), {
        minKeys: 1
      })
    }))

    it("should satisfy the idempotency property: sort(sort(x)) === sort(x)", () => {
      fc.assert(
        fc.property(tree, (obj) => {
          const sorted1 = sortLocaleObject(obj, "alpha")
          const sorted2 = sortLocaleObject(sorted1, "alpha")
          expect(sorted2).toEqual(sorted1)
        })
      )
    })

    it("should satisfy the key-preservation property: flatKeys(sort(x)) is set-equal to flatKeys(x)", () => {
      fc.assert(
        fc.property(tree, (obj) => {
          const sorted = sortLocaleObject(obj, "alpha")
          const keysOriginal = Object.keys(flattenObject(obj)).sort()
          const keysSorted = Object.keys(flattenObject(sorted)).sort()
          expect(keysSorted).toEqual(keysOriginal)
        })
      )
    })
  })
})
