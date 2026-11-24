/**
 * F-494: "Posted — View post" when the host closes the composer on success.
 *
 * The inline composer shows its own "Posted" line (F-258 M6), but two
 * hosts close it on success and so unmounted that line with it:
 *   - the New Post dialog (NewPostTrigger) now shows a floating notice,
 *     right after its button in the DOM. The Dialog returns focus to the
 *     button, so the next Tab reaches "View post". It clears on its ×
 *     (focus back to the button), on the next open, or on a route change;
 *   - the review dialog's Update tab (ReviewCallout) did too, until F-561
 *     made that dialog review-only (Phillip, 2026-11-23): that path and
 *     its tests are gone.
 *
 * F-514: the floating panel is portaled into the shared bottom slot (on
 * document.body), and the region stays in place, sr-only. The keyboard
 * path is kept by PostedNotice's focus bridge: Tab from the button reaches
 * "View post", Shift+Tab goes back, Tab past × reaches what followed it.
 *
 * Real NewPostTrigger / Composer / Dialog and QueryClient;
 * the posts endpoints are stubbed.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fx = vi.hoisted(() => ({
  createPost: vi.fn(),
  refresh: vi.fn(),
  pathname: "/",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "4242", handle: "alice" } }, status: "authenticated" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => fx.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: fx.refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/lib/api/posts-endpoints", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createPost: (...a: unknown[]) => fx.createPost(...a),
}));
vi.mock("@/hooks/useGiphyIntegration", () => ({
  useGiphyIntegration: () => ({ data: { enabled: false }, isLoading: false, error: null }),
}));
vi.mock("@/hooks/useMentionSearch", () => ({
  useMentionSearch: () => ({ data: [], isLoading: false, isError: false }),
}));

import { NewPostTrigger } from "@/components/composer/NewPostTrigger";
import { DISMISS_POSTED_COPY, POSTED_COPY, VIEW_POST_COPY } from "@/components/composer/PostedNotice";
import { BccApiError } from "@/lib/api/types";

let qc: QueryClient;

const wrap = (node: ReactNode) => <QueryClientProvider client={qc}>{node}</QueryClientProvider>;

/** The host's own status region (the open composer has one too, inside the dialog). */
const notice = () => {
  const outside = screen.getAllByRole("status").filter((el) => el.closest('[role="dialog"]') === null);
  expect(outside).toHaveLength(1);
  return outside[0] as HTMLElement;
};


async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
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
});

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  fx.createPost.mockReset();
  fx.refresh.mockReset();
  fx.pathname = "/";
  fx.createPost.mockResolvedValue({ ok: true, kind: "status", feed_id: "feed_123", post_id: 9, act_id: 10 });
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => {
  cleanup();
  qc.clear();
});

// ─────────────────────────────────────────────────────────────────────
// NewPostTrigger
// ─────────────────────────────────────────────────────────────────────

function triggerTree() {
  return wrap(
    <>
      <NewPostTrigger ariaLabel="New post">+ New Post</NewPostTrigger>
      {/* Stands in for the next sidebar link after the button. */}
      <a href="#after">next link</a>
    </>,
  );
}

const trigger = () => screen.getByRole("button", { name: "New post" });
/** The floating panel: in the shared bottom slot, on document.body. */
const slot = () => document.getElementById("bcc-bottom-slot");
const panelLink = () => within(slot() as HTMLElement).getByRole("link", { name: VIEW_POST_COPY });
const composeDialog = () => screen.queryByRole("dialog", { name: "Compose a post" });

async function openDialog() {
  trigger().focus();
  fireEvent.click(trigger());
  return screen.findByRole("dialog", { name: "Compose a post" });
}

async function postFromDialog(text = "hello from the dialog") {
  const dialog = await openDialog();
  fireEvent.change(dialog.querySelector("textarea") as HTMLTextAreaElement, { target: { value: text } });
  await act(async () => {
    fireEvent.click(within(dialog).getByRole("button", { name: "POST" }));
  });
}

