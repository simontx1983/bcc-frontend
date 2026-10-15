/**
 * The focus fix, proven through the REAL consumers rather than only
 * through the primitive.
 *
 * `pager-nav-focus.test.tsx` pins `PagerNav` itself. This file renders
 * the components that mount it — the watchlist's two tabs and the
 * notifications panel's own LOAD MORE — because a consumer can undo the
 * fix without touching the primitive: by passing `isBusy` in a way that
 * unmounts the chips, by rendering its own button, or (as /messages did
 * until this change) by carrying a private copy of the pager.
 *
 * /members and /mentors are covered by the primitive test plus
 * `route-paged-load-failure.test.tsx`; they pass `page`, `totalPages` and
 * `onPageChange` straight through with no local button of their own, so
 * there is nothing consumer-specific left to assert. /messages now routes
 * through `PagerNav` too — its private fourth copy had the same defect and
 * is deleted in this change.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const onPageChange = vi.fn();
const fetchNextPage = vi.fn();

const state = vi.hoisted(() => ({
  watching: null as unknown,
  list: null as unknown,
  inbox: null as unknown,
  page: 1,
}));

vi.mock("@/hooks/useWatching", () => ({
  useWatching: () => state.watching,
  useWatchingSummary: () => ({ data: undefined }),
  WATCHING_QUERY_KEY_ROOT: ["watching"],
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => state.list,
  useUnreadCount: () => ({ data: { unread_count: 0 } }),
  useMarkReadMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () =>
    new URLSearchParams(state.page > 1 ? "page=" + state.page : ""),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 1 } } }),
}));

vi.mock("@/hooks/useConversations", () => ({
  useConversations: () => state.inbox,
  CONVERSATIONS_QUERY_KEY_ROOT: ["conversations"],
}));
vi.mock("@/hooks/useQueuedMessages", () => ({
  useQueuedMessages: () => ({
    isPending: true, isError: false, isSuccess: false, isFetching: false,
    error: null, data: undefined, refetch: vi.fn(),
  }),
}));
vi.mock("@/components/messages/ConversationList", () => ({
  ConversationList: ({ items }: { items: unknown[] }) => (
    <div data-testid="inbox-rows">{items.length} rows</div>
  ),
}));
vi.mock("@/components/messages/QueuedMessagesList", () => ({
  QueuedMessagesList: () => null,
}));
vi.mock("@/components/layout/RouteRail", () => ({ RouteRail: () => null }));

vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: unknown[] }) => <div>{cards.length} cards</div>,
  CardGridSkeleton: () => <div data-testid="skeleton" />,
}));
vi.mock("@/components/watching/WatchingHeader", () => ({
  WatchingHeader: () => null,
}));

import MessagesPage from "@/app/(main)/(app)/messages/page";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { WatchingCardsPanel } from "@/components/watching/WatchingCardsPanel";

const watchRow = (i: number) => ({
  follow_id: i,
  card_kind: "member",
  is_resolved: true,
  card_id: 2000 + i,
  card_handle: "m" + i,
  card_slug: "m-" + i,
  page_id: null,
  reputation_tier_at_watch: "neutral",
  reputation_tier_label_at_watch: "Neutral",
  batch_id: null,
  watched_at: "2026-09-01T12:00:00Z",
  is_legacy: false,
  card: { id: 2000 + i, kind: "member", handle: "m" + i },
  links: { card: "/u/m" + i },
  actions: {},
});

const note = (id: number) => ({
  id,
  type: "mention",
  message: "Member " + id + " mentioned you",
  created_at: "2026-10-01T12:00:00Z",
  read: true,
  actor: { id: 1000 + id, handle: "m" + id, display_name: "M" + id, avatar_url: "" },
  link: null,
});

beforeEach(() => {
  onPageChange.mockClear();
  fetchNextPage.mockClear();
  replace.mockClear();
  state.page = 1;

  state.watching = {
    isPending: false,
    isError: false,
    isSuccess: true,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
    data: {
      items: [watchRow(1), watchRow(2)],
      pagination: { page: 2, page_size: 12, total: 40, total_pages: 5 },
    },
  };

  state.list = {
    isPending: false,
    isLoading: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetchNextPageError: false,
    isFetching: false,
    isFetchingNextPage: false,
    error: null,
    data: { pages: [{ items: [note(1), note(2)] }] },
    hasNextPage: true,
    fetchNextPage,
    refetch: vi.fn(),
  };
});

afterEach(cleanup);

describe("the watchlist Cards tab", () => {
  const nextChip = () =>
    within(screen.getByRole("navigation", { name: /pagination/i })).getByRole(
      "button",
      { name: /NEXT/i },
    );

  it("keeps focus on NEXT across activation", () => {
    render(<WatchingCardsPanel page={2} onPageChange={onPageChange} />);
    const btn = nextChip();
    btn.focus();
    fireEvent.click(btn);
    expect(onPageChange).toHaveBeenCalledWith(3);
    expect(document.activeElement).toBe(btn);
    expect(btn).not.toBeDisabled();
  });

  it("does not submit twice on a rapid double press", () => {
    render(<WatchingCardsPanel page={2} onPageChange={onPageChange} />);
    const btn = nextChip();
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  it("keeps the chips focusable while the next page is in flight", () => {
    state.watching = { ...(state.watching as object), isFetching: true } as unknown;
    render(<WatchingCardsPanel page={2} onPageChange={onPageChange} />);
    const btn = nextChip();
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    btn.focus();
    fireEvent.click(btn);
    // Focusable, and inert while busy.
    expect(document.activeElement).toBe(btn);
    expect(onPageChange).not.toHaveBeenCalled();
  });

  // The failed-page case — where the pager IS the exit and so must stay
  // keyboard-reachable — is asserted in
  // `watching-cards-pagination-failure.test.tsx`, on the branch that keeps
  // the pager mounted through a failure. This branch does not carry that
  // change, so asserting it here would be testing someone else's fix.
});

describe("the inbox renders ONE pager, outside its state branches", () => {
  // A consumer can undo the primitive's fix without touching it. /messages
  // rendered a pager inside its error branch AND another inside its success
  // branch, so a page change flipped which branch was live, React unmounted
  // the chip the viewer had just activated and mounted a different instance
  // elsewhere. A remounted element cannot hold focus — measured as focus
  // landing on `<body>` here while /watching, whose pager sits outside its
  // branches, kept it.
  it("keeps one pager across a success -> error transition", () => {
    const okInbox = {
      isPending: false,
      isError: false,
      isSuccess: true,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      data: {
        items: [{ id: 1, peer: { id: 1, handle: "m1" } }],
        pagination: { page: 1, per_page: 20, total: 40, total_pages: 4 },
      },
    };
    state.inbox = okInbox;
    state.page = 1;

    const view = render(<MessagesPage />);
    expect(screen.getAllByRole("navigation", { name: /pagination/i })).toHaveLength(1);

    state.inbox = {
      isPending: false,
      isError: true,
      isSuccess: false,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      data: undefined,
    };
    state.page = 2;
    view.rerender(<MessagesPage />);

    // Still exactly one — not one per branch, and not zero.
    expect(screen.getAllByRole("navigation", { name: /pagination/i })).toHaveLength(1);
  });

  it("keeps focus on NEXT across a page change", () => {
    state.inbox = {
      isPending: false,
      isError: false,
      isSuccess: true,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      data: {
        items: [{ id: 1, peer: { id: 1, handle: "m1" } }],
        pagination: { page: 1, per_page: 20, total: 40, total_pages: 4 },
      },
    };
    state.page = 1;

    const view = render(<MessagesPage />);
    const nav = screen.getByRole("navigation", { name: /pagination/i });
    const btn = within(nav).getByRole("button", { name: /NEXT/i });
    btn.focus();
    fireEvent.click(btn);

    // The response lands and the page advances.
    state.inbox = {
      isPending: false,
      isError: false,
      isSuccess: true,
      isFetching: false,
      error: null,
      refetch: vi.fn(),
      data: {
        items: [{ id: 2, peer: { id: 2, handle: "m2" } }],
        pagination: { page: 2, per_page: 20, total: 40, total_pages: 4 },
      },
    };
    state.page = 2;
    view.rerender(<MessagesPage />);

    expect(document.activeElement).toBe(btn);
    expect(btn).not.toBeDisabled();
  });
});

describe("the notifications LOAD MORE", () => {
  const loadMore = () => screen.getByRole("button", { name: /^LOAD MORE$/i });

  it("keeps focus across activation", () => {
    render(<NotificationsPanel enabled open onNavigate={() => {}} />);
    const btn = loadMore();
    btn.focus();
    fireEvent.click(btn);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(btn);
  });

  it("stays focusable while the next page is in flight", () => {
    state.list = { ...(state.list as object), isFetchingNextPage: true } as unknown;
    render(<NotificationsPanel enabled open onNavigate={() => {}} />);
    const btn = screen.getByRole("button", { name: /LOADING/i });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    btn.focus();
    expect(document.activeElement).toBe(btn);
  });

  it("does not fetch again while already fetching", () => {
    state.list = { ...(state.list as object), isFetchingNextPage: true } as unknown;
    render(<NotificationsPanel enabled open onNavigate={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /LOADING/i }));
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});
