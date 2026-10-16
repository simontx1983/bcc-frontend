/**
 * AnnouncementsPanel's three failure modes, and the denial withdrawal.
 *
 * The panel shipped in F1 with a single blanket `active.isError` branch
 * returning ABOVE the `data.pages` read. Both of its lists are
 * `useInfiniteQuery`, so `isError` is true for all three failure modes —
 * and the one that matters is the third: a failed LOAD MORE discarded
 * every announcement that had already loaded under its own authorised
 * 200. That is the defect class this repository has hit five times, and
 * these cases exist so it cannot come back here.
 *
 * ## Why this suite mocks the ENDPOINT, not the hook
 *
 * The released `panel-error-states.test.tsx` stubs hook return values
 * with a hand-built flag combination. That is the right tool there. Here
 * the endpoint layer is mocked instead, so the REAL `useAnnouncements`
 * runs: the real `getNextPageParam` reads the real `pagination.next_cursor`,
 * the real viewer-scoped query key is built, and `useDenialGate` removes a
 * real cache entry from a real QueryClient. A flag stub cannot catch a
 * cursor read from the wrong place, and it cannot show whether removing a
 * cache entry sends the panel back round the same refusal.
 *
 * The small `page()` / `deny()` helpers below deliberately mirror the
 * released suite's shape rather than importing it: that file's helpers
 * close over module-level `vi.fn()`s, so sharing them would mean editing
 * a released, already-shipped test file for a test-only convenience.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "9001", handle: "fixture-a" } },
    status: "authenticated",
  }),
  getSession: async () => ({ user: { id: "9001", handle: "fixture-a" } }),
  signOut: vi.fn(async () => undefined),
}));

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const listAnnouncements = vi.fn();
const listOwnerAnnouncements = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  listAnnouncements: (...a: unknown[]) => listAnnouncements(...a),
  listOwnerAnnouncements: (...a: unknown[]) => listOwnerAnnouncements(...a),
  publishAnnouncement: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  setAnnouncementPin: vi.fn(),
  getAnnouncementAsClient: vi.fn(),
  listAnnouncementComments: vi.fn(),
  createAnnouncementComment: vi.fn(),
  removeAnnouncementComment: vi.fn(),
}));

const { AnnouncementsPanel } = await import(
  "@/components/announcements/AnnouncementsPanel"
);
const { announcementsListQueryKey } = await import("@/hooks/useAnnouncements");
const { BccApiError } = await import("@/lib/api/types");
const {
  OWNER_CAPABILITIES,
  VISITOR_CAPABILITIES,
  PUBLISHED_ANNOUNCEMENT,
  SECOND_ANNOUNCEMENT,
  ARCHIVED_ANNOUNCEMENT,
  announcementListResponse,
} = await import("@/lib/announcements/fixtures");

const PAGE_ID = 77;
/** The viewer the session mock supplies; the scope segment of every key. */
const SCOPE = "9001";

const err = (code: string, status = 403) =>
  new BccApiError(code, "RAW SERVER TEXT", status, null);

const retryBtn = () => {
  // Excludes the drafts surface, which owns its own recovery.
  const mgmt = screen.queryByTestId("announcement-management");
  const all = screen.queryAllByRole("button", { name: /^retry$/i });
  return all.find((b) => mgmt === null || !mgmt.contains(b)) ?? null;
};
const loadMoreBtn = () => screen.queryByRole("button", { name: /load more/i });

/** Calls the mock saw for one list state. */
const callsFor = (state: string) =>
  listAnnouncements.mock.calls.filter(
    (c) => (c[0] as { state?: string }).state === state,
  );

let client: QueryClient;

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
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  listAnnouncements.mockReset();
  listOwnerAnnouncements.mockReset();
  listOwnerAnnouncements.mockResolvedValue({
    items: [],
    pagination: { next_cursor: null, has_more: false },
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
});

function mount(capabilities = OWNER_CAPABILITIES) {
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementsPanel
        pageId={PAGE_ID}
        validatorName="Blacksmith Node"
        capabilities={capabilities}
      />
    </QueryClientProvider>,
  );
}

/**
 * Active answers from a queue; archived is always an empty success unless
 * a case overrides it. Each entry is either a response or an error to
 * reject with, consumed in order, with the last entry repeating — so a
 * case can assert that NOTHING further is requested without the mock
 * running out and throwing a confusing error of its own.
 */
