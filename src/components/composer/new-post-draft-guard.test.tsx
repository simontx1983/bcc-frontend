/**
 * H3 — the New Post dialog never throws a draft away without asking, and
 * Esc on the @mention list closes only the list.
 *
 * Before: the Dialog's Esc and backdrop paths closed it directly, which
 * unmounted the composer and lost the typed text and any photo or GIF.
 * Esc to dismiss the mention list ALSO closed the whole dialog, because
 * the popover only called preventDefault and `closeMentionPicker` was a
 * no-op.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

const { NewPostTrigger } = await import("@/components/composer/NewPostTrigger");

let qc: QueryClient;

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

function openComposer() {
  render(
    <QueryClientProvider client={qc}>
      <NewPostTrigger ariaLabel="New post">+ New Post</NewPostTrigger>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "New post" }));
  const dialog = screen.getByRole("dialog", { name: "Compose a post" });
  const textarea = dialog.querySelector("textarea") as HTMLTextAreaElement;
  return { dialog, textarea };
}

function type(textarea: HTMLTextAreaElement, value: string) {
  fireEvent.change(textarea, { target: { value } });
  textarea.setSelectionRange(value.length, value.length);
  fireEvent.select(textarea);
  fireEvent.keyUp(textarea, { key: value.at(-1) ?? "" });
}

const composeDialog = () => screen.queryByRole("dialog", { name: "Compose a post" });
const discardDialog = () => screen.queryByRole("dialog", { name: "Discard this post?" });

describe("New Post dialog — draft guard", () => {
  it("Esc with an empty composer closes straight away", () => {
    const { textarea } = openComposer();
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(composeDialog()).toBeNull();
    expect(discardDialog()).toBeNull();
  });

  it("Esc with a draft asks first; KEEP EDITING keeps the text", () => {
    const { textarea } = openComposer();
    type(textarea, "half a thought");
    fireEvent.keyDown(textarea, { key: "Escape" });

    const confirm = discardDialog();
    expect(confirm).not.toBeNull();
    expect(composeDialog()).not.toBeNull();

    fireEvent.click(within(confirm as HTMLElement).getByRole("button", { name: "KEEP EDITING" }));
    expect(discardDialog()).toBeNull();
    expect((document.querySelector("textarea") as HTMLTextAreaElement).value).toBe("half a thought");
  });

  it("a backdrop tap with a draft asks first; DISCARD closes", () => {
    const { dialog, textarea } = openComposer();
    type(textarea, "half a thought");
    fireEvent.click(dialog); // the backdrop

    const confirm = discardDialog();
    expect(confirm).not.toBeNull();
    fireEvent.click(within(confirm as HTMLElement).getByRole("button", { name: "DISCARD" }));
    expect(composeDialog()).toBeNull();
    expect(discardDialog()).toBeNull();
  });

  it("the composer's own Discard draft (X) still closes directly", () => {
    const { dialog, textarea } = openComposer();
    type(textarea, "half a thought");
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard draft" }));
    expect(composeDialog()).toBeNull();
    expect(discardDialog()).toBeNull();
  });
});

describe("New Post dialog — Esc on the mention list", () => {
  it("closes only the list: the dialog and the text stay", () => {
    const { textarea } = openComposer();
    type(textarea, "hey @al");
    expect(screen.getByRole("listbox", { name: "Mention suggestions" })).toBeInTheDocument();

    fireEvent.keyDown(textarea, { key: "Escape" });

    expect(screen.queryByRole("listbox", { name: "Mention suggestions" })).toBeNull();
    expect(composeDialog()).not.toBeNull();
    expect(discardDialog()).toBeNull();
    expect(textarea.value).toBe("hey @al");
  });
});
