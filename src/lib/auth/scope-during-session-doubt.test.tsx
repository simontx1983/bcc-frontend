/**
 * The storage scope while session identity is in doubt.
 *
 * Browser verification on 2026-10-02 found the hole these tests close.
 * next-auth's `fetchData` returns `null` on ANY error, so `useSession()`
 * reports `status: "unauthenticated"` for a blip — and
 * `resolveViewerScope("unauthenticated", null)` answers `ANON_SCOPE`. For
 * the whole confirm window (three attempts, ~16s) and indefinitely after a
 * give-up, a signed-in viewer's writes were therefore filed under
 * `…::anon`.
 *
 * That is not a lost preference. The anonymous scope is SHARED by every
 * anonymous visitor to the browser, and `useRecentSearches` reads it, so a
 * search term typed during a blip became readable by the next anonymous
 * person — the cross-account display defect viewer scoping exists to
 * remove, reintroduced by a transient read failure.
 *
 * Fixtures only: a mocked `useSession` plus the real bridge driving the
 * real identity record.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
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

import { SessionBoundaryBridge } from "@/components/auth/SessionBoundaryBridge";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { useViewerScope } from "@/hooks/useViewerScope";
import { __resetSessionBoundaryForTests } from "@/lib/auth/session-boundary";
import { __resetSessionIdentityForTests } from "@/lib/auth/session-identity";
import { ANON_SCOPE } from "@/lib/auth/viewer-scope";

function ScopeReadout() {
  const scope = useViewerScope();
  const { recent, push } = useRecentSearches();
  return (
    <div>
      <span data-testid="scope">{scope ?? "(unavailable)"}</span>
      <span data-testid="recents">{recent.join("|") || "(none)"}</span>
      <button
        type="button"
        data-testid="push"
        onClick={() => {
          push("acme payroll leak");
        }}
      >
        search
      </button>
    </div>
  );
}

let qc: QueryClient;

function tree() {
  return (
    <QueryClientProvider client={qc}>
      <SessionBoundaryBridge />
      <ScopeReadout />
    </QueryClientProvider>
  );
}

const scope = () => screen.getByTestId("scope").textContent;
const recents = () => screen.getByTestId("recents").textContent;
const storageKeys = () => Object.keys(window.localStorage).sort();

const unreadable = () => vi.fn(async () => new Response("<html/>", { status: 502 }));
const sessionFor = (id: string) =>
  new Response(JSON.stringify({ user: { id }, expires: "2099-01-01" }), {
    status: 200,
  });

function stubLocation() {
  const reload = vi.fn();
  Object.defineProperty(window, "location", {
    value: { reload, assign: vi.fn(), href: "http://localhost/", pathname: "/" },
    writable: true,
  });
  return { reload };
}

/** The blip: the session reads null, with every confirming read unreadable. */
async function blip(view: ReturnType<typeof render>) {
  sessionState.data = null;
  sessionState.status = "unauthenticated";
  view.rerender(tree());
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  __resetSessionBoundaryForTests();
  __resetSessionIdentityForTests();
  signOut.mockClear();
  window.localStorage.clear();
  window.sessionStorage.clear();
  sessionState.data = { user: { id: "a" } };
  sessionState.status = "authenticated";
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  cleanup();
  __resetSessionBoundaryForTests();
  __resetSessionIdentityForTests();
});

