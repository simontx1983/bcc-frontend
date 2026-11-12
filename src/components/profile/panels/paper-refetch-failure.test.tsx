/**
 * A failed REFRESH must not erase a loaded panel.
 *
 * Six read surfaces branched on the blanket `isError`, which TanStack also
 * sets when a refetch fails while the last success is still in `data`.
 * Each can refetch with rows on screen: GroupsPanel's join/leave, the
 * stance panel's join/stance writes and DisputeDetail's ballot cast/
 * withdraw all invalidate the very query the surface reads, and every read
 * has a finite `staleTime`, so a tab revisit refetches on mount. One failure
 * replaced the rows — on DisputeDetail, the case file and its ballot
 * mid-vote — with an error.
 *
 * The rule (the #183 split, see ActivityPanel):
 *   isLoadingError                     → full failure state
 *   isRefetchError (transient)         → keep the rows, inline notice
 *   isRefetchError (permission denial) → full failure state; the server's
 *                                        latest answer is "no"
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const refetch = {
  myDisputes: vi.fn(),
  userDisputes: vi.fn(),
  userGroups: vi.fn(),
  userReviews: vi.fn(),
  stancePanel: vi.fn(),
};
type Key = keyof typeof refetch;

const state = vi.hoisted(() => ({
  results: {} as Partial<Record<Key, unknown>>,
}));

const RAW = "raw server text that must never render";

/** The flags TanStack sets for each branch of a plain useQuery. */
function result(key: Key, branch: "first" | "refetch", data: unknown, code = "bcc_unavailable") {
  return {
    isPending: false,
    isLoading: false,
    isSuccess: false,
    isError: true,
    isLoadingError: branch === "first",
    isRefetchError: branch === "refetch",
    error: new BccApiError(code, RAW, 503, null),
    data: branch === "first" ? undefined : data,
    refetch: refetch[key],
  };
}

const idleMutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/hooks/useDisputes", () => ({
  useMyDisputes: () => state.results.myDisputes,
  useDisputeVote: () => ({ data: undefined, isPending: false, isError: false }),
  useCastDisputeVote: () => idleMutation,
  useWithdrawDisputeVote: () => idleMutation,
}));
vi.mock("@/hooks/useUserActivity", () => ({
  USER_DISPUTES_QUERY_KEY_ROOT: ["user", "disputes"],
  USER_GROUPS_QUERY_KEY_ROOT: ["user", "groups"],
  useUserDisputes: () => state.results.userDisputes,
  useUserGroups: () => state.results.userGroups,
  useUserReviews: () => state.results.userReviews,
}));
vi.mock("@/hooks/useCollectionStances", () => ({
  useCollectionStancePanel: () => state.results.stancePanel,
  useSetCollectionStance: () => idleMutation,
  useClearCollectionStance: () => idleMutation,
}));
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import { DisputeDetail } from "@/components/disputes/DisputeDetail";
import { MyDisputesList } from "@/components/disputes/MyDisputesList";
import { CollectionStancePanel } from "@/components/onchain/CollectionStancePanel";
import { DisputesPanel } from "@/components/profile/panels/DisputesPanel";
import { GroupsPanel } from "@/components/profile/panels/GroupsPanel";
import { ReviewsPanel } from "@/components/profile/panels/ReviewsPanel";

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
  for (const spy of Object.values(refetch)) spy.mockClear();
  state.results = {};
});

afterEach(cleanup);

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// ── loaded payloads ───────────────────────────────────────────────────

const DISPUTE = {
  id: 41,
  vote_id: 7,
  page_id: 3,
  page_title: "Forge Validator",
  voter_name: "Spark",
  reporter_name: "Ada",
  reason: "The downvote cites a slash that never happened.",
  evidence_url: "",
  status: "reviewing",
  created_at: "2026-10-01T00:00:00Z",
  resolved_at: null,
};
const GROUP = {
  group_id: 5,
  slug: "boilermakers",
  name: "Boilermakers Hall",
  type: "hall",
  type_label: "HALL",
  member_count: 12,
  privacy: "open",
  verification: null,
  actions: {},
  permissions: {},
};
const REVIEW = {
  id: 2,
  grade: "A",
  subject: "Forge Validator",
  subject_handle: "forge",
  text: "Steady uptime.",
  scope_label: "VALIDATOR",
  posted_at_label: "2D AGO",
};
const MEMBER_DISPUTE = {
  id: 8,
  status: "open",
  status_label: "OPEN",
  subject: "Disputed downvote on Anvil",
  body: "Evidence attached.",
  scope_label: "VALIDATOR",
  posted_at_label: "1D AGO",
};
const STANCE_ITEM = {
  chain_id: 1,
  chain_slug: "ethereum",
  contract_address: "0xabc",
  name: "Rivet Pass",
  image_url: null,
  collection_verified: true,
  state: "waitlist",
  group_id: null,
  waitlist_count: 3,
  viewer_stance: null,
};

