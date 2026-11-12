/**
 * F-215 — OG images use BUNDLED static TrueType fonts, never a request-time
 * Google Fonts fetch.
 *
 * The OG routes used to fetch fonts.googleapis.com and then fonts.gstatic.com
 * on every render. That's an external dependency on the hot path of every
 * link preview, and the same Google fetch flaked the Vercel build twice (the
 * next/font failures behind #243). Now loadBrandFonts reads two committed
 * TTFs.
 *
 * Satori, the engine behind next/og, accepts only static TTF/OTF: woff2 does
 * not parse, and a variable font crashes it. The file checks below make a
 * future "just use the woff2 from #243" or variable-font swap fail here,
 * not at render time in production.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();

function tableTags(bytes: Buffer): string[] {
  const count = bytes.readUInt16BE(4);
  const tags: string[] = [];
  for (let i = 0; i < count; i++) {
    tags.push(bytes.subarray(12 + 16 * i, 16 + 16 * i).toString("latin1"));
  }
  return tags;
}

function os2Weight(bytes: Buffer): number {
  const count = bytes.readUInt16BE(4);
  for (let i = 0; i < count; i++) {
    const rec = 12 + 16 * i;
    if (bytes.subarray(rec, rec + 4).toString("latin1") === "OS/2") {
      const offset = bytes.readUInt32BE(rec + 8);
      return bytes.readUInt16BE(offset + 4);
    }
  }
  throw new Error("no OS/2 table");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("the bundled files are what Satori can render", () => {
  it.each([
    ["stencil", 700],
    ["mono", 500],
  ] as const)("%s is a static TrueType font at weight %i", async (key, weight) => {
    const { OG_FONT_FILES } = await import("@/lib/og/card-image");
    const bytes = readFileSync(join(ROOT, OG_FONT_FILES[key]));

    // sfnt version 0x00010000 = TrueType. woff2 starts "wOF2", woff "wOFF".
    expect(bytes.subarray(0, 4).toString("hex")).toBe("00010000");
    const tags = tableTags(bytes);
    expect(tags).toContain("glyf");
    expect(tags, "a variable font crashes Satori").not.toContain("fvar");
    expect(tags).not.toContain("gvar");
    expect(os2Weight(bytes)).toBe(weight);
  });

  it("each font ships with its OFL licence beside it", () => {
    for (const licence of ["OFL-BigShouldersStencil.txt", "OFL-JetBrainsMono.txt"]) {
      const text = readFileSync(join(ROOT, "src/lib/og/fonts", licence), "utf-8");
      expect(text).toContain("SIL OPEN FONT LICENSE");
    }
  });
});

describe("loadBrandFonts", () => {
  it("returns both bundled fonts, byte-for-byte, and never touches the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { loadBrandFonts, OG_FONT_FILES } = await import("@/lib/og/card-image");

    const resolved = await loadBrandFonts();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resolved.headlineFamily).toBe("Big Shoulders Stencil");
    expect(resolved.monoFamily).toBe("JetBrains Mono");

    const fonts = resolved.fonts ?? [];
    expect(fonts.map((f) => [f.name, f.weight, f.style])).toEqual([
      ["Big Shoulders Stencil", 700, "normal"],
      ["JetBrains Mono", 500, "normal"],
    ]);
    expect(Buffer.from(fonts[0]!.data as ArrayBuffer).equals(readFileSync(join(ROOT, OG_FONT_FILES.stencil)))).toBe(true);
    expect(Buffer.from(fonts[1]!.data as ArrayBuffer).equals(readFileSync(join(ROOT, OG_FONT_FILES.mono)))).toBe(true);
  });

});

describe("the fonts ship with the OG functions", () => {
  // Measured on a local `next build` (Next 15.5): WITHOUT this include, no
  // opengraph-image route's .nft.json lists either TTF — output tracing does
  // not follow readFile(join(process.cwd(), …)) here — so on Vercel every OG
  // image would silently fall back to the built-in font. WITH it, all eight
  // opengraph-image routes list both files. Removing it is a regression this
  // test catches; the per-route proof needs a real build.
  it("next.config.ts lists the font directory for every opengraph-image route", () => {
    const config = readFileSync(join(ROOT, "next.config.ts"), "utf-8");
    expect(config).toMatch(/outputFileTracingIncludes\s*:\s*\{/);
    expect(config).toContain('"/**/opengraph-image*": ["./src/lib/og/fonts/*.ttf"]');
  });

  it("the include glob covers both bundled files", async () => {
    const { OG_FONT_FILES } = await import("@/lib/og/card-image");
    for (const file of Object.values(OG_FONT_FILES)) {
      expect(file.replace(/\\/g, "/")).toMatch(/^src\/lib\/og\/fonts\/[^/]+\.ttf$/);
    }
  });
});

describe("no request-time Google Fonts fetch anywhere in the OG renderer", () => {
  it("card-image.tsx names neither Google font host", () => {
    const source = readFileSync(join(ROOT, "src/lib/og/card-image.tsx"), "utf-8");
    expect(source).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });
});
