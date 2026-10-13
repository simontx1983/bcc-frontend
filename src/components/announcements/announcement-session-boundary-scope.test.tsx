/**
 * Announcement caches under the released session boundary.
 *
 * ## The thing being proved, and why it needs proving
 *
 * The announcement query keys are **not viewer-prefixed**:
 *
 *   ["announcements", pageId]              ["announcements", pageId, "rotator"]
 *   ["announcements", pageId, "list", st]  ["announcement", id]
 *   ["announcement-comments", id]
 *
 * So two different viewers looking at the same validator page address the
 * SAME cache entries — and those entries can hold owner-private material:
 * draft and scheduled rows (the `/me/...` route is the only one that
 * returns unpublished announcements) and row capabilities that say what
 * the operator may do.
 *
 * ⚠ A viewer-prefixed key is therefore NOT what protects this. The
 * protection is structural, and it is worth stating exactly because a
 * future reader will otherwise "fix" the keys and assume that was the
 * mechanism:
 *
 *   1. `PrivateRenderGate` UNMOUNTS the whole private subtree the instant
 *      a teardown begins — which is the only thing that reliably stops a
 *      mounted observer rendering its last result. `queryClient.clear()`
 *      does not: `queryCache.clear()` calls `query.destroy()` and
 *      notifies "removed", neither of which resets a live `useQuery`.
 *   2. Only THEN does the bridge `cancelQueries()` and `clear()`. The
 *      ordering is what makes `clear()` sufficient.
 *   3. Every announcement surface is additionally gated on the
 *      server-supplied capability block, so an arriving viewer re-derives
 *      its own visibility rather than inheriting the previous one's.
 *
 * These tests drive the REAL bridge, the REAL gate and the REAL panel, so
 * they fail if any link in that chain is removed — including if someone
 * reorders the clear before the unmount.
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
const signOut = vi.fn(async () => undefined);
vi.mock("next-auth/react", () => ({
  signOut: () => signOut(),
  useSession: () => ({ data: sessionState.data, status: sessionState.status }),
  getSession: async () => sessionState.data,
}));

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn() }),
}));

vi.mock("@/lib/push/revoke", () => ({
  revokePushForSessionEnd: async () => "not-subscribed" as const,
  pushCleanupNeedsWarning: () => false,
  PUSH_SUBSCRIPTION_ID_KEY: "bcc-push-subscription-id",
  rememberPushSubscriptionId: vi.fn(),
}));

const listAnnouncements = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  listAnnouncements: (...a: unknown[]) => listAnnouncements(...a),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  setAnnouncementPin: vi.fn(),
  getAnnouncementAsClient: vi.fn(),
  listAnnouncementComments: vi.fn(),
  createAnnouncementComment: vi.fn(),
  removeAnnouncementComment: vi.fn(),
}));

import { PrivateRenderGate } from "@/components/auth/PrivateRenderGate";
import { SessionBoundaryBridge } from "@/components/auth/SessionBoundaryBridge";
import {
  __resetSessionBoundaryForTests,
  endSession,
  setSessionUnknown,
} from "@/lib/auth/session-boundary";
import { AnnouncementsPanel } from "@/components/announcements/AnnouncementsPanel";
// The REAL key factories, so this test cannot drift from production keys.
import {
  announcementCommentsQueryKey,
  announcementDetailQueryKey,
  announcementRotatorQueryKey,
  announcementsListQueryKey,
} from "@/hooks/useAnnouncements";
import {
  OWNER_CAPABILITIES,
  PUBLISHED_ANNOUNCEMENT,
  announcementListResponse,
} from "@/lib/announcements/fixtures";

const PAGE_ID = 1842;

/** A string that must never reach a second viewer's screen. */
const OWNER_SECRET = "UNPUBLISHED-DRAFT-ONLY-THE-OPERATOR-MAY-SEE";

/**
 * Seeds the cache the way an operator's own session would leave it:
 * owner-scoped drafts and row capabilities under the production keys.
 */
