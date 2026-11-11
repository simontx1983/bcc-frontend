/**
 * F-02 (contract v1.91) — a private profile costs ONE request, not two.
 *
 * The app-wide QueryClient default is `retry: 1`. The profile read hooks
 * override it with `retryUnlessProfilePrivate`, so the client below uses
 * that same default: a hook that forgot the override would make 2 calls.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type ApiErrorBody } from "@/lib/api/types";

const api = vi.hoisted(() => ({
  getUserReviews: vi.fn(),
  getUserActivity: vi.fn(),
  getUserBlog: vi.fn(),
}));

vi.mock("@/lib/api/user-activity-endpoints", () => ({
  getUserReviews: api.getUserReviews,
  getUserActivity: api.getUserActivity,
  getUserDisputes: vi.fn(),
  getUserGroups: vi.fn(),
  getUserEndorsements: vi.fn(),
  getUserAlbums: vi.fn(),
  getAlbumPhotos: vi.fn(),
  getUserFollowers: vi.fn(),
  getUserFollowing: vi.fn(),
}));
vi.mock("@/lib/api/blog-endpoints", () => ({ getUserBlog: api.getUserBlog }));

import { useUserActivity, useUserReviews } from "@/hooks/useUserActivity";
import { useUserBlog } from "@/hooks/useUserBlog";

function apiError(code: string, status: number, data?: Record<string, unknown>): BccApiError {
  const body: ApiErrorBody = {
    error: { code, message: "x", status, ...(data !== undefined ? { data } : {}) },
    _meta: {} as ApiErrorBody["_meta"],
  };
  return new BccApiError(code, "x", status, body);
}

const PRIVATE = () => apiError("bcc_forbidden", 403, { reason: "profile_private" });

function wrapper() {
  // Mirrors providers.tsx (`retry: 1`); retryDelay 0 keeps the test fast.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 1, retryDelay: 0, gcTime: 0 } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("profile read hooks do not retry profile_private", () => {
  it("useUserReviews (paged query) calls the fetcher exactly once", async () => {
    api.getUserReviews.mockRejectedValue(PRIVATE());
    const { result } = renderHook(() => useUserReviews("alice"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.getUserReviews).toHaveBeenCalledTimes(1);
  });

  it("useUserActivity (infinite query) calls the fetcher exactly once", async () => {
    api.getUserActivity.mockRejectedValue(PRIVATE());
    const { result } = renderHook(() => useUserActivity("alice"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.getUserActivity).toHaveBeenCalledTimes(1);
  });

  it("useUserBlog (infinite query) calls the fetcher exactly once", async () => {
    api.getUserBlog.mockRejectedValue(PRIVATE());
    const { result } = renderHook(() => useUserBlog("alice"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.getUserBlog).toHaveBeenCalledTimes(1);
  });

  it("control: any other failure still gets the single retry", async () => {
    api.getUserReviews.mockRejectedValue(apiError("bcc_permission_denied", 403));
    const { result } = renderHook(() => useUserReviews("alice"), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.getUserReviews).toHaveBeenCalledTimes(2);
  });
});
