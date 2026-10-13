/**
 * Viewer-scoped announcement caches — the supplementary guarantee.
 *
 * The gate/cancel/clear chain in `lib/auth/session-boundary` is the
 * primary protection and is unchanged: `PrivateRenderGate` unmounts the
 * private subtree first, and only then does the bridge `cancelQueries()`
 * and `clear()`. Scoped keys **supplement** that. What they add is a
 * guarantee that does not depend on teardown ordering at all — two
 * viewers never address the same cache entry in the first place.
 *
 * Scoped here because the response is viewer-dependent:
 *
 *   - the LIST, because `Announcement.capabilities` is optional and
 *     "attached for a viewer who may manage, absent for public readers";
 *   - the DETAIL, because `status` exposes the owner-only `draft`,
 *     `scheduled` and `blocked` states and the capability block is
 *     required there; and
 *   - the COMMENTS page, because `can_comment` is resolved per viewer.
 *
 * The rotator is deliberately NOT scoped — see
 * `announcement-session-boundary-scope.test.tsx`, which owns that case.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const sessionState = {
  data: null as { user?: { id?: string } } | null,
  status: "authenticated" as "loading" | "authenticated" | "unauthenticated",
};
vi.mock("next-auth/react", () => ({
  signOut: vi.fn(async () => undefined),
  useSession: () => ({ data: sessionState.data, status: sessionState.status }),
  getSession: async () => sessionState.data,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/lib/push/revoke", () => ({
  revokePushForSessionEnd: async () => "not-subscribed" as const,
  pushCleanupNeedsWarning: () => false,
  PUSH_SUBSCRIPTION_ID_KEY: "bcc-push-subscription-id",
  rememberPushSubscriptionId: vi.fn(),
}));

const listAnnouncements = vi.fn();
const setAnnouncementPin = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  listAnnouncements: (...a: unknown[]) => listAnnouncements(...a),
  setAnnouncementPin: (...a: unknown[]) => setAnnouncementPin(...a),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  getAnnouncementAsClient: vi.fn(),
  listAnnouncementComments: vi.fn(),
  createAnnouncementComment: vi.fn(),
  removeAnnouncementComment: vi.fn(),
}));

import { SessionBoundaryBridge } from "@/components/auth/SessionBoundaryBridge";
import {
  __resetSessionBoundaryForTests,
} from "@/lib/auth/session-boundary";
import { __resetSessionIdentityForTests } from "@/lib/auth/session-identity";
import { useViewerScope } from "@/hooks/useViewerScope";
import {
  announcementCommentsQueryKey,
  announcementDetailQueryKey,
  announcementsListQueryKey,
  useAnnouncements,
  useSetAnnouncementPin,
} from "@/hooks/useAnnouncements";
import { ANON_SCOPE } from "@/lib/auth/viewer-scope";
import {
  PUBLISHED_ANNOUNCEMENT,
  announcementListResponse,
} from "@/lib/announcements/fixtures";

const PAGE_ID = 1842;
const SCOPE_A = "viewer-a";
const SCOPE_B = "viewer-b";

/** A string that must never reach a second viewer. */
const OWNER_SECRET = "UNPUBLISHED-DRAFT-ONLY-THE-OPERATOR-MAY-SEE";

function seedOwnerCache(qc: QueryClient, scope: string) {
  // The list and comments are INFINITE queries, so a seeded value must be
  // InfiniteData — a bare page object makes `getNextPageParam` throw in
  // the observer's first `createResult`.
  qc.setQueryData(announcementsListQueryKey(PAGE_ID, "active", scope), {
    pages: [
      {
        items: [{ ...PUBLISHED_ANNOUNCEMENT, title: OWNER_SECRET }],
        pagination: { next_cursor: null, has_more: false },
      },
    ],
    pageParams: [null],
  });
  qc.setQueryData(announcementDetailQueryKey("ann_4471", scope), {
    ...PUBLISHED_ANNOUNCEMENT,
    body: OWNER_SECRET,
    status: "draft",
    capabilities: { can_edit: { allowed: true } },
  });
  qc.setQueryData(announcementCommentsQueryKey("ann_4471", scope), {
    pages: [
      {
        items: [],
        pagination: { next_cursor: null, has_more: false },
        capabilities: { can_comment: { allowed: true } },
      },
    ],
    pageParams: [null],
  });
}

