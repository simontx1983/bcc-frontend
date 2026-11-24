/**
 * Testnet UX audit S1 — at 375px the post-card byline cut the author's name
 * to 3–4 characters ("BCC…", "PHILL…"): the name, the trust chip and the
 * feed's REVIEWED / WATCHED label all shared one row. Below sm the byline
 * now wraps: the identity keeps at least 12rem (or the whole row), and the
 * chip with its `meta` companions moves to a second line together. From sm
 * up it never wraps. One DOM copy of each chip.
 *
 * jsdom does no layout, so this pins the classes that make the wrap happen
 * and that `meta` renders in the chip's group, not in `trailing`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_BCC_API_URL: "http://x" } }));
vi.mock("@/components/identity/RankInfoModal", () => ({ RankInfoModal: () => null }));
vi.mock("@/hooks/useUser", () => ({ usePrefetchUser: () => () => undefined }));

import { AuthorBadge, type AuthorBadgeAuthor } from "@/components/identity/AuthorBadge";

afterEach(cleanup);

const author: AuthorBadgeAuthor = {
  id: 7,
  handle: "bcc-test-reviewer",
  display_name: "BCC Test Reviewer",
  rank_label: "Apprentice",
  reputation_tier: "neutral",
  reputation_tier_label: "Neutral",
  trust_score: 50,
} as AuthorBadgeAuthor;

function byline() {
  const { container } = render(
    <AuthorBadge
      author={author}
      chip="trust"
      hovercard={false}
      meta={<span data-testid="kind">REVIEWED</span>}
      trailing={<span data-testid="trailing">⋯</span>}
    />,
  );
  const chip = container.querySelector(".bcc-rank-chip")!;
  const group = chip.parentElement!;
  return { container, chip, group };
}

describe("AuthorBadge byline wraps below sm", () => {
  it("the name + chip row may wrap on phones and never from sm up", () => {
    const { group } = byline();
    expect(group.className).toMatch(/\bflex-wrap\b/);
    expect(group.className).toMatch(/\bsm:flex-nowrap\b/);
  });

  it("the identity keeps at least 12rem below sm, and shrinks freely from sm up", () => {
    const { group } = byline();
    const identity = group.firstElementChild!;
    expect(identity.textContent).toContain("BCC Test Reviewer");
    expect(identity.className).toContain("min-w-[min(100%,12rem)]");
    expect(identity.className).toMatch(/\bsm:min-w-0\b/);
  });

  it("meta renders beside the chip, in the same wrapping group, not in trailing", () => {
    const { group } = byline();
    const kind = screen.getByTestId("kind");
    expect(kind.parentElement).toBe(group);
    expect(group.contains(screen.getByTestId("trailing"))).toBe(false);
  });

  it("one copy of the chip", () => {
    const { container } = byline();
    expect(container.querySelectorAll(".bcc-rank-chip")).toHaveLength(1);
  });
});

describe("the feed card puts its kind label in meta", () => {
  const src = readFileSync(resolve(process.cwd(), "src/components/feed/FeedItemCard.tsx"), "utf-8");

  it("passes meta to AuthorBadge", () => {
    expect(src).toMatch(/<AuthorBadge[\s\S]*?meta=\{meta\}/);
  });

  it("the trailing slot no longer renders the kind label", () => {
    const trailing = src.slice(src.indexOf("const trailing = useMemo("), src.indexOf("const trailing = useMemo(") + 900);
    expect(trailing).not.toMatch(/kindLabel/);
  });
});
