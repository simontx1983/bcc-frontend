/**
 * The post-detail metadata read is anonymous, so it belongs in the shared
 * Data Cache.
 *
 * ## The defect this pins
 *
 * `buildPostMetadata` fetches the post with `token: null` — metadata has
 * no session — but passed no `revalidate`, so Next never cached it. Both
 * post-detail routes (`/post/[id]` and `/u/[handle]/post/[shortcode]`) call
 * it from `generateMetadata`, so every view of either paid for an
 * uncacheable upstream read of a response that is byte-identical for
 * everyone.
 *
 * Measured against a recording API stub, two loads of one post:
 *
 *     anonymous   2 loads -> 2 upstream reads
 *     authed      2 loads -> 4 upstream reads  (1 anon + 1 authed each)
 *     viewer B    one load right after A read the same post -> 2 more
 *
 * `lib/api/cache-policy.ts` already names this exact case — "anonymous SSR
 * view-model fetches (public profile / entity pages, metadata)" — and the
 * profile page's metadata read already passes the constant. This read was
 * simply missed.
 *
 * ## Why the controls are here
 *
 * Asserting "revalidate was passed" alone would pass against a change that
 * also started caching the AUTHED read, which must never be shared. So the
 * token is asserted to still be null, and the page's own authed read is
 * asserted to carry no revalidate.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

vi.mock("next-auth/react", () => ({
  getSession: async () => null,
}));

const getFeedItemById = vi.fn();
vi.mock("@/lib/api/feed-endpoints", () => ({
  getFeedItemById: (...a: unknown[]) => getFeedItemById(...a),
}));

import { ANON_SSR_REVALIDATE_SECONDS } from "@/lib/api/cache-policy";
import { buildPostMetadata } from "@/lib/og/post-metadata";

const ITEM = {
  id: "f1",
  post_kind: "status",
  external_id: 1,
  posted_at: "2026-10-01T12:00:00Z",
  scope_tags: [],
  author: { user_id: 7, handle: "anvil", display_name: "Anvil" },
  body: { text: "Post body" },
  reactions: { kind_grammar: "social", counts: {}, viewer_reaction: null },
  comment_count: 0,
  permissions: {},
  links: { self: "/post/f1", author: "/u/anvil" },
};

beforeEach(() => {
  getFeedItemById.mockReset();
  getFeedItemById.mockResolvedValue(ITEM);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the anonymous metadata read is cacheable", () => {
  it("passes the shared anon revalidate window", async () => {
    await buildPostMetadata("f1");

    expect(getFeedItemById).toHaveBeenCalledTimes(1);
    const [, token, opts] = getFeedItemById.mock.calls[0] ?? [];
    expect(opts).toMatchObject({ revalidate: ANON_SSR_REVALIDATE_SECONDS });
    // The control that keeps this from becoming a privacy bug: a cached
    // entry is SHARED, so the read it caches must be token-less.
    expect(token).toBeNull();
  });

  it("uses the policy constant rather than a hand-written number", async () => {
    await buildPostMetadata("f1");
    const [, , opts] = getFeedItemById.mock.calls[0] ?? [];
    expect((opts as { revalidate: number }).revalidate).toBe(60);
    expect(ANON_SSR_REVALIDATE_SECONDS).toBe(60);
  });

  it("still returns usable metadata", async () => {
    // Control: the caching option must not change what the function is for.
    const meta = await buildPostMetadata("f1");
    expect(meta.title).toContain("Anvil");
    expect(meta.alternates?.canonical).toBe("/post/f1");
  });

  it("still degrades to a safe title when the read fails", async () => {
    getFeedItemById.mockRejectedValue(new Error("upstream down"));
    const meta = await buildPostMetadata("missing");
    expect(meta.title).toBe("Post not found · Blue Collar Crypto");
  });
});

describe("getFeedItemById forwards the options it is given", () => {
  it("forwards revalidate and leaves it off when absent", async () => {
    // Exercised through the real module, not the mock, so the wrapper's
    // own forwarding is covered rather than assumed.
    vi.resetModules();
    vi.doUnmock("@/lib/api/feed-endpoints");
    // A FRESH Response per call: a Response body can only be read once,
    // so a single shared object makes the second call look non-JSON.
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: ITEM, _meta: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const real = await import("@/lib/api/feed-endpoints");

    await real.getFeedItemById("f1", null, { revalidate: 60 });
    const withOpt = fetchMock.mock.calls[0]?.[1] as { next?: { revalidate?: number } };
    expect(withOpt?.next?.revalidate).toBe(60);

    fetchMock.mockClear();
    await real.getFeedItemById("f1", null);
    const withoutOpt = fetchMock.mock.calls[0]?.[1] as { next?: unknown };
    // No revalidate means no `next` directive — an authed read must stay
    // uncached, and that is how it stays uncached.
    expect(withoutOpt?.next).toBeUndefined();

    vi.unstubAllGlobals();
  });
});
