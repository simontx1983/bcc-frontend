/**
 * One comment in flight at a time (F-258 follow-up).
 *
 * The composer's failure handling (restore the draft, the media and the
 * reply target, and announce the error) rides on per-call `mutate()`
 * callbacks. TanStack v5 runs those only for the LATEST call, so a second
 * submit while the first was still in flight would orphan the first one's
 * failure handling. That can't happen because the composer refuses a
 * second submit while one is pending (`canSubmit` requires
 * `!createMut.isPending`). This pins that guard with the real mutation
 * hook, so removing it fails here rather than silently.
 *
 * The box itself stays free to type in while a comment is in flight. When
 * that comment fails, it comes back only into an EMPTY box: what the
 * member typed meanwhile is never overwritten, and neither is it turned
 * into a reply by the failed comment's reply target (main agent's call).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type Comment } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 7 } } }),
  getSession: async () => ({ user: { id: 7 } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/" }));

const api = vi.hoisted(() => ({ listComments: vi.fn(), createComment: vi.fn() }));
vi.mock("@/lib/api/comment-endpoints", () => ({
  listComments: (...a: unknown[]) => api.listComments(...a),
  createComment: (...a: unknown[]) => api.createComment(...a),
  deleteComment: vi.fn(),
  setCommentStoke: vi.fn(),
  removeCommentStoke: vi.fn(),
}));
vi.mock("@/components/identity/AuthorBadge", () => ({ AuthorBadge: () => null }));
vi.mock("@/components/feed/HelpfulButton", () => ({ CommentHelpfulButton: () => null }));
vi.mock("@/hooks/useCommentStoke", () => ({
  useCommentStoke: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useGiphyIntegration", () => ({ useGiphyIntegration: () => ({ data: undefined }) }));
vi.mock("@/lib/analytics/posthog", () => ({ captureAnalyticsEvent: vi.fn() }));

const { CommentDrawer } = await import("@/components/feed/CommentDrawer");

const COMMENT = {
  id: "comment_1",
  comment_id: "comment_1",
  feed_id: "feed_1",
  author: { id: 9, handle: "anvil", display_name: "Anvil", avatar_url: "" },
  body: "measured words",
  mentions: [],
  posted_at: "2026-11-10T00:00:00Z",
  permissions: {},
} as unknown as Comment;

beforeAll(() => {
  (Element.prototype as unknown as Record<string, unknown>)["scrollIntoView"] = () => {};
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  api.listComments.mockResolvedValue({ items: [COMMENT], next_cursor: null });
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});

describe("the comment composer allows one submit in flight", () => {
  it("a second comment can't be sent until the first settles, so the first keeps its failure handling", async () => {
    let rejectFirst: (err: unknown) => void = () => {};
    api.createComment.mockImplementationOnce(
      () => new Promise((_resolve, reject) => { rejectFirst = reject; }),
    );
    render(
      <QueryClientProvider client={client}>
        <CommentDrawer feedId="feed_1" isOpen />
      </QueryClientProvider>,
    );
    await screen.findByText("measured words");
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    const form = box.closest("form") as HTMLFormElement;

    fireEvent.change(box, { target: { value: "first" } });
    fireEvent.submit(form);
    await waitFor(() => expect(api.createComment).toHaveBeenCalledTimes(1));

    // The viewer starts a second comment while the first is in flight.
    fireEvent.change(box, { target: { value: "second" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Post comment" })).toBeDisabled());
    fireEvent.submit(form);
    expect(api.createComment).toHaveBeenCalledTimes(1);

    // The first fails: its own failure handling runs (it is still the
    // latest call), so the error is announced.
    await act(async () => {
      rejectFirst(new BccApiError("bcc_rate_limited", "RAW", 429, null));
    });
    const region = document.querySelector('form [aria-live="assertive"]') as HTMLElement;
    await waitFor(() => expect(region.textContent).toBe("Commenting too fast — slow down."));
    // What the member typed meanwhile survives: the failed text is not put
    // back over it.
    expect(box.value).toBe("second");
  });
});

describe("a failed comment comes back only into an empty box", () => {
  async function openDrawer() {
    render(
      <QueryClientProvider client={client}>
        <CommentDrawer feedId="feed_1" isOpen />
      </QueryClientProvider>,
    );
    await screen.findByText("measured words");
    const box = screen.getByRole("textbox") as HTMLTextAreaElement;
    return { box, form: box.closest("form") as HTMLFormElement };
  }

  function failNextCreate(): () => void {
    let reject: (err: unknown) => void = () => {};
    api.createComment.mockImplementationOnce(
      () => new Promise((_resolve, r) => { reject = r; }),
    );
    return () => reject(new BccApiError("bcc_unavailable", "RAW", 503, null));
  }

  it("with the box still empty, the failed text is restored", async () => {
    const fail = failNextCreate();
    const { box, form } = await openDrawer();
    fireEvent.change(box, { target: { value: "lost words" } });
    fireEvent.submit(form);
    await waitFor(() => expect(api.createComment).toHaveBeenCalledTimes(1));
    expect(box.value).toBe("");

    await act(async () => fail());
    await waitFor(() => expect(box.value).toBe("lost words"));
  });

  it("a failed reply doesn't put its target over a new top-level draft", async () => {
    const fail = failNextCreate();
    const { box, form } = await openDrawer();
    fireEvent.click(screen.getByRole("button", { name: "Reply to Anvil" }));
    fireEvent.change(box, { target: { value: "a reply" } });
    fireEvent.submit(form);
    await waitFor(() => expect(api.createComment).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/replying to/i)).toBeNull();

    fireEvent.change(box, { target: { value: "a new top-level comment" } });
    await act(async () => fail());

    const region = document.querySelector('form [aria-live="assertive"]') as HTMLElement;
    await waitFor(() => expect(region.textContent).toBe("Couldn't post the comment."));
    expect(box.value).toBe("a new top-level comment");
    expect(screen.queryByText(/replying to/i)).toBeNull();
  });
});
