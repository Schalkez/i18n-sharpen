/**
 * Parser output contract (D-07). Top-level shape is locked in Phase 1;
 * exact member field shapes are refined in Phase 2 against PARSE-01..05.
 * All offsets are DOCUMENT-ABSOLUTE so they feed offsetToLine
 * (src/core/scanner/lines.ts) unchanged — OFFSET-02. Deliberately kept
 * out of the public src/types.ts surface (D-08).
 */
export interface ParsedFileResult {
  /** Static translation keys: t("key"), i18nKey="key". Offsets are document-absolute. */
  usedKeys: { key: string; offset: number }[]
  /** Dynamic/non-static calls: t(variable), t("prefix." + x). Offsets are document-absolute. */
  dynamicCalls: { expression: string; arg: string; offset: number }[]
  /** Hardcoded text candidates: <div>Hello</div>, placeholder="Enter name". Offsets are document-absolute. */
  hardcodedCandidates: { text: string; offset: number }[]
}

/**
 * Non-fatal, file-level parse error. Accumulated during a scan and reported
 * as a warning — NEVER thrown (D-02). Only I18nSharpenError is ever thrown.
 * Must remain a plain data interface (NOT an Error subclass).
 */
export interface FileParseError {
  file: string
  line?: number
  message: string
}
