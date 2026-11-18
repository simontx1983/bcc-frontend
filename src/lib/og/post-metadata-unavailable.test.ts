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

  it("control: a 404 still says not found", async () => {
    getFeedItemById.mockRejectedValue(
      new BccApiError("bcc_not_found", "RAW SERVER TEXT", 404, null),
    );
    const meta = await buildPostMetadata("ABCDEFGH");
    expect(meta.title).toBe("Post not found · Blue Collar Crypto");
  });
});
