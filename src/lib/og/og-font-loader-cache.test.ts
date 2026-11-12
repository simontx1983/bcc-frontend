/**
 * F-215 — the bundled-font loader's per-process cache and its failure modes.
 *
 * The bytes never change within a deployment, so loadBrandFonts reads each
 * TTF once per server process. A read that FAILS must not be cached (the
 * next render retries), and a missing file degrades to the built-in family
 * instead of failing the image.
 *
 * `node:fs/promises` is mocked with the hoisted vi.mock form (a vi.doMock
 * of a Node builtin is not applied to the module under test). Each test
 * re-imports card-image after vi.resetModules(), so its module-level cache
 * starts empty.
 */

import type * as FsPromises from "node:fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type ShouldFail = (path: string) => boolean;
const NEVER_FAIL: ShouldFail = () => false;

const fsState = vi.hoisted(() => ({
  reads: [] as string[],
  shouldFail: (() => false) as (path: string) => boolean,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  const readFile = async (...args: Parameters<typeof actual.readFile>) => {
    const path = String(args[0]);
    fsState.reads.push(path);
    if (fsState.shouldFail(path)) {
      throw new Error("EIO");
    }
    return actual.readFile(...args);
  };
  return { ...actual, default: { ...actual, readFile }, readFile };
});

async function freshLoader() {
  vi.resetModules();
  return (await import("@/lib/og/card-image")).loadBrandFonts;
}

beforeEach(() => {
  fsState.reads = [];
  fsState.shouldFail = NEVER_FAIL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadBrandFonts cache", () => {
  it("reads each file once per process, however many renders ask", async () => {
    const loadBrandFonts = await freshLoader();

    await Promise.all([loadBrandFonts(), loadBrandFonts(), loadBrandFonts()]);
    await loadBrandFonts();

    expect(fsState.reads).toHaveLength(2);
    expect(fsState.reads.some((p) => p.includes("BigShouldersStencil-700.ttf"))).toBe(true);
    expect(fsState.reads.some((p) => p.includes("JetBrainsMono-500.ttf"))).toBe(true);
  });

  it("a missing file degrades to the built-in family instead of failing the image", async () => {
    fsState.shouldFail = (p) => p.includes("JetBrainsMono");
    const loadBrandFonts = await freshLoader();

    const resolved = await loadBrandFonts();

    expect(resolved.headlineFamily).toBe("Big Shoulders Stencil");
    expect(resolved.monoFamily).toBe("monospace");
    expect((resolved.fonts ?? []).map((f) => f.name)).toEqual(["Big Shoulders Stencil"]);
  });

  it("both missing → both built-in families and an empty fonts array", async () => {
    fsState.shouldFail = () => true;
    const loadBrandFonts = await freshLoader();

    const resolved = await loadBrandFonts();

    expect(resolved.headlineFamily).toBe("sans-serif");
    expect(resolved.monoFamily).toBe("monospace");
    expect(resolved.fonts ?? []).toEqual([]);
  });

  it("a failed read is not cached: the next render retries it", async () => {
    fsState.shouldFail = (p) => p.includes("JetBrainsMono");
    const loadBrandFonts = await freshLoader();

    expect((await loadBrandFonts()).monoFamily).toBe("monospace");

    fsState.shouldFail = () => false;
    expect((await loadBrandFonts()).monoFamily).toBe("JetBrains Mono");
    // The stencil stayed cached; only the mono file was read again.
    expect(fsState.reads.filter((p) => p.includes("BigShouldersStencil"))).toHaveLength(1);
    expect(fsState.reads.filter((p) => p.includes("JetBrainsMono"))).toHaveLength(2);
  });
});
