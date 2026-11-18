/**
 * F-255 review (MEDIUM): after a watch / unwatch, every cached copy of that
 * card and profile carries the new answer, so a REMOUNT shows it.
 *
 * Without this, re-hovering the author card inside the profile's 30s cache,
 * going Back to a grid, or the profile hero read the old server answer —
 * after an unwatch it said "Watching" with a deleted follow_id, so the next
 * click failed. The real mutation hooks patch the cache on success.
 */

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MemberProfile } from "@/lib/api/types";

const unwatchCard = vi.hoisted(() => vi.fn());
const watchCard = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/lib/api/watching-endpoints", () => ({
  watchCard: (...a: unknown[]) => watchCard(...a),
  unwatchCard: (...a: unknown[]) => unwatchCard(...a),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 1 } } }),
}));
vi.mock("@/lib/analytics/posthog", () => ({ captureAnalyticsEvent: vi.fn() }));

const { useUnwatchMutation, useWatchMutation } = await import("@/hooks/useWatch");
const { MemberFollowButton } = await import("@/components/identity/MemberFollowButton");

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

const PROFILE = {
  id: 42,
  user_id: 42,
  handle: "dana",
  viewer_is_watching: true,
  viewer_watch: { follow_id: 9100, source: "peepso" },
};
const MEMBER_CARD = {
  id: 42,
  card_kind: "member",
  viewer_is_watching: true,
  viewer_watch: { follow_id: 9100, source: "peepso" },
};
const OTHER_CARD = { id: 43, card_kind: "member", viewer_is_watching: false, viewer_watch: null };
const VALIDATOR = { id: 501, card_kind: "validator", viewer_is_watching: false, viewer_watch: null };

beforeEach(() => {
  unwatchCard.mockReset().mockResolvedValue({ status: "unwatched", follow_id: 9100 });
  watchCard.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["user", "dana"], PROFILE);
  qc.setQueryData(["directory"], { pages: [{ items: [MEMBER_CARD, OTHER_CARD, VALIDATOR] }], pageParams: [1] });
});
afterEach(() => {
  cleanup();
  qc.clear();
});

describe("the mutations patch every cached copy", () => {
  it("an unwatch clears the profile and the member card, and leaves other entries untouched", async () => {
    const before = qc.getQueryData<{ pages: { items: unknown[] }[] }>(["directory"]);
    const { result } = renderHook(() => useUnwatchMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        follow_id: 9100,
        source: "peepso",
        target: { card_kind: "member", id: 42 },
      });
    });

    expect(qc.getQueryData(["user", "dana"])).toMatchObject({ viewer_is_watching: false, viewer_watch: null });
    const after = qc.getQueryData<{ pages: { items: Record<string, unknown>[] }[] }>(["directory"]);
    expect(after?.pages[0]?.items[0]).toMatchObject({ viewer_is_watching: false, viewer_watch: null });
    // Untouched siblings keep their identity.
    expect(after?.pages[0]?.items[1]).toBe(before?.pages[0]?.items[1]);
    expect(after?.pages[0]?.items[2]).toBe(before?.pages[0]?.items[2]);
  });

  it("a watch writes the new follow onto the matching card only", async () => {
    watchCard.mockResolvedValue({ status: "watched", item: { follow_id: 77, follow_source: "page" } });
    const { result } = renderHook(() => useWatchMutation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ target_kind: "validator", target_id: 501 });
    });
    const after = qc.getQueryData<{ pages: { items: Record<string, unknown>[] }[] }>(["directory"]);
    expect(after?.pages[0]?.items[2]).toMatchObject({
      viewer_is_watching: true,
      viewer_watch: { follow_id: 77, source: "page" },
    });
    // A member with the same id would not match a validator: kinds differ.
    expect(qc.getQueryData(["user", "dana"])).toMatchObject({ viewer_is_watching: true });
  });
});

/** The author card's button, fed from the cached profile like AuthorCard is. */
function CachedProfileButton() {
  const { data } = useQuery<MemberProfile>({
    queryKey: ["user", "dana"],
    queryFn: () => new Promise<MemberProfile>(() => {}),
    staleTime: Infinity,
  });
  return (
    <MemberFollowButton
      userId={42}
      name="Dana Reyes"
      viewerIsWatching={data?.viewer_is_watching}
      viewerWatch={data?.viewer_watch}
    />
  );
}

describe("remount after a toggle", () => {
  it("re-opening the author card after an unwatch shows Watch, not the stale Watching", async () => {
    const first = render(<CachedProfileButton />, { wrapper });
    fireEvent.click(screen.getByRole("button", { name: "Stop watching Dana Reyes" }));
    await waitFor(() => expect(unwatchCard).toHaveBeenCalledWith(9100, "peepso"));
    first.unmount();

    render(<CachedProfileButton />, { wrapper });
    await waitFor(() => expect(screen.getByRole("button", { name: "Watch Dana Reyes" })).toBeInTheDocument());
  });
});
