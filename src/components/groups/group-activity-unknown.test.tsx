/**
 * An activity block the server couldn't count. Activity counts leave out
 * posts moderation has hidden; when the server can't read that list it
 * sends `posts_last_7d`, `heat`, `heat_label` and `last_activity_at` as
 * null instead of a guess. Null is "unknown":
 *   1. the shared heat sort puts unknown rows after every counted row,
 *      keeping the server's order among them;
 *   2. HeatBadge renders nothing: no number, no "Quiet", never 0;
 *   3. the About tab drops its Activity cell;
 *   4. the settings list drops the heat and its separator from the row,
 *      and sorts the row last.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { GroupActivity, GroupDetailResponse, HolderGroupItem } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const api = vi.hoisted(() => ({ getMyHolderGroups: vi.fn() }));
vi.mock("@/lib/api/holder-groups-endpoints", () => ({
  getMyHolderGroups: () => api.getMyHolderGroups(),
  joinHolderGroup: vi.fn(),
  leaveHolderGroup: vi.fn(),
  getHolderGroupPreferences: async () => ({ auto_join: false }),
  updateHolderGroupPreferences: vi.fn(),
}));

const { sortByHeat, hasHeat } = await import("@/components/groups/group-activity");
const { HeatBadge } = await import("@/components/groups/HeatBadge");
const { GroupAboutPanel } = await import("@/components/groups/GroupAboutPanel");
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

afterEach(cleanup);

const UNKNOWN: GroupActivity = { posts_last_7d: null, last_activity_at: null, heat: null, heat_label: null };
const known = (heat: "hot" | "warm" | "cold", posts: number | null): GroupActivity => ({
  posts_last_7d: posts,
  last_activity_at: null,
  heat,
  heat_label: heat === "hot" ? "Hot" : heat === "warm" ? "Warm" : "Quiet",
});

describe("1. the shared heat sort", () => {
  it("hot → warm → cold, posts desc; uncounted posts after counted; unknown heat last, in server order", () => {
    const rows = [
      { id: "unknown-a", activity: UNKNOWN },
      { id: "cold-5", activity: known("cold", 5) },
      { id: "hot-2", activity: known("hot", 2) },
      { id: "hot-unread", activity: known("hot", null) },
      // After hot-unread in server order: an uncounted total is not a 0.
      { id: "hot-0", activity: known("hot", 0) },
      { id: "warm-9", activity: known("warm", 9) },
      { id: "hot-7", activity: known("hot", 7) },
      { id: "unknown-b", activity: UNKNOWN },
    ];
    expect(sortByHeat(rows).map((r) => r.id)).toEqual([
      "hot-7",
      "hot-2",
      "hot-0",
      "hot-unread",
      "warm-9",
      "cold-5",
      "unknown-a",
      "unknown-b",
    ]);
  });

  it("does not reorder the caller's array", () => {
    const rows = [{ activity: UNKNOWN }, { activity: known("hot", 1) }];
    sortByHeat(rows);
    expect(rows[0]?.activity).toBe(UNKNOWN);
  });

  it("hasHeat is false for the unknown block and for an empty label", () => {
    expect(hasHeat(UNKNOWN)).toBe(false);
    expect(hasHeat({ ...known("warm", 3), heat_label: "" })).toBe(false);
    expect(hasHeat(known("warm", 3))).toBe(true);
  });
});

describe("2. HeatBadge", () => {
  it("renders nothing for an unknown block: no number, no label", () => {
    const { container } = render(<HeatBadge activity={UNKNOWN} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the server's label and count when it has them", () => {
    render(<HeatBadge activity={known("hot", 14)} />);
    expect(screen.getByText("Hot · 14/7d")).toBeInTheDocument();
  });

  it("a known heat with an uncounted post total shows the label alone", () => {
    const { container } = render(<HeatBadge activity={known("warm", null)} />);
    expect(container.textContent).toBe("Warm");
  });
});

const group = (activity: GroupActivity) =>
  ({
    name: "Night Shift",
    description: null,
    privacy: "open",
    trust_min: null,
    member_count: 12,
    activity,
    chain_tag: null,
    verification: null,
  }) as unknown as GroupDetailResponse;

describe("3. the About tab", () => {
  it("drops the Activity cell when the server couldn't count", () => {
    render(<GroupAboutPanel group={group(UNKNOWN)} />);
    expect(screen.queryByText("ACTIVITY")).toBeNull();
    expect(screen.getByText("MEMBERS")).toBeInTheDocument();
  });

  it("keeps it when it could", () => {
    render(<GroupAboutPanel group={group(known("warm", 3))} />);
    expect(screen.getByText("ACTIVITY")).toBeInTheDocument();
    expect(screen.getByText("Warm · 3/7d")).toBeInTheDocument();
  });
});

const row = (id: number, name: string, activity: GroupActivity) =>
  ({
    group_id: id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    member_count: 5,
    collection: { chain: "ethereum", contract: "0xabc", name, image_url: null },
    verification: { label: "Verified" },
    activity,
  }) as unknown as HolderGroupItem;

function withClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("4. the settings list", () => {
  it("an unknown row sorts after a counted one and shows no heat, count or stray separator", async () => {
    api.getMyHolderGroups.mockResolvedValue({
      joined: [],
      eligible_to_join: [row(1, "Ledger Club", UNKNOWN), row(2, "Mint Room", known("cold", 0))],
      opted_out: [],
    });
    withClient(<CommunitiesList />);

    const heading = await screen.findByRole("heading", { name: "Eligible communities" });
    const section = (heading.closest("section") ?? heading.parentElement?.parentElement) as HTMLElement;
    const items = within(section).getAllByRole("listitem");
    expect(items.map((li) => within(li).getByText(/Ledger Club|Mint Room/).textContent)).toEqual([
      "Mint Room",
      "Ledger Club",
    ]);

    const [counted, unknown] = items as [HTMLElement, HTMLElement];
    expect(within(counted).getByText("Quiet · 0/7d")).toBeInTheDocument();

    const unknownText = unknown.textContent ?? "";
    expect(unknownText).not.toMatch(/\/7d|Quiet|Hot|Warm/);
    expect(unknownText).toContain("5 members");
    // One dot between members and verification, not two around a gap.
    const dots = (li: HTMLElement) => li.querySelectorAll('span[aria-hidden="true"]').length;
    expect(dots(unknown)).toBe(dots(counted) - 1);
  });
});
