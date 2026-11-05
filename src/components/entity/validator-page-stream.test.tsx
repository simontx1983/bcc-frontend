/**
 * The validator page's two streams, driven through the real EntityProfile:
 * everyday posts on the Activity tab, official notices at the very top.
 *
 * Only the wire is faked. The real Composer, FeedItemCard, EntityTabs,
 * AnnouncementBar and AnnouncementComposer run, so "the post sends
 * target_page_id" means the body the API client was handed, not a prop.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AnnouncementEndpoints from "@/lib/api/announcement-endpoints";
import type * as ApiClient from "@/lib/api/client";
import type { Card, FeedItem, FeedResponse } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const auth = vi.hoisted(() => ({ signedIn: true }));
vi.mock("next-auth/react", () => {
  const session = { user: { id: "9001", handle: "fixture-a" } };
  return {
    useSession: () =>
      auth.signedIn
        ? { data: session, status: "authenticated" }
        : { data: null, status: "unauthenticated" },
    getSession: async () => (auth.signedIn ? session : null),
    signOut: vi.fn(async () => undefined),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/v/fixture-validator",
  useSearchParams: () => new URLSearchParams(),
}));

// The hero and the Backing tab are not under test and fetch on their own.
vi.mock("@/components/layout/PageHero", () => ({ PageHero: () => null }));
vi.mock("@/components/common/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/profile/AttestationRoster", () => ({
  AttestationRoster: () => null,
}));

const bccFetchAsClient = vi.fn();
vi.mock("@/lib/api/client", async (orig) => {
  const actual = await orig<typeof ApiClient>();
  return {
    ...actual,
    bccFetchAsClient: (...a: unknown[]) => bccFetchAsClient(...a),
  };
});

const getAnnouncementRotator = vi.fn();
const createAnnouncement = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", async (orig) => {
  const actual = await orig<typeof AnnouncementEndpoints>();
  return {
    ...actual,
    getAnnouncementRotator: (...a: unknown[]) => getAnnouncementRotator(...a),
    createAnnouncement: (...a: unknown[]) => createAnnouncement(...a),
  };
});

const { EntityProfile } = await import("@/components/entity/EntityProfile");
const { BccApiError } = await import("@/lib/api/types");
const {
  OWNER_CAPABILITIES,
  VISITOR_CAPABILITIES,
  PUBLISHED_ANNOUNCEMENT,
  PUBLISHED_ANNOUNCEMENT_DETAIL,
  announcementListResponse,
} = await import("@/lib/announcements/fixtures");

const PAGE_ID = 35;
const LABEL = "Operator of Fixture Validator";
const NOT_CLAIMED_COPY = "Once the operator claims";

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: PAGE_ID,
    card_kind: "validator",
    name: "Fixture Validator",
    handle: "fixture-validator",
    is_claimed: true,
    links: { self: "/v/fixture-validator" },
    permissions: {},
    stats: [],
    chains: null,
    claim_target: null,
    onchain_signals: null,
    ...overrides,
  } as unknown as Card;
}

function makePost(id: string, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    post_kind: "status",
    external_id: 100,
    posted_at: "2026-11-05T00:00:00Z",
    scope_tags: [],
    author: {
      user_id: 7,
      handle: "anvil",
      reputation_tier: "neutral",
      reputation_tier_label: "Neutral",
    },
    body: { text: `body of ${id}` },
    reactions: {
      kind_grammar: "social",
      counts: {},
      viewer_reaction: null,
      viewer_has_stoked: false,
      stoke_count: 0,
    },
    permissions: {},
    links: { self: `/post/${id}`, author: "/u/anvil" },
    page_context: {
      id: PAGE_ID,
      name: "Fixture Validator",
      handle: "fixture-validator",
      url: "/v/fixture-validator",
      label: LABEL,
    },
    ...overrides,
  } as FeedItem;
}

function feedResponse(items: FeedItem[], nextCursor: string | null = null): FeedResponse {
  return { items, pagination: { next_cursor: nextCursor, has_more: nextCursor !== null } };
}

/** What `GET /pages/35/feed` answers with, given the requested path. */
let feedAnswer: (path: string) => Promise<FeedResponse>;
let postAnswer: (body: unknown) => Promise<unknown>;

