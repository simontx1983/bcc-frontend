/**
 * F-388 wiring: GroupDetailShell hands the strip the Members tab's URL on
 * the community sub-routes (`urlBase` set), and nothing on a route
 * without one. A caller's own `actions` replace the strip entirely.
 *
 * Every child is stubbed: this pins only what the shell passes.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroupDetailResponse } from "@/lib/api/types";

vi.mock("@/components/common/ShareButton", () => ({ ShareButton: () => null }));
vi.mock("@/components/communities/CommunityJoinCard", () => ({ CommunityJoinCard: () => null }));
vi.mock("@/components/layout/FileRail", () => ({ FileRail: () => null }));
vi.mock("@/components/groups/GroupAboutPanel", () => ({ GroupAboutPanel: () => null }));
vi.mock("@/components/groups/GroupFeedSection", () => ({ GroupFeedSection: () => null }));
vi.mock("@/components/groups/GroupMembershipAdmin", () => ({ GroupMembershipAdmin: () => null }));
vi.mock("@/components/groups/GroupMembersStrip", () => ({ GroupMembersStrip: () => null }));
vi.mock("@/components/groups/GroupTabs", () => ({ GroupTabs: () => null }));
vi.mock("@/components/layout/PageHero", () => ({
  PageHero: ({ actions }: { actions: ReactNode }) => <div>{actions}</div>,
}));
vi.mock("@/components/groups/GroupMembershipStrip", () => ({
  GroupMembershipStrip: ({ membersHref }: { membersHref?: string }) => (
    <p data-testid="strip" data-members-href={membersHref ?? "(none)"} />
  ),
}));

import { GroupDetailShell } from "@/components/groups/GroupDetailShell";

afterEach(cleanup);

const GROUP = {
  id: 52,
  slug: "night-shift",
  name: "Night Shift",
  type: "user",
  privacy: "closed",
  card: {},
} as unknown as GroupDetailResponse;

describe("GroupDetailShell → GroupMembershipStrip membersHref", () => {
  it("a community sub-route passes {urlBase}/members", () => {
    render(<GroupDetailShell group={GROUP} urlBase="/communities/night-shift" />);
    expect(screen.getByTestId("strip")).toHaveAttribute(
      "data-members-href",
      "/communities/night-shift/members",
    );
  });

  it("a route without urlBase passes none", () => {
    render(<GroupDetailShell group={GROUP} />);
    expect(screen.getByTestId("strip")).toHaveAttribute("data-members-href", "(none)");
  });

  it("caller-supplied actions replace the strip", () => {
    render(<GroupDetailShell group={GROUP} urlBase="/communities/night-shift" actions={<p>hall controls</p>} />);
    expect(screen.queryByTestId("strip")).toBeNull();
    expect(screen.getByText("hall controls")).toBeInTheDocument();
  });
});
