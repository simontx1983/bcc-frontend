/**
 * F-275: a permalink whose read did not run (`GET /feed/{id}` → 503
 * `bcc_unavailable`) says "temporarily unavailable" and offers a retry. It
 * never says "post not found": only a 404 means that.
 *
 * The retry is a client read of the same route, so these tests drive the
 * real hook (`useFeedItemRecovery`) against a stubbed endpoint and count
 * the reads it makes.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const PATH = "/u/anvil/post/ABCDEFGH";

const getFeedItemByIdAsClient = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("@/lib/api/feed-endpoints", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getFeedItemByIdAsClient,
}));
vi.mock("next/navigation", () => ({ usePathname: () => PATH }));
vi.mock("@/components/feed/PostDetail", () => ({
  PostDetail: ({ item }: { item: { id: string } }) => (
    <p data-testid="post-detail">{item.id}</p>
  ),
}));
vi.mock("@/components/feed/PostRailRegistrar", () => ({
  PostRailRegistrar: () => null,
}));

import {
  POST_NOT_AVAILABLE_COPY,
  POST_UNAVAILABLE_COPY,
  PostUnavailable,
} from "@/components/feed/PostUnavailable";

const ITEM = { id: "feed_42", links: { self: PATH }, author: { handle: "anvil" } };

const unavailable = () =>
  new BccApiError("bcc_unavailable", "RAW SERVER TEXT", 503, null);
const notFound = () => new BccApiError("bcc_not_found", "RAW SERVER TEXT", 404, null);

let client: QueryClient;

function mount(ui: React.ReactElement = <PostUnavailable routeId="ABCDEFGH" />) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const retryBtn = () => screen.queryByRole("button", { name: /^retry$/i });

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  getFeedItemByIdAsClient.mockReset();
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe("a permalink the server could not read", () => {
  it("says temporarily unavailable, offers Retry, and never says not found", () => {
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent(POST_UNAVAILABLE_COPY);
    expect(POST_UNAVAILABLE_COPY).toBe("This post is temporarily unavailable. Try again.");
    expect(retryBtn()).not.toBeNull();
    expect(document.body.textContent).not.toMatch(/not found/i);
  });

  it("reads nothing on its own: the server already made the first attempt", () => {
    mount();
    expect(getFeedItemByIdAsClient).not.toHaveBeenCalled();
  });

  it("Retry re-reads the SAME route id and shows the post in place", async () => {
    getFeedItemByIdAsClient.mockResolvedValue(ITEM);
    mount();
    fireEvent.click(retryBtn()!);
    expect(await screen.findByTestId("post-detail")).toHaveTextContent("feed_42");
    expect(getFeedItemByIdAsClient).toHaveBeenCalledTimes(1);
    expect(getFeedItemByIdAsClient.mock.calls[0]?.[0]).toBe("ABCDEFGH");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a second press while the read is in flight sends no second read", async () => {
    let resolve: (v: unknown) => void = () => {};
    getFeedItemByIdAsClient.mockImplementation(
      () => new Promise((r) => { resolve = r; }),
    );
    mount();
    fireEvent.click(retryBtn()!);
    fireEvent.click(retryBtn()!);
    fireEvent.click(retryBtn()!);
    expect(getFeedItemByIdAsClient).toHaveBeenCalledTimes(1);
    resolve(ITEM);
    expect(await screen.findByTestId("post-detail")).toBeInTheDocument();
  });

  it("a retry that is still a 503 keeps the copy and the Retry", async () => {
    getFeedItemByIdAsClient.mockRejectedValue(unavailable());
    mount();
    fireEvent.click(retryBtn()!);
    await vi.waitFor(() => expect(getFeedItemByIdAsClient).toHaveBeenCalledTimes(1));
    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(POST_UNAVAILABLE_COPY),
    );
    expect(retryBtn()).not.toBeNull();
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");

    // And it can be pressed again.
    getFeedItemByIdAsClient.mockResolvedValue(ITEM);
    fireEvent.click(retryBtn()!);
    expect(await screen.findByTestId("post-detail")).toBeInTheDocument();
    expect(getFeedItemByIdAsClient).toHaveBeenCalledTimes(2);
  });

  it("a retry that answers 404 is terminal: no Retry against a missing post", async () => {
    getFeedItemByIdAsClient.mockRejectedValue(notFound());
    mount();
    fireEvent.click(retryBtn()!);
    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(POST_NOT_AVAILABLE_COPY),
    );
    expect(retryBtn()).toBeNull();
  });

  it("a retry that fails without a code gets the generic copy, still retryable", async () => {
    getFeedItemByIdAsClient.mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    fireEvent.click(retryBtn()!);
    await vi.waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load this post. Try again in a moment."),
    );
    expect(retryBtn()).not.toBeNull();
  });

  it("keeps a post the feed already holds instead of replacing it with an error", () => {
    // loading.tsx shows this cached copy while the server segment streams;
    // a failed server read must not take it away.
    client.setQueryData(["feed", "for_you"], {
      pages: [{ items: [ITEM], pagination: { next_cursor: null, has_more: false } }],
      pageParams: [null],
    });
    mount();
    expect(screen.getByTestId("post-detail")).toHaveTextContent("feed_42");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getFeedItemByIdAsClient).not.toHaveBeenCalled();
  });

  it("control: a cached post at a DIFFERENT path is not borrowed", () => {
    client.setQueryData(["feed", "for_you"], {
      pages: [{ items: [{ ...ITEM, links: { self: "/u/anvil/post/ZZZZZZZZ" } }], pagination: { next_cursor: null, has_more: false } }],
      pageParams: [null],
    });
    mount();
    expect(screen.queryByTestId("post-detail")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(POST_UNAVAILABLE_COPY);
  });
});
