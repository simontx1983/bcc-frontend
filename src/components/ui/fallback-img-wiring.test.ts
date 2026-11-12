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

/**
 * Source with comments removed, for the raw-<img> check only: a comment
 * that merely mentions the tag must not count as markup (it did, once —
 * #242). Handles JSX comments, block comments, and line comments (not
 * after a ":" so "https://" survives). Strings are not parsed; no surface
 * holds "<img" inside a string literal.
 */
const withoutComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

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
  // ── F-187: collection crests and group / hall / gallery covers ──
  {
    file: "src/components/cards/Crest.tsx",
    fallbacks: ["image_fallback_url: imageFallbackUrl", "fallbackSrc={imageFallbackUrl}"],
  },
  {
    file: "src/components/cards/CardBackFace.tsx",
    fallbacks: ["image_fallback_url: imageFallbackUrl", "fallbackSrc={imageFallbackUrl}"],
  },
  {
    file: "src/components/creator/CreatorGallery.tsx",
    fallbacks: ["fallbackSrc={item.image_fallback_url}"],
  },
  {
    file: "src/components/halls/HallChainContent.tsx",
    fallbacks: ["fallbackSrc={collection.image_fallback_url}", "fallbackSrc={fallbackSrc}"],
  },
  {
    file: "src/components/auth/EligibleCommunitiesModal.tsx",
    fallbacks: ["fallbackSrc={item.collection.image_fallback_url}"],
  },
  {
    file: "src/components/settings/CommunitiesList.tsx",
    fallbacks: ["fallbackSrc={item.collection.image_fallback_url}"],
  },
  {
    file: "src/components/identity/Avatar.tsx",
    fallbacks: ["avatarFallbackUrl?: string | null | undefined;", "fallbackSrc={avatarFallbackUrl}"],
  },
];

/**
 * F-187: Avatar callers that render a CARD CREST must forward its fallback.
 * Other Avatar callers (members, authors) have no `image_fallback_url` to
 * pass and are not listed.
 */
const CREST_AVATAR_CALLERS: ReadonlyArray<{ file: string; needles: readonly string[] }> = [
  {
    file: "src/components/entity/panels/CardWatchersPanel.tsx",
    needles: ["avatarFallbackUrl={card.crest.image_fallback_url}"],
  },
  {
    file: "src/components/profile/panels/WatchingPanel.tsx",
    needles: ["avatarFallbackUrl={card.crest.image_fallback_url}"],
  },
  {
    file: "src/components/layout/RightSidebar.tsx",
    needles: ["avatarFallbackUrl={member.crest.image_fallback_url}"],
  },
  {
    // RightSidebar renders AvatarHovercard, which must pass it on to Avatar.
    file: "src/components/identity/AvatarHovercard.tsx",
    needles: ["avatarFallbackUrl?: string | null | undefined;", "avatarFallbackUrl={avatarFallbackUrl}"],
  },
  {
    file: "src/app/(main)/(app)/messages/new/page.tsx",
    needles: [
      "avatarFallbackUrl={recipient.crest.image_fallback_url}",
      "avatarFallbackUrl={m.crest.image_fallback_url}",
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
    expect(withoutComments(source)).not.toMatch(/<img\b/);
  });

  it.each(fallbacks)("passes the server fallback: %s", (needle) => {
    expect(source).toContain(needle);
  });
});

describe.each(CREST_AVATAR_CALLERS)("crest Avatar caller $file", ({ file, needles }) => {
  const source = read(file);

  it.each(needles)("forwards the crest fallback: %s", (needle) => {
    expect(source).toContain(needle);
  });
});

describe("comment stripping", () => {
  it("removes a tag that only appears in comments, and keeps real markup", () => {
    const sample = [
      "// a raw <img> in a line comment",
      "/* a raw <img> in a block comment */",
      "{/* a raw <img> in a JSX comment */}",
      'const href = "https://example.test/x"; // trailing <img>',
    ].join("\n");
    expect(withoutComments(sample)).not.toMatch(/<img\b/);
    expect(withoutComments(sample)).toContain("https://example.test/x");
    expect(withoutComments("<img src={x} />")).toMatch(/<img\b/);
  });
});

describe("anti-vacuity control", () => {
  it("the scan reads real files (a known surface is non-trivial)", () => {
    expect(read("src/components/onchain/NftPickerModal.tsx").length).toBeGreaterThan(1000);
  });
});
