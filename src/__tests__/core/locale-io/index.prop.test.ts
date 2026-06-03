import fc from "fast-check"
import { describe, it, expect } from "vitest"
import { flattenObject, unflattenObject } from "@/core/locale-io"

describe("locale-io: property-based tests", () => {
  const safeKey = fc
    .stringMatching(/^[A-Za-z0-9_-]+$/)
    .filter(
      (k) => k !== "__proto__" && k !== "prototype" && k !== "constructor"
    )
  const safeValue = fc.string()

  // Generate recursive nested objects where all keys are alphanumeric (no dots, no prototype keys)
  // and all dictionaries are non-empty so they contain actual leaf values.
  const { tree } = fc.letrec<{ tree: Record<string, unknown> }>((tie) => ({
    tree: fc.dictionary(safeKey, fc.oneof(safeValue, tie("tree")), {
      minKeys: 1
    })
  }))

  it("should satisfy the round-trip property for any safe nested object: unflatten(flatten(obj)) === obj", () => {
    fc.assert(
      fc.property(tree, (obj) => {
        const flat = flattenObject(obj)
        const nested = unflattenObject(flat)
        expect(nested).toEqual(obj)
      })
    )
  })
})
