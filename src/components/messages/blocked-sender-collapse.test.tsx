/**
 * bcc-trust #122 — hide-on-read for senders the viewer has blocked.
 *
 * ## What this pins
 *
 * Thread (`ThreadView`):
 *   - a flagged message collapses to sender + time + the exact copy,
 *     behind a Show toggle that reveals and a Hide toggle that re-collapses
 *   - consecutive flagged messages fold into ONE row with a count; a
 *     normal message between them splits the run in two
 *   - unflagged messages and inline notices are never collapsed
 *   - the predicate is ONLY `sender_blocked_by_viewer` — an author who is
 *     blocked somewhere else but arrives unflagged renders normally
 *
 * Reveal source (`useRevealBlockedMessages`):
 *   - a real body in the payload is shown with no request
 *   - the placeholder body triggers the typed reveal client
 *   - a reveal failure keeps the row collapsed, shows code-keyed copy,
 *     and Retry re-requests
 *
 * Inbox (`ConversationList`): a flagged `last_message` renders the
 * server's preview verbatim.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/components/identity/Avatar", () => ({
  Avatar: ({ handle }: { handle: string }) => <span data-testid="avatar">{handle}</span>,
}));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => false,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

const getRevealedMessage = vi.fn();
vi.mock("@/lib/api/messages-endpoints", () => ({
  getRevealedMessage: (...a: unknown[]) => getRevealedMessage(...a),
}));

import { ConversationList } from "@/components/messages/ConversationList";
import { ThreadView } from "@/components/messages/ThreadView";
import { MAX_CONCURRENT_REVEALS } from "@/hooks/useRevealBlockedMessages";
import {
  BccApiError,
  BLOCKED_SENDER_PLACEHOLDER,
  type ConversationSummary,
  type MessageItem,
  type MessageUserMini,
} from "@/lib/api/types";

const CONVERSATION_ID = 77;
const VIEWER = 1;

const user = (id: number, name: string): MessageUserMini => ({
  id,
  handle: name.toLowerCase(),
  display_name: name,
  avatar_url: "",
});
const VIEWER_USER = user(VIEWER, "Viewer");
const MALLORY = user(5, "Mallory");
const TRUDY = user(6, "Trudy");
const ALICE = user(7, "Alice");

let nextId = 100;
const msg = (over: Partial<MessageItem> = {}): MessageItem => ({
  id: nextId++,
  author: ALICE,
  body: "ordinary message",
  posted_at: "2026-11-10T12:00:00Z",
  is_inline_notice: false,
  sender_blocked_by_viewer: false,
  ...over,
});
const blocked = (body: string, author: MessageUserMini = MALLORY, over: Partial<MessageItem> = {}) =>
  msg({ author, body, sender_blocked_by_viewer: true, ...over });

function renderThread(items: MessageItem[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ThreadView conversationId={CONVERSATION_ID} items={items} viewerId={VIEWER} />
    </QueryClientProvider>,
  );
}

const showButtons = () => screen.queryAllByRole("button", { name: /^Show/ });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  getRevealedMessage.mockReset();
});
afterEach(() => cleanup());

describe("thread — a single flagged message", () => {
  it("collapses to sender, time and the exact copy, hiding the body", () => {
    renderThread([blocked("secret text", MALLORY, { posted_at: "2026-11-10T09:05:00Z" })]);

    expect(screen.getByText("Message from someone you have blocked")).toBeInTheDocument();
    expect(BLOCKED_SENDER_PLACEHOLDER).toBe("Message from someone you have blocked");
    expect(screen.getByText("Mallory")).toBeInTheDocument();
    expect(screen.getByTestId("avatar")).toHaveTextContent("mallory");
    const time = document.querySelector("time");
    expect(time).not.toBeNull();
    expect(time?.getAttribute("dateTime")).toBe("2026-11-10T09:05:00Z");
    expect(time?.textContent).not.toBe("");
    expect(screen.queryByText("secret text")).toBeNull();
  });

  it("Show reveals the body; Hide collapses it again", () => {
    renderThread([blocked("secret text")]);

    const show = screen.getByRole("button", { name: "Show message" });
    expect(show).toHaveAttribute("aria-expanded", "false");
    const regionId = show.getAttribute("aria-controls");
    expect(regionId).not.toBeNull();
    expect(document.getElementById(regionId ?? "")).not.toBeNull();

    fireEvent.click(show);
    expect(screen.getByText("secret text")).toBeInTheDocument();
    const hide = screen.getByRole("button", { name: "Hide message" });
    expect(hide).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(hide.getAttribute("aria-controls") ?? "")).toContainElement(
      screen.getByText("secret text"),
    );

    fireEvent.click(hide);
    expect(screen.queryByText("secret text")).toBeNull();
    expect(screen.getByRole("button", { name: "Show message" })).toHaveAttribute("aria-expanded", "false");
  });

  it("an unflagged message renders normally", () => {
    renderThread([msg({ body: "plain hello" })]);
    expect(screen.getByText("plain hello")).toBeInTheDocument();
    expect(showButtons()).toHaveLength(0);
    expect(screen.queryByText(BLOCKED_SENDER_PLACEHOLDER)).toBeNull();
  });

  it("an inline notice is never collapsed, even when flagged", () => {
    renderThread([
      blocked("Mallory joined the conversation", MALLORY, { is_inline_notice: true }),
    ]);
    expect(screen.getByText("Mallory joined the conversation")).toBeInTheDocument();
    expect(showButtons()).toHaveLength(0);
  });
});

describe("thread — runs", () => {
  it("consecutive flagged messages render ONE grouped row; Show reveals all", () => {
    renderThread([blocked("one"), blocked("two"), blocked("three")]);

    expect(showButtons()).toHaveLength(1);
    expect(screen.getByText("3 messages from someone you have blocked")).toBeInTheDocument();
    expect(screen.queryByText("one")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show 3 messages" }));
    for (const body of ["one", "two", "three"]) {
      expect(screen.getByText(body)).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Hide 3 messages" }));
    expect(screen.queryByText("one")).toBeNull();
    expect(screen.queryByText("three")).toBeNull();
  });

  it("a run across several blocked senders says 'people' and names the first plus a count", () => {
    renderThread([blocked("a", MALLORY), blocked("b", TRUDY), blocked("c", MALLORY)]);
    expect(screen.getByText("3 messages from people you have blocked")).toBeInTheDocument();
    expect(screen.getByText("Mallory + 1 other")).toBeInTheDocument();
  });

  it("a run broken by a normal message forms two groups", () => {
    renderThread([
      blocked("first-a"),
      blocked("first-b"),
      msg({ body: "in between" }),
      blocked("second-a"),
    ]);

    expect(showButtons()).toHaveLength(2);
    expect(screen.getByText("2 messages from someone you have blocked")).toBeInTheDocument();
    expect(screen.getByText("Message from someone you have blocked")).toBeInTheDocument();
    expect(screen.getByText("in between")).toBeInTheDocument();

    // Revealing one group leaves the other collapsed.
    fireEvent.click(screen.getByRole("button", { name: "Show message" }));
    expect(screen.getByText("second-a")).toBeInTheDocument();
    expect(screen.queryByText("first-a")).toBeNull();
  });
});

describe("thread — the predicate is only sender_blocked_by_viewer", () => {
  it("an author who is blocked elsewhere but arrives unflagged renders normally", () => {
    // Mallory is the sender of a flagged message in the same thread — i.e.
    // known-blocked — yet this unflagged message of hers must not collapse.
    renderThread([
      blocked("flagged one", MALLORY),
      msg({ author: VIEWER_USER, body: "my reply" }),
      msg({ author: MALLORY, body: "unflagged from mallory" }),
    ]);
    expect(screen.getByText("unflagged from mallory")).toBeInTheDocument();
    expect(screen.getByText("my reply")).toBeInTheDocument();
    expect(showButtons()).toHaveLength(1);
  });

  it("a body that merely equals the placeholder copy does not collapse when unflagged", () => {
    renderThread([msg({ body: BLOCKED_SENDER_PLACEHOLDER })]);
    expect(showButtons()).toHaveLength(0);
    expect(getRevealedMessage).not.toHaveBeenCalled();
  });
});

describe("reveal source", () => {
  it("a real body in the payload is shown with no network call", () => {
    renderThread([blocked("already here")]);
    fireEvent.click(screen.getByRole("button", { name: "Show message" }));
    expect(screen.getByText("already here")).toBeInTheDocument();
    expect(getRevealedMessage).not.toHaveBeenCalled();
  });

  it("nothing is requested until the viewer presses Show", () => {
    renderThread([blocked(BLOCKED_SENDER_PLACEHOLDER)]);
    expect(getRevealedMessage).not.toHaveBeenCalled();
  });

  it("a placeholder body is fetched through the typed reveal client", async () => {
    const m = blocked(BLOCKED_SENDER_PLACEHOLDER);
    getRevealedMessage.mockResolvedValue({ id: m.id, body: "fetched secret" });
    renderThread([m]);

    fireEvent.click(screen.getByRole("button", { name: "Show message" }));

    expect(await screen.findByText("fetched secret")).toBeInTheDocument();
    expect(getRevealedMessage).toHaveBeenCalledTimes(1);
    expect(getRevealedMessage.mock.calls[0]?.slice(0, 2)).toEqual([CONVERSATION_ID, m.id]);
  });

  it("a mixed run fetches only the placeholder bodies", async () => {
    const withheld = blocked(BLOCKED_SENDER_PLACEHOLDER);
    getRevealedMessage.mockResolvedValue({ id: withheld.id, body: "fetched secret" });
    renderThread([blocked("inline body"), withheld]);

    fireEvent.click(screen.getByRole("button", { name: "Show 2 messages" }));

    expect(await screen.findByText("fetched secret")).toBeInTheDocument();
    expect(screen.getByText("inline body")).toBeInTheDocument();
    expect(getRevealedMessage).toHaveBeenCalledTimes(1);
  });

  it("a reveal error keeps it collapsed, shows code-keyed copy, and retries", async () => {
    const m = blocked(BLOCKED_SENDER_PLACEHOLDER);
    getRevealedMessage.mockRejectedValueOnce(
      new BccApiError("bcc_unavailable", "raw server text", 503, null),
    );
    renderThread([m]);

    fireEvent.click(screen.getByRole("button", { name: "Show message" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't show this message. Try again in a moment.");
    expect(alert).not.toHaveTextContent("raw server text");
    expect(screen.getByRole("button", { name: "Show message" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(BLOCKED_SENDER_PLACEHOLDER)).toBeInTheDocument();

    getRevealedMessage.mockResolvedValueOnce({ id: m.id, body: "second time lucky" });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("second time lucky")).toBeInTheDocument();
    expect(getRevealedMessage).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("a 404 shows its own copy, offers no Retry, and Show goes inert", async () => {
    getRevealedMessage.mockRejectedValueOnce(
      new BccApiError("bcc_not_found", "raw", 404, null),
    );
    renderThread([blocked(BLOCKED_SENDER_PLACEHOLDER)]);

    fireEvent.click(screen.getByRole("button", { name: "Show message" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This message is no longer available.");
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    // The toggle must not re-request a reveal that can't succeed.
    const show = screen.getByRole("button", { name: "Show message" });
    expect(show).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(show);
    fireEvent.click(show);
    await new Promise((r) => setTimeout(r, 20));
    expect(getRevealedMessage).toHaveBeenCalledTimes(1);
  });

  it("a double tap on Retry sends one request", async () => {
    const m = blocked(BLOCKED_SENDER_PLACEHOLDER);
    getRevealedMessage.mockRejectedValueOnce(
      new BccApiError("bcc_unavailable", "raw", 503, null),
    );
    renderThread([m]);
    fireEvent.click(screen.getByRole("button", { name: "Show message" }));
    await screen.findByRole("alert");

    let resolve: (v: { id: number; body: string }) => void = () => undefined;
    getRevealedMessage.mockImplementationOnce(
      () => new Promise((r) => { resolve = r; }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(getRevealedMessage).toHaveBeenCalledTimes(2));
    // While the retry is in flight, Retry is either gone or inert; tapping
    // whatever is there must not send a second request.
    const during = screen.queryByRole("button", { name: "Retry" });
    if (during !== null) {
      expect(during).toHaveAttribute("aria-disabled", "true");
      fireEvent.click(during);
      fireEvent.click(during);
    }
    expect(getRevealedMessage).toHaveBeenCalledTimes(2);

    resolve({ id: m.id, body: "after one retry" });
    expect(await screen.findByText("after one retry")).toBeInTheDocument();
    expect(getRevealedMessage).toHaveBeenCalledTimes(2);
  });

  it("a long run never has more than MAX_CONCURRENT_REVEALS requests in flight", async () => {
    const run = Array.from({ length: 12 }, () => blocked(BLOCKED_SENDER_PLACEHOLDER));
    let inFlight = 0;
    let peak = 0;
    const pending: Array<() => void> = [];
    getRevealedMessage.mockImplementation(
      (_c: number, id: number) =>
        new Promise((r) => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          pending.push(() => {
            inFlight -= 1;
            r({ id, body: `body ${id}` });
          });
        }),
    );
    renderThread(run);
    fireEvent.click(screen.getByRole("button", { name: "Show 12 messages" }));

    await waitFor(() => expect(getRevealedMessage).toHaveBeenCalledTimes(MAX_CONCURRENT_REVEALS));
    expect(peak).toBe(MAX_CONCURRENT_REVEALS);

    // Drain: each settled request opens the next slot until all 12 ran.
    for (let guard = 0; guard < 30 && getRevealedMessage.mock.calls.length < 12; guard += 1) {
      pending.splice(0).forEach((done) => done());
      await new Promise((r) => setTimeout(r, 10));
    }
    pending.splice(0).forEach((done) => done());

    expect(await screen.findByText(`body ${run[11]?.id}`)).toBeInTheDocument();
    expect(getRevealedMessage).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT_REVEALS);
  });
});

describe("inbox", () => {
  const convo = (lastMessage: ConversationSummary["last_message"]): ConversationSummary => ({
    id: 9,
    is_group: false,
    participants: [MALLORY],
    peer: MALLORY,
    last_message: lastMessage,
    unread_count: 0,
    last_activity: "2026-11-10T12:00:00Z",
  });

  it("a flagged last_message renders the server preview verbatim", () => {
    render(
      <ConversationList
        items={[
          convo({
            id: 1,
            author: MALLORY,
            preview: "Server-chosen copy, rendered as sent",
            posted_at: "2026-11-10T12:00:00Z",
            sender_blocked_by_viewer: true,
          }),
        ]}
      />,
    );
    const row = screen.getByRole("link");
    expect(within(row).getByText("Server-chosen copy, rendered as sent")).toBeInTheDocument();
    expect(within(row).getByText("Mallory")).toBeInTheDocument();
    const preview = within(row).getByText("Server-chosen copy, rendered as sent");
    expect(preview.className).toContain("text-bcc-text-secondary");
    expect(preview.className).not.toContain("text-bcc-text-muted");
  });
});
