import { describe, it, expect } from "vitest"
import { parseVueFile } from "@/core/scanner/parsers/vue"

const cwd = process.cwd()

describe("Vue Parser: template walker", () => {
  it("extracts keys from attributes, v-bind/directives, interpolation and flags hardcoded text", async () => {
    const src = `<template>
  <div>
    <h1 :title="'vue.attr.title'">{{ $t('vue.interp') }}</h1>
    <span v-t="'vue.directive'">x</span>
    <p>Hardcoded vue text</p>
    <Holder i18nKey="vue.static.attr" />
    <style>.a { color: red }</style>
  </div>
</template>`

    const { result } = await parseVueFile(
      src,
      "demo.vue",
      ["t", "$t"],
      ["i18nKey", ":title", "v-t"],
      cwd
    )

    const keys = result.usedKeys.map((k) => k.key).sort()
    expect(keys).toEqual([
      "vue.attr.title",
      "vue.directive",
      "vue.interp",
      "vue.static.attr"
    ])

    const hardcoded = result.hardcodedCandidates.map((h) => h.text)
    expect(hardcoded).toContain("Hardcoded vue text")
  })

  it("collects template compile errors without throwing (unclosed tag)", async () => {
    // Missing </div> end tag → @vue/compiler-sfc reports an SFC parse error.
    const src = `<template><div></template>`
    const { errors } = await parseVueFile(
      src,
      "broken-template.vue",
      ["t"],
      ["i18nKey"],
      cwd
    )
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].file).toBe("broken-template.vue")
  })
})