/** Reads the list the way a real surface does, and reports its scope. */
function ScopeProbe() {
  const scope = useViewerScope();
  useAnnouncements(PAGE_ID, { state: "active" });
  return <span data-testid="probe-scope">{String(scope)}</span>;
}

function probeTree(qc: QueryClient, withBridge = false) {
  return (
    <QueryClientProvider client={qc}>
      {withBridge ? <SessionBoundaryBridge /> : null}
      <ScopeProbe />
    </QueryClientProvider>
  );
}

let qc: QueryClient;

beforeEach(() => {
  __resetSessionBoundaryForTests();
  // Module-level and NOT covered by the boundary reset. A viewer
  // established by an earlier test would otherwise linger and make
  // `unauthenticated` resolve to null rather than anon.
  __resetSessionIdentityForTests();
  vi.clearAllMocks();
  window.localStorage.clear();
  sessionState.data = { user: { id: SCOPE_A } };
  sessionState.status = "authenticated";
  listAnnouncements.mockResolvedValue(
    announcementListResponse([PUBLISHED_ANNOUNCEMENT]),
  );
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  __resetSessionBoundaryForTests();
  __resetSessionIdentityForTests();
  qc.clear();
});

describe("two viewers never address the same announcement entry", () => {
  it("files the same announcement under different keys per viewer", () => {
    expect(announcementDetailQueryKey("ann_4471", SCOPE_A)).not.toEqual(
      announcementDetailQueryKey("ann_4471", SCOPE_B),
    );
    expect(announcementsListQueryKey(PAGE_ID, "active", SCOPE_A)).not.toEqual(
      announcementsListQueryKey(PAGE_ID, "active", SCOPE_B),
    );
    expect(announcementCommentsQueryKey("ann_4471", SCOPE_A)).not.toEqual(
      announcementCommentsQueryKey("ann_4471", SCOPE_B),
    );
  });

  it("gives viewer B NOTHING when only A's scope is populated — same page, no document load", () => {
    seedOwnerCache(qc, SCOPE_A);

    // Not "B sees a stale A" — B sees nothing, because B's key was never
    // written. That is the account-switch case without a teardown.
    expect(
      qc.getQueryData(announcementDetailQueryKey("ann_4471", SCOPE_B)),
    ).toBeUndefined();
    expect(
      qc.getQueryData(announcementsListQueryKey(PAGE_ID, "active", SCOPE_B)),
    ).toBeUndefined();
    expect(
      qc.getQueryData(announcementCommentsQueryKey("ann_4471", SCOPE_B)),
    ).toBeUndefined();

    // Mutual, not a wipe of the previous viewer.
    expect(
      qc.getQueryData(announcementDetailQueryKey("ann_4471", SCOPE_A)),
    ).toBeDefined();
  });

  it("never aliases an UNAVAILABLE identity onto the anonymous namespace", () => {
    expect(announcementDetailQueryKey("ann_4471", null)).not.toEqual(
      announcementDetailQueryKey("ann_4471", ANON_SCOPE),
    );
    expect(announcementsListQueryKey(PAGE_ID, "active", null)).not.toEqual(
      announcementsListQueryKey(PAGE_ID, "active", ANON_SCOPE),
    );
  });

  it("lands an IN-FLIGHT response in the scope that ISSUED it", async () => {
    // A read issued as A resolves into A's key. Even once the viewer has
    // become B, B reads its own key and cannot be handed A's late
    // response. This is the cache half of the epoch backstop.
    let resolveA: (v: unknown) => void = () => {};
    const inFlight = new Promise((r) => {
      resolveA = r;
    });
    const keyA = announcementDetailQueryKey("ann_4471", SCOPE_A);
    const keyB = announcementDetailQueryKey("ann_4471", SCOPE_B);

    void qc.fetchQuery({ queryKey: keyA, queryFn: () => inFlight });
    expect(qc.getQueryData(keyB)).toBeUndefined();

    resolveA({ ...PUBLISHED_ANNOUNCEMENT, body: OWNER_SECRET, status: "draft" });
    await waitFor(() => expect(qc.getQueryData(keyA)).toBeDefined());

    expect(qc.getQueryData(keyB)).toBeUndefined();
  });
});