interface Case {
  name: string;
  key: Key;
  data: unknown;
  ui: () => React.ReactElement;
  /** Something only the LOADED surface renders. */
  content: () => HTMLElement | null;
  /** Whether this surface's failure offers a Retry. */
  retries: boolean;
}

const CASES: Case[] = [
  {
    name: "MyDisputesList",
    key: "myDisputes",
    data: [DISPUTE],
    ui: () => <MyDisputesList />,
    content: () => screen.queryByText("Forge Validator"),
    retries: true,
  },
  {
    name: "DisputeDetail",
    key: "myDisputes",
    data: [DISPUTE],
    ui: () => <DisputeDetail id={41} />,
    content: () => screen.queryByText(/slash that never happened/),
    retries: true,
  },
  {
    name: "DisputesPanel",
    key: "userDisputes",
    data: { hidden: false, items: [MEMBER_DISPUTE] },
    ui: () => <DisputesPanel handle="ada" />,
    content: () => screen.queryByText("Disputed downvote on Anvil"),
    retries: true,
  },
  {
    name: "GroupsPanel",
    key: "userGroups",
    data: { hidden: false, items: [GROUP] },
    ui: () => <GroupsPanel handle="ada" />,
    content: () => screen.queryByText("Boilermakers Hall"),
    retries: true,
  },
  {
    name: "ReviewsPanel",
    key: "userReviews",
    data: { hidden: false, items: [REVIEW] },
    ui: () => <ReviewsPanel handle="ada" />,
    content: () => screen.queryByText("Forge Validator"),
    retries: true,
  },
  {
    // This panel's failure line has never carried a Retry; the split
    // does not add one — it only stops the line erasing the rows.
    name: "CollectionStancePanel",
    key: "stancePanel",
    data: { items: [STANCE_ITEM], holdings_status: "complete" },
    ui: () => <CollectionStancePanel />,
    content: () => screen.queryByText("Rivet Pass"),
    retries: false,
  },
];

for (const c of CASES) {
  describe(`${c.name} — failed refresh`, () => {
    it("keeps the loaded rows on screen when a REFRESH fails", () => {
      state.results[c.key] = result(c.key, "refetch", c.data);
      wrap(c.ui());
      expect(c.content()).not.toBeNull();
    });

    it("says so inline, never with the raw server text", () => {
      state.results[c.key] = result(c.key, "refetch", c.data);
      wrap(c.ui());
      const alert = screen.getByRole("alert");
      expect(alert.textContent ?? "").not.toContain(RAW);
      if (c.retries) {
        fireEvent.click(screen.getByRole("button", { name: /retry/i }));
        expect(refetch[c.key]).toHaveBeenCalledTimes(1);
      }
    });

    it("a FIRST-load failure still replaces the panel with the error state", () => {
      state.results[c.key] = result(c.key, "first", c.data);
      wrap(c.ui());
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(c.content()).toBeNull();
    });

    it("a REFUSED refresh is not kept: the server said no", () => {
      state.results[c.key] = result(c.key, "refetch", c.data, "bcc_forbidden");
      wrap(c.ui());
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(c.content()).toBeNull();
    });
  });
}

describe("a failed refresh does not assert an empty server", () => {
  it("ReviewsPanel withholds its empty state when the empty list may be stale", () => {
    state.results.userReviews = result("userReviews", "refetch", { hidden: false, items: [] });
    wrap(<ReviewsPanel handle="ada" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/no reviews/i)).toBeNull();
  });

  it("MyDisputesList withholds 'clean record' when the empty list may be stale", () => {
    state.results.myDisputes = result("myDisputes", "refetch", []);
    wrap(<MyDisputesList />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/clean record/i)).toBeNull();
  });
});
