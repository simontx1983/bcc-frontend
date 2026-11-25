/**
 * One card everywhere (Phillip): Communities ▸ Halls shows the SAME
 * community card as every other list once GET /halls carries each Hall's
 * `card` (SA4). Tolerant before then.
 *   1. every item has a card → the shared community card grid;
 *   2. any item without one → today's Hall panels, never a mix;
 *   3. a Hall's card shows its three counts side by side in the stats row,
 *      Members · Posts 7d · Validators (Phillip, 2026-11-25), in that order
 *      whatever order the server sends; a topic Hall sends no Validators
 *      stat and shows none, never a 0; any other community keeps Members
 *      in the name line, like every card.
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Card, CardPermissionEntry, CardStat, HallItem } from "@/lib/api/types";

vi.mock("@/components/communities/CommunityJoinCard", () => ({
  CommunityJoinCard: ({ card }: { card: Card }) => <div data-testid="community-card">{card.name}</div>,
}));
vi.mock("@/components/cards/CardActionBar", () => ({ ActionBar: () => null, CommunityActionBar: () => null }));
vi.mock("@/components/cards/Crest", () => ({ Crest: () => null }));
vi.mock("@/components/cards/CardStandingStrip", () => ({ CardStandingStrip: () => null }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: unknown; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

const { HallsList } = await import("@/components/communities/HallsTabPanel");
const { CardFrontFace } = await import("@/components/cards/CardFrontFace");

afterEach(cleanup);

const denied = (): CardPermissionEntry => ({ allowed: false, unlock_hint: null, reason_code: null });
const stat = (key: string, label: string, raw: number): CardStat =>
  ({ key, label, value: String(raw), raw, format: "count" }) as CardStat;

type DossierType = "hall" | "user" | null;

function hallCard(name: string, stats: CardStat[], dossierType: DossierType = null): Card {
  return {
    id: 7,
    name,
    handle: "akash-hall",
    card_kind: "community",
    kicker: "CHAIN HALL",
    bio: "",
    trust_score: null,
    reputation_tier: null,
    reputation_tier_label: null,
    rank_label: null,
    is_in_good_standing: true,
    flags: [],
    is_claimed: true,
    claim_target: null,
    chains: null,
    viewer_has_reviewed: false,
    viewer_has_endorsed: false,
    endorse_unlock_hint: null,
    crest: { initials: "AH", monogram_color: "#8a8a8a", background_kind: "solid", background_value: "#222222", image_url: null },
    stats,
    member_dossier: null,
    community_dossier:
      dossierType === null
        ? null
        : { type: dossierType, privacy: "open", member_count: 3, verification: null, chain_tag: "akash", trust_min: null, collection_stats: null },
    permissions: {
      can_review: denied(),
      can_watch: denied(),
      can_endorse: denied(),
      can_post_as_entity: false,
      can_edit_bio: false,
      can_edit_image: denied(),
    },
    social_proof: null,
    links: { self: "/communities/akash-hall" },
  } as unknown as Card;
}

function hall(id: number, card?: Card): HallItem {
  return {
    id,
    slug: `hall-${id}`,
    name: `Hall ${id}`,
    chain: "akash",
    member_count: 3,
    validator_count: 12,
    collection_count: 0,
    viewer_membership: null,
    links: { self: `/halls/hall-${id}` },
    ...(card !== undefined ? { card } : {}),
  };
}

describe("1–2. which card the Halls tab draws", () => {
  it("every Hall carries a card → the shared community cards", () => {
    render(<HallsList items={[hall(1, hallCard("Akash Hall", [])), hall(2, hallCard("Osmosis Hall", []))]} />);
    expect(screen.getAllByTestId("community-card").map((el) => el.textContent)).toEqual(["Akash Hall", "Osmosis Hall"]);
    expect(screen.queryByText("Hall 1")).toBeNull();
  });

  it("a backend before the card field → today's Hall panels", () => {
    render(<HallsList items={[hall(1), hall(2)]} />);
    expect(screen.queryByTestId("community-card")).toBeNull();
    expect(screen.getByRole("link", { name: /Hall 1/ })).toHaveAttribute("href", "/halls/hall-1");
  });

  it("any Hall without a card → panels for all, never a mix", () => {
    render(<HallsList items={[hall(1, hallCard("Akash Hall", [])), hall(2)]} />);
    expect(screen.queryByTestId("community-card")).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});

describe("3. a Hall card's counts", () => {
  const face = (card: Card) =>
    render(
      <CardFrontFace card={card} kindColor="var(--kind-community)" flipped={false} onFlip={() => {}} isPulled={false} canEditAvatar={false} />,
    );

  // What a community card carries on the wire today (§3.2.4), plus the
  // validators stat SA4 adds to chain-Hall cards after posts_7d.
  const members = stat("members", "Members", 87);
  const posts = stat("posts_7d", "Posts (7d)", 14);
  const validators = stat("validators", "Validators", 98);
  const active = stat("active", "Active", 9);
  const access = { key: "access", label: "Access", value: "Public", raw: null, format: "text" } as unknown as CardStat;

  /** The stats row's labels, in order, and its column count. */
  const statsRow = (container: HTMLElement) => {
    const row = container.querySelector('[class*="grid-cols-"]');
    const cols = /grid-cols-(\d)/.exec(row?.className ?? "")?.[1];
    const all = ["Members", "Posts (7d)", "Validators", "Active", "Access"];
    const text = row?.textContent ?? "";
    const labels = all.filter((l) => text.includes(l)).sort((a, b) => text.indexOf(a) - text.indexOf(b));
    return { cols, labels };
  };

  it("chain Hall: exactly Members · Posts (7d) · Validators in the row, nothing under the name", () => {
    const { container } = face(hallCard("Akash Hall", [members, posts, validators, active, access], "hall"));
    expect(statsRow(container)).toEqual({ cols: "3", labels: ["Members", "Posts (7d)", "Validators"] });
    expect(screen.getAllByText("Members")).toHaveLength(1);
    expect(screen.queryByText("Active")).toBeNull();
    expect(screen.queryByText("Access")).toBeNull();
  });

  it("the card orders the row itself: a server order of validators before posts_7d still reads Members · Posts (7d) · Validators", () => {
    const { container } = face(hallCard("Akash Hall", [access, validators, active, posts, members], "hall"));
    expect(statsRow(container)).toEqual({ cols: "3", labels: ["Members", "Posts (7d)", "Validators"] });
  });

  it("before the validators stat ships: Members · Posts (7d), never Active in its place", () => {
    const { container } = face(hallCard("Akash Hall", [members, posts, active, access], "hall"));
    expect(statsRow(container)).toEqual({ cols: "2", labels: ["Members", "Posts (7d)"] });
  });

  it("topic Hall (no validators) reads Members · Posts (7d); an unreadable posts count is simply left out", () => {
    const topic = face(hallCard("DeFi Hall", [members, posts, active, access], "hall"));
    expect(statsRow(topic.container)).toEqual({ cols: "2", labels: ["Members", "Posts (7d)"] });
    cleanup();
    const unread = face(hallCard("Akash Hall", [members, validators, access], "hall"));
    expect(statsRow(unread.container)).toEqual({ cols: "2", labels: ["Members", "Validators"] });
  });

  it("any other community is unchanged: Members in the name line, the rest in the row", () => {
    const { container } = face(hallCard("Night Shift", [members, posts, active, access], "user"));
    expect(statsRow(container)).toEqual({ cols: "3", labels: ["Posts (7d)", "Active", "Access"] });
    expect(screen.getByText("Members")).toBeInTheDocument();
  });
});
