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
 *      Access left to the chips; access is said the ONE way the card back
 *      says it (community-access.ts): a delegator group is "Delegators
 *      only", a trust group "Trust N+", and a holder group adds its holding
 *      requirement for a non-member, with its collection in the side column
 *      (no prices);
 *   5. the build boundary: the server-rendered shell takes the card rules
 *      from hook-free modules, never from a client card component (tsc and
 *      vitest can't see that; `next build` fails on it).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Card, CardStat, CollectionStats, GroupDetailResponse } from "@/lib/api/types";

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
vi.mock("@/components/identity/Avatar", () => ({
  Avatar: ({ avatarUrl }: { avatarUrl: string | null }) => <span data-testid="avatar" data-url={avatarUrl ?? "(none)"} />,
}));
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

function communityCard(stats: CardStat[], dossierType: "hall" | "user" | "validator" | "nft", crestUrl: string | null = null): Card {
  return {
    id: 7,
    name: "Akash Hall",
    handle: "akash-hall",
    card_kind: "community",
    kicker: dossierType === "hall" ? "CHAIN HALL" : "COMMUNITY",
    crest: { initials: "AH", monogram_color: "#8a8a8a", background_kind: "solid", background_value: "#222222", image_url: crestUrl },
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
    collection_stats: null,
    viewer_membership: null,
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
  it("lists the card's counts, Access left to the chips, with the plain Join", () => {
    const { container } = render(<GroupDetailShell group={group(communityCard([members, posts, active, access], "user"))} />);
    expect(headerStats(container)).toEqual(["Posts (7d)", "Active", "Members"]);
    expect(screen.getAllByText("Open to all")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Join" })).toBeInTheDocument();
  });

  it("a trust-gated group reads its gate, as the card back does", () => {
    render(<GroupDetailShell group={group(communityCard([members], "user"), { trust_min: 50 })} />);
    expect(screen.getAllByText("Trust 50+")).toHaveLength(2);
    expect(screen.queryByText("Open to all")).toBeNull();
  });

  it("a delegator group is delegators-only, never a request queue", () => {
    render(<GroupDetailShell group={group(communityCard([members], "validator"), { type: "validator", privacy: "closed" })} />);
    expect(screen.getAllByText("Delegators only")).toHaveLength(2);
    expect(screen.queryByText(/request/i)).toBeNull();
  });

  const collection = (over: Partial<CollectionStats> = {}): CollectionStats =>
    ({
      token_standard: "ERC-721",
      holders_display: "1,204",
      supply_display: "5,000",
      floor_display: "0.42 ETH",
      volume_display: "88 ETH",
      listed_display: "3%",
      royalty_display: "5%",
      min_balance_display: "1 NFT",
      marketplace: { url: "https://market.example/c/smiths", label: "Market" },
      ...over,
    }) as CollectionStats;

  it("a holder group, to a non-member: open to all AND requires the holding; its collection sits in the side column, no prices", () => {
    render(
      <GroupDetailShell
        group={group(communityCard([members], "nft"), { type: "nft", collection_stats: collection() })}
      />,
    );
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Open to all")).toBeInTheDocument();
    expect(within(header).getByText("Requires 1 NFT")).toBeInTheDocument();

    const block = screen.getByRole("region", { name: "Collection" });
    expect(block).toHaveTextContent("ERC-721");
    expect(block).toHaveTextContent("1,204");
    expect(block).toHaveTextContent("5,000");
    expect(block).toHaveTextContent("Requires 1 NFT");
    const link = within(block).getByRole("link", { name: "View on Market ↗" });
    expect(link).toHaveAttribute("href", "https://market.example/c/smiths");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    // BCC never puts price forward.
    expect(document.body).not.toHaveTextContent(/0\.42 ETH|88 ETH|Floor|Volume|Royalty|Listed/);

    const order = within(screen.getByRole("complementary"))
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label"));
    expect(order).toEqual(["Collection", "About", "Facts"]);
  });

  it("a member of the holder group sees no barrier chip (the requirement stays a collection fact)", () => {
    render(
      <GroupDetailShell
        group={group(communityCard([members], "nft"), {
          type: "nft",
          collection_stats: collection(),
          viewer_membership: { is_member: true, joined_at: null },
        })}
      />,
    );
    expect(within(screen.getByRole("banner")).queryByText("Requires 1 NFT")).toBeNull();
    expect(screen.getByRole("region", { name: "Collection" })).toHaveTextContent("Requires 1 NFT");
  });

  it("no Collection block for a group without a collection", () => {
    render(<GroupDetailShell group={group(communityCard([members], "user"))} />);
    expect(screen.queryByRole("region", { name: "Collection" })).toBeNull();
  });

  it("an empty group image falls through to the card's crest image", () => {
    render(
      <GroupDetailShell
        group={group(communityCard([members], "user", "https://img.example/crest.png"), { image_url: "" })}
      />,
    );
    expect(screen.getByTestId("avatar")).toHaveAttribute("data-url", "https://img.example/crest.png");
  });
});

describe("5. the build boundary", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

  it("the shell imports the card rules from hook-free modules, not from a card component", () => {
    const shell = read("src/components/groups/GroupDetailShell.tsx");
    expect(shell.startsWith('"use client"')).toBe(false);
    expect(shell).not.toMatch(/from "@\/components\/cards\/(CardFrontFace|CardFactory|CommunityDossier|CardStandingStrip)"/);
    expect(shell).toMatch(/from "@\/components\/cards\/card-face-stats"/);
    expect(shell).toMatch(/from "@\/components\/cards\/community-access"/);
  });

  it("those modules stay hook-free and JSX-free", () => {
    for (const p of ["src/components/cards/card-face-stats.ts", "src/components/cards/community-access.ts"]) {
      const src = read(p);
      expect(src, p).not.toMatch(/^"use client"/);
      expect(src, p).not.toMatch(/from "react"/);
      expect(src, p).not.toMatch(/\buse[A-Z]\w*\(/);
    }
  });

  it("the card face, which keeps state, says it is a client component", () => {
    expect(read("src/components/cards/CardFrontFace.tsx").startsWith('"use client";')).toBe(true);
  });
});