describe("an unavailable identity withholds the viewer-dependent read", () => {
  it("issues no list request, and writes nothing anonymous, while the scope is null", async () => {
    sessionState.status = "loading";
    sessionState.data = null;

    render(probeTree(qc));
    await new Promise((r) => setTimeout(r, 120));

    expect(screen.getByTestId("probe-scope").textContent).toBe("null");
    expect(listAnnouncements).not.toHaveBeenCalled();
    expect(
      qc.getQueryData(announcementsListQueryKey(PAGE_ID, "active", ANON_SCOPE)),
    ).toBeUndefined();
  });

  it("issues the list once identity resolves, under that viewer's own scope", async () => {
    render(probeTree(qc));
    await waitFor(() => expect(listAnnouncements).toHaveBeenCalled());

    expect(screen.getByTestId("probe-scope").textContent).toBe(SCOPE_A);
    await waitFor(() =>
      expect(
        qc.getQueryData(announcementsListQueryKey(PAGE_ID, "active", SCOPE_A)),
      ).toBeDefined(),
    );
    expect(
      qc.getQueryData(announcementsListQueryKey(PAGE_ID, "active", ANON_SCOPE)),
    ).toBeUndefined();
  });

  it("uses the anonymous scope only for a RESOLVED signed-out visitor", async () => {
    sessionState.status = "unauthenticated";
    sessionState.data = null;

    render(probeTree(qc));
    await waitFor(() => expect(listAnnouncements).toHaveBeenCalled());

    expect(screen.getByTestId("probe-scope").textContent).toBe(ANON_SCOPE);
  });

  it("does NOT fall back to anonymous once a viewer has been ESTABLISHED", async () => {
    // ⚠ The one that matters. next-auth reports `unauthenticated` for a
    // transport failure exactly as it does for a real sign-out. Once a
    // viewer has been seen in this document that report means UNKNOWN,
    // and the announcement reads must withhold rather than re-address
    // themselves to the shared anonymous namespace.
    const first = render(probeTree(qc, true));
    await waitFor(() => expect(first.container.textContent).toContain(SCOPE_A));
    listAnnouncements.mockClear();
    first.unmount();

    sessionState.status = "unauthenticated";
    sessionState.data = null;
    const second = render(probeTree(qc, true));
    await new Promise((r) => setTimeout(r, 120));

    expect(second.container.textContent).toBe("null");
    expect(listAnnouncements).not.toHaveBeenCalled();
    expect(
      qc.getQueryData(announcementsListQueryKey(PAGE_ID, "active", ANON_SCOPE)),
    ).toBeUndefined();
  });
});

describe("invalidation stays scope-blind", () => {
  it("invalidates EVERY viewer's view of a row when a real mutation runs", async () => {
    // ⚠ This must drive the production hook. Calling
    // `qc.invalidateQueries(root)` from the test instead would prove a
    // TanStack property rather than anything about this code — a mutation
    // that swapped the root for the acting viewer's scoped key survived
    // exactly that version of this test untouched.
    seedOwnerCache(qc, SCOPE_A);
    seedOwnerCache(qc, SCOPE_B);
    setAnnouncementPin.mockResolvedValue({
      ...PUBLISHED_ANNOUNCEMENT,
      is_pinned: true,
    });

    function Pinner() {
      const pin = useSetAnnouncementPin(PAGE_ID);
      return (
        <button
          data-testid="pin"
          onClick={() => pin.mutate({ announcementId: "ann_4471", pinned: true })}
        >
          pin
        </button>
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <Pinner />
      </QueryClientProvider>,
    );
    screen.getByTestId("pin").click();
    await waitFor(() => expect(setAnnouncementPin).toHaveBeenCalled());

    // A scoped invalidation would leave the OTHER viewer holding a
    // pre-pin row indefinitely.
    await waitFor(() => {
      for (const scope of [SCOPE_A, SCOPE_B]) {
        const entry = qc
          .getQueryCache()
          .find({ queryKey: announcementDetailQueryKey("ann_4471", scope) });
        expect(entry, `no entry for ${scope}`).toBeDefined();
        expect(entry!.state.isInvalidated, `${scope} not invalidated`).toBe(true);
      }
    });
  });
});
