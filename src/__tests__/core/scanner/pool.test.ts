import { describe, it, expect } from "vitest"
import { runBoundedPool } from "@/core/scanner/pool"

describe("runBoundedPool", () => {
  it("never exceeds maxConcurrency of 4 by default", async () => {
    let current = 0
    let peak = 0
    let invocationCount = 0

    await runBoundedPool(10, async () => {
      current++
      peak = Math.max(peak, current)
      invocationCount++
      await new Promise((r) => setTimeout(r, 10))
      current--
    })

    expect(peak).toBeLessThanOrEqual(4)
    expect(invocationCount).toBe(10)
  })

  it("respects override maxConcurrency of 2", async () => {
    let current = 0
    let peak = 0
    let invocationCount = 0

    await runBoundedPool(
      10,
      async () => {
        current++
        peak = Math.max(peak, current)
        invocationCount++
        await new Promise((r) => setTimeout(r, 10))
        current--
      },
      2
    )

    expect(peak).toBeLessThanOrEqual(2)
    expect(invocationCount).toBe(10)
  })
})
