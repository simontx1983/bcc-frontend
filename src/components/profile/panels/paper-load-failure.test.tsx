/**
 * C2a — whole-panel read failures on fixed cream/ink paper.
 *
 * These five all render their failure inside `.bcc-paper` chrome, so they
 * take `LoadFailure surface="paper"`. Doctrine §5.3: the theme palette
 * measured 1.03:1 on paper in dark mode before Batch A, so passing the
 * default `surface="theme"` here would be the repo's most-repeated bug,
 * not a cosmetic slip. The surface prop is asserted per component.
 *
 * All five map only retryable codes (`bcc_unauthorized`,
 * `bcc_rate_limited`, `bcc_unavailable`) — no 403/404/400 reaches these
 * branches, so `isNonRetryableFixedReadFailure` is deliberately unused.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const refetch = {
  myDisputes: vi.fn(),
  userDisputes: vi.fn(),
  userGroups: vi.fn(),
  userReviews: vi.fn(),
  disputableVotes: vi.fn(),
};

const state = vi.hoisted(() => ({
  myDisputes: null as unknown,
  userDisputes: null as unknown,
  userGroups: null as unknown,
  userReviews: null as unknown,
  disputableVotes: null as unknown,
}));

const submitMutation = {
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  error: null,
};

vi.mock("@/hooks/useDisputes", () => ({
  useMyDisputes: () => state.myDisputes,
  useDisputableVotes: () => state.disputableVotes,
  useOpenDispute: () => submitMutation,
}));
vi.mock("@/hooks/useUserActivity", () => ({
  USER_DISPUTES_QUERY_KEY_ROOT: ["user", "disputes"],
  USER_GROUPS_QUERY_KEY_ROOT: ["user", "groups"],
  useUserDisputes: () => state.userDisputes,
  useUserGroups: () => state.userGroups,
  useUserReviews: () => state.userReviews,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
// GroupsPanel's row actions pull three more mutation-hook modules, each of
// which reaches the API client (and its required env vars) at import time.
// They are irrelevant to the failure branch but poison the import graph.
const idleMutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };
vi.mock("@/hooks/useHolderGroups", () => ({
  useJoinHolderGroupMutation: () => idleMutation,
  useLeaveHolderGroupMutation: () => idleMutation,
}));
vi.mock("@/hooks/useHallsPrimary", () => ({
  useJoinHallMutation: () => idleMutation,
  useLeaveHallMutation: () => idleMutation,
}));
vi.mock("@/hooks/useMyGroups", () => ({
  useJoinPlainGroupMutation: () => idleMutation,
  useLeavePlainGroupMutation: () => idleMutation,
}));

import { DisputeCallout } from "@/components/disputes/DisputeCallout";
import { MyDisputesList } from "@/components/disputes/MyDisputesList";
import { DisputesPanel } from "@/components/profile/panels/DisputesPanel";
import { GroupsPanel } from "@/components/profile/panels/GroupsPanel";
import { ReviewsPanel } from "@/components/profile/panels/ReviewsPanel";

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return document.body;
    },
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

beforeEach(() => {
  for (const spy of Object.values(refetch)) spy.mockClear();
  submitMutation.mutate.mockClear();
  submitMutation.mutateAsync.mockClear();
});

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

const RAW = "raw server text that must never render";
const failed = (code: string, key: keyof typeof refetch) => ({
  isError: true as const,
  isPending: false as const,
  isLoading: false as const,
  isSuccess: false as const,
  data: undefined,
  error: new BccApiError(code, RAW, 503, null),
  refetch: refetch[key],
});
const ok = (data: unknown, key: keyof typeof refetch) => ({
  isError: false as const,
  isPending: false as const,
  isLoading: false as const,
  isSuccess: true as const,
  data,
  error: null,
  refetch: refetch[key],
});

function wrap(ui: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// ── the four whole-panel components ───────────────────────────────────

interface PanelCase {
  name: string;
  key: keyof typeof refetch;
  ui: React.ReactElement;
  setFailed: (code: string) => void;
  setEmpty: () => void;
  message: RegExp;
  /** Bespoke empty state that must survive the migration. */
  emptyCopy: RegExp;
}

