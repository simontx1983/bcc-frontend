/**
 * The inbox's failure states — offset-paged, not append.
 *
 * ## Why this surface is treated differently from notifications
 *
 * The inbox is offset-paged with `page` in the query key, so each page is
 * its own cache entry. That has two consequences the append surfaces do
 * not share, and both are deliberate here:
 *
 *   1. A failed page N>1 has no `data` of its own — page N-1 lives under
 *      another key. So "preserve the loaded rows" is served the way
 *      `/members` and `WatchersPanel` already serve it: the PAGER stays
 *      mounted against the last good total, so PREV steps back to a page
 *      that worked. Adding `placeholderData` to `useConversations` would
 *      show page N-1's rows under a pager reading page N, and that hook
 *      is shared with this modal preview — the same reason
 *      `/members` records for not doing it.
 *
 *   2. `refetch()` is the CORRECT retry here. For an offset page it
 *      re-requests that page alone; it is only on an infinite query that
 *      it would restart every loaded page.
 *
 * ## What this pins
 *
 * - the default copy distinguishes a first-page failure from a later one,
 *   because "couldn't load your inbox" on page 4 reads as "your messages
 *   are gone" when in fact the inbox loaded and one page of it did not
 * - the pager survives a failed page, in both tabs, so PREV exists
 * - a permission denial offers no retry at all
 * - the two tabs' failures never bleed into each other
 *
 * The preview panel is covered too: it shares ONE cache entry with page 1
 * of this route, so a failed refresh of that entry used to replace rows
 * that were already in the cache with an error line.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

import { BccApiError } from "@/lib/api/types";

const refetch = { inbox: vi.fn(), queued: vi.fn() };

const state = vi.hoisted(() => ({
  inbox: null as unknown,
  queued: null as unknown,
  page: 1,
}));

vi.mock("@/hooks/useConversations", () => ({
  useConversations: () => state.inbox,
  CONVERSATIONS_QUERY_KEY_ROOT: ["conversations"],
}));
vi.mock("@/hooks/useQueuedMessages", () => ({
  useQueuedMessages: () => state.queued,
}));

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(state.page > 1 ? "page=" + state.page : ""),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 1 } } }),
}));

vi.mock("@/components/messages/ConversationList", () => ({
  ConversationList: ({ items }: { items: unknown[] }) => (
    <div data-testid="rows">{items.length} rows</div>
  ),
}));
vi.mock("@/components/messages/QueuedMessagesList", () => ({
  QueuedMessagesList: ({ items }: { items: unknown[] }) => (
    <div data-testid="queued-rows">{items.length} rows</div>
  ),
}));
vi.mock("@/components/layout/RouteRail", () => ({
  RouteRail: () => null,
}));

import MessagesPage from "@/app/(main)/(app)/messages/page";
import { ConversationsPanel } from "@/components/messages/ConversationsPanel";

const RAW = "raw server text that must never render";
const err = (code: string) => new BccApiError(code, RAW, 503, null);

const convo = (id: number) => ({
  id,
  is_group: false,
  participants: [],
  peer: { id, handle: "m" + id, display_name: "M" + id, avatar_url: "" },
  last_message: {
    id,
    author: { id, handle: "m" + id, display_name: "M" + id, avatar_url: "" },
    preview: "hello",
    posted_at: "2026-10-01T12:00:00Z",
  },
  unread_count: 0,
  last_activity: "2026-10-01T12:00:00Z",
});

const ok = (items: unknown[], page: number, totalPages: number) => ({
  isPending: false,
  isError: false,
  isLoadingError: false,
  isRefetchError: false,
  isSuccess: true,
  isFetching: false,
  error: null,
  data: { items, pagination: { page, per_page: 20, total: 40, total_pages: totalPages } },
  refetch: refetch.inbox,
});

const failed = (code: string, which: "inbox" | "queued", over: Record<string, unknown> = {}) => ({
  isPending: false,
  isError: true,
  isLoadingError: true,
  isRefetchError: false,
  isSuccess: false,
  isFetching: false,
  error: err(code),
  data: undefined,
  refetch: refetch[which],
  ...over,
});

const idle = () => ({
  isPending: true,
  isError: false,
  isLoadingError: false,
  isRefetchError: false,
  isSuccess: false,
  isFetching: false,
  error: null,
  data: undefined,
  refetch: vi.fn(),
});

beforeEach(() => {
  refetch.inbox.mockClear();
  refetch.queued.mockClear();
  replace.mockClear();
  state.page = 1;
  state.inbox = idle();
  state.queued = idle();
});

afterEach(cleanup);

const retryBtn = () => screen.queryByRole("button", { name: /retry/i });
const pager = () => screen.queryByRole("navigation", { name: /pagination/i });

describe("the inbox route — a first-page failure", () => {
  beforeEach(() => {
    state.page = 1;
    state.inbox = failed("bcc_unavailable", "inbox");
  });

  it("reports the failure with a retry", () => {
    render(<MessagesPage />);
    expect(screen.getByRole("alert").textContent ?? "").toMatch(
      /temporarily unavailable/i,
    );
    expect(retryBtn()).not.toBeNull();
  });

  it("falls back to the inbox-wide default for an unmapped code", () => {
    state.inbox = failed("bcc_internal_error", "inbox");
    render(<MessagesPage />);
    expect(screen.getByRole("alert").textContent ?? "").toMatch(
      /couldn.t load your inbox/i,
    );
  });

  it("does not claim a particular page failed — there is no later page", () => {
    render(<MessagesPage />);
    expect(screen.getByRole("alert").textContent ?? "").not.toMatch(/PREV goes back/i);
  });

  it("shows no pager, because nothing has ever succeeded", () => {
    render(<MessagesPage />);
    expect(pager()).toBeNull();
  });

  it("Retry refetches that page only", () => {
    render(<MessagesPage />);
    fireEvent.click(retryBtn() as HTMLElement);
    expect(refetch.inbox).toHaveBeenCalledTimes(1);
    expect(refetch.queued).not.toHaveBeenCalled();
  });

  it("never renders the raw server message", () => {
    render(<MessagesPage />);
    expect(document.body.textContent ?? "").not.toContain(RAW);
  });
});

describe("the inbox route — a LATER page failed", () => {
  beforeEach(() => {
    // Page 1 succeeded earlier, so the retained total is populated; the
    // component reaches page 4 and that request fails.
    state.page = 1;
    state.inbox = ok([convo(1), convo(2)], 1, 4);
  });

  function advanceToFailedPage() {
    const view = render(<MessagesPage />);
    state.page = 4;
    state.inbox = failed("bcc_unavailable", "inbox");
    view.rerender(<MessagesPage />);
    return view;
  }

  it("names the page that failed instead of blaming the whole inbox", () => {
    state.page = 1;
    state.inbox = ok([convo(1)], 1, 4);
    const view = render(<MessagesPage />);
    state.page = 4;
    // No code map entry, so this falls to the page-aware default.
    state.inbox = failed("bcc_internal_error", "inbox");
    view.rerender(<MessagesPage />);

    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).toMatch(/page 4 of your inbox/i);
    expect(alert).not.toMatch(/^Couldn.t load your inbox\./i);
  });

  it("points at PREV, and keeps the pager mounted so PREV exists", () => {
    advanceToFailedPage();
    expect(screen.getByRole("alert").textContent ?? "").toMatch(/PREV goes back/i);
    expect(pager()).not.toBeNull();
  });

  it("appends the PREV pointer to a CODED failure too, not just the default", () => {
    // The control that stops the page distinction from applying only to
    // unmapped errors — `bcc_unavailable` on page 4 needs it just as much.
    advanceToFailedPage();
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).toMatch(/temporarily unavailable/i);
    expect(alert).toMatch(/PREV goes back/i);
  });

  it("the pager's PREV steps back from the page that failed", () => {
    advanceToFailedPage();
    const nav = pager() as HTMLElement;
    fireEvent.click(within(nav).getByRole("button", { name: /PREV/i }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0]?.[0])).toContain("page=3");
  });

  it("Retry re-requests the failed page, not the whole inbox", () => {
    advanceToFailedPage();
    fireEvent.click(retryBtn() as HTMLElement);
    // For an OFFSET page, refetch() is scoped to this page's own key.
    expect(refetch.inbox).toHaveBeenCalledTimes(1);
  });
});

describe("the inbox route — a permission denial", () => {
  it.each(["bcc_permission_denied", "bcc_forbidden", "bcc_blocked"])(
    "%s offers no retry control",
    (code) => {
      state.inbox = failed(code, "inbox");
      render(<MessagesPage />);
      expect(retryBtn()).toBeNull();
    },
  );

  it("a transient failure still offers one", () => {
    state.inbox = failed("bcc_rate_limited", "inbox");
    render(<MessagesPage />);
    expect(retryBtn()).not.toBeNull();
  });

  it("does not point at PREV on a denial — PREV goes nowhere better", () => {
    // A denied inbox is denied on every page, so the hint would be false.
    state.page = 1;
    state.inbox = ok([convo(1)], 1, 4);
    const view = render(<MessagesPage />);
    state.page = 4;
    state.inbox = failed("bcc_permission_denied", "inbox");
    view.rerender(<MessagesPage />);

    expect(screen.getByRole("alert").textContent ?? "").not.toMatch(/PREV goes back/i);
    expect(retryBtn()).toBeNull();
  });
});

describe("the two tabs stay independent", () => {
  it("an inbox failure does not refetch the queued tab", () => {
    state.inbox = failed("bcc_unavailable", "inbox");
    render(<MessagesPage />);
    fireEvent.click(retryBtn() as HTMLElement);
    expect(refetch.queued).not.toHaveBeenCalled();
  });
});

describe("the inbox PREVIEW panel", () => {
  // It shares ONE cache entry with page 1 of the route, so a failed
  // refresh of that entry arrives with the rows already present.
  const previewOk = (items: unknown[], over: Record<string, unknown> = {}) => ({
    ...ok(items, 1, 1),
    ...over,
  });

  it("keeps the cached rows when a REFRESH of them fails", () => {
    state.inbox = previewOk([convo(1), convo(2)], {
      isError: true,
      isRefetchError: true,
      isSuccess: false,
      error: err("bcc_unavailable"),
    });
    render(<ConversationsPanel enabled open onNavigate={() => {}} />);
    expect(screen.getByTestId("rows").textContent).toBe("2 rows");
    expect(retryBtn()).not.toBeNull();
  });

  it("shows the full failure only when the FIRST load failed", () => {
    state.inbox = failed("bcc_unavailable", "inbox");
    render(<ConversationsPanel enabled open onNavigate={() => {}} />);
    expect(screen.queryByTestId("rows")).toBeNull();
    expect(retryBtn()).not.toBeNull();
  });

  it("does not call a quiet inbox quiet while the read is failing", () => {
    state.inbox = previewOk([], {
      isError: true,
      isRefetchError: true,
      isSuccess: false,
      error: err("bcc_unavailable"),
    });
    render(<ConversationsPanel enabled open onNavigate={() => {}} />);
    expect(screen.queryByText(/quiet inbox/i)).toBeNull();
  });

  it("still shows the quiet-inbox state on a genuine empty success", () => {
    state.inbox = previewOk([]);
    render(<ConversationsPanel enabled open onNavigate={() => {}} />);
    expect(screen.queryByText(/quiet inbox/i)).not.toBeNull();
  });

  it("offers no retry on a denial", () => {
    state.inbox = failed("bcc_permission_denied", "inbox");
    render(<ConversationsPanel enabled open onNavigate={() => {}} />);
    expect(retryBtn()).toBeNull();
  });
});