function activeQueue(entries: unknown[], archived: unknown[] = [announcementListResponse([])]) {
  const queues: Record<string, unknown[]> = {
    active: [...entries],
    archived: [...archived],
  };
  listAnnouncements.mockImplementation((params: unknown) => {
    const state = (params as { state?: string }).state ?? "active";
    const q = queues[state] ?? [announcementListResponse([])];
    const next = q.length > 1 ? q.shift() : q[0];
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
}

describe("a failed LOAD MORE never discards the loaded list", () => {
  it("keeps page one, withdraws LOAD MORE, and offers a retry", async () => {
    activeQueue([
      announcementListResponse([PUBLISHED_ANNOUNCEMENT], "cursor-2"),
      err("bcc_unavailable", 503),
    ]);
    mount();

    await waitFor(() =>
      expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );

    fireEvent.click(loadMoreBtn()!);

    // The row that loaded fine is STILL THERE. This is the whole point.
    await waitFor(() => expect(retryBtn()).not.toBeNull());
    expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument();

    // And LOAD MORE is gone, so nothing can advance past the failed page.
    expect(loadMoreBtn()).toBeNull();
  });

  it("retries the SAME cursor rather than skipping the failed page", async () => {
    activeQueue([
      announcementListResponse([PUBLISHED_ANNOUNCEMENT], "cursor-2"),
      err("bcc_unavailable", 503),
      announcementListResponse([SECOND_ANNOUNCEMENT], null),
    ]);
    mount();
    await waitFor(() =>
      expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );

    fireEvent.click(loadMoreBtn()!);
    await waitFor(() => expect(retryBtn()).not.toBeNull());

    fireEvent.click(retryBtn()!);
    await waitFor(() =>
      expect(screen.getByText(SECOND_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );

    // Three active calls: first page, the failed second, the retried second.
    // The retry must carry cursor-2 again — a retry that advanced the cursor
    // would silently skip the page that failed.
    const calls = callsFor("active");
    expect(calls).toHaveLength(3);
    expect((calls[1]![0] as { cursor?: string }).cursor).toBe("cursor-2");
    expect((calls[2]![0] as { cursor?: string }).cursor).toBe("cursor-2");
    // Both rows on screen: nothing was dropped on the way through.
    expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument();
  });
});

describe("a failed REFRESH keeps the list", () => {
  it("renders the failure beside the retained rows, not instead of them", async () => {
    activeQueue([
      announcementListResponse([PUBLISHED_ANNOUNCEMENT], null),
      err("bcc_unavailable", 503),
    ]);
    mount();
    await waitFor(() =>
      expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );

    await act(async () => {
      await client.refetchQueries({
        queryKey: announcementsListQueryKey(PAGE_ID, "active", SCOPE),
      });
    });

    // The retained row is synchronous — `keepPreviousData` means it never
    // left the DOM. The FAILURE beside it is not: the error state lands on a
    // later flush, so asserting it directly is a race that passes on a fast
    // machine and fails under CI load. It did exactly that.
    await waitFor(() => expect(retryBtn()).not.toBeNull());
    expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument();
  });
});

describe("a first-load failure is the only one that may replace the list", () => {
  it("renders the failure with a retry when nothing has loaded", async () => {
    activeQueue([err("bcc_unavailable", 503)]);
    mount();

    await waitFor(() => expect(retryBtn()).not.toBeNull());
    expect(screen.queryByText(/No announcements from/i)).toBeNull();
  });

  it("withholds the NOTHING POSTED YET claim while the read is failing", async () => {
    activeQueue([err("bcc_unavailable", 503)]);
    mount();
    await waitFor(() => expect(retryBtn()).not.toBeNull());

    // "No announcements from X yet" is a claim about what the SERVER holds.
    // A failed read does not support it.
    expect(screen.queryByText("NOTHING POSTED YET")).toBeNull();
    expect(
      screen.queryByText(/No announcements from Blacksmith Node yet/i),
    ).toBeNull();
  });

  it("does make the claim on a genuine empty success", async () => {
    activeQueue([announcementListResponse([], null)]);
    mount();

    await waitFor(() =>
      expect(screen.getByText("NOTHING POSTED YET")).toBeInTheDocument(),
    );
    expect(retryBtn()).toBeNull();
  });
});

describe("a permission boundary offers no retry", () => {
  for (const code of ["bcc_forbidden", "bcc_permission_denied", "bcc_blocked"]) {
    it(`renders no Retry for ${code} on first load`, async () => {
      activeQueue([err(code)]);
      mount(VISITOR_CAPABILITIES);

      await waitFor(() =>
        expect(screen.getByText(/aren’t visible to you/i)).toBeInTheDocument(),
      );
      // A boundary does not move because the page asked twice.
      expect(retryBtn()).toBeNull();
    });
  }
});

describe("a same-resource denial withdraws the rendered list", () => {
  it("drops the rows, removes the cache entry, and does not loop", async () => {
    activeQueue([
      announcementListResponse([PUBLISHED_ANNOUNCEMENT], null),
      err("bcc_forbidden"),
    ]);
    mount(VISITOR_CAPABILITIES);
    await waitFor(() =>
      expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );

    const key = announcementsListQueryKey(PAGE_ID, "active", SCOPE);
    expect(client.getQueryData(key)).not.toBeUndefined();

    await act(async () => {
      await client.refetchQueries({ queryKey: key });
    });

    // Withdrawn: the content the server has just refused is no longer shown.
    await waitFor(() =>
      expect(screen.queryByText(PUBLISHED_ANNOUNCEMENT.title)).toBeNull(),
    );
    expect(screen.getByText(/You can’t see these announcements/i)).toBeInTheDocument();

    // And the cached payload is gone, not merely hidden.
    await waitFor(() => expect(client.getQueryData(key)).toBeUndefined());

    // The loop this guards against: removing an entry whose observer is
    // still mounted makes the observer re-create it and refetch, get denied
    // again, and remove again. Settle, then prove the call count is stable.
    const settled = callsFor("active").length;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(callsFor("active").length).toBe(settled);
  });

  it("withdraws the archive independently of the active list", async () => {
    activeQueue(
      [announcementListResponse([PUBLISHED_ANNOUNCEMENT], null)],
      [announcementListResponse([ARCHIVED_ANNOUNCEMENT], null), err("bcc_forbidden")],
    );
    mount(VISITOR_CAPABILITIES);
    await waitFor(() =>
      expect(screen.getByText(ARCHIVED_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );

    await act(async () => {
      await client.refetchQueries({
        queryKey: announcementsListQueryKey(PAGE_ID, "archived", SCOPE),
      });
    });

    await waitFor(() =>
      expect(screen.getByText(/can’t see this validator’s archive/i)).toBeInTheDocument(),
    );
    // The ACTIVE list is a different resource and keeps its rows. A gate
    // that removed more than its own key would have taken this with it.
    expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument();
    expect(
      client.getQueryData(announcementsListQueryKey(PAGE_ID, "active", SCOPE)),
    ).not.toBeUndefined();
  });
});

describe("a withdrawal never destroys the operator's unsent draft", () => {
  it("keeps the composer and everything typed into it", async () => {
    activeQueue([
      announcementListResponse([PUBLISHED_ANNOUNCEMENT], null),
      err("bcc_forbidden"),
    ]);
    mount(OWNER_CAPABILITIES);
    await waitFor(() =>
      expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByTestId("announcement-compose"));
    fireEvent.change(screen.getByLabelText("TITLE"), {
      target: { value: "Upgrade window moved to Thursday" },
    });
    fireEvent.change(screen.getByLabelText("SUMMARY (REQUIRED)"), {
      target: { value: "Rescheduled after the v18 point release." },
    });
    fireEvent.change(screen.getByLabelText("BODY (MARKDOWN)"), {
      target: { value: "Full detail the operator has not sent yet." },
    });

    await act(async () => {
      await client.refetchQueries({
        queryKey: announcementsListQueryKey(PAGE_ID, "active", SCOPE),
      });
    });

    // The list genuinely WITHDREW — asserted on the withdrawal copy, not
    // merely on the title being gone. Without this the case passes against
    // a panel that has no withdrawal at all (a blanket `isError` also makes
    // the title disappear), and would not notice the composer being moved
    // inside the gate until an operator lost real work.
    await waitFor(() =>
      expect(
        screen.getByText(/You can’t see these announcements/i),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(PUBLISHED_ANNOUNCEMENT.title)).toBeNull();
    // ...and the draft survived it. The composer lives above the gate
    // precisely so a refused READ cannot destroy unsent WRITING.
    expect(screen.getByLabelText("TITLE")).toHaveValue(
      "Upgrade window moved to Thursday",
    );
    expect(screen.getByLabelText("SUMMARY (REQUIRED)")).toHaveValue(
      "Rescheduled after the v18 point release.",
    );
    expect(screen.getByLabelText("BODY (MARKDOWN)")).toHaveValue(
      "Full detail the operator has not sent yet.",
    );
  });
});

describe("the archive does not hide its own failures", () => {
  it("stays silent when there is genuinely nothing archived", async () => {
    activeQueue([announcementListResponse([PUBLISHED_ANNOUNCEMENT], null)]);
    mount();
    await waitFor(() =>
      expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );

    expect(screen.queryByTestId("announcement-archived-section")).toBeNull();
  });

  it("surfaces a failed archived read instead of looking empty", async () => {
    activeQueue(
      [announcementListResponse([PUBLISHED_ANNOUNCEMENT], null)],
      [err("bcc_unavailable", 503)],
    );
    mount();

    // The backend answers a repository fault with 503 rather than an empty
    // 200 precisely because an absent archive looks normal. The old
    // `archivedItems.length > 0` test threw that distinction away.
    await waitFor(() =>
      expect(screen.getByTestId("announcement-archived-section")).toBeInTheDocument(),
    );
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(retryBtn()).not.toBeNull();
  });
});
