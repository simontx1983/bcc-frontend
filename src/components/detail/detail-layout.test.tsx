/**
 * Site Structure A §12: the ONE detail layout, hero option B (Phillip,
 * 2026-11-25). D1 puts communities and Halls on it.
 *   1. DetailHeader: kind · name · @handle · chips · actions · Share ·
 *      back link, and a stats strip of counts only (no text facts, no
 *      blank values);
 *   2. DetailBody: the main column beside the side column, and no empty
 *      aside when a page has no side blocks; DetailPage escapes the 680px
 *      reading cap;
 *   3. GroupDetailShell on a Hall: the header carries the card's own
 *      counts (Members · Posts (7d) · Validators, never Active or
 *      Access), no trading card, and the side column holds the page's
 *      blocks, then About and Facts;
 *   4. a non-Hall community's header lists the card's counts too, with
 *      Access left to the chips.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Card, CardStat, GroupDetailResponse } from "@/lib/api/types";

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
// The card face's own children: not under test here.
vi.mock("@/components/cards/CardActionBar", () => ({ ActionBar: () => null, CommunityActionBar: () => null }));
vi.mock("@/components/cards/Crest", () => ({ Crest: () => null }));
vi.mock("@/components/cards/CardStandingStrip", () => ({ CardStandingStrip: () => null }));
// The shell's children: stubbed to markers.
vi.mock("@/components/common/ShareButton", () => ({ ShareButton: () => <button type="button">Share</button> }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => <span data-testid="avatar" /> }));
vi.mock("@/components/layout/FileRail", () => ({ FileRail: () => <div data-testid="rail" /> }));
vi.mock("@/components/groups/GroupAboutPanel", () => ({ GroupAboutPanel: () => null }));
vi.mock("@/components/groups/GroupFeedSection", () => ({ GroupFeedSection: () => null }));
vi.mock("@/components/groups/GroupMembershipAdmin", () => ({ GroupMembershipAdmin: () => null }));
vi.mock("@/components/groups/GroupMembersStrip", () => ({ GroupMembersStrip: () => null }));
vi.mock("@/components/groups/GroupMembershipStrip", () => ({ GroupMembershipStrip: () => <button type="button">Join</button> }));
vi.mock("@/components/groups/GroupTabs", () => ({ GroupTabs: () => <nav data-testid="tabs" /> }));

const { DetailBody, DetailHeader, DetailPage, SideBlock } = await import("@/components/detail/DetailLayout");
const { GroupDetailShell } = await import("@/components/groups/GroupDetailShell");

afterEach(cleanup);

const stat = (key: string, label: string, raw: number): CardStat => ({ key, label, value: String(raw), raw, format: "count" });
const members = stat("members", "Members", 87);
const posts = stat("posts_7d", "Posts (7d)", 14);
const validators = stat("validators", "Validators", 98);
const active = stat("active", "Active", 9);
const access: CardStat = { key: "access", label: "Access", value: "Public", format: "text" };

/** The header's stats strip: its labels in order. */
const headerStats = (container: HTMLElement) =>
  Array.from(container.querySelectorAll("header dl dt")).map((dt) => dt.textContent);

