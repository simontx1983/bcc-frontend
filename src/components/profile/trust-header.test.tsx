/**
 * TrustHeader — what it shows and, more importantly, what it never shows:
 * unverified checks, wallet addresses, follower/watcher counts. The client
 * action children are stubbed; their own suites cover them.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MemberProfile } from "@/lib/api/types";

vi.mock("@/components/identity/RankInfoModal", () => ({ RankInfoModal: () => null }));
vi.mock("@/components/profile/AttestationActionCluster", () => ({
  AttestationActionCluster: () => <div data-testid="vouch-cluster" />,
}));
vi.mock("@/components/identity/MemberFollowButton", () => ({
  MemberFollowButton: () => <button type="button">Watch</button>,
}));
vi.mock("@/components/common/ShareButton", () => ({
  ShareButton: () => <button type="button">Share</button>,
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { TrustHeader } from "./TrustHeader";

afterEach(cleanup);

const WALLET = "0x1234567890abcdef1234567890abcdef12345678";

/** Overrides may set an optional field to `undefined` to model "absent". */
type ProfileOverrides = { [K in keyof MemberProfile]?: MemberProfile[K] | undefined };

function makeProfile(overrides: ProfileOverrides = {}): MemberProfile {
  return {
    id: 7,
    user_id: 7,
    handle: "alice",
    display_name: "Alice",
    avatar_url: "",
    joined_at: "2026-01-01T00:00:00Z",
    trust_score: 72,
    reputation_tier: "trusted",
    reputation_tier_label: "Trusted",
    member_state: "ranked",
    rank: "journeyman",
    rank_label: "Journeyman",
    is_in_good_standing: true,
    flags: [],
    bio: "",
    halls: [],
    wallets: [
      {
        id: 1,
        address: WALLET,
        address_short: "0x1234…5678",
        chain_slug: "ethereum",
        chain_name: "Ethereum",
        is_primary: true,
        verified_at: "",
      },
    ],
    attestation_summary: { vouch_count: 3, stand_behind_count: 1 },
    verifications: {
      x_verified: true,
      x_username: "alice_x",
      github_verified: false,
      github_username: "alice-gh",
      wallets_verified: 1,
      profile_completeness: 80,
    },
    counts: {
      followers: 987,
      following: 654,
      watching_size: 321,
      reviews_written: 0,
      reviews_received: 0,
      disputes_signed: 0,
      solids_given: 0,
      solids_received: 0,
      blog_posts_written: 0,
    },
    permissions: {
      can_vouch: { allowed: true, unlock_hint: null },
      can_stand_behind: { allowed: true, unlock_hint: null },
      can_report: { allowed: true, unlock_hint: null },
    },
    ...overrides,
  } as unknown as MemberProfile;
}

describe("TrustHeader", () => {
  it("renders score, tier, standing and only the verified checks", () => {
    render(<TrustHeader profile={makeProfile()} isOwner={false} viewerAuthed />);
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("GOOD STANDING")).toBeInTheDocument();
    expect(screen.getByText("JOURNEYMAN")).toBeInTheDocument();

    const line = screen.getByTestId("trust-header-verifications");
    expect(line.textContent).toContain("3 VOUCH");
    expect(line.textContent).toContain("1 BACKS");
    expect(line.textContent).toContain("X");
    expect(line.textContent).toContain("WALLET");
    // github_verified is false — omitted even though a username is present.
    expect(line.textContent).not.toContain("GITHUB");
    expect(within(line).queryByText(/alice-gh/)).toBeNull();
  });

  it("never renders a wallet address or follower/watcher counts", () => {
    const { container } = render(
      <TrustHeader profile={makeProfile()} isOwner={false} viewerAuthed />,
    );
    const text = container.textContent ?? "";
    expect(text).not.toContain(WALLET);
    expect(text).not.toContain("0x1234");
    expect(text).not.toContain("987");
    expect(text).not.toContain("654");
    expect(text).not.toContain("321");
    expect(text).not.toMatch(/watchers|followers/i);
  });

  it("compact variant hides the verification line", () => {
    render(
      <TrustHeader profile={makeProfile()} isOwner={false} viewerAuthed variant="compact" />,
    );
    expect(screen.queryByTestId("trust-header-verifications")).toBeNull();
    expect(screen.getByText("72")).toBeInTheDocument();
  });

  it("omits the line entirely when nothing is verified and no summary shipped", () => {
    const profile = makeProfile({
      attestation_summary: undefined,
      verifications: {
        x_verified: false,
        x_username: null,
        github_verified: false,
        github_username: null,
        wallets_verified: 0,
        profile_completeness: 0,
      },
    });
    render(<TrustHeader profile={profile} isOwner={false} viewerAuthed />);
    expect(screen.queryByTestId("trust-header-verifications")).toBeNull();
  });

  it("prefers reputation_score over trust_score", () => {
    render(
      <TrustHeader profile={makeProfile({ reputation_score: 55 })} isOwner={false} viewerAuthed />,
    );
    expect(screen.getByText("55")).toBeInTheDocument();
    expect(screen.queryByText("72")).toBeNull();
  });

  it("owner sees no Vouch/Watch; anon sees Vouch but no Watch", () => {
    const { unmount } = render(<TrustHeader profile={makeProfile()} isOwner viewerAuthed />);
    expect(screen.queryByTestId("vouch-cluster")).toBeNull();
    expect(screen.queryByText("Watch")).toBeNull();
    unmount();

    render(<TrustHeader profile={makeProfile()} isOwner={false} viewerAuthed={false} />);
    expect(screen.getByTestId("vouch-cluster")).toBeInTheDocument();
    expect(screen.queryByText("Watch")).toBeNull();
  });

  it("owner gets EDIT ABOUT in the action slot; nobody else does", () => {
    const { container, unmount } = render(
      <TrustHeader profile={makeProfile()} isOwner viewerAuthed />,
    );
    const edit = within(container).getByRole("link", { name: "Edit About" });
    expect(edit).toHaveAttribute("href", "/u/alice/about/edit");
    expect(edit.className).toContain("min-h-[44px]");
    expect(within(container).queryByText("Watch")).toBeNull();
    expect(within(container).queryByTestId("vouch-cluster")).toBeNull();
    unmount();

    const visitor = render(<TrustHeader profile={makeProfile()} isOwner={false} viewerAuthed />);
    expect(within(visitor.container).queryByRole("link", { name: "Edit About" })).toBeNull();
  });

  it("C8: new_member → NEW MEMBER chip; member_state absent → no rank chip", () => {
    const { unmount } = render(
      <TrustHeader
        profile={makeProfile({ member_state: "new_member", rank: null, rank_label: null })}
        isOwner={false}
        viewerAuthed
      />,
    );
    expect(screen.getByText("NEW MEMBER")).toBeInTheDocument();
    unmount();

    render(
      <TrustHeader
        profile={makeProfile({ member_state: undefined })}
        isOwner={false}
        viewerAuthed
      />,
    );
    expect(screen.queryByText("NEW MEMBER")).toBeNull();
    expect(screen.queryByText("JOURNEYMAN")).toBeNull();
  });
});
