/**
 * Locale key ordering mode.
 * - "alpha": case-insensitive, numeric-aware Unicode sort via Intl.Collator('en', { sensitivity: 'base', numeric: true })
 * - "source": order keys by their position in the provided `keyOrder` Set; keys not in the set go to the end in insertion order
 * - "preserve": identity — return the input object reference unchanged (zero diff vs v0.2.x)
 */
export type SortMode = "alpha" | "source" | "preserve"

const ALPHA_COLLATOR = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true
})

/**
 * Recursively sort keys in a locale object.
 *
 * - "preserve" returns the input by reference (no allocation).
 * - "alpha" uses the module-level `ALPHA_COLLATOR` (fixed 'en' locale for cross-machine determinism).
 * - "source" orders keys by their position in `keyOrder` (a Set whose iteration order = first-seen order from `detectUsedKeys`).
 *   Keys NOT in `keyOrder` are appended at the end in their original insertion order.
 *
 * For nested objects, this function recurses into each `Record<string, unknown>` value with the SAME mode and the SAME keyOrder.
 * Non-object values (strings, numbers, booleans, null, arrays) are returned by reference unchanged.
 */
export function sortLocaleObject(
  obj: Record<string, unknown>,
  mode: SortMode,
  keyOrder?: Set<string>,
  currentPath = ""
): Record<string, unknown> {
  if (mode === "preserve") return obj

  const keys = Object.keys(obj)
  let orderedKeys: string[]

  if (mode === "alpha") {
    orderedKeys = [...keys].sort((a, b) => ALPHA_COLLATOR.compare(a, b))
  } else {
    // source mode
    const order = keyOrder ?? new Set<string>()
    const pathSegments = currentPath ? currentPath.split(".") : []
    const depth = pathSegments.length

    const indexOf = new Map<string, number>()
    const orderArray = Array.from(order)

    for (const k of keys) {
      const idx = orderArray.findIndex((entry) => {
        const segments = entry.split(".")
        if (segments.length <= depth) return false
        for (let i = 0; i < depth; i++) {
          if (segments[i] !== pathSegments[i]) return false
        }
        return segments[depth] === k
      })
      if (idx !== -1) {
        indexOf.set(k, idx)
      }
    }

    orderedKeys = [...keys].sort((a, b) => {
      const ia = indexOf.get(a)
      const ib = indexOf.get(b)
      if (ia === undefined && ib === undefined) return 0 // preserve original insertion order
      if (ia === undefined) return 1 // unknown goes after known
      if (ib === undefined) return -1
      return ia - ib
    })
  }

  const out: Record<string, unknown> = {}
  for (const k of orderedKeys) {
    const v = obj[k]
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      const nextPath = currentPath ? `${currentPath}.${k}` : k
      out[k] = sortLocaleObject(
        v as Record<string, unknown>,
        mode,
        keyOrder,
        nextPath
      )
    } else {
      out[k] = v
    }
  }
  return out
}