function feedCalls(): string[] {
  return bccFetchAsClient.mock.calls
    .map((call) => String(call[0]))
    .filter((path) => path.startsWith(`pages/${PAGE_ID}/feed`));
}

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
  auth.signedIn = true;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  feedAnswer = async () => feedResponse([]);
  postAnswer = async () => ({ id: "feed_1" });
  bccFetchAsClient.mockReset();
  bccFetchAsClient.mockImplementation(
    (path: string, options: { method?: string; body?: unknown }) => {
      if (path === "posts" && options.method === "POST") return postAnswer(options.body);
      if (path.startsWith(`pages/${PAGE_ID}/feed`)) return feedAnswer(path);
      return Promise.reject(new Error(`unexpected request: ${path}`));
    },
  );
  getAnnouncementRotator.mockReset();
  getAnnouncementRotator.mockResolvedValue(announcementListResponse([]));
  createAnnouncement.mockReset();
  createAnnouncement.mockResolvedValue(PUBLISHED_ANNOUNCEMENT_DETAIL);
});

afterEach(() => {
  cleanup();
  client.clear();
});

function mount(card: Card) {
  return render(
    <QueryClientProvider client={client}>
      <EntityProfile
        card={card}
        kindLabel="Validator"
        streamEmptyState={{ title: "No posts yet", body: "Nothing has been posted here yet." }}
        viewerAuthed
      />
    </QueryClientProvider>,
  );
}

function openActivity() {
  fireEvent.click(screen.getByRole("tab", { name: "Activity" }));
}

const composer = () => screen.queryByRole("region", { name: "Compose a status post" });

describe("the page composer", () => {
  it("is mounted when the server says can_post", async () => {
    mount(makeCard({ page_stream: { can_post: true } }));
    openActivity();
    expect(composer()).toBeInTheDocument();
    await screen.findByText("No posts yet");
  });

  it("is absent when the server says no, and the feed still reads", async () => {
    feedAnswer = async () => feedResponse([makePost("feed_1")]);
    mount(makeCard({ page_stream: { can_post: false } }));
    openActivity();
    await screen.findByText("body of feed_1");
    expect(composer()).not.toBeInTheDocument();
  });

  it("offers text only: no photo, GIF or attachment stubs", async () => {
    mount(makeCard({ page_stream: { can_post: true } }));
    openActivity();
    const region = within(composer() as HTMLElement);
    expect(region.queryByRole("button", { name: /photo/i })).toBeNull();
    expect(region.queryByRole("button", { name: /gif/i })).toBeNull();
    expect(region.queryByRole("button", { name: /poll/i })).toBeNull();
    expect(region.queryByRole("button", { name: /location/i })).toBeNull();
    expect((composer() as HTMLElement).querySelector('input[type="file"]')).toBeNull();
    await screen.findByText("No posts yet");
  });

  it("sends target_page_id and refreshes the feed", async () => {
    let served: FeedItem[] = [];
    feedAnswer = async () => feedResponse(served);
    mount(makeCard({ page_stream: { can_post: true } }));
    openActivity();
    await screen.findByText("No posts yet");

    const region = within(composer() as HTMLElement);
    fireEvent.click(region.getByRole("button", { name: /post to this page/i }));
    fireEvent.change(region.getByRole("combobox"), {
      target: { value: "Maintenance window at 14:00 UTC" },
    });
    served = [makePost("feed_new", { body: { text: "Maintenance window at 14:00 UTC" } })];
    fireEvent.click(region.getByRole("button", { name: /^post$/i }));

    await waitFor(() => {
      const write = bccFetchAsClient.mock.calls.find((call) => call[0] === "posts");
      expect(write?.[1].body).toEqual({
        kind: "status",
        content: "Maintenance window at 14:00 UTC",
        target_page_id: PAGE_ID,
      });
    });
    // Arrived through the invalidation, with no reload.
    await screen.findByText("Maintenance window at 14:00 UTC");
  });

  it("says why when the viewer no longer operates the validator, and keeps the draft", async () => {
    postAnswer = async () => {
      throw new BccApiError("bcc_forbidden", "RAW SERVER TEXT", 403, {
        error: {
          code: "bcc_forbidden",
          message: "RAW SERVER TEXT",
          status: 403,
          data: { reason_code: "not_claimer" },
        },
        _meta: { version: "v1" },
      });
    };
    mount(makeCard({ page_stream: { can_post: true } }));
    openActivity();
    await screen.findByText("No posts yet");

    const region = within(composer() as HTMLElement);
    fireEvent.click(region.getByRole("button", { name: /post to this page/i }));
    fireEvent.change(region.getByRole("combobox"), { target: { value: "Still mine?" } });
    fireEvent.click(region.getByRole("button", { name: /^post$/i }));

    expect(await region.findByRole("alert")).toHaveTextContent(
      "You're not the verified operator of this validator any more.",
    );
    expect(region.getByRole("combobox")).toHaveValue("Still mine?");
  });
});

