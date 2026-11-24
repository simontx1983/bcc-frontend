/**
 * F-275: a group wall whose first read failed with 503 `bcc_unavailable`
 * shows the failure with a Retry, never the empty room.
 *
 * GroupFeedSection already discriminated a first-load failure from an
 * empty result (journey-review pass); the other feed surfaces pin that in
 * their own suites (FeedBody in panel-error-states, the page wall in
 * validator-page-stream, the member wall in paginated-panel-failure-states,
 * cold start in discover-panel-failure). This wall had no such test, and
 * it is the one with the most empty-state copy to fall back to: three
 * founder-chair headings, the non-member "Quiet inside", and the ranked
 * channel's own line.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const refetch = vi.fn();
const fetchNextPage = vi.fn();
const state = vi.hoisted(() => ({ groupFeed: null as unknown, feedParam: null as string | null }));

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.feedParam === null ? "" : `feed=${state.feedParam}`),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/halls/welders",
}));
vi.mock("@/hooks/useGroupFeed", () => ({
  GROUP_FEED_QUERY_KEY_ROOT: ["groups", "feed"],
  useGroupFeed: () => state.groupFeed,
}));
vi.mock("@/components/composer/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/groups/GroupPostPolicyToggle", () => ({ GroupPostPolicyToggle: () => null }));
vi.mock("@/components/feed/FeedItemCard", () => ({
  FeedItemCard: ({ item }: { item: { id: string } }) => <p data-testid="group-row">{item.id}</p>,
}));

import { GroupFeedSection } from "@/components/groups/GroupFeedSection";

const UNAVAILABLE = "This group's feed is temporarily unavailable. Try again shortly.";
const EMPTY_COPY =
  /Looking for its first shift|Empty room|First post lands here|Quiet inside|Nothing on the ranked feed yet/;

function firstLoad503() {
  return {
    isPending: false, isLoading: false, isError: true,
    isLoadingError: true, isRefetchError: false, isFetchNextPageError: false,
    error: new BccApiError("bcc_unavailable", "RAW SERVER TEXT", 503, null),
    data: undefined, hasNextPage: false, isFetchingNextPage: false,
    fetchNextPage, refetch,
  };
}

function healthyEmpty() {
  return {
    isPending: false, isLoading: false, isError: false,
    isLoadingError: false, isRefetchError: false, isFetchNextPageError: false,
    error: null,
    data: { pages: [{ items: [], pagination: { next_cursor: null, has_more: false } }] },
    hasNextPage: false, isFetchingNextPage: false, fetchNextPage, refetch,
  };
}

function group(type: string, isMember: boolean) {
  return {
    id: 7, name: "Welders", type, feed_visible: true,
    viewer_membership: isMember ? { is_member: true } : null,
    can_use_public_all: false, permissions: {},
  } as never;
}

function mount(type = "hall", isMember = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <GroupFeedSection group={group(type, isMember)} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  refetch.mockClear();
  fetchNextPage.mockClear();
  state.feedParam = null;
});

afterEach(() => {
  cleanup();
});

describe("a group wall the server could not read", () => {
  it.each([
    ["hall", true],
    ["nft", true],
    ["user", true],
    ["user", false],
  ])("%s wall (member=%s): the failure and a Retry, never the empty room", (type, isMember) => {
    state.groupFeed = firstLoad503();
    mount(type, isMember);
    expect(screen.getByRole("alert")).toHaveTextContent(UNAVAILABLE);
    expect(document.body.textContent).not.toMatch(EMPTY_COPY);
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
    fireEvent.click(screen.getByRole("button", { name: /^retry$/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("the ranked channel too", () => {
    state.feedParam = "ranked";
    state.groupFeed = firstLoad503();
    mount("hall", true);
    expect(screen.getByRole("alert")).toHaveTextContent(UNAVAILABLE);
    expect(document.body.textContent).not.toMatch(EMPTY_COPY);
  });

  it("control: a successful empty read still shows the empty room", () => {
    // Without this, the EMPTY_COPY assertions above could pass against copy
    // that no longer exists.
    state.groupFeed = healthyEmpty();
    mount("hall", true);
    expect(document.body.textContent).toMatch(EMPTY_COPY);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("control: the ranked empty line still exists", () => {
    state.feedParam = "ranked";
    state.groupFeed = healthyEmpty();
    mount("hall", true);
    expect(screen.getByText("Nothing on the ranked feed yet.")).toBeInTheDocument();
  });
});
