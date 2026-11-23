/**
 * F-319 (UX scan 2026-11-12, messages):
 *   - A reader scrolled up into history is not yanked down by a polled
 *     message (H12); now they are TOLD: a "New messages ↓" pill jumps to
 *     the latest and the reply box, and clears once they are back at the
 *     bottom. It sits outside the thread's live region (the message itself
 *     is already announced there).
 *   - Double send: `isPending` flips only on the next render, so two
 *     submits before React commits both went out. A synchronous ref now
 *     blocks the second; it is released when the send settles.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
const replyInConversation = vi.fn();
vi.mock("@/lib/api/messages-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  replyInConversation: (...a: unknown[]) => replyInConversation(...a),
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));

import { MessageComposer } from "@/components/messages/MessageComposer";
import { ThreadView } from "@/components/messages/ThreadView";
import { BccApiError, type MessageItem } from "@/lib/api/types";

const scrollIntoView = vi.fn();
beforeAll(() => {
  Element.prototype.scrollIntoView = function (this: Element, opts?: ScrollIntoViewOptions | boolean) {
    scrollIntoView(this, opts);
  };
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addListener: () => undefined, removeListener: () => undefined,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
});
beforeEach(() => {
  scrollIntoView.mockReset();
  replyInConversation.mockReset();
});
afterEach(() => cleanup());

const client = () => new QueryClient({ defaultOptions: { mutations: { retry: false } } });

const VIEWER = 1;
const PEER = 2;

function msg(id: number, authorId: number): MessageItem {
  return {
    id,
    author: { id: authorId, handle: `u${authorId}`, display_name: `U${authorId}`, avatar_url: null } as never,
    body: `m${id}`,
    posted_at: "2026-11-12T10:00:00Z",
    is_inline_notice: false,
    sender_blocked_by_viewer: false,
  };
}

function setScroll(nearBottom: boolean) {
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 3000 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: nearBottom ? 2200 : 200 });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

function renderThread(items: MessageItem[]) {
  const anchor = createRef<HTMLDivElement>();
  const qc = client();
  const ui = (list: MessageItem[]) => (
    <QueryClientProvider client={qc}>
      <ThreadView conversationId={5} items={list} viewerId={VIEWER} bottomAnchorRef={anchor} />
      <div ref={anchor}>
        <textarea aria-label="Reply" />
      </div>
    </QueryClientProvider>
  );
  const r = render(ui(items));
  return { anchor, rerender: (list: MessageItem[]) => r.rerender(ui(list)) };
}

const pill = () => screen.queryByRole("button", { name: "New messages" });

describe("F-319 — the New messages pill", () => {
  it("a reader up in history gets the pill, and is not moved", () => {
    const { rerender } = renderThread([msg(1, PEER)]);
    scrollIntoView.mockReset();
    setScroll(false);
    rerender([msg(1, PEER), msg(2, PEER)]);
    expect(pill()).toBeInTheDocument();
    // F-514: in the shared bottom slot, stacked with the consent banner.
    expect((pill() as HTMLElement).closest("#bcc-bottom-slot")).not.toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("the pill jumps to the latest and the reply box, then goes away", () => {
    const { rerender, anchor } = renderThread([msg(1, PEER)]);
    scrollIntoView.mockReset();
    setScroll(false);
    rerender([msg(1, PEER), msg(2, PEER)]);
    fireEvent.click(pill() as HTMLElement);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0]?.[0]).toBe(anchor.current);
    expect(pill()).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Reply" }));
  });

  it("scrolling back to the bottom clears it", () => {
    const { rerender } = renderThread([msg(1, PEER)]);
    setScroll(false);
    rerender([msg(1, PEER), msg(2, PEER)]);
    expect(pill()).toBeInTheDocument();
    setScroll(true);
    expect(pill()).toBeNull();
  });

  it("a reader already at the bottom follows along; no pill", () => {
    const { rerender } = renderThread([msg(1, PEER)]);
    setScroll(true);
    rerender([msg(1, PEER), msg(2, PEER)]);
    expect(pill()).toBeNull();
  });

  it("the viewer's own message scrolls; no pill", () => {
    const { rerender } = renderThread([msg(1, PEER)]);
    setScroll(false);
    rerender([msg(1, PEER), msg(2, VIEWER)]);
    expect(pill()).toBeNull();
  });

  it("the newest message being removed is not 'new messages'", () => {
    const { rerender } = renderThread([msg(1, PEER), msg(2, PEER)]);
    setScroll(false);
    rerender([msg(1, PEER)]);
    expect(pill()).toBeNull();
  });

  it("sits outside the thread's live region (no double announcement)", () => {
    const { rerender } = renderThread([msg(1, PEER)]);
    setScroll(false);
    rerender([msg(1, PEER), msg(2, PEER)]);
    expect((pill() as HTMLElement).closest("[aria-live]")).toBeNull();
  });
});

describe("F-319 — no double send", () => {
  it("two submits before React re-renders send once", () => {
    replyInConversation.mockReturnValue(new Promise(() => undefined));
    render(
      <QueryClientProvider client={client()}>
        <MessageComposer conversationId={5} />
      </QueryClientProvider>,
    );
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "hello" } });
    // One act: React cannot commit isPending between the two events.
    act(() => {
      fireEvent.keyDown(box, { key: "Enter" });
      fireEvent.click(screen.getByRole("button", { name: "SEND" }));
    });
    return vi.waitFor(() => expect(replyInConversation).toHaveBeenCalledTimes(1));
  });

  it("a failed send releases the guard, so the member can try again", async () => {
    replyInConversation
      .mockRejectedValueOnce(new BccApiError("bcc_internal_error", "x", 500, null))
      .mockReturnValueOnce(new Promise(() => undefined));
    render(
      <QueryClientProvider client={client()}>
        <MessageComposer conversationId={5} />
      </QueryClientProvider>,
    );
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await screen.findByRole("alert");
    fireEvent.keyDown(box, { key: "Enter" });
    await vi.waitFor(() => expect(replyInConversation).toHaveBeenCalledTimes(2));
  });
});
