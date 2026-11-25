/**
 * Site Structure A, PR 2: one Hall page.
 *
 * Every community, Halls included, renders through
 * communities/[slug]/community-detail.tsx (the stream route and its
 * /about and /members sub-routes). These tests drive the real server
 * component with the API and the shell mocked, and assert what reaches
 * the shell:
 *   1. a plain group renders as before;
 *   2. a Hall adds its controls, chain block and non-empty chain tabs, and
 *      its back link returns to Communities ▸ Halls;
 *   3. the failure paths kept from the old Hall page;
 *   4. only the stream route caches the anonymous read and offers Share;
 *   5. in URL mode, Collections / Validators switch in-page (no 404 push);
 *   6. the metadata names a Hall a Hall.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GroupDetailShellProps } from "@/components/groups/GroupDetailShell";
import { BccApiError } from "@/lib/api/types";

const api = vi.hoisted(() => ({
  getGroup: vi.fn(),
  getHall: vi.fn(),
  session: null as null | { user: { handle: string } },
}));
const shell = vi.hoisted(() => ({ props: [] as Array<Partial<GroupDetailShellProps>> }));
const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next-auth", () => ({ getServerSession: () => Promise.resolve(api.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/api/client", () => ({
  tokenFromSession: (s: unknown) => (s === null ? null : "tok"),
}));
vi.mock("@/lib/api/groups-detail-endpoints", () => ({ getGroup: api.getGroup }));
vi.mock("@/lib/api/halls-endpoints", () => ({ getHall: api.getHall }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/groups/GroupDetailShell", () => ({
  GroupDetailShell: (props: GroupDetailShellProps) => {
    shell.props.push(props);
    return <div data-testid="shell" />;
  },
}));
vi.mock("@/components/halls/HallMembershipControls", () => ({
  HallMembershipControls: () => <div>hall-controls</div>,
}));
vi.mock("@/components/halls/HallChainProfile", () => ({ HallChainProfile: () => null }));
vi.mock("@/components/halls/HallChainContent", () => ({
  HallCollectionsPanel: () => <div>collections-panel</div>,
  HallValidatorsPanel: () => <div>validators-panel</div>,
}));

const { CommunityDetail } = await import("@/app/(main)/(app)/communities/[slug]/community-detail");
const { GroupTabs } = await import("@/components/groups/GroupTabs");
const { buildGroupMetadata } = await import("@/lib/og/group-metadata");

const group = (type: string) => ({ id: 7, slug: "akash-hall", name: "Akash Hall", type, description: null });
const hall = (over: Record<string, unknown> = {}) => ({
  id: 7,
  name: "Akash Hall",
  chain: "akash",
  member_count: 3,
  chain_profile: null,
  viewer_membership: null,
  collections: [{ id: 1 }],
  collection_count: 1,
  validators: [],
  validator_count: 0,
  ...over,
});
const err = (status: number) => new BccApiError("bcc_x", "raw", status, null);

async function renderDetail(initialTab: "stream" | "about" | "members" = "stream") {
  const el = await CommunityDetail({ slug: "akash-hall", initialTab });
  return render(<>{el as ReactNode}</>);
}
const lastShell = () => shell.props.at(-1) ?? {};

beforeEach(() => {
  shell.props = [];
  api.getGroup.mockReset();
  api.getHall.mockReset();
  api.session = null;
});
afterEach(cleanup);

describe("1. a plain group renders as before", () => {
  it("no Hall read, the join strip (no actions), back to Communities", async () => {
    api.getGroup.mockResolvedValue(group("user"));
    await renderDetail();
    expect(api.getHall).not.toHaveBeenCalled();
    expect(lastShell()).toMatchObject({
      initialTab: "stream",
      urlBase: "/communities/akash-hall",
      backHref: "/communities",
      backLabel: "Communities",
    });
    expect(lastShell().actions).toBeUndefined();
    expect(lastShell().collectionsPanel).toBeUndefined();
    expect(lastShell().side).toBeUndefined();
  });
});

describe("2. a Hall at /communities/[slug]", () => {
  it("explains its membership controls in the side column (the controls sit in the header)", async () => {
    api.getGroup.mockResolvedValue(group("hall"));
    api.getHall.mockResolvedValue(hall());
    await renderDetail();
    cleanup();
    render(<>{lastShell().side}</>);
    expect(screen.getByRole("region", { name: "Your status here" })).toHaveTextContent(
      /designate one as your primary/,
    );
  });

  it("adds its controls, chain block and the non-empty chain tab; back to Halls", async () => {
    api.getGroup.mockResolvedValue(group("hall"));
    api.getHall.mockResolvedValue(hall());
    await renderDetail();
    const p = lastShell();
    expect(p).toMatchObject({
      urlBase: "/communities/akash-hall",
      backHref: "/communities?tab=halls",
      backLabel: "Halls",
    });
    expect(p.actions).toBeDefined();
    expect(p.aboutSupplement).toBeDefined();
    expect(p.collectionsPanel).toBeDefined();
    // Nothing indexed → no tab, not an empty room.
    expect(p.validatorsPanel).toBeUndefined();
  });

  it("does the same on the /about and /members sub-routes", async () => {
    for (const tab of ["about", "members"] as const) {
      api.getGroup.mockResolvedValue(group("hall"));
      api.getHall.mockResolvedValue(hall());
      await renderDetail(tab);
      expect(lastShell()).toMatchObject({ initialTab: tab, backLabel: "Halls" });
      expect(lastShell().actions).toBeDefined();
      cleanup();
    }
  });

  it("falls back to the plain view when only the Hall read fails", async () => {
    api.getGroup.mockResolvedValue(group("hall"));
    api.getHall.mockRejectedValue(err(503));
    await renderDetail();
    expect(lastShell()).toMatchObject({ backHref: "/communities" });
    expect(lastShell().actions).toBeUndefined();
  });
});

describe("3. failure paths kept from the old Hall page", () => {
  it("group read down, Hall read up → the minimal Hall view, feed suppressed", async () => {
    api.getGroup.mockRejectedValue(err(503));
    api.getHall.mockResolvedValue(hall());
    await renderDetail();
    expect(shell.props).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "Akash Hall" })).toBeInTheDocument();
    expect(screen.getByText("hall-controls")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/feed is briefly unavailable/i);
    expect(screen.getByRole("link", { name: "← HALLS" })).toHaveAttribute("href", "/communities?tab=halls");
  });

  it("both 404 → notFound", async () => {
    api.getGroup.mockRejectedValue(err(404));
    api.getHall.mockRejectedValue(err(404));
    await expect(CommunityDetail({ slug: "nope", initialTab: "stream" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("group down and no such Hall → the group's error, not a 404", async () => {
    const down = err(503);
    api.getGroup.mockRejectedValue(down);
    api.getHall.mockRejectedValue(err(404));
    await expect(CommunityDetail({ slug: "x", initialTab: "stream" })).rejects.toBe(down);
  });
});

describe("4. stream vs sub-routes", () => {
  it("stream: anonymous read cached, Share offered", async () => {
    api.getGroup.mockResolvedValue(group("user"));
    await renderDetail("stream");
    expect(api.getGroup.mock.calls[0]?.[2]).toEqual({ revalidate: expect.any(Number) });
    expect(lastShell().sharePath).toBe("/communities/akash-hall");
  });

  it("about: no cached read, no Share (as before the move)", async () => {
    api.getGroup.mockResolvedValue(group("user"));
    await renderDetail("about");
    expect(api.getGroup.mock.calls[0]?.[2]).toBeUndefined();
    expect(lastShell().sharePath).toBeUndefined();
  });
});

describe("5. GroupTabs in URL mode", () => {
  beforeEach(() => {
    // TabRail reads reduced-motion; jsdom has no matchMedia.
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

  it("routes Stream / About / Members, keeps a Hall's chain tabs in-page", () => {
    nav.push.mockClear();
    render(
      <GroupTabs
        urlBase="/communities/akash-hall"
        streamPanel={<p>stream</p>}
        aboutPanel={<p>about</p>}
        membersPanel={<p>members</p>}
        collectionsPanel={<p>collections</p>}
        validatorsPanel={<p>validators</p>}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "NFT Collections" }));
    fireEvent.click(screen.getByRole("tab", { name: "Validators" }));
    expect(nav.push).not.toHaveBeenCalled();
    expect(screen.getByText("validators")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "About" }));
    expect(nav.push).toHaveBeenCalledWith("/communities/akash-hall/about");
  });
});

describe("6. metadata names a Hall a Hall", () => {
  it.each([
    ["hall", "Akash Hall · Hall on the Floor"],
    ["user", "Akash Hall · Community on the Floor"],
  ])("%s", async (type, title) => {
    api.getGroup.mockResolvedValue(group(type));
    const meta = await buildGroupMetadata({ slug: "akash-hall", pathPrefix: "/communities" });
    expect(meta.title).toBe(title);
    expect(meta.alternates?.canonical).toBe("/communities/akash-hall");
  });
});
