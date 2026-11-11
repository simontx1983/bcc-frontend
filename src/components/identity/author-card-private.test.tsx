/**
 * F-02 review P3: React Query keeps the last good profile when a refetch
 * fails. When the owner has since made the profile private, the hover
 * card must show "Private profile" and NONE of the cached profile data
 * (bio, counts, cover, rank, name from the profile).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => state.value }));
vi.mock("@/components/identity/MemberFollowButton", () => ({ MemberFollowButton: () => null }));
vi.mock("@/components/identity/AuthorVouchButton", () => ({ AuthorVouchButton: () => null }));

const { BccApiError } = await import("@/lib/api/types");
const { AuthorCard } = await import("@/components/identity/AuthorCard");

afterEach(cleanup);

const CACHED = {
  handle: "alice",
  display_name: "Alice From Cache",
  avatar_url: "",
  bio: "cached bio text",
  is_self: false,
  rank_label: "Veteran",
  reputation_tier: "neutral",
  reputation_tier_label: "Neutral",
  member_state: "established",
  cover_photo_url: null,
  cover_photo_position: { x: 50, y: 50 },
  counts: { following: 1234, followers: 5678 },
};

const privateErr = new BccApiError("bcc_forbidden", "x", 403, {
  error: { code: "bcc_forbidden", message: "x", data: { reason: "profile_private" } },
} as never);

describe("AuthorCard — private profile with stale cached data", () => {
  it("shows Private profile and hides the cached bio, name and counts", () => {
    state.value = { data: CACHED, isLoading: false, error: privateErr };
    render(<AuthorCard handle="alice" rankLabel="" userId={7} />);

    expect(screen.getByText("Private profile")).toBeInTheDocument();
    expect(screen.queryByText("cached bio text")).toBeNull();
    expect(screen.queryByText("Alice From Cache")).toBeNull();
    expect(screen.queryByText(/1,?234/)).toBeNull();
    expect(screen.queryByText(/5,?678/)).toBeNull();
  });

  it("control: the same cached data without the error renders normally", () => {
    state.value = { data: CACHED, isLoading: false, error: null };
    render(<AuthorCard handle="alice" rankLabel="" userId={7} />);
    expect(screen.queryByText("Private profile")).toBeNull();
    expect(screen.getByText("Alice From Cache")).toBeInTheDocument();
  });
});
