/**
 * F-275: both post permalink routes, `/post/[id]` and
 * `/u/[handle]/post/[shortcode]`, answer a 503 `bcc_unavailable` from
 * `GET /feed/{id}` in place, with the retry state.
 *
 * Before, the page mapped a 404 to `notFound()` and rethrew everything
 * else. With no error boundary under `(detail)`, a rethrow lands on
 * `app/global-error.tsx`, which replaces the whole document: no chrome, no
 * retry, no way back. These pin the three outcomes on both routes:
 *   503 → the retry state, with the route's own id;
 *   404 → notFound(), unchanged;
 *   anything else → rethrown, unchanged.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const getFeedItemById = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: async () => null }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("@/lib/api/feed-endpoints", () => ({ getFeedItemById }));
vi.mock("@/lib/og/post-metadata", () => ({ buildPostMetadata: async () => ({}) }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/components/feed/PostBackButton", () => ({ PostBackButton: () => null }));
vi.mock("@/components/feed/PostRailRegistrar", () => ({ PostRailRegistrar: () => null }));
vi.mock("@/components/feed/PostDetail", () => ({
  PostDetail: ({ item }: { item: { id: string } }) => (
    <p data-testid="post-detail">{item.id}</p>
  ),
}));
vi.mock("@/components/feed/PostUnavailable", () => ({
  PostUnavailable: ({ routeId, focusComposer }: { routeId: string; focusComposer: boolean }) => (
    <p data-testid="post-unavailable" data-route-id={routeId} data-focus={String(focusComposer)} />
  ),
}));

import PostByShortcodePage from "@/app/(main)/(detail)/u/[handle]/post/[shortcode]/page";
import PostPage from "@/app/(main)/(detail)/post/[id]/page";

type Run = (intent?: string) => Promise<React.ReactElement>;

const ROUTES: Array<{ name: string; routeId: string; run: Run }> = [
  {
    name: "/post/[id]",
    routeId: "42",
    run: (intent) =>
      PostPage({
        params: Promise.resolve({ id: "42" }),
        searchParams: Promise.resolve(intent === undefined ? {} : { intent }),
      }),
  },
  {
    name: "/u/[handle]/post/[shortcode]",
    routeId: "ABCDEFGH",
    run: (intent) =>
      PostByShortcodePage({
        params: Promise.resolve({ handle: "anvil", shortcode: "ABCDEFGH" }),
        searchParams: Promise.resolve(intent === undefined ? {} : { intent }),
      }),
  },
];

afterEach(() => {
  cleanup();
  getFeedItemById.mockReset();
});

describe.each(ROUTES)("$name", ({ routeId, run }) => {
  it("a 503 renders the retry state in place, for this route's id", async () => {
    getFeedItemById.mockRejectedValue(
      new BccApiError("bcc_unavailable", "This post is temporarily unavailable.", 503, null),
    );
    render(await run());
    const state = screen.getByTestId("post-unavailable");
    expect(state).toHaveAttribute("data-route-id", routeId);
    expect(state).toHaveAttribute("data-focus", "false");
    expect(screen.queryByTestId("post-detail")).toBeNull();
  });

  it("keeps ?intent=comment for the post a retry brings back", async () => {
    getFeedItemById.mockRejectedValue(
      new BccApiError("bcc_unavailable", "x", 503, null),
    );
    render(await run("comment"));
    expect(screen.getByTestId("post-unavailable")).toHaveAttribute("data-focus", "true");
  });

  // A host-level 503 (LiteSpeed, a proxy) never reaches the BCC envelope.
  // It must not fall through to global-error either.
  it.each([["bcc_invalid_response"], ["bcc_unexpected_status"]])(
    "a host-level 503 with no envelope (%s) gets the same retry state",
    async (code) => {
      getFeedItemById.mockRejectedValue(new BccApiError(code, "x", 503, null));
      render(await run());
      expect(screen.getByTestId("post-unavailable")).toHaveAttribute("data-route-id", routeId);
    },
  );

  it("control: a code-less 502 is still rethrown", async () => {
    getFeedItemById.mockRejectedValue(new BccApiError("bcc_invalid_response", "x", 502, null));
    await expect(run()).rejects.toThrow("x");
  });

  it("a 404 is still notFound()", async () => {
    getFeedItemById.mockRejectedValue(new BccApiError("bcc_not_found", "x", 404, null));
    await expect(run()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("any other failure is still rethrown, not dressed up as a 503", async () => {
    getFeedItemById.mockRejectedValue(new BccApiError("bcc_internal_error", "x", 500, null));
    await expect(run()).rejects.toThrow("x");
  });

  it("control: a successful read renders the post", async () => {
    getFeedItemById.mockResolvedValue({ id: "feed_42", author: { handle: "anvil" } });
    render(await run());
    expect(screen.getByTestId("post-detail")).toHaveTextContent("feed_42");
    expect(screen.queryByTestId("post-unavailable")).toBeNull();
  });
});
