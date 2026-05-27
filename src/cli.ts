#!/usr/bin/env node
import { Command } from "commander"
import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"
import { loadConfig } from "./config"
import { validate } from "./commands/validate"
import { extract } from "./commands/extract"
import { prune } from "./commands/prune"
import { log } from "./utils"

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
        const pkg = JSON.parse(fs.readFileSync(c, "utf8"))
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
    try {
      const config = loadConfig(opts.cwd)
      const results = validate(config, opts.cwd)
      const hasErrors =
        results.missingKeys.length > 0 ||
        results.activePlaceholderKeys.length > 0 ||
        results.keysOnlyInLanguages.length > 0
      // LO-01: set exitCode and let Node drain stdout naturally instead
      // of calling process.exit() which can truncate buffered output
      // when stdout is piped.
      process.exitCode = hasErrors ? 1 : 0
    } catch (error) {
      log.error((error as Error).message)
      process.exitCode = 1
    }
  })

program
  .command("extract")
  .description(
    "Extract new translation keys referenced in code and inject them into JSON files."
  )
  .action(() => {
    const opts = program.opts()
    try {
      const config = loadConfig(opts.cwd)
      extract(config, opts.cwd)
      process.exitCode = 0
    } catch (error) {
      log.error((error as Error).message)
      process.exitCode = 1
    }
  })

program
  .command("prune")
  .description("Prune unused translation keys from JSON files.")
  .action(() => {
    const opts = program.opts()
    try {
      const config = loadConfig(opts.cwd)
      prune(config, opts.cwd)
      process.exitCode = 0
    } catch (error) {
      log.error((error as Error).message)
      process.exitCode = 1
    }
  })

program.parse(process.argv)
