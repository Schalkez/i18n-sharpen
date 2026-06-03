import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { I18nSharpenError } from "@/core/errors"
import { writeLocaleFilesAtomic, type WriteLocalePlan } from "@/core/locale-io"

describe("writeLocaleFilesAtomic", () => {
  let tempDir: string

  function getTempDir(): string {
    return path.resolve(
      __dirname,
      `../../scratch/temp-atomic-${Math.random().toString(36).slice(2, 11)}`
    )
  }

  beforeEach(() => {
    tempDir = getTempDir()
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("writes files successfully on happy path and cleans up .tmp files", () => {
    const plans: WriteLocalePlan[] = [
      {
        filePath: path.join(tempDir, "en.json"),
        nestedJson: { greeting: "hello" }
      },
      {
        filePath: path.join(tempDir, "fr.json"),
        nestedJson: { greeting: "bonjour" }
      },
      {
        filePath: path.join(tempDir, "de.yaml"),
        nestedJson: { greeting: "hallo" }
      }
    ]

    writeLocaleFilesAtomic(plans)

    for (const plan of plans) {
      expect(fs.existsSync(plan.filePath)).toBe(true)
      expect(fs.existsSync(`${plan.filePath}.tmp`)).toBe(false)
    }

    const enContent = JSON.parse(
      fs.readFileSync(plans[0].filePath, "utf8")
    ) as Record<string, unknown>
    expect(enContent).toEqual({ greeting: "hello" })

    const frContent = JSON.parse(
      fs.readFileSync(plans[1].filePath, "utf8")
    ) as Record<string, unknown>
    expect(frContent).toEqual({ greeting: "bonjour" })

    const deContent = fs.readFileSync(plans[2].filePath, "utf8")
    expect(deContent).toContain("greeting: hallo")
  })

  it("does nothing with empty plans array", () => {
    expect(() => {
      writeLocaleFilesAtomic([])
    }).not.toThrow()
  })

  it("cleans up all .tmp files and does not modify originals if Phase A fails", () => {
    const file1 = path.join(tempDir, "en.json")
    const file2 = path.join(tempDir, "non_existent_folder", "fr.json")
    const file3 = path.join(tempDir, "de.json")

    // Create a pre-existing original for file 1 to check it is not modified
    fs.writeFileSync(file1, JSON.stringify({ original: "val" }), "utf8")

    const plans: WriteLocalePlan[] = [
      { filePath: file1, nestedJson: { greeting: "hello" } },
      { filePath: file2, nestedJson: { greeting: "bonjour" } },
      { filePath: file3, nestedJson: { greeting: "hallo" } }
    ]

    let thrownError: unknown = null
    try {
      writeLocaleFilesAtomic(plans)
    } catch (err) {
      thrownError = err
    }

    expect(thrownError).toBeInstanceOf(I18nSharpenError)
    const err = thrownError as I18nSharpenError
    expect(err.error.kind).toBe("filesystem")
    expect(err.message).toContain("Phase A")
    expect(err.message).toContain("No original files were modified")

    // File 1 original remains unchanged
    const file1Content = JSON.parse(fs.readFileSync(file1, "utf8")) as Record<
      string,
      unknown
    >
    expect(file1Content).toEqual({ original: "val" })

    // No .tmp files should remain on disk
    expect(fs.existsSync(`${file1}.tmp`)).toBe(false)
    expect(fs.existsSync(`${file2}.tmp`)).toBe(false)
    expect(fs.existsSync(`${file3}.tmp`)).toBe(false)
  })

  it("leaves remaining .tmp files on disk and does not roll back if Phase B fails", () => {
    const file1 = path.join(tempDir, "en.json")
    const file2 = path.join(tempDir, "fr.json")
    const file3 = path.join(tempDir, "de.json")

    fs.writeFileSync(file1, JSON.stringify({ original: "val1" }), "utf8")
    // Make file2 a non-empty directory so renameSync fails
    fs.mkdirSync(file2)
    fs.writeFileSync(path.join(file2, "blocker.txt"), "x", "utf8")
    fs.writeFileSync(file3, JSON.stringify({ original: "val3" }), "utf8")

    const plans: WriteLocalePlan[] = [
      { filePath: file1, nestedJson: { greeting: "hello" } },
      { filePath: file2, nestedJson: { greeting: "bonjour" } },
      { filePath: file3, nestedJson: { greeting: "hallo" } }
    ]

    let thrownError: unknown = null
    try {
      writeLocaleFilesAtomic(plans)
    } catch (err) {
      thrownError = err
    }

    expect(thrownError).toBeInstanceOf(I18nSharpenError)
    const err = thrownError as I18nSharpenError
    expect(err.error.kind).toBe("filesystem")
    expect(err.message).toContain("Phase B")
    expect(err.message).toContain("Committed files (already renamed)")
    expect(err.message).toContain("Pending .tmp files remaining on disk")

    // File 1 rename succeeded (overwritten)
    const file1Content = JSON.parse(fs.readFileSync(file1, "utf8")) as Record<
      string,
      unknown
    >
    expect(file1Content).toEqual({ greeting: "hello" })
    expect(fs.existsSync(`${file1}.tmp`)).toBe(false)

    // File 2 rename failed (original remains a directory, .tmp remains)
    expect(fs.statSync(file2).isDirectory()).toBe(true)
    expect(fs.existsSync(`${file2}.tmp`)).toBe(true)

    // File 3 rename never attempted (original unchanged, .tmp remains)
    const file3Content = JSON.parse(fs.readFileSync(file3, "utf8")) as Record<
      string,
      unknown
    >
    expect(file3Content).toEqual({ original: "val3" })
    expect(fs.existsSync(`${file3}.tmp`)).toBe(true)
  })

  it("refuses to write JS/TS locale files and cleans up any written .tmp files", () => {
    const plans: WriteLocalePlan[] = [
      {
        filePath: path.join(tempDir, "en.json"),
        nestedJson: { greeting: "hello" }
      },
      {
        filePath: path.join(tempDir, "fr.ts"),
        nestedJson: { greeting: "bonjour" }
      },
      {
        filePath: path.join(tempDir, "de.json"),
        nestedJson: { greeting: "hallo" }
      }
    ]

    expect(() => {
      writeLocaleFilesAtomic(plans)
    }).toThrow(/Refusing to write JS\/TS locale file/)

    // No .tmp files should survive
    expect(fs.existsSync(path.join(tempDir, "en.json.tmp"))).toBe(false)
    expect(fs.existsSync(path.join(tempDir, "fr.ts.tmp"))).toBe(false)
    expect(fs.existsSync(path.join(tempDir, "de.json.tmp"))).toBe(false)
    expect(fs.existsSync(path.join(tempDir, "en.json"))).toBe(false)
  })
})
