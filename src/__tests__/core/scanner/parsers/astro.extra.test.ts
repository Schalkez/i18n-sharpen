import { describe, it, expect } from "vitest"
import { parseAstroFile } from "@/core/scanner/parsers/astro"

const cwd = process.cwd()

describe("Astro Parser: attributes, expressions and skip tags", () => {
  it("extracts quoted + expression attributes and frontmatter, skipping <script>", async () => {
    const src = `---
const greeting = t("astro.front")
---
<main>
  <h1 i18nKey="astro.heading">Hello world</h1>
  <button title={t("astro.expr.attr")}>Click</button>
  <script>const s = t("astro.script.key")</script>
</main>`

    const { result } = await parseAstroFile(
      src,
      "demo.astro",
      ["t"],
      ["i18nKey"],
      cwd
    )

    const keys = result.usedKeys.map((k) => k.key).sort()
    expect(keys).toEqual(["astro.expr.attr", "astro.front", "astro.heading"])
    // <script> is a skip tag → its t() call is NOT extracted.
    expect(keys).not.toContain("astro.script.key")
  })

  it("extracts t() calls from body expression nodes ({...})", async () => {
    const src = `<main>
  <p>{t("astro.body.expr")}</p>
</main>`
    const { result } = await parseAstroFile(
      src,
      "expr.astro",
      ["t"],
      ["i18nKey"],
      cwd
    )
    expect(result.usedKeys.map((k) => k.key)).toContain("astro.body.expr")
  })

  it("flags hardcoded text nodes", async () => {
    const src = `<main><p>Untranslated paragraph</p></main>`
    const { result } = await parseAstroFile(
      src,
      "text.astro",
      ["t"],
      ["i18nKey"],
      cwd
    )
    expect(result.hardcodedCandidates.map((h) => h.text)).toContain(
      "Untranslated paragraph"
    )
  })
})
