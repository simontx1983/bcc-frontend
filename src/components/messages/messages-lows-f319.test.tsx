/**
 * F-319, the messages Lows (public-cb's 2026-11-12 scan):
 *  - L-me1: SEND, CHANGE, ← INBOX, the MESSAGES/QUEUED tabs and
 *    "+ NEW MESSAGE" were under 44px.
 *  - L-me2: a queued send's confirmation didn't say where the message now
 *    waits. (The list re-read is in use-start-conversation-queued.test.)
 *  - L-me3: the whole thread was the live region, so a member's own send
 *    was read back to them, and an empty thread had no region, so the
 *    first message wasn't announced.
 * Plus RA2's two #372 nits on /messages/new's TO.
 *
 * jsdom does no layout, so the 44px items are pinned at the class level:
 * `min-h-[44px]` on a box, HIT_AREA_44 (its `before:h-11`) on a small link.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { MessageItem } from "@/lib/api/types";

type StartOptions = { onSuccess?: (d: unknown) => void; onError?: (e: unknown) => void };

const state = vi.hoisted(() => ({
  params: new URLSearchParams(),
  memberPin: { data: undefined, isPending: false, isError: false, error: null } as Record<string, unknown>,
  startOptions: null as StartOptions | null,
  conversation: null as unknown,
}));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => state.params,
  useParams: () => ({ id: "12" }),
  usePathname: () => "/messages/new",
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: "1", handle: "me" } } }),
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/layout/RouteRail", () => ({ RouteRail: () => null }));
vi.mock("@/hooks/useCardEntity", () => ({
  useCardEntity: (kind: string) =>
    kind === "member" ? state.memberPin : { data: undefined, isPending: false, isError: false, error: null },
}));
vi.mock("@/hooks/useMembers", () => ({
  useMembers: () => ({ isPending: false, isSuccess: true, isError: false, data: { items: [] } }),
}));
vi.mock("@/hooks/useStartConversation", () => ({
  useStartConversationMutation: (opts: StartOptions) => {
    state.startOptions = opts;
    return { mutate: vi.fn(), isPending: false };
  },
}));
vi.mock("@/hooks/useConversation", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useConversation: () => state.conversation,
}));
vi.mock("@/hooks/useConversations", () => ({
  useConversations: () => ({ isPending: false, isError: false, isSuccess: true, data: { items: [], pagination: { total_pages: 1 } } }),
  CONVERSATIONS_QUERY_KEY_ROOT: ["conversations"],
}));
vi.mock("@/hooks/useQueuedMessages", () => ({
  useQueuedMessages: () => ({ isPending: false, isError: false, isSuccess: true, data: { items: [], pagination: { total_pages: 1 } } }),
  QUEUED_MESSAGES_QUERY_KEY_ROOT: ["queued-messages"],
}));
vi.mock("@/components/messages/ConversationList", () => ({ ConversationList: () => null }));
vi.mock("@/components/messages/QueuedMessagesList", () => ({ QueuedMessagesList: () => null }));

import InboxPage from "@/app/(main)/(app)/messages/page";
import NewMessagePage from "@/app/(main)/(app)/messages/new/page";
import ConversationPage from "@/app/(main)/(app)/messages/[id]/page";
import { MessageComposer } from "@/components/messages/MessageComposer";
import { ThreadView } from "@/components/messages/ThreadView";

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  state.params = new URLSearchParams();
  state.memberPin = { data: undefined, isPending: false, isError: false, error: null };
  state.startOptions = null;
  state.conversation = null;
});
afterEach(() => cleanup());

const wrap = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

/** HIT_AREA_44's invisible 44×44 ::before. */
const HIT_44 = "before:h-11";

const member = (id: number, handle: string) => ({
  id, handle, name: handle.toUpperCase(), card_kind: "member",
  crest: { image_url: null, image_fallback_url: null }, permissions: {},
});

// ─────────────────────────────────────────────────────────────────────
// L-me1
// ─────────────────────────────────────────────────────────────────────

describe("L-me1: the small messages controls have a 44px target", () => {
  it("the thread composer's SEND is 44px tall", () => {
    wrap(<MessageComposer conversationId={5} />);
    expect(screen.getByRole("button", { name: "SEND" })).toHaveClass("min-h-[44px]");
  });

  it("/messages/new: SEND → is 44px tall; ← INBOX and CHANGE keep their look with a 44px area", () => {
    state.params = new URLSearchParams("to_user=42");
    state.memberPin = { data: member(42, "pinned"), isPending: false, isError: false, error: null };
    wrap(<NewMessagePage />);
    expect(screen.getByRole("button", { name: "SEND →" })).toHaveClass("min-h-[44px]");
    expect(screen.getByRole("link", { name: "← INBOX" })).toHaveClass(HIT_44);
    expect(screen.getByRole("button", { name: "CHANGE" })).toHaveClass(HIT_44);
  });

  it("the thread page's ← INBOX has a 44px area", () => {
    state.conversation = { isPending: true, isSuccess: false, isError: false, error: null, refetch: vi.fn() };
    wrap(<ConversationPage />);
    expect(screen.getByRole("link", { name: "← INBOX" })).toHaveClass(HIT_44);
  });

  it("the inbox's MESSAGES / QUEUED tabs and + NEW MESSAGE are 44px tall", () => {
    wrap(<InboxPage />);
    const views = screen.getByRole("navigation", { name: "Message views" });
    for (const tab of Array.from(views.querySelectorAll("a"))) expect(tab).toHaveClass("min-h-[44px]");
    expect(views.querySelectorAll("a")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "+ NEW MESSAGE" })[0]).toHaveClass("min-h-[44px]");
  });

  it("the empty inbox's own + NEW MESSAGE is 44px tall too", () => {
    wrap(<InboxPage />);
    const links = screen.getAllByRole("link", { name: "+ NEW MESSAGE" });
    expect(links).toHaveLength(2);
    for (const l of links) expect(l).toHaveClass("min-h-[44px]");
  });
});

