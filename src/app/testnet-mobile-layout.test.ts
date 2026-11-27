/**
 * Testnet UX audit (2026-11-23), phone layout:
 *   - S2: the validator stats strip put every stat in one row at every
 *     width, so at 375px four stats clipped their labels ("FOLLOW…"). The
 *     strip is now the detail header's counts (Site Structure A §12), and
 *     the rule moved with it.
 *   - S5: controls on the main tester journeys under 44px: the header
 *     Sign Up / Join the Floor, the card Flip chip (24px), WRITE A REVIEW
 *     and VOUCH (and their REMOVE twins), and the legal links in the phone
 *     menu and the marketing footer.
 *
 * Same source-scan idiom as F-440 / F-317, through the shared scanner:
 * each covered tag must carry a real 44px box or HIT_AREA_44. Each scope
 * has a floor on how many tags it found, so a scan that stops matching
 * fails instead of passing over nothing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { MECHANISM, classesOf, openTags } from "@/app/tap-target-scan.testing";
// Imported at collection, outside every test's 5s timer (large module graphs).
import { headerStatsCellSpan, headerStatsColumns } from "@/components/detail/DetailLayout";

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_BCC_API_URL: "http://x" }, clientEnv: { BCC_API_URL: "http://x" } }));

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const short = (tags: string[], src: string) => tags.filter((t) => !MECHANISM.test(classesOf(t, src)));

describe("S2 — the detail header's counts strip", () => {
  it("up to three counts in one row; four or more two across below sm, one row of up to six from sm up", () => {
    expect(headerStatsColumns(1)).toBe("grid-cols-1 sm:grid-cols-1");
    expect(headerStatsColumns(3)).toBe("grid-cols-3 sm:grid-cols-3");
    expect(headerStatsColumns(4)).toBe("grid-cols-2 sm:grid-cols-4");
    expect(headerStatsColumns(6)).toBe("grid-cols-2 sm:grid-cols-6");
    expect(headerStatsColumns(9)).toBe("grid-cols-2 sm:grid-cols-6");
  });

  it("an odd count of four or more spans its last cell below sm, so no empty cell shows", () => {
    expect(headerStatsCellSpan(5, 4)).toBe("col-span-2 sm:col-span-1");
    expect([0, 1, 2].map((i) => headerStatsCellSpan(3, i))).toEqual(["", "", ""]);
    expect([0, 1, 2, 3].map((i) => headerStatsCellSpan(4, i))).toEqual(["", "", "", ""]);
    const src = read("src/components/detail/DetailLayout.tsx");
    expect(src).toContain("headerStatsCellSpan(shownStats.length, i)");
  });

  it("no inline column count overrides the classes", () => {
    const src = read("src/components/detail/DetailLayout.tsx");
    const at = src.indexOf("{shownStats.length > 0 && (");
    const strip = src.slice(at, at + 900);
    expect(strip).toMatch(/headerStatsColumns\(shownStats\.length\)/);
    expect(strip).not.toMatch(/gridTemplateColumns/);
  });
});

describe("S5 — 44px tap targets on the tester journeys", () => {
  const SCOPES: ReadonlyArray<{ name: string; path: string; tag: "button" | "Link" | "a"; pick: RegExp; floor: number }> = [
    { name: "header Sign Up", path: "src/components/layout/SiteHeader.tsx", tag: "Link", pick: /href="\/signup"/, floor: 1 },
    { name: "marketing header CTA (Link)", path: "src/components/landing/MarketingHeaderCta.tsx", tag: "Link", pick: /bcc-btn/, floor: 1 },
    { name: "card Flip chip", path: "src/components/cards/CardStandingStrip.tsx", tag: "button", pick: /bcc-card-flip-chip/, floor: 1 },
    { name: "WRITE A REVIEW / REMOVE", path: "src/components/review/ReviewCallout.tsx", tag: "button", pick: /bcc-stencil mt-4/, floor: 2 },
    { name: "VOUCH / REMOVE", path: "src/components/endorse/EndorseButton.tsx", tag: "button", pick: /bcc-stencil mt-4/, floor: 2 },
    { name: "phone menu legal links", path: "src/components/layout/offcanvas/MainOffcanvas.tsx", tag: "Link", pick: /bcc-legal-link/, floor: 1 },
    { name: "marketing footer legal links", path: "src/app/(main)/(marketing)/layout.tsx", tag: "Link", pick: /bcc-legal-link/, floor: 3 },
  ];

  for (const s of SCOPES) {
    it(s.name, () => {
      const src = read(s.path);
      const tags = (s.tag === "a" ? openTags(src, "Link") : openTags(src, s.tag)).filter((t) => s.pick.test(t));
      expect(tags.length).toBeGreaterThanOrEqual(s.floor);
      expect(short(tags, src)).toEqual([]);
    });
  }

  it("the /for-validators variant of the marketing CTA (an <a>) too", () => {
    const src = read("src/components/landing/MarketingHeaderCta.tsx");
    expect(src).toMatch(/<a href="#find" className=\{`\$\{HIT_AREA_44\} bcc-btn/);
  });
});
