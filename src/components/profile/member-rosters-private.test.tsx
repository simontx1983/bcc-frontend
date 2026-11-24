/**
 * v1.168 (bcc-trust #720): a member's received vouches and reviews, and
 * watching them, answer to the member's profile privacy.
 *
 * `GET /entities/user_profile/:id/{attestations,reviews}` and
 * `POST /me/watching/watch` (member) answer `403 bcc_forbidden` with
 * `reason: "profile_private"` when the member's profile does not admit the
 * viewer. That is the owner's choice, not a failure:
 *   - the Reviews tab shows "Reviews are hidden." (role=status, no alert,
 *     no Retry) wherever the refusal arrives — first load, a refresh of
 *     reviews already shown (which also withdraws them), a later page;
 *   - the Vouches roster shows "Vouches are hidden." — never the empty
 *     invitation, which would claim nobody has vouched;
 *   - a Watch says the profile is private, while every other 403 keeps
 *     the generic line that never reveals a block;
 *   - each read is asked ONCE, not retried.
 * A plain `bcc_forbidden` keeps its existing failure line.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ReactQueryModule from "@tanstack/react-query";
import { BccApiError } from "@/lib/api/types";

const removeQueries = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({
  reviews: null as unknown,
  roster: null as unknown,
}));
const api = vi.hoisted(() => ({ getCardReviews: vi.fn(), getAttestationRoster: vi.fn() }));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const real = await importOriginal<typeof ReactQueryModule>();
  return {
    ...real,
    // Panel tests swap the client for the gate's removal spy; the hook
    // tests build a real QueryClient and pass it through the provider.
    useQueryClient: (...args: Parameters<typeof real.useQueryClient>) =>
      state.reviews === "REAL" || state.roster === "REAL" ? real.useQueryClient(...args) : { removeQueries },
  };
});
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/lib/api/card-tabs-endpoints", () => ({
  getCardReviews: (...a: unknown[]) => api.getCardReviews(...a),
  getCardWatchers: vi.fn(),
}));
vi.mock("@/lib/api/attestations-endpoints", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getAttestationRoster: (...a: unknown[]) => api.getAttestationRoster(...a),
}));

vi.mock("@/hooks/useCardTabs", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    useCardReviews: (...a: unknown[]) =>
      state.reviews === "REAL"
        ? (real["useCardReviews"] as (...x: unknown[]) => unknown)(...a)
        : state.reviews,
  };
});
vi.mock("@/hooks/useAttestationRoster", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    useAttestationRoster: (...a: unknown[]) =>
      state.roster === "REAL"
        ? (real["useAttestationRoster"] as (...x: unknown[]) => unknown)(...a)
        : state.roster,
  };
});

const { CardReviewsPanel } = await import("@/components/entity/panels/CardReviewsPanel");
const { AttestationRoster } = await import("@/components/profile/AttestationRoster");
const { useCardReviews } = await import("@/hooks/useCardTabs");
const { useAttestationRoster } = await import("@/hooks/useAttestationRoster");
const { watchErrorCopy } = await import("@/hooks/useWatch");
const { FOLLOW_COPY } = await import("@/lib/copy");

function privateErr(): BccApiError {
  return new BccApiError("bcc_forbidden", "This profile is private.", 403, {
    error: { code: "bcc_forbidden", message: "This profile is private.", data: { reason: "profile_private" } },
  } as never);
}
function plainForbidden(): BccApiError {
  return new BccApiError("bcc_forbidden", "Forbidden.", 403, {
    error: { code: "bcc_forbidden", message: "Forbidden." },
  } as never);
}

const reviewsPage = (ids: number[]) => ({
  items: ids.map((id) => ({
    id,
    grade: "A" as const,
    text: "Solid work " + id,
    posted_at_label: "2 days ago",
    author: { id: 100 + id, handle: "m" + id, display_name: "Member " + id },
  })),
  pagination: { page: 1, per_page: 20, total: 40, total_pages: 2 },
});

type Branch = "first" | "refetch" | "next";
function failingReviews(pages: unknown[], branch: Branch, error: BccApiError) {
  return {
    isPending: false,
    isError: true,
    isRefetchError: branch === "refetch",
    error,
    data: branch === "first" ? undefined : { pages },
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  };
}

const renderReviews = () =>
  render(<CardReviewsPanel kind="user_profile" cardId={7} cardName="Jo Welder" />);
const retryBtn = () => screen.queryByRole("button", { name: /retry/i });

const VOUCH_EMPTY = "No one has vouched for Jo yet.";
const renderRoster = () =>
  render(<AttestationRoster targetKind="user_profile" targetId={7} emptyState={{ body: VOUCH_EMPTY }} />);

beforeEach(() => {
  vi.clearAllMocks();
  state.reviews = null;
  state.roster = null;
});
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────

describe("Reviews tab: the member's profile is not viewable", () => {
  it("first load: the calm hidden state, no alert and no Retry", () => {
    state.reviews = failingReviews([], "first", privateErr());
    renderReviews();
    const notice = screen.getByTestId("profile-private");
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent("Reviews are hidden.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(retryBtn()).toBeNull();
  });

  it("a refresh of reviews on screen withdraws them and shows the hidden state", () => {
    state.reviews = failingReviews([reviewsPage([1, 2])], "refetch", privateErr());
    renderReviews();
    expect(screen.getByTestId("profile-private")).toHaveTextContent("Reviews are hidden.");
    expect(screen.queryByText("Solid work 1")).toBeNull();
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ["entities", "reviews", "user_profile", 7],
      exact: true,
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a later page: the reviews read so far stay, and the foot says hidden, no Retry", () => {
    state.reviews = failingReviews([reviewsPage([1, 2])], "next", privateErr());
    renderReviews();
    expect(screen.getByText("Solid work 1")).toBeInTheDocument();
    expect(screen.getByTestId("profile-private")).toHaveTextContent("Reviews are hidden.");
    expect(retryBtn()).toBeNull();
  });

  it("a plain bcc_forbidden keeps its existing failure line", () => {
    state.reviews = failingReviews([], "first", plainForbidden());
    renderReviews();
    expect(screen.queryByTestId("profile-private")).toBeNull();
    expect(screen.getByText("You can’t read reviews of this card.")).toBeInTheDocument();
  });
});

describe("Vouches roster: the member's profile is not viewable", () => {
  it("shows the hidden state, never the empty invitation", () => {
    state.roster = { data: undefined, isLoading: false, error: privateErr() };
    renderRoster();
    const notice = screen.getByTestId("profile-private");
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent("Vouches are hidden.");
    expect(screen.queryByText(VOUCH_EMPTY)).toBeNull();
  });

  it("stops showing rows already on screen once a refresh says private", () => {
    state.roster = {
      data: { items: [{ id: 1, revoked_at: null, attestor: { handle: "m1" } }] },
      isLoading: false,
      error: privateErr(),
    };
    renderRoster();
    expect(screen.getByTestId("profile-private")).toHaveTextContent("Vouches are hidden.");
    expect(screen.queryByRole("region", { name: "Attestation roster" })).toBeNull();
  });

  it("any other failure keeps today's empty treatment", () => {
    state.roster = { data: undefined, isLoading: false, error: plainForbidden() };
    renderRoster();
    expect(screen.queryByTestId("profile-private")).toBeNull();
    expect(screen.getByText(VOUCH_EMPTY)).toBeInTheDocument();
  });
});

describe("Watch: the member's profile is not viewable", () => {
  it("says the profile is private", () => {
    expect(watchErrorCopy(privateErr(), "watch")).toBe("This profile is private, so it can't be watched.");
    expect(FOLLOW_COPY.private).toBe("This profile is private, so it can't be watched.");
  });

  it("every other 403 keeps the generic line (never reveals a block)", () => {
    expect(watchErrorCopy(plainForbidden(), "watch")).toBe(FOLLOW_COPY.refused);
  });

  it("an unwatch is never told 'private'", () => {
    expect(watchErrorCopy(privateErr(), "unwatch")).toBe(FOLLOW_COPY.failed);
  });
});

describe("each read is asked once on a private profile", () => {
  function wrapper() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: 3, retryDelay: 0 } } });
    function Wrapper({ children }: { children: ReactNode }) {
      return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    }
    return Wrapper;
  }

  it("received reviews", async () => {
    state.reviews = "REAL";
    api.getCardReviews.mockRejectedValue(privateErr());
    const { result } = renderHook(() => useCardReviews("user_profile", 7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.getCardReviews).toHaveBeenCalledTimes(1);
  });

  it("received vouches", async () => {
    state.roster = "REAL";
    api.getAttestationRoster.mockRejectedValue(privateErr());
    const { result } = renderHook(() => useAttestationRoster("user_profile", 7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(api.getAttestationRoster).toHaveBeenCalledTimes(1);
  });

  it("an ordinary failure still gets the app-wide single retry", async () => {
    state.reviews = "REAL";
    api.getCardReviews.mockRejectedValue(new BccApiError("bcc_unavailable", "x", 503, null));
    const { result } = renderHook(() => useCardReviews("user_profile", 7), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.getCardReviews).toHaveBeenCalledTimes(2);
  });
});
