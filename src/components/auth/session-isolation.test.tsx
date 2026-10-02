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

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface SignOutOpts {
  redirect?: boolean;
  callbackUrl?: string;
}
const signOut = vi.fn<(opts?: SignOutOpts) => Promise<undefined>>(
  async () => undefined,
);
const sessionState = vi.hoisted(() => ({
  data: null as { user?: { id?: string } } | null,
  status: "loading" as "loading" | "authenticated" | "unauthenticated",
}));

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}));

vi.mock("next-auth/react", () => ({
  signOut: (opts?: SignOutOpts) => signOut(opts),
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

import { PrivateRenderGate } from "@/components/auth/PrivateRenderGate";
import { SessionBoundaryBridge } from "@/components/auth/SessionBoundaryBridge";
import {
  __resetSessionBoundaryForTests,
  endSession,
  isEndingSession,
  purgeViewerState,
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

/** Reads the cache the way production surfaces do: a subscribed observer. */
function PrivateReadout() {
  const { data } = useQuery<{ secret: string }>({
    queryKey: A_PROFILE,
    queryFn: () => new Promise(() => {}) as Promise<{ secret: string }>,
    enabled: false,
  });
  return <div data-testid="private">{data?.secret ?? "(none)"}</div>;
}

function tree(qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <SessionBoundaryBridge />
      <PrivateRenderGate>
        <PrivateReadout />
      </PrivateRenderGate>
    </QueryClientProvider>
  );
}

function mount(qc: QueryClient) {
  return render(tree(qc));
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
  vi.useRealTimers();
  routerRefresh.mockClear();
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
    // The endpoint must CONFIRM the departure: a readable `200 {}` is
    // next-auth's answer when there is no session cookie. Without this
    // stub the bridge rightly treats null as inconclusive, because a
    // failed fetch produces the same null.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const view = mount(qc);
    seedViewerACache(qc);

    // NextAuth broadcasts the other tab's sign-out into this one.
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));

    // Assert the property that matters, not the entry count. The gate's
    // close notification does not unmount SYNCHRONOUSLY, so clear() can run
    // while an observer is still mounted and that observer immediately
    // re-creates an EMPTY entry for its key. No payload survives, which is
    // the guarantee; "zero entries" is not.
    await waitFor(() => {
      expect(screen.queryByTestId("private")).toBeNull();
    });
    for (const q of qc.getQueryCache().getAll()) {
      expect(JSON.stringify(q.state.data ?? null)).not.toContain("VIEWER-A");
    }
    // The other tab already signed out; this one must not race it.
    expect(signOut).not.toHaveBeenCalled();
  });

  it("purges when a DIFFERENT account takes over the session", async () => {
    const view = mount(qc);
    seedViewerACache(qc);

    sessionState.data = { user: { id: "b" } };
    view.rerender(tree(qc));

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
    view.rerender(tree(qc));

    // Long enough for the effect to have run if it were going to.
    await new Promise((r) => setTimeout(r, 50));
    expect(qc.getQueryData(A_PROFILE)).toBeDefined();
    expect(qc.getQueryCache().getAll().length).toBeGreaterThan(0);
  });

  it("does not purge while the session is still resolving", async () => {
    sessionState.status = "loading";
    const view = mount(qc);
    seedViewerACache(qc);
    view.rerender(tree(qc));
    await new Promise((r) => setTimeout(r, 50));
    expect(qc.getQueryData(A_PROFILE)).toBeDefined();
    expect(qc.getQueryCache().getAll().length).toBeGreaterThan(0);
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

// ─────────────────────────────────────────────────────────────────────
// The render gate is what actually hides the data
// ─────────────────────────────────────────────────────────────────────

describe("the render gate removes private surfaces from the DOM", () => {
  it("unmounts the private subtree on a full teardown", async () => {
    mount(qc);
    qc.setQueryData(A_PROFILE, { secret: "VIEWER-A-PRIVATE-PAYLOAD" });
    await waitFor(() => {
      expect(screen.getByTestId("private").textContent).toContain("VIEWER-A");
    });

    await endSession("user");

    // Unmounted, not merely re-rendered empty: clearing the cache alone
    // leaves a mounted observer holding its last result.
    await waitFor(() => {
      expect(screen.queryByTestId("private")).toBeNull();
    });
    expect(screen.getByText(/signing out/i)).toBeInTheDocument();
  });

  it("unmounts it on a cross-tab purge too", async () => {
    mount(qc);
    qc.setQueryData(A_PROFILE, { secret: "VIEWER-A-PRIVATE-PAYLOAD" });
    await waitFor(() => {
      expect(screen.getByTestId("private").textContent).toContain("VIEWER-A");
    });

    purgeViewerState();

    await waitFor(() => {
      expect(screen.queryByTestId("private")).toBeNull();
    });
  });

  it("no cache entry retains the previous viewer's payload afterwards", async () => {
    mount(qc);
    seedViewerACache(qc);
    await endSession("user");
    await waitFor(() => {
      expect(screen.queryByTestId("private")).toBeNull();
    });
    for (const q of qc.getQueryCache().getAll()) {
      expect(JSON.stringify(q.state.data ?? null)).not.toContain("viewer-a");
      expect(JSON.stringify(q.state.data ?? null)).not.toContain("0xaaa");
    }
  });
});

describe("a viewer-ID change reloads server-rendered state", () => {
  it("reloads when a DIFFERENT account takes over, because RSC output is not cached data", async () => {
    // /u/[handle] computes isOwner server-side and passes the owner's email
    // into the change-email form. Clearing a query cache cannot touch that;
    // only a document load re-runs the tree for whoever is here now.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn() },
      writable: true,
    });

    const view = mount(qc);
    seedViewerACache(qc);

    sessionState.data = { user: { id: "b" } };
    view.rerender(tree(qc));

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  it("does not reload on the FIRST session resolution", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn() },
      writable: true,
    });
    sessionState.data = null;
    sessionState.status = "loading";
    const view = mount(qc);

    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(tree(qc));

    await new Promise((r) => setTimeout(r, 50));
    expect(reload).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// The gate owns the recovery UI, because it unmounts the modal
// ─────────────────────────────────────────────────────────────────────

describe("the gate's recovery panel", () => {
  it("shows a neutral placeholder while the teardown is in flight", async () => {
    let release: (() => void) | undefined;
    signOut.mockImplementation(
      () =>
        new Promise<undefined>((r) => {
          release = () => r(undefined);
        }),
    );
    mount(qc);
    seedViewerACache(qc);
    void endSession("user");

    await waitFor(() => {
      expect(screen.getByText(/signing out/i)).toBeInTheDocument();
    });
    // Not the recovery panel yet — nothing has failed.
    expect(screen.queryByText(/almost signed out/i)).toBeNull();
    release?.();
  });

  it("offers recovery when the teardown settles WITHOUT signing out", async () => {
    // The gate unmounts SignOutModal, which used to carry this. Browser-
    // verified: with the modal gated away, a stalled sign-out showed a
    // placeholder forever and offered nothing.
    signOut.mockImplementation(async () => {
      throw new Error("502");
    });
    mount(qc);
    seedViewerACache(qc);
    await endSession("user");

    await waitFor(() => {
      expect(screen.getByText(/almost signed out/i)).toBeInTheDocument();
    });
    expect(
      screen.getByRole("button", { name: /finish signing out/i }),
    ).toBeInTheDocument();
    // And private content is still gone.
    expect(screen.queryByTestId("private")).toBeNull();
  });

  it("the recovery control POSTs, because a GET signs nothing out", async () => {
    // It used to `assign("/api/auth/signout")`. That is a GET, and
    // middleware.ts redirects a GET there to our styled /signout page
    // while next-auth's own GET handler only renders a confirmation —
    // so the cookie survived and the document load reopened the gate.
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign, reload: vi.fn(), href: "http://localhost/" },
      writable: true,
    });
    const submit = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement;
      if (tag === "form") {
        (el as HTMLFormElement).submit = submit;
      }
      return el;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ csrfToken: "csrf-abc" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    signOut.mockImplementation(async () => {
      throw new Error("502");
    });
    mount(qc);
    await endSession("user");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /finish signing out/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /finish signing out/i }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalled();
    });
    const form = (document.createElement as unknown as ReturnType<typeof vi.fn>).mock
      .results.map((r) => r.value as HTMLElement)
      .find((el) => el.tagName === "FORM") as HTMLFormElement;
    expect(form.method.toUpperCase()).toBe("POST");
    expect(form.action).toContain("/api/auth/signout");
    const fields = [...form.querySelectorAll("input")].map((i) => [i.name, i.value]);
    expect(fields).toEqual(
      expect.arrayContaining([["csrfToken", "csrf-abc"]]),
    );
    // And it is NOT the old cosmetic GET.
    expect(assign).not.toHaveBeenCalledWith("/api/auth/signout");
  });

  it("falls back to a real page when no csrf token can be minted", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign, reload: vi.fn(), href: "http://localhost/" },
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    signOut.mockImplementation(async () => {
      throw new Error("502");
    });
    mount(qc);
    await endSession("user");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /finish signing out/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /finish signing out/i }));
    // /signout is ours and retries the teardown: a weaker guarantee, but
    // a real control rather than a dead end.
    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith("/signout");
    });
  });

  it("does not promise deletion when the storage purge was partial", async () => {
    signOut.mockImplementation(async () => {
      throw new Error("502");
    });
    // Make the purge fail: Storage.prototype, because jsdom's Storage is
    // Proxy-backed and an instance spy becomes a stored entry instead.
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    window.localStorage.setItem("bcc-recent-searches", "x");

    mount(qc);
    await endSession("user");
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    const copy = screen.getByRole("alert").textContent ?? "";
    expect(copy).toMatch(/hidden/i);
    expect(copy).toMatch(/could not be deleted/i);
    expect(copy).not.toMatch(/hidden and cleared/i);
  });

  it("surfaces a push warning in the recovery panel", async () => {
    signOut.mockImplementation(async () => {
      throw new Error("502");
    });
    revokePushForSessionEnd.mockResolvedValue("unsubscribe-failed" as never);
    mount(qc);
    await endSession("user");
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(
        /push notifications may also still be enabled/i,
      );
    });
  });

  it("stays silent about push when cleanup succeeded", async () => {
    signOut.mockImplementation(async () => {
      throw new Error("502");
    });
    revokePushForSessionEnd.mockResolvedValue("revoked" as never);
    mount(qc);
    await endSession("user");
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByRole("alert").textContent).not.toMatch(/push/i);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Signing IN must not trip the boundary
// ─────────────────────────────────────────────────────────────────────

describe("anonymous → authenticated", () => {
  it("does NOT close the gate, because the gate never reopens", async () => {
    // Every sign-in in this app flips the session in place
    // (`signIn(..., { redirect: false })`), so there is no document load
    // to reset module state. Purging here latched the gate shut and left
    // the viewer staring at "Signing out…" immediately after a successful
    // login, escapable only by a manual browser reload.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn() },
      writable: true,
    });

    sessionState.data = null;
    sessionState.status = "unauthenticated";
    const view = mount(qc);
    await waitFor(() => {
      expect(screen.getByTestId("private")).toBeInTheDocument();
    });

    // ...then sign in, in place.
    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(tree(qc));

    // The app must still be usable.
    await waitFor(() => {
      expect(screen.getByTestId("private")).toBeInTheDocument();
    });
    expect(screen.queryByText(/^signing out/i)).toBeNull();
    expect(reload).not.toHaveBeenCalled();
  });

  it("STILL clears a previous viewer's storage residue on arrival", async () => {
    // `localStorage` survives document loads, so A's keys can be on this
    // device even though this tab never saw A: A's purge may have returned
    // "partial", or no teardown ran at all because the session JWT simply
    // aged out. The next person signing in would otherwise get A's search
    // history rendered verbatim into their dropdown.
    //
    // This is deliberately the inverse of what an earlier version of this
    // test asserted. Those keys are classified viewer-scoped precisely so
    // they do NOT carry across people, and nothing writes them before a
    // session exists: /onboarding redirects unauthenticated visitors
    // (app/(auth)/onboarding/page.tsx), so the wizard can only run once
    // the arrival has already happened.
    window.localStorage.setItem("bcc-recent-searches", '["viewer-a-secret"]');
    window.localStorage.setItem("bcc-onboarding-progress", "step-3");

    window.localStorage.setItem("bcc-theme", "dark");
    Object.defineProperty(window, "location", {
      value: { reload: vi.fn(), href: "http://localhost/", assign: vi.fn() },
      writable: true,
    });

    sessionState.data = null;
    sessionState.status = "unauthenticated";
    const view = mount(qc);
    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(tree(qc));

    await waitFor(() => {
      expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
    });
    expect(window.localStorage.getItem("bcc-onboarding-progress")).toBeNull();
    // The id-scoped draft is NOT an arrival concern: see
    // ARRIVAL_SCOPED_STORAGE_KEYS. Covered in "what arrival purges".
    // Device preference kept, and the app is still usable: arrival purges
    // state, only DEPARTURE closes the gate.
    expect(window.localStorage.getItem("bcc-theme")).toBe("dark");
    expect(screen.getByTestId("private")).toBeInTheDocument();
    expect(screen.queryByText(/^signing out/i)).toBeNull();
  });

  it("STILL tears down when one account replaces another", async () => {
    // The guard must be "no previous viewer", not "any change".
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn() },
      writable: true,
    });
    const view = mount(qc);
    seedViewerACache(qc);

    sessionState.data = { user: { id: "b" } };
    view.rerender(tree(qc));

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("private")).toBeNull();
  });

  it("tears down when an authenticated viewer becomes anonymous", async () => {
    // Confirmed departure — see the null-without-being-gone group.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn() },
      writable: true,
    });
    const view = mount(qc);
    seedViewerACache(qc);

    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("private")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// A retried teardown must not RENDER the previous attempt's panel
