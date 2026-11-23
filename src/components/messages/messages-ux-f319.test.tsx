/**
 * F-319 (messages UX), the items #313 left:
 *  - M-me1: a long unbroken string ran out of the bubble.
 *  - M-me3: Enter always sent, so a phone couldn't type a newline, and the
 *    "Shift + Enter" hint showed on touch. Both pointer modes are pinned
 *    here, with a tablet that has a trackpad and one with only a keyboard.
 *  - M-me4: the thread's load was bare text, a signed-out visitor had no
 *    way on, and the heading stuck on "Loading…".
 *  - M-me5: /messages/new's TO and MESSAGE didn't name their fields.
 *  - M-me6: a ?to_user pin showed nothing while loading, failed silently,
 *    could replace a recipient picked meanwhile, and CHANGE kept the old
 *    recipient's send error.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type MessageItem } from "@/lib/api/types";

type StartOptions = { onError?: (err: unknown) => void; onSuccess?: (d: unknown) => void };

const state = vi.hoisted(() => ({
  session: "authenticated" as "authenticated" | "unauthenticated" | "loading",
  params: new URLSearchParams(),
  conversation: null as unknown,
  memberPin: { data: undefined, isPending: false, isError: false, error: null } as Record<string, unknown>,
  members: [] as unknown[],
  startOptions: null as StartOptions | null,
  start: vi.fn(),
  reply: vi.fn(),
  pointer: { coarse: false, fine: false },
  pointerListeners: [] as (() => void)[],
}));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => state.params,
  useParams: () => ({ id: "12" }),
  usePathname: () => (state.params.has("to_user") ? "/messages/new" : "/messages/12"),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: state.session,
    data: state.session === "authenticated" ? { user: { id: "1", handle: "me" } } : null,
  }),
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/layout/RouteRail", () => ({ RouteRail: () => null }));
vi.mock("@/hooks/useCardEntity", () => ({
  useCardEntity: (kind: string) =>
    kind === "member"
      ? state.memberPin
      : { data: undefined, isPending: false, isError: false, error: null },
}));
vi.mock("@/hooks/useMembers", () => ({
  useMembers: () => ({ isPending: false, isSuccess: true, isError: false, data: { items: state.members } }),
}));
vi.mock("@/hooks/useStartConversation", () => ({
  useStartConversationMutation: (opts: StartOptions) => {
    state.startOptions = opts;
    return { mutate: state.start, isPending: false };
  },
}));
vi.mock("@/hooks/useConversation", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useConversation: () => state.conversation,
}));
vi.mock("@/lib/api/messages-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  replyInConversation: (...a: unknown[]) => state.reply(...a),
}));

import NewMessagePage from "@/app/(main)/(app)/messages/new/page";
import ConversationPage from "@/app/(main)/(app)/messages/[id]/page";
import { MessageComposer } from "@/components/messages/MessageComposer";
import { ThreadView } from "@/components/messages/ThreadView";

/** matchMedia that answers the two pointer queries from state.pointer. */
function installPointer(coarse: boolean, fine: boolean) {
  state.pointer = { coarse, fine };
  state.pointerListeners = [];
  window.matchMedia = ((q: string) => ({
    matches:
      q === "(any-pointer: coarse)" ? state.pointer.coarse
        : q === "(any-pointer: fine)" ? state.pointer.fine
          : false,
    media: q, onchange: null,
    addEventListener: (_t: string, l: () => void) => state.pointerListeners.push(l),
    removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
  installPointer(false, true);
  state.session = "authenticated";
  state.params = new URLSearchParams();
  state.conversation = null;
  state.memberPin = { data: undefined, isPending: false, isError: false, error: null };
  state.members = [];
  state.startOptions = null;
  state.start.mockReset();
  state.reply.mockReset();
  state.reply.mockResolvedValue({ message_id: 1 });
});
afterEach(() => cleanup());

const wrap = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>{ui}</QueryClientProvider>);

// ─────────────────────────────────────────────────────────────────────
// M-me1
// ─────────────────────────────────────────────────────────────────────

describe("M-me1: a long unbroken string wraps inside the bubble", () => {
  it("the bubble wraps anywhere and its column can shrink", () => {
    const hash = "0x" + "a".repeat(120);
    const item: MessageItem = {
      id: 1,
      author: { id: 2, handle: "u2", display_name: "U2", avatar_url: null } as never,
      body: hash,
      posted_at: "2026-11-12T10:00:00Z",
      is_inline_notice: false,
      sender_blocked_by_viewer: false,
    };
    wrap(<ThreadView conversationId={5} items={[item]} viewerId={1} bottomAnchorRef={createRef()} />);
    const bubble = screen.getByText(hash);
    expect(bubble).toHaveClass("[overflow-wrap:anywhere]", "max-w-full");
    expect(bubble).not.toHaveClass("break-words");
    expect(bubble.parentElement).toHaveClass("min-w-0");
  });
});

// ─────────────────────────────────────────────────────────────────────
// M-me3
// ─────────────────────────────────────────────────────────────────────

const HINT = "ENTER TO SEND · SHIFT + ENTER FOR NEWLINE";

function composer() {
  wrap(<MessageComposer conversationId={5} />);
  const box = screen.getByRole("textbox", { name: "Message" });
  fireEvent.change(box, { target: { value: "hello" } });
  return box;
}

describe("M-me3: Enter on a fine pointer vs a touch-only device", () => {
  it("a mouse or trackpad (fine): Enter sends, Shift+Enter doesn't, and the hint shows", async () => {
    installPointer(false, true);
    const box = composer();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    // Shift+Enter is left to type the newline, and nothing goes out (the
    // send is async, so wait for it before saying so).
    let notPrevented = false;
    await act(async () => {
      notPrevented = fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    });
    expect(notPrevented).toBe(true);
    expect(state.reply).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(state.reply).toHaveBeenCalledTimes(1);
  });

  it("a tablet with a trackpad (coarse AND fine) keeps Enter to send", async () => {
    installPointer(true, true);
    const box = composer();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(state.reply).toHaveBeenCalledTimes(1);
  });

  it("touch only (a phone): Enter is left to type a newline, and the hint is gone", () => {
    installPointer(true, false);
    const box = composer();
    expect(screen.queryByText(HINT)).toBeNull();
    const notPrevented = fireEvent.keyDown(box, { key: "Enter" });
    expect(notPrevented).toBe(true);
    expect(state.reply).not.toHaveBeenCalled();
    // SEND still sends.
    expect(screen.getByRole("button", { name: "SEND" })).toBeEnabled();
  });

  it.each([
    ["Ctrl+Enter", { ctrlKey: true }],
    ["Cmd+Enter", { metaKey: true }],
  ])("touch only with a hardware keyboard: %s sends", async (_l, mods) => {
    installPointer(true, false);
    const box = composer();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter", ...mods });
    });
    expect(state.reply).toHaveBeenCalledTimes(1);
  });

  it("plugging in a trackpad switches Enter back to send, live", async () => {
    installPointer(true, false);
    const box = composer();
    expect(screen.queryByText(HINT)).toBeNull();
    act(() => {
      state.pointer.fine = true;
      for (const l of state.pointerListeners) l();
    });
    expect(screen.getByText(HINT)).toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(box, { key: "Enter" });
    });
    expect(state.reply).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// M-me4
// ─────────────────────────────────────────────────────────────────────

const pending = { isPending: true, isSuccess: false, isError: false, error: null, refetch: vi.fn() };

describe("M-me4: the thread page's loading and signed-out states", () => {
  it("loading is a busy skeleton with a screen-reader line, under a Loading… heading", () => {
    state.conversation = pending;
    wrap(<ConversationPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Loading…");
    const line = screen.getByText("Loading conversation…");
    expect(line).toHaveClass("sr-only");
    expect(line.parentElement).toHaveAttribute("aria-busy", "true");
    expect(line.parentElement!.querySelectorAll("[aria-hidden]").length).toBeGreaterThanOrEqual(3);
  });

  it("signed out: a link to sign in and come back to this thread, and no stuck heading", () => {
    state.session = "unauthenticated";
    state.conversation = pending;
    wrap(<ConversationPage />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/login?callbackUrl=%2Fmessages%2F12");
    expect(link.parentElement).toHaveTextContent("Sign in to view this conversation.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Conversation");
    expect(screen.queryByText("Loading conversation…")).toBeNull();
  });

  it("while the session loads the heading says Loading…", () => {
    state.session = "loading";
    state.conversation = pending;
    wrap(<ConversationPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Loading…");
  });

  it("after a failed read the heading stops saying Loading…", () => {
    state.conversation = {
      isPending: false, isSuccess: false, isError: true,
      error: new BccApiError("bcc_unavailable", "x", 503, null), refetch: vi.fn(),
    };
    wrap(<ConversationPage />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Conversation");
  });
});

// ─────────────────────────────────────────────────────────────────────
// M-me5 / M-me6
// ─────────────────────────────────────────────────────────────────────

const member = (id: number, handle: string) => ({
  id, handle, name: handle.toUpperCase(), card_kind: "member",
  crest: { image_url: null, image_fallback_url: null },
  permissions: {},
});

describe("M-me5: /messages/new names its fields", () => {
  it("TO names the recipient section and its search box; MESSAGE names the textarea", () => {
    wrap(<NewMessagePage />);
    const to = screen.getByRole("group", { name: "TO" });
    expect(within(to).getByRole("searchbox", { name: "TO search members" })).toBeInTheDocument();
    expect(screen.getByLabelText("MESSAGE").tagName).toBe("TEXTAREA");
  });

  it("with a recipient picked (no search box), TO still names the section with the chip", () => {
    state.params = new URLSearchParams("to_user=42");
    state.memberPin = { data: member(42, "pinned"), isPending: false, isError: false, error: null };
    wrap(<NewMessagePage />);
    expect(screen.queryByRole("searchbox")).toBeNull();
    const to = screen.getByRole("group", { name: "TO" });
    expect(within(to).getByText("@pinned")).toBeInTheDocument();
    expect(within(to).getByRole("button", { name: "CHANGE" })).toBeInTheDocument();
  });

  it("while a pinned member loads, TO names the section with the loading line", () => {
    state.params = new URLSearchParams("to_user=42");
    state.memberPin = { data: undefined, isPending: true, isError: false, error: null };
    wrap(<NewMessagePage />);
    expect(within(screen.getByRole("group", { name: "TO" })).getByText("Loading member…")).toBeInTheDocument();
  });
});

describe("M-me6: the ?to_user pin", () => {
  it("while it loads it says so, and the picker stays shut", () => {
    state.params = new URLSearchParams("to_user=42");
    state.memberPin = { data: undefined, isPending: true, isError: false, error: null };
    wrap(<NewMessagePage />);
    expect(screen.getByText("Loading member…")).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("a failure other than a private profile says so, and opens the picker", () => {
    state.params = new URLSearchParams("to_user=42");
    state.memberPin = {
      data: undefined, isPending: false, isError: true,
      error: new BccApiError("bcc_unavailable", "RAW", 503, null),
    };
    wrap(<NewMessagePage />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load that member. Pick a recipient instead.");
    expect(screen.getByRole("searchbox")).toBeInTheDocument();
  });

  it("a private profile keeps its quiet status line, with no alert", () => {
    state.params = new URLSearchParams("to_user=42");
    state.memberPin = {
      data: undefined, isPending: false, isError: true,
      error: new BccApiError("bcc_forbidden", "x", 403, {
        error: { code: "bcc_forbidden", message: "x", data: { reason: "profile_private" } },
      } as never),
    };
    wrap(<NewMessagePage />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Private profile. Pick a recipient instead.");
  });

  it("a manual pick wins over a pin that resolves later", async () => {
    vi.useFakeTimers();
    try {
      state.params = new URLSearchParams("to_user=42");
      state.memberPin = {
        data: undefined, isPending: false, isError: true,
        error: new BccApiError("bcc_unavailable", "RAW", 503, null),
      };
      state.members = [member(7, "picked")];
      const view = wrap(<NewMessagePage />);
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pi" } });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      fireEvent.click(screen.getByRole("button", { name: /picked/i }));
      expect(screen.getByText("@picked")).toBeInTheDocument();

      // The pin's query recovers (a refetch): the pick stays.
      state.memberPin = { data: member(42, "pinned"), isPending: false, isError: false, error: null };
      view.rerender(<QueryClientProvider client={new QueryClient()}><NewMessagePage /></QueryClientProvider>);
      expect(screen.getByText("@picked")).toBeInTheDocument();
      expect(screen.queryByText("@pinned")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("CHANGE clears the last send error with the recipient it was about", () => {
    state.params = new URLSearchParams("to_user=42");
    state.memberPin = { data: member(42, "pinned"), isPending: false, isError: false, error: null };
    wrap(<NewMessagePage />);
    act(() => state.startOptions?.onError?.(new BccApiError("bcc_messaging_unavailable", "RAW", 403, null)));
    expect(screen.getByRole("alert")).toHaveTextContent("Messaging isn't available for this recipient.");
    fireEvent.click(screen.getByRole("button", { name: "CHANGE" }));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("signed out: a link to sign in and come back", () => {
    state.session = "unauthenticated";
    state.params = new URLSearchParams("to_user=42");
    wrap(<NewMessagePage />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toHaveAttribute("href", "/login?callbackUrl=%2Fmessages%2Fnew");
    expect(link.parentElement).toHaveTextContent("Sign in to start a conversation.");
  });
});
