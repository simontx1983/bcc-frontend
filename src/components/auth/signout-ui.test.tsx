/**
 * The sign-out UI, and the one surface that rendered a private list
 * without ever consulting the session.
 *
 * `SignOutModal` had no try/catch/finally: `await signOut(...)` then
 * `onClose()`. `signOut` awaits `fetch` then `res.json()`, and both throw
 * on a dropped connection — the rejection was swallowed by the
 * `void handleSignOut()` call site, leaving `pending` true forever, both
 * buttons disabled and the label stuck on "Signing out…" with no way to
 * tell whether anything happened.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as SessionBoundaryModule from "@/lib/auth/session-boundary";
import type { SessionTeardownResult } from "@/lib/auth/session-boundary";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const endSession =
  vi.fn<(reason: string) => Promise<SessionTeardownResult>>();
vi.mock("@/lib/auth/session-boundary", async (importOriginal) => ({
  // Only endSession is faked. pushCleanupNeedsWarning is a pure
  // predicate and the real one is what the copy decision must be
  // tested against.
  ...(await importOriginal<typeof SessionBoundaryModule>()),
  endSession: (reason: string) => endSession(reason),
}));

const sessionState = vi.hoisted(() => ({
  status: "authenticated" as "loading" | "authenticated" | "unauthenticated",
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: sessionState.status }),
}));

const notificationsPanel = vi.fn();
vi.mock("@/components/notifications/NotificationsPanel", () => ({
  NotificationsPanel: (props: unknown) => {
    notificationsPanel(props);
    return <div data-testid="notifications-panel">private list</div>;
  },
}));

import { SignOutModal } from "@/components/auth/SignOutModal";
import { NotificationsPageBody } from "@/components/notifications/NotificationsPageBody";

function result(over: Partial<SessionTeardownResult> = {}): SessionTeardownResult {
  return {
    reason: "user",
    localStateCleared: true,
    signedOut: true,
    pushCleanup: "revoked",
    ...over,
  };
}

beforeAll(() => {
  // Dialog consults prefers-reduced-motion; jsdom has no matchMedia.
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
  endSession.mockReset();
  notificationsPanel.mockReset();
  sessionState.status = "authenticated";
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// SignOutModal
// ─────────────────────────────────────────────────────────────────────

describe("SignOutModal", () => {
  it("routes through the session boundary, not a bare signOut", async () => {
    endSession.mockResolvedValue(result());
    const onClose = vi.fn();
    render(<SignOutModal onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    await waitFor(() => {
      expect(endSession).toHaveBeenCalledWith("user");
    });
  });

  it("does not leave the button stuck when sign-out FAILS", async () => {
    endSession.mockResolvedValue(result({ signedOut: false }));
    render(<SignOutModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /signing out/i }),
      ).toBeNull();
    });
    // And it says something true about the state the viewer is in.
    expect(screen.getByRole("alert").textContent).toMatch(
      /cleared from this browser/i,
    );
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  });

  it("confirms private data is cleared even when the server was unreachable", async () => {
    endSession.mockResolvedValue(result({ signedOut: false, localStateCleared: true }));
    render(<SignOutModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    const copy = screen.getByRole("alert").textContent ?? "";
    expect(copy).toMatch(/couldn[’']t reach the server/i);
    expect(copy).toMatch(/cleared/i);
  });

  it("warns about push when the browser refused to unsubscribe", async () => {
    endSession.mockResolvedValue(
      result({ signedOut: false, pushCleanup: "unsubscribe-failed" }),
    );
    render(<SignOutModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /push notifications may also still be enabled/i,
      );
    });
  });

  it("does NOT claim push is still enabled when cleanup succeeded", async () => {
    endSession.mockResolvedValue(result({ signedOut: false, pushCleanup: "revoked" }));
    render(<SignOutModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert").textContent).not.toMatch(/push/i);
  });

  it("recovers even if endSession rejects outright", async () => {
    // endSession is written not to throw, but the UI must not be
    // strandable by something unexpected that does.
    endSession.mockRejectedValue(new Error("unexpected"));
    render(<SignOutModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /signing out/i }),
      ).toBeNull();
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("disables both buttons only while the teardown is in flight", async () => {
    let release: ((v: SessionTeardownResult) => void) | undefined;
    endSession.mockReturnValue(
      new Promise<SessionTeardownResult>((r) => {
        release = r;
      }),
    );
    render(<SignOutModal onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^sign out$/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /signing out/i })).toBeDisabled();
    });
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();

    release?.(result({ signedOut: false }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /reload/i })).toBeEnabled();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// /notifications
// ─────────────────────────────────────────────────────────────────────

describe("the notifications page stops rendering a private list when signed out", () => {
  it("mounts the panel for an authenticated viewer", () => {
    sessionState.status = "authenticated";
    render(<NotificationsPageBody />);
    expect(screen.getByTestId("notifications-panel")).toBeInTheDocument();
    expect(notificationsPanel).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });

  it("does NOT mount the panel once the viewer is unauthenticated", () => {
    // The page's only auth check used to be a server-side redirect that
    // never re-runs, and `enabled` was a literal `true` — so signing out
    // with this page open left the private list on screen indefinitely.
    sessionState.status = "unauthenticated";
    render(<NotificationsPageBody />);
    expect(screen.queryByTestId("notifications-panel")).toBeNull();
    expect(notificationsPanel).not.toHaveBeenCalled();
    expect(screen.getByText(/sign in to see your notifications/i)).toBeInTheDocument();
  });

  it("does not fetch while the session is still resolving", () => {
    sessionState.status = "loading";
    render(<NotificationsPageBody />);
    expect(notificationsPanel).not.toHaveBeenCalled();
  });
});
