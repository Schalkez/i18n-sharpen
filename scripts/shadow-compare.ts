import { detectUsedKeys } from "@/core/scanner";
import * as fs from "fs/promises";
import * as path from "path";

async function walkDir(dir: string, fileList: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      return fileList;
    }
    throw e;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, fileList);
    } else {
      const ext = path.extname(entry.name);
      // Include typical source extensions, exclude SOURCES.md
      if (
        (ext === ".ts" || ext === ".tsx" || ext === ".js" || ext === ".jsx" || ext === ".vue" || ext === ".svelte" || ext === ".astro") &&
        entry.name !== "SOURCES.md"
      ) {
        fileList.push(fullPath);
      }
    }
  }
  return fileList;
}

async function main() {
  const cwd = process.cwd();
  const corpusDir = path.join(cwd, "tests", "corpus");
  const fixturesDir = path.join(cwd, "src", "__tests__", "parsers", "fixtures");

  const [corpusFiles, fixtureFiles] = await Promise.all([
    walkDir(corpusDir),
    walkDir(fixturesDir)
  ]);

  const files = [...corpusFiles, ...fixtureFiles];

  console.log(`[shadow] Found ${files.length} source files to scan.`);

  if (files.length === 0) {
    console.warn("[shadow] WARNING: No files found to scan.");
    return;
  }

  const matchFunctions = ["t"];
  const matchAttributes = ["i18nKey"];

  console.log("[shadow] Running Regex and AST engines concurrently...");
  
  const startTime = performance.now();
  const [regexResult, astResult] = await Promise.all([
    detectUsedKeys(files, matchFunctions, matchAttributes, { cwd, useAst: false }),
    detectUsedKeys(files, matchFunctions, matchAttributes, { cwd, useAst: true })
  ]);
  const duration = performance.now() - startTime;

  console.log(`[shadow] Scan completed in ${duration.toFixed(2)}ms.`);

  const regexKeys = [...regexResult.usedKeys];
  const astKeys = [...astResult.usedKeys];

  const falseNegatives = regexKeys.filter((k) => !astResult.usedKeys.has(k)).sort();
  const astOnlyGains = astKeys.filter((k) => !regexResult.usedKeys.has(k)).sort();

  const report = {
    regexKeys: regexKeys.length,
    astKeys: astKeys.length,
    falseNegatives: falseNegatives.length,
    astOnlyGains: astOnlyGains.length,
    parseErrors: astResult.parseErrors.length,
    details: {
      falseNegatives,
      astOnlyGains,
      parseErrors: astResult.parseErrors
    }
  };

  const scratchDir = path.join(cwd, "scratch");
  await fs.mkdir(scratchDir, { recursive: true });
  const reportPath = path.join(scratchDir, "shadow-report.json");
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), "utf-8");

  console.log("");
  console.log("=== SHADOW COMPARE REPORT ===");
  console.log(`Regex Engine Keys : ${report.regexKeys}`);
  console.log(`AST Engine Keys   : ${report.astKeys}`);
  console.log(`Parse Errors      : ${report.parseErrors} (Deferred to STRICT-01)`);
  console.log(`AST-Only Gains    : ${report.astOnlyGains} (Upside, non-blocking)`);
  console.log(`False Negatives   : ${report.falseNegatives} (Hard block if > 0)`);
  console.log("=============================");
  console.log(`Report written to ${reportPath}`);
  console.log("");

  if (report.regexKeys === 0) {
    console.warn("[shadow] WARNING: Regex engine found 0 keys! The corpus might not trigger extraction.");
  }

  if (report.falseNegatives > 0) {
    console.error("FAIL: AST engine missed keys that Regex found.");
    console.error("Missing keys:", falseNegatives);
    process.exitCode = 1;
  } else {
    console.log("PASS: Zero false-negatives. AST engine matches or exceeds Regex coverage.");
  }
}

main().catch((err) => {
  console.error("Fatal error running shadow compare:", err);
  process.exitCode = 1;
});
