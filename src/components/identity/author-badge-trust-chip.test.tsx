/**
 * AuthorBadge `chip="trust"` — the Handoff v1 post-author trust chip
 * (dev notes 33/35): tier dot + tier word + the author's SERVER trust
 * score ("TRUSTED 72"). Opt-in, so every other byline keeps the rank
 * chip, and it renders for new members too (it replaces the NEW MEMBER
 * treatment on posts). The score is read verbatim — never derived.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// AuthorBadge → Avatar/lib/media → lib/env reads NEXT_PUBLIC_BCC_API_URL at
// import; CI runs vitest with no .env.local, so shim it (repo convention).
vi.mock("@/lib/env", () => ({ env: { NEXT_PUBLIC_BCC_API_URL: "http://x" } }));
vi.mock("@/components/identity/RankInfoModal", () => ({ RankInfoModal: () => null }));
vi.mock("@/hooks/useUser", () => ({ usePrefetchUser: () => () => undefined }));

import { AuthorBadge, type AuthorBadgeAuthor } from "@/components/identity/AuthorBadge";

afterEach(cleanup);

const author = (over: Partial<AuthorBadgeAuthor> = {}): AuthorBadgeAuthor => ({
  id: 7,
  handle: "akashhall",
  display_name: "Akash Hall",
  rank_label: "Journeyman",
  reputation_tier: "trusted",
  reputation_tier_label: "Trusted",
  ...over,
});

/** The chip's visible words (its aria-hidden spans), in order. */
function chipText(container: HTMLElement): string {
  const chip = container.querySelector(".bcc-rank-chip");
  if (chip === null) return "";
  return Array.from(chip.querySelectorAll("[aria-hidden]"))
    .map((el) => el.textContent ?? "")
    .filter((t) => t !== "")
    .join(" ");
}

describe("AuthorBadge chip", () => {
  it('chip="trust" renders the tier word and the server score', () => {
    const { container } = render(
      <AuthorBadge author={author({ trust_score: 72 })} chip="trust" hovercard={false} />,
    );
    expect(chipText(container)).toBe("TRUSTED 72");
    expect(container.textContent).not.toContain("JOURNEYMAN");
  });

  it('chip="trust" degrades to the tier word when the score is absent (one-release optional)', () => {
    const { container } = render(
      <AuthorBadge author={author()} chip="trust" hovercard={false} />,
    );
    expect(chipText(container)).toBe("TRUSTED");
  });

  it('chip="trust" still renders for a new member with no rank label', () => {
    const { container } = render(
      <AuthorBadge
        author={author({
          rank_label: "",
          reputation_tier: "neutral",
          reputation_tier_label: "Neutral",
          trust_score: 50,
        })}
        chip="trust"
        hovercard={false}
      />,
    );
    expect(chipText(container)).toBe("NEUTRAL 50");
  });

  it("the default stays the rank chip, and ignores the score", () => {
    const { container } = render(
      <AuthorBadge author={author({ trust_score: 72 })} hovercard={false} />,
    );
    expect(chipText(container)).toBe("JOURNEYMAN");
    expect(container.textContent).not.toContain("72");
  });

  it("showRank={false} hides the trust chip too", () => {
    const { container } = render(
      <AuthorBadge author={author({ trust_score: 72 })} chip="trust" showRank={false} hovercard={false} />,
    );
    expect(container.querySelector(".bcc-rank-chip")).toBeNull();
  });
});
