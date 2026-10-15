/**
 * `GET /me/tours-seen` must not be issued for a viewer who cannot be
 * authorized to read it.
 *
 * ## The defect this pins
 *
 * `useToursSeen` lives in `TourProvider`, which is mounted on every page.
 * Its server query had no `enabled` gate, so an ANONYMOUS visitor issued
 * `GET /me/tours-seen` on every public page view — a Bearer-authed
 * endpoint that can only answer 401 for them. Measured against a recording
 * API stub before the fix: 1 such request on each of `/`, `/validators`,
 * `/communities`, `/members`, `/search`, `/u/[handle]`, which was 1 of the
 * 3–6 API requests those pages make.
 *
 * ## Why each control is here
 *
 * A test that only asserted "no request when anonymous" would pass just as
 * well against a hook that never fetched at all, which would silently drop
 * the cross-device seen-set for signed-in viewers. So the authenticated
 * case is asserted in the same file, and so is the product behaviour that
 * must survive for anonymous viewers: `hasSeen` still answers from
 * localStorage, because that is the layer tours actually depend on for a
 * visitor with no server record.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const sessionState = {
  data: null as { user?: { id?: string } } | null,
  status: "unauthenticated" as "loading" | "authenticated" | "unauthenticated",
};
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: sessionState.data, status: sessionState.status }),
  getSession: async () => sessionState.data,
  signOut: vi.fn(),
}));

const getToursSeen = vi.fn();
const markTourSeen = vi.fn();
vi.mock("@/lib/api/tours-endpoints", () => ({
  getToursSeen: (...a: unknown[]) => getToursSeen(...a),
  markTourSeen: (...a: unknown[]) => markTourSeen(...a),
}));

import { useToursSeen } from "@/hooks/useToursSeen";
import { __resetSessionIdentityForTests } from "@/lib/auth/session-identity";
import { __resetViewerScopePurgeForTests } from "@/hooks/useViewerScope";
import { scopedKey } from "@/lib/auth/viewer-scope";

function Probe({ tourId = "welcome" }: { tourId?: string }) {
  const { hasSeen } = useToursSeen();
  return <span data-testid="seen">{String(hasSeen(tourId))}</span>;
}

/**
 * ⚠ `globals` is not enabled in vitest.config.ts, so
 * @testing-library/react never registers its automatic afterEach cleanup
 * and mounted trees ACCUMULATE across cases in a file. A `screen` query
 * then finds the previous case's node — "found multiple elements" at best,
 * and an ordering-dependent assertion at worst. Every read below is
 * scoped to its own render's container.
 */
function mount(qc: QueryClient, tourId = "welcome") {
  const utils = render(
    <QueryClientProvider client={qc}>
      <Probe tourId={tourId} />
    </QueryClientProvider>,
  );
  return { ...utils, seen: () => within(utils.container).getByTestId("seen").textContent };
}

let qc: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  __resetSessionIdentityForTests();
  __resetViewerScopePurgeForTests();
  window.localStorage.clear();
  getToursSeen.mockResolvedValue({ seen: ["server-tour"] });
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  qc.clear();
  __resetSessionIdentityForTests();
});

describe("the defect: an anonymous visitor must issue no /me/tours-seen read", () => {
  it("fires NO request when the viewer is a resolved signed-out visitor", async () => {
    sessionState.status = "unauthenticated";
    sessionState.data = null;

    mount(qc);
    await new Promise((r) => setTimeout(r, 150));

    expect(getToursSeen).not.toHaveBeenCalled();
  });

  it("fires NO request when authenticated with NO usable viewer id", async () => {
    // `useViewerScope` returns null for authenticated-but-unidentifiable:
    // step 1 needs a non-empty string id, and with none it falls through
    // to "identity unavailable". Without the `scope !== null` half of the
    // gate the key would be ["me","tours-seen",null] — one shared
    // namespace for every such viewer. A session-status gate alone does
    // not catch this, which is why it is asserted separately.
    sessionState.status = "authenticated";
    sessionState.data = { user: {} };

    mount(qc);
    await new Promise((r) => setTimeout(r, 150));

    expect(getToursSeen).not.toHaveBeenCalled();
  });

  it("fires NO request while the session is still loading", async () => {
    sessionState.status = "loading";
    sessionState.data = null;

    mount(qc);
    await new Promise((r) => setTimeout(r, 150));

    expect(getToursSeen).not.toHaveBeenCalled();
  });
});

describe("controls — the gate must not be a blanket disable", () => {
  it("DOES fire for an authenticated viewer", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { id: "9001" } };

    mount(qc);
    await waitFor(() => expect(getToursSeen).toHaveBeenCalledTimes(1));
  });

  it("adopts the server's seen-set for an authenticated viewer", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { id: "9001" } };

    const v = mount(qc, "server-tour");

    // Proves the server layer is still wired, not merely that a request
    // left the building.
    await waitFor(() => expect(v.seen()).toBe("true"));
    v.unmount();
  });

  it("still answers hasSeen from localStorage for an ANONYMOUS visitor", async () => {
    // The product behaviour that must survive the gate: a visitor with no
    // server record still gets tour suppression from the local layer.
    // Without this control, a hook that fetched nothing AND read nothing
    // would pass every other case here.
    sessionState.status = "unauthenticated";
    sessionState.data = null;
    const key = scopedKey("bcc-tour-seen", "anon");
    window.localStorage.setItem(key!, JSON.stringify(["local-tour"]));

    const v = mount(qc, "local-tour");

    await waitFor(() => expect(v.seen()).toBe("true"));
    expect(getToursSeen).not.toHaveBeenCalled();
    v.unmount();
  });
});

describe("the server layer is viewer-scoped, like the local layer already was", () => {
  it("files two viewers' seen-sets under different cache keys", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { id: "9001" } };
    const first = mount(qc);
    await waitFor(() => expect(getToursSeen).toHaveBeenCalledTimes(1));
    first.unmount();

    const keys = qc
      .getQueryCache()
      .getAll()
      .map((q) => JSON.stringify(q.queryKey))
      .filter((k) => k.includes("tours-seen"));

    // The viewer id is part of the key, so viewer B cannot read A's entry.
    expect(keys.some((k) => k.includes('"9001"'))).toBe(true);
    // And the old scope-blind key is gone.
    expect(keys).not.toContain('["me","tours-seen"]');
  });

  it("does not serve viewer A's server set to viewer B", async () => {
    sessionState.status = "authenticated";
    sessionState.data = { user: { id: "9001" } };
    const a = mount(qc, "server-tour");
    await waitFor(() => expect(a.seen()).toBe("true"));
    a.unmount();

    // Viewer B arrives with an EMPTY server set. If the key were
    // scope-blind, B would read A's cached entry and see "true" before
    // their own read landed.
    getToursSeen.mockResolvedValue({ seen: [] });
    sessionState.data = { user: { id: "9002" } };
    const b = mount(qc, "server-tour");
    await waitFor(() => expect(getToursSeen).toHaveBeenCalledTimes(2));
    expect(b.seen()).toBe("false");
    b.unmount();
  });
});
