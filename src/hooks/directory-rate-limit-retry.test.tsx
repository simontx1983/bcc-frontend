/**
 * bcc-trust #716: `GET /cards?q=` is throttled at 10 per 5 s per caller.
 * The directory (and /validators, same hook) treats a 429 as "wait a
 * moment": it retries after a pause instead of showing the load failure,
 * and says so meanwhile. Any other error keeps the app-wide single retry.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
const getCardsList = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/cards-list-endpoints", () => ({ getCardsList }));
vi.mock("@/components/cards/CardGridSkeleton", () => ({
  CardGridSkeleton: ({ ariaLabel }: { ariaLabel: string }) => <div aria-label={ariaLabel} />,
}));

import {
  DIRECTORY_THROTTLED_COPY,
  DirectoryThrottleNotice,
  isDirectoryThrottled,
} from "@/components/directory/DirectoryGrid";
import { useDirectory, type DirectoryFilters } from "@/hooks/useDirectory";
import {
  RATE_LIMIT_RETRY_DELAYS_MS,
  rateLimitedRetryDelay,
  retryRateLimitedRead,
} from "@/lib/api/errors";
import { BccApiError } from "@/lib/api/types";

const rateLimited = () => new BccApiError("bcc_rate_limited", "x", 429, null);
const serverError = () => new BccApiError("bcc_internal_error", "x", 500, null);

const filters: DirectoryFilters = {
  kind: "validator",
  tier: null,
  sort: "trust",
  q: "atlas",
  goodStandingOnly: false,
  chain: null,
};

const page = { items: [], pagination: { page: 1, has_more: false } };

// The app's own default (providers.tsx): one retry. A bare QueryClient
// retries 3 times, which would hide a hook that forgot its 429 policy.
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  getCardsList.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("the retry policy", () => {
  it("a 429 is retried after each pause; anything else once", () => {
    const n = RATE_LIMIT_RETRY_DELAYS_MS.length;
    expect(retryRateLimitedRead(n - 1, rateLimited())).toBe(true);
    expect(retryRateLimitedRead(n, rateLimited())).toBe(false);
    expect(retryRateLimitedRead(0, serverError())).toBe(true);
    expect(retryRateLimitedRead(1, serverError())).toBe(false);
    expect(RATE_LIMIT_RETRY_DELAYS_MS.map((_, i) => rateLimitedRetryDelay(i, rateLimited()))).toEqual([
      2_000, 4_000, 6_000,
    ]);
    expect(rateLimitedRetryDelay(0, serverError())).toBe(1_000);
  });
});

describe("useDirectory", () => {
  it("two 429s, then results: never a load failure", async () => {
    getCardsList
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValueOnce(page);
    const sawFailure: boolean[] = [];
    const { result } = renderHook(
      () => {
        const q = useDirectory(filters);
        sawFailure.push(q.isLoadingError);
        return q;
      },
      { wrapper },
    );
    // React Query delivers state through a setTimeout(0) scheduler, which
    // fake timers also hold: advance in small steps so every hop flushes.
    const advance = async (ms: number) => {
      for (let t = 0; t < ms; t += 250) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(250);
        });
      }
    };
    await advance(500);
    expect(result.current.isLoading).toBe(true);
    await advance(2_000 + 4_000 + 500);
    expect(getCardsList).toHaveBeenCalledTimes(3);
    expect(result.current.isSuccess).toBe(true);
    expect(sawFailure.some(Boolean)).toBe(false);
  });

  it("a server error still fails after the single retry", async () => {
    getCardsList.mockRejectedValue(serverError());
    const { result } = renderHook(() => useDirectory(filters), { wrapper });
    for (let t = 0; t < 2_000; t += 250) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250);
      });
    }
    expect(getCardsList).toHaveBeenCalledTimes(2);
    expect(result.current.isLoadingError).toBe(true);
  });
});

describe("the throttle notice (always mounted)", () => {
  it("is in the page, empty and visually hidden, before anything is throttled", () => {
    render(<DirectoryThrottleNotice throttled={false} />);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("");
    expect(region).toHaveClass("sr-only");
  });

  it("the same region receives the text when a search is throttled", () => {
    const { rerender } = render(<DirectoryThrottleNotice throttled={false} />);
    const region = screen.getByRole("status");
    rerender(<DirectoryThrottleNotice throttled />);
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent(DIRECTORY_THROTTLED_COPY);
    expect(region).not.toHaveClass("sr-only");
  });

  it("keys on a throttled FIRST load only", () => {
    expect(isDirectoryThrottled({ isLoading: true, failureReason: rateLimited() } as never)).toBe(true);
    expect(isDirectoryThrottled({ isLoading: true, failureReason: serverError() } as never)).toBe(false);
    expect(isDirectoryThrottled({ isLoading: false, failureReason: rateLimited() } as never)).toBe(false);
  });
});

describe("Retry-After (contract §1.4.4, F-289)", () => {
  const limited = (seconds: unknown) =>
    new BccApiError("bcc_rate_limited", "x", 429, {
      error: { code: "bcc_rate_limited", message: "x", status: 429, data: { retry_after_seconds: seconds } },
    } as never);

  it("waits the server's retry_after_seconds plus a small margin", () => {
    expect(rateLimitedRetryDelay(0, limited(3))).toBe(3_250);
    expect(rateLimitedRetryDelay(2, limited(1))).toBe(1_250);
  });

  it("caps it, and falls back to the fixed pauses when absent or unusable", () => {
    expect(rateLimitedRetryDelay(0, limited(600))).toBe(30_000);
    expect(rateLimitedRetryDelay(1, limited(0))).toBe(4_000);
    expect(rateLimitedRetryDelay(1, limited("5"))).toBe(4_000);
    expect(rateLimitedRetryDelay(0, rateLimited())).toBe(2_000);
  });
});
