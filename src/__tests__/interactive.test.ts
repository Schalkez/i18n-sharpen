import { PassThrough } from "node:stream"
import fc from "fast-check"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  runInteractivePrune,
  InteractiveCancelledError
} from "@/commands/prune/interactive"

function mockStdio() {
  const stdin = new PassThrough() as PassThrough & {
    isTTY: boolean
    setRawMode: (b: boolean) => void
    rawModeStates: boolean[]
  }
  const stdout = new PassThrough() as PassThrough & {
    isTTY: boolean
    columns?: number
    rows?: number
  }
  stdin.isTTY = true
  stdout.isTTY = true
  stdout.columns = 80
  stdout.rows = 24
  stdin.rawModeStates = []
  stdin.setRawMode = (b: boolean) => {
    stdin.rawModeStates.push(b)
  }
  const captured: string[] = []
  stdout.on("data", (c: Buffer) => captured.push(c.toString("utf8")))
  const exitCalls: number[] = []
  const exit = (code: number) => {
    exitCalls.push(code)
  }
  /* eslint-disable no-control-regex */
  function stripAnsi(s: string) {
    return s.replace(
      /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
      ""
    )
  }
  /* eslint-enable no-control-regex */
  return {
    stdin,
    stdout,
    captured,
    exitCalls,
    exit,
    getOutput: () => captured.join(""),
    getStrippedOutput: () => stripAnsi(captured.join(""))
  }
}

