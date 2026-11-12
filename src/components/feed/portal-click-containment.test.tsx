/**
 * H2 — a click inside a dialog opened from a feed card, or from a comment
 * row, stays inside that dialog.
 *
 * The dialogs are portaled to <body>, but React bubbles their synthetic
 * events through the COMPONENT tree. The feed card's whole-card click
 * (router.push to the permalink) and the comment row's tap-to-collapse
 * only exempted `a, button`, so clicking a report reason, typing in the
 * report comment box or tapping the backdrop navigated away mid-action,
 * and clicking inside a comment's photo zoom collapsed the thread behind
 * it. Both handlers now act only on clicks physically inside them.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Comment, FeedItem } from "@/lib/api/types";

const push = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 7 } } }),
  getSession: async () => ({ user: { id: 7 } }),
  signOut: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// The overflow menu's Report dialog, reduced to what matters: a real,
// portaled Dialog holding non-button content, rendered where the menu sits.
vi.mock("@/components/feed/PostOverflowMenu", async () => {
  const { Dialog } = await import("@/components/ui/Dialog");
  return {
    PostOverflowMenu: () => (
      <Dialog title="Report this post" onClose={() => {}}>
        <p>Spam or scam</p>
        <label>
          Add a note
          <textarea />
        </label>
      </Dialog>
    ),
  };
});

const api = vi.hoisted(() => ({ listComments: vi.fn() }));
vi.mock("@/lib/api/comment-endpoints", () => ({
  listComments: (...a: unknown[]) => api.listComments(...a),
  deleteComment: vi.fn(),
  createComment: vi.fn(),
  setCommentStoke: vi.fn(),
  removeCommentStoke: vi.fn(),
}));
vi.mock("@/components/feed/HelpfulButton", () => ({
  CommentHelpfulButton: () => null,
  PostHelpfulButton: () => null,
}));
vi.mock("@/hooks/useCommentStoke", () => ({
  useCommentStoke: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useGiphyIntegration", () => ({
  useGiphyIntegration: () => ({ enabled: false }),
}));

const { FeedItemCard } = await import("@/components/feed/FeedItemCard");
const { CommentDrawer } = await import("@/components/feed/CommentDrawer");

const ITEM = {
  id: "feed_1",
  post_kind: "status",
  external_id: 100,
  posted_at: "2026-11-05T00:00:00Z",
  scope_tags: [],
  author: {
    user_id: 7,
    handle: "anvil",
    reputation_tier: "neutral",
    reputation_tier_label: "Neutral",
  },
  body: { text: "hello floor" },
  reactions: {
    kind_grammar: "social",
    counts: {},
    viewer_reaction: null,
    viewer_has_stoked: false,
    stoke_count: 0,
  },
  permissions: {},
  links: { self: "/post/feed_1", author: "/u/anvil" },
} as unknown as FeedItem;

function comment(id: string, body: string, extra: Partial<Comment> = {}): Comment {
  return {
    id,
    comment_id: id,
    feed_id: "feed_1",
    author: {
      id: 9,
      handle: "smith",
      display_name: "Smith",
      avatar_url: "",
      reputation_tier: "neutral",
      reputation_tier_label: "Neutral",
    },
    body,
    mentions: [],
    posted_at: "2026-11-10T00:00:00Z",
    permissions: {},
    ...extra,
  } as Comment;
}

let client: QueryClient;

function mount(node: ReactNode) {
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

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
  push.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe("FeedItemCard whole-card navigation", () => {
  it("ignores clicks inside a dialog opened from the card", () => {
    mount(<FeedItemCard item={ITEM} />);
    const dialog = screen.getByRole("dialog", { name: "Report this post" });

    fireEvent.click(within(dialog).getByText("Spam or scam"));
    fireEvent.click(within(dialog).getByRole("textbox"));
    fireEvent.click(dialog); // the backdrop

    expect(push).not.toHaveBeenCalled();
  });

  it("still navigates on a click in the card's own body", () => {
    mount(<FeedItemCard item={ITEM} />);
    fireEvent.click(screen.getByText("hello floor"));
    expect(push).toHaveBeenCalledWith("/post/feed_1");
  });
});

describe("comment row tap-to-collapse", () => {
  it("a click inside the comment's photo zoom does not collapse the thread", async () => {
    api.listComments.mockResolvedValue({
      items: [
        comment("comment_1", "parent words", {
          media: { kind: "gif", url: "https://media.giphy.com/x.gif" },
        }),
        comment("comment_2", "reply words", { parent_id: "comment_1" }),
      ],
      next_cursor: null,
    });
    mount(<CommentDrawer feedId="feed_1" isOpen />);
    await screen.findByText("reply words");

    fireEvent.click(screen.getByRole("button", { name: "View GIF" }));
    const zoom = screen.getByRole("dialog", { name: "GIF" });
    fireEvent.click(zoom.querySelector("img") as HTMLImageElement);

    expect(screen.getByText("reply words")).toBeInTheDocument();
  });
});
