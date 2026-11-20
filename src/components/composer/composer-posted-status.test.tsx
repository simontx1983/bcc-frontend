/**
 * F-258 M6 + M7: the inline composer after a post, and its "FLOOR" chip.
 *
 * M6: a successful post used to just collapse the card. Nothing said it
 *     worked (on a ranked feed the new post may not be at the top), and
 *     keyboard focus fell to <body> with the unmounted textarea. Now:
 *       - a status line reads "Posted — View post", linking /post/{act_id}
 *         (the permalink route reads the bare activity id; the feed_<n>
 *         wire id 404s there);
 *       - the live region is mounted EMPTY with the composer and filled
 *         per post with a fresh element, so a second post is announced too;
 *       - focus returns to the collapsed "What's the…" trigger;
 *       - a new draft clears the line; a failed post never shows it.
 * M7: the "FLOOR" destination chip was a focusable button that did
 *     nothing, and it showed in group composers too. It is now a plain
 *     label, and only on Floor composers.
 *
 * Real Composer, hooks and QueryClient; the posts endpoints are stubbed.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({
  createPost: vi.fn(),
  createPhotoPost: vi.fn(),
  createGifPost: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "4242", handle: "alice" } }, status: "authenticated" }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/lib/api/posts-endpoints", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createPost: (...a: unknown[]) => fx.createPost(...a),
  createPhotoPost: (...a: unknown[]) => fx.createPhotoPost(...a),
  createGifPost: (...a: unknown[]) => fx.createGifPost(...a),
}));
vi.mock("@/hooks/useGiphyIntegration", () => ({
  useGiphyIntegration: () => ({ data: { enabled: true }, isLoading: false, error: null }),
}));
// The real picker searches Giphy; these tests only need a selection.
vi.mock("@/components/composer/GifPicker", () => ({
  GifPicker: ({ onSelect }: { onSelect: (gif: unknown) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({ id: "g1", preview_url: "https://media.example/g1.gif", gif_url: "https://media.example/g1.gif" })
      }
    >
      pick test gif
    </button>
  ),
}));

import { Composer, POSTED_COPY, VIEW_POST_COPY } from "@/components/composer/Composer";
import { getFeedItemById } from "@/lib/api/feed-endpoints";
import { BccApiError } from "@/lib/api/types";

// The two GET /feed/{id} routes the /post/[id] page can reach: bcc-trust
// FeedEndpoint registers '/feed/(?P<id>\d+)' and '/feed/(?P<id>[a-zA-Z]{8})'.
const FEED_ITEM_ROUTE = /^\/wp-json\/bcc\/v1\/feed\/(\d+|[a-zA-Z]{8})$/;

/**
 * The REST path the /post/[id] page requests for an href: the page hands
 * its `id` param straight to getFeedItemById. Runs the real fetcher with
 * fetch stubbed and returns the requested path.
 */
async function restPathFor(href: string): Promise<string> {
  const match = /^\/post\/([^/]+)$/.exec(href);
  expect(match).not.toBeNull();
  const id = decodeURIComponent(match?.[1] ?? "");
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response("{}", { status: 404, headers: { "Content-Type": "application/json" } }));
  try {
    await getFeedItemById(id, null).catch(() => undefined);
    return new URL(String(fetchSpy.mock.calls[0]?.[0])).pathname;
  } finally {
    fetchSpy.mockRestore();
  }
}

let qc: QueryClient;

function wrap(node: ReactNode) {
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

function renderInline(props: { groupId?: number; pageId?: number } = {}) {
  return render(wrap(<Composer variant="inline" viewerHandle="alice" {...props} />));
}

const trigger = () =>
  screen.getByRole("button", { name: /What.s the|Post to this group|Post to this page/ });
const textarea = () => document.getElementById("composer-status-content") as HTMLTextAreaElement;
const status = () => screen.getByRole("status");

async function openAndType(value: string) {
  fireEvent.click(trigger());
  await waitFor(() => expect(document.activeElement).toBe(textarea()));
  fireEvent.change(textarea(), { target: { value } });
}

async function submit() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "POST" }));
  });
}

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
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  fx.createPost.mockReset();
  fx.createPhotoPost.mockReset();
  fx.createGifPost.mockReset();
  fx.createPost.mockResolvedValue({ ok: true, kind: "status", feed_id: "feed_123", post_id: 9, act_id: 10 });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(cleanup);

