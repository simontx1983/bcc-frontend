/**
 * F-246 (contract v1.NEXT, bcc-trust #644): the server now says, BEFORE
 * the user writes, whether a reply or a new message would be accepted —
 * `conversation.can_reply` on a thread and the live `permissions.
 * can_message` on member cards. And a failed DM read (F-300) is a 503,
 * shown as a retryable failure, never as an empty thread.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  members: [] as unknown[],
  conversation: null as unknown,
  refetch: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "5" }),
  usePathname: () => "/messages/new",
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: "1", handle: "me" } } }),
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/layout/RouteRail", () => ({ RouteRail: () => null }));
vi.mock("@/hooks/useCardEntity", () => ({
  useCardEntity: () => ({ data: undefined, isPending: false, isError: false, error: null }),
}));
vi.mock("@/hooks/useMembers", () => ({
  useMembers: () => ({ isPending: false, isSuccess: true, isError: false, data: { items: state.members } }),
}));
vi.mock("@/hooks/useStartConversation", () => ({
  useStartConversationMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useConversation", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useConversation: () => state.conversation,
}));

import NewMessagePage from "@/app/(main)/(app)/messages/new/page";
import ConversationPage from "@/app/(main)/(app)/messages/[id]/page";
import { MessageComposer } from "@/components/messages/MessageComposer";
import { BccApiError } from "@/lib/api/types";
import { resolveDmGate } from "@/lib/validators/messaging";

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  state.members = [];
  state.conversation = null;
  state.refetch.mockReset();
});
afterEach(() => cleanup());

const wrap = (ui: ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("resolveDmGate", () => {
  it.each([
    ["absent (older backend)", undefined, "allowed"],
    ["allowed", { allowed: true, unlock_hint: null, reason_code: null }, "allowed"],
    ["not_applicable (pre-F-246 member card)", { allowed: false, unlock_hint: null, reason_code: "not_applicable" }, "allowed"],
    ["self_action_blocked", { allowed: false, unlock_hint: null, reason_code: "self_action_blocked" }, "self"],
    ["sender_chat_disabled", { allowed: false, unlock_hint: "Turn on DMs.", reason_code: "sender_chat_disabled" }, "hint"],
    ["messaging_unavailable", { allowed: false, unlock_hint: null, reason_code: "messaging_unavailable" }, "shielded"],
    ["sender_restricted", { allowed: false, unlock_hint: null, reason_code: "sender_restricted" }, "shielded"],
    ["unavailable", { allowed: false, unlock_hint: null, reason_code: "unavailable" }, "shielded"],
    ["an unknown future code", { allowed: false, unlock_hint: "x", reason_code: "brand_new" }, "shielded"],
  ])("%s → %s", (_l, entry, kind) => {
    expect(resolveDmGate(entry as never).kind).toBe(kind);
  });
});

describe("thread composer — can_reply", () => {
  it("absent: the composer is there", () => {
    wrap(<MessageComposer conversationId={5} />);
    expect(screen.getByRole("textbox", { name: "Message" })).toBeInTheDocument();
  });

  it("own DMs off: the server's hint and a link to message settings, no composer", () => {
    wrap(
      <MessageComposer
        conversationId={5}
        canReply={{ allowed: false, unlock_hint: "Turn on direct messages in your settings to send messages.", reason_code: "sender_chat_disabled" }}
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Turn on direct messages in your settings");
    expect(screen.getByRole("link", { name: "Open message settings" })).toHaveAttribute("href", "/u/me?tab=messages");
  });

  it("shielded: one neutral line, nothing that says why", () => {
    wrap(
      <MessageComposer
        conversationId={5}
        canReply={{ allowed: false, unlock_hint: null, reason_code: "messaging_unavailable" }}
      />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("You can't reply in this conversation.");
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("thread page — F-300 503", () => {
  it("a failed read is a retryable failure, not an empty thread", () => {
    state.conversation = {
      isPending: false,
      isSuccess: false,
      isError: true,
      error: new BccApiError("bcc_unavailable", "x", 503, null),
      refetch: state.refetch,
    };
    wrap(<ConversationPage />);
    expect(screen.getByText("Messages are temporarily unavailable. Try again shortly.")).toBeInTheDocument();
    expect(screen.queryByText(/No messages yet/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it("a participant denial offers no retry", () => {
    state.conversation = {
      isPending: false,
      isSuccess: false,
      isError: true,
      error: new BccApiError("bcc_forbidden", "x", 403, null),
      refetch: state.refetch,
    };
    wrap(<ConversationPage />);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });
});

function member(id: number, handle: string, can_message?: unknown) {
  return {
    id,
    handle,
    name: handle,
    card_kind: "member",
    crest: { image_url: null, image_fallback_url: null },
    permissions: can_message === undefined ? {} : { can_message },
  };
}

describe("/messages/new picker — member can_message", () => {
  async function search() {
    wrap(<NewMessagePage />);
    await act(async () => {
      fireEvent.change(screen.getByRole("searchbox"), { target: { value: "al" } });
    });
  }

  it("your own card is not offered; an unavailable person is a disabled row with the reason", async () => {
    state.members = [
      member(1, "me", { allowed: false, unlock_hint: null, reason_code: "self_action_blocked" }),
      member(2, "blocked", { allowed: false, unlock_hint: null, reason_code: "messaging_unavailable" }),
      member(3, "open", { allowed: true, unlock_hint: null, reason_code: null }),
    ];
    await search();
    expect(screen.queryByRole("button", { name: /@me/ })).toBeNull();

    const blocked = screen.getByRole("button", { name: /@blocked/ });
    expect(blocked).toHaveAttribute("aria-disabled", "true");
    expect(blocked).toHaveAccessibleDescription("You can't message this person.");
    fireEvent.click(blocked);
    // Not picked: the picker is still showing.
    expect(screen.getByRole("searchbox")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /@open/ }));
    expect(screen.queryByRole("searchbox")).toBeNull();
  });
});
