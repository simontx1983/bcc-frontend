/**
 * F-320 (UX scan Lows), notifications:
 *   - the signed-out /notifications page said "Sign in" with no way to;
 *     it now links to sign-in and back, and shows nothing while the
 *     session is still loading (no "Sign in" flash for members);
 *   - marking ONE row read made the bulk button say "Marking…".
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const state = vi.hoisted(() => ({
  status: "unauthenticated" as string,
  markRead: { mutate: vi.fn(), isPending: false, isError: false, error: null, variables: undefined as unknown },
}));

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: state.status }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/notifications",
  useRouter: () => ({ push: vi.fn() }),
}));
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    isLoading: false, isError: false, isLoadingError: false, isRefetchError: false,
    isFetchNextPageError: false, hasNextPage: false, isFetchingNextPage: false,
    data: { pages: [{ items: [] }] }, refetch: vi.fn(), fetchNextPage: vi.fn(),
  }),
  useUnreadCount: () => ({ data: { unread_count: 5 } }),
  useMarkReadMutation: () => state.markRead,
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));

import { NotificationsPageBody } from "@/components/notifications/NotificationsPageBody";
import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

afterEach(() => {
  cleanup();
  state.status = "unauthenticated";
  state.markRead.isPending = false;
  state.markRead.variables = undefined;
});

describe("signed-out /notifications", () => {
  it("links to sign in and comes back here", () => {
    render(<NotificationsPageBody />);
    expect(screen.getByText("Sign in to see your notifications.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?callbackUrl=%2Fnotifications",
    );
  });

  it("shows nothing while the session is still loading (no sign-in flash)", () => {
    state.status = "loading";
    render(<NotificationsPageBody />);
    expect(screen.queryByText(/Sign in/)).toBeNull();
  });
});

describe("the bulk button's 'Marking…'", () => {
  const panel = () => render(<NotificationsPanel enabled open onNavigate={vi.fn()} />);

  it("marking one row does not make the bulk button say Marking…", () => {
    state.markRead.isPending = true;
    state.markRead.variables = 12;
    panel();
    expect(screen.getByRole("button", { name: "Mark all read" })).toBeInTheDocument();
    expect(screen.queryByText("Marking…")).toBeNull();
  });

  it("the bulk call itself does", () => {
    state.markRead.isPending = true;
    state.markRead.variables = undefined;
    panel();
    expect(screen.getByRole("button", { name: "Marking…" })).toBeInTheDocument();
  });
});