// ─────────────────────────────────────────────────────────────────────

describe("the recovery panel during a retry", () => {
  it("disappears from the SCREEN, not just from module state", async () => {
    // Clearing `failedTeardown` without notifying the gate left the stale
    // panel — with the earlier attempt's cleanup claims — on screen for
    // the whole retry, because useSyncExternalStore only re-reads its
    // snapshot when the subscription fires. Asserting module state would
    // have passed while the UI stayed wrong.
    signOut.mockImplementation(async () => {
      throw new Error("502");
    });
    revokePushForSessionEnd.mockResolvedValue("unsubscribe-failed" as never);
    mount(qc);
    await endSession("user");
    await waitFor(() => {
      expect(screen.getByText(/almost signed out/i)).toBeInTheDocument();
    });

    // Second attempt, which blocks until we let it finish.
    let release: (() => void) | undefined;
    signOut.mockImplementation(
      () =>
        new Promise<undefined>((r) => {
          release = () => r(undefined);
        }),
    );
    revokePushForSessionEnd.mockResolvedValue("revoked" as never);
    void endSession("user");

    await waitFor(() => {
      expect(screen.queryByText(/almost signed out/i)).toBeNull();
    });
    expect(screen.getByText(/^signing out/i)).toBeInTheDocument();
    release?.();
  });

  it("shows a pending state so the control cannot be clicked into silence", async () => {
    // The control fetches a csrf token with a 3s bound, on exactly the
    // wedged host that produced this panel.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    signOut.mockImplementation(async () => {
      throw new Error("502");
    });
    mount(qc);
    await endSession("user");
    const button = await waitFor(() =>
      screen.getByRole("button", { name: /finish signing out/i }),
    );
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /finishing/i })).toBeDisabled();
    });
  });
});

