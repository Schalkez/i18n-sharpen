/**
 * Structured error type for i18n-sharpen.
 *
 * The library only ever throws `I18nSharpenError`. The `error` discriminated
 * union carries the machine-readable kind + context so the CLI (and
 * programmatic callers) can route the failure correctly without parsing
 * message strings.
 */
export type I18nError =
  | { kind: "config"; message: string; path?: string }
  | { kind: "filesystem"; message: string; path: string; cause?: unknown }
  | { kind: "parse"; message: string; path: string; line?: number }
  | { kind: "validation"; message: string; details?: unknown }

/**
 * Single error class thrown by i18n-sharpen. `error` is a discriminated
 * union (see {@link I18nError}); use `err.error.kind` to switch on it.
 *
 * Only `src/cli.ts` should catch this and translate it into an exit
 * code — everywhere else, let it propagate.
 */
export class I18nSharpenError extends Error {
  constructor(
    public readonly error: I18nError,
    message?: string
  ) {
    super(message ?? error.message)
    this.name = "I18nSharpenError"
  }
}
