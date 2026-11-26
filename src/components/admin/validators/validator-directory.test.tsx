/**
 * Validator Directory (validator admin V1, PR A).
 *
 * Real component, real hook, real QueryClient — only the endpoint module
 * is mocked, so these pin what is actually SENT (chain / state / q /
 * cursor) as well as what renders:
 *   - chain tabs come from the `chains` facet, each with its total;
 *   - a tab switch refetches with `chain`, a state chip with `state`;
 *   - rows carry the state pill, the owner and the server's verification
 *     label; each title links to the page view; a Locked marker shows
 *     unless the server says `owner.locked_for_staff === false` (fail
 *     closed: a missing flag is locked);
 *   - Load more sends the server's cursor;
 *   - 403 → "Admin access required" (no Retry), 503 → Retry,
 *     404 rest_no_route → "not available yet"; 404 bcc_not_found → its own line.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
import type {
  AdminValidatorDirectoryChain,
  AdminValidatorDirectoryItem,
  AdminValidatorDirectoryResponse,
} from "@/lib/api/types";

// Avatar's media-host check reads the API origin.
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const getDir = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/admin-validator-endpoints", () => ({
  getAdminValidatorDirectory: (...a: unknown[]) => getDir(...a),
  getValidatorRelationshipHistory: vi.fn(),
  getValidatorRelationshipHealth: vi.fn(),
}));

import { ADMIN_ID_NOT_FOUND_COPY } from "@/components/admin/validators/AdminReadFailure";
import { ValidatorDirectory } from "@/components/admin/validators/ValidatorDirectory";

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
  getDir.mockReset();
});

afterEach(cleanup);

const RAW = "raw server text that must never render";

const CHAINS: AdminValidatorDirectoryChain[] = [
  {
    slug: "cosmoshub",
    name: "Cosmos Hub",
    wallet_claim_possible: true,
    counts: { unclaimed: 3, wallet_verified: 2, staff_verified: 1, conflict: 0 },
  },
  {
    slug: "osmosis",
    name: "Osmosis",
    wallet_claim_possible: false,
    counts: { unclaimed: 4, wallet_verified: 0, staff_verified: 2, conflict: 1 },
  },
];

function item(id: number, over: Partial<AdminValidatorDirectoryItem> = {}): AdminValidatorDirectoryItem {
  return {
    page_id: id,
    title: `Validator ${id}`,
    slug: `validator-${id}`,
    chain: { slug: "cosmoshub", name: "Cosmos Hub" },
    operator_addresses: [`cosmosvaloper1addr${id}`],
    state: "unclaimed",
    owner: null,
    uncovered_validator_count: 0,
    wallet_claim_possible: true,
    ...over,
  };
}

function page(
  items: AdminValidatorDirectoryItem[],
  more: { next_cursor: string | null; has_more: boolean } = { next_cursor: null, has_more: false },
): AdminValidatorDirectoryResponse {
  return { items, pagination: more, chains: CHAINS };
}

function renderDirectory() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ValidatorDirectory />
    </QueryClientProvider>,
  );
}

/** The params object of the Nth call (0-based). */
const paramsOf = (n: number) => getDir.mock.calls[n]?.[0] as Record<string, unknown>;
const lastParams = () => paramsOf(getDir.mock.calls.length - 1);

