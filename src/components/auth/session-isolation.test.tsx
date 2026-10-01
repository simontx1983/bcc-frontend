/**
 * Viewer A → viewer B in one tab, and a viewer change arriving from
 * another tab.
 *
 * The defect: `SignOutModal` called `signOut({ redirect: false })`, so
 * nothing navigated and the `QueryClient` built once in `providers.tsx`
 * survived. No query key carries a viewer discriminator — `["user",
 * handle]` is 5min stale / 30min gc and carries own-only `wallets` plus
 * `is_self` — so viewer B signing in in the same tab was served viewer
 * A's cached entries.
 *
 * These tests drive the real `SessionBoundaryBridge` against a real
 * `QueryClient`, because the property being asserted is about the cache,
 * not about which functions were called.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(async () => undefined);
const sessionState = vi.hoisted(() => ({
  data: null as { user?: { id?: string } } | null,
  status: "loading" as "loading" | "authenticated" | "unauthenticated",
}));

vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOut(...(args as [])),
  useSession: () => ({ data: sessionState.data, status: sessionState.status }),
  getSession: async () => sessionState.data,
}));

const revokePushForSessionEnd = vi.fn(async () => "not-subscribed" as const);
vi.mock("@/lib/push/revoke", () => ({
  revokePushForSessionEnd: () => revokePushForSessionEnd(),
  pushCleanupNeedsWarning: () => false,
  PUSH_SUBSCRIPTION_ID_KEY: "bcc-push-subscription-id",
  rememberPushSubscriptionId: vi.fn(),
}));

import { SessionBoundaryBridge } from "@/components/auth/SessionBoundaryBridge";
import {
  __resetSessionBoundaryForTests,
  endSession,
} from "@/lib/auth/session-boundary";

/** Stand-ins for the real viewer-private entries, same key shapes. */
const A_PROFILE = ["user", "viewer-a"] as const;
const A_FEED = ["feed", "for_you"] as const;
const A_NOTIFS = ["me", "notifications"] as const;

function seedViewerACache(qc: QueryClient) {
  qc.setQueryData(A_PROFILE, {
    handle: "viewer-a",
    is_self: true,
    // The own-only block types.ts marks "do not render this anywhere a
    // different user can see".
    wallets: [{ address_short: "0xaaa…111" }],
  });
  qc.setQueryData(A_FEED, { pages: [{ items: [{ id: 1 }] }] });
  qc.setQueryData(A_NOTIFS, { pages: [{ items: [{ id: 9 }] }] });
}

function mount(qc: QueryClient) {
  return render(
    <QueryClientProvider client={qc}>
      <SessionBoundaryBridge />
    </QueryClientProvider>,
  );
}

let qc: QueryClient;

beforeEach(() => {
  __resetSessionBoundaryForTests();
  signOut.mockClear();
  revokePushForSessionEnd.mockClear();
  window.localStorage.clear();
  sessionState.data = { user: { id: "a" } };
  sessionState.status = "authenticated";
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  cleanup();
  __resetSessionBoundaryForTests();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────
// A → B in the same tab
// ─────────────────────────────────────────────────────────────────────

describe("viewer A → viewer B in one tab", () => {
  it("leaves no cached entry behind for the next viewer", async () => {
    mount(qc);
    seedViewerACache(qc);
    expect(qc.getQueryData(A_PROFILE)).toBeDefined();

    await endSession("user");

    // The property: not "clear was called" but "A's data is unreachable".
    expect(qc.getQueryData(A_PROFILE)).toBeUndefined();
    expect(qc.getQueryData(A_FEED)).toBeUndefined();
    expect(qc.getQueryData(A_NOTIFS)).toBeUndefined();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });

  it("clears viewer-scoped storage but keeps device preferences", async () => {
    mount(qc);
    window.localStorage.setItem("bcc-recent-searches", '["a private search"]');
    window.localStorage.setItem("bcc-tour-seen", "x");
    window.localStorage.setItem("bcc-theme", "dark");

    await endSession("user");

    expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
    expect(window.localStorage.getItem("bcc-tour-seen")).toBeNull();
    expect(window.localStorage.getItem("bcc-theme")).toBe("dark");
  });

  it("signs out WITH a redirect, so the RSC tree re-runs and owner gating is recomputed", async () => {
    mount(qc);
    await endSession("user");
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(signOut.mock.calls[0]?.[0]).toMatchObject({ redirect: true });
  });

  it("revokes push while the session is still live, before signing out", async () => {
    mount(qc);
    const order: string[] = [];
    revokePushForSessionEnd.mockImplementation(async () => {
      order.push("revokePush");
      return "not-subscribed" as const;
    });
    signOut.mockImplementation(async () => {
      order.push("signOut");
      return undefined;
    });

    await endSession("user");
    expect(order).toEqual(["revokePush", "signOut"]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Cross-tab
// ─────────────────────────────────────────────────────────────────────

describe("a viewer change arriving from another tab", () => {
  it("purges this tab's cache when the session goes to null elsewhere", async () => {
    const view = mount(qc);
    seedViewerACache(qc);

    // NextAuth broadcasts the other tab's sign-out into this one.
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(
      <QueryClientProvider client={qc}>
        <SessionBoundaryBridge />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(qc.getQueryCache().getAll()).toHaveLength(0);
    });
    // The other tab already signed out; this one must not race it.
    expect(signOut).not.toHaveBeenCalled();
  });

  it("purges when a DIFFERENT account takes over the session", async () => {
    const view = mount(qc);
    seedViewerACache(qc);

    sessionState.data = { user: { id: "b" } };
    view.rerender(
      <QueryClientProvider client={qc}>
        <SessionBoundaryBridge />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(qc.getQueryData(A_PROFILE)).toBeUndefined();
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("does NOT purge on the first session resolution", async () => {
    // loading → authenticated is not a viewer change; purging there
    // would throw away a legitimately warm cache on every mount.
    sessionState.data = null;
    sessionState.status = "loading";
    const view = mount(qc);
    seedViewerACache(qc);

    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(
      <QueryClientProvider client={qc}>
        <SessionBoundaryBridge />
      </QueryClientProvider>,
    );

    await Promise.resolve();
    expect(qc.getQueryData(A_PROFILE)).toBeDefined();
  });

  it("does not purge while the session is still resolving", async () => {
    sessionState.status = "loading";
    const view = mount(qc);
    seedViewerACache(qc);
    view.rerender(
      <QueryClientProvider client={qc}>
        <SessionBoundaryBridge />
      </QueryClientProvider>,
    );
    await Promise.resolve();
    expect(qc.getQueryData(A_PROFILE)).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// In-flight requests
// ─────────────────────────────────────────────────────────────────────

describe("in-flight private requests", () => {
  it("are cancelled by the teardown, so a late response has nothing to write to", async () => {
    mount(qc);
    let release: ((v: unknown) => void) | undefined;
    const pending = new Promise((r) => {
      release = r;
    });

    // Cancellation rejects this promise — that IS the expected outcome,
    // so it is caught rather than left to surface as unhandled.
    void qc
      .fetchQuery({ queryKey: ["me", "slow-private"], queryFn: () => pending })
      .catch(() => undefined);
    await waitFor(() => {
      expect(qc.getQueryState(["me", "slow-private"])).toBeDefined();
    });

    await endSession("user");

    // Resolve AFTER the boundary — the late response must not land.
    release?.({ secret: "viewer A private" });
    await Promise.resolve();
    await Promise.resolve();

    expect(qc.getQueryData(["me", "slow-private"])).toBeUndefined();
    expect(qc.getQueryCache().getAll()).toHaveLength(0);
  });
});
