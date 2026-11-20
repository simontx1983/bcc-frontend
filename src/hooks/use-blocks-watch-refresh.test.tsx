/**
 * F-261 (audit M15) — after a block, nothing still says "Watching".
 *
 * The server removes follows in BOTH directions on a new block (F-29,
 * MyBlocksEndpoint → severFollowsBetween). The block mutation used to
 * refresh only the blocks list and the feeds, so every cached copy of that
 * member (a card, a profile) kept `viewer_is_watching: true` until a
 * reload. Now a block writes "not watching" into those copies and re-reads
 * the watching list and suggestions; an unblock (which restores nothing)
 * re-reads suggestions.
 *
 * The REAL hooks against a real QueryClient; only the endpoint is mocked.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const h = vi.hoisted(() => ({ blockUser: vi.fn(), unblockUser: vi.fn() }));
vi.mock("@/lib/api/blocks-endpoints", () => ({
  blockUser: (...a: unknown[]) => h.blockUser(...a),
  unblockUser: (...a: unknown[]) => h.unblockUser(...a),
  getMyBlocks: vi.fn(),
}));

const { useBlockUser, useUnblockUser, MY_BLOCKS_QUERY_KEY_ROOT } = await import("@/hooks/useBlocks");
const { WATCHING_QUERY_KEY_ROOT } = await import("@/hooks/useWatching");
const { SUGGESTED_MEMBERS_QUERY_KEY } = await import("@/hooks/useSuggestedMembers");

const WATCH = { follow_id: 9100, source: "peepso" };
const PROFILE_KEY = ["users", "jo-welds"];
const CARD_KEY = ["cards", "member", 42];
const OTHER_KEY = ["cards", "member", 43];
const WATCHING_KEY = [...WATCHING_QUERY_KEY_ROOT, "list"];

function seeded() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(PROFILE_KEY, { id: 42, user_id: 42, handle: "jo-welds", viewer_is_watching: true, viewer_watch: WATCH });
  client.setQueryData(CARD_KEY, { card_kind: "member", id: 42, viewer_is_watching: true, viewer_watch: WATCH });
  client.setQueryData(OTHER_KEY, { card_kind: "member", id: 43, viewer_is_watching: true, viewer_watch: WATCH });
  client.setQueryData(WATCHING_KEY, { items: [] });
  client.setQueryData([...SUGGESTED_MEMBERS_QUERY_KEY], { items: [] });
  client.setQueryData([...MY_BLOCKS_QUERY_KEY_ROOT, 1], { items: [] });
  return client;
}

function wrap(client: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

const invalidated = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

beforeEach(() => {
  h.blockUser.mockReset().mockResolvedValue({ ok: true, user_id: 42, state: "created" });
  h.unblockUser.mockReset().mockResolvedValue({ ok: true, user_id: 42, removed: true });
});

describe("useBlockUser — a block ends watching both ways (F-29)", () => {
  it("every cached copy of that member reads not-watching at once", async () => {
    const client = seeded();
    const { result } = renderHook(() => useBlockUser(), { wrapper: wrap(client) });
    await act(async () => { await result.current.mutateAsync(42); });

    expect(client.getQueryData(PROFILE_KEY)).toMatchObject({ viewer_is_watching: false, viewer_watch: null });
    expect(client.getQueryData(CARD_KEY)).toMatchObject({ viewer_is_watching: false, viewer_watch: null });
    // Another member is untouched.
    expect(client.getQueryData(OTHER_KEY)).toMatchObject({ viewer_is_watching: true, viewer_watch: WATCH });
  });

  it("re-reads the watching list and suggestions, as well as the blocks list", async () => {
    const client = seeded();
    const { result } = renderHook(() => useBlockUser(), { wrapper: wrap(client) });
    await act(async () => { await result.current.mutateAsync(42); });

    expect(invalidated(client, WATCHING_KEY)).toBe(true);
    expect(invalidated(client, [...SUGGESTED_MEMBERS_QUERY_KEY])).toBe(true);
    expect(invalidated(client, [...MY_BLOCKS_QUERY_KEY_ROOT, 1])).toBe(true);
  });

  it("a failed block changes nothing", async () => {
    h.blockUser.mockRejectedValue(new Error("x"));
    const client = seeded();
    const { result } = renderHook(() => useBlockUser(), { wrapper: wrap(client) });
    await act(async () => { await result.current.mutateAsync(42).catch(() => {}); });

    expect(client.getQueryData(PROFILE_KEY)).toMatchObject({ viewer_is_watching: true });
    expect(invalidated(client, WATCHING_KEY)).toBe(false);
  });
});

describe("useUnblockUser — restores no watching", () => {
  it("re-reads suggestions and the blocks list, and leaves watching as it is", async () => {
    const client = seeded();
    const { result } = renderHook(() => useUnblockUser(), { wrapper: wrap(client) });
    await act(async () => { await result.current.mutateAsync(42); });

    expect(invalidated(client, [...SUGGESTED_MEMBERS_QUERY_KEY])).toBe(true);
    expect(invalidated(client, [...MY_BLOCKS_QUERY_KEY_ROOT, 1])).toBe(true);
    expect(client.getQueryData(PROFILE_KEY)).toMatchObject({ viewer_is_watching: true });
  });
});