describe("Composer — after a successful post (F-258 M6)", () => {
  it("the status region is mounted empty before any post", () => {
    renderInline();
    expect(status()).toBeInTheDocument();
    expect(status()).toHaveTextContent("");
  });

  it("says 'Posted — View post', links the new post, and returns focus to the trigger", async () => {
    renderInline();
    await openAndType("hello floor");
    await submit();

    await waitFor(() => expect(status()).toHaveTextContent(`${POSTED_COPY} — ${VIEW_POST_COPY}`));
    expect(within(status()).getByRole("link", { name: VIEW_POST_COPY })).toHaveAttribute("href", "/post/10");
    expect(document.activeElement).toBe(trigger());
    expect(fx.createPost).toHaveBeenCalledTimes(1);
  });

  it("a second post is a fresh announcement (a new element in the same region)", async () => {
    renderInline();
    await openAndType("first");
    await submit();
    await waitFor(() => expect(status()).toHaveTextContent(POSTED_COPY));
    const region = status();
    const first = region.firstElementChild;

    fx.createPost.mockResolvedValue({ ok: true, kind: "status", feed_id: "feed_124", post_id: 11, act_id: 12 });
    await openAndType("second");
    await submit();
    await waitFor(() =>
      expect(within(status()).getByRole("link", { name: VIEW_POST_COPY })).toHaveAttribute("href", "/post/12"),
    );

    expect(status()).toBe(region);
    expect(region.firstElementChild).not.toBe(first);
    expect(document.activeElement).toBe(trigger());
  });

  it("opening a new draft clears the line", async () => {
    renderInline();
    await openAndType("hello");
    await submit();
    await waitFor(() => expect(status()).toHaveTextContent(POSTED_COPY));

    fireEvent.click(trigger());
    await waitFor(() => expect(status()).toHaveTextContent(""));
  });

  it("a failed post shows no 'Posted' line and keeps the draft", async () => {
    fx.createPost.mockRejectedValue(new BccApiError("bcc_rate_limited", "raw", 429, null));
    renderInline();
    await openAndType("hello");
    await submit();

    await waitFor(() => expect(fx.createPost).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(status()).toHaveTextContent("");
    expect(textarea().value).toBe("hello");
  });

  it("without an act id: 'Posted', and no link", async () => {
    fx.createPost.mockResolvedValue({ ok: true, kind: "status", feed_id: "feed_123", post_id: 9 });
    renderInline();
    await openAndType("hello");
    await submit();

    await waitFor(() => expect(status()).toHaveTextContent(POSTED_COPY));
    expect(within(status()).queryByRole("link")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("a GIF post gets the same line and focus", async () => {
    fx.createGifPost.mockResolvedValue({ ok: true, feed_id: "feed_gif", post_id: 3, act_id: 4 });
    renderInline();
    fireEvent.click(trigger());
    await waitFor(() => expect(document.activeElement).toBe(textarea()));
    fireEvent.click(screen.getByRole("button", { name: /gif/i }));
    fireEvent.click(await screen.findByRole("button", { name: "pick test gif" }));
    await submit();

    await waitFor(() =>
      expect(within(status()).getByRole("link", { name: VIEW_POST_COPY })).toHaveAttribute("href", "/post/4"),
    );
    expect(document.activeElement).toBe(trigger());
  });

  it("a photo post gets the same line and focus", async () => {
    fx.createPhotoPost.mockResolvedValue({ ok: true, feed_id: "feed_photo", post_id: 5, act_id: 6, photo_id: 7 });
    renderInline();
    fireEvent.click(trigger());
    await waitFor(() => expect(document.activeElement).toBe(textarea()));
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "p.png", { type: "image/png" })] } });
    await submit();

    await waitFor(() =>
      expect(within(status()).getByRole("link", { name: VIEW_POST_COPY })).toHaveAttribute("href", "/post/6"),
    );
    expect(document.activeElement).toBe(trigger());
  });

  it("a group post links its post the same way", async () => {
    renderInline({ groupId: 5 });
    await openAndType("hello group");
    await submit();

    await waitFor(() =>
      expect(within(status()).getByRole("link", { name: VIEW_POST_COPY })).toHaveAttribute("href", "/post/10"),
    );
    expect(document.activeElement).toBe(trigger());
  });

  it("the link resolves on the real /post/[id] route (the bare act id, not the feed_<n> wire id)", async () => {
    renderInline();
    await openAndType("hello floor");
    await submit();
    const link = await within(status()).findByRole("link", { name: VIEW_POST_COPY });
    const href = link.getAttribute("href") ?? "";

    expect(await restPathFor(href)).toMatch(FEED_ITEM_ROUTE);
    // Control: the old href shape (/post/{feed_id}) requests a path no
    // GET route matches, so the matcher above can fail.
    expect(await restPathFor("/post/feed_123")).not.toMatch(FEED_ITEM_ROUTE);
  });

  it("an unusable act id links nowhere", async () => {
    fx.createPost.mockResolvedValue({ ok: true, kind: "status", feed_id: "feed_0", post_id: 9, act_id: 0 });
    renderInline();
    await openAndType("hello");
    await submit();

    await waitFor(() => expect(status()).toHaveTextContent(POSTED_COPY));
    expect(within(status()).queryByRole("link")).toBeNull();
  });
});

describe("Composer — the FLOOR chip (F-258 M7)", () => {
  it("Floor composer: a plain label naming the destination, not a button", async () => {
    renderInline();
    fireEvent.click(trigger());
    await waitFor(() => expect(document.activeElement).toBe(textarea()));

    expect(screen.getByText("FLOOR")).toBeInTheDocument();
    expect(screen.getByText("FLOOR").closest("button")).toBeNull();
    expect(screen.queryByRole("button", { name: /floor/i })).toBeNull();
    expect(screen.getByText("FLOOR")).toHaveTextContent("Posting to the FLOOR");
  });

  it("group composer: no FLOOR chip at all", async () => {
    renderInline({ groupId: 5 });
    fireEvent.click(trigger());
    await waitFor(() => expect(document.activeElement).toBe(textarea()));

    expect(screen.queryByText("FLOOR")).toBeNull();
    expect(screen.queryByText(/Posting to the/)).toBeNull();
  });

  it("control: page composer still has none", async () => {
    renderInline({ pageId: 77 });
    fireEvent.click(trigger());
    await waitFor(() => expect(document.activeElement).toBe(textarea()));

    expect(screen.queryByText("FLOOR")).toBeNull();
  });
});
