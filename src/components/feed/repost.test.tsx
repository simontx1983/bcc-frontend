/**
 * F-346 reposts, the X model: REPOST toggles one plain repost, QUOTE
 * composes a new post any number of times. Pins that both pills follow the
 * server's fields and nothing else, that a double tap cannot write twice,
 * that a plain repost card IS the original while a quote card nests it
 * read-only, and that a write patches every cached copy of the same root —
 * and only those.
 */

import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedItem, FeedItemPermission, FeedResponse } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  getSession: async () => null,
  signOut: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/feed/CommentDrawer", () => ({ CommentDrawer: () => null }));

const createRepost = vi.fn();
const removeRepost = vi.fn();
const createQuoteRepost = vi.fn();
vi.mock("@/lib/api/repost-endpoints", () => ({
  createRepost: (...a: unknown[]) => createRepost(...a),
  removeRepost: (...a: unknown[]) => removeRepost(...a),
  createQuoteRepost: (...a: unknown[]) => createQuoteRepost(...a),
}));

const { FeedItemCard } = await import("@/components/feed/FeedItemCard");
const { QuoteButton, RepostButton } = await import("@/components/feed/RepostButton");
const { patchRepostState } = await import("@/hooks/useFeedCache");
const { FEED_QUERY_KEY_ROOT, FEED_ITEM_QUERY_KEY } = await import("@/hooks/useFeed");
const { BccApiError } = await import("@/lib/api/types");

const allow: FeedItemPermission = { allowed: true, unlock_hint: null };
const STATE = { root_feed_id: "feed_1", repost_count: 3, quote_count: 1, viewer_has_reposted: true };

function post(id: string, handle: string, text: string, over: Partial<FeedItem> = {}): FeedItem {
  return {
    id,
    post_kind: "status",
    external_id: 1,
    posted_at: "2026-11-05T00:00:00Z",
    scope_tags: [],
    author: { user_id: 7, handle, reputation_tier: "neutral", reputation_tier_label: "Neutral" },
    body: { text },
    reactions: { kind_grammar: "social", counts: {}, viewer_reaction: null, viewer_has_stoked: false, stoke_count: 0 },
    permissions: { can_repost: allow, can_quote: allow },
    links: { self: `/post/${id}`, author: `/u/${handle}` },
    repost_count: 2,
    quote_count: 0,
    viewer_has_reposted: false,
    repost_of: null,
    ...over,
  } as FeedItem;
}

const ROOT = post("feed_10", "anvil", "The original post.");

let qc: QueryClient;
const mount = (node: ReactNode) => render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>);

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
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  createRepost.mockReset();
  removeRepost.mockReset();
  createQuoteRepost.mockReset();
});
afterEach(cleanup);