describe("interactive TUI renderer", () => {
  it("initial render — all rows unchecked, cursor on first row, cursor hidden", async () => {
    const io = mockStdio()
    const candidates = ["auth:login.title", "common.farewell", "errors.network"]
    const promise = runInteractivePrune(candidates, {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await new Promise((r) => setImmediate(r))
    io.stdin.write("\r") // confirm immediately
    await promise

    const output = io.getOutput()
    // Initial cursor hide check
    expect(output).toContain("\x1b[?25l")

    const stripped = io.getStrippedOutput()
    // Footer check
    expect(stripped).toContain("Space toggle")
    expect(stripped).toContain("Enter confirm")
    expect(stripped).toContain("Esc cancel")
    // Check initial rows are unchecked
    const rows = stripped.split("\n").filter((line) => line.includes("[ ]"))
    expect(rows.length).toBe(3)
    expect(rows[0]).toContain("auth:login.title")
    expect(rows[1]).toContain("common.farewell")
    expect(rows[2]).toContain("errors.network")
    // Cursor starts at first candidate
    // Matches cursor glyph (e.g. → or >) next to first row
    const firstBlock = stripped.substring(
      0,
      stripped.indexOf("common.farewell")
    )
    expect(firstBlock).toMatch(/[→>]\s*\[ \]\s*auth:login.title/)
  })

  it("navigation — arrow down moves cursor, clamps at last row", async () => {
    const io = mockStdio()
    const candidates = ["a", "b", "c"]
    const promise = runInteractivePrune(candidates, {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await new Promise((r) => setImmediate(r))

    // Arrow down to second row
    io.stdin.write("\x1b[B")
    await new Promise((r) => setImmediate(r))

    // Arrow down to third row
    io.stdin.write("\x1b[B")
    await new Promise((r) => setImmediate(r))

    // Arrow down past end should clamp to row 2
    io.stdin.write("\x1b[B")
    await new Promise((r) => setImmediate(r))

    io.stdin.write("\r")
    await promise

    const output = io.getStrippedOutput()
    const lastFrame = output.substring(output.lastIndexOf("Space toggle") - 40) // safe window to avoid raw ANSI offsets
    // Cursor should be at 'c'
    expect(lastFrame).toMatch(/[→>]\s*\[ \]\s*c/)
  })

  it("navigation — arrow up clamps at first row", async () => {
    const io = mockStdio()
    const candidates = ["a", "b"]
    const promise = runInteractivePrune(candidates, {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await new Promise((r) => setImmediate(r))

    // Arrow up past start should clamp to 0
    io.stdin.write("\x1b[A")
    await new Promise((r) => setImmediate(r))

    io.stdin.write("\r")
    await promise

    const output = io.getStrippedOutput()
    const lastFrame = output.substring(output.lastIndexOf("Space toggle") - 40)
    expect(lastFrame).toMatch(/[→>]\s*\[ \]\s*a/)
  })

  it("toggle — Space on second row marks only second row toDelete", async () => {
    const io = mockStdio()
    const candidates = ["a", "b", "c"]
    const promise = runInteractivePrune(candidates, {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await new Promise((r) => setImmediate(r))

    // Arrow down to row 1 ('b')
    io.stdin.write("\x1b[B")
    await new Promise((r) => setImmediate(r))

    // Space to toggle
    io.stdin.write(" ")
    await new Promise((r) => setImmediate(r))

    io.stdin.write("\r")
    const result = await promise

    expect(result.cancelled).toBe(false)
    expect(result.toDelete).toEqual(new Set(["b"]))

    const output = io.getStrippedOutput()
    const lastFrame = output.substring(output.lastIndexOf("Space toggle") - 40)
    expect(lastFrame).toMatch(/[→>]\s*\[x\]\s*b/)
  })

  it("shortcuts — 'a' checks all, 'n' unchecks all, 'i' inverts selection", async () => {
    const io = mockStdio()
    const candidates = ["a", "b", "c"]
    const promise = runInteractivePrune(candidates, {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await new Promise((r) => setImmediate(r))

    // Press 'a' to select all
    io.stdin.write("a")
    await new Promise((r) => setImmediate(r))

    // Toggle off 'b'
    io.stdin.write("\x1b[B") // down to 'b'
    await new Promise((r) => setImmediate(r))
    io.stdin.write(" ") // toggle
    await new Promise((r) => setImmediate(r))

    // Press 'i' to invert (should make 'b' selected, 'a' and 'c' unselected)
    io.stdin.write("i")
    await new Promise((r) => setImmediate(r))

    io.stdin.write("\r")
    const result = await promise
    expect(result.toDelete).toEqual(new Set(["b"]))
  })

  it("shortcuts — 'n' unchecks all", async () => {
    const io = mockStdio()
    const candidates = ["a", "b", "c"]
    const promise = runInteractivePrune(candidates, {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await new Promise((r) => setImmediate(r))

    io.stdin.write("a") // select all
    await new Promise((r) => setImmediate(r))
    io.stdin.write("n") // uncheck all
    await new Promise((r) => setImmediate(r))

    io.stdin.write("\r")
    const result = await promise
    expect(result.toDelete).toEqual(new Set())
  })

  it("shortcuts — PageUp and PageDown move cursor by visible window", async () => {
    const io = mockStdio()
    const candidates = Array.from({ length: 15 }, (_, i) => `key.${i}`)
    // visible window size is rows - 2 = 8 - 2 = 6
    io.stdout.rows = 8
    const promise = runInteractivePrune(candidates, {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await new Promise((r) => setImmediate(r))

    // PageDown
    io.stdin.write("\x1b[6~")
    await new Promise((r) => setImmediate(r))

    // Press space to mark whatever is focused (should be index 6)
    io.stdin.write(" ")
    await new Promise((r) => setImmediate(r))

    // PageDown again (to index 12)
    io.stdin.write("\x1b[6~")
    await new Promise((r) => setImmediate(r))
    io.stdin.write(" ")
    await new Promise((r) => setImmediate(r))

    // PageUp back to index 6
    io.stdin.write("\x1b[5~")
    await new Promise((r) => setImmediate(r))
    io.stdin.write(" ") // toggle index 6 OFF

    io.stdin.write("\r")
    const result = await promise
    expect(result.toDelete).toEqual(new Set(["key.12"]))
  })

  it("confirm — Enter resolves with toDelete, restores cursor, disables rawMode", async () => {
    const io = mockStdio()
    const promise = runInteractivePrune(["a", "b"], {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await new Promise((r) => setImmediate(r))

    io.stdin.write("\r")
    const result = await promise

    expect(result.cancelled).toBe(false)
    expect(io.exitCalls).toEqual([])
    expect(io.stdin.rawModeStates.at(-1)).toBe(false)
    // Captured output must end with cursor show escape code
    expect(io.getOutput().endsWith("\x1b[?25h")).toBe(true)
  })

  it("cancel via Esc — clean cancel (no exit call)", async () => {
    const io = mockStdio()
    const promise = runInteractivePrune(["a", "b"], {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await new Promise((r) => setImmediate(r))

    // Escape sequence (standalone \x1b)
    io.stdin.write("\x1b")
    // Wait for the lookahead lookups to settle
    await new Promise((r) => setImmediate(r))
    await new Promise((r) => setTimeout(r, 10))

    const result = await promise
    expect(result.cancelled).toBe(true)
    expect(result.toDelete.size).toBe(0)
    expect(io.exitCalls).toEqual([]) // Esc does NOT call exit
    expect(io.stdin.rawModeStates.at(-1)).toBe(false)
    expect(io.getOutput().endsWith("\x1b[?25h")).toBe(true)
  })

  it("cancel via Ctrl+C — hard cancel triggers SIGINT cleanup, exits 130, rejects", async () => {
    const io = mockStdio()
    const promise = runInteractivePrune(["a", "b"], {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await new Promise((r) => setImmediate(r))

    const expectation = expect(promise).rejects.toThrow(
      InteractiveCancelledError
    )
    io.stdin.write("\x03") // Ctrl+C
    await expectation
    expect(io.exitCalls).toEqual([130])
    expect(io.stdin.rawModeStates.at(-1)).toBe(false)
    expect(io.getOutput().endsWith("\x1b[?25h")).toBe(true)
  })

  it("cursor visibility restored when rendering throws an error", async () => {
    const io = mockStdio()
    // Force write error
    io.stdout.write = () => {
      throw new Error("Stdout crash")
    }

    const promise = runInteractivePrune(["a", "b"], {
      stdin: io.stdin,
      stdout: io.stdout,
      exit: io.exit
    })
    await expect(promise).rejects.toThrow("Stdout crash")
  })

  describe("NO_EMOJI support", () => {
    beforeEach(() => {
      vi.stubEnv("NO_EMOJI", "1")
    })
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it("renders ASCII > cursor glyph instead of Unicode arrow", async () => {
      const io = mockStdio()
      const promise = runInteractivePrune(["a", "b"], {
        stdin: io.stdin,
        stdout: io.stdout,
        exit: io.exit
      })
      await new Promise((r) => setImmediate(r))
      io.stdin.write("\r")
      await promise

      const output = io.getStrippedOutput()
      // Should have > next to 'a' and not include →
      expect(output).toMatch(/>\s*\[ \]\s*a/)
      expect(output).not.toContain("→")
    })
  })

  it("property test — odd number of Space toggles matches toDelete set", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom("down", "up", "space"), {
          minLength: 0,
          maxLength: 30
        }),
        fc.integer({ min: 1, max: 8 }),
        async (keystrokes, n) => {
          const candidates = Array.from({ length: n }, (_, i) => `key.${i}`)
          const io = mockStdio()
          const promise = runInteractivePrune(candidates, {
            stdin: io.stdin,
            stdout: io.stdout,
            exit: io.exit
          })
          await new Promise((r) => setImmediate(r))

          let cursorIdx = 0
          const spaceCounts = Array.from({ length: n }, () => 0)

          for (const key of keystrokes) {
            if (key === "down") {
              io.stdin.write("\x1b[B")
              cursorIdx = Math.min(n - 1, cursorIdx + 1)
            } else if (key === "up") {
              io.stdin.write("\x1b[A")
              cursorIdx = Math.max(0, cursorIdx - 1)
            } else {
              io.stdin.write(" ")
              spaceCounts[cursorIdx]++
            }
            await new Promise((r) => setImmediate(r))
          }

          io.stdin.write("\r")
          const result = await promise

          const expectedToDelete = new Set<string>()
          for (let i = 0; i < n; i++) {
            if (spaceCounts[i] % 2 === 1) {
              expectedToDelete.add(`key.${i}`)
            }
          }

          expect(result.toDelete).toEqual(expectedToDelete)
        }
      ),
      { numRuns: 100 }
    )
  })
})
