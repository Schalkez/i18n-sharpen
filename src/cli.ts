#!/usr/bin/env node
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import { Command } from "commander"
import { extract } from "./commands/extract"
import { prune } from "./commands/prune"
import { validate } from "./commands/validate"
import { loadConfig } from "./config/index"
import { I18nSharpenError } from "./core/errors"
import { log } from "./utils"

/**
 * Translate a thrown error into a CLI-friendly message. Structured
 * `I18nSharpenError`s print their kind; unstructured errors fall back
 * to the message.
 */
function reportError(error: unknown): void {
  if (error instanceof I18nSharpenError) {
    log.error(`[${error.error.kind}] ${error.message}`)
  } else {
    log.error((error as Error).message)
  }
}

/**
 * Maps a caught error to the process exit code (D-03, ESLint-style).
 *   2 = tool-fatal (missing dependency/compiler) — user must install a package.
 *   1 = all other caught errors.
 * The i18n-findings path (hasErrors ? 1 : 0) is handled separately per command (D-04).
 * Never calls process.exit() — callers do `process.exitCode = fatalExitCode(e)` (LO-01).
 */
export function fatalExitCode(error: unknown): 1 | 2 {
  if (
    error instanceof I18nSharpenError &&
    error.error.kind === "missing-dependency"
  ) {
    return 2
  }
  return 1
}

// LO-09: read the version dynamically from package.json so it never
// drifts from `npm version` / release tooling. Falls back to "0.0.0"
// if the package.json can't be read (e.g. unusual install layouts).
function readVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    // dist/cli.js → ../package.json
    const candidates = [
      path.resolve(here, "..", "package.json"),
      path.resolve(here, "..", "..", "package.json")
    ]
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        const pkg = JSON.parse(fs.readFileSync(c, "utf8")) as {
          version?: unknown
        }
        if (typeof pkg.version === "string") return pkg.version
      }
    }
  } catch {
    // ignore — fall through to default
  }
  return "0.0.0"
}

// Exported so the test suite can drive the command tree in-process via
// `program.parseAsync(...)`. Not part of the published package surface
// (only `src/index.ts` is exported); `src/cli.ts` is the bin entry.
export const program = new Command()

program
  .name("i18n-sharpen")
  .description(
    "Type-safe, configuration-driven i18n validator, extractor, and pruner CLI tool."
  )
  .version(readVersion())
  .option(
    "-c, --config <path>",
    "Path to configuration file (i18n-sharpen.json)"
  )
  .option("-d, --cwd <path>", "Working directory", process.cwd())

program
  .command("validate")
  .description(
    "Validate translation keys, active placeholders, and cross-locale alignment."
  )
  .option(
    "--check-hardcoded",
    "Check for untranslated hardcoded strings in source code"
  )
  .action(async (cmdOpts: { checkHardcoded?: boolean }) => {
    const opts = program.opts()
    const cwd = typeof opts.cwd === "string" ? opts.cwd : undefined
    const configPath = typeof opts.config === "string" ? opts.config : undefined
    try {
      const config = loadConfig(cwd, configPath)
      const results = await validate(config, cwd, {
        checkHardcoded: !!cmdOpts.checkHardcoded
      })
      const hasErrors =
        results.missingKeys.length > 0 ||
        results.activePlaceholderKeys.length > 0 ||
        results.keysOnlyInLanguages.length > 0 ||
        (cmdOpts.checkHardcoded &&
          results.hardcodedStrings &&
          results.hardcodedStrings.length > 0)
      // LO-01: set exitCode and let Node drain stdout naturally instead
      // of calling process.exit() which can truncate buffered output
      // when stdout is piped.
      process.exitCode = hasErrors ? 1 : 0
    } catch (error) {
      reportError(error)
      process.exitCode = fatalExitCode(error)
    }
  })

program
  .command("extract")
  .description(
    "Extract new translation keys referenced in code and inject them into JSON files."
  )
  .option(
    "--sort <mode>",
    "Override key sorting mode (alpha | source | preserve)"
  )
  .action(async (cmdOpts: { sort?: string }) => {
    const opts = program.opts()
    const cwd = typeof opts.cwd === "string" ? opts.cwd : undefined
    const configPath = typeof opts.config === "string" ? opts.config : undefined
    try {
      const config = loadConfig(cwd, configPath)
      if (cmdOpts.sort) {
        if (
          cmdOpts.sort !== "alpha" &&
          cmdOpts.sort !== "source" &&
          cmdOpts.sort !== "preserve"
        ) {
          throw new Error(
            "Invalid sort mode. Choose from: alpha, source, preserve"
          )
        }
        config.sortKeys = cmdOpts.sort
      }
      await extract(config, cwd)
      process.exitCode = 0
    } catch (error) {
      reportError(error)
      process.exitCode = fatalExitCode(error)
    }
  })

program
  .command("prune")
  .description(
    "Prune unused translation keys from JSON files (dry-run by default; use --force to actually write)."
  )
  .option(
    "--dry-run",
    "Preview only — never write. Default behavior; flag exists for explicit CI scripts.",
    false
  )
  .option("--force", "Actually write the pruned locale files to disk.", false)
  .option(
    "--sort <mode>",
    "Override key sorting mode (alpha | source | preserve)"
  )
  .option(
    "--clean-empty",
    "After pruning (namespaced layout only), delete namespace files that have zero keys. Flat layout files are never deleted.",
    false
  )
  .option(
    "--interactive",
    "Pick which unused keys to prune via an arrow-key TUI (TTY only; non-TTY falls back to dry-run preview).",
    false
  )
  .action(
    async (cmdOpts: {
      dryRun?: boolean
      force?: boolean
      sort?: string
      cleanEmpty?: boolean
      interactive?: boolean
    }) => {
      const opts = program.opts()
      const cwd = typeof opts.cwd === "string" ? opts.cwd : undefined
      const configPath =
        typeof opts.config === "string" ? opts.config : undefined
      try {
        const config = loadConfig(cwd, configPath)
        if (cmdOpts.sort) {
          if (
            cmdOpts.sort !== "alpha" &&
            cmdOpts.sort !== "source" &&
            cmdOpts.sort !== "preserve"
          ) {
            throw new Error(
              "Invalid sort mode. Choose from: alpha, source, preserve"
            )
          }
          config.sortKeys = cmdOpts.sort
        }
        if (cmdOpts.cleanEmpty === true) {
          config.prune = { ...(config.prune ?? {}), cleanEmpty: true }
        }
        await prune(config, cwd, {
          force: cmdOpts.force === true,
          dryRun: cmdOpts.dryRun === true,
          interactive: cmdOpts.interactive === true
        })
        process.exitCode = 0
      } catch (error) {
        reportError(error)
        process.exitCode = fatalExitCode(error)
      }
    }
  )

if (process.env.NODE_ENV !== "test") program.parse(process.argv)