describe("unknown session — no anonymous reads or writes", () => {
  it("makes the scope UNAVAILABLE as soon as the session reads null, not after the give-up", async () => {
    // The window that mattered: `status` flips immediately, the confirm
    // takes ~16s, and the old resolver answered ANON for all of it.
    vi.useFakeTimers();
    stubLocation();
    vi.stubGlobal("fetch", unreadable());

    const view = render(tree());
    expect(scope()).toBe("a");
    await blip(view);

    expect(scope()).toBe("(unavailable)");
    expect(scope()).not.toBe(ANON_SCOPE);
  });

  it("still refuses the anonymous scope after the confirm gives up", async () => {
    vi.useFakeTimers();
    stubLocation();
    vi.stubGlobal("fetch", unreadable());

    const view = render(tree());
    await blip(view);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(scope()).toBe("(unavailable)");
  });

  it("writes nothing to the anonymous namespace while identity is in doubt", async () => {
    vi.useFakeTimers();
    stubLocation();
    vi.stubGlobal("fetch", unreadable());

    const view = render(tree());
    await blip(view);
    await act(async () => {
      screen.getByTestId("push").click();
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(storageKeys().filter((k) => k.includes("::anon"))).toEqual([]);
    expect(storageKeys().filter((k) => k.startsWith("bcc-recent-searches"))).toEqual([]);
  });

  it("does not READ the anonymous namespace either", async () => {
    // Another person's anonymous searches must not surface in a signed-in
    // viewer's dropdown because their session blipped.
    vi.useFakeTimers();
    stubLocation();
    vi.stubGlobal("fetch", unreadable());
    window.localStorage.setItem(
      `bcc-recent-searches::${ANON_SCOPE}`,
      '["someone else\'s search"]',
    );

    const view = render(tree());
    await blip(view);

    expect(recents()).not.toContain("someone else");
  });

  it("keeps the viewer's own loaded state rather than blanking it", async () => {
    // An unavailable scope is not a viewer change: reading "nobody's"
    // storage would empty the dropdown mid-session.
    vi.useFakeTimers();
    stubLocation();
    vi.stubGlobal("fetch", unreadable());
    window.localStorage.setItem("bcc-recent-searches::a", '["acme payroll"]');

    const view = render(tree());
    expect(recents()).toBe("acme payroll");
    await blip(view);

    expect(recents()).toBe("acme payroll");
    expect(window.localStorage.getItem("bcc-recent-searches::a")).toBe(
      '["acme payroll"]',
    );
  });
});

describe("same-viewer recovery — the scope returns immediately", () => {
  it("restores the viewer's scope from the confirm itself", async () => {
    // `useSession()` is still stuck at null here: next-auth's `_getSession`
    // early-returns while its cached session is null, so the scope must not
    // wait for a broadcast or another request to get the viewer back.
    vi.useFakeTimers();
    stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await blip(view);
    expect(scope()).toBe("(unavailable)");

    fetchMock.mockImplementation(async () => sessionFor("a"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(scope()).toBe("a");
    // Still unauthenticated as far as the session object is concerned —
    // which is exactly why the scope could not be derived from it.
    expect(sessionState.status).toBe("unauthenticated");
  });

  it("writes land in the viewer's own scope again, not anonymous", async () => {
    vi.useFakeTimers();
    stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await blip(view);
    fetchMock.mockImplementation(async () => sessionFor("a"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    await act(async () => {
      screen.getByTestId("push").click();
    });

    expect(window.localStorage.getItem("bcc-recent-searches::a")).toContain(
      "acme payroll leak",
    );
    expect(storageKeys().filter((k) => k.includes("::anon"))).toEqual([]);
  });

  it("leaves the scope unavailable when the live session cannot be named", async () => {
    // A readable body with no `user.id`: the session is alive, so the gate
    // reopens, but nothing has named a viewer — guessing anonymous here is
    // the same defect in a different coat.
    vi.useFakeTimers();
    stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await blip(view);
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ expires: "2099-01-01" }), { status: 200 }),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(scope()).toBe("(unavailable)");
  });
});

describe("a proof expires", () => {
  it("does not keep filing into the scope an EARLIER confirm proved", async () => {
    // First blip: the confirm proves viewer a, so the scope comes back.
    // Second blip: that proof is no longer current, and reusing it would
    // write into a's scope for a session nothing can currently read.
    vi.useFakeTimers();
    stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await blip(view);
    fetchMock.mockImplementation(async () => sessionFor("a"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(scope()).toBe("a");

    // The session comes back properly, then blips again.
    sessionState.data = { user: { id: "a" } };
    sessionState.status = "authenticated";
    view.rerender(tree());
    await act(async () => {
      await Promise.resolve();
    });
    fetchMock.mockImplementation(unreadable());
    await blip(view);

    expect(scope()).toBe("(unavailable)");
  });
});

describe("a second loss after a recovery, in one continuously focused tab", () => {
  /**
   * next-auth's cross-tab notice. On receiving it the library re-reads the
   * session — and then throws the answer away: `fetchData` maps a readable
   * `{}` to `null` exactly as it maps a 502
   * (`Object.keys(data).length > 0 ? data : null`), and assigning `null`
   * over an existing `null` is a no-op React bails out of. So in a tab
   * whose `useSession()` is already null, a real sign-out elsewhere
   * produces NO session event and NO dependency change. The broadcast is
   * the only notice this tab gets, which is why the bridge reads it.
   */
  function broadcast() {
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "nextauth.message",
        newValue: JSON.stringify({
          event: "session",
          data: { trigger: "getSession" },
        }),
      }),
    );
  }

  /** Blip → the confirm names viewer a → recovered, session object stuck. */
  async function recoverThenHold(
    view: ReturnType<typeof render>,
    fetchMock: ReturnType<typeof unreadable>,
  ) {
    await blip(view);
    // The origin comes back within the confirm's own attempts.
    fetchMock.mockImplementation(async () => sessionFor("a"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // Recovered on the bridge's own evidence; next-auth is still null, so
    // nothing but a signal can reveal a later loss.
    expect(scope()).toBe("a");
    expect(sessionState.status).toBe("unauthenticated");
  }

  it("departs when a broadcast reveals the session is now gone", async () => {
    // The case: one tab, never unfocused. The earlier proof must not keep
    // the gate open or the scope authenticated once a new loss is
    // observable.
    vi.useFakeTimers();
    const { reload } = stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("bcc-recent-searches::a", '["acme payroll"]');

    const view = render(tree());
    await recoverThenHold(view, fetchMock);

    // Another tab signs out. The cookie is gone, so the endpoint now
    // answers a readable {} — the proof of departure.
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await act(async () => {
      broadcast();
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(scope()).toBe(ANON_SCOPE);
    expect(window.localStorage.getItem("bcc-recent-searches::a")).toBeNull();
  });

  it("drops the stale proof while re-checking, without navigating", async () => {
    // A signal says something changed but the reads are unreadable again.
    // The scope must not stay authenticated on the old proof, and nothing
    // may navigate on no evidence.
    vi.useFakeTimers();
    const { reload } = stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.setItem("bcc-recent-searches::a", '["acme payroll"]');

    const view = render(tree());
    await recoverThenHold(view, fetchMock);

    fetchMock.mockImplementation(unreadable());
    await act(async () => {
      broadcast();
      await Promise.resolve();
    });

    // Immediately on the signal: the proof is gone, so storage is neither
    // read nor written under any scope.
    expect(scope()).toBe("(unavailable)");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(scope()).toBe("(unavailable)");
    expect(reload).not.toHaveBeenCalled();
    // Nothing was destroyed: the viewer's own keys are untouched.
    expect(window.localStorage.getItem("bcc-recent-searches::a")).toBe(
      '["acme payroll"]',
    );
  });

  it("recovers again when the re-check names the same viewer", async () => {
    vi.useFakeTimers();
    const { reload } = stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await recoverThenHold(view, fetchMock);

    await act(async () => {
      broadcast();
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(scope()).toBe("a");
    expect(reload).not.toHaveBeenCalled();
  });

  it("ignores storage events that are not next-auth's session notice", async () => {
    vi.useFakeTimers();
    stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await recoverThenHold(view, fetchMock);
    const reads = fetchMock.mock.calls.length;

    await act(async () => {
      // A plain preference write.
      window.dispatchEvent(
        new StorageEvent("storage", { key: "bcc-theme", newValue: "dark" }),
      );
      // ⚠ The one that matters: ANOTHER key carrying a payload shaped
      // exactly like next-auth's notice. Only the key distinguishes them,
      // and anything else on this origin may write JSON of any shape.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "some-other-app",
          newValue: JSON.stringify({ event: "session", data: { trigger: "x" } }),
        }),
      );
      // Malformed JSON under the right key.
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "nextauth.message",
          newValue: "not json",
        }),
      );
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(fetchMock.mock.calls.length).toBe(reads);
    expect(scope()).toBe("a");
  });
});

describe("confirmed sign-out — anonymous behaviour resumes", () => {
  it("takes the anonymous scope once a readable {} proves nobody is signed in", async () => {
    vi.useFakeTimers();
    const { reload } = stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await blip(view);
    fetchMock.mockImplementation(async () => new Response("{}", { status: 200 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(reload).toHaveBeenCalledTimes(1);
    expect(scope()).toBe(ANON_SCOPE);
  });

  it("an ordinary signed-out visitor is anonymous with no confirm at all", async () => {
    // No viewer was ever shown, so nothing is in doubt and the common case
    // keeps working: anonymous people get the anonymous scope.
    sessionState.data = null;
    sessionState.status = "unauthenticated";
    render(tree());
    expect(scope()).toBe(ANON_SCOPE);
  });
});

describe("a different viewer — no previous-viewer data", () => {
  it("switches the scope to the arriving viewer and purges the departing one's", async () => {
    stubLocation();
    window.localStorage.setItem("bcc-recent-searches::a", '["acme payroll"]');
    window.localStorage.setItem("bcc-recent-searches::b", '["theirs"]');

    const view = render(tree());
    sessionState.data = { user: { id: "b" } };
    view.rerender(tree());
    await act(async () => {
      await Promise.resolve();
    });

    expect(scope()).toBe("b");
    expect(window.localStorage.getItem("bcc-recent-searches::a")).toBeNull();
    expect(window.localStorage.getItem("bcc-recent-searches::b")).toBe('["theirs"]');
    expect(recents()).not.toContain("acme payroll");
  });

  it("does not adopt the previous viewer's scope when the confirm names someone else", async () => {
    vi.useFakeTimers();
    stubLocation();
    const fetchMock = unreadable();
    vi.stubGlobal("fetch", fetchMock);

    const view = render(tree());
    await blip(view);
    fetchMock.mockImplementation(async () => sessionFor("b"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(scope()).not.toBe("a");
  });
});
