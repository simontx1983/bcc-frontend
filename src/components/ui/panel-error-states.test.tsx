/**
 * The last five blanket-`isError` branches, and the copy gap beside them.
 *
 * ## What was wrong, per site — these were NOT five copies of one bug
 *
 * All five returned an error surface from a branch that was true for all
 * three failure kinds, and all five did it BEFORE reading `data.pages`. The
 * consequences differed:
 *
 *   CommentDrawer      the branch sits ABOVE the main return, which is where
 *                      <CommentComposer> mounts — so a failed refresh or
 *                      LOAD MORE unmounted the composer and DESTROYED a
 *                      reply the viewer had typed. The only one of the five
 *                      that loses user input, and the reason this file
 *                      exists.
 *   FeedBody           receives flattened props, not the query, so the split
 *                      flags had to be added to its interface; every caller
 *                      spreads `{...query}` so they arrive for free. Its
 *                      next-page failure is reachable with NO user action —
 *                      an IntersectionObserver fires it on scroll.
 *   GroupFeedBody      same shape, but its <Composer> is a sibling in the
 *                      PARENT component, so no draft was ever at risk here.
 *                      Checked rather than assumed.
 *   DirectoryGrid      had NO retry control at all and ONE hardcoded
 *                      sentence for every failure — so it also violated §γ
 *                      (copy keyed on err.code).
 *   GroupMembersStrip  a bare "Try again" button rather than <LoadFailure>.
 *
 * ## And the copy gap in the three released panels
 *
 * `bcc_blocked` is the third member of `PERMISSION_DENIAL_CODES`, so the
 * Retry control was already withheld for it — but it was absent from every
 * copy map, so the message fell through to a default ending "Try again in a
 * moment". A blocked viewer was told to retry beside nothing to retry with.
 * Live in production until this change.
 *
 * ## The control that matters most
 *
 * Asserting "content is retained" would pass against a component that never
 * renders an error at all. So every retention case is paired with the
 * first-load case, which must still replace the surface, and with the
 * denial case, which must offer no Retry.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
import type * as ReactQueryModule from "@tanstack/react-query";

const fetchNextPage = vi.fn();
const refetch = vi.fn();
const removeQueries = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQueryModule>()),
  useQueryClient: () => ({ removeQueries }),
}));

const state = vi.hoisted(() => ({
  comments: null as unknown,
  groupFeed: null as unknown,
  groupMembers: null as unknown,
}));

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 1 } } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/hooks/useComments", () => ({
  useComments: () => state.comments,
  commentsQueryKey: (feedId: string) => ["comments", feedId],
  commentsListQueryKey: (feedId: string, sort: string) => ["comments", feedId, "list", sort],
  restoreCommentsSnapshot: () => {},
  useCreateCommentMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useDeleteCommentMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useCommentStoke", () => ({
  useCommentStoke: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useGiphyIntegration", () => ({
  useGiphyIntegration: () => ({ enabled: false }),
}));
vi.mock("@/hooks/useGroupFeed", () => ({
  useGroupFeed: () => state.groupFeed,
  GROUP_FEED_QUERY_KEY_ROOT: ["groups", "feed"],
}));
vi.mock("@/hooks/useGroupMembers", () => ({
  useGroupMembers: () => state.groupMembers,
  GROUP_MEMBERS_QUERY_KEY_ROOT: ["groups", "members"],
}));
vi.mock("@/components/composer/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: { id: number }[] }) => (
    <ul>{cards.map((c) => <li key={c.id}>card {c.id}</li>)}</ul>
  ),
}));
vi.mock("@/components/feed/FeedItemCard", () => ({
  FeedItemCard: ({ item }: { item: { id: string } }) => (
    <article data-testid="feed-row">{item.id}</article>
  ),
}));
vi.mock("@/components/discover/DiscoverPanel", () => ({
  DiscoverPanel: () => <p>DISCOVER PANEL</p>,
}));

import { CommentDrawer } from "@/components/feed/CommentDrawer";
import { DirectoryGrid } from "@/components/directory/DirectoryGrid";
import { FeedBody } from "@/components/feed/FeedView";
import { GroupMembersStrip } from "@/components/groups/GroupMembersStrip";

const DENIAL_CODES = ["bcc_forbidden", "bcc_permission_denied", "bcc_blocked"] as const;
const apiErr = (code: string) =>
  new BccApiError(code, "RAW SERVER TEXT", 403, null);

const retryBtn = () => screen.queryByRole("button", { name: /^retry$/i });
const loadMoreBtn = () => screen.queryByRole("button", { name: /load more/i });

type Branch = "first" | "refetch" | "next";

/** The flag combination TanStack really produces for each branch. */
function inf(pages: unknown[], branch: Branch, code: string, hasNextPage = true) {
  return {
    isPending: false,
    isLoading: false,
    isError: true,
    isLoadingError: branch === "first",
    isRefetchError: branch === "refetch",
    isFetchNextPageError: branch === "next",
    error: apiErr(code),
    data: branch === "first" ? undefined : { pages },
    hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage,
    refetch,
  };
}

