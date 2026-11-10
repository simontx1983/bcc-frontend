/**
 * Over-limit status post → blog draft handoff.
 *
 * Both status composers (inline Floor + modal StatusForm) offer the move
 * once a post passes STATUS_POST_MAX_LENGTH; BlogComposer consumes the
 * one-shot handoff record once. Fixtures only — mocked session, router
 * and API.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  data: null as { user?: { id?: string; handle?: string } } | null,
  status: "loading" as "loading" | "authenticated" | "unauthenticated",
}));

const push = vi.hoisted(() => vi.fn());
const uploadBlogCoverImage = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: sessionState.data, status: sessionState.status }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

vi.mock("@/lib/api/blog-endpoints", () => ({
  uploadBlogCoverImage,
}));

vi.mock("@/lib/api/posts-endpoints", () => ({
  createBlog: vi.fn(async () => ({ id: 1 })),
  updateBlog: vi.fn(async () => ({ id: 1 })),
  createReview: vi.fn(async () => ({ id: 1 })),
}));

vi.mock("@/hooks/useBlogChainOptions", () => ({
  useBlogChainOptions: () => ({ data: [], isLoading: false, error: null }),
}));

vi.mock("@/hooks/useGiphyIntegration", () => ({
  useGiphyIntegration: () => ({ data: { enabled: true }, isLoading: false, error: null }),
}));

// The real picker searches Giphy; the test only needs a selection.
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

import { BlogComposer } from "@/components/blog/BlogComposer";
import { Composer } from "@/components/composer/Composer";
import { STATUS_POST_MAX_LENGTH } from "@/lib/api/types";
import { VIEWER_SCOPED_STORAGE_KEYS } from "@/lib/auth/viewer-storage";
import { __resetSessionIdentityForTests } from "@/lib/auth/session-identity";
import { LONG_FORM_HANDOFF_KEY_BASE } from "@/lib/blog/long-form-handoff";

const VIEWER = "4242";
const DRAFT_KEY = `bcc.blog.draft::${VIEWER}`;
const HANDOFF_KEY = `bcc.blog.handoff::${VIEWER}`;
const BLOG_CREATE_URL = "/u/alice?tab=blog&blogsub=create";
const COVER = {
  attachment_id: 77,
  url: "https://cms.bluecollarcrypto.io/wp-content/uploads/cover.png",
  width: 1600,
  height: 900,
};

const OFFER_NAME = /turn it into a blog post/i;
const over = "x".repeat(STATUS_POST_MAX_LENGTH + 1);
const atCap = "x".repeat(STATUS_POST_MAX_LENGTH);

let qc: QueryClient;

function wrap(node: ReactNode) {
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

function signedIn(): void {
  sessionState.data = { user: { id: VIEWER, handle: "alice" } };
  sessionState.status = "authenticated";
}

function renderInline(props: { groupId?: number } = {}) {
  return render(
    wrap(<Composer variant="inline" startExpanded viewerHandle="alice" {...props} />),
  );
}

const inlineTextarea = () =>
  document.getElementById("composer-status-content") as HTMLTextAreaElement;
const modalTextarea = () =>
  document.getElementById("composer-modal-status-content") as HTMLTextAreaElement;

function attachPhoto(file: File): void {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function readHandoff(): unknown {
  const raw = window.localStorage.getItem(HANDOFF_KEY);
  return raw === null ? null : JSON.parse(raw);
}

beforeAll(() => {
  // jsdom has no matchMedia (Dialog / reduced-motion probes) and no
  // object URLs (the photo preview tile).
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
  __resetSessionIdentityForTests();
  sessionState.data = null;
  sessionState.status = "loading";
  push.mockReset();
  uploadBlogCoverImage.mockReset();
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  __resetSessionIdentityForTests();
});

describe("the offer appears only past the limit", () => {
  it("inline composer: absent at the cap, present one past it", () => {
    signedIn();
    renderInline();
    fireEvent.change(inlineTextarea(), { target: { value: atCap } });
    expect(screen.queryByRole("button", { name: OFFER_NAME })).toBeNull();
    fireEvent.change(inlineTextarea(), { target: { value: over } });
    expect(screen.getByRole("button", { name: OFFER_NAME })).toBeEnabled();
    expect(screen.getByText("Too long for a post.")).toBeInTheDocument();
  });

  it("modal status form: absent at the cap, present one past it", () => {
    signedIn();
    render(wrap(<Composer variant="modal" onClose={vi.fn()} />));
    fireEvent.change(modalTextarea(), { target: { value: atCap } });
    expect(screen.queryByRole("button", { name: OFFER_NAME })).toBeNull();
    fireEvent.change(modalTextarea(), { target: { value: over } });
    expect(screen.getByRole("button", { name: OFFER_NAME })).toBeEnabled();
  });

  it("is never offered in a group-scoped composer", () => {
    signedIn();
    renderInline({ groupId: 12 });
    fireEvent.change(inlineTextarea(), { target: { value: over } });
    expect(screen.queryByRole("button", { name: OFFER_NAME })).toBeNull();
  });
});

describe("moving the post", () => {
  it("writes the draft (replacing one), uploads the photo, records the cover, clears and navigates", async () => {
    signedIn();
    window.localStorage.setItem(DRAFT_KEY, "an older blog draft");
    const cover = new File(["png"], "shot.png", { type: "image/png" });
    uploadBlogCoverImage.mockResolvedValue(COVER);
    // Storage must be written BEFORE navigation, or BlogComposer's
    // restore could run ahead of it.
    push.mockImplementation(() => {
      expect(window.localStorage.getItem(DRAFT_KEY)).toBe(over);
      expect(window.localStorage.getItem(HANDOFF_KEY)).not.toBeNull();
    });

    renderInline();
    fireEvent.change(inlineTextarea(), { target: { value: over } });
    attachPhoto(cover);
    expect(screen.getByLabelText("Remove photo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: OFFER_NAME }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(BLOG_CREATE_URL));
    expect(push).toHaveBeenCalledTimes(1);
    expect(uploadBlogCoverImage).toHaveBeenCalledTimes(1);
    expect(uploadBlogCoverImage).toHaveBeenCalledWith(cover);
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe(over);
    expect(readHandoff()).toEqual({ cover: COVER, notice: "none" });
    // The short-post draft is cleared: text, photo and alt text.
    expect(inlineTextarea()).toHaveValue("");
    expect(screen.queryByLabelText("Remove photo")).toBeNull();
  });

  it("is busy while uploading and cannot be double-clicked", async () => {
    signedIn();
    let resolveUpload: (v: typeof COVER) => void = () => {};
    uploadBlogCoverImage.mockImplementation(
      () => new Promise<typeof COVER>((r) => (resolveUpload = r)),
    );
    renderInline();
    fireEvent.change(inlineTextarea(), { target: { value: over } });
    attachPhoto(new File(["png"], "shot.png", { type: "image/png" }));

    const offer = screen.getByRole("button", { name: OFFER_NAME });
    fireEvent.click(offer);
    fireEvent.click(offer);
    const busy = await screen.findByRole("button", { name: /moving to a blog post/i });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(uploadBlogCoverImage).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveUpload(COVER);
    });
    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
  });

  it("still moves the text when the photo upload fails, and records the no-cover notice", async () => {
    signedIn();
    uploadBlogCoverImage.mockRejectedValue(new Error("bcc_invalid_request"));
    renderInline();
    fireEvent.change(inlineTextarea(), { target: { value: over } });
    attachPhoto(new File(["png"], "tiny.png", { type: "image/png" }));

    fireEvent.click(screen.getByRole("button", { name: OFFER_NAME }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(BLOG_CREATE_URL));
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe(over);
    expect(readHandoff()).toEqual({ cover: null, notice: "photo_failed" });
  });

  it("records the GIF notice and uploads nothing when a GIF is attached", async () => {
    signedIn();
    renderInline();
    fireEvent.change(inlineTextarea(), { target: { value: over } });
    fireEvent.click(screen.getByRole("button", { name: "Attach a GIF" }));
    fireEvent.click(screen.getByRole("button", { name: "pick test gif" }));
    expect(screen.getByLabelText("Remove GIF")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: OFFER_NAME }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(BLOG_CREATE_URL));
    expect(uploadBlogCoverImage).not.toHaveBeenCalled();
    expect(readHandoff()).toEqual({ cover: null, notice: "gif_dropped" });
    expect(screen.queryByLabelText("Remove GIF")).toBeNull();
  });

  it("writes mention tokens as plain text", async () => {
    // A token not picked in this composer (pasted) has no handle on
    // record, so it falls back to its display name.
    signedIn();
    renderInline();
    const text = `hi @peepso_user_42(Alice) ${over}`;
    fireEvent.change(inlineTextarea(), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: OFFER_NAME }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe(`hi @Alice ${over}`);
  });

  it("modal status form moves the text and closes", async () => {
    signedIn();
    const onClose = vi.fn();
    render(wrap(<Composer variant="modal" onClose={onClose} />));
    fireEvent.change(modalTextarea(), { target: { value: over } });

    fireEvent.click(screen.getByRole("button", { name: OFFER_NAME }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(BLOG_CREATE_URL));
    expect(window.localStorage.getItem(DRAFT_KEY)).toBe(over);
    expect(readHandoff()).toEqual({ cover: null, notice: "none" });
    expect(onClose).toHaveBeenCalled();
  });
});

describe("BlogComposer consumes the handoff once", () => {
  it("applies the cover, shows the notice, deletes the record; a second mount does not re-apply", () => {
    signedIn();
    window.localStorage.setItem(DRAFT_KEY, over);
    window.localStorage.setItem(HANDOFF_KEY, JSON.stringify({ cover: COVER, notice: "none" }));

    const first = render(wrap(<BlogComposer />));
    expect(screen.getByRole("status")).toHaveTextContent("Your post text moved here.");
    expect(screen.getByAltText("Cover image preview")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/write/i)).toHaveValue(over);
    expect(window.localStorage.getItem(HANDOFF_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
    expect(screen.queryByRole("status")).toBeNull();
    first.unmount();

    render(wrap(<BlogComposer />));
    expect(screen.queryByText(/moved here/)).toBeNull();
    expect(screen.queryByAltText("Cover image preview")).toBeNull();
  });

  it("explains a photo that couldn't become the cover", () => {
    signedIn();
    window.localStorage.setItem(HANDOFF_KEY, JSON.stringify({ cover: null, notice: "photo_failed" }));
    render(wrap(<BlogComposer />));
    expect(screen.getByRole("status")).toHaveTextContent(/photo couldn't be used as a cover/i);
    expect(screen.queryByAltText("Cover image preview")).toBeNull();
  });

  it("explains a GIF that couldn't move", () => {
    signedIn();
    window.localStorage.setItem(HANDOFF_KEY, JSON.stringify({ cover: null, notice: "gif_dropped" }));
    render(wrap(<BlogComposer />));
    expect(screen.getByRole("status")).toHaveTextContent(/GIF can't be used as a cover/i);
  });

  it("leaves the record alone in edit mode", () => {
    signedIn();
    window.localStorage.setItem(HANDOFF_KEY, JSON.stringify({ cover: COVER, notice: "none" }));
    render(wrap(<BlogComposer editingPostId={9} initialValues={{ title: "Existing" }} />));
    expect(screen.queryByRole("status")).toBeNull();
    expect(window.localStorage.getItem(HANDOFF_KEY)).not.toBeNull();
  });
});

describe("sign-out clears the handoff", () => {
  it("the handoff family is a viewer-scoped storage key", () => {
    expect(LONG_FORM_HANDOFF_KEY_BASE).toBe("bcc.blog.handoff");
    expect(VIEWER_SCOPED_STORAGE_KEYS).toContain(LONG_FORM_HANDOFF_KEY_BASE);
  });
});
