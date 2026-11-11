/**
 * NftPickerModal colour families (#201).
 *
 * The picker's tiles are fixed paper, so they use the fixed ink tokens.
 * Everything else in the modal sits on the shared Dialog panel, which
 * flips with the theme. Fixed ink text on that panel measured 1.12:1 in
 * the dark theme (navy blueprint 1.05:1, ink-ghost 2.92:1), and fixed
 * cardstock-deep measured 1.64:1 in the light theme.
 *
 * This scan keeps the panel chrome on theme-aware tokens: it strips the
 * NftTile function (the paper surface) and fails on any fixed-family
 * text or border class left in the rest of the file, or anywhere in
 * IndexerStateChip, which only renders on the panel.
 *
 * The DONE button stays `bg-ink text-cardstock`: a fixed fill with fixed
 * text on it is one family and reads in both themes.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const DIR = path.join(process.cwd(), "src/components/onchain");
const read = (file: string) => readFileSync(path.join(DIR, file), "utf8");

const FIXED_ON_PANEL =
  /\b(?:hover:)?(?:text-ink(?:-soft|-ghost)?|border-ink|bg-ink\/\d+|text-cardstock-deep|text-blueprint)\b/g;

function withoutNftTile(source: string): string {
  const start = source.indexOf("function NftTile(");
  const end = source.indexOf("function NftPickerEmpty(");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("NftTile / NftPickerEmpty markers moved; update this guard");
  }
  return source.slice(0, start) + source.slice(end);
}

describe("NftPickerModal panel chrome uses theme-aware tokens", () => {
  it("has no fixed ink-family text or borders outside the paper tiles", () => {
    const panel = withoutNftTile(read("NftPickerModal.tsx"));
    expect(panel.match(FIXED_ON_PANEL) ?? []).toEqual([]);
  });

  it("puts the heading, intro and refresh control on --bcc-text tokens", () => {
    const panel = withoutNftTile(read("NftPickerModal.tsx"));
    expect(panel).toMatch(/bcc-stencil mt-1 text-3xl text-bcc-text /);
    expect(panel).toMatch(/max-w-prose font-serif text-bcc-text-secondary/);
    expect(panel).toMatch(/text-\[11px\] tracking-\[0\.18em\] text-bcc-text /);
  });

  it("keeps IndexerStateChip off the fixed families", () => {
    expect(read("IndexerStateChip.tsx").match(FIXED_ON_PANEL) ?? []).toEqual([]);
  });

  it("still uses fixed ink inside the paper tile (the control)", () => {
    const source = read("NftPickerModal.tsx");
    const tile = source.slice(
      source.indexOf("function NftTile("),
      source.indexOf("function NftPickerEmpty("),
    );
    expect(tile.match(FIXED_ON_PANEL)?.length ?? 0).toBeGreaterThan(0);
  });
});
