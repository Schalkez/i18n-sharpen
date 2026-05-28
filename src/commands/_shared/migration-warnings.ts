import pc from "picocolors"
import type { I18nSharpenConfig } from "@/types"
import { log } from "@/utils"

/**
 * D-08: When namespaced layout users haven't set `defaultNamespace` and
 * still have legacy `default.{json,yaml}` files without a `common.*`
 * sibling, emit a one-shot migration warning. Never auto-renames.
 *
 * @param config            The loaded config object.
 * @param localeNamespaces  loadNamespacedLocales().localeNamespaces —
 *                          Record<lang, Record<nsName, filePath>>.
 */
export function warnLegacyDefaultNamespace(
  config: I18nSharpenConfig,
  localeNamespaces: Record<string, Record<string, string | undefined>>
): void {
  if (config.localesLayout !== "namespaced") return
  if (config.defaultNamespace !== undefined) return

  const affectedLangs: string[] = []
  const TRIGGERING_EXTS = [".json", ".yaml", ".yml"]
  for (const [lang, nsMap] of Object.entries(localeNamespaces)) {
    const defaultPath = nsMap.default
    const hasCommon = "common" in nsMap
    if (defaultPath === undefined) continue
    // D-08 only triggers for JSON/YAML default files. Skip JS/TS variants
    // (default.ts/default.js/default.cjs/default.mjs/default.tsx) — those
    // are loadable but never WRITTEN by i18n-sharpen, so they don't
    // participate in the migration.
    const dotIdx = defaultPath.lastIndexOf(".")
    if (dotIdx === -1) continue
    const ext = defaultPath.slice(dotIdx).toLowerCase()
    if (!TRIGGERING_EXTS.includes(ext)) continue
    if (!hasCommon) affectedLangs.push(lang)
  }
  if (affectedLangs.length === 0) return

  log.warn(
    `Found legacy "${pc.yellow("default")}" namespace file(s) in: ${affectedLangs.map((l) => pc.cyan(l)).join(", ")}.\n` +
      `v0.3.0 changed the default namespace name from "default" to "common".\n` +
      `Either:\n` +
      `  (a) set 'defaultNamespace: "default"' in your config to keep legacy behavior, or\n` +
      `  (b) rename <lang>/default.{json,yaml} → <lang>/common.{json,yaml}.\n` +
      `See CHANGELOG.md v0.3.0 BREAKING entry for details.`
  )
}