describe("Validator Directory — facet tabs and filters", () => {
  it("renders one tab per chain in the facet, plus All chains, each with its total", async () => {
    getDir.mockResolvedValue(page([item(1)]));
    renderDirectory();

    await screen.findByRole("heading", { name: "Validator 1" });
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["All chains13", "Cosmos Hub6", "Osmosis7"]);
    expect(screen.getByRole("tab", { name: /all chains/i })).toHaveAttribute("aria-selected", "true");
  });

  it("uses unique server totals for multi-chain pages while retaining each chain's facet", async () => {
    getDir.mockResolvedValue({
      ...page([item(1)]),
      total_counts: { unclaimed: 5, wallet_verified: 2, staff_verified: 2, conflict: 1 },
    });
    renderDirectory();
    await screen.findByRole("heading", { name: "Validator 1" });
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "All chains10", "Cosmos Hub6", "Osmosis7",
    ]);
    expect(screen.getByRole("button", { name: "ALL · 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "UNCLAIMED · 5" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /cosmos hub/i }));
    expect(await screen.findByRole("button", { name: "ALL · 6" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "UNCLAIMED · 3" })).toBeInTheDocument();
  });

  it("the first read sends no chain, no state and no q", async () => {
    getDir.mockResolvedValue(page([item(1)]));
    renderDirectory();
    await screen.findByRole("heading", { name: "Validator 1" });
    expect(paramsOf(0)).toEqual({ limit: 25 });
  });

  it("switching a chain tab refetches with `chain`", async () => {
    getDir.mockResolvedValue(page([item(1)]));
    renderDirectory();
    await screen.findByRole("heading", { name: "Validator 1" });

    getDir.mockResolvedValue(page([item(2, { chain: { slug: "osmosis", name: "Osmosis" } })]));
    fireEvent.click(screen.getByRole("tab", { name: /osmosis/i }));

    await screen.findByRole("heading", { name: "Validator 2" });
    expect(lastParams()).toEqual({ limit: 25, chain: "osmosis" });
    expect(screen.getByRole("tab", { name: /osmosis/i })).toHaveAttribute("aria-selected", "true");
    // The tabs stayed on screen through the new key's load.
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("state chips carry the facet counts and a chip refetches with `state`", async () => {
    getDir.mockResolvedValue(page([item(1)]));
    renderDirectory();
    await screen.findByRole("heading", { name: "Validator 1" });

    // All chains: the facet added up per state.
    expect(screen.getByRole("button", { name: "ALL · 13" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "UNCLAIMED · 7" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "WALLET VERIFIED · 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "VERIFIED BY BCC · 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONFLICT · 1" })).toBeInTheDocument();

    getDir.mockResolvedValue(page([item(3, { state: "conflict" })]));
    fireEvent.click(screen.getByRole("button", { name: "CONFLICT · 1" }));
    await screen.findByRole("heading", { name: "Validator 3" });
    expect(lastParams()).toEqual({ limit: 25, state: "conflict" });
  });

  it("the chips show the SELECTED chain's counts", async () => {
    getDir.mockResolvedValue(page([item(1)]));
    renderDirectory();
    await screen.findByRole("heading", { name: "Validator 1" });

    fireEvent.click(screen.getByRole("tab", { name: /cosmos hub/i }));
    expect(await screen.findByRole("button", { name: "ALL · 6" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "UNCLAIMED · 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "CONFLICT · 0" })).toBeInTheDocument();
  });

  it("the search box is debounced into `q`", async () => {
    getDir.mockResolvedValue(page([item(1)]));
    renderDirectory();
    await screen.findByRole("heading", { name: "Validator 1" });

    fireEvent.change(screen.getByLabelText("SEARCH"), { target: { value: "  ada  " } });
    await waitFor(() => expect(lastParams()).toEqual({ limit: 25, q: "ada" }));
  });
});

describe("Validator Directory — rows", () => {
  it("renders the state pill, the owner and the server's verification label", async () => {
    getDir.mockResolvedValue(
      page([
        item(1, {
          state: "wallet_verified",
          owner: {
            user: { user_id: 9, handle: "ada", display_name: "Ada Lovelace", avatar_url: null },
            verification: {
              kind: "wallet",
              method: "wallet",
              label: "Wallet Verified",
              verified_at: "2026-11-01T00:00:00Z",
            },
            locked_for_staff: true,
          },
        }),
        item(2, {
          state: "staff_verified",
          wallet_claim_possible: false,
          owner: {
            user: { user_id: 10, handle: "grace", display_name: "Grace Hopper", avatar_url: null },
            verification: {
              kind: "staff",
              method: "staff",
              label: "Staff Verified",
              verified_at: "2026-11-02T00:00:00Z",
            },
            locked_for_staff: false,
          },
        }),
        item(3, { state: "conflict" }),
        item(4, { state: "unclaimed", uncovered_validator_count: 2, operator_addresses: ["a1", "a2"] }),
      ]),
    );
    renderDirectory();

    const row = async (title: string) =>
      (await screen.findByRole("heading", { name: title })).closest("li") as HTMLElement;

    const r1 = await row("Validator 1");
    expect(within(r1).getByText("WALLET VERIFIED")).toBeInTheDocument();
    expect(within(r1).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(r1).getByText("@ada")).toBeInTheDocument();
    expect(within(r1).getByText("VIA WALLET VERIFIED")).toBeInTheDocument();
    expect(within(r1).getByText("cosmosvaloper1addr1")).toBeInTheDocument();
    expect(within(r1).getByText("Yes")).toBeInTheDocument();
    expect(within(r1).queryByText(/uncovered validators/i)).toBeNull();

    const r2 = await row("Validator 2");
    expect(within(r2).getByText("VERIFIED BY BCC")).toBeInTheDocument();
    expect(within(r2).getByText("Grace Hopper")).toBeInTheDocument();
    expect(within(r2).getByText("VIA STAFF VERIFIED")).toBeInTheDocument();
    expect(within(r2).getByText("No")).toBeInTheDocument();

    const r3 = await row("Validator 3");
    expect(within(r3).getByText("CONFLICT")).toBeInTheDocument();
    expect(within(r3).getByText("No owner")).toBeInTheDocument();

    const r4 = await row("Validator 4");
    expect(within(r4).getByText("UNCLAIMED")).toBeInTheDocument();
    expect(within(r4).getByText("Uncovered validators: 2")).toBeInTheDocument();
    expect(within(r4).getByText("OPERATOR ADDRESSES")).toBeInTheDocument();

  });

  it("each row's title links to its page view", async () => {
    getDir.mockResolvedValue(page([item(1), item(27)]));
    renderDirectory();

    const link = await screen.findByRole("link", { name: "Validator 27" });
    expect(link).toHaveAttribute("href", "/admin/validators/27");
    expect(screen.getByRole("heading", { name: "Validator 27" })).toContainElement(link);
    expect(screen.getByRole("link", { name: "Validator 1" })).toHaveAttribute(
      "href",
      "/admin/validators/1",
    );
  });

  it("a Locked marker shows unless the server says locked_for_staff === false (missing flag = locked)", async () => {
    const owner = (lock: Record<string, unknown>) => ({
      user: { user_id: 9, handle: "ada", display_name: "Ada Lovelace", avatar_url: null },
      verification: { kind: "node_key" as const, method: "solana_identity" as const, verified_at: "2026-11-01T00:00:00Z" },
      ...lock,
    });
    getDir.mockResolvedValue(
      page([
        item(1, { state: "wallet_verified", owner: owner({ locked_for_staff: true }) }),
        item(2, { state: "staff_verified", owner: owner({ locked_for_staff: false }) }),
        item(3, { state: "wallet_verified", owner: owner({}) }),
        item(4),
      ]),
    );
    renderDirectory();

    const row = async (title: string) =>
      (await screen.findByRole("heading", { name: title })).closest("li") as HTMLElement;
    expect(within(await row("Validator 1")).getByText("LOCKED")).toBeInTheDocument();
    expect(within(await row("Validator 2")).queryByText("LOCKED")).toBeNull();
    expect(within(await row("Validator 3")).getByText("LOCKED")).toBeInTheDocument();
    expect(within(await row("Validator 4")).queryByText("LOCKED")).toBeNull();
    // No server label: the labels.ts fallback for the method.
    expect(within(await row("Validator 1")).getByText("VIA NODE KEY PROOF")).toBeInTheDocument();
  });

  it("Load more requests the server's cursor and appends the next page", async () => {
    getDir.mockResolvedValueOnce(page([item(1)], { next_cursor: "cur-2", has_more: true }));
    renderDirectory();
    await screen.findByRole("heading", { name: "Validator 1" });

    getDir.mockResolvedValueOnce(page([item(2)], { next_cursor: null, has_more: false }));
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    await screen.findByRole("heading", { name: "Validator 2" });
    expect(paramsOf(1)).toEqual({ limit: 25, cursor: "cur-2" });
    expect(screen.getByRole("heading", { name: "Validator 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("an empty directory says so; an empty filtered view offers Clear filters", async () => {
    getDir.mockResolvedValue(page([]));
    renderDirectory();
    expect(await screen.findByText("No validator pages yet.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "UNCLAIMED · 7" }));
    expect(await screen.findByText("No validator pages match.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "CLEAR FILTERS" }));
    await screen.findByText("No validator pages yet.");
    expect(screen.getByRole("button", { name: "ALL · 13" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("tab", { name: /all chains/i })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Validator Directory — failed reads", () => {
  it.each(["bcc_forbidden", "rest_forbidden"])(
    "a 403 (%s) shows the Admin access required panel, with no Retry and no second request",
    async (code) => {
      getDir.mockRejectedValue(new BccApiError(code, RAW, 403, null));
      renderDirectory();

      expect(await screen.findByText(/admin access required/i)).toBeInTheDocument();
      expect(screen.getByText(/the validator directory is restricted to platform admins/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
      expect(screen.queryByText(RAW)).toBeNull();
      expect(getDir).toHaveBeenCalledTimes(1);
    },
  );

  it("a 503 shows a retryable failure, and Retry loads the directory", async () => {
    getDir.mockRejectedValue(new BccApiError("bcc_unavailable", RAW, 503, null));
    renderDirectory();

    const retry = await screen.findByRole("button", { name: /retry/i }, { timeout: 4000 });
    expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
    expect(screen.queryByText(RAW)).toBeNull();

    getDir.mockResolvedValue(page([item(1)]));
    fireEvent.click(retry);
    expect(await screen.findByRole("heading", { name: "Validator 1" })).toBeInTheDocument();
  });

  it("a 404 rest_no_route says the tool isn't on the server yet, with no Retry", async () => {
    getDir.mockRejectedValue(new BccApiError("rest_no_route", RAW, 404, null));
    renderDirectory();

    expect(await screen.findByText("This tool isn't available on the server yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(screen.queryByText(/admin access required/i)).toBeNull();
    expect(getDir).toHaveBeenCalledTimes(1);
  });

  it("a 404 bcc_not_found is NOT 'not available yet': it says no page or member matches", async () => {
    getDir.mockRejectedValue(new BccApiError("bcc_not_found", RAW, 404, null));
    renderDirectory();

    expect(await screen.findByText(ADMIN_ID_NOT_FOUND_COPY)).toBeInTheDocument();
    expect(screen.queryByText("This tool isn't available on the server yet.")).toBeNull();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(getDir).toHaveBeenCalledTimes(1);
  });
});
