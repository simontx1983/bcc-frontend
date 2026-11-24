/**
 * F-275: the permalink's tab title must not say "Post not found" when the
 * read did not run (503 `bcc_unavailable`). The page body offers a retry
 * for that case; a title claiming the post is gone would contradict it.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const getFeedItemById = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/lib/api/feed-endpoints", () => ({ getFeedItemById }));

import { buildPostMetadata } from "@/lib/og/post-metadata";

afterEach(() => {
  getFeedItemById.mockReset();
});

describe("the permalink title on a failed read", () => {
  it("a 503 says temporarily unavailable, never not found", async () => {
    getFeedItemById.mockRejectedValue(
      new BccApiError("bcc_unavailable", "RAW SERVER TEXT", 503, null),
    );
    const meta = await buildPostMetadata("ABCDEFGH");
    expect(meta.title).toBe("Post temporarily unavailable · Blue Collar Crypto");
    expect(String(meta.title)).not.toMatch(/not found/i);
  });

  // The page answers the 503 in place, so the document streams as HTTP
  // 200. A crawler must not index the outage as the post's page.
  it("a 503 is noindex", async () => {
    getFeedItemById.mockRejectedValue(
      new BccApiError("bcc_unavailable", "RAW SERVER TEXT", 503, null),
    );
    const meta = await buildPostMetadata("ABCDEFGH");
    expect(meta.robots).toEqual({ index: false });
  });

  it("a host-level 503 with no envelope gets the same title, noindex", async () => {
    getFeedItemById.mockRejectedValue(
      new BccApiError("bcc_invalid_response", "Non-JSON response", 503, null),
    );
    const meta = await buildPostMetadata("ABCDEFGH");
    expect(meta.title).toBe("Post temporarily unavailable · Blue Collar Crypto");
    expect(meta.robots).toEqual({ index: false });
  });

  it("control: a 404 still says not found", async () => {
    getFeedItemById.mockRejectedValue(
      new BccApiError("bcc_not_found", "RAW SERVER TEXT", 404, null),
    );
    const meta = await buildPostMetadata("ABCDEFGH");
    expect(meta.title).toBe("Post not found · Blue Collar Crypto");
    expect(meta.robots).toBeUndefined();
  });
});
