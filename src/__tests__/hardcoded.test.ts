import fc from "fast-check"
import { describe, it, expect } from "vitest"
import {
  scanTemplateTextNodes,
  isHardcodedIgnored
} from "@/core/scanner/hardcoded"

describe("scanTemplateTextNodes", () => {
  it("extracts basic text nodes between HTML tags", () => {
    const html = "<div>Hello World</div>"
    const result = scanTemplateTextNodes(html)
    expect(result).toEqual([{ text: "Hello World", offset: 5 }])
  })

  it("extracts multiple text nodes with correct offsets", () => {
    const html = "<div>Hello <span>World</span>!</div>"
    const result = scanTemplateTextNodes(html)
    expect(result).toEqual([
      { text: "Hello", offset: 5 },
      { text: "World", offset: 17 },
      { text: "!", offset: 29 } // We'll test ignores on "!" in isHardcodedIgnored tests
    ])
  })

  it("handles whitespace and trims candidates while maintaining correct offset", () => {
    const html = "<div>  Trim Me  </div>"
    const result = scanTemplateTextNodes(html)
    expect(result).toEqual([{ text: "Trim Me", offset: 7 }])
  })

  it("extracts user-visible attributes with static string literals", () => {
    const html = `<input placeholder="Enter your name" label='First Name' alt="Avatar" title="Tooltip" aria-label="Submit Form" />`
    const result = scanTemplateTextNodes(html)

    // Sort by offset to be deterministic
    const sorted = [...result].sort((a, b) => a.offset - b.offset)
    expect(sorted).toEqual([
      { text: "Enter your name", offset: html.indexOf("Enter your name") },
      { text: "First Name", offset: html.indexOf("First Name") },
      { text: "Avatar", offset: html.indexOf("Avatar") },
      { text: "Tooltip", offset: html.indexOf("Tooltip") },
      { text: "Submit Form", offset: html.indexOf("Submit Form") }
    ])
  })

  it("ignores non-text attributes or attributes with dynamic expressions", () => {
    const html = `<input type="text" name="user" placeholder={t("name")} label={myLabel} />`
    const result = scanTemplateTextNodes(html)
    expect(result).toEqual([])
  })

  it("extracts simple JSX/template string literals inside expressions", () => {
    const jsx =
      "<div>{'Welcome to App'} and { \"Goodbye\" } and {`Hello`}</div>"
    const result = scanTemplateTextNodes(jsx)
    expect(result).toEqual([
      { text: "Welcome to App", offset: jsx.indexOf("Welcome to App") },
      { text: "and", offset: jsx.indexOf("and") },
      { text: "Goodbye", offset: jsx.indexOf("Goodbye") },
      { text: "and", offset: jsx.lastIndexOf("and") },
      { text: "Hello", offset: jsx.indexOf("Hello") }
    ])
  })

  it("ignores dynamic or complex JSX expressions", () => {
    const jsx = `
      <div>{t("key")}</div>
      <div>{"Hello " + user}</div>
      <div>{1 + 2}</div>
      <div>{isActive ? "Yes" : "No"}</div>
    `
    const result = scanTemplateTextNodes(jsx)
    expect(result).toEqual([])
  })

  it("ignores script, style, code, pre, svg, and comment blocks", () => {
    const content = `
      <script>
        const x = "Ignore script content";
      </script>
      <style>
        .class { content: "Ignore style content"; }
      </style>
      <code>Some Code Snippet</code>
      <pre>Formatted pre block</pre>
      <svg><path d="M 10 10 L 20 20" /></svg>
      <!-- HTML comments should be skipped entirely -->
      <div>Keep Me</div>
    `
    const result = scanTemplateTextNodes(content)
    expect(result).toEqual([
      { text: "Keep Me", offset: content.indexOf("Keep Me") }
    ])
  })
})

describe("isHardcodedIgnored", () => {
  it("ignores punctuation-only strings", () => {
    expect(isHardcodedIgnored("::")).toBe(true)
    expect(isHardcodedIgnored("---")).toBe(true)
    expect(isHardcodedIgnored("&bull;")).toBe(true)
    expect(isHardcodedIgnored("|")).toBe(true)
    expect(isHardcodedIgnored("!")).toBe(true)
  })

  it("ignores numbers-only strings and numeric/percentage values", () => {
    expect(isHardcodedIgnored("123")).toBe(true)
    expect(isHardcodedIgnored("45.6%")).toBe(true)
    expect(isHardcodedIgnored("1,000")).toBe(true)
    expect(isHardcodedIgnored("-99")).toBe(true)
  })

  it("does NOT ignore acronyms or uppercase UI strings by default", () => {
    expect(isHardcodedIgnored("OK")).toBe(false)
    expect(isHardcodedIgnored("SAVE")).toBe(false)
    expect(isHardcodedIgnored("HTML")).toBe(false)
    expect(isHardcodedIgnored("API")).toBe(false)
  })

  it("ignores custom string literals if configured", () => {
    const customIgnores = ["HTML", "API", "^[0-9]+\\.[0-9]+\\.[0-9]+$"]
    expect(isHardcodedIgnored("HTML", customIgnores)).toBe(true)
    expect(isHardcodedIgnored("API", customIgnores)).toBe(true)
    expect(isHardcodedIgnored("1.0.0", customIgnores)).toBe(true)

    // Normal text still not ignored
    expect(isHardcodedIgnored("OK", customIgnores)).toBe(false)
    expect(isHardcodedIgnored("Hello", customIgnores)).toBe(false)
  })
})

describe("scanTemplateTextNodes properties (fast-check)", () => {
  it("never throws exception on arbitrary random template contents", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(() => scanTemplateTextNodes(s)).not.toThrow()
      })
    )
  })
})