function healthy(pages: unknown[], hasNextPage = true) {
  return {
    isPending: false, isLoading: false, isError: false,
    isLoadingError: false, isRefetchError: false, isFetchNextPageError: false,
    error: null, data: { pages }, hasNextPage,
    isFetchingNextPage: false, fetchNextPage, refetch,
  };
}

const comment = (id: number) => ({
  id: "c" + id,
  body: "comment body " + id,
  parent_id: null,
  created_at: "2026-10-01T12:00:00Z",
  posted_at_label: "2d",
  author: { id: 10 + id, handle: "a" + id, display_name: "A" + id, avatar_url: "" },
  stoke_count: 0,
  viewer_has_stoked: false,
  is_deleted: false,
  permissions: {},
  // `media` is OPTIONAL, not nullable: the row guards on
  // `media !== undefined`, so a `null` here slips past the guard and
  // throws on `media.kind`. Omit it rather than nulling it.
  // renderTextWithMentions reads `.length` on `mentions` unconditionally.
  mentions: [],
});
const commentPage = (ids: number[]) => ({ items: ids.map(comment), pagination: { next_cursor: "c2", has_more: true } });

const post = (id: number) => ({ id: "p" + id, post_kind: "status", body: { text: "post " + id } });
const feedPage = (ids: number[]) => ({ items: ids.map(post), pagination: { next_cursor: "f2", has_more: true } });

const card = (id: number) => ({ id, name: "Card " + id, handle: "c" + id, crest: { image_url: null }, rank_label: null });
const cardPage = (ids: number[]) => ({ items: ids.map(card), pagination: { page: 1, per_page: 20, total: 40, total_pages: 2, has_more: true } });

const member = (id: number) => ({ id, handle: "m" + id, display_name: "M" + id, avatar_url: "", rank_label: null });
const memberPage = (ids: number[]) => ({ items: ids.map(member), pagination: { total: 40, offset: 0, limit: 20, has_more: true } });

const group = {
  id: 7, name: "Welders", type: "hall", members_visible: true,
  feed_visible: true, can_use_public_all: false,
} as never;

