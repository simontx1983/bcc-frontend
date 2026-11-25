/**
 * Testnet UX audit (2026-11-23), PR 3:
 *   - S3: onboarding's welcome card numbered its three highlights 01–03, so
 *     they read as "3 steps" beside the rail's honest "Step 1 of 7" (which
 *     counts screens). The highlights are unnumbered now.
 *   - S6: the sign-up handle field had a grey fill (--bcc-input-bg) beside
 *     its frosted siblings and read as disabled; and every auth field was
 *     14px, which zooms iOS Safari into the page on focus.
 *   - S4: the same post showed the trust chip in the feed and the rank chip
 *     on its permalink. Rule: a post's byline shows the trust chip.
 *   - F-563 (Phillip's option 3): a community card's header says its server
 *     kicker (CHAIN HALL, …) instead of "COMMUNITY"; the standing row no
 *     longer repeats it.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Card } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_BCC_API_URL: "http://x" }, clientEnv: { BCC_API_URL: "http://x" } }));

// Imported at collection, outside every test's timer (large module graphs).
import { cardHeaderWord } from "@/components/cards/card-face-stats";
import { CardStandingStrip } from "@/components/cards/CardStandingStrip";

afterEach(cleanup);

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/** A minimal community card; `over` may set fields loosely (e.g. a null kicker). */
function card(over: Record<string, unknown> = {}): Card {
  return {
    id: 1,
    name: "Akash Hall",
    card_kind: "community",
    kicker: "CHAIN HALL",
    flags: [],
    onchain_signals: null,
    reputation_tier: null,
    reputation_tier_label: null,
    social_proof: null,
    is_claimed: false,
    community_dossier: { viewer_is_member: true, verification: null },
    ...over,
  } as unknown as Card;
}

describe("F-563 — the card header word", () => {
  it("a Hall card says CHAIN HALL, its server kicker", () => {
    expect(cardHeaderWord(card({ kicker: "CHAIN HALL" }))).toBe("CHAIN HALL");
  });

  it("every community kind says its own kicker", () => {
    for (const k of ["HOLDER COMMUNITY", "DELEGATOR COMMUNITY", "SYSTEM COMMUNITY", "COMMUNITY"]) {
      expect(cardHeaderWord(card({ kicker: k }))).toBe(k);
    }
  });

  it("a community card with no kicker falls back to community", () => {
    expect(cardHeaderWord(card({ kicker: null }))).toBe("community");
    expect(cardHeaderWord(card({ kicker: "  " }))).toBe("community");
  });

  it("the other families keep their family word", () => {
    for (const kind of ["validator", "project", "creator", "member"] as const) {
      expect(cardHeaderWord(card({ card_kind: kind, kicker: "CHAIN HALL" }))).toBe(kind);
    }
  });

  it("the header renders that word", () => {
    const src = read("src/components/cards/CardFrontFace.tsx");
    const header = src.slice(src.indexOf("function CardHeader("), src.indexOf("function CardHeader(") + 1800);
    expect(header).toMatch(/const word = cardHeaderWord\(card\);/);
    expect(header).toMatch(/\{word\}/);
    expect(header).not.toMatch(/\{card\.card_kind\}/);
  });
});

describe("F-563 — the standing row does not repeat the header", () => {
  const strip = (c: Card) =>
    render(<CardStandingStrip card={c} kindColor="var(--kind-community)" flipped={false} onFlip={() => {}} />).container;

  it("an unverified Hall shows no CHAIN HALL row (the header says it)", () => {
    const el = strip(card({}));
    expect(el.textContent).not.toMatch(/CHAIN HALL/i);
    expect(el.querySelector(".bcc-card-standing-row")).toBeNull();
  });

  it("a verified community still shows its verification label", () => {
    const el = strip(card({ community_dossier: { viewer_is_member: true, verification: { kind: "on_chain", label: "On-Chain Verified" } } }));
    expect(el.textContent).toContain("On-Chain Verified");
  });
});

describe("S4 — a post's byline shows the trust chip, in the feed and on its permalink", () => {
  for (const path of ["src/components/feed/FeedItemCard.tsx", "src/components/feed/PostDetail.tsx"]) {
    it(path, () => {
      const src = read(path);
      const tag = src.slice(src.indexOf("<AuthorBadge"), src.indexOf("/>", src.indexOf("<AuthorBadge")));
      expect(tag).toMatch(/chip="trust"/);
      expect(tag).toMatch(/nameStyle="caps"/);
    });
  }

  it("comments keep the rank chip (a person in conversation)", () => {
    const src = read("src/components/feed/CommentDrawer.tsx");
    const tag = src.slice(src.indexOf("<AuthorBadge"), src.indexOf("/>", src.indexOf("<AuthorBadge")));
    expect(tag).not.toMatch(/chip="trust"/);
  });

  it("the rule is written down in AuthorBadge", () => {
    expect(read("src/components/identity/AuthorBadge.tsx")).toMatch(/a POST's byline[\s\S]{0,120}trust chip/);
  });
});

describe("S6 — the sign-up fields", () => {
  const css = read("src/app/globals.css");
  const rule = (sel: string) => {
    const at = css.indexOf(`${sel} {`);
    expect(at, sel).toBeGreaterThan(-1);
    return css.slice(at, css.indexOf("}", at));
  };

  it("the handle field has the same fill as its siblings", () => {
    expect(rule(".bcc-auth-handle-wrap")).toMatch(/background:\s*var\(--bcc-glass-bg-frosted\)/);
    expect(rule(".bcc-auth-input")).toMatch(/background:\s*var\(--bcc-glass-bg-frosted\)/);
  });

  it("auth fields are at least 16px, so iOS does not zoom on focus", () => {
    const size = rule(".bcc-auth-input").match(/font-size:\s*(\d+)px/)?.[1];
    expect(Number(size)).toBeGreaterThanOrEqual(16);
  });
});

describe("S3 — the welcome card's highlights are not numbered steps", () => {
  it("no 01 / 02 / 03 beside the rail's Step N of 7", () => {
    const src = read("src/components/onboarding/WelcomeStep.tsx");
    expect(src).not.toMatch(/n:\s*"0[1-3]"/);
    expect(src).not.toMatch(/className="n"/);
    expect(src).toMatch(/title: "Set up your profile"/);
    expect(read("src/app/globals.css")).not.toMatch(/\.bcc-onb-pv \.n\b/);
  });
});
