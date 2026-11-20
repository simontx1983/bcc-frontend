/**
 * The shared source walk (source-tree.testing.ts) that every source scan
 * reads. It is the single place a file could silently drop out of every
 * scan, so its rules are pinned here against a scratch tree in the OS temp
 * folder (never inside src/, where another scan running in parallel would
 * see the fixture files).
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { baseName, isScript, isTestFile, sourceFiles, walkTree } from "@/app/source-tree.testing";

let root = "";

const FIXTURE = [
  "a.ts",
  "styles.css",
  "b.test.tsx",
  "readme.md",
  "legacy.js",
  "notes.mdx",
  // Build and coverage output directly under the root: skipped.
  "build/out.ts",
  "coverage/c.ts",
  "dist/d.ts",
  "out/o.ts",
  // Never source, at any depth: skipped.
  "node_modules/pkg/index.ts",
  "app/node_modules/n.ts",
  "app/.next/n.ts",
  // The same names deeper down are ordinary code: walked. A route folder
  // src/app/build/ was hidden from every scan when the skip matched any depth.
  "app/build/page.tsx",
  "app/out/x.ts",
  "app/dist/y.css",
  "components/coverage/z.tsx",
];

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "bcc-source-tree-"));
  for (const rel of FIXTURE) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `// ${rel}\n`);
  }
});
afterAll(() => {
  if (root !== "") rmSync(root, { recursive: true, force: true });
});

describe("walkTree", () => {
  it("walks .ts/.tsx/.css, skips build output only at the root and node_modules/.next anywhere", () => {
    const rels = walkTree(root).map((f) => f.rel).sort();
    expect(rels).toEqual(
      [
        "a.ts",
        "styles.css",
        "b.test.tsx",
        "app/build/page.tsx",
        "app/out/x.ts",
        "app/dist/y.css",
        "components/coverage/z.tsx",
      ].sort(),
    );
  });

  it("reads each file's contents once, with a forward-slash rel path", () => {
    const page = walkTree(root).find((f) => f.rel === "app/build/page.tsx");
    expect(page?.code).toBe("// app/build/page.tsx\n");
    expect(page?.abs.endsWith(join("app", "build", "page.tsx"))).toBe(true);
  });

  it("returns a frozen array of frozen entries", () => {
    const files = walkTree(root);
    expect(Object.isFrozen(files)).toBe(true);
    expect(files.every((f) => Object.isFrozen(f))).toBe(true);
  });
});

describe("sourceFiles", () => {
  // Walked HERE, while the file is collected, not inside `it`: the rule
  // source-tree.testing.ts sets for every caller. This test used to walk
  // inside `it`, the one place that breaks it, and on a loaded machine
  // (a full CI-sized run) the real-src walk took ~42s against vitest's 5s
  // per-test timeout, so a correct tree failed with "Test timed out".
  const first = sourceFiles();
  const second = sourceFiles();

  it("walks the real src/ once and memoises it", () => {
    expect(second).toBe(first);
    expect(first.length).toBeGreaterThan(400);
    expect(first.some((f) => f.rel === "app/source-tree.testing.ts")).toBe(true);
  });
});

describe("filters", () => {
  it("isTestFile, isScript and baseName", () => {
    expect(isTestFile("app/x.test.ts")).toBe(true);
    expect(isTestFile("app/x.spec.tsx")).toBe(true);
    expect(isTestFile("app/source-tree.testing.ts")).toBe(false);
    expect(isScript("app/globals.css")).toBe(false);
    expect(isScript("app/page.tsx")).toBe(true);
    expect(baseName("app/(main)/page.tsx")).toBe("page.tsx");
    expect(baseName("top.ts")).toBe("top.ts");
  });
});
