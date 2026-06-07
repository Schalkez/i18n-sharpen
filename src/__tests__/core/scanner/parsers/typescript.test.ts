import { describe, it, expect } from "vitest"
import { parseTypeScriptFile } from "@/core/scanner/parsers/typescript"

// Helper — parses inline source via the AST parser.
// Default matchFunctions: ["t", "i18n.t"], matchAttributes: ["i18nKey"]
function parse(src: string, file = "test.tsx") {
  return parseTypeScriptFile(
    src,
    file,
    ["t", "i18n.t"],
    ["i18nKey"],
    process.cwd(),
    ["placeholder", "label", "title", "alt", "aria-label"]
  ).result
}

// =============================================================================
// TEST-01: Ported behavioral corpus — PARSE-02 static keys
// =============================================================================
describe("static keys (PARSE-02 parity)", () => {
  it("extracts static string keys from t() calls", () => {
    const src = `
      // t('commented.out')
      const x = t('used.one')
      const y = t("used.two")
      const z = t(\`used.three\`)
      const dyn = t('prefix.' + variable)
    `
    const { usedKeys, dynamicCalls } = parse(src, "test.ts")
    const keys = usedKeys.map((k) => k.key)
    expect(keys).toContain("used.one")
    expect(keys).toContain("used.two")
    expect(keys).toContain("used.three")
    expect(keys).not.toContain("commented.out")
    // 'prefix.' ends with a dot — should be excluded
    expect(keys.some((k) => k.endsWith("."))).toBe(false)
    // Dynamic: 'prefix.' + variable → dynamicCalls with structured-concat
    expect(dynamicCalls.some((d) => d.prefix === "prefix.")).toBe(true)
  })

  it("extracts key from i18n.t() (D-07 namespaced callee)", () => {
    const { usedKeys } = parse('const x = i18n.t("ns.key")', "test.ts")
    expect(usedKeys.map((k) => k.key)).toContain("ns.key")
  })

  it('extracts attribute key from i18nKey="..." (PARSE-03)', () => {
    const { usedKeys } = parse('<h1 i18nKey="title.h">x</h1>')
    expect(usedKeys.map((k) => k.key)).toContain("title.h")
  })

  it("provides document-absolute offsets for keys", () => {
    const { usedKeys } = parse('t("hello")', "test.ts")
    expect(usedKeys).toHaveLength(1)
    expect(usedKeys[0].offset).toBe(0) // call starts at position 0
  })
})

// =============================================================================
// TEST-01: Ported behavioral corpus — PARSE-04 dynamic classification
// =============================================================================
describe("dynamic classification (PARSE-04 parity)", () => {
  it.each([
    ['"error." + code', "structured-concat", "error."],
    ["`error.${code}`", "structured-concat", "error."],
    ['"a." + x + ".b"', "structured-concat", "a."],
    ["`error.${code}.detail`", "structured-concat", "error."],
    ['"e." + x', "structured-concat", "e."],
    ["'error.' + x", "structured-concat", "error."],
    ['"error." + code, { option: true }', "structured-concat", "error."]
  ])(
    "classifies t(%s) as %s with prefix %s",
    (argExpr, expectedKind, expectedPrefix) => {
      const { dynamicCalls } = parse(`t(${argExpr})`, "test.ts")
      expect(dynamicCalls).toHaveLength(1)
      expect(dynamicCalls[0].classification).toBe(expectedKind)
      expect(dynamicCalls[0].prefix).toBe(expectedPrefix)
    }
  )

  it.each([
    ["myVar"],
    ["getKey()"],
    ["obj.method()"],
    ["`${prefix}.error`"],
    ['cond ? "a" : "b"']
  ])("classifies t(%s) as fully-dynamic", (argExpr) => {
    const { dynamicCalls } = parse(`t(${argExpr})`, "test.ts")
    expect(dynamicCalls).toHaveLength(1)
    expect(dynamicCalls[0].classification).toBe("fully-dynamic")
    expect(dynamicCalls[0].prefix).toBeUndefined()
  })
})

