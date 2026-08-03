import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TrustQuestsBlock } from "@/components/profile/TrustQuestsBlock";
import type { MemberQuestProgress } from "@/lib/api/types";

/**
 * Render coverage for the TRUST QUESTS block on /me/progression.
 * Verifies the completion summary and the per-quest checklist (done vs.
 * pending) render from server-provided values — the block never derives
 * trust, it only formats.
 *
 * D-1 regression guard (Rank redesign Phase 5): quests grant NO power.
 * The legacy vote-weight multiplier / per-quest weight bonuses are gone
 * from the wire, and this surface must never show a "×" multiplier or
 * "vote weight" framing again — asserted below against the rendered
 * output, since types can't police copy.
 */

const quests: MemberQuestProgress = {
  completed_count: 6,
  total_count: 7,
  pct: 86,
  items: [
    {
      slug: "connect_wallet",
      label: "Connect a Wallet",
      hint: "Prove on-chain identity for higher credibility.",
      done: true,
      category: "identity",
    },
    {
      slug: "explore_projects",
      label: "Explore 3 Projects",
      hint: "Browse and evaluate real projects.",
      done: false,
      category: "engagement",
    },
  ],
};

describe("TrustQuestsBlock", () => {
  // Vitest runs without global test APIs, so RTL's auto-cleanup doesn't fire.
  afterEach(cleanup);

  it("renders the completion summary", () => {
    render(<TrustQuestsBlock quests={quests} />);
    // Slash spacing is markup, so the text content collapses to "6/7".
    expect(screen.getByText("STEPS COMPLETE")).toBeInTheDocument();
    const summary = screen.getByText("STEPS COMPLETE").parentElement;
    expect(summary).toHaveTextContent("6/7");
  });

  it("renders each quest with its completion state", () => {
    render(<TrustQuestsBlock quests={quests} />);

    // Labels are uppercased in the UI.
    expect(screen.getByText("CONNECT A WALLET")).toBeInTheDocument();
    expect(screen.getByText("EXPLORE 3 PROJECTS")).toBeInTheDocument();

    // The pending quest surfaces its hint so the operator knows what it is.
    expect(
      screen.getByText("Browse and evaluate real projects."),
    ).toBeInTheDocument();
  });

  it("shows no vote-weight multiplier or bonus framing (D-1: quests grant no power)", () => {
    const { container } = render(<TrustQuestsBlock quests={quests} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("×");
    expect(text.toLowerCase()).not.toContain("multiplier");
    expect(text.toLowerCase()).not.toContain("vote weight");
    expect(text.toLowerCase()).not.toContain("weight bonus");
  });

  it("clamps the completion bar width to the server pct", () => {
    const { container } = render(<TrustQuestsBlock quests={quests} />);
    const bar = container.querySelector<HTMLElement>('[style*="width"]');
    expect(bar).not.toBeNull();
    expect(bar?.style.width).toBe("86%");
  });

  it("renders a per-quest action only while the quest is pending", () => {
    render(
      <TrustQuestsBlock
        quests={quests}
        renderAction={(quest) => (
          <span>action:{quest.slug}</span>
        )}
      />,
    );
    // explore_projects is pending → its action shows.
    expect(screen.getByText("action:explore_projects")).toBeInTheDocument();
    // connect_wallet is done → no action.
    expect(screen.queryByText("action:connect_wallet")).toBeNull();
  });
});
