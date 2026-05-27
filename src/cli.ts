#!/usr/bin/env node
import { Command } from "commander"
import { loadConfig } from "./config"
import { validate } from "./commands/validate"
import { extract } from "./commands/extract"
import { prune } from "./commands/prune"
import { log } from "./utils"

const program = new Command()

program
  .name("i18n-sharpen")
  .description(
    "Type-safe, configuration-driven i18n validator, extractor, and pruner CLI tool."
  )
  .version("0.1.0")
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
      if (hasErrors) {
        process.exit(1)
      }
      process.exit(0)
    } catch (error) {
      log.error((error as Error).message)
      process.exit(1)
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
      process.exit(0)
    } catch (error) {
      log.error((error as Error).message)
      process.exit(1)
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
      process.exit(0)
    } catch (error) {
      log.error((error as Error).message)
      process.exit(1)
    }
  })

program.parse(process.argv)
