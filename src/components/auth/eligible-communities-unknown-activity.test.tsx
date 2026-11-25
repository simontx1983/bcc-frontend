/**
 * "Communities you qualify for" with a community the server couldn't
 * count (its activity block is all null): the row sorts after the counted
 * one and shows no heat, no count and no stray separator. Never "Quiet"
 * or 0 for a number the server didn't send.
 *
 * Fixtures only: a mocked session and a mocked holder-groups response.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroupActivity, HolderGroupItem } from "@/lib/api/types";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "a" } }, status: "authenticated" }),
}));

// jsdom has no matchMedia; the Dialog's reduced-motion hook calls it.
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

const row = (id: number, name: string, activity: GroupActivity): HolderGroupItem => ({
  group_id: id,
  slug: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  member_count: 12,
  collection: { chain: "ethereum", contract: "0xabc", name, image_url: null },
  verification: { kind: "on_chain", label: "On-chain verified" },
  activity,
});

const eligible: HolderGroupItem[] = [
  row(1, "Ledger Club", { posts_last_7d: null, last_activity_at: null, heat: null, heat_label: null }),
  row(2, "Blacksmith Holders", { posts_last_7d: 9, last_activity_at: null, heat: "hot", heat_label: "Hot" }),
];

vi.mock("@/hooks/useHolderGroups", () => ({
  useMyHolderGroups: () => ({
    data: { joined: [], eligible_to_join: eligible },
    isLoading: false,
    error: null,
  }),
  useJoinHolderGroupMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }),
}));

import { EligibleCommunitiesModal } from "@/components/auth/EligibleCommunitiesModal";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("an uncounted community in the activation prompt", () => {
  it("sorts after the counted one and shows no heat, count or stray separator", () => {
    render(<EligibleCommunitiesModal />);

    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => within(li).getByText(/Ledger Club|Blacksmith Holders/).textContent)).toEqual([
      "Blacksmith Holders",
      "Ledger Club",
    ]);

    const [counted, unknown] = items as [HTMLElement, HTMLElement];
    expect(within(counted).getByText("Hot · 9/7d")).toBeInTheDocument();

    const unknownText = unknown.textContent ?? "";
    expect(unknownText).not.toMatch(/\/7d|Quiet|Hot|Warm/);
    expect(unknownText).toContain("12 members");
    // One dot between members and verification, not two around a gap.
    const dots = (li: HTMLElement) => li.querySelectorAll('span[aria-hidden="true"]').length;
    expect(dots(unknown)).toBe(dots(counted) - 1);
  });
});
