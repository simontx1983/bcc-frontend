/**
 * One walk of src/ for the source-scan tests (F-449).
 *
 * Several tests prove a rule over the whole tree, such as "no shipped file
 * reaches a test-only module". Each used to walk src/ with its own copy of
 * the same loop, and some walked INSIDE a test: on a loaded machine the
 * walk alone could outlast vitest's 5s per-test timeout, so a correct tree
 * failed with "Test timed out". Every source scan now walks through here.
 *
 * Call `sourceFiles()` at module load (top level or in a describe body),
 * never inside `it`: the walk then runs while the file is collected,
 * outside every test's timer, and is memoised for the rest of the file.
 *
 * What is walked: every .ts, .tsx and .css file under src/, read once.
 *   - Not walked: .js, .jsx, .mdx or any other extension. src/ holds none
 *     today; a scan that needs one must widen the extension test below.
 *   - Skipped anywhere: node_modules and .next, which are never source.
 *   - Skipped ONLY directly under the root: coverage, dist, build, out,
 *     where a stray local build or coverage run would land. Deeper down
 *     those are ordinary names (a route folder src/app/build/ is real
 *     code), so they are walked; skipping them by name at any depth hid
 *     such a folder from every scan.
 *   - Symlinks are not followed: Dirent.isDirectory() is false for a link
 *     to a directory, so a linked folder is not walked.
 *   - Untracked files ARE seen, on purpose: a rule about the tree should
 *     hold for a file before it is committed, not only after.
 *   - Callers keep their own filters (extension, test files, their own
 *     file): the helper only walks and reads.
 *
 * The result is frozen (array and entries): one walk is shared by every
 * test in the file, so no test may edit what another reads.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export const SRC_ROOT = resolve(process.cwd(), "src");

/** Never source, at any depth. */
const SKIP_ANYWHERE: ReadonlySet<string> = new Set(["node_modules", ".next"]);
/** Build and coverage output, skipped only directly under the walk's root. */
const SKIP_AT_ROOT: ReadonlySet<string> = new Set(["coverage", "dist", "build", "out"]);

export interface SourceFile {
  /** Absolute path on disk. */
  readonly abs: string;
  /** Path under the root with forward slashes, e.g. "components/ui/Dialog.tsx". */
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

/** The file's own name, for scans that exclude themselves. */
export function baseName(rel: string): string {
  return rel.slice(rel.lastIndexOf("/") + 1);
}

/**
 * Walk `root` with the rules above. Uncached: tests of the walk itself
 * point it at a scratch tree. Scans use `sourceFiles()`.
 */
export function walkTree(root: string): readonly SourceFile[] {
  const out: SourceFile[] = [];
  walk(root, root, out);
  return Object.freeze(out);
}

let cache: readonly SourceFile[] | null = null;

/** Every .ts/.tsx/.css file under src/, walked and read once per test file. */
export function sourceFiles(): readonly SourceFile[] {
  if (cache === null) cache = walkTree(SRC_ROOT);
  return cache;
}

function walk(root: string, dir: string, out: SourceFile[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_ANYWHERE.has(entry.name)) continue;
      if (dir === root && SKIP_AT_ROOT.has(entry.name)) continue;
      walk(root, abs, out);
    } else if (/\.(tsx?|css)$/.test(entry.name)) {
      out.push(
        Object.freeze({
          abs,
          rel: relative(root, abs).replace(/\\/g, "/"),
          code: readFileSync(abs, "utf-8"),
        }),
      );
    }
  }
}
