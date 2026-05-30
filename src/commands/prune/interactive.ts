import pc from "picocolors"

export interface InteractivePruneOptions {
  stdin?: NodeJS.ReadableStream & {
    isTTY?: boolean
    setRawMode?: (b: boolean) => unknown
  }
  stdout?: NodeJS.WritableStream & {
    isTTY?: boolean
    columns?: number
    rows?: number
  }
  exit?: (code: number) => void
}

export interface InteractivePruneResult {
  /** The set of candidate keys the user checked (marked for deletion). */
  toDelete: Set<string>
  /** True if the user pressed Esc. */
  cancelled: boolean
}

export class InteractiveCancelledError extends Error {
  readonly code = 130
  constructor() {
    super("Interactive prune cancelled via SIGINT")
    // Set the prototype explicitly for custom error class
    Object.setPrototypeOf(this, InteractiveCancelledError.prototype)
  }
}

function getGlyphs() {
  const isNoEmoji =
    typeof process !== "undefined" &&
    !!process.env.NO_EMOJI &&
    process.env.NO_EMOJI !== "0" &&
    process.env.NO_EMOJI.toLowerCase() !== "false"
  return {
    cursor: isNoEmoji ? ">" : "→",
    checked: "[x]",
    unchecked: "[ ]"
  }
}

export function runInteractivePrune(
  candidates: string[],
  options: InteractivePruneOptions = {}
): Promise<InteractivePruneResult> {
  const stdin = options.stdin ?? process.stdin
  const stdout = options.stdout ?? process.stdout
  const exitHook = options.exit ?? ((code) => process.exit(code))

  return new Promise<InteractivePruneResult>((resolve, reject) => {
    // Setup state
    let cursorIndex = 0
    const checkedIndices = new Set<number>()
    let isFinished = false
    let initialRender = true
    let escTimeout: NodeJS.Timeout | undefined

    const totalRows = candidates.length
    // Header log or metadata
    const footerText = pc.dim(
      "Space toggle  Enter confirm  Esc cancel  a all  n none  i invert"
    )

    // Hide cursor initially
    writeToStdout("\x1b[?25l")

    // Setup TTY / Raw Mode
    if (stdin.setRawMode) {
      try {
        stdin.setRawMode(true)
      } catch {
        // Safe fallback
      }
    }
    stdin.resume()

    // First render
    render()

    function writeToStdout(s: string) {
      try {
        stdout.write(s)
      } catch (err) {
        cleanup()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }

    function render() {
      if (isFinished) return

      let output = ""

      // If this is not the first render, move cursor back up to redraw in place.
      // We render candidates + 1 footer line.
      if (!initialRender) {
        output += `\x1b[${totalRows + 1}A`
      } else {
        initialRender = false
      }

      const glyphs = getGlyphs()

      for (let i = 0; i < totalRows; i++) {
        const isCursor = i === cursorIndex
        const isChecked = checkedIndices.has(i)

        const cursorStr = isCursor ? pc.cyan(glyphs.cursor) : " "
        const checkboxStr = isChecked
          ? pc.green(glyphs.checked)
          : pc.dim(glyphs.unchecked)
        const labelStr = isCursor ? pc.cyan(candidates[i]) : candidates[i]

        output += `${cursorStr} ${checkboxStr} ${labelStr}\x1b[K\n`
      }

      // Add footer
      output += `${footerText}\x1b[K\n`

      writeToStdout(output)
    }

    function cleanup() {
      isFinished = true
      if (escTimeout) {
        clearTimeout(escTimeout)
      }
      // Restore cursor visibility
      try {
        stdout.write("\x1b[?25h")
      } catch {
        // Safe fallback
      }
      // Restore raw mode
      if (stdin.setRawMode) {
        try {
          stdin.setRawMode(false)
        } catch {
          // Safe fallback
        }
      }
      stdin.pause()
      stdin.removeListener("data", handleData)
      process.removeListener("SIGINT", handleSigInt)
    }

    function handleSigInt() {
      cleanup()
      try {
        exitHook(130)
      } catch {
        // Safe fallback for test mock environments
      }
      reject(new InteractiveCancelledError())
    }

    function handleData(chunk: Buffer) {
      if (isFinished) return

      // Clear any pending Esc timeout since we got new bytes
      if (escTimeout) {
        clearTimeout(escTimeout)
        escTimeout = undefined
      }

      const len = chunk.length
      if (len === 0) return

      // Ctrl+C (0x03)
      if (chunk[0] === 0x03) {
        handleSigInt()
        return
      }

      // Enter / Carriage Return (0x0d) / Line Feed (0x0a)
      if (chunk[0] === 0x0d || chunk[0] === 0x0a) {
        cleanup()
        const toDelete = new Set<string>()
        for (const idx of checkedIndices) {
          toDelete.add(candidates[idx])
        }
        resolve({ toDelete, cancelled: false })
        return
      }

      // Esc sequence (0x1b)
      if (chunk[0] === 0x1b) {
        if (len === 1) {
          // Lookahead to make sure it's not a split sequence
          escTimeout = setTimeout(() => {
            cleanup()
            resolve({ toDelete: new Set(), cancelled: true })
          }, 15)
          return
        }

        // Parse ANSI sequences starting with 0x1b 0x5b ([)
        if (chunk[1] === 0x5b) {
          const code = chunk.toString("utf8", 2)
          if (code === "A") {
            // Arrow Up
            cursorIndex = Math.max(0, cursorIndex - 1)
          } else if (code === "B") {
            // Arrow Down
            cursorIndex = Math.min(totalRows - 1, cursorIndex + 1)
          } else if (code === "5~") {
            // PageUp
            const pageSize = Math.max(1, (stdout.rows ?? 12) - 2)
            cursorIndex = Math.max(0, cursorIndex - pageSize)
          } else if (code === "6~") {
            // PageDown
            const pageSize = Math.max(1, (stdout.rows ?? 12) - 2)
            cursorIndex = Math.min(totalRows - 1, cursorIndex + pageSize)
          }
          render()
        }
        return
      }

      // Space (0x20)
      if (chunk[0] === 0x20) {
        if (checkedIndices.has(cursorIndex)) {
          checkedIndices.delete(cursorIndex)
        } else {
          checkedIndices.add(cursorIndex)
        }
        render()
        return
      }

      // Standard keyboard shortcuts
      const char = String.fromCharCode(chunk[0]).toLowerCase()
      if (char === "a") {
        // Check all
        for (let i = 0; i < totalRows; i++) {
          checkedIndices.add(i)
        }
        render()
      } else if (char === "n") {
        // Uncheck all
        checkedIndices.clear()
        render()
      } else if (char === "i") {
        // Invert selection
        for (let i = 0; i < totalRows; i++) {
          if (checkedIndices.has(i)) {
            checkedIndices.delete(i)
          } else {
            checkedIndices.add(i)
          }
        }
        render()
      }
    }

    // Attach listeners
    stdin.on("data", handleData)
    process.on("SIGINT", handleSigInt)
  })
}