// =============================================================================
// TEST-01: Ported behavioral corpus — PARSE-05 hardcoded text candidates
// =============================================================================
describe("hardcoded text candidates (PARSE-05 parity)", () => {
  it("extracts basic text node with offset", () => {
    const { hardcodedCandidates } = parse("<div>Hello World</div>")
    expect(hardcodedCandidates).toContainEqual({
      text: "Hello World",
      offset: 5
    })
  })

  it("extracts multiple text nodes with offsets", () => {
    const { hardcodedCandidates } = parse(
      "<div>Hello <span>World</span>!</div>"
    )
    expect(hardcodedCandidates).toContainEqual({ text: "Hello", offset: 5 })
    expect(hardcodedCandidates).toContainEqual({ text: "World", offset: 17 })
    // RAW emission — D-11: parser does NOT filter punctuation
    expect(hardcodedCandidates).toContainEqual({ text: "!", offset: 29 })
  })

  it("trims and keeps correct offset", () => {
    expect(parse("<div>  Trim Me  </div>").hardcodedCandidates).toContainEqual({
      text: "Trim Me",
      offset: 7
    })
  })

  it("extracts static string in JSX expression", () => {
    expect(
      parse("<div>{'Welcome to App'}</div>").hardcodedCandidates
    ).toContainEqual({ text: "Welcome to App", offset: 7 })
  })

  it("extracts allowlisted attribute values", () => {
    const src = `<input placeholder="Enter your name" />`
    const { hardcodedCandidates } = parse(src)
    expect(hardcodedCandidates).toContainEqual({
      text: "Enter your name",
      offset: 20
    })
  })

  it("does NOT extract non-allowlisted attributes as hardcoded", () => {
    const src = `<input type="text" name="user" />`
    const texts = parse(src).hardcodedCandidates.map((c) => c.text)
    expect(texts).not.toContain("text")
    expect(texts).not.toContain("user")
  })

  it("GAP-01: extracts all allowlisted attribute values", () => {
    const src = `<input placeholder="P" label="L" title="T" alt="A" aria-label="AL" />`
    const texts = parse(src).hardcodedCandidates.map((c) => c.text)
    expect(texts).toContain("P")
    expect(texts).toContain("L")
    expect(texts).toContain("T")
    expect(texts).toContain("A")
    expect(texts).toContain("AL")
  })

  it("GAP-02: ignores dynamic attribute expressions", () => {
    const src = `<input placeholder={t("name")} label={myLabel} />`
    expect(parse(src).hardcodedCandidates).toHaveLength(0)
  })

  it("GAP-03: extracts multiple JSX string expressions", () => {
    const src = `<div>{'Welcome'} and {"Goodbye"} and {\`Hello\`}</div>`
    const texts = parse(src).hardcodedCandidates.map((c) => c.text)
    expect(texts).toContain("Welcome")
    expect(texts).toContain("Goodbye")
    expect(texts).toContain("Hello")
  })

  it("GAP-04: handles brace and comment inside a JSX string expression", () => {
    const src = `<div>{ /* comment */ 'Welcome }' }</div>`
    const texts = parse(src).hardcodedCandidates.map((c) => c.text)
    expect(texts).toContain("Welcome }")
  })

  it("GAP-05: ignores dynamic or complex JSX expressions", () => {
    const src = `<div>{t("key")}</div><div>{"Hello " + user}</div><div>{1 + 2}</div>`
    expect(parse(src).hardcodedCandidates).toHaveLength(0)
  })

  it("GAP-06: ignores comment region and extracts sibling real text", () => {
    const src = `<>{/* leading */}<div>Keep Me</div></>`
    const texts = parse(src).hardcodedCandidates.map((c) => c.text)
    expect(texts).toContain("Keep Me")
    expect(texts).not.toContain("leading")
  })

  it("GAP-07: ignores comparison operator in attribute expression but extracts inner text", () => {
    const src = `<div title={x > 0}>hello</div>`
    const texts = parse(src).hardcodedCandidates.map((c) => c.text)
    expect(texts).toContain("hello")
    expect(
      texts.some((t) => t.includes("x > 0") || t.includes("x &gt; 0"))
    ).toBe(false)
  })

  it("GAP-08: extracts text from nested JSX element inside an expression", () => {
    const src = `<div>{isActive && <span>Hello</span>}</div>`
    const texts = parse(src).hardcodedCandidates.map((c) => c.text)
    expect(texts).toContain("Hello")
  })
})

// =============================================================================
// SKIP_TAGS (PARSE-05)
// =============================================================================
describe("SKIP_TAGS (PARSE-05)", () => {
  it("excludes text inside skip-tagged elements", () => {
    const src = `<script>const a = "Ignore me"</script><div>Keep Me</div>`
    const texts = parse(src).hardcodedCandidates.map((c) => c.text)
    expect(texts).toContain("Keep Me")
    expect(texts).not.toContain("Ignore me")
  })

  it("excludes all SKIP_TAGS", () => {
    const src = `
      <style>.x { color: red; }</style>
      <code>Some Code</code>
      <pre>Preformatted</pre>
      <svg><path d="M0 0" /></svg>
      <noscript>No JS</noscript>
      <iframe>Frame</iframe>
      <div>Keep Me</div>
    `
    const texts = parse(src).hardcodedCandidates.map((c) => c.text)
    expect(texts).toContain("Keep Me")
    expect(texts).not.toContain("Some Code")
    expect(texts).not.toContain("Preformatted")
    expect(texts).not.toContain("No JS")
    expect(texts).not.toContain("Frame")
  })
})