describe("F-346 Repost pill (plain repost toggle)", () => {
  it("renders nothing on a backend without reposts (no can_repost / can_quote)", () => {
    const item = post("feed_1", "a", "x", { permissions: {} });
    const { container } = mount(
      <>
        <RepostButton item={item} />
        <QuoteButton item={item} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("hides on a denial with no hint; shows disabled with the hint when the viewer can act", () => {
    mount(<RepostButton item={post("feed_1", "a", "x", { permissions: { can_repost: { allowed: false, unlock_hint: null } } })} />);
    expect(screen.queryByRole("button")).toBeNull();
    cleanup();
    mount(
      <RepostButton
        item={post("feed_1", "a", "x", { permissions: { can_repost: { allowed: false, unlock_hint: "Sign in to repost." } } })}
      />,
    );
    expect(screen.getByRole("button", { name: /Sign in to repost\./ })).toBeDisabled();
  });

  it("shows the count; an unknown (null) count shows no number", () => {
    mount(<RepostButton item={post("feed_1", "a", "x", { repost_count: 3 })} />);
    expect(screen.getByRole("button", { name: "Repost" })).toHaveTextContent("3");
    cleanup();
    mount(<RepostButton item={post("feed_1", "a", "x", { repost_count: null })} />);
    expect(screen.getByRole("button", { name: "Repost" })).not.toHaveTextContent(/\d/);
  });

  it("a tap reposts at once (no dialog); a double tap sends ONE request", async () => {
    let resolve: (v: unknown) => void = () => {};
    createRepost.mockImplementation(() => new Promise((r) => (resolve = r)));
    mount(<RepostButton item={post("feed_1", "a", "x")} />);
    const pill = screen.getByRole("button", { name: "Repost" });
    expect(pill).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(pill);
    fireEvent.click(pill);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(pill).toBeDisabled());
    expect(createRepost).toHaveBeenCalledTimes(1);
    expect(createRepost).toHaveBeenCalledWith("feed_1");
    resolve(STATE);
    await waitFor(() => expect(pill).toBeEnabled());
  });

  it("already reposted: the tap undoes it (DELETE), and quoting never presses the pill", async () => {
    removeRepost.mockResolvedValue({ ...STATE, viewer_has_reposted: false });
    mount(<RepostButton item={post("feed_1", "a", "x", { viewer_has_reposted: true })} />);
    const pill = screen.getByRole("button", { name: "Undo your repost" });
    expect(pill).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(pill);
    await waitFor(() => expect(removeRepost).toHaveBeenCalledWith("feed_1"));
    expect(createRepost).not.toHaveBeenCalled();
  });

  it("a refused post (2-key entry, no hint) shows neither pill; a stale card's 403 says why", async () => {
    // Post-local permissions are {allowed, unlock_hint} only (#327): a
    // non-public root is just a refusal with no hint.
    const refused: FeedItemPermission = { allowed: false, unlock_hint: null };
    const hidden = post("feed_1", "a", "x", { permissions: { can_repost: refused, can_quote: refused } });
    const { container } = mount(
      <>
        <RepostButton item={hidden} />
        <QuoteButton item={hidden} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
    cleanup();
    createRepost.mockRejectedValue(new BccApiError("bcc_permission_denied", "RAW", 403, null));
    mount(<RepostButton item={post("feed_1", "a", "x")} />);
    fireEvent.click(screen.getByRole("button", { name: "Repost" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only public posts can be reposted.");
  });

  it("409 shows its own copy, never the raw server message", async () => {
    createRepost.mockRejectedValue(new BccApiError("bcc_conflict", "RAW_LEAK", 409, null));
    mount(<RepostButton item={post("feed_1", "a", "x")} />);
    fireEvent.click(screen.getByRole("button", { name: "Repost" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You’ve already reposted this.");
    expect(screen.queryByText("RAW_LEAK")).toBeNull();
  });
});

describe("F-346 Quote pill", () => {
  it("shows quote_count and opens the composer; Post needs 1–500 characters", () => {
    mount(<QuoteButton item={post("feed_1", "a", "x", { quote_count: 4 })} />);
    const pill = screen.getByRole("button", { name: "Quote this post" });
    expect(pill).toHaveTextContent("4");
    fireEvent.click(pill);
    const post_ = within(screen.getByRole("dialog")).getByRole("button", { name: "POST QUOTE" });
    expect(post_).toBeDisabled();
    const box = screen.getByLabelText("Your quote");
    fireEvent.change(box, { target: { value: "   " } });
    expect(post_).toBeDisabled();
    fireEvent.change(box, { target: { value: "y".repeat(501) } });
    expect(post_).toBeDisabled();
    fireEvent.change(box, { target: { value: "Worth reading." } });
    expect(post_).toBeEnabled();
  });

  it("sends the quote trimmed, ONCE on a double click, and closes on success", async () => {
    let resolve: (v: unknown) => void = () => {};
    createQuoteRepost.mockImplementation(() => new Promise((r) => (resolve = r)));
    mount(<QuoteButton item={post("feed_1", "a", "x")} />);
    fireEvent.click(screen.getByRole("button", { name: "Quote this post" }));
    fireEvent.change(screen.getByLabelText("Your quote"), { target: { value: "  Worth reading.  " } });
    const submit = within(screen.getByRole("dialog")).getByRole("button", { name: "POST QUOTE" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByRole("button", { name: "POSTING…" })).toBeDisabled());
    expect(createQuoteRepost).toHaveBeenCalledTimes(1);
    expect(createQuoteRepost).toHaveBeenCalledWith("feed_1", "Worth reading.");
    resolve({ ...STATE, quote_feed_id: "feed_99" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("can quote again after quoting (no once-rule), and 429 explains the posting limit", async () => {
    createQuoteRepost.mockRejectedValue(new BccApiError("bcc_rate_limited", "RAW", 429, null));
    mount(<QuoteButton item={post("feed_1", "a", "x", { viewer_has_reposted: true })} />);
    const pill = screen.getByRole("button", { name: "Quote this post" });
    expect(pill).toBeEnabled();
    fireEvent.click(pill);
    fireEvent.change(screen.getByLabelText("Your quote"), { target: { value: "Again." } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "POST QUOTE" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many posts in a short time.");
  });
});

describe("F-346 repost cards", () => {
  it("a plain repost card IS the original, under a 'reposted' line", () => {
    const wrapper = post("feed_20", "bolt", "", { repost_of: ROOT });
    mount(<FeedItemCard item={wrapper} />);
    expect(screen.getByTestId("reposted-by")).toHaveTextContent("@bolt reposted");
    expect(screen.getByRole("link", { name: "@bolt" })).toHaveAttribute("href", "/u/bolt");
    expect(screen.getByText("The original post.")).toBeInTheDocument();
    // No nested preview: the card itself is the original.
    expect(screen.queryByTestId("reposted-post-preview")).toBeNull();
  });

  it("a quote card shows the quote and nests the original as one read-only link", () => {
    const quote = post("feed_30", "bolt", "Worth reading.", { repost_of: ROOT });
    mount(<FeedItemCard item={quote} />);
    expect(screen.getByText("Worth reading.")).toBeInTheDocument();
    const preview = screen.getByTestId("reposted-post-preview");
    expect(preview).toHaveAttribute("href", "/post/feed_10");
    expect(within(preview).getByText("The original post.")).toBeInTheDocument();
    expect(within(preview).queryByRole("button")).toBeNull();
  });

  it("a quote whose original the viewer can't see keeps its text, with a neutral unavailable block", () => {
    const quote = post("feed_32", "bolt", "My own words.", {
      repost_of: null,
      repost_of_unavailable: true,
    });
    mount(<FeedItemCard item={quote} />);
    expect(screen.getByText("My own words.")).toBeInTheDocument();
    const block = screen.getByTestId("repost-original-unavailable");
    expect(block).toHaveTextContent("The original post isn’t available.");
    // Names nothing and links nowhere.
    expect(within(block).queryByRole("link")).toBeNull();
    expect(screen.queryByTestId("reposted-post-preview")).toBeNull();
  });

  it("plain vs quote is the reposter's text: whitespace-only is plain, any text is a quote", () => {
    mount(<FeedItemCard item={post("feed_31", "bolt", "   \n ", { repost_of: ROOT })} />);
    expect(screen.getByTestId("reposted-by")).toBeInTheDocument();
    expect(screen.queryByTestId("reposted-post-preview")).toBeNull();
    cleanup();
    mount(<FeedItemCard item={post("feed_33", "bolt", "Kept.", { repost_of: ROOT })} />);
    expect(screen.getByText("Kept.")).toBeInTheDocument();
    expect(screen.getByTestId("reposted-post-preview")).toBeInTheDocument();
    expect(screen.queryByTestId("reposted-by")).toBeNull();
  });

  it("an ordinary post (repost_of null or absent) gets no repost chrome", () => {
    mount(<FeedItemCard item={post("feed_34", "bolt", "Just a post.")} />);
    expect(screen.queryByTestId("reposted-by")).toBeNull();
    expect(screen.queryByTestId("reposted-post-preview")).toBeNull();
    expect(screen.queryByTestId("repost-original-unavailable")).toBeNull();
    cleanup();
    const bare = post("feed_35", "bolt", "Older backend.");
    delete (bare as { repost_of?: unknown }).repost_of;
    mount(<FeedItemCard item={bare} />);
    expect(screen.getByText("Older backend.")).toBeInTheDocument();
    expect(screen.queryByTestId("repost-original-unavailable")).toBeNull();
  });
});

describe("F-346 cache patch", () => {
  it("patches every copy keyed on the root and leaves other posts alone", () => {
    const plain = post("feed_20", "bolt", "", { repost_of: ROOT });
    const quote = post("feed_30", "cog", "Hm.", { repost_of: ROOT });
    const other = post("feed_40", "dent", "Unrelated.");
    const page: FeedResponse = { items: [ROOT, plain, quote, other], pagination: { next_cursor: null, has_more: false } };
    qc.setQueryData<InfiniteData<FeedResponse>>([...FEED_QUERY_KEY_ROOT, "for_you"], { pages: [page], pageParams: [null] });
    qc.setQueryData<FeedItem>(FEED_ITEM_QUERY_KEY("feed_30"), quote);

    const fields = { repost_count: 3, quote_count: 2, viewer_has_reposted: true };
    patchRepostState(qc, { root_feed_id: "feed_10", ...fields });

    const items = qc.getQueryData<InfiniteData<FeedResponse>>([...FEED_QUERY_KEY_ROOT, "for_you"])?.pages[0]?.items ?? [];
    const [r, p, q, o] = items;
    expect(r).toMatchObject(fields);
    expect(p).toMatchObject(fields);
    expect(p?.repost_of).toMatchObject(fields);
    expect(q).toMatchObject(fields);
    expect(q?.repost_of).toMatchObject(fields);
    expect(o).toBe(other);
    expect(qc.getQueryData<FeedItem>(FEED_ITEM_QUERY_KEY("feed_30"))?.repost_of).toMatchObject(fields);
  });
});
