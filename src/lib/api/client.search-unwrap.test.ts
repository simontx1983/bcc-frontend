import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

/**
 * Shape-tolerance regression for bccSearchFetchAsClient (2026-08-05).
 *
 * Wire reality: bcc-trust's Envelope wraps every /bcc/v1/* response —
 * including bcc-search's legacy routes — as { data, _meta } (success)
 * / { error: { code, message, status } } (errors). The old client read
 * the raw { results } shape only, so every consumer (the /search
 * verticals + both trending surfaces) silently rendered EMPTY, and
 * every error collapsed to the synthetic `bcc_search_unavailable`
 * code. These tests pin the tolerant unwrap in both directions: the
 * enveloped wire shape AND the originally-documented raw shape must
 * both work, so a future server-side envelope exemption can't break
 * this surface again.
 */

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

vi.mock("next-auth/react", () => ({
  getSession: async () => null,
}));

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "X-Request-Id": "req-1" },
  });

const RESULTS = {
  results: [{ id: 17, name: "Cosmos Hall", slug: "cosmos-hall" }],
  meta: { count: 1, query: "cosmos" },
};

describe("bccSearchFetchAsClient shape tolerance", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function call() {
    const { bccSearchFetchAsClient } = await import("@/lib/api/client");
    return bccSearchFetchAsClient<typeof RESULTS>("search/groups?q=cosmos");
  }

  it("unwraps the enveloped wire shape { data, _meta }", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: RESULTS, _meta: { version: "v1" } }),
    );

    await expect(call()).resolves.toEqual(RESULTS);
  });

  it("passes the raw legacy shape { results } through unchanged", async () => {
    fetchMock.mockResolvedValue(jsonResponse(RESULTS));

    await expect(call()).resolves.toEqual(RESULTS);
  });

  it("surfaces the REAL code from an enveloped error", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: "bcc_rate_limited",
            message: "Too many requests. Please wait a few seconds.",
            status: 429,
          },
        },
        429,
      ),
    );

    const err = await call().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BccApiError);
    expect((err as BccApiError).code).toBe("bcc_rate_limited");
    expect((err as BccApiError).status).toBe(429);
  });

  it("still maps a raw legacy WP error body", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: "dependency_unavailable",
          message: "PeepSo not loaded.",
          data: { status: 503 },
        },
        503,
      ),
    );

    const err = await call().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BccApiError);
    expect((err as BccApiError).code).toBe("dependency_unavailable");
    expect((err as BccApiError).status).toBe(503);
  });
});
