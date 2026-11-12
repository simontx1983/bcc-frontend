/**
 * F-322 — the product tour shows ONCE per account, and comes back only
 * when the member asks ("Show me around").
 *
 * ## The defect
 *
 * The seen-set is local ∪ server. Sign-out sweeps the local layer
 * (`clearViewerStorage` lists `bcc-tour-seen`), so on the next sign-in
 * only the server knows the account finished the tour. Auto-start did not
 * wait for that answer: it read `hasSeen` while `GET /me/tours-seen` was
 * still in flight, got `false`, and started the tour — every sign-in.
 *
 * ## What is pinned
 *
 *   - signed back in, server says seen (answering late): no tour, before
 *     or after the answer lands;
 *   - a brand-new account (server says not seen): the tour DOES start, so
 *     the gate is not a blanket disable;
 *   - a failed server read: no tour (don't nag on uncertainty);
 *   - "Show me around": the tour starts even though it is seen.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const sessionState = {
  data: { user: { id: "9001" } } as { user?: { id?: string } } | null,
  status: "authenticated" as "loading" | "authenticated" | "unauthenticated",
};
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: sessionState.data, status: sessionState.status }),
  getSession: async () => sessionState.data,
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const getToursSeen = vi.fn();
const markTourSeen = vi.fn();
vi.mock("@/lib/api/tours-endpoints", () => ({
  getToursSeen: (...a: unknown[]) => getToursSeen(...a),
  markTourSeen: (...a: unknown[]) => markTourSeen(...a),
}));

const { TourProvider } = await import("@/components/tour/TourProvider");
const { TourAutoStart } = await import("@/components/tour/TourAutoStart");
const { requestTour, SHOW_ME_AROUND_TOUR } = await import("@/lib/tour/replay");
const { __resetSessionIdentityForTests } = await import("@/lib/auth/session-identity");
const { __resetViewerScopePurgeForTests } = await import("@/hooks/useViewerScope");

// The Floor tour's first step is a centered card with this title.
const TOUR_TITLE = "Welcome to the Floor.";

let qc: QueryClient;

function mountFloor() {
  return render(
    <QueryClientProvider client={qc}>
      <TourProvider>
        <TourAutoStart tourId="home-feed" />
      </TourProvider>
    </QueryClientProvider>,
  );
}

const settle = () => act(() => new Promise((r) => setTimeout(r, 120)));

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
  vi.clearAllMocks();
  __resetSessionIdentityForTests();
  __resetViewerScopePurgeForTests();
  // Signed back in after a sign-out: the sweep left the local layer empty.
  window.localStorage.clear();
  window.sessionStorage.clear();
  sessionState.status = "authenticated";
  sessionState.data = { user: { id: "9001" } };
  markTourSeen.mockResolvedValue({ seen: ["home-feed"] });
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  qc.clear();
});

describe("sign out → sign in", () => {
  it("does not show the tour while the server's seen-set is loading, nor after it says seen", async () => {
    let answer!: (v: { seen: string[] }) => void;
    getToursSeen.mockReturnValue(new Promise((r) => (answer = r)));

    mountFloor();
    await settle();
    expect(getToursSeen).toHaveBeenCalled();
    expect(screen.queryByText(TOUR_TITLE)).toBeNull();

    await act(async () => answer({ seen: ["home-feed"] }));
    await settle();
    expect(screen.queryByText(TOUR_TITLE)).toBeNull();
  });

  it("does not show the tour when the server read fails", async () => {
    getToursSeen.mockRejectedValue(new Error("network"));
    mountFloor();
    await settle();
    expect(screen.queryByText(TOUR_TITLE)).toBeNull();
  });
});

describe("control: a new account still gets the tour once", () => {
  it("shows the tour when the server says it has not been seen", async () => {
    getToursSeen.mockResolvedValue({ seen: [] });
    mountFloor();
    await waitFor(() => expect(screen.getByText(TOUR_TITLE)).toBeInTheDocument());
  });
});

describe("Show me around", () => {
  it("replays a tour the account has already seen", async () => {
    getToursSeen.mockResolvedValue({ seen: ["home-feed"] });
    mountFloor();
    await settle();
    expect(screen.queryByText(TOUR_TITLE)).toBeNull();

    act(() => requestTour(SHOW_ME_AROUND_TOUR));
    expect(await screen.findByText(TOUR_TITLE)).toBeInTheDocument();
  });

  it("ignores a request for a tour that doesn't exist", async () => {
    getToursSeen.mockResolvedValue({ seen: ["home-feed"] });
    mountFloor();
    await settle();
    act(() => requestTour("no-such-tour"));
    await settle();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
