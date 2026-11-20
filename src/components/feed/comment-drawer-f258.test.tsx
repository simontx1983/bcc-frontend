/**
 * F-258 (audit M2–M5), the comment drawer.
 *
 *  - M2: a failed reply came back as a top-level comment. The composer
 *    cleared the reply target on submit and restored only the draft.
 *  - M3: a collapsed draft couldn't be reached by keyboard: the textarea
 *    was `invisible` (visibility: hidden) under the preview.
 *  - M4: a failed comment or attachment was a red row with no role, so a
 *    screen reader heard nothing.
 *  - M5: the comment's Stoke and Helpful were dead for a signed-out
 *    visitor, and a failed toggle rolled back without a word.
 *
 * The create and toggle mutations are stubs that capture their per-call
 * callbacks, so a test decides when a request fails, and what happened on
 * screen in between (a new reply target, a withdrawal).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

type Callbacks = { onError?: (err: unknown) => void; onSuccess?: () => void };

const state = vi.hoisted(() => ({
  session: "authenticated" as "authenticated" | "unauthenticated" | "loading",
  comments: null as unknown,
  createCalls: [] as { vars: Record<string, unknown>; cb: Callbacks }[],
  stokeCalls: [] as { vars: Record<string, unknown>; cb: Callbacks }[],
  helpfulCalls: [] as { vars: Record<string, unknown>; cb: Callbacks }[],
  upload: null as null | ((file: File) => Promise<unknown>),
}));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: state.session,
    data: state.session === "authenticated" ? { user: { id: 1 } } : null,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/u/anvil",
}));
vi.mock("@/hooks/useComments", () => ({
  useComments: () => state.comments,
  commentsQueryKey: (feedId: string) => ["comments", feedId],
  commentsListQueryKey: (feedId: string, sort: string) => ["comments", feedId, "list", sort],
  restoreCommentsSnapshot: () => {},
  useCreateCommentMutation: () => ({
    mutate: (vars: Record<string, unknown>, cb: Callbacks) => state.createCalls.push({ vars, cb }),
    isPending: false,
    error: null,
  }),
  useDeleteCommentMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useCommentStoke", () => ({
  useCommentStoke: () => ({
    mutate: (vars: Record<string, unknown>, cb: Callbacks) => state.stokeCalls.push({ vars, cb }),
    isPending: false,
  }),
}));
vi.mock("@/hooks/useMarkHelpful", () => ({
  useMarkHelpful: () => ({ mutate: vi.fn(), isPending: false }),
  useMarkHelpfulComment: () => ({
    mutate: (vars: Record<string, unknown>, cb: Callbacks) => state.helpfulCalls.push({ vars, cb }),
    isPending: false,
  }),
}));
vi.mock("@/hooks/useGiphyIntegration", () => ({ useGiphyIntegration: () => ({ data: undefined }) }));
vi.mock("@/lib/analytics/posthog", () => ({ captureAnalyticsEvent: vi.fn() }));
vi.mock("@/lib/api/blog-endpoints", () => ({
  uploadBlogCoverImage: (file: File) => (state.upload ?? (() => Promise.reject(new Error("unset"))))(file),
}));
vi.mock("@/components/identity/AuthorBadge", () => ({ AuthorBadge: () => null }));

const { CommentDrawer } = await import("@/components/feed/CommentDrawer");

const comment = (id: number, extra: Record<string, unknown> = {}) => ({
  id: "c" + id,
  body: "comment body " + id,
  parent_id: null,
  posted_at: "2026-10-01T12:00:00Z",
  author: { id: 10 + id, handle: "a" + id, display_name: "A" + id, avatar_url: "" },
  stoke_count: 0,
  viewer_has_stoked: false,
  helpful_count: 0,
  viewer_has_marked: false,
  is_deleted: false,
  permissions: {},
  mentions: [],
  ...extra,
});

function healthy(items: unknown[]) {
  return {
    isPending: false, isLoading: false, isError: false,
    isLoadingError: false, isRefetchError: false, isFetchNextPageError: false,
    error: null, data: { pages: [{ items, pagination: { next_cursor: null, has_more: false } }] },
    hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn(), refetch: vi.fn(),
  };
}

function deniedRefetch(items: unknown[]) {
  return {
    ...healthy(items),
    isError: true,
    isRefetchError: true,
    error: new BccApiError("bcc_forbidden", "RAW", 403, null),
  };
}

const apiErr = (code: string, status = 400) => new BccApiError(code, "RAW SERVER TEXT", status, null);

let client: QueryClient;
function withClient(ui: ReactElement) {
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}
const drawer = (props: { canInteract?: boolean } = {}) =>
  render(withClient(<CommentDrawer feedId="f1" isOpen {...props} />));

beforeEach(() => {
  // jsdom implements neither: the reply effect scrolls, the reduced-motion
  // hook reads matchMedia.
  (Element.prototype as unknown as Record<string, unknown>)["scrollIntoView"] = () => {};
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.session = "authenticated";
  state.comments = healthy([comment(1), comment(2)]);
  state.createCalls = [];
  state.stokeCalls = [];
  state.helpfulCalls = [];
  state.upload = null;
});

afterEach(() => {
  cleanup();
  client.clear();
});

const textbox = () => screen.getByRole("textbox") as HTMLTextAreaElement;
const replyTo = (name: string) => fireEvent.click(screen.getByRole("button", { name: `Reply to ${name}` }));
const submit = () => fireEvent.submit(textbox().closest("form") as HTMLFormElement);
const lastCreate = () => state.createCalls[state.createCalls.length - 1]!;
const assertiveRegion = () =>
  document.querySelector('form [aria-live="assertive"]') as HTMLElement;

// ─────────────────────────────────────────────────────────────────────
// M2: a failed reply stays a reply
// ─────────────────────────────────────────────────────────────────────

describe("M2: a failed reply keeps its reply target", () => {
  it("submitting clears the chip at once, and a failure brings it and the draft back", () => {
    drawer();
    replyTo("A1");
    fireEvent.change(textbox(), { target: { value: "my reply" } });
    submit();

    expect(lastCreate().vars).toMatchObject({ body: "my reply", parent_id: "c1" });
    expect(screen.queryByText(/replying to/i)).toBeNull();
    expect(textbox().value).toBe("");

    act(() => lastCreate().cb.onError?.(apiErr("bcc_unavailable", 503)));

    expect(screen.getByText(/replying to/i)).toHaveTextContent("Replying to @a1");
    expect(textbox().value).toBe("my reply");

    // The retry is still a reply to the same comment.
    submit();
    expect(lastCreate().vars).toMatchObject({ body: "my reply", parent_id: "c1" });
  });

  it("does not put the old target over one picked while the request ran", () => {
    drawer();
    replyTo("A1");
    fireEvent.change(textbox(), { target: { value: "first" } });
    submit();
    replyTo("A2");

    act(() => lastCreate().cb.onError?.(apiErr("bcc_unavailable", 503)));

    expect(screen.getByText(/replying to/i)).toHaveTextContent("Replying to @a2");
  });

  it("does not bring a target back after the thread was withdrawn", () => {
    const view = drawer();
    replyTo("A1");
    fireEvent.change(textbox(), { target: { value: "into the dark" } });
    submit();

    state.comments = deniedRefetch([comment(1), comment(2)]);
    view.rerender(withClient(<CommentDrawer feedId="f1" isOpen />));

    act(() => lastCreate().cb.onError?.(apiErr("bcc_unavailable", 503)));

    // The viewer's own words come back; the denied thread's author doesn't.
    expect(textbox().value).toBe("into the dark");
    expect(screen.queryByText(/replying to/i)).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(/@a1/);
  });

  it("a successful reply leaves the chip cleared", () => {
    drawer();
    replyTo("A1");
    fireEvent.change(textbox(), { target: { value: "landed" } });
    submit();
    act(() => lastCreate().cb.onSuccess?.());
    expect(screen.queryByText(/replying to/i)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// M3: a collapsed draft stays reachable
// ─────────────────────────────────────────────────────────────────────

describe("M3: a collapsed draft can be reached by keyboard", () => {
  it("collapsed under its preview, the textarea is transparent, not hidden, and focus expands it", () => {
    drawer();
    fireEvent.focus(textbox());
    fireEvent.change(textbox(), { target: { value: "half a thought" } });
    fireEvent.click(screen.getByRole("button", { name: "Collapse composer" }));

    expect(screen.queryByRole("button", { name: "Collapse composer" })).toBeNull();
    expect(textbox()).not.toHaveClass("invisible");
    expect(textbox()).toHaveClass("opacity-0");
    // The preview repeats the textarea's own text, so it's hidden from AT
    // (the textarea is still in the tree with the same words).
    const preview = screen.getByText("half a thought", { selector: "span" }).parentElement as HTMLElement;
    expect(preview).toHaveAttribute("aria-hidden", "true");

    fireEvent.focus(textbox());
    expect(screen.getByRole("button", { name: "Collapse composer" })).toBeInTheDocument();
    expect(textbox()).not.toHaveClass("opacity-0");
  });

  it("a media-only draft's preview is read: it names what the textarea doesn't hold", async () => {
    state.upload = () => Promise.resolve({ attachment_id: 5, url: "https://cdn.example/p.png", width: 10, height: 10 });
    drawer();
    fireEvent.focus(textbox());
    const file = new File(["x"], "p.png", { type: "image/png" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    await screen.findByRole("button", { name: "Remove attachment" });
    fireEvent.click(screen.getByRole("button", { name: "Collapse composer" }));

    const preview = screen.getByText("Photo attached", { selector: "span" }).parentElement as HTMLElement;
    expect(preview).not.toHaveAttribute("aria-hidden");
  });
});

// ─────────────────────────────────────────────────────────────────────
// M4: failures are announced
// ─────────────────────────────────────────────────────────────────────

describe("M4: a failed comment or attachment is announced", () => {
  it("an assertive region is mounted empty with the composer, not as an alert", () => {
    drawer();
    const region = assertiveRegion();
    expect(region).not.toBeNull();
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region.textContent).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a failed post fills it with the mapped line, and a repeat is a fresh span", () => {
    drawer();
    fireEvent.change(textbox(), { target: { value: "too fast" } });
    submit();
    act(() => lastCreate().cb.onError?.(apiErr("bcc_rate_limited", 429)));

    const region = assertiveRegion();
    expect(region.textContent).toBe("Commenting too fast — slow down.");
    expect(region.textContent).not.toMatch(/RAW SERVER TEXT/);
    const first = region.firstElementChild;

    submit();
    act(() => lastCreate().cb.onError?.(apiErr("bcc_rate_limited", 429)));
    expect(assertiveRegion().textContent).toBe("Commenting too fast — slow down.");
    expect(assertiveRegion().firstElementChild).not.toBe(first);
  });

  it("a failed attachment is announced too", async () => {
    state.upload = () => Promise.reject(apiErr("bcc_invalid_request"));
    drawer();
    fireEvent.focus(textbox());
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["x"], "p.png", { type: "image/png" })] } });
    await waitFor(() =>
      expect(assertiveRegion().textContent).toBe("That image can't be attached (check size/format)."),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────
// M5: the comment's Stoke and Helpful
// ─────────────────────────────────────────────────────────────────────

const firstRow = () => screen.getByText("comment body 1").closest("article") as HTMLElement;
const politeRegion = (row: HTMLElement) =>
  (row.querySelector('[aria-live="polite"]') ?? row.parentElement?.querySelector('[aria-live="polite"]')) as HTMLElement;

describe("M5: signed out, the comment's Stoke and Helpful are sign-in links", () => {
  it("each pill links to sign in and back to this page, and sends nothing", () => {
    state.session = "unauthenticated";
    drawer();
    const row = firstRow();
    const stoke = within(row).getByRole("link", { name: "Sign in to stoke" });
    const helpful = within(row).getByRole("link", { name: "Sign in to mark this helpful" });
    expect(stoke).toHaveAttribute("href", "/login?callbackUrl=%2Fu%2Fanvil");
    expect(helpful).toHaveAttribute("href", "/login?callbackUrl=%2Fu%2Fanvil");
    expect(within(row).queryByRole("button", { name: /stoke|helpful/i })).toBeNull();
    expect(state.stokeCalls).toHaveLength(0);
    expect(state.helpfulCalls).toHaveLength(0);
  });

  it("while the session loads they stay as (disabled) pills, with no flash to a link", () => {
    state.session = "loading";
    drawer();
    const row = firstRow();
    expect(within(row).queryByRole("link", { name: /sign in/i })).toBeNull();
    expect(within(row).getByRole("button", { name: "Stoke" })).toBeDisabled();
  });

  it("the non-member teaser stays read-only for a signed-out visitor too", () => {
    state.session = "unauthenticated";
    drawer({ canInteract: false });
    const row = firstRow();
    expect(within(row).queryByRole("link", { name: /sign in/i })).toBeNull();
    expect(within(row).getByRole("button", { name: "Stoke" })).toBeDisabled();
  });
});

describe("M5: a failed comment toggle says so under the row", () => {
  it("the row's polite region is mounted empty, then a failed stoke fills it", () => {
    drawer();
    const row = firstRow();
    const region = politeRegion(row);
    expect(region).toHaveAttribute("aria-atomic", "true");
    expect(region).toHaveClass("sr-only");
    expect(region.textContent).toBe("");

    fireEvent.click(within(row).getByRole("button", { name: "Stoke" }));
    expect(state.stokeCalls[0]!.vars).toMatchObject({ commentId: "c1", hasStoked: false });
    act(() => state.stokeCalls[0]!.cb.onError?.(apiErr("bcc_internal_error", 500)));

    expect(politeRegion(firstRow()).textContent).toBe("Couldn't stoke this. Try again.");
    expect(politeRegion(firstRow())).not.toHaveClass("sr-only");
  });

  it("an unstoke failure says which way it failed", () => {
    state.comments = healthy([comment(1, { viewer_has_stoked: true, stoke_count: 1 })]);
    drawer();
    fireEvent.click(within(firstRow()).getByRole("button", { name: "Stoked — tap to remove" }));
    act(() => state.stokeCalls[0]!.cb.onError?.(apiErr("bcc_internal_error", 500)));
    expect(politeRegion(firstRow()).textContent).toBe("Couldn't remove your stoke. Try again.");
  });

  it("Helpful reports into the same row line, and the next press clears it", () => {
    drawer();
    const row = firstRow();
    fireEvent.click(within(row).getByRole("button", { name: "Mark this as helpful" }));
    act(() => state.helpfulCalls[0]!.cb.onError?.(apiErr("bcc_rate_limited", 429)));
    expect(politeRegion(firstRow()).textContent).toBe("Too many taps. Wait a moment, then try again.");

    fireEvent.click(within(firstRow()).getByRole("button", { name: "Stoke" }));
    expect(politeRegion(firstRow()).textContent).toBe("");
  });

  it("a repeat failure is a fresh span in the same region", () => {
    drawer();
    fireEvent.click(within(firstRow()).getByRole("button", { name: "Stoke" }));
    act(() => state.stokeCalls[0]!.cb.onError?.(apiErr("bcc_internal_error", 500)));
    const region = politeRegion(firstRow());
    const span = region.firstElementChild;
    act(() => state.stokeCalls[0]!.cb.onError?.(apiErr("bcc_internal_error", 500)));
    expect(politeRegion(firstRow())).toBe(region);
    expect(region.firstElementChild).not.toBe(span);
  });
});