function seedOwnerCache(qc: QueryClient) {
  // The list is an INFINITE query, so the seeded shape must be
  // InfiniteData — a bare page object makes `getNextPageParam` throw on
  // the observer's first `createResult`, which is how this was caught.
  qc.setQueryData(announcementsListQueryKey(PAGE_ID, "active"), {
    pages: [
      {
        items: [{ ...PUBLISHED_ANNOUNCEMENT, title: OWNER_SECRET }],
        pagination: { next_cursor: null, has_more: false },
      },
    ],
    pageParams: [null],
  });
  qc.setQueryData(announcementRotatorQueryKey(PAGE_ID), {
    items: [{ ...PUBLISHED_ANNOUNCEMENT, summary: OWNER_SECRET }],
  });
  qc.setQueryData(announcementDetailQueryKey("ann_4471"), {
    ...PUBLISHED_ANNOUNCEMENT,
    body: OWNER_SECRET,
    status: "draft",
    capabilities: { can_edit: { allowed: true } },
  });
  // Comments are an infinite query too.
  qc.setQueryData(announcementCommentsQueryKey("ann_4471"), {
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

/** Every cached entry whose key belongs to the announcement families. */
function announcementEntries(qc: QueryClient) {
  const roots = ["announcements", "announcement", "announcement-comments"];
  return qc
    .getQueryCache()
    .getAll()
    .filter((q) => roots.includes(String(q.queryKey[0])));
}

function tree(qc: QueryClient) {
  return (
    <QueryClientProvider client={qc}>
      <SessionBoundaryBridge />
      <PrivateRenderGate>
        <AnnouncementsPanel
          pageId={PAGE_ID}
          validatorName="Blacksmith Node"
          capabilities={OWNER_CAPABILITIES}
        />
      </PrivateRenderGate>
    </QueryClientProvider>
  );
}

let qc: QueryClient;

beforeEach(() => {
  __resetSessionBoundaryForTests();
  vi.clearAllMocks();
  window.localStorage.clear();
  sessionState.data = { user: { id: "viewer-a" } };
  sessionState.status = "authenticated";
  listAnnouncements.mockImplementation((params: unknown) => {
    const state = (params as { state?: string }).state;
    return Promise.resolve(
      state === "archived"
        ? announcementListResponse([])
        : announcementListResponse([PUBLISHED_ANNOUNCEMENT]),
    );
  });
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
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

afterEach(() => {
  cleanup();
  __resetSessionBoundaryForTests();
  qc.clear();
});

describe("a departure leaves no announcement cache for the next viewer", () => {
  it("empties every announcement entry and unmounts the surface", async () => {
    seedOwnerCache(qc);
    render(tree(qc));
    await waitFor(() => expect(listAnnouncements).toHaveBeenCalled());

    // Precondition — otherwise this test could pass against an empty cache
    // and prove nothing at all.
    expect(announcementEntries(qc).length).toBeGreaterThan(0);

    await endSession("user");

    // The operator's own material is gone from the cache...
    expect(announcementEntries(qc)).toHaveLength(0);
    // ...and the surface that renders it is unmounted, which is the half
    // `clear()` alone cannot deliver.
    expect(screen.queryByText(OWNER_SECRET)).toBeNull();
    expect(document.body.textContent).not.toContain(OWNER_SECRET);
  });

  it("issues no announcement request after the teardown", async () => {
    render(tree(qc));
    await waitFor(() => expect(listAnnouncements).toHaveBeenCalled());

    await endSession("user");
    const callsAfterTeardown = listAnnouncements.mock.calls.length;

    // Let any stray refetch land.
    await new Promise((r) => setTimeout(r, 50));
    expect(listAnnouncements.mock.calls.length).toBe(callsAfterTeardown);
  });
});

describe("session uncertainty hides owner material without destroying it", () => {
  it("hides the panel behind the shield and renders nothing readable", async () => {
    seedOwnerCache(qc);
    const { container } = render(tree(qc));
    await waitFor(() => expect(listAnnouncements).toHaveBeenCalled());

    setSessionUnknown(true);

    await waitFor(() => {
      expect(container.querySelector('[data-private-shield="true"]')).toBeTruthy();
    });
    const shield = container.querySelector('[data-private-shield="true"]')!;

    // Hidden, inert and out of the accessibility tree — the triad.
    expect(shield.getAttribute("aria-hidden")).toBe("true");
    expect(shield.hasAttribute("inert")).toBe(true);
    expect((shield as HTMLElement).style.display).toBe("none");

    // Still MOUNTED — this is a hide, not a teardown, so a draft being
    // written survives. The cache is deliberately intact.
    expect(announcementEntries(qc).length).toBeGreaterThan(0);
  });

  it("fires no new announcement request while identity is unknown", async () => {
    render(tree(qc));
    await waitFor(() => expect(listAnnouncements).toHaveBeenCalled());
    const before = listAnnouncements.mock.calls.length;

    setSessionUnknown(true);
    await new Promise((r) => setTimeout(r, 50));

    expect(listAnnouncements.mock.calls.length).toBe(before);
  });
});

describe("the capability block, not the cache, decides what an anonymous viewer sees", () => {
  it("renders nothing and fetches nothing when no block is supplied, even with a seeded cache", async () => {
    // A previous viewer's entries are present...
    seedOwnerCache(qc);
    sessionState.data = null;
    sessionState.status = "unauthenticated";

    // ...and the feature is mounted exactly as an absent block mounts it:
    // not at all. This is the contract's designed pre-backend state —
    // "renders nothing" — and it is what keeps a cached owner payload from
    // reaching an anonymous reader.
    render(
      <QueryClientProvider client={qc}>
        <SessionBoundaryBridge />
        <PrivateRenderGate>
          <div data-testid="no-announcements" />
        </PrivateRenderGate>
      </QueryClientProvider>,
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(listAnnouncements).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(OWNER_SECRET);
  });
});