// ─────────────────────────────────────────────────────────────────────
// L-me2 (the confirmation)
// ─────────────────────────────────────────────────────────────────────

describe("L-me2: a queued send says where the message waits", () => {
  it("the status region is mounted empty, then says it's queued with a link to the Queued tab", () => {
    wrap(<NewMessagePage />);
    // A polite region with no role: an always-mounted role="status" would
    // add a match to every getByRole("status") on the page.
    const region = document.querySelector('form [aria-live="polite"][aria-atomic="true"]') as HTMLElement;
    expect(region).not.toBeNull();
    expect(region.textContent).toBe("");

    act(() => state.startOptions?.onSuccess?.({ queued: true, message_id: 9 }));
    expect(region).toHaveTextContent(/Message queued\./);
    expect(screen.getByRole("link", { name: "See it in Queued" })).toHaveAttribute("href", "/messages?tab=queued");
  });
});

// ─────────────────────────────────────────────────────────────────────
// RA2's #372 nits
// ─────────────────────────────────────────────────────────────────────

describe("/messages/new's TO (RA2's #372 nits)", () => {
  it("the search box reads 'TO search members', and the group is still TO", () => {
    wrap(<NewMessagePage />);
    expect(screen.getByRole("group", { name: "TO" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "TO search members" })).toBeInTheDocument();
  });

  it("clicking the visible TO focuses the search box, as a label would", () => {
    wrap(<NewMessagePage />);
    fireEvent.click(screen.getByText("TO", { selector: "span" }));
    expect(document.activeElement).toBe(screen.getByRole("searchbox"));
  });
});

// ─────────────────────────────────────────────────────────────────────
// L-me3
// ─────────────────────────────────────────────────────────────────────

const VIEWER = 1;
function msg(id: number, authorId: number, extra: Partial<MessageItem> = {}): MessageItem {
  return {
    id,
    author: { id: authorId, handle: `u${authorId}`, display_name: `U${authorId}`, avatar_url: null } as never,
    body: `m${id}`,
    posted_at: "2026-11-12T10:00:00Z",
    is_inline_notice: false,
    sender_blocked_by_viewer: false,
    ...extra,
  };
}

function thread(items: MessageItem[]) {
  const qc = new QueryClient();
  const ui = (list: MessageItem[]) => (
    <QueryClientProvider client={qc}>
      <ThreadView conversationId={5} items={list} viewerId={VIEWER} bottomAnchorRef={createRef()} />
    </QueryClientProvider>
  );
  const r = render(ui(items));
  return { rerender: (list: MessageItem[]) => r.rerender(ui(list)) };
}

const region = () => document.querySelector('[aria-live="polite"][aria-atomic="true"]') as HTMLElement;

describe("L-me3: only new messages from others are announced", () => {
  it("the thread itself is no longer a live region; one sr-only region is, mounted empty", () => {
    thread([msg(1, 2), msg(2, VIEWER)]);
    expect(screen.getByText("m1").closest("[aria-live]")).toBeNull();
    expect(region()).toHaveClass("sr-only");
    expect(region().textContent).toBe("");
  });

  it("a new message from someone else is announced once, with who it's from", () => {
    const t = thread([msg(1, 2)]);
    t.rerender([msg(1, 2), msg(2, 2)]);
    expect(region().textContent).toBe("New message from U2: m2");
  });

  it("the member's own send is not read back to them", () => {
    const t = thread([msg(1, 2)]);
    t.rerender([msg(1, 2), msg(2, VIEWER)]);
    expect(region().textContent).toBe("");
  });

  it("an empty thread has the region, so its first message is announced", () => {
    const t = thread([]);
    expect(region()).not.toBeNull();
    expect(region().textContent).toBe("");
    t.rerender([msg(1, 2)]);
    expect(region().textContent).toBe("New message from U2: m1");
  });

  it("several at once are counted, naming the latest; blocked senders and notices are skipped", () => {
    const t = thread([msg(1, 2)]);
    t.rerender([
      msg(1, 2),
      msg(2, 3, { sender_blocked_by_viewer: true }),
      msg(3, 2, { is_inline_notice: true, body: "U4 joined" }),
      msg(4, 2),
      msg(5, 5),
    ]);
    expect(region().textContent).toBe("2 new messages. New message from U5: m5");
  });

  it("a repeat arrival is a fresh span in the same region", () => {
    const t = thread([msg(1, 2)]);
    t.rerender([msg(1, 2), msg(2, 2)]);
    const r = region();
    const span = r.firstElementChild;
    t.rerender([msg(1, 2), msg(2, 2), msg(3, 2)]);
    expect(region()).toBe(r);
    expect(r.textContent).toBe("New message from U2: m3");
    expect(r.firstElementChild).not.toBe(span);
  });

  it("a refetch of the same messages announces nothing", () => {
    const t = thread([msg(1, 2), msg(2, 2)]);
    t.rerender([msg(1, 2), msg(2, 2)]);
    expect(region().textContent).toBe("");
  });
});
