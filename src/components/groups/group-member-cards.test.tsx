/**
 * One card everywhere (Phillip): a group's Members tab (Halls included)
 * shows each member as the SAME card as the /members directory once GET
 * /groups/{id}/members carries it (FA2: `card: Card | null`).
 *   1. no row carries a card (a backend before the field) → today's tiles,
 *      unchanged;
 *   2. rows with a card → the directory card, with the member's role in
 *      THIS group (server label, verbatim) on a line above it, outside the
 *      card face; plain members get an empty line so a row stays aligned;
 *   3. a row with `card: null` (private, blocked, failed build) → that
 *      member's tile, in its place in the same grid.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Card, GroupDetailResponse, GroupMember } from "@/lib/api/types";

const roster = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock("@/hooks/useGroupMembers", () => ({
  GROUP_MEMBERS_QUERY_KEY_ROOT: ["group-members"],
  useGroupMembers: () => roster.value,
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/cards/CardFactory", () => ({
  CardFactory: ({ card }: { card: Card }) => <div data-testid="member-card">{card.name}</div>,
}));
vi.mock("@/hooks/useViewerWatch", () => ({
  WATCH_UNKNOWN_COPY: "unknown",
  useViewerWatch: () => ({ watching: false, toggle: () => {}, unknown: false, error: null }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: unknown; children?: ReactNode; className?: string }) => (
    <a href={String(href)} className={className}>
      {children}
    </a>
  ),
}));

const { GroupMembersStrip } = await import("@/components/groups/GroupMembersStrip");

afterEach(cleanup);

const GROUP = { id: 9, members_visible: true } as unknown as GroupDetailResponse;

const memberCard = (name: string): Card =>
  ({ id: 0, name, card_kind: "member", permissions: {} }) as unknown as Card;

function member(id: number, role: GroupMember["role"], card?: Card | null): GroupMember {
  return {
    id,
    handle: `m${id}`,
    display_name: `Member ${id}`,
    avatar_url: "",
    role,
    role_label: role.toUpperCase(),
    ...(card !== undefined ? { card: card === null ? null : { ...card, id } } : {}),
  } as unknown as GroupMember;
}

function show(items: GroupMember[]) {
  roster.value = {
    isPending: false,
    isLoading: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetchNextPageError: false,
    error: null,
    data: { pages: [{ items, pagination: { total: items.length } }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => {},
    refetch: () => {},
  };
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <GroupMembersStrip group={GROUP} />
    </QueryClientProvider>,
  );
}

describe("1. a backend before the card field", () => {
  it("keeps today's tiles, role inside the tile", () => {
    show([member(1, "owner"), member(2, "member")]);
    expect(screen.queryByTestId("member-card")).toBeNull();
    expect(screen.getByRole("link", { name: /Member 1/ })).toHaveAttribute("href", "/u/m1");
    expect(screen.getByText("OWNER")).toBeInTheDocument();
  });
});

describe("2. rows that carry a card", () => {
  it("render the directory card, with the group role on a line above it", () => {
    const { container } = show([member(1, "owner", memberCard("Ada")), member(2, "member", memberCard("Bo"))]);
    expect(screen.getAllByTestId("member-card").map((el) => el.textContent)).toEqual(["Ada", "Bo"]);
    const cells = container.querySelectorAll("li");
    expect(within(cells[0] as HTMLElement).getByText("OWNER")).toBeInTheDocument();
    // The role line sits BEFORE the card, outside its face.
    expect((cells[0] as HTMLElement).firstElementChild?.textContent).toBe("OWNER");
    // A plain member gets the empty line too, so the cards stay aligned.
    expect((cells[1] as HTMLElement).firstElementChild?.tagName).toBe("P");
    expect((cells[1] as HTMLElement).firstElementChild?.textContent).toBe("");
  });
});

describe("3. a row without a card", () => {
  it("shows that member's tile in its place in the same grid", () => {
    const { container } = show([member(1, "member", memberCard("Ada")), member(2, "moderator", null), member(3, "member", memberCard("Cy"))]);
    const cells = [...container.querySelectorAll("li")];
    expect(cells).toHaveLength(3);
    expect(within(cells[0] as HTMLElement).getByTestId("member-card")).toHaveTextContent("Ada");
    expect(within(cells[1] as HTMLElement).queryByTestId("member-card")).toBeNull();
    expect(within(cells[1] as HTMLElement).getByRole("link", { name: /Member 2/ })).toHaveAttribute("href", "/u/m2");
    expect(within(cells[1] as HTMLElement).getByText("MODERATOR")).toBeInTheDocument();
    expect(within(cells[2] as HTMLElement).getByTestId("member-card")).toHaveTextContent("Cy");
  });
});
