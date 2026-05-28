/**
 * Precompute line-start byte offsets for a source-file string.
 * Returns an array `offsets` such that `offsets[i]` is the 0-based
 * byte position of the FIRST character of (1-based) line `i`.
 *
 * `offsets[0]` is a sentinel zero so callers can treat the array as
 * 1-indexed. `offsets[1]` is always 0 (line 1 starts at offset 0).
 *
 * Cost: O(n) once per file. Pair with offsetToLine for O(log n)
 * per-match line lookup (cheaper than `content.slice(0, off).split("\n").length`
 * which is O(n) per match).
 */
export function computeLineOffsets(content: string): number[] {
  const offsets: number[] = [0, 0] // sentinel + line 1 start
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) {
      offsets.push(i + 1)
    }
  }
  return offsets
}

/**
 * Map a byte offset to a 1-based line number using the offsets array
 * from computeLineOffsets. Binary search — O(log lines).
 */
export function offsetToLine(offsets: number[], offset: number): number {
  // Find the largest line index L where offsets[L] <= offset.
  let lo = 1
  let hi = offsets.length - 1
  let ans = 1
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    if (offsets[mid] <= offset) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}
