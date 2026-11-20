/**
 * F-261 — the swapping-label watch buttons carry no aria-pressed.
 *
 * MemberFollowButton (author card) and the sidebar's Suggested list name
 * their button by the action: "Watch Dana Reyes" / "Stop watching Dana
 * Reyes". With aria-pressed on top, a watched member read "Stop watching
 * Dana Reyes, toggle button, pressed": the pressed state and the name
 * contradict each other. Same rule as the profile's Block button (F-264):
 * a label that swaps, no aria-pressed.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as UseWatchModule from "@/hooks/useWatch";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "7" } }, status: "authenticated" }),
}));
vi.mock("@/lib/analytics/posthog", () => ({ captureAnalyticsEvent: vi.fn() }));
vi.mock("@/hooks/useWatch", async (importOriginal) => ({
  ...(await importOriginal<typeof UseWatchModule>()),
  useWatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUnwatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useWatching", () => ({ WATCHING_QUERY_KEY_ROOT: ["watching"] }));
vi.mock("@/hooks/useSuggestedMembers", () => ({
  SUGGESTED_MEMBERS_QUERY_KEY: ["suggestions", "users"],
  useSuggestedMembers: () => ({
    data: {
      items: [
        {
          id: 42, handle: "dana", display_name: "Dana Reyes", avatar_url: "",
          reputation_tier: "neutral", reputation_tier_label: "Neutral", rank_label: null,
          is_in_good_standing: true, suggestion_reason: null,
          viewer_is_watching: true, viewer_watch: { follow_id: 1, source: "peepso" },
        },
        {
          id: 43, handle: "ray", display_name: "Ray Ortiz", avatar_url: "",
          reputation_tier: "neutral", reputation_tier_label: "Neutral", rank_label: null,
          is_in_good_standing: true, suggestion_reason: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useMembers", () => ({ useMembers: () => ({ data: undefined, isLoading: false, isError: true }) }));
vi.mock("@/hooks/useTrendingHashtags", () => ({ useTrendingHashtags: () => ({ data: undefined, isLoading: false, isError: true }) }));
vi.mock("@/components/layout/AdCarousel", () => ({ AdCarousel: () => null }));
vi.mock("@/components/identity/AvatarHovercard", () => ({ AvatarHovercard: () => null }));

const { MemberFollowButton } = await import("@/components/identity/MemberFollowButton");
const { RightSidebar } = await import("@/components/layout/RightSidebar");

afterEach(cleanup);

describe("MemberFollowButton", () => {
  it("watching: named 'Stop watching …', no aria-pressed", () => {
    render(<MemberFollowButton userId={42} name="Dana Reyes" viewerIsWatching viewerWatch={{ follow_id: 1, source: "peepso" }} />);
    const button = screen.getByRole("button", { name: "Stop watching Dana Reyes" });
    expect(button).not.toHaveAttribute("aria-pressed");
  });

  it("not watching: named 'Watch …', no aria-pressed", () => {
    render(<MemberFollowButton userId={43} name="Ray Ortiz" viewerIsWatching={false} />);
    expect(screen.getByRole("button", { name: "Watch Ray Ortiz" })).not.toHaveAttribute("aria-pressed");
  });
});

describe("RightSidebar — Suggested", () => {
  it("each row's button is named by its action and member, with no aria-pressed", () => {
    render(<RightSidebar />);
    const watched = screen.getByRole("button", { name: "Stop watching Dana Reyes" });
    const notWatched = screen.getByRole("button", { name: "Watch Ray Ortiz" });
    expect(watched).not.toHaveAttribute("aria-pressed");
    expect(notWatched).not.toHaveAttribute("aria-pressed");
  });
});
