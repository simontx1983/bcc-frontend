/**
 * F-264: three first loads show a skeleton, not a line of mono text.
 *
 * The inbox (both tabs), "Your disputes" and a member's blog list each
 * rendered "Loading …" as a visible paragraph. Now each renders the shared
 * Skeleton blocks inside an aria-busy region, with the words kept for a
 * screen reader only (the messages/[id] ThreadSkeleton pattern).
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const state = vi.hoisted(() => ({ tab: "" }));

const pending = () => ({
  isPending: true, isError: false, isLoadingError: false, isRefetchError: false,
  isSuccess: false, isFetching: true, error: null, data: undefined, refetch: () => {},
});

vi.mock("@/hooks/useConversations", () => ({
  useConversations: () => pending(),
  CONVERSATIONS_QUERY_KEY_ROOT: ["conversations"],
}));
vi.mock("@/hooks/useQueuedMessages", () => ({ useQueuedMessages: () => pending() }));
vi.mock("@/hooks/useDisputes", () => ({ useMyDisputes: () => pending() }));
vi.mock("@/hooks/useUserBlog", () => ({ useUserBlog: () => pending() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(state.tab),
  usePathname: () => "/messages",
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 1 } } }),
}));
vi.mock("@/components/layout/RouteRail", () => ({ RouteRail: () => null }));

const { default: MessagesPage } = await import("@/app/(main)/(app)/messages/page");
const { MyDisputesList } = await import("@/components/disputes/MyDisputesList");
const { UserBlogList } = await import("@/components/blog/UserBlogList");

afterEach(() => {
  cleanup();
  state.tab = "";
});

/** The words are for a screen reader only, inside a busy region holding skeleton blocks. */
function expectSkeleton(words: string) {
  const line = screen.getByText(words);
  expect(line).toHaveClass("sr-only");
  const region = line.closest('[aria-busy="true"]') as HTMLElement;
  expect(region).not.toBeNull();
  const blocks = region.querySelectorAll('[aria-hidden="true"]');
  expect(blocks.length).toBeGreaterThan(0);
  for (const b of blocks) expect(b.className).toContain("motion-safe:animate-pulse");
}

describe("first-load skeletons", () => {
  it("the inbox", () => {
    render(<MessagesPage />);
    expectSkeleton("Loading conversations…");
  });

  it("the queued tab", () => {
    state.tab = "tab=queued";
    render(<MessagesPage />);
    expectSkeleton("Loading queued messages…");
  });

  it("your disputes", () => {
    render(<MyDisputesList />);
    expectSkeleton("Loading your disputes…");
  });

  it("a member's blog list", () => {
    render(<UserBlogList handle="anvil" />);
    expectSkeleton("Loading posts…");
  });
});
