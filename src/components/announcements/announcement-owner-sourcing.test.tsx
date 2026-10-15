/**
 * Where the management controls get their authority.
 *
 * The rows the panel displays come from the PUBLIC list, and the public
 * list carries no `capabilities` for anyone — the operator included. That
 * is deliberate and structural: §4.32 enforces it with two distinct
 * producers, and an operator's public list is byte-identical to an
 * anonymous one. So the displayed rows can never, by themselves, say
 * whether this operator may pin them.
 *
 * Before the owner list existed as a frontend surface, the panel read
 * `announcement.capabilities` off those public rows, found nothing, and
 * rendered a permanently disabled PIN on every row reading "This
 * announcement can't be pinned right now" — while the very same bearer
 * pinned that row perfectly well over HTTP. The control was lying.
 *
 * These cases pin the fix: capabilities come from the owner list, merged
 * by id, and a row the owner list has not covered gets NO control rather
 * than a false one.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let sessionUserId = "9001";
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: sessionUserId, handle: "fixture-a" } },
    status: "authenticated",
  }),
  getSession: async () => ({ user: { id: sessionUserId, handle: "fixture-a" } }),
  signOut: vi.fn(async () => undefined),
}));

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const listAnnouncements = vi.fn();
const listOwnerAnnouncements = vi.fn();
const setAnnouncementPin = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  listAnnouncements: (...a: unknown[]) => listAnnouncements(...a),
  listOwnerAnnouncements: (...a: unknown[]) => listOwnerAnnouncements(...a),
  setAnnouncementPin: (...a: unknown[]) => setAnnouncementPin(...a),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  getAnnouncementAsClient: vi.fn(),
  listAnnouncementComments: vi.fn(),
  createAnnouncementComment: vi.fn(),
  removeAnnouncementComment: vi.fn(),
}));

const { AnnouncementsPanel } = await import(
  "@/components/announcements/AnnouncementsPanel"
);
const { ownerAnnouncementsListQueryKey } = await import("@/hooks/useAnnouncements");
const {
  OWNER_CAPABILITIES,
  VISITOR_CAPABILITIES,
  OWNER_ANNOUNCEMENT_CAPABILITIES,
  PUBLISHED_ANNOUNCEMENT,
  SECOND_ANNOUNCEMENT,
  announcementListResponse,
  ownerAnnouncementListResponse,
} = await import("@/lib/announcements/fixtures");

const PAGE_ID = 77;
const pinButton = (id: string) => screen.queryByTestId(`announcement-pin-${id}`);
const ownerCalls = () => listOwnerAnnouncements.mock.calls;

let client: QueryClient;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  sessionUserId = "9001";
  listAnnouncements.mockReset();
  listOwnerAnnouncements.mockReset();
  setAnnouncementPin.mockReset();
  setAnnouncementPin.mockResolvedValue({});
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Two published rows on the public list, neither carrying capabilities —
  // exactly what the real public list returns.
  listAnnouncements.mockImplementation((params: unknown) => {
    const state = (params as { state?: string }).state;
    return Promise.resolve(
      state === "archived"
        ? announcementListResponse([])
        : announcementListResponse([PUBLISHED_ANNOUNCEMENT, SECOND_ANNOUNCEMENT]),
    );
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

describe("the owner list is the source of row authority", () => {
  it("asks for published rows only, from the me/ surface", async () => {
    listOwnerAnnouncements.mockResolvedValue(
      ownerAnnouncementListResponse([
        { ...PUBLISHED_ANNOUNCEMENT, capabilities: OWNER_ANNOUNCEMENT_CAPABILITIES },
      ]),
    );
    mount();

    await waitFor(() => expect(ownerCalls().length).toBeGreaterThan(0));
    // `published` specifically: drafts, scheduled and blocked rows are not
    // what the active list displays, so fetching them here would be wasted
    // and would not match any displayed row.
    expect(ownerCalls()[0]![0]).toMatchObject({ pageId: PAGE_ID, status: "published" });
  });

  it("enables the control on a row the owner list says is pinnable", async () => {
    listOwnerAnnouncements.mockResolvedValue(
      ownerAnnouncementListResponse([
        { ...PUBLISHED_ANNOUNCEMENT, capabilities: OWNER_ANNOUNCEMENT_CAPABILITIES },
      ]),
    );
    mount();

    const btn = await screen.findByTestId(`announcement-pin-${PUBLISHED_ANNOUNCEMENT.id}`);
    expect(btn).toBeEnabled();
    // And it actually mutates — the handler re-checks the merged capability.
    fireEvent.click(btn);
    await waitFor(() => expect(setAnnouncementPin).toHaveBeenCalledTimes(1));
  });

  it("keeps the control disabled, with the server's reason, when the row denies it", async () => {
    listOwnerAnnouncements.mockResolvedValue(
      ownerAnnouncementListResponse([
        {
          ...PUBLISHED_ANNOUNCEMENT,
          capabilities: {
            ...OWNER_ANNOUNCEMENT_CAPABILITIES,
            can_pin: {
              allowed: false,
              unlock_hint: null,
              reason_code: "announcement_archived",
            },
          },
        },
      ]),
    );
    mount();

    const btn = await screen.findByTestId(`announcement-pin-${PUBLISHED_ANNOUNCEMENT.id}`);
    expect(btn).toBeDisabled();
    // A denial the server actually stated is worth showing, with ITS reason —
    // that is different from inventing one for a row we know nothing about.
    expect(btn).toHaveAttribute("title", "Archived announcements can't be pinned.");
    fireEvent.click(btn);
    expect(setAnnouncementPin).not.toHaveBeenCalled();
  });

  it("renders NO control for a displayed row the owner list has not covered", async () => {
    // The two lists paginate independently, so the owner list can legitimately
    // not include a row the public list shows.
    listOwnerAnnouncements.mockResolvedValue(
      ownerAnnouncementListResponse([
        { ...PUBLISHED_ANNOUNCEMENT, capabilities: OWNER_ANNOUNCEMENT_CAPABILITIES },
      ]),
    );
    mount();

    await screen.findByTestId(`announcement-pin-${PUBLISHED_ANNOUNCEMENT.id}`);
    // Absence, not a disabled button. A control reading "can't be pinned
    // right now" would state a permission decision the client was never
    // given — and the operator can pin this row from its detail page.
    expect(pinButton(SECOND_ANNOUNCEMENT.id)).toBeNull();
    expect(screen.queryByText(/can't be pinned right now/i)).toBeNull();
  });

  it("shows both rows either way — sourcing authority never hides content", async () => {
    listOwnerAnnouncements.mockResolvedValue(ownerAnnouncementListResponse([]));
    mount();

    await waitFor(() =>
      expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );
    expect(screen.getByText(SECOND_ANNOUNCEMENT.title)).toBeInTheDocument();
  });
});

describe("the owner list is never requested speculatively", () => {
  it("is not called for a viewer without can_manage", async () => {
    listOwnerAnnouncements.mockResolvedValue(ownerAnnouncementListResponse([]));
    mount(VISITOR_CAPABILITIES);

    await waitFor(() =>
      expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );
    // This route 403s anyone who is not the resolved operator. Asking anyway
    // would mean a guaranteed 403 on every ordinary visitor's validator page.
    expect(listOwnerAnnouncements).not.toHaveBeenCalled();
    expect(pinButton(PUBLISHED_ANNOUNCEMENT.id)).toBeNull();
  });

  it("renders the rows normally for that viewer", async () => {
    listOwnerAnnouncements.mockResolvedValue(ownerAnnouncementListResponse([]));
    mount(VISITOR_CAPABILITIES);
    await waitFor(() =>
      expect(screen.getByText(SECOND_ANNOUNCEMENT.title)).toBeInTheDocument(),
    );
  });
});

describe("the owner list is viewer-scoped", () => {
  it("keys on the viewer, so two operators cannot share capabilities", () => {
    const a = ownerAnnouncementsListQueryKey(PAGE_ID, "published", "9001");
    const b = ownerAnnouncementsListQueryKey(PAGE_ID, "published", "9002");
    expect(a).not.toEqual(b);
    expect(JSON.stringify(a)).toContain("9001");
  });

  it("keys on status, so the four buckets never collide", () => {
    expect(ownerAnnouncementsListQueryKey(PAGE_ID, "published", "9001")).not.toEqual(
      ownerAnnouncementsListQueryKey(PAGE_ID, "draft", "9001"),
    );
  });

  it("sits under the page prefix every mutation already invalidates", () => {
    // `["announcements", pageId]` is the scope-blind invalidation target the
    // existing mutations use. Living under it is what makes invalidation
    // work without any mutation learning this surface exists.
    const key = ownerAnnouncementsListQueryKey(PAGE_ID, "published", "9001");
    expect(key.slice(0, 2)).toEqual(["announcements", PAGE_ID]);
  });
});

describe("a pin refreshes the authority it was granted by", () => {
  it("refetches the owner list after a successful pin", async () => {
    listOwnerAnnouncements.mockResolvedValue(
      ownerAnnouncementListResponse([
        { ...PUBLISHED_ANNOUNCEMENT, capabilities: OWNER_ANNOUNCEMENT_CAPABILITIES },
      ]),
    );
    mount();

    const btn = await screen.findByTestId(`announcement-pin-${PUBLISHED_ANNOUNCEMENT.id}`);
    const before = ownerCalls().length;
    fireEvent.click(btn);

    await waitFor(() => expect(setAnnouncementPin).toHaveBeenCalledTimes(1));
    // Pinning changes which row is pinned, and therefore what `can_pin`
    // means on both the old and the new one. Stale capabilities here would
    // offer an action the server now refuses.
    await waitFor(() => expect(ownerCalls().length).toBeGreaterThan(before));
  });
});
