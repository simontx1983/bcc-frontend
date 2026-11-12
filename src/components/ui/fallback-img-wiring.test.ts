/**
 * F-165 wiring: every NFT image surface named by the contract renders
 * through FallbackImg AND passes the server's fallback field.
 *
 * FallbackImg's own behaviour is covered by FallbackImg.test.tsx. This
 * file guards the other failure mode: a surface that keeps (or regains) a
 * raw <img>, or drops the `fallbackSrc` prop, compiles fine and silently
 * loses the ipfs.io fallback. Static by design — it proves the call is
 * present with the right field, not that it renders; the surface tests do
 * that.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

const SURFACES: ReadonlyArray<{ file: string; fallbacks: readonly string[] }> = [
  {
    file: "src/components/onchain/CollectionStancePanel.tsx",
    fallbacks: ["fallbackSrc={item.image_fallback_url}"],
  },
  {
    file: "src/components/onchain/NftPickerModal.tsx",
    fallbacks: ["fallbackSrc={item.image_fallback_url}"],
  },
  {
    file: "src/components/onchain/NftShowcaseSettings.tsx",
    fallbacks: ["fallbackSrc={item.image_fallback_url}"],
  },
  {
    file: "src/components/creator/NftPieceDetail.tsx",
    fallbacks: [
      "imageFallbackUrl={piece.image_fallback_url}",
      "imageUrlThumbFallbackUrl={piece.image_url_thumb_fallback_url}",
      "fallbackSrc={imageFallbackUrl}",
      "fallbackSrc={imageUrlThumbFallbackUrl}",
    ],
  },
];

describe.each(SURFACES)("$file", ({ file, fallbacks }) => {
  const source = read(file);

  it("renders through FallbackImg", () => {
    expect(source).toContain('import { FallbackImg } from "@/components/ui/FallbackImg";');
    expect(source).toMatch(/<FallbackImg\b/);
  });

  it("has no raw <img> left to bypass the fallback chain", () => {
    expect(source).not.toMatch(/<img\b/);
  });

  it.each(fallbacks)("passes the server fallback: %s", (needle) => {
    expect(source).toContain(needle);
  });
});

describe("anti-vacuity control", () => {
  it("the scan reads real files (a known surface is non-trivial)", () => {
    expect(read("src/components/onchain/NftPickerModal.tsx").length).toBeGreaterThan(1000);
  });
});
