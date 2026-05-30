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
  escDelay?: number
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
  const escDelay = options.escDelay ?? 50

  return new Promise<InteractivePruneResult>((resolve, reject) => {
    // Setup state
    let cursorIndex = 0
    const checkedIndices = new Set<number>()
    let isFinished = false
    let initialRender = true
    let escTimeout: NodeJS.Timeout | undefined
    let pending = Buffer.alloc(0)

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
      const width = stdout.columns ?? 80
      const prefixLen = 6 // "> " (2) + "[x] " (4)
      const maxLabel = Math.max(0, width - prefixLen - 1)

      for (let i = 0; i < totalRows; i++) {
        const isCursor = i === cursorIndex
        const isChecked = checkedIndices.has(i)

        const cursorStr = isCursor ? pc.cyan(glyphs.cursor) : " "
        const checkboxStr = isChecked
          ? pc.green(glyphs.checked)
          : pc.dim(glyphs.unchecked)

        let label = candidates[i]
        if (label.length > maxLabel) {
          label = label.slice(0, maxLabel)
        }
        const labelStr = isCursor ? pc.cyan(label) : label

        output += `${cursorStr} ${checkboxStr} ${labelStr}\x1b[K\n`
      }

      // Add footer
      let footer = footerText
      const plainFooter =
        "Space toggle  Enter confirm  Esc cancel  a all  n none  i invert"
      if (plainFooter.length > width - 1) {
        footer = pc.dim(plainFooter.slice(0, width - 1))
      }
      output += `${footer}\x1b[K\n`

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
      if (typeof stdout.removeListener === "function") {
        stdout.removeListener("resize", onResize)
      }
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

      pending = Buffer.concat([pending, chunk])

      while (pending.length > 0) {
        // Ctrl+C (0x03)
        if (pending[0] === 0x03) {
          pending = pending.subarray(1)
          handleSigInt()
          return
        }

        // Enter / Carriage Return (0x0d) / Line Feed (0x0a)
        if (pending[0] === 0x0d || pending[0] === 0x0a) {
          pending = pending.subarray(1)
          cleanup()
          const toDelete = new Set<string>()
          for (const idx of checkedIndices) {
            toDelete.add(candidates[idx])
          }
          resolve({ toDelete, cancelled: false })
          return
        }

        // Space (0x20)
        if (pending[0] === 0x20) {
          pending = pending.subarray(1)
          if (checkedIndices.has(cursorIndex)) {
            checkedIndices.delete(cursorIndex)
          } else {
            checkedIndices.add(cursorIndex)
          }
          render()
          continue
        }

        // Esc sequence (0x1b)
        if (pending[0] === 0x1b) {
          if (pending.length === 1) {
            // Lookahead to make sure it's not a split sequence
            escTimeout = setTimeout(() => {
              pending = Buffer.alloc(0)
              cleanup()
              resolve({ toDelete: new Set(), cancelled: true })
            }, escDelay)
            return
          }

          // Double Esc
          if (pending[1] === 0x1b) {
            pending = pending.subarray(1)
            continue
          }

          // Parse ANSI sequences starting with 0x1b 0x5b ([)
          if (pending[1] === 0x5b) {
            let endIdx = -1
            for (let idx = 2; idx < pending.length; idx++) {
              const charCode = pending[idx]
              if (charCode >= 0x40 && charCode <= 0x7e) {
                endIdx = idx
                break
              }
            }

            if (endIdx === -1) {
              // Sequence is not complete, wait for more data
              return
            }

            const sequence = pending.toString("utf8", 2, endIdx + 1)
            pending = pending.subarray(endIdx + 1)

            if (sequence === "A") {
              // Arrow Up
              cursorIndex = Math.max(0, cursorIndex - 1)
            } else if (sequence === "B") {
              // Arrow Down
              cursorIndex = Math.min(totalRows - 1, cursorIndex + 1)
            } else if (sequence === "5~") {
              // PageUp
              const pageSize = Math.max(1, (stdout.rows ?? 12) - 2)
              cursorIndex = Math.max(0, cursorIndex - pageSize)
            } else if (sequence === "6~") {
              // PageDown
              const pageSize = Math.max(1, (stdout.rows ?? 12) - 2)
              cursorIndex = Math.min(totalRows - 1, cursorIndex + pageSize)
            }
            render()
            continue
          }

          // Alt/meta not supported (0x1b followed by non-[ non-1b byte)
          pending = pending.subarray(2)
          continue
        }

        // Standard keyboard shortcuts
        const char = String.fromCharCode(pending[0]).toLowerCase()
        pending = pending.subarray(1)

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
    }

    function onResize() {
      if (!isFinished) {
        render()
      }
    }

    // Attach listeners
    stdin.on("data", handleData)
    process.on("SIGINT", handleSigInt)
    if (typeof stdout.on === "function") {
      stdout.on("resize", onResize)
    }
  })
}
