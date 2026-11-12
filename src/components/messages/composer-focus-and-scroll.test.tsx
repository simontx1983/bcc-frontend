/**
 * UX scan 2026-11-12, messages H11 + H12.
 *
 * H11 — sending disabled the focused textarea: the phone keyboard closed
 *       after every message and focus fell to <body>. It now stays
 *       focusable (read-only while sending) and is focused again after a
 *       successful send.
 * H12 — auto-scroll targeted a marker ABOVE the composer and fired on
 *       every new message: the composer slid below the fold, and a reader
 *       scrolled up into history was yanked back down. It now scrolls the
 *       composer (the bottom anchor) into view, and only on first load,
 *       for the viewer's own message, or when already near the bottom.
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
import type { MessageItem } from "@/lib/api/types";

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

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("H11 — the composer keeps focus and the keyboard", () => {
  it("stays focusable while sending and is focused again after the send", async () => {
    let finish: (v: unknown) => void = () => undefined;
    replyInConversation.mockReturnValue(new Promise((r) => { finish = r; }));
    wrap(<MessageComposer conversationId={5} />);
    const box = screen.getByRole("textbox", { name: "Message" }) as HTMLTextAreaElement;
    box.focus();
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter" });

    await screen.findByRole("button", { name: "SENDING…" });
    expect(box).not.toBeDisabled();
    expect(box.readOnly).toBe(true);
    expect(document.activeElement).toBe(box);

    await act(async () => {
      finish({ message: { id: 1 } });
    });
    expect(box.value).toBe("");
    expect(box.readOnly).toBe(false);
    expect(document.activeElement).toBe(box);
  });

  it("no double send while one is in flight", async () => {
    replyInConversation.mockReturnValue(new Promise(() => undefined));
    wrap(<MessageComposer conversationId={5} />);
    const box = screen.getByRole("textbox", { name: "Message" });
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter" });
    fireEvent.keyDown(box, { key: "Enter" });
    await screen.findByRole("button", { name: "SENDING…" });
    expect(replyInConversation).toHaveBeenCalledTimes(1);
  });
});

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
  window.dispatchEvent(new Event("scroll"));
}

describe("H12 — scrolling keeps the composer in view and never yanks a reader", () => {
  const VIEWER = 1;
  const PEER = 2;

  function renderThread(items: MessageItem[]) {
    const anchor = createRef<HTMLDivElement>();
    const ui = (list: MessageItem[]) => (
      <>
        <ThreadView conversationId={5} items={list} viewerId={VIEWER} bottomAnchorRef={anchor} />
        <div ref={anchor} data-testid="composer-anchor" />
      </>
    );
    const r = wrap(ui(items));
    return {
      anchor,
      rerender: (list: MessageItem[]) =>
        r.rerender(<QueryClientProvider client={new QueryClient()}>{ui(list)}</QueryClientProvider>),
    };
  }

  it("first load scrolls the composer anchor into view, instantly", () => {
    const { anchor } = renderThread([msg(1, PEER)]);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0]?.[0]).toBe(anchor.current);
    expect(scrollIntoView.mock.calls[0]?.[1]).toMatchObject({ behavior: "auto", block: "end" });
  });

  it("a polled message does NOT move a reader who scrolled up", () => {
    const { rerender } = renderThread([msg(1, PEER)]);
    scrollIntoView.mockReset();
    setScroll(false);
    rerender([msg(1, PEER), msg(2, PEER)]);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("a polled message follows a reader who is at the bottom", () => {
    const { rerender, anchor } = renderThread([msg(1, PEER)]);
    scrollIntoView.mockReset();
    setScroll(true);
    rerender([msg(1, PEER), msg(2, PEER)]);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.calls[0]?.[0]).toBe(anchor.current);
  });

  it("the viewer's own message always scrolls, even from history", () => {
    const { rerender } = renderThread([msg(1, PEER)]);
    scrollIntoView.mockReset();
    setScroll(false);
    rerender([msg(1, PEER), msg(2, VIEWER)]);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
