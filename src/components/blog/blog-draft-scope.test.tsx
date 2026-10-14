/**
 * The blog draft autosave belongs to ONE viewer.
 *
 * The key used to be `bcc.blog.draft.${handle ?? "anon"}`, which failed in
 * two ways. The fallback was shared: anyone writing before their session
 * resolved wrote to `…draft.anon`, and the next person's composer restored
 * it — one person's unpublished post body appearing in another's editor.
 * And a handle is renameable and reclaimable, so even the non-fallback form
 * does not durably name its owner.
 *
 * It is now `bcc.blog.draft::<viewer id>`, with no write at all while the
 * viewer is unknown. Fixtures only — a mocked session and a mocked API.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sessionState = vi.hoisted(() => ({
  data: null as { user?: { id?: string; handle?: string } } | null,
  status: "loading" as "loading" | "authenticated" | "unauthenticated",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: sessionState.data, status: sessionState.status }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

vi.mock("@/lib/api/posts-endpoints", () => ({
  createBlog: vi.fn(async () => ({ id: 1 })),
  updateBlog: vi.fn(async () => ({ id: 1 })),
}));

vi.mock("@/hooks/useBlogChainOptions", () => ({
  useBlogChainOptions: () => ({ data: [], isLoading: false, error: null }),
}));

import { BlogComposer } from "@/components/blog/BlogComposer";
import {
  __resetSessionIdentityForTests,
  noteEstablishedViewer,
} from "@/lib/auth/session-identity";

const DRAFT = (scope: string) => `bcc.blog.draft::${scope}`;

function signedIn(id: string): void {
  sessionState.data = { user: { id, handle: `u${id}` } };
  sessionState.status = "authenticated";
}

let qc: QueryClient;

function tree() {
  return (
    <QueryClientProvider client={qc}>
      <BlogComposer />
    </QueryClientProvider>
  );
}

const bodyField = () =>
  screen.getByPlaceholderText(/write/i) as HTMLTextAreaElement;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  __resetSessionIdentityForTests();
  sessionState.data = null;
  sessionState.status = "loading";
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  __resetSessionIdentityForTests();
});

describe("the draft autosave is keyed to the viewer", () => {
  it("writes under the signed-in viewer's scope", () => {
    vi.useFakeTimers();
    signedIn("4242");
    render(tree());
    fireEvent.change(bodyField(), { target: { value: "half a post" } });
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(window.localStorage.getItem(DRAFT("4242"))).toBe("half a post");
  });

  it("writes NOTHING while the viewer is unknown", () => {
    // The old code wrote `bcc.blog.draft.anon` here, which the next
    // viewer's composer then restored.
    vi.useFakeTimers();
    render(tree());
    fireEvent.change(bodyField(), { target: { value: "half a post" } });
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(
      Object.keys(window.localStorage).filter((k) => k.startsWith("bcc.blog.draft")),
    ).toEqual([]);
  });

  it("restores the viewer's own draft, not another viewer's", () => {
    window.localStorage.setItem(DRAFT("4242"), "mine, half written");
    window.localStorage.setItem(DRAFT("9001"), "someone else's");
    signedIn("4242");
    render(tree());
    expect(bodyField()).toHaveValue("mine, half written");
  });

  it("never restores a LEGACY handle-keyed or anon draft", () => {
    window.localStorage.setItem("bcc.blog.draft.u4242", "legacy, by handle");
    window.localStorage.setItem("bcc.blog.draft.anon", "legacy, unattributable");
    signedIn("4242");
    render(tree());
    expect(bodyField()).toHaveValue("");
  });

  it("restores once the session resolves, not only at mount", () => {
    // At mount the scope is unknown and there is no key to read. A
    // mount-only restore silently dropped the writer's saved body on every
    // slow session.
    window.localStorage.setItem(DRAFT("4242"), "mine, half written");
    const view = render(tree());
    expect(bodyField()).toHaveValue("");
    signedIn("4242");
    view.rerender(tree());
    expect(bodyField()).toHaveValue("mine, half written");
  });

  it("stops the 5s autosave TIMER when identity goes unavailable mid-write", () => {
    // The delayed-timer case. A session blip makes the scope unavailable
    // while an interval is already running; the body must not be flushed
    // to the shared anonymous key, and must not be flushed to the viewer's
    // key either, since nothing can currently say they are still here.
    vi.useFakeTimers();
    signedIn("4242");
    const view = render(tree());
    fireEvent.change(bodyField(), { target: { value: "first pass" } });
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(window.localStorage.getItem(DRAFT("4242"))).toBe("first pass");

    // The blip: a viewer HAS been established, and the session now reads
    // null with nothing proved.
    noteEstablishedViewer("4242");
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree());
    fireEvent.change(bodyField(), { target: { value: "first pass, then more" } });
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    const keys = Object.keys(window.localStorage).filter((k) =>
      k.startsWith("bcc.blog.draft"),
    );
    expect(keys).toEqual([DRAFT("4242")]);
    // The earlier value is untouched — not overwritten, not deleted.
    expect(window.localStorage.getItem(DRAFT("4242"))).toBe("first pass");
    // And the text is still on screen: nothing was destroyed, it simply
    // was not filed anywhere while the viewer could not be named.
    expect(bodyField()).toHaveValue("first pass, then more");
  });

  it("resumes autosaving into the viewer's own key once identity returns", () => {
    vi.useFakeTimers();
    signedIn("4242");
    const view = render(tree());
    noteEstablishedViewer("4242");
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree());
    fireEvent.change(bodyField(), { target: { value: "written during the blip" } });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(window.localStorage.getItem(DRAFT("4242"))).toBeNull();

    signedIn("4242");
    view.rerender(tree());
    act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(window.localStorage.getItem(DRAFT("4242"))).toBe("written during the blip");
  });

  it("does not overwrite what the writer has already typed", () => {
    // The restore can now land after the person started writing, so it must
    // yield to live input rather than replacing it.
    window.localStorage.setItem(DRAFT("4242"), "the saved copy");
    const view = render(tree());
    fireEvent.change(bodyField(), { target: { value: "what I am typing now" } });
    signedIn("4242");
    view.rerender(tree());
    expect(bodyField()).toHaveValue("what I am typing now");
  });
});
