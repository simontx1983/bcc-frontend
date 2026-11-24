/**
 * A community card's JOIN goes to the endpoint for its KIND.
 *
 * /me/groups join refuses Halls outright; a Hall joins through
 * HallsService's own route (POST me/halls/{id}/membership). Communities ▸
 * Halls now renders Halls as community cards (CommunityJoinCard), the same
 * as the All tab, so the Hall routing in CommunityJoinCard is pinned here:
 *   - a Hall card → joinHall, never the plain group join;
 *   - a plain (member-made) card → joinPlainGroup, never joinHall.
 * The real CommunityJoinCard and its mutation hooks run; only CardFactory
 * (to expose its JOIN) and the endpoint functions are stubbed.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as HallsEndpoints from "@/lib/api/halls-endpoints";
import type * as MyGroupsEndpoints from "@/lib/api/my-groups-endpoints";
import type { Card } from "@/lib/api/types";

const api = vi.hoisted(() => ({
  joinHall: vi.fn<(groupId: number) => Promise<unknown>>(() => Promise.resolve({})),
  joinPlainGroup: vi.fn<(groupId: number) => Promise<unknown>>(() => Promise.resolve({})),
}));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/analytics/posthog", () => ({ captureAnalyticsEvent: vi.fn() }));
vi.mock("@/components/cards/CardFactory", () => ({
  CardFactory: ({ card, onJoin }: { card: Card; onJoin: (c: Card) => void }) => (
    <button type="button" onClick={() => onJoin(card)}>
      JOIN {card.name}
    </button>
  ),
}));
vi.mock("@/lib/api/halls-endpoints", async (importOriginal) => ({
  ...(await importOriginal<typeof HallsEndpoints>()),
  joinHall: api.joinHall,
}));
vi.mock("@/lib/api/my-groups-endpoints", async (importOriginal) => ({
  ...(await importOriginal<typeof MyGroupsEndpoints>()),
  joinPlainGroup: api.joinPlainGroup,
}));

const { CommunityJoinCard } = await import("@/components/communities/CommunityJoinCard");

afterEach(() => {
  cleanup();
  api.joinHall.mockClear();
  api.joinPlainGroup.mockClear();
});

const card = (type: string, name: string): Card =>
  ({ id: 7, name, card_kind: "community", community_dossier: { type } }) as unknown as Card;

const renderCard = (c: Card) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CommunityJoinCard card={c} />
    </QueryClientProvider>,
  );

describe("JOIN routes by community kind", () => {
  it("a Hall card joins through the Hall route, never /me/groups", async () => {
    renderCard(card("hall", "Akash Hall"));
    fireEvent.click(screen.getByRole("button", { name: "JOIN Akash Hall" }));
    await waitFor(() => expect(api.joinHall).toHaveBeenCalledWith(7));
    expect(api.joinPlainGroup).not.toHaveBeenCalled();
  });

  it("a member-made card joins through /me/groups, never the Hall route", async () => {
    renderCard(card("user", "Night Shift"));
    fireEvent.click(screen.getByRole("button", { name: "JOIN Night Shift" }));
    await waitFor(() => expect(api.joinPlainGroup).toHaveBeenCalled());
    expect(api.joinHall).not.toHaveBeenCalled();
  });
});