beforeEach(() => {
  // usePrefersReducedMotion calls matchMedia in an effect; jsdom has none.
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  fetchNextPage.mockClear();
  refetch.mockClear();
  removeQueries.mockClear();
  state.comments = healthy([commentPage([1, 2])]);
  state.groupFeed = healthy([feedPage([1, 2])]);
  state.groupMembers = healthy([memberPage([1, 2])]);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

/**
 * Some descendants of the drawer call real query hooks, which need a
 * provider in context. The gate's `useQueryClient` stays mocked, so cache
 * removal is still observed through the spy rather than this client.
 */
function withClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const drawer = () => render(withClient(<CommentDrawer feedId="f1" isOpen />));
const directory = (q: unknown) =>
  render(<DirectoryGrid query={q as never} />);
const feed = (q: unknown) =>
  render(<FeedBody {...(q as React.ComponentProps<typeof FeedBody>)} />);
const roster = () => render(<GroupMembersStrip group={group} />);

// ═════════════════════════════════════════════════════════════════════
// 1. CommentDrawer — the typed reply must survive
// ═════════════════════════════════════════════════════════════════════

describe("CommentDrawer keeps a typed reply across a failure", () => {
  function typeReply(text: string) {
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: text } });
    return box as HTMLTextAreaElement;
  }

  it("a failed REFRESH does not destroy the draft", () => {
    const view = drawer();
    const box = typeReply("half-written reply");
    expect(box.value).toBe("half-written reply");

    state.comments = inf([commentPage([1, 2])], "refetch", "bcc_unavailable");
    view.rerender(withClient(<CommentDrawer feedId="f1" isOpen />));

    // Same textarea instance, same text — the composer never unmounted.
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "half-written reply",
    );
  });

  it("a failed NEXT PAGE does not destroy the draft", () => {
    const view = drawer();
    typeReply("reply in progress");

    state.comments = inf([commentPage([1, 2])], "next", "bcc_unavailable");
    view.rerender(withClient(<CommentDrawer feedId="f1" isOpen />));

    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "reply in progress",
    );
  });

  it.each(DENIAL_CODES)("%s withdraws the thread but KEEPS the draft", (code) => {
    const view = drawer();
    typeReply("still mine");

    state.comments = inf([commentPage([1, 2])], "refetch", code);
    view.rerender(withClient(<CommentDrawer feedId="f1" isOpen />));

    // The draft is the viewer's own unsent input, not part of the
    // resource the server withdrew.
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("still mine");
    expect(retryBtn()).toBeNull();

    // And the THREAD itself is withdrawn — the half a mutation caught me
    // not asserting. `hidden` on the wrapper, so the rows are no longer
    // presented to the viewer or to assistive technology.
    expect(screen.getByText(/you can’t read this thread/i)).toBeTruthy();
    const row = screen.queryByText(/comment body 1/);
    expect(row === null || row.closest("[hidden]") !== null).toBe(true);
  });

  it("a failed refresh keeps the loaded comments and offers Retry", () => {
    const view = drawer();
    state.comments = inf([commentPage([1, 2])], "refetch", "bcc_unavailable");
    view.rerender(withClient(<CommentDrawer feedId="f1" isOpen />));
    expect(screen.getByText(/comment body 1/)).toBeTruthy();
    expect(retryBtn()).not.toBeNull();
  });

  it("a failed next page withdraws LOAD MORE and retries that page", () => {
    const view = drawer();
    state.comments = inf([commentPage([1, 2])], "next", "bcc_unavailable");
    view.rerender(withClient(<CommentDrawer feedId="f1" isOpen />));
    expect(screen.queryByRole("button", { name: /LOAD MORE/i })).toBeNull();
    fireEvent.click(retryBtn() as HTMLElement);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("a FIRST-load failure may still replace the drawer", () => {
    // Safe: the composer has never mounted, so there is no draft to lose.
    state.comments = inf([], "first", "bcc_unavailable");
    drawer();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(retryBtn()).not.toBeNull();
  });

  it("keeps the established group-gate wording on a first-load bcc_forbidden", () => {
    state.comments = inf([], "first", "bcc_forbidden");
    drawer();
    expect(screen.getByText(/join the group to see this thread/i)).toBeTruthy();
    expect(retryBtn()).toBeNull();
  });

  it("does NOT tell a blocked viewer to join a group", () => {
    // Inheriting the group copy for bcc_blocked would be a guess about why
    // the viewer was refused.
    state.comments = inf([], "first", "bcc_blocked");
    drawer();
    expect(screen.queryByText(/join the group/i)).toBeNull();
    expect(retryBtn()).toBeNull();
  });

  it("never renders the server's raw message", () => {
    state.comments = inf([], "first", "bcc_unavailable");
    drawer();
    expect(document.body.textContent ?? "").not.toMatch(/RAW SERVER TEXT/);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. FeedBody — flattened props, observer-driven next page
// ═════════════════════════════════════════════════════════════════════

describe("FeedBody", () => {
  it("a failed first load replaces the feed", () => {
    feed(inf([], "first", "bcc_unavailable"));
    expect(screen.queryAllByTestId("feed-row")).toHaveLength(0);
    expect(retryBtn()).not.toBeNull();
  });

  it("a failed REFRESH keeps every loaded post", () => {
    feed(inf([feedPage([1, 2])], "refetch", "bcc_unavailable"));
    expect(screen.getAllByTestId("feed-row")).toHaveLength(2);
    expect(retryBtn()).not.toBeNull();
  });

  it("a failed NEXT PAGE keeps the posts and withdraws the auto-load sentinel", () => {
    // The sentinel is the important half: left mounted, the
    // IntersectionObserver re-fires the same failing page on every scroll.
    const { container } = feed(inf([feedPage([1, 2])], "next", "bcc_unavailable"));
    expect(screen.getAllByTestId("feed-row")).toHaveLength(2);
    expect(loadMoreBtn()).toBeNull();
    expect(container.querySelector("div[aria-hidden].h-px")).toBeNull();
  });

  it.each(DENIAL_CODES)("%s offers no Retry", (code) => {
    feed(inf([feedPage([1, 2])], "refetch", code));
    expect(retryBtn()).toBeNull();
  });

  it("withholds the end-of-feed claim while the cursor is failed", () => {
    feed(inf([feedPage([1, 2])], "next", "bcc_unavailable", false));
    expect(screen.queryByText(/end of the floor/i)).toBeNull();
  });

  it("withholds the cold-start panel on a failure", () => {
    // DiscoverPanel says the room is quiet; a failed read does not show that.
    feed(inf([{ items: [] }], "refetch", "bcc_unavailable"));
    expect(screen.queryByText(/DISCOVER PANEL/)).toBeNull();
  });

  it("falls back to all-or-nothing when a caller passes no split flags", () => {
    // The props are optional, so an old hand-built caller must not silently
    // start retaining content nobody told us about.
    feed({
      data: { pages: [feedPage([1, 2])] }, isLoading: false, isError: true,
      error: apiErr("bcc_unavailable"), isFetchingNextPage: false,
      hasNextPage: true, fetchNextPage, refetch,
    });
    expect(screen.queryAllByTestId("feed-row")).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. DirectoryGrid — no retry control before, hardcoded copy
// ═════════════════════════════════════════════════════════════════════

describe("DirectoryGrid", () => {
  it("a failed first load replaces the grid, and now OFFERS a retry", () => {
    directory(inf([], "first", "bcc_unavailable"));
    expect(retryBtn()).not.toBeNull();
  });

  it("a failed REFRESH keeps the loaded results", () => {
    directory(inf([cardPage([1, 2])], "refetch", "bcc_unavailable"));
    expect(screen.getByText("card 1")).toBeTruthy();
    expect(screen.getByText("card 2")).toBeTruthy();
  });

  it("a failed NEXT PAGE keeps results and withdraws LOAD MORE", () => {
    directory(inf([cardPage([1, 2])], "next", "bcc_unavailable"));
    expect(screen.getByText("card 1")).toBeTruthy();
    expect(loadMoreBtn()).toBeNull();
    fireEvent.click(retryBtn() as HTMLElement);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it.each(DENIAL_CODES)("%s offers no Retry", (code) => {
    directory(inf([cardPage([1])], "refetch", code));
    expect(retryBtn()).toBeNull();
  });

  it("keys copy on err.code instead of one hardcoded sentence", () => {
    directory(inf([], "first", "bcc_rate_limited"));
    expect(screen.getByRole("alert").textContent ?? "").toMatch(/loading too fast/i);
  });

  it("does not blame the viewer's filter when the request failed", () => {
    // "Filter's too tight" told people to loosen a filter that was fine.
    directory(inf([{ items: [], pagination: { page: 1, per_page: 20, total: 0, total_pages: 1, has_more: false } }], "refetch", "bcc_unavailable"));
    expect(screen.queryByText(/too tight/i)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. GroupMembersStrip — gate + split
// ═════════════════════════════════════════════════════════════════════

describe("GroupMembersStrip", () => {
  it("a failed first load replaces the strip", () => {
    state.groupMembers = inf([], "first", "bcc_unavailable");
    roster();
    expect(retryBtn()).not.toBeNull();
  });

  it("a failed REFRESH keeps the roster", () => {
    state.groupMembers = inf([memberPage([1, 2])], "refetch", "bcc_unavailable");
    roster();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(retryBtn()).not.toBeNull();
  });

  it.each(DENIAL_CODES)("%s WITHDRAWS the roster and drops the cache entry", (code) => {
    state.groupMembers = inf([memberPage([1, 2])], "refetch", code);
    roster();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(retryBtn()).toBeNull();
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ["groups", "members", 7],
      exact: true,
    });
  });

  it("a denied NEXT PAGE keeps the roster and removes nothing", () => {
    state.groupMembers = inf([memberPage([1, 2])], "next", "bcc_forbidden");
    roster();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(removeQueries).not.toHaveBeenCalled();
  });

  it("a transient refresh failure removes nothing", () => {
    state.groupMembers = inf([memberPage([1, 2])], "refetch", "bcc_unavailable");
    roster();
    expect(removeQueries).not.toHaveBeenCalled();
  });

  it("recovers on a remount once permission is restored", () => {
    state.groupMembers = inf([memberPage([1, 2])], "refetch", "bcc_forbidden");
    const view = roster();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);

    view.unmount();
    state.groupMembers = healthy([memberPage([1, 2])]);
    roster();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });

  it("withholds the empty-roster claim while the read failed", () => {
    state.groupMembers = inf([{ items: [], pagination: { total: 0, offset: 0, limit: 20, has_more: false } }], "refetch", "bcc_unavailable");
    roster();
    expect(screen.queryByText(/empty roster/i)).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 5. bcc_blocked copy — the live gap in the three RELEASED panels
// ═════════════════════════════════════════════════════════════════════

describe("bcc_blocked no longer falls through to retry-ish copy", () => {
  /**
   * Source-level, because mounting all three released panels here would
   * duplicate three suites that already exist. The defect was a MISSING MAP
   * KEY, which is exactly what a source assertion can see: each panel's
   * `humanizeCode` map must name all three members of
   * `PERMISSION_DENIAL_CODES`, or the message falls through to a default
   * ending "Try again in a moment" while the control is withheld.
   */
  const PANELS = [
    "src/components/watching/WatchingCardsPanel.tsx",
    "src/components/notifications/NotificationsPanel.tsx",
    "src/components/messages/ConversationsPanel.tsx",
  ];

  it.each(PANELS)("%s names all three denial codes", async (file) => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile(file, "utf8");
    for (const code of DENIAL_CODES) {
      expect(src, file + " is missing " + code).toContain(code + ":");
    }
  });
});
