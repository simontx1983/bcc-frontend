/**
 * F-258 M6 + M7: the inline composer after a post, and its "FLOOR" chip.
 *
 * M6: a successful post used to just collapse the card. Nothing said it
 *     worked (on a ranked feed the new post may not be at the top), and
 *     keyboard focus fell to <body> with the unmounted textarea. Now:
 *       - a status line reads "Posted — View post", linking /post/{feed_id};
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
import { BccApiError } from "@/lib/api/types";

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
    expect(within(status()).getByRole("link", { name: VIEW_POST_COPY })).toHaveAttribute("href", "/post/feed_123");
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
      expect(within(status()).getByRole("link", { name: VIEW_POST_COPY })).toHaveAttribute("href", "/post/feed_124"),
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

  it("without a feed id: 'Posted', and no link", async () => {
    fx.createPost.mockResolvedValue({ ok: true, kind: "status", feed_id: "", post_id: 9, act_id: 10 });
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
      expect(within(status()).getByRole("link", { name: VIEW_POST_COPY })).toHaveAttribute("href", "/post/feed_gif"),
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
      expect(within(status()).getByRole("link", { name: VIEW_POST_COPY })).toHaveAttribute("href", "/post/feed_photo"),
    );
    expect(document.activeElement).toBe(trigger());
  });

  it("a group post links its post the same way", async () => {
    renderInline({ groupId: 5 });
    await openAndType("hello group");
    await submit();

    await waitFor(() =>
      expect(within(status()).getByRole("link", { name: VIEW_POST_COPY })).toHaveAttribute("href", "/post/feed_123"),
    );
    expect(document.activeElement).toBe(trigger());
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