describe("the recovery control stays usable", () => {
  it("re-enables when the navigation never happens", async () => {
    // The pending state was never reset. On a dead host — which is WHY
    // this panel is on screen — the csrf fetch aborts at 3s, the fallback
    // assigns /signout, and if that request also never completes the
    // document stays put showing a disabled "Finishing…" with no other
    // control. The gate is terminal, so the only way out was a manual
    // browser reload, after which the gate reopens with the session
    // cookie still live for someone who was just told they were signing
    // out. A real navigation supersedes the re-enable; a dead one has to
    // give the control back.
    Object.defineProperty(window, "location", {
      value: { assign: vi.fn(), reload: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    signOut.mockImplementation(async () => {
      throw new Error("502");
    });
    mount(qc);
    await endSession("user");

    const button = await waitFor(() =>
      screen.getByRole("button", { name: /finish signing out/i }),
    );
    // Installed BEFORE the click, so the re-enable timer is a fake one
    // this test can advance. Installing them afterwards leaves the
    // already-scheduled real timer untouched.
    vi.useFakeTimers();
    fireEvent.click(button);

    // The window closes with the document still here, which is what a
    // dead host looks like — so the control comes back. (That it stays
    // disabled DURING the window is pinned separately.)
    // Inside act(): the timer's setFinishing(false) is a React state
    // update, and advancing outside act leaves it unflushed.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(
      screen.getByRole("button", { name: /finish signing out/i }),
    ).not.toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Arrival removes what would be SHOWN to a newcomer — and nothing else
// ─────────────────────────────────────────────────────────────────────

describe("what arrival purges", () => {
  function arrive() {
    Object.defineProperty(window, "location", {
      value: { reload: vi.fn(), href: "http://localhost/", assign: vi.fn() },
      writable: true,
    });
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    const view = mount(qc);
    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(tree(qc));
    return view;
  }

  it("clears the keys that get RENDERED to whoever is next", async () => {
    window.localStorage.setItem("bcc-recent-searches", '["acme payroll leak"]');
    window.localStorage.setItem("bcc-onboarding-progress", "step-3");
    window.sessionStorage.setItem("bcc-tour-progress", "2");
    arrive();
    await waitFor(() => {
      expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
    });
    expect(window.localStorage.getItem("bcc-onboarding-progress")).toBeNull();
    expect(window.sessionStorage.getItem("bcc-tour-progress")).toBeNull();
  });

  it("KEEPS the returning viewer's own id-scoped blog draft", async () => {
    // bcc.blog.draft.<handle> is restored by the composer on mount, and
    // it is already partitioned by id — another viewer's composer only
    // ever reads their own key. Purging it on arrival destroyed an
    // unpublished post belonging to the person who just signed back in,
    // and bought nothing.
    window.localStorage.setItem("bcc.blog.draft.a", "half-written post");
    window.localStorage.setItem("bcc-recent-searches", '["x"]');
    arrive();
    await waitFor(() => {
      expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
    });
    expect(window.localStorage.getItem("bcc.blog.draft.a")).toBe("half-written post");
  });

  it("KEEPS the push subscription row id, so sign-out can still revoke it", async () => {
    // Deleting it orphaned a live server row: the browser subscription
    // survives, so the toggle still reads ON and nothing re-stores the
    // id, and the next sign-out degrades from "revoked" to
    // "unsubscribed-locally". Keeping even a FOREIGN id is harmless —
    // the DELETE is ownership-checked and a 403 is already swallowed.
    window.localStorage.setItem("bcc-push-subscription-id", "55");
    window.localStorage.setItem("bcc-recent-searches", '["x"]');
    arrive();
    await waitFor(() => {
      expect(window.localStorage.getItem("bcc-recent-searches")).toBeNull();
    });
    expect(window.localStorage.getItem("bcc-push-subscription-id")).toBe("55");
  });

  it("REMOVES the anonymous entries nothing is observing", async () => {
    // Invalidating alone left their data in place, so a remount rendered
    // the pre-login payload for a round trip — and indefinitely if the
    // refetch then errored, since query-core keeps `data` on error.
    // Nothing is observing them and they hold only anonymous reads, so
    // dropping them is free and leaves nothing stale to serve.
    qc.setQueryData(["card-entity", "user", "alice"], { viewer_has_endorsed: false });
    arrive();
    await waitFor(() => {
      expect(qc.getQueryData(["card-entity", "user", "alice"])).toBeUndefined();
    });
  });

  it("does NOT abort the arriving viewer's own in-flight first read", async () => {
    // This is the property that made a full purge wrong: purgeQueryCache
    // cancels, and at login that aborts the new viewer's first reads as
    // their surfaces mount. `invalidateQueries` cancels only an ACTIVE
    // query that already has data; a first read has `data === undefined`
    // and is continued.
    const key = ["arriving", "first-read"];
    let settled = false;
    void qc
      .fetchQuery({
        queryKey: key,
        queryFn: () => new Promise<{ ok: boolean }>(() => {}),
      })
      .catch(() => {
        settled = true;
      });
    await waitFor(() => {
      expect(qc.getQueryState(key)?.fetchStatus).toBe("fetching");
    });

    arrive();
    await new Promise((r) => setTimeout(r, 50));

    // Still in flight: not cancelled, not rejected.
    expect(settled).toBe(false);
    expect(qc.getQueryState(key)?.fetchStatus).toBe("fetching");
  });

  it("DEPARTURE still clears everything, draft and push id included", async () => {
    window.localStorage.setItem("bcc.blog.draft.a", "half-written post");
    window.localStorage.setItem("bcc-push-subscription-id", "55");
    window.localStorage.setItem("bcc-theme", "dark");
    mount(qc);
    await endSession("user");
    expect(window.localStorage.getItem("bcc.blog.draft.a")).toBeNull();
    expect(window.localStorage.getItem("bcc-push-subscription-id")).toBeNull();
    expect(window.localStorage.getItem("bcc-theme")).toBe("dark");
  });
});

describe("the recovery control's pending state", () => {
  it("stays disabled while a submitted navigation is in flight", async () => {
    // `form.submit()` only INITIATES a navigation and returns
    // synchronously, so forceSignOutNavigation resolves on the next
    // microtask — long before the POST round-trips. Re-enabling on that
    // promise therefore fired on the success path too, and each further
    // click appends another form and re-submits, which in a browser
    // cancels and restarts the pending navigation.
    const submit = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement;
      if (tag === "form") {
        (el as HTMLFormElement).submit = submit as unknown as () => void;
      }
      return el;
    });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ csrfToken: "c" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));
    signOut.mockImplementation(async () => {
      throw new Error("502");
    });
    mount(qc);
    await endSession("user");
    const button = await waitFor(() =>
      screen.getByRole("button", { name: /finish signing out/i }),
    );
    fireEvent.click(button);

    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    // The navigation is under way; the control must not invite a click
    // that would restart it.
    expect(screen.getByRole("button", { name: /finishing/i })).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// A FAILED session fetch is not a sign-out
// ─────────────────────────────────────────────────────────────────────

describe("a session that reads as null without being gone", () => {
  // next-auth's fetchData returns null on ANY error — transport failure,
  // a 502, a rate-limited edge, a non-JSON body — and SessionProvider
  // then setSession(null), so `status` becomes "unauthenticated". That is
  // indistinguishable from a real cross-tab sign-out. And SessionProvider
  // keeps next-auth's default refetchOnWindowFocus (the `false` in
  // providers.tsx is on the QueryClient), so an ordinary tab refocus
  // during a blip reaches this path.
  //
  // Treating it as a departure destroyed the viewer's unpublished blog
  // draft irrecoverably (local-only, no server mirror), orphaned a live
  // server push row, and force-reloaded a session whose cookie was never
  // touched — so they came back signed in, minus the draft.
  //
  // Everywhere else this codebase refuses to end a session on an
  // unreadable answer: tryRefresh classifies 429/5xx/network as
  // indeterminate, and session-update says "a body we cannot read is
  // never a session-ending signal". This was the one place that did.

  function goNull(view: ReturnType<typeof mount>) {
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
  }

  it("does NOT purge when the session endpoint cannot be read", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html/>", { status: 502 })));
    window.localStorage.setItem("bcc.blog.draft.a", "half-written post");
    window.localStorage.setItem("bcc-push-subscription-id", "55");

    const view = mount(qc);
    goNull(view);

    await new Promise((r) => setTimeout(r, 50));
    expect(window.localStorage.getItem("bcc.blog.draft.a")).toBe("half-written post");
    expect(window.localStorage.getItem("bcc-push-subscription-id")).toBe("55");
    expect(reload).not.toHaveBeenCalled();
  });

  it("does NOT purge when the session fetch throws", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    window.localStorage.setItem("bcc.blog.draft.a", "half-written post");

    const view = mount(qc);
    goNull(view);

    await new Promise((r) => setTimeout(r, 50));
    expect(window.localStorage.getItem("bcc.blog.draft.a")).toBe("half-written post");
    expect(reload).not.toHaveBeenCalled();
  });

  it("DOES purge when the endpoint confirms the session is gone", async () => {
    // next-auth answers a readable `200 {}` when there is no session
    // cookie. That is a verdict.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    window.localStorage.setItem("bcc.blog.draft.a", "half-written post");

    const view = mount(qc);
    seedViewerACache(qc);
    goNull(view);

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(window.localStorage.getItem("bcc.blog.draft.a")).toBeNull();
  });

  it("does not mistake the SAME viewer coming back for a new arrival", async () => {
    // After an inconclusive null the recorded viewer has to be put back.
    // Otherwise the next read of the SAME person looks like an arrival
    // (previous === null), and the arrival sweep deletes their recent
    // searches, tour position and onboarding progress — for a viewer who
    // never left, after nothing worse than a network blip.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html/>", { status: 502 })));
    window.localStorage.setItem("bcc-recent-searches", '["acme payroll"]');

    const view = mount(qc);
    goNull(view);
    await new Promise((r) => setTimeout(r, 50));

    // The session re-reads as the same person.
    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(tree(qc));
    await new Promise((r) => setTimeout(r, 50));

    expect(window.localStorage.getItem("bcc-recent-searches")).toBe('["acme payroll"]');
    expect(reload).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// A session change DURING the confirm must not be measured against null
// ─────────────────────────────────────────────────────────────────────

describe("a session change while the confirm is in flight", () => {
  /** A confirm that hangs until released. */
  function deferredConfirm() {
    let release: ((r: Response) => void) | undefined;
    const pending = new Promise<Response>((r) => {
      release = r;
    });
    vi.stubGlobal("fetch", vi.fn(() => pending));
    return {
      release: (body: string, status = 200) =>
        release?.(new Response(body, { status })),
    };
  }

  it("A → null → B still DEPARTS, instead of taking the arrival path", async () => {
    // Committing the unconfirmed null meant the next change was compared
    // against null, so B looked like an arrival: no gate close, no reload,
    // no epoch bump. A's SERVER-RENDERED output — their email in the
    // change-email form, their owner controls — stayed on screen for B,
    // which the bridge's own comment says only a document load can clear.
    // The cross-tab broadcast makes this a few-hundred-ms event, and the
    // confirm window is up to 3s on the wedged host it exists for.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });
    deferredConfirm();

    const view = mount(qc);
    seedViewerACache(qc);

    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await new Promise((r) => setTimeout(r, 10));

    // B arrives before the confirm settles.
    sessionState.data = { user: { id: "b" } };
    sessionState.status = "authenticated";
    view.rerender(tree(qc));

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("private")).toBeNull();
  });

  it("A → null → A does not run the arrival purge on a viewer who stayed", async () => {
    // Same window. `bcc-onboarding-progress` is local-only with no server
    // mirror, so the arrival sweep destroys it irrecoverably — for someone
    // who never left, after a network blip.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });
    const { release } = deferredConfirm();
    window.localStorage.setItem("bcc-recent-searches", '["acme payroll"]');
    window.localStorage.setItem("bcc-onboarding-progress", "step-3");

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await new Promise((r) => setTimeout(r, 10));

    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(tree(qc));
    await new Promise((r) => setTimeout(r, 10));

    release("<html/>", 502);
    await new Promise((r) => setTimeout(r, 20));

    expect(window.localStorage.getItem("bcc-recent-searches")).toBe('["acme payroll"]');
    expect(window.localStorage.getItem("bcc-onboarding-progress")).toBe("step-3");
    expect(reload).not.toHaveBeenCalled();
  });

  it("a stale confirm cannot depart after the viewer has moved on", async () => {
    // The confirm resolving "gone" must not act if the recorded viewer is
    // no longer the one it was launched for.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });
    const { release } = deferredConfirm();

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await new Promise((r) => setTimeout(r, 10));

    // B takes over and is handled on its own terms.
    sessionState.data = { user: { id: "b" } };
    sessionState.status = "authenticated";
    view.rerender(tree(qc));
    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });

    // The old confirm now says A was gone. It must not fire a second one.
    release("{}", 200);
    await new Promise((r) => setTimeout(r, 20));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("an inconclusive confirm is retried, not abandoned", () => {
  it("departs once a later attempt confirms the session is gone", async () => {
    // next-auth never sets `loading` back to true on a refetch, so once
    // the session reads null neither effect dep changes again — the effect
    // never re-runs and nothing would attempt a second confirm. And there
    // is no backstop: after a real sign-out `getSession()` is null, so
    // bccFetchAsClient sends anonymously and client.ts deliberately
    // refuses to end a session on an anonymous 401. One failed confirm
    // therefore left the previous viewer's server-rendered content on
    // screen for the life of the document.
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });
    const fetchMock = vi.fn(async () => new Response("<html/>", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(reload).not.toHaveBeenCalled();

    // The endpoint recovers.
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12_000);
    });
    expect(reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("stops ASKING once the session reads as present again", async () => {
    // A blip that resolves: the retries must stop. Asserting on the fetch
    // count, not on reload — if a confirm genuinely reads "no cookie",
    // departing is correct even if useSession later reports a user, since
    // that client state would be the stale one. What must not happen is
    // asking again about a session that has come back.
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });
    const fetchMock = vi.fn(async () => new Response("<html/>", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    const afterFirst = fetchMock.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    // The session comes back.
    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(tree(qc));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(fetchMock.mock.calls.length).toBe(afterFirst);
    expect(reload).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("entries seeded from initialData", () => {
  it("are invalidated, not removed — removing makes them FRESH again", async () => {
    // query-core's getDefaultState sets dataUpdatedAt to Date.now() when
    // initialData is present and no initialDataUpdatedAt is given, and
    // isInvalidated false. So a REBUILT entry is fresh for its whole
    // staleTime and will not refetch on mount — strictly worse than the
    // invalidated entry it replaced. useFeedItem passes initialData with
    // staleTime 60_000 and no initialDataUpdatedAt, and the SSR seed
    // carries the ANONYMOUS view-model.
    function Seeded() {
      const { data } = useQuery<{ who: string }>({
        queryKey: ["seeded", "x"],
        queryFn: async () => ({ who: "authed" }),
        initialData: { who: "anonymous" },
        staleTime: 60_000,
      });
      return <span data-testid="seeded">{data.who}</span>;
    }

    Object.defineProperty(window, "location", {
      value: { reload: vi.fn(), href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });

    sessionState.data = null;
    sessionState.status = "unauthenticated";
    const view = render(
      <QueryClientProvider client={qc}>
        <SessionBoundaryBridge />
        <Seeded />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("seeded")).toBeInTheDocument();
    });

    // The surface unmounts (navigation), leaving the entry inactive.
    view.rerender(
      <QueryClientProvider client={qc}>
        <SessionBoundaryBridge />
      </QueryClientProvider>,
    );

    // Sign in, in place.
    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(
      <QueryClientProvider client={qc}>
        <SessionBoundaryBridge />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(qc.getQueryState(["seeded", "x"])?.isInvalidated).toBe(true);
    });
    // Kept, so the invalidation survives to force a refetch on remount.
    expect(qc.getQueryData(["seeded", "x"])).toEqual({ who: "anonymous" });
  });
});

describe("overlapping confirms", () => {
  it("never runs two at once", async () => {
    // Defensive rather than hot: with the session reading null, neither
    // effect dep changes again (next-auth does not set `loading` back to
    // true on a refetch), so a second entry is hard to reach. The one
    // shape that does reach it is a status round-trip through "loading"
    // while the viewer stays null — and two concurrent confirms could
    // produce two departures, so the guard is worth keeping and worth
    // pinning.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, href: "http://localhost/", assign: vi.fn(), pathname: "/" },
      writable: true,
    });
    let release: ((r: Response) => void) | undefined;
    const pending = new Promise<Response>((r) => {
      release = r;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal("fetch", fetchMock);

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock.mock.calls.length).toBe(1);

    // Status round-trips while the viewer stays null.
    sessionState.status = "loading";
    view.rerender(tree(qc));
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await new Promise((r) => setTimeout(r, 10));

    // Still exactly one confirm in flight.
    expect(fetchMock.mock.calls.length).toBe(1);
    release?.(new Response("{}", { status: 200 }));
    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
  });
});

describe("giving up on the confirm", () => {
  it("does NOT force a re-read, because the only tool available is unsafe here", async () => {
    // `router.refresh()` would close the stale-render residuals, but Next
    // falls back to a HARD `location.replace` whenever the RSC response is
    // not a 200 flight response — fetch throws, non-200, or a build-id
    // mismatch (fetch-server-response.js: "If the fetch was not 200, we
    // also handle it like a mpa navigation").
    //
    // And this path is reached precisely when the same Next origin failed
    // three session reads. /api/auth/session is served by Next and in
    // steady state touches no backend, so an unreadable read means the
    // origin or the connectivity is broken — exactly what makes the RSC
    // fetch fail. The refresh would therefore be safe only when it was
    // unnecessary, and a hard reload — destroying the unpublished draft
    // this file's retry loop exists to protect — exactly when it was not.
    vi.useFakeTimers();
    const reload = vi.fn();
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, assign, href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html/>", { status: 502 })));
    window.localStorage.setItem("bcc.blog.draft.a", "half-written post");

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(routerRefresh).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("bcc.blog.draft.a")).toBe("half-written post");
    vi.useRealTimers();
  });

  it("re-arms when the browser comes back ONLINE, and then departs", async () => {
    // Inert is not the same as abandoned. Instead of acting on no
    // evidence, wait for a signal that the conditions changed and ask
    // again — then the ordinary confirmed-departure path handles it.
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, assign: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    const fetchMock = vi.fn(async () => new Response("<html/>", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(reload).not.toHaveBeenCalled();

    // Connectivity returns and the endpoint is readable.
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("re-arms on a tab refocus too", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, assign: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    const fetchMock = vi.fn(async () => new Response("<html/>", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(reload).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not re-arm once the session reads present again", async () => {
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, assign: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    const fetchMock = vi.fn(async () => new Response("<html/>", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(tree(qc));
    const before = fetchMock.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fetchMock.mock.calls.length).toBe(before);
    expect(reload).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("stops listening once unmounted", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "location", {
      value: { reload: vi.fn(), assign: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    const fetchMock = vi.fn(async () => new Response("<html/>", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    view.unmount();
    const before = fetchMock.mock.calls.length;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(fetchMock.mock.calls.length).toBe(before);
    vi.useRealTimers();
  });
});

describe("the re-arm respects a teardown already in flight", () => {
  it("does not re-confirm while this tab is signing out", async () => {
    // A teardown owns the navigation. Re-confirming underneath it could
    // reach depart() → purgeViewerState + reload and race the sign-out's
    // own navigation, potentially dropping the notice slug it carries.
    //
    // NOTE: this documents intent but does NOT pin the `isEndingSession()`
    // clause — the test still passes with that clause removed, so
    // something earlier in this harness already prevents the re-confirm
    // and I could not isolate it. The clause is kept as cheap defence
    // against a real race, and deliberately has no mutation control
    // claiming otherwise.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, assign: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    const fetchMock = vi.fn(async () => new Response("<html/>", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    // Let all three attempts fail so the re-arm is registered.
    await new Promise((r) => setTimeout(r, 30));
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    vi.useRealTimers();

    // A teardown starts and does not settle.
    signOut.mockImplementation(() => new Promise<undefined>(() => {}));
    void endSession("user");
    await waitFor(() => {
      expect(isEndingSession()).toBe(true);
    });

    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await new Promise((r) => setTimeout(r, 30));
    });


    // No confirming read, and no reload racing the sign-out.
    expect(
      fetchMock.mock.calls.filter((c: unknown[]) =>
        String(c[0] ?? "").includes("/api/auth/session"),
      ),
    ).toHaveLength(0);
    expect(reload).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// A readable session body is EVIDENCE, not another unreadable answer
// ─────────────────────────────────────────────────────────────────────

describe("what a readable session body settles", () => {
  it("stops asking once the endpoint reports a LIVE session", async () => {
    // `askOnce` returned true only for `{}` and false for everything
    // else, so "the origin answered and the session is alive" went into
    // the same bucket as "unreadable". Nothing consumed that evidence, so
    // the loop exhausted and re-armed — and next-auth's _getSession
    // early-returns while its cached session is null, so useSession can
    // never recover on its own and neither effect dep can change again.
    // The result was a permanent, focus-keyed poll against a session the
    // bridge had already read and knew was fine.
    vi.useFakeTimers();
    Object.defineProperty(window, "location", {
      value: { reload: vi.fn(), assign: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    const fetchMock = vi.fn(async () => new Response("<html/>", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    // The origin recovers; the cookie is intact, so it answers with a
    // real session.
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ user: { id: "a" }, expires: "2099-01-01" }), {
        status: 200,
      }),
    );
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(100);
    });
    const afterRecovery = fetchMock.mock.calls.length;

    // Settled: no further asking on later signals.
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("online"));
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(fetchMock.mock.calls.length).toBe(afterRecovery);
    vi.useRealTimers();
  });

  it("DEPARTS when the readable body names a different viewer", async () => {
    // The same missing distinction threw away a verdict it had just read.
    // Today the cross-tab broadcast usually covers A to B; this makes the
    // bridge able to act on its own evidence.
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, assign: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: "b" }, expires: "2099-01-01" }), {
        status: 200,
      }),
    ));

    const view = mount(qc);
    seedViewerACache(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));

    await waitFor(() => {
      expect(reload).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId("private")).toBeNull();
  });

  it("keeps treating an unreadable answer as no evidence", async () => {
    // Guard against over-reaching: a 502 must still not settle anything.
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, assign: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html/>", { status: 502 })));
    window.localStorage.setItem("bcc.blog.draft.a", "half-written post");

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(reload).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("bcc.blog.draft.a")).toBe("half-written post");
    vi.useRealTimers();
  });
});

describe("the confirm loop respects a teardown mid-flight", () => {
  it("does not depart underneath a running teardown", async () => {
    // retry() checks isEndingSession() before starting, but the loop then
    // runs for up to ~16s — and a user-initiated focus can now start it at
    // an arbitrary moment. A departure underneath a teardown reloads the
    // current URL, discarding the callbackUrl and notice slug it carries.
    //
    // Fake timers are essential: the later attempts are 5s apart, so a
    // test that waits milliseconds never reaches the branch under test.
    // An earlier version of this test did exactly that and passed
    // regardless — a mutation control caught it.
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, assign: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    let answer = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      answer += 1;
      // Attempt 0 unreadable; every later one says "gone".
      return answer === 1
        ? new Response("<html/>", { status: 502 })
        : new Response("{}", { status: 200 });
    }));

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    // A teardown starts: signOut hangs, so it stays in flight until its
    // own 6s budget expires.
    signOut.mockImplementation(() => new Promise<undefined>(() => {}));
    void endSession("user", { callbackUrl: "/login", notice: "signed-out" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(isEndingSession()).toBe(true);

    // Advance past the loop's next attempt (5s) but not past signOut's
    // 6s budget, so the teardown is provably still running when the
    // confirm reads "gone".
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_200);
    });
    expect(isEndingSession()).toBe(true);
    expect(reload).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("an unmounted bridge stops working entirely", () => {
  it("does not read or reload after unmount, even mid-confirm", async () => {
    // The unmount cleanup removes the listeners that exist at that moment,
    // but cannot abort an in-flight confirm — which would otherwise finish,
    // re-arm, and let a later event reach purgeViewerState and a reload
    // from an unmounted instance's frozen refs. Harmless in production
    // (Providers lives in the root layout and the bridge sits outside the
    // gate), live in dev Fast Refresh and in tests.
    //
    // Fake timers again: the next attempt is 5s out.
    vi.useFakeTimers();
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      value: { reload, assign: vi.fn(), href: "http://localhost/", pathname: "/" },
      writable: true,
    });
    const fetchMock = vi.fn(async () => new Response("<html/>", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    const view = mount(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    view.rerender(tree(qc));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    view.unmount();
    const before = fetchMock.mock.calls.length;
    // From here the endpoint would say "gone" if anything asked.
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("focus"));
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(fetchMock.mock.calls.length).toBe(before);
    expect(reload).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
