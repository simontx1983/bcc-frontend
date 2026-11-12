/**
 * C2 (UX scan 2026-11-12): on phones ≤380px wide, every community card on
 * /communities and /communities/<slug> collapsed to 0px — JOIN included.
 *
 * Below 381px `.bcc-card` sizes itself as `width: 100%` of its
 * `.bcc-card-stage` (globals.css). CommunityJoinCard centres the stage in a
 * `flex-col items-center` column, and `items-center` shrinks a child to its
 * content — so the stage had no width for that 100% to resolve against.
 *
 * jsdom has no layout, so this pins the two halves of the contract in
 * source: the narrow rule still sizes the card from its parent, and the
 * wrapper still gives the stage a width. Verified in a browser at 320 and
 * 375px (237px / 296px cards, no horizontal scroll).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");
const JOIN_CARD = read("src/components/communities/CommunityJoinCard.tsx");

describe("community card at narrow widths (C2)", () => {
  it("the ≤380px rule sizes the card from its stage", () => {
    const narrow = CSS.match(/@media \(max-width: 380px\)\s*\{\s*\.bcc-card\s*\{([^}]*)\}/);
    expect(narrow?.[1]).toMatch(/width:\s*100%/);
  });

  it("the centred wrapper gives the stage a width, capped at the card's size", () => {
    const wrapper = JOIN_CARD.match(/className="(flex flex-col items-center[^"]*)"/)?.[1] ?? "";
    expect(wrapper).toContain("[&>.bcc-card-stage]:w-full");
    expect(wrapper).toContain("[&>.bcc-card-stage]:max-w-[316px]");
  });
});
