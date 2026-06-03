import { detectUsedKeys } from "@/core/scanner";
import * as fs from "fs/promises";
import * as path from "path";

const WARMUP = 3;
const N = 10;
const THRESHOLD_MS = 100;

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

async function timeEngine(files: string[], useAst: boolean): Promise<number[]> {
  const matchFunctions = ["t"];
  const matchAttributes = ["i18nKey"];
  const cwd = process.cwd();

  for (let i = 0; i < WARMUP; i++) {
    await detectUsedKeys(files, matchFunctions, matchAttributes, { cwd, useAst });
  }

  const durations: number[] = [];
  for (let i = 0; i < N; i++) {
    const start = performance.now();
    await detectUsedKeys(files, matchFunctions, matchAttributes, { cwd, useAst });
    durations.push(performance.now() - start);
  }

  return durations;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function main() {
  const cwd = process.cwd();
  const corpusDir = path.join(cwd, "tests", "corpus");
  const fixturesDir = path.join(cwd, "src", "__tests__", "parsers", "fixtures");

  const [corpusFiles, fixtureFiles] = await Promise.all([
    walkDir(corpusDir),
    walkDir(fixturesDir)
  ]);

  const allFiles = [...corpusFiles, ...fixtureFiles];
  const slice = allFiles.sort().slice(0, 50);

  console.log(`[bench] Selected deterministic slice of ${slice.length} files (from total ${allFiles.length}).`);

  if (slice.length === 0) {
    console.warn("[bench] WARNING: No files found to benchmark.");
    return;
  }

  console.log(`[bench] Timing Regex engine (warmup=${WARMUP}, N=${N})...`);
  const regexDurations = await timeEngine(slice, false);
  const regexMedian = median(regexDurations);

  console.log(`[bench] Timing AST engine (warmup=${WARMUP}, N=${N})...`);
  const astDurations = await timeEngine(slice, true);
  const astMedian = median(astDurations);

  const delta = astMedian - regexMedian;

  console.log("\n=== PERFORMANCE GATE RESULTS ===");
  console.log(`Regex Median : ${regexMedian.toFixed(2)}ms`);
  console.log(`AST Median   : ${astMedian.toFixed(2)}ms`);
  console.log(`Delta        : ${delta > 0 ? "+" : ""}${delta.toFixed(2)}ms`);
  console.log(`Threshold    : +${THRESHOLD_MS}ms max regression`);
  console.log("================================");

  if (delta > THRESHOLD_MS) {
    console.error(`\nFAIL: AST engine is ${delta.toFixed(2)}ms slower than Regex, exceeding the ${THRESHOLD_MS}ms budget!`);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS: AST engine meets performance budget (delta: ${delta.toFixed(2)}ms).`);
  }
}

main().catch((err) => {
  console.error("Fatal error running benchmark:", err);
  process.exitCode = 1;
});
