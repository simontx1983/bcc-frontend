/**
 * F-249 (H3 follow-up) — the Review / modal composer never throws a draft
 * away without asking, and Esc on the "Discard this post?" prompt goes
 * back to the composer.
 *
 * Before: the modal composer's Dialog closed on Esc, a backdrop tap or the
 * corner X straight away, losing a written review. The New Post dialog got
 * the guard in #260; this applies the same one here.
 *
 * Esc on the prompt: the parent Dialog and the ConfirmDialog both listen
 * for Escape on window. Dialog answers only when it is the TOPMOST open
 * dialog, so one Esc must close the prompt and nothing else — pinned here
 * for both hosts, since listener order is exactly what could regress.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "4242", handle: "alice" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/hooks/useGiphyIntegration", () => ({
  useGiphyIntegration: () => ({ data: { enabled: false }, isLoading: false, error: null }),
}));
vi.mock("@/hooks/useMentionSearch", () => ({
  useMentionSearch: () => ({ data: [], isLoading: false, isError: false }),
}));

const { Composer } = await import("@/components/composer/Composer");
const { NewPostTrigger } = await import("@/components/composer/NewPostTrigger");

let qc: QueryClient;
const wrap = (node: ReactNode) => <QueryClientProvider client={qc}>{node}</QueryClientProvider>;

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
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
  cleanup();
  qc.clear();
});

const REVIEW_TITLE = "Write a review of Fixture Validator";
const prompt = () => screen.queryByRole("dialog", { name: "Discard this post?" });
const esc = (el: Element = document.body) => fireEvent.keyDown(el, { key: "Escape" });

function openReview() {
  const onClose = vi.fn();
  render(
    wrap(
      <Composer
        variant="modal"
        defaultMode="review"
        reviewTargetId={35}
        reviewTargetName="Fixture Validator"
        onClose={onClose}
      />,
    ),
  );
  const dialog = screen.getByRole("dialog", { name: REVIEW_TITLE });
  const textarea = dialog.querySelector("textarea") as HTMLTextAreaElement;
  return { onClose, dialog, textarea };
}

describe("Review composer — draft guard", () => {
  it("Esc with nothing written closes straight away", () => {
    const { onClose, textarea } = openReview();
    esc(textarea);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(prompt()).toBeNull();
  });

  it("a chosen grade alone counts as a draft", () => {
    const { onClose, dialog, textarea } = openReview();
    fireEvent.click(within(dialog).getByRole("button", { name: /TRUST/ }));
    esc(textarea);
    expect(prompt()).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Esc with a review written asks; DISCARD closes", () => {
    const { onClose, textarea } = openReview();
    fireEvent.change(textarea, { target: { value: "Solid uptime all quarter." } });
    esc(textarea);

    const confirm = prompt();
    expect(confirm).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(confirm as HTMLElement).getByRole("button", { name: "DISCARD" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the corner close (X) asks too", () => {
    const { onClose, dialog, textarea } = openReview();
    fireEvent.change(textarea, { target: { value: "Solid uptime all quarter." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(prompt()).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Esc on the prompt returns to the composer: prompt closes, composer and text stay", () => {
    const { onClose, textarea } = openReview();
    fireEvent.change(textarea, { target: { value: "Solid uptime all quarter." } });
    esc(textarea);
    expect(prompt()).not.toBeNull();

    esc();

    expect(prompt()).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: REVIEW_TITLE })).toBeInTheDocument();
    expect(textarea.value).toBe("Solid uptime all quarter.");
  });
});

describe("New Post — Esc on the discard prompt", () => {
  it("returns to the composer: prompt closes, composer and text stay", () => {
    render(wrap(<NewPostTrigger ariaLabel="New post">+ New Post</NewPostTrigger>));
    fireEvent.click(screen.getByRole("button", { name: "New post" }));
    const dialog = screen.getByRole("dialog", { name: "Compose a post" });
    const textarea = dialog.querySelector("textarea") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "half a thought" } });
    textarea.setSelectionRange(14, 14);
    fireEvent.select(textarea);

    esc(textarea);
    expect(prompt()).not.toBeNull();

    esc();

    expect(prompt()).toBeNull();
    expect(screen.getByRole("dialog", { name: "Compose a post" })).toBeInTheDocument();
    expect(textarea.value).toBe("half a thought");
  });
});
