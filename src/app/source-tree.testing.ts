/**
 * One walk of src/ for the source-scan tests (F-449).
 *
 * Several tests prove a rule over the whole tree, such as "no shipped file
 * reaches a test-only module". Each used to walk src/ with its own copy of
 * the same loop, and some walked INSIDE a test: on a loaded machine the
 * walk alone could outlast vitest's 5s per-test timeout, so a correct tree
 * failed with "Test timed out".
 *
 * Call `sourceFiles()` at module load (top level or in a describe body),
 * never inside `it`: the walk then runs while the file is collected,
 * outside every test's timer, and is memoised for the rest of the file.
 *
 * What is walked: every .ts, .tsx and .css file under src/, read once.
 *   - Directories that hold generated or third-party code are skipped by
 *     name, so a stray local build or coverage run cannot change a
 *     verdict: node_modules, .next, coverage, dist, build, out.
 *   - Untracked files ARE seen, on purpose: a rule about the tree should
 *     hold for a file before it is committed, not only after.
 *   - Callers keep their own filters (extension, test files, their own
 *     file): the helper only walks and reads.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const SRC_ROOT = resolve(process.cwd(), "src");

const SKIP_DIRS: ReadonlySet<string> = new Set([
  "node_modules",
  ".next",
  "coverage",
  "dist",
  "build",
  "out",
]);

export interface SourceFile {
  /** Absolute path on disk. */
  readonly abs: string;
  /** Path under src/ with forward slashes, e.g. "components/ui/Dialog.tsx". */
  readonly rel: string;
  /** File contents, read once. */
  readonly code: string;
}

/** A unit-test file: *.test.ts(x) or *.spec.ts(x). */
export function isTestFile(rel: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(rel);
}

/** A .ts/.tsx module (not a stylesheet). */
export function isScript(rel: string): boolean {
  return /\.tsx?$/.test(rel);
}

let cache: readonly SourceFile[] | null = null;

/** Every .ts/.tsx/.css file under src/, walked and read once per test file. */
export function sourceFiles(): readonly SourceFile[] {
  if (cache === null) {
    const out: SourceFile[] = [];
    walk(SRC_ROOT, out);
    cache = out;
  }
  return cache;
}

function walk(dir: string, out: SourceFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(abs, out);
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      out.push({
        abs,
        rel: relative(SRC_ROOT, abs).replace(/\\/g, "/"),
        code: readFileSync(abs, "utf-8"),
      });
    }
  }
}