describe("1. DetailHeader", () => {
  it("shows the identity, chips, actions, Share and back link", () => {
    render(
      <DetailHeader
        avatar={<span data-testid="avatar" />}
        kind="CHAIN HALL"
        kindColor="var(--kind-community)"
        name="Akash Hall"
        handle="akash-hall"
        chips={<span>Open to anyone</span>}
        actions={<button type="button">Join</button>}
        share={<button type="button">Share</button>}
        backHref="/communities?tab=halls"
        backLabel="Halls"
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Akash Hall" })).toBeInTheDocument();
    expect(screen.getByText("CHAIN HALL")).toBeInTheDocument();
    expect(screen.getByText("@akash-hall")).toBeInTheDocument();
    expect(screen.getByText("Open to anyone")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "← HALLS" })).toHaveAttribute("href", "/communities?tab=halls");
  });

  it("the stats strip holds counts only: no text fact, no blank value", () => {
    const blank: CardStat = { ...active, value: "" };
    const { container } = render(
      <DetailHeader avatar={null} kind="COMMUNITY" kindColor="x" name="N" handle="n" stats={[members, access, blank, posts]} />,
    );
    expect(headerStats(container)).toEqual(["Members", "Posts (7d)"]);
    expect(container.querySelector("header dl")).toHaveStyle({ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" });
  });

  it("no strip at all when there is nothing to count; no back link without a label", () => {
    const { container } = render(<DetailHeader avatar={null} kind="COMMUNITY" kindColor="x" name="N" handle="n" stats={[access]} />);
    expect(container.querySelector("header dl")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});

describe("2. DetailBody and DetailPage", () => {
  it("puts the side blocks in an aside beside the main column", () => {
    render(<DetailBody main={<p>tabs</p>} side={<SideBlock title="Facts">x</SideBlock>} />);
    const aside = screen.getByRole("complementary");
    expect(within(aside).getByRole("region", { name: "Facts" })).toHaveTextContent("FACTS");
    expect(screen.getByText("tabs").closest("aside")).toBeNull();
  });

  it("no aside when the page has no side blocks", () => {
    render(<DetailBody main={<p>tabs</p>} />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("DetailPage opts out of the 680px reading cap", () => {
    render(<DetailPage>x</DetailPage>);
    expect(screen.getByRole("main")).toHaveClass("bcc-page-wide");
  });
});

function communityCard(stats: CardStat[], dossierType: "hall" | "user"): Card {
  return {
    id: 7,
    name: "Akash Hall",
    handle: "akash-hall",
    card_kind: "community",
    kicker: dossierType === "hall" ? "CHAIN HALL" : "COMMUNITY",
    crest: { initials: "AH", monogram_color: "#8a8a8a", background_kind: "solid", background_value: "#222222", image_url: null },
    stats,
    member_dossier: null,
    community_dossier: { type: dossierType, privacy: "open", member_count: 87, verification: null, chain_tag: "akash", trust_min: null, collection_stats: null },
  } as unknown as Card;
}

function group(card: Card, over: Partial<GroupDetailResponse> = {}): GroupDetailResponse {
  return {
    id: 7,
    slug: "akash-hall",
    name: "Akash Hall",
    type: card.community_dossier?.type ?? "user",
    privacy: "open",
    image_url: null,
    description: "Where Akash operators and delegators talk upgrades.",
    chain_tag: "akash",
    verification: null,
    trust_min: null,
    card,
    ...over,
  } as unknown as GroupDetailResponse;
}

describe("3. a Hall on the shared layout", () => {
  const renderHall = (stats: CardStat[]) =>
    render(
      <GroupDetailShell
        group={group(communityCard(stats, "hall"))}
        urlBase="/communities/akash-hall"
        sharePath="/communities/akash-hall"
        backHref="/communities?tab=halls"
        backLabel="Halls"
        actions={<button type="button">Set as primary</button>}
        side={<SideBlock title="Your status here">status copy</SideBlock>}
      />,
    );

  it("the header carries the card's counts: Members · Posts (7d) · Validators, whatever the server's order", () => {
    const { container } = renderHall([access, validators, active, posts, members]);
    expect(headerStats(container)).toEqual(["Members", "Posts (7d)", "Validators"]);
    expect(screen.getByText("CHAIN HALL")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set as primary" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join" })).toBeNull();
    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
  });

  it("an unreadable posts count is left out of the header, never a 0", () => {
    const { container } = renderHall([members, validators, access]);
    expect(headerStats(container)).toEqual(["Members", "Validators"]);
  });

  it("the side column: the page's own blocks first, then About and Facts", () => {
    renderHall([members, posts, validators]);
    const aside = screen.getByRole("complementary");
    const blocks = within(aside).getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(blocks).toEqual(["Your status here", "About", "Facts"]);
    expect(within(aside).getByRole("region", { name: "Facts" })).toHaveTextContent("akash");
    // The tab strip is in the main column, not the side.
    expect(within(aside).queryByTestId("tabs")).toBeNull();
    expect(screen.getByTestId("tabs")).toBeInTheDocument();
  });

  it("an empty description drops the About block", () => {
    render(<GroupDetailShell group={group(communityCard([members], "hall"), { description: "  " })} />);
    const blocks = within(screen.getByRole("complementary"))
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label"));
    expect(blocks).toEqual(["Facts"]);
  });
});

describe("4. any other community", () => {
  it("a trust-gated group reads its reputation gate, not \"Open to anyone\"", () => {
    render(<GroupDetailShell group={group(communityCard([members], "user"), { trust_min: 50 })} />);
    expect(screen.getAllByText("Reputation 50+ to join")).toHaveLength(2);
    expect(screen.queryByText("Open to anyone")).toBeNull();
  });

  it("lists the card's counts, Access left to the chips, with the plain Join", () => {
    const { container } = render(<GroupDetailShell group={group(communityCard([members, posts, active, access], "user"))} />);
    expect(headerStats(container)).toEqual(["Posts (7d)", "Active", "Members"]);
    expect(screen.getAllByText("Open to anyone").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
  });
});
