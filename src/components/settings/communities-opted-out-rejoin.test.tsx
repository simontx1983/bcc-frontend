/**
 * F-158: an explicit Join overrides a SELF-LEAVE opt-out; a moderator
 * removal still refuses. So the "Opted out" bucket offers JOIN only on
 * rows the viewer left themselves (`opt_out_kind: "left"`). A
 * mod-removed row, or a row from an older backend with no
 * `opt_out_kind`, offers nothing: a Join there could only 403.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type HolderGroupItem } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const api = vi.hoisted(() => ({
  getMyHolderGroups: vi.fn(),
  joinHolderGroup: vi.fn(),
}));

vi.mock("@/lib/api/holder-groups-endpoints", () => ({
  getMyHolderGroups: () => api.getMyHolderGroups(),
  joinHolderGroup: (id: number) => api.joinHolderGroup(id),
  leaveHolderGroup: vi.fn(),
  getHolderGroupPreferences: async () => ({ auto_join: false }),
  updateHolderGroupPreferences: vi.fn(),
}));

const { CommunitiesList } = await import("@/components/settings/CommunitiesList");

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

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});

function withClient(ui: ReactNode) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const row = (id: number, name: string, extra: Partial<HolderGroupItem> = {}) =>
  ({
    group_id: id,
    slug: name.toLowerCase(),
    name,
    member_count: 5,
    collection: { chain: "ethereum", contract: "0xabc", name, image_url: null },
    verification: { label: "Verified" },
    activity: { heat: "warm", heat_label: "Warm", posts_last_7d: 1 },
    ...extra,
  }) as unknown as HolderGroupItem;

/** The opted-out section, found by its heading. */
async function optedOutSection() {
  const heading = await screen.findByRole("heading", { name: "Opted out" });
  const section = heading.closest("section") ?? heading.parentElement?.parentElement;
  if (!section) throw new Error("opted-out section not found");
  return section as HTMLElement;
}

describe("CommunitiesList — opted out (F-158)", () => {
  it("offers JOIN only on a self-left row; none on mod-removed or kind-less rows", async () => {
    api.getMyHolderGroups.mockResolvedValue({
      joined: [],
      eligible_to_join: [],
      opted_out: [
        row(1, "Left", { opt_out_kind: "left" }),
        row(2, "Removed", { opt_out_kind: "removed" }),
        row(3, "Legacy"),
      ],
    });
    withClient(<CommunitiesList />);

    const section = await optedOutSection();
    expect(within(section).getAllByRole("button", { name: "JOIN" })).toHaveLength(1);
  });

  it("JOIN on a self-left row sends the join for that group", async () => {
    api.getMyHolderGroups.mockResolvedValue({
      joined: [],
      eligible_to_join: [],
      opted_out: [row(9, "Left", { opt_out_kind: "left" })],
    });
    api.joinHolderGroup.mockResolvedValue({ ok: true });
    withClient(<CommunitiesList />);

    const section = await optedOutSection();
    fireEvent.click(within(section).getByRole("button", { name: "JOIN" }));
    await waitFor(() => expect(api.joinHolderGroup).toHaveBeenCalledWith(9));
  });

  it("a self-left non-holder sees the eligibility failure, not the raw server message", async () => {
    api.getMyHolderGroups.mockResolvedValue({
      joined: [],
      eligible_to_join: [],
      opted_out: [row(9, "Left", { opt_out_kind: "left" })],
    });
    api.joinHolderGroup.mockRejectedValue(
      new BccApiError("bcc_permission_denied", "RAW SERVER HINT", 403, null),
    );
    withClient(<CommunitiesList />);

    const section = await optedOutSection();
    fireEvent.click(within(section).getByRole("button", { name: "JOIN" }));
    expect(
      await within(section).findByText("You don't meet this community's join requirements yet."),
    ).toBeInTheDocument();
    expect(screen.queryByText("RAW SERVER HINT")).toBeNull();
  });

  it("the blurb says a self-leave can rejoin and a removal can't, with no 90-day lockout", async () => {
    api.getMyHolderGroups.mockResolvedValue({ joined: [], eligible_to_join: [], opted_out: [] });
    withClient(<CommunitiesList />);

    const section = await optedOutSection();
    const text = section.textContent ?? "";
    expect(text).toMatch(/you can rejoin any time while you hold the NFT/);
    expect(text).toMatch(/If a moderator removed you, you can't rejoin\./);
    expect(text).not.toMatch(/Cooldown clears in 90 days/);
  });
});
