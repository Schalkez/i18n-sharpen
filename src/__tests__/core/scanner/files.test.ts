import * as fs from "fs"
import * as path from "path"
import { describe, it, expect, afterEach } from "vitest"
import { getFiles, scanSourceFiles } from "@/core/scanner/files"

const created: string[] = []

function makeTree(files: Record<string, string>): string {
  const root = path.resolve(
    __dirname,
    `../../../scratch/files-${Math.random().toString(36).slice(2, 11)}`
  )
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    fs.mkdirSync(path.dirname(abs), { recursive: true })
    fs.writeFileSync(abs, content, "utf8")
  }
  created.push(root)
  return root
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe("files: getFiles", () => {
  it("recurses into subdirectories and matches by extension", () => {
    const root = makeTree({
      "a.ts": "",
      "nested/b.ts": "",
      "nested/deep/c.ts": "",
      "skip.md": ""
    })
    const found = getFiles(root, [".ts"], []).map((p) =>
      path.relative(root, p).replace(/\\/g, "/")
    )
    expect(found.sort()).toEqual(["a.ts", "nested/b.ts", "nested/deep/c.ts"])
  })

  it("skips excluded directories by bare name", () => {
    const root = makeTree({
      "keep.ts": "",
      "node_modules/dep.ts": "",
      "dist/out.ts": ""
    })
    const found = getFiles(root, [".ts"], ["node_modules", "dist"]).map((p) =>
      path.basename(p)
    )
    expect(found).toEqual(["keep.ts"])
  })

  it("returns an empty array for a non-existent directory", () => {
    expect(
      getFiles(path.join(__dirname, "no-such-dir-xyz"), [".ts"], [])
    ).toEqual([])
  })
})

describe("files: scanSourceFiles", () => {
  it("walks every configured scanDir and silently skips missing ones", () => {
    const root = makeTree({ "src/a.ts": "", "lib/b.ts": "" })
    const config = {
      scanDirs: ["src", "lib", "does-not-exist"],
      localesDir: "locales",
      defaultLanguage: "en",
      supportedLanguages: ["en"],
      fileExtensions: [".ts"],
      excludeDirs: []
    }
    const found = scanSourceFiles(config, root).map((p) => path.basename(p))
    expect(found.sort()).toEqual(["a.ts", "b.ts"])
  })
})
