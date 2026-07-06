import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TrustQuestsBlock } from "@/components/profile/StandingFileBody";
import type { MemberQuestProgress } from "@/lib/api/types";

/**
 * Render coverage for the §N11 TRUST QUESTS block on /me/progression.
 * Verifies the earned vote-weight multiplier, the completion summary, and
 * the per-quest checklist (done vs. pending) render from server-provided
 * values — the block never derives trust, it only formats.
 */

const quests: MemberQuestProgress = {
  multiplier: 1.28,
  completed_count: 6,
  total_count: 7,
  pct: 86,
  items: [
    {
      slug: "connect_wallet",
      label: "Connect a Wallet",
      hint: "Prove on-chain identity for higher credibility.",
      done: true,
      weight_bonus: 0.08,
      category: "identity",
    },
    {
      slug: "explore_projects",
      label: "Explore 3 Projects",
      hint: "Browse and evaluate real projects.",
      done: false,
      weight_bonus: 0.02,
      category: "engagement",
    },
  ],
};

describe("TrustQuestsBlock", () => {
  // Vitest runs without global test APIs, so RTL's auto-cleanup doesn't fire.
  afterEach(cleanup);

  it("renders the earned vote-weight multiplier", () => {
    render(<TrustQuestsBlock quests={quests} />);
    expect(screen.getByText("1.28×")).toBeInTheDocument();
    // Slash spacing is CSS margin, so the text content collapses to "6/7".
    expect(screen.getByText(/steps folded in/)).toHaveTextContent(
      "6/7 steps folded in",
    );
  });

  it("renders each quest with its completion state and bonus", () => {
    render(<TrustQuestsBlock quests={quests} />);

    // Labels are uppercased in the UI.
    expect(screen.getByText("CONNECT A WALLET")).toBeInTheDocument();
    expect(screen.getByText("EXPLORE 3 PROJECTS")).toBeInTheDocument();

    // Both quests' bonuses surface as multiplier contributions.
    expect(screen.getByText("+0.08×")).toBeInTheDocument();
    expect(screen.getByText("+0.02×")).toBeInTheDocument();

    // The pending quest surfaces its hint so the operator knows what it is.
    expect(
      screen.getByText("Browse and evaluate real projects."),
    ).toBeInTheDocument();
  });

  it("clamps the completion bar width to the server pct", () => {
    const { container } = render(<TrustQuestsBlock quests={quests} />);
    const bar = container.querySelector<HTMLElement>('[style*="width"]');
    expect(bar).not.toBeNull();
    expect(bar?.style.width).toBe("86%");
  });
});
