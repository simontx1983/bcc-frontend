/**
 * C2-routes — paged route surfaces keep their navigation when a page fails.
 *
 * Named "C2-routes", not "C2b": the original C2 split assumed the queued
 * messages tab was unpaged and could take a presentation-only migration.
 * Repository evidence disproved that — `useQueuedMessages` takes `page`,
 * puts it in the query key, and renders a `<Pagination>` gated on
 * `isSuccess`, exactly like the other three. The inventory was renamed so
 * the old and revised meanings of C2b/C2c cannot collide.
 *
 * `/members`, `/mentors` and both tabs of `/messages` put `page` in the
 * query key with no `placeholderData`, and gate their list *and* their
 * pager behind `isSuccess`. A failed page 2 therefore had no data, so the
 * pager unmounted with the list and PREV disappeared — the URL was the
 * only way back. Same defect class as WatchersPanel in C1b.
 *
 * Each surface now holds its last good pagination locally and renders the
 * pager from it on failure, at the requested page, so PREV steps back to
 * a page that worked.
 *
 * Page-change failures are driven by a success → error rerender so the
 * retention state seeds exactly as it does in production. `PagerNav` and
 * the local `Pagination` are left unmocked so their presence is real.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const refetch = { members: vi.fn(), conversations: vi.fn(), queued: vi.fn() };

const state = vi.hoisted(() => ({
  members: null as unknown,
  conversations: null as unknown,
  queued: null as unknown,
  searchParams: new URLSearchParams(),
}));

const replace = vi.fn();
const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
  useSearchParams: () => state.searchParams,
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { name: "ada" } }, status: "authenticated" }),
}));
vi.mock("@/hooks/useMembers", () => ({ useMembers: () => state.members }));
vi.mock("@/hooks/useConversations", () => ({
  useConversations: () => state.conversations,
}));
vi.mock("@/hooks/useQueuedMessages", () => ({
  useQueuedMessages: () => state.queued,
}));
// Card and row rendering is irrelevant here and pulls the API client.
vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: unknown[] }) => (
    <div data-testid="card-grid">{cards.length}</div>
  ),
}));
vi.mock("@/components/messages/ConversationList", () => ({
  ConversationList: () => <div data-testid="conversation-list" />,
}));
vi.mock("@/components/messages/QueuedMessagesList", () => ({
  QueuedMessagesList: () => <div data-testid="queued-list" />,
}));

import MembersPage from "@/app/(main)/(app)/members/page";
import MentorsPage from "@/app/(main)/(app)/mentors/page";
import MessagesPage from "@/app/(main)/(app)/messages/page";

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

beforeEach(() => {
  for (const spy of Object.values(refetch)) spy.mockClear();
  replace.mockClear();
  push.mockClear();
  state.searchParams = new URLSearchParams();
});

afterEach(cleanup);

const RAW = "raw server text that must never render";
const err = (code: string) => new BccApiError(code, RAW, 503, null);

const PAGINATION = { page: 1, per_page: 24, total: 60, total_pages: 3 };

const ok = (items: unknown[], key: keyof typeof refetch, extra: object = {}) => ({
  isError: false as const,
  isPending: false as const,
  isLoading: false as const,
  isSuccess: true as const,
  error: null,
  data: { items, pagination: PAGINATION, ...extra },
  refetch: refetch[key],
});
const failed = (code: string, key: keyof typeof refetch) => ({
  isError: true as const,
  isPending: false as const,
  isLoading: false as const,
  isSuccess: false as const,
  error: err(code),
  data: undefined,
  refetch: refetch[key],
});

const TYPE_COUNTS = { validator: 1, project: 0, nft: 0, dao: 0 };

// ── /members and /mentors share the useMembers hook ───────────────────

const ROUTES = [
  {
    name: "/members",
    ui: () => <MembersPage />,
    key: "members" as const,
    okData: () => ok([{ id: 1, is_mentor: true }], "members", { type_counts: TYPE_COUNTS }),
    failData: (c: string) => failed(c, "members"),
    message: /roster is temporarily unavailable/i,
    emptyCopy: /roster|operator/i,
  },
  {
    name: "/mentors",
    ui: () => <MentorsPage />,
    key: "members" as const,
    // /mentors filters on `is_mentor === true`.
    okData: () => ok([{ id: 1, is_mentor: true }], "members", { type_counts: TYPE_COUNTS }),
    failData: (c: string) => failed(c, "members"),
    message: /mentor list is temporarily unavailable/i,
    emptyCopy: /mentor/i,
  },
];

for (const r of ROUTES) {
  describe(`${r.name} — paged load failure`, () => {
    it("1. a page loads successfully", () => {
      state.members = r.okData();
      render(r.ui());
      expect(screen.getByTestId("card-grid")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("2-3. a later page fails with the paper error and sanitized copy", () => {
      state.members = r.okData();
      const { rerender } = render(r.ui());

      state.searchParams = new URLSearchParams("page=2");
      state.members = r.failData("bcc_unavailable");
      rerender(r.ui());

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent(r.message);
      expect(alert.className).toContain("text-ink-soft");
      expect(alert.className).not.toContain("--bcc-text");
      expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));
    });

    it("4. Retry refetches the currently failing query, and only it", () => {
      state.members = r.failData("bcc_rate_limited");
      render(r.ui());
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));

      expect(refetch.members).toHaveBeenCalledTimes(1);
      expect(refetch.conversations).not.toHaveBeenCalled();
      expect(refetch.queued).not.toHaveBeenCalled();
    });

    it("5-6. last-good navigation survives and PREV returns to a usable page", () => {
      state.members = r.okData();
      const { rerender } = render(r.ui());

      state.searchParams = new URLSearchParams("page=2");
      state.members = r.failData("bcc_unavailable");
      rerender(r.ui());

      // pager still mounted…
      expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
      const prev = screen.getByRole("button", { name: /prev/i });
      expect(prev).toBeEnabled();

      // …and it goes back to page 1, which is known to work.
      fireEvent.click(prev);
      const target = [...replace.mock.calls, ...push.mock.calls]
        .map((c) => String(c[0]))
        .join(" ");
      expect(target).not.toMatch(/page=2/);
    });

    it("7. the empty state stays success-only", () => {
      state.members = r.failData("bcc_unavailable");
      render(r.ui());
      // A failure must not be mistaken for "nothing here".
      expect(screen.queryByTestId("card-grid")).not.toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("no pager on a first-load failure — there is no page to return to", () => {
      state.members = r.failData("bcc_unavailable");
      render(r.ui());
      expect(screen.queryByRole("navigation", { name: /pagination/i })).not.toBeInTheDocument();
    });
  });
}

// ── /messages: two independent tabs ───────────────────────────────────

describe("/messages — inbox and queued stay independent", () => {
  it("8. a queued failure leaves the inbox untouched", () => {
    state.searchParams = new URLSearchParams();
    state.conversations = ok([{ id: 1 }], "conversations");
    state.queued = failed("bcc_unavailable", "queued");
    render(<MessagesPage />);

    // Inbox tab is active by default and renders normally.
    expect(screen.getByTestId("conversation-list")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("8. an inbox failure leaves the queued tab untouched", () => {
    state.searchParams = new URLSearchParams("tab=queued");
    state.conversations = failed("bcc_unavailable", "conversations");
    state.queued = ok([{ id: 1 }], "queued");
    render(<MessagesPage />);

    expect(screen.getByTestId("queued-list")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("2-4. inbox failure shows the paper error and retries only useConversations", () => {
    state.conversations = failed("bcc_rate_limited", "conversations");
    state.queued = ok([], "queued");
    render(<MessagesPage />);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/too many refreshes/i);
    expect(alert.className).toContain("text-ink-soft");
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.conversations).toHaveBeenCalledTimes(1);
    expect(refetch.queued).not.toHaveBeenCalled();
    expect(refetch.members).not.toHaveBeenCalled();
  });

  it("5-6. a failed inbox page keeps its pager with a working PREV", () => {
    state.conversations = ok([{ id: 1 }], "conversations");
    state.queued = ok([], "queued");
    const { rerender } = render(<MessagesPage />);

    state.searchParams = new URLSearchParams("page=2");
    state.conversations = failed("bcc_unavailable", "conversations");
    rerender(<MessagesPage />);

    expect(screen.getByRole("navigation", { name: /pagination/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /prev/i })).toBeEnabled();
  });

  it("2-4. queued failure retries only useQueuedMessages", () => {
    state.searchParams = new URLSearchParams("tab=queued");
    state.conversations = ok([], "conversations");
    state.queued = failed("bcc_rate_limited", "queued");
    render(<MessagesPage />);

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.queued).toHaveBeenCalledTimes(1);
    expect(refetch.conversations).not.toHaveBeenCalled();
  });

  it("7. neither tab shows its empty state on failure", () => {
    state.searchParams = new URLSearchParams("tab=queued");
    state.conversations = ok([], "conversations");
    state.queued = failed("bcc_unavailable", "queued");
    render(<MessagesPage />);

    expect(screen.queryByText(/no messages waiting/i)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});
