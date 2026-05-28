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

const program = new Command()

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
  .action(() => {
    const opts = program.opts()
    const cwd = typeof opts.cwd === "string" ? opts.cwd : undefined
    const configPath = typeof opts.config === "string" ? opts.config : undefined
    try {
      const config = loadConfig(cwd, configPath)
      const results = validate(config, cwd)
      const hasErrors =
        results.missingKeys.length > 0 ||
        results.activePlaceholderKeys.length > 0 ||
        results.keysOnlyInLanguages.length > 0
      // LO-01: set exitCode and let Node drain stdout naturally instead
      // of calling process.exit() which can truncate buffered output
      // when stdout is piped.
      process.exitCode = hasErrors ? 1 : 0
    } catch (error) {
      reportError(error)
      process.exitCode = 1
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
  .action((cmdOpts: { sort?: string }) => {
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
      extract(config, cwd)
      process.exitCode = 0
    } catch (error) {
      reportError(error)
      process.exitCode = 1
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
  .action(
    (cmdOpts: {
      dryRun?: boolean
      force?: boolean
      sort?: string
      cleanEmpty?: boolean
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
        prune(config, cwd, {
          force: cmdOpts.force === true,
          dryRun: cmdOpts.dryRun === true
        })
        process.exitCode = 0
      } catch (error) {
        reportError(error)
        process.exitCode = 1
      }
    }
  )

program.parse(process.argv)
