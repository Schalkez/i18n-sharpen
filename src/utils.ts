import pc from "picocolors"

// Re-export scanner primitives from core/scanner for back-compat. New
// code should import from `./core/scanner` directly.
export {
  /** @deprecated Import from `./core/scanner` instead. */
  getFiles,
  /** @deprecated Import from `./core/scanner` instead. */
  stripComments,
  /** @deprecated Import from `./core/scanner` instead. */
  getBaseKey,
  /** @deprecated Import from `./core/scanner` instead. */
  isKeyUsed,
  /** @deprecated Import from `./core/scanner` instead. */
  matchWildcard
} from "./core/scanner"

// Re-export locale-io primitives from core/locale-io for back-compat.
// New code should import from `./core/locale-io` directly.
export {
  /** @deprecated Import from `./core/locale-io` instead. */
  flattenObject,
  /** @deprecated Import from `./core/locale-io` instead. */
  unflattenObject,
  /** @deprecated Import from `./core/locale-io` instead. */
  setNestedValue,
  /** @deprecated Import from `./core/locale-io` instead. */
  getNestedValue,
  /** @deprecated Import from `./core/locale-io` instead. */
  findLocaleFile,
  /** @deprecated Import from `./core/locale-io` instead. */
  readLocaleFile,
  /** @deprecated Import from `./core/locale-io` instead. */
  writeLocaleFile,
  /** @deprecated Import from `./core/locale-io` instead. */
  normalizeDisplayPath
} from "./core/locale-io"

/**
 * Logging helper utilities.
 *
 * Emoji can render as `?` on Windows cmd.exe and on some CI log viewers.
 * Set the `NO_EMOJI` environment variable (any truthy value) to fall back
 * to plain-text glyphs.
 */
const emojiDisabled =
  typeof process !== "undefined" &&
  !!process.env.NO_EMOJI &&
  process.env.NO_EMOJI !== "0" &&
  process.env.NO_EMOJI.toLowerCase() !== "false"

const glyphs = {
  ok: emojiDisabled ? "[OK]" : "✅",
  warn: emojiDisabled ? "[WARN]" : "⚠️ ",
  err: emojiDisabled ? "[ERR]" : "❌"
}

export const log = {
  header(title: string): void {
    console.log(`\n${pc.bold(pc.cyan(`=== ${title} ===`))}`)
  },
  info(msg: string): void {
    console.log(msg)
  },
  success(msg: string): void {
    console.log(`${pc.green(glyphs.ok)} ${msg}`)
  },
  warn(msg: string): void {
    console.log(`${pc.yellow(`${glyphs.warn} Warning:`)} ${msg}`)
  },
  error(msg: string): void {
    console.error(`${pc.red(`${glyphs.err} Error:`)} ${msg}`)
  }
}
