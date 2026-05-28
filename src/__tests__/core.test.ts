import * as fs from "fs"
import * as path from "path"
import { describe, it, expect } from "vitest"
import {
  flattenObject,
  unflattenObject,
  getNestedValue,
  setNestedValue,
  writeLocaleFile,
  readLocaleFile
} from "@/core/locale-io"
import { stripComments, matchWildcard } from "@/core/scanner"

describe("core: object transforms", () => {
  it("should flatten a nested object using dot notation", () => {
    const nested = {
      common: {
        loading: "Loading...",
        dialog: {
          confirm: "OK"
        }
      }
    }
    const flat = flattenObject(nested)
    expect(flat).toEqual({
      "common.loading": "Loading...",
      "common.dialog.confirm": "OK"
    })
  })

  it("should unflatten a dot-notation object back to nested structure", () => {
    const flat = {
      "common.loading": "Loading...",
      "common.dialog.confirm": "OK"
    }
    const nested = unflattenObject(flat)
    expect(nested).toEqual({
      common: {
        loading: "Loading...",
        dialog: {
          confirm: "OK"
        }
      }
    })
  })

  it("should get and set nested values using path keys", () => {
    const obj = {}
    setNestedValue(obj, "user.profile.name", "Alice")
    expect(obj).toEqual({
      user: {
        profile: {
          name: "Alice"
        }
      }
    })
    expect(getNestedValue(obj, "user.profile.name")).toBe("Alice")
    expect(getNestedValue(obj, "user.profile.age")).toBeUndefined()
  })
})

describe("core: stripComments", () => {
  it("should strip code comments correctly", () => {
    const code = `
      // This is a single line comment
      const t = "hello"; /* This is a
      multiline comment */
      const url = "http://example.com"; // another comment
    `
    const clean = stripComments(code)
    expect(clean).toContain('const t = "hello";')
    expect(clean).toContain('const url = "http://example.com";')
    expect(clean).not.toContain("This is a single line comment")
    expect(clean).not.toContain("multiline comment")
  })
})

describe("core: matchWildcard", () => {
  it("should match wildcards correctly", () => {
    expect(matchWildcard("status.*", "status.success")).toBe(true)
    expect(matchWildcard("status.*", "status.failed")).toBe(true)
    expect(matchWildcard("status.*", "other.status.success")).toBe(false)
    expect(matchWildcard("*.success", "status.success")).toBe(true)
    expect(matchWildcard("error.codes.*", "error.codes.404")).toBe(true)
  })
})

describe("core: locale file I/O", () => {
  it("should parse and stringify YAML locale files correctly", () => {
    const tmpYamlFile = path.resolve(
      __dirname,
      "../../scratch/test-temp-lang.yaml"
    )
    const dir = path.dirname(tmpYamlFile)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    const testObj = {
      common: {
        save: "Save Info",
        nested: {
          confirm: "Yes"
        }
      }
    }
    writeLocaleFile(tmpYamlFile, testObj)

    const parsed = readLocaleFile(tmpYamlFile)
    expect(parsed).toEqual(testObj)

    if (fs.existsSync(tmpYamlFile)) {
      fs.unlinkSync(tmpYamlFile)
    }
  })
})