describe("NewPostTrigger — 'Posted' after the dialog closes (F-494)", () => {
  it("the notice region is mounted empty, between the button and what follows it, and paints nothing", () => {
    render(triggerTree());
    const region = notice();
    expect(region).toHaveTextContent("");
    expect(trigger().compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(screen.getByRole("link", { name: "next link" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect((region.parentElement as HTMLElement).className).not.toContain("bcc-panel");
  });

  it("a post: the dialog closes, 'Posted — View post' links /post/{act_id}, focus is on the button, and Tab reaches the link next", async () => {
    render(triggerTree());
    await postFromDialog();

    await waitFor(() => expect(composeDialog()).toBeNull());
    await waitFor(() => expect(notice()).toHaveTextContent(`${POSTED_COPY} — ${VIEW_POST_COPY}`));
    // The region announces in place (sr-only); the link is in the panel,
    // which is in the shared bottom slot on document.body.
    expect(notice()).toHaveClass("sr-only");
    const link = panelLink();
    expect(link).toHaveAttribute("href", "/post/10");
    expect((slot() as HTMLElement).parentElement).toBe(document.body);
    expect(link.closest(".bcc-panel")).not.toBeNull();
    expect(document.activeElement).toBe(trigger());
    // The bridge: Tab from the button reaches "View post" next.
    const notPrevented = fireEvent.keyDown(trigger(), { key: "Tab" });
    expect(notPrevented).toBe(false);
    expect(document.activeElement).toBe(link);
  });

  it("the bridge: Shift+Tab from View post is the button; Tab past × is what followed the button", async () => {
    render(triggerTree());
    await postFromDialog();
    await waitFor(() => expect(notice()).toHaveTextContent(POSTED_COPY));

    const link = panelLink();
    link.focus();
    fireEvent.keyDown(link, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(trigger());

    const dismiss = screen.getByRole("button", { name: DISMISS_POSTED_COPY });
    dismiss.focus();
    fireEvent.keyDown(dismiss, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "next link" }));

    // Inside the panel, Tab from View post is left to the browser (× is next).
    link.focus();
    expect(fireEvent.keyDown(link, { key: "Tab" })).toBe(true);
  });

  it("with no notice, Tab from the button is the browser's own", async () => {
    render(triggerTree());
    trigger().focus();
    expect(fireEvent.keyDown(trigger(), { key: "Tab" })).toBe(true);
    expect(document.activeElement).toBe(trigger());
    expect(slot()).toBeNull();
  });

  it("a second post is a fresh announcement in the same region", async () => {
    render(triggerTree());
    await postFromDialog("first");
    await waitFor(() => expect(notice()).toHaveTextContent(POSTED_COPY));
    const region = notice();
    const first = region.firstElementChild;

    fx.createPost.mockResolvedValue({ ok: true, kind: "status", feed_id: "feed_124", post_id: 11, act_id: 12 });
    await postFromDialog("second");
    await waitFor(() => expect(panelLink()).toHaveAttribute("href", "/post/12"));
    expect(notice()).toBe(region);
    expect(region.firstElementChild).not.toBe(first);
  });

  it("× dismisses it and puts focus back on the button", async () => {
    render(triggerTree());
    await postFromDialog();
    await waitFor(() => expect(notice()).toHaveTextContent(POSTED_COPY));

    const dismiss = screen.getByRole("button", { name: DISMISS_POSTED_COPY });
    dismiss.focus();
    fireEvent.click(dismiss);

    expect(notice()).toHaveTextContent("");
    expect(screen.queryByRole("button", { name: DISMISS_POSTED_COPY })).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("opening the dialog again clears it", async () => {
    render(triggerTree());
    await postFromDialog();
    await waitFor(() => expect(notice()).toHaveTextContent(POSTED_COPY));

    await openDialog();
    expect(notice()).toHaveTextContent("");
  });

  it("a route change clears it", async () => {
    const { rerender } = render(triggerTree());
    await postFromDialog();
    await waitFor(() => expect(notice()).toHaveTextContent(POSTED_COPY));

    fx.pathname = "/halls";
    rerender(triggerTree());
    await waitFor(() => expect(notice()).toHaveTextContent(""));
  });

  it("control: a rerender on the same route keeps it", async () => {
    const { rerender } = render(triggerTree());
    await postFromDialog();
    await waitFor(() => expect(notice()).toHaveTextContent(POSTED_COPY));

    rerender(triggerTree());
    await settle();
    expect(notice()).toHaveTextContent(POSTED_COPY);
  });

  it("a failed post: no notice, and the dialog stays open with the draft", async () => {
    fx.createPost.mockRejectedValue(new BccApiError("bcc_rate_limited", "raw", 429, null));
    render(triggerTree());
    await postFromDialog("keep me");
    await waitFor(() => expect(fx.createPost).toHaveBeenCalledTimes(1));
    await settle();

    expect(composeDialog()).not.toBeNull();
    expect(notice()).toHaveTextContent("");
    expect((composeDialog() as HTMLElement).querySelector("textarea")).toHaveValue("keep me");
  });

  it("discarding the draft: no notice", async () => {
    render(triggerTree());
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard draft" }));

    await waitFor(() => expect(composeDialog()).toBeNull());
    expect(notice()).toHaveTextContent("");
  });
});