const PANELS: PanelCase[] = [
  {
    name: "MyDisputesList",
    key: "myDisputes",
    ui: <MyDisputesList />,
    setFailed: (c) => (state.myDisputes = failed(c, "myDisputes")),
    setEmpty: () => (state.myDisputes = ok([], "myDisputes")),
    message: /disputes are temporarily unavailable/i,
    emptyCopy: /clean record/i,
  },
  {
    name: "DisputesPanel",
    key: "userDisputes",
    ui: <DisputesPanel handle="ada" />,
    setFailed: (c) => (state.userDisputes = failed(c, "userDisputes")),
    setEmpty: () =>
      (state.userDisputes = ok({ hidden: false, items: [] }, "userDisputes")),
    message: /disputes are temporarily unavailable/i,
    emptyCopy: /no disputes opened/i,
  },
  {
    name: "GroupsPanel",
    key: "userGroups",
    ui: <GroupsPanel handle="ada" />,
    setFailed: (c) => (state.userGroups = failed(c, "userGroups")),
    setEmpty: () =>
      (state.userGroups = ok({ hidden: false, items: [] }, "userGroups")),
    message: /groups are temporarily unavailable/i,
    emptyCopy: /group/i,
  },
  {
    name: "ReviewsPanel",
    key: "userReviews",
    ui: <ReviewsPanel handle="ada" />,
    setFailed: (c) => (state.userReviews = failed(c, "userReviews")),
    setEmpty: () =>
      (state.userReviews = ok({ hidden: false, items: [] }, "userReviews")),
    message: /reviews are temporarily unavailable|couldn't load reviews/i,
    emptyCopy: /no reviews/i,
  },
];

for (const p of PANELS) {
  describe(`${p.name} — paper load failure`, () => {
    it("renders the shared failure state with a Retry", () => {
      p.setFailed("bcc_unavailable");
      wrap(p.ui);
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });

    it("uses the PAPER palette, not the theme palette", () => {
      p.setFailed("bcc_unavailable");
      wrap(p.ui);
      const alert = screen.getByRole("alert");
      expect(alert.className).toContain("text-ink-soft");
      expect(alert.className).not.toContain("--bcc-text");
    });

    it("preserves the existing error copy", () => {
      p.setFailed("bcc_unavailable");
      wrap(p.ui);
      expect(screen.getByRole("alert")).toHaveTextContent(p.message);
    });

    it("never renders the raw server message (§γ)", () => {
      p.setFailed("bcc_unavailable");
      wrap(p.ui);
      expect(screen.getByRole("alert")).not.toHaveTextContent(new RegExp(RAW, "i"));
    });

    it("Retry refetches its own query and no other", () => {
      p.setFailed("bcc_rate_limited");
      wrap(p.ui);
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));

      expect(refetch[p.key]).toHaveBeenCalledTimes(1);
      for (const [k, spy] of Object.entries(refetch)) {
        if (k !== p.key) expect(spy).not.toHaveBeenCalled();
      }
    });

    it("keeps its bespoke empty state on the success path", () => {
      p.setEmpty();
      wrap(p.ui);
      expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
      expect(document.body.textContent ?? "").toMatch(p.emptyCopy);
    });
  });
}

// ── OpenDisputeModal, driven through its public opener ────────────────

describe("OpenDisputeModal — retry inside a live Dialog", () => {
  async function openModal(code = "bcc_unavailable") {
    state.disputableVotes = failed(code, "disputableVotes");
    wrap(<DisputeCallout pageId={7} pageName="Acme Validator" canDispute />);
    fireEvent.click(screen.getByRole("button", { name: /open a dispute/i }));
    // the modal is next/dynamic — wait for the chunk
    return waitFor(() => screen.getByRole("dialog"));
  }

  it("renders the paper failure inside the open dialog", async () => {
    await openModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("alert").className).toContain("text-ink-soft");
  });

  it("Retry refetches ONLY votesQuery — no other query, no mutation", async () => {
    await openModal("bcc_rate_limited");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch.disputableVotes).toHaveBeenCalledTimes(1);
    for (const [k, spy] of Object.entries(refetch)) {
      if (k !== "disputableVotes") expect(spy).not.toHaveBeenCalled();
    }
    expect(submitMutation.mutate).not.toHaveBeenCalled();
    expect(submitMutation.mutateAsync).not.toHaveBeenCalled();
  });

  it("does not close or remount the Dialog", async () => {
    const dialog = await openModal();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    // same node identity — a remount would produce a different element
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("keeps focus containment and the scroll lock", async () => {
    await openModal();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("leaves the submit-side error region alone", async () => {
    await openModal();
    // The dispute form's own error is separate local state; while the
    // votes read is failing there is exactly one alert on screen.
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});
