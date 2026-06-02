export async function runBoundedPool(
  count: number,
  worker: (index: number) => Promise<void>,
  maxConcurrency = 4
): Promise<void> {
  let next = 0
  async function drain(): Promise<void> {
    while (next < count) {
      const i = next++
      await worker(i)
    }
  }
  const slots = Math.min(maxConcurrency, count)
  await Promise.all(Array.from({ length: slots }, drain))
}
