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

import { DirectoryGrid } from "@/components/directory/DirectoryGrid";
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

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
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

describe("DirectoryGrid while a throttled search waits", () => {
  const loading = (failureReason: unknown) =>
    ({
      isLoading: true,
      isLoadingError: false,
      isError: false,
      error: null,
      failureReason,
      data: undefined,
    }) as never;

  it("says it is busy and will try again", () => {
    render(<DirectoryGrid query={loading(rateLimited())} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Lots of searches right now. Trying again in a moment…",
    );
    expect(screen.getByLabelText("Loading directory results")).toBeInTheDocument();
  });

  it("a different first failure being retried says nothing extra", () => {
    render(<DirectoryGrid query={loading(serverError())} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