describe("the Activity feed", () => {
  it("renders posts with the server's label linked to the server's url", async () => {
    feedAnswer = async () => feedResponse([makePost("feed_1")]);
    mount(makeCard({ page_stream: { can_post: false } }));
    openActivity();
    await screen.findByText("body of feed_1");
    expect(screen.getByRole("link", { name: LABEL })).toHaveAttribute(
      "href",
      "/v/fixture-validator",
    );
  });

  it("reads the same for a signed-out visitor, who gets no composer", async () => {
    auth.signedIn = false;
    feedAnswer = async () => feedResponse([makePost("feed_1")]);
    mount(makeCard({ page_stream: { can_post: false } }));
    openActivity();
    await screen.findByText("body of feed_1");
    expect(screen.getByRole("link", { name: LABEL })).toBeInTheDocument();
    expect(composer()).not.toBeInTheDocument();
  });

  it("renders no label on a post whose page_context is null", async () => {
    feedAnswer = async () => feedResponse([makePost("feed_1", { page_context: null })]);
    mount(makeCard({ page_stream: { can_post: false } }));
    openActivity();
    await screen.findByText("body of feed_1");
    expect(screen.queryByRole("link", { name: LABEL })).toBeNull();
  });

  it("says plainly that nothing's been posted on a quiet claimed page", async () => {
    mount(makeCard({ page_stream: { can_post: false } }));
    openActivity();
    await screen.findByText("Nothing has been posted here yet.");
    expect(screen.queryByText(/STREAM LOCKED/)).toBeNull();
    expect(document.body.textContent).not.toContain(NOT_CLAIMED_COPY);
  });

  it("keeps LockedStreamPanel on an unclaimed page with no posts", async () => {
    mount(makeCard({ is_claimed: false, page_stream: { can_post: false } }));
    openActivity();
    expect(screen.getByText("STREAM LOCKED")).toBeInTheDocument();
    await waitFor(() => expect(feedCalls()).toHaveLength(1));
    expect(await screen.findByText("STREAM LOCKED")).toBeInTheDocument();
    expect(screen.queryByText("No posts yet")).toBeNull();
    expect(composer()).not.toBeInTheDocument();
  });

  it("keeps earlier posts, label included, on a page whose claim lapsed", async () => {
    feedAnswer = async () => feedResponse([makePost("feed_old")]);
    mount(makeCard({ is_claimed: false, page_stream: { can_post: false } }));
    openActivity();
    await screen.findByText("body of feed_old");
    expect(screen.getByRole("link", { name: LABEL })).toBeInTheDocument();
    expect(screen.queryByText("STREAM LOCKED")).toBeNull();
  });

  it("does not read the feed when the card has no page_stream block", async () => {
    mount(makeCard());
    openActivity();
    expect(screen.getByText("No posts yet")).toBeInTheDocument();
    expect(composer()).not.toBeInTheDocument();
    expect(feedCalls()).toHaveLength(0);
  });

  it("replaces the list with a retry only on a first-load failure", async () => {
    feedAnswer = async () => {
      throw new BccApiError("bcc_unavailable", "RAW SERVER TEXT", 503, null);
    };
    mount(makeCard({ page_stream: { can_post: false } }));
    openActivity();
    expect(await screen.findByRole("alert")).toHaveTextContent(/temporarily unavailable/);
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(screen.queryByText("No posts yet")).toBeNull();
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
  });

  it("offers no retry on a permission denial", async () => {
    feedAnswer = async () => {
      throw new BccApiError("bcc_forbidden", "RAW SERVER TEXT", 403, null);
    };
    mount(makeCard({ page_stream: { can_post: false } }));
    openActivity();
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("keeps the loaded posts when the next page fails, and withdraws LOAD MORE", async () => {
    feedAnswer = async (path) => {
      if (path.includes("cursor=c2")) {
        throw new BccApiError("bcc_unavailable", "RAW SERVER TEXT", 503, null);
      }
      return feedResponse([makePost("feed_1")], "c2");
    };
    mount(makeCard({ page_stream: { can_post: false } }));
    openActivity();
    await screen.findByText("body of feed_1");

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("body of feed_1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(screen.queryByText("End of the feed.")).toBeNull();
  });
});

describe("announcements at the very top", () => {
  it("puts the button and the bar above everything else in the page", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([PUBLISHED_ANNOUNCEMENT]),
    );
    mount(makeCard({ announcements: { capabilities: OWNER_CAPABILITIES } }));

    const bar = await screen.findByTestId("announcement-bar");
    const button = screen.getByTestId("announcement-compose-top");
    const main = screen.getByRole("main");

    expect(main.firstElementChild).toBe(button.parentElement);
    expect(button.parentElement?.nextElementSibling).toBe(bar);

    const follows = (later: Element) =>
      bar.compareDocumentPosition(later) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(follows(screen.getByText(/FLOOR/))).toBeTruthy();
    expect(follows(screen.getByRole("heading", { level: 1 }))).toBeTruthy();
    expect(follows(screen.getByRole("tablist"))).toBeTruthy();
  });

  it("shows the bar to a visitor as the page's first content, with no button", async () => {
    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([PUBLISHED_ANNOUNCEMENT]),
    );
    mount(makeCard({ announcements: { capabilities: VISITOR_CAPABILITIES } }));

    const bar = await screen.findByTestId("announcement-bar");
    expect(screen.getByRole("main").firstElementChild).toBe(bar);
    expect(screen.queryByTestId("announcement-compose-top")).toBeNull();
  });

  it("offers the button with nothing posted yet, when the bar itself renders nothing", async () => {
    mount(makeCard({ announcements: { capabilities: OWNER_CAPABILITIES } }));
    await waitFor(() => expect(getAnnouncementRotator).toHaveBeenCalled());
    expect(screen.getByTestId("announcement-compose-top")).toBeInTheDocument();
    expect(screen.queryByTestId("announcement-bar")).toBeNull();
  });

  it("renders nothing at the top without the capability block", () => {
    mount(makeCard());
    expect(screen.queryByTestId("announcement-compose-top")).toBeNull();
    expect(getAnnouncementRotator).not.toHaveBeenCalled();
  });

  it("holds no skeleton at the top, so a page with no notices does not jump", () => {
    getAnnouncementRotator.mockReturnValue(new Promise(() => {}));
    mount(makeCard({ announcements: { capabilities: VISITOR_CAPABILITIES } }));
    expect(
      within(screen.getByRole("main")).queryByRole("region", { name: "Announcements" }),
    ).toBeNull();
  });

  function fillAndPublish() {
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("TITLE"), { target: { value: "Upgrade" } });
    fireEvent.change(dialog.getByLabelText("SUMMARY (REQUIRED)"), {
      target: { value: "Node upgrade tonight." },
    });
    fireEvent.change(dialog.getByLabelText("BODY (MARKDOWN)"), {
      target: { value: "Details of the upgrade." },
    });
    fireEvent.click(dialog.getByRole("button", { name: "PUBLISH" }));
  }

  it("opens the dialog from the top, publishes, closes and refreshes the bar", async () => {
    mount(makeCard({ announcements: { capabilities: OWNER_CAPABILITIES } }));
    await waitFor(() => expect(getAnnouncementRotator).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByTestId("announcement-compose-top"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    getAnnouncementRotator.mockResolvedValue(
      announcementListResponse([PUBLISHED_ANNOUNCEMENT]),
    );
    fillAndPublish();

    await waitFor(() =>
      expect(createAnnouncement).toHaveBeenCalledWith(
        PAGE_ID,
        expect.objectContaining({
          title: "Upgrade",
          summary: "Node upgrade tonight.",
          body: "Details of the upgrade.",
          mode: "publish",
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByTestId("announcement-bar")).toBeInTheDocument();
  });

  it("keeps the dialog and the draft open on a refusal, and clears it on reopen", async () => {
    createAnnouncement.mockRejectedValue(
      new BccApiError("bcc_forbidden", "RAW SERVER TEXT", 403, null),
    );
    mount(makeCard({ announcements: { capabilities: OWNER_CAPABILITIES } }));
    fireEvent.click(screen.getByTestId("announcement-compose-top"));
    fillAndPublish();

    const dialog = within(screen.getByRole("dialog"));
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "You're not the verified operator of this validator any more.",
    );
    expect(dialog.getByLabelText("TITLE")).toHaveValue("Upgrade");

    fireEvent.click(dialog.getByRole("button", { name: "CANCEL" }));
    fireEvent.click(screen.getByTestId("announcement-compose-top"));
    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull(),
    );
  });

  it("still reaches history and management through the Announcements tab", () => {
    mount(makeCard({ announcements: { capabilities: OWNER_CAPABILITIES } }));
    expect(screen.getByRole("tab", { name: "Announcements" })).toBeInTheDocument();
  });
});

describe("the route shells' empty-state copy", () => {
  const read = (slug: string) =>
    readFileSync(
      join(process.cwd(), "src", "app", "(main)", "(app)", slug, "[slug]", "page.tsx"),
      "utf8",
    );

  it("never talks about claiming on the validator page, which is claimed when it shows", () => {
    expect(read("v")).not.toMatch(/claims this validator/i);
  });

  it("leaves the project and creator shells' copy as it was", () => {
    expect(read("p")).toContain("No releases yet");
    expect(read("c")).toContain("No drops yet");
  });
});