// =============================================================================
// Golden Cases — the rewrite's motivating bugs
// =============================================================================
describe("golden cases", () => {
  it("TEST-02: <m.div> member-expression tag keeps inner text", () => {
    const { hardcodedCandidates } = parse("<m.div>Hello world</m.div>")
    expect(hardcodedCandidates).toContainEqual({
      text: "Hello world",
      offset: 7
    })
  })

  it("TEST-02: <motion.div> member-expression tag keeps inner text", () => {
    const { hardcodedCandidates } = parse(
      "<motion.div>Animated text</motion.div>"
    )
    expect(hardcodedCandidates).toContainEqual({
      text: "Animated text",
      offset: 12
    })
  })

  it("TEST-03: forwardRef<A,B> generics produce no spurious extraction", () => {
    const src = `const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
      <input placeholder="Email" ref={ref} />
    ))`
    const { usedKeys, hardcodedCandidates } = parse(src, "test.tsx")
    expect(usedKeys).toHaveLength(0)
    const texts = hardcodedCandidates.map((c) => c.text)
    expect(texts).not.toContain("HTMLInputElement")
    expect(texts).not.toContain("InputProps")
    expect(texts).toContain("Email")
  })
})

// =============================================================================
// D-08: AST-only gains — expression-container attribute values
// These are DELIBERATE GAINS over the regex engine. They must be documented
// for the Phase 5 corpus diff — they are never false-negatives.
// =============================================================================
describe("D-08 AST-only gain", () => {
  it('GAIN: i18nKey={"x"} expression-container literal is extracted', () => {
    expect(
      parse('<h1 i18nKey={"hero.title"} />').usedKeys.map((k) => k.key)
    ).toContain("hero.title")
  })

  it("GAIN: i18nKey={`x`} template-container literal is extracted", () => {
    expect(
      parse("<h1 i18nKey={`hero.title`} />").usedKeys.map((k) => k.key)
    ).toContain("hero.title")
  })
})

// =============================================================================
// Namespace Scoped Hooks (useTranslations, useNamespace, useTranslation)
// =============================================================================
describe("Namespace Scoped Hooks", () => {
  it("extracts keys with namespace prepended for useTranslations hook", () => {
    const src = `
      const t = useTranslations('auth');
      t('signIn');
      t('signUp');
    `
    const { usedKeys } = parse(src, "test.ts")
    const keys = usedKeys.map((k) => k.key)
    expect(keys).toContain("auth.signIn")
    expect(keys).toContain("auth.signUp")
  })

  it("extracts keys with namespace prepended for useNamespace hook", () => {
    const src = `
      const t = useNamespace('common.errors');
      t('notFound');
    `
    const { usedKeys } = parse(src, "test.ts")
    const keys = usedKeys.map((k) => k.key)
    expect(keys).toContain("common.errors.notFound")
  })

  it("extracts keys with namespace prepended for destructured useTranslation hook", () => {
    const src = `
      const { t } = useTranslation('auth');
      t('signIn');
    `
    const { usedKeys } = parse(src, "test.ts")
    const keys = usedKeys.map((k) => k.key)
    expect(keys).toContain("auth.signIn")
  })

  it("supports multiple namespaces in the same file", () => {
    const src = `
      const tAuth = useTranslations('auth');
      const tCommon = useTranslations('common');
      tAuth('login');
      tCommon('cancel');
    `
    const { usedKeys } = parse(src, "test.ts")
    const keys = usedKeys.map((k) => k.key)
    expect(keys).toContain("auth.login")
    expect(keys).toContain("common.cancel")
  })

  it("handles structured-concat dynamic keys with namespace prefix", () => {
    const src = `
      const t = useTranslations('auth');
      t('error.' + code);
    `
    const { dynamicCalls } = parse(src, "test.ts")
    expect(dynamicCalls).toHaveLength(1)
    expect(dynamicCalls[0].classification).toBe("structured-concat")
    expect(dynamicCalls[0].prefix).toBe("auth.error.")
  })
})
