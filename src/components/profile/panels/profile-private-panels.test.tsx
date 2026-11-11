/**
 * F-02 (contract v1.91) — profile tab panels on a private profile.
 *
 * A panel can still hit `profile_private` when the owner changes their
 * visibility mid-session. Each panel must then show the calm private line
 * with no Retry, while `bcc_permission_denied` — the viewer's own standing,
 * or `watching_hidden` on the follow lists — keeps its existing state.
 *
 * Hooks are driven through their flags, as in the sibling failure tests.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type ApiErrorBody } from "@/lib/api/types";
import type * as ReactQueryModule from "@tanstack/react-query";

const state = vi.hoisted(() => ({
  reviews: null as unknown,
  activity: null as unknown,
  followers: null as unknown,
  endorsements: null as unknown,
  blog: null as unknown,
}));

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQueryModule>()),
  useQueryClient: () => ({ removeQueries: () => {} }),
}));
vi.mock("@/hooks/useUserActivity", () => ({
  USER_ACTIVITY_QUERY_KEY_ROOT: ["users", "activity"],
  useUserReviews: () => state.reviews,
  useUserActivity: () => state.activity,
  useUserFollowers: () => state.followers,
  useUserFollowing: () => state.followers,
  useUserEndorsements: () => state.endorsements,
}));
vi.mock("@/hooks/useUserBlog", () => ({ useUserBlog: () => state.blog }));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("@/components/composer/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/profile/LivingHeader", () => ({ LivingHeader: () => null }));
vi.mock("@/components/feed/FeedItemCard", () => ({
  FeedItemCard: ({ item }: { item: { id: number } }) => (
    <article data-testid="wall-row">post {item.id}</article>
  ),
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/cards/CardGrid", () => ({ CardGrid: () => null }));

import { UserBlogList } from "@/components/blog/UserBlogList";
import { EndorsementsGivenView } from "@/components/profile/EndorsementsGivenView";
import { ActivityPanel } from "@/components/profile/panels/ActivityPanel";
import { ReviewsPanel } from "@/components/profile/panels/ReviewsPanel";
import { WatchingPanel } from "@/components/profile/panels/WatchingPanel";

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const refetch = vi.fn();
const fetchNextPage = vi.fn();

beforeEach(() => {
  refetch.mockClear();
  fetchNextPage.mockClear();
});

afterEach(() => {
  cleanup();
});

function apiError(code: string, status: number, data?: Record<string, unknown>): BccApiError {
  const body: ApiErrorBody = {
    error: { code, message: "raw server text", status, ...(data !== undefined ? { data } : {}) },
    _meta: {} as ApiErrorBody["_meta"],
  };
  return new BccApiError(code, "raw server text", status, body);
}

const PRIVATE = () => apiError("bcc_forbidden", 403, { reason: "profile_private" });
const DENIED = () => apiError("bcc_permission_denied", 403);

/** A failed FIRST load of a plain query. */
const failedFirstLoad = (error: BccApiError) => ({
  isError: true,
  isLoadingError: true,
  isRefetchError: false,
  isPending: false,
  isLoading: false,
  isSuccess: false,
  data: undefined,
  error,
  refetch,
});

/** A failed FIRST load of an infinite query. */
const failedInfinite = (error: BccApiError) => ({
  ...failedFirstLoad(error),
  isFetchNextPageError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage,
});

function expectPrivateLine() {
  const status = screen.getByTestId("profile-private");
  expect(status).toHaveAttribute("role", "status");
  expect(status.textContent).toContain("This profile is private.");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  expect(document.body.textContent ?? "").not.toContain("raw server text");
}

describe("ReviewsPanel", () => {
  it("profile_private shows the private line, no Retry", () => {
    state.reviews = failedFirstLoad(PRIVATE());
    render(<ReviewsPanel handle="alice" />);
    expectPrivateLine();
  });

  it("bcc_permission_denied keeps its existing failure state", () => {
    state.reviews = failedFirstLoad(DENIED());
    render(<ReviewsPanel handle="alice" />);
    expect(screen.queryByTestId("profile-private")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Couldn't load reviews.");
    // Unchanged: this panel has always offered Retry on that code.
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("WatchingPanel", () => {
  it("profile_private wins over the watching_hidden state", () => {
    state.followers = failedFirstLoad(PRIVATE());
    render(<WatchingPanel handle="alice" displayName="Alice" direction="followers" />);
    expectPrivateLine();
    expect(screen.queryByText(/keeps their watchers private/i)).toBeNull();
  });

  it("bcc_permission_denied (watching_hidden) still shows the private-list state", () => {
    state.followers = failedFirstLoad(DENIED());
    render(<WatchingPanel handle="alice" displayName="Alice" direction="followers" />);
    expect(screen.queryByTestId("profile-private")).toBeNull();
    expect(screen.getByText("Alice keeps their watchers private.")).toBeInTheDocument();
  });
});

describe("ActivityPanel", () => {
  it("profile_private on first load shows the private line, no Retry", () => {
    state.activity = failedInfinite(PRIVATE());
    render(<ActivityPanel handle="alice" />);
    expectPrivateLine();
  });

  it("a profile_private REFRESH of a loaded wall withdraws it to the private line", () => {
    state.activity = {
      ...failedInfinite(PRIVATE()),
      isLoadingError: false,
      isRefetchError: true,
      data: { pages: [{ items: [{ id: 1 }], pagination: { has_more: false, next_cursor: null } }] },
    };
    render(<ActivityPanel handle="alice" />);
    expect(screen.queryByTestId("wall-row")).toBeNull();
    expectPrivateLine();
  });

  it("bcc_permission_denied keeps its denial copy", () => {
    state.activity = failedInfinite(DENIED());
    render(<ActivityPanel handle="alice" />);
    expect(screen.queryByTestId("profile-private")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("You can’t view this wall.");
  });
});

describe("UserBlogList (Blog tab)", () => {
  it("profile_private shows the private line, no Retry", () => {
    state.blog = failedInfinite(PRIVATE());
    render(<UserBlogList handle="alice" />);
    expectPrivateLine();
  });

  it("other failures keep their Retry", () => {
    state.blog = failedInfinite(apiError("bcc_unavailable", 503));
    render(<UserBlogList handle="alice" />);
    expect(screen.queryByTestId("profile-private")).toBeNull();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("EndorsementsGivenView (Backing → Given)", () => {
  it("profile_private does not claim the member has vouched for nothing", () => {
    state.endorsements = { data: undefined, error: PRIVATE() };
    render(<EndorsementsGivenView handle="alice" />);
    expectPrivateLine();
    expect(screen.queryByText(/Hasn.t vouched/)).toBeNull();
  });
});
