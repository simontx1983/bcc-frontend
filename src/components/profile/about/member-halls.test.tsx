import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MemberHall, MemberProfile } from "@/lib/api/types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { AboutGroupsCard, AboutHallsCard } from "./AboutSections";
import { memberHallHref, splitMemberHalls } from "./member-halls";

afterEach(cleanup);

const row = (id: number, extra: Partial<MemberHall> = {}): MemberHall => ({
  id,
  slug: `group-${id}`,
  name: `Group ${id}`,
  is_primary: false,
  ...extra,
});

const withHalls = (halls: MemberHall[]) => ({ halls }) as unknown as MemberProfile;

describe("splitMemberHalls", () => {
  it('"hall" rows are Halls; every other type, including null, is a group', () => {
    const { halls, groups } = splitMemberHalls([
      row(1, { type: "hall" }),
      row(2, { type: "user" }),
      row(3, { type: "nft" }),
      row(4, { type: null }),
      row(5, { type: "validator" }),
    ]);
    expect(halls.map((r) => r.id)).toEqual([1]);
    expect(groups.map((r) => r.id)).toEqual([2, 3, 4, 5]);
  });

  it("once the field ships, a row missing it is a group", () => {
    const { halls, groups } = splitMemberHalls([row(1, { type: "hall" }), row(2)]);
    expect(halls.map((r) => r.id)).toEqual([1]);
    expect(groups.map((r) => r.id)).toEqual([2]);
  });

  it("a backend before #671 (no type on any row) claims no Halls: one neutral groups list", () => {
    // halls[] has carried every visible group since v1.127, so an untyped
    // row may be a Hall or any other group — never route it to /halls/.
    const { halls, groups } = splitMemberHalls([row(1), row(2)]);
    expect(halls).toEqual([]);
    expect(groups.map((r) => r.id)).toEqual([1, 2]);
    for (const r of groups) expect(memberHallHref(r, false)).toMatch(/^\/communities\//);
  });

  it("links Halls to /halls and groups to /communities", () => {
    expect(memberHallHref(row(1), true)).toBe("/halls/group-1");
    expect(memberHallHref(row(2), false)).toBe("/communities/group-2");
    expect(memberHallHref(row(3, { slug: "" }), true)).toBeNull();
  });
});

describe("About HALLS / GROUPS cards", () => {
  it("renders role_label verbatim and no badge when it is null or absent", () => {
    render(
      <AboutHallsCard
        profile={withHalls([
          row(1, { type: "hall", role_label: "Moderator", role: "moderator" }),
          row(2, { type: "hall", role_label: null, role: "member" }),
          row(3, { type: "hall" }),
        ])}
      />,
    );
    const badges = screen.getAllByTestId("membership-role");
    expect(badges.map((b) => b.textContent)).toEqual(["Moderator"]);
    expect(screen.getByTestId("about-card-halls").textContent).toContain("Halls · 3");
    // The role slug is never rendered as text on its own.
    expect(screen.queryByText("member")).toBeNull();
  });

  it("hides the GROUPS card when there are no group rows", () => {
    const { container } = render(
      <AboutGroupsCard profile={withHalls([row(1, { type: "hall" })])} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("hides the HALLS card when every row is a group", () => {
    const { container } = render(
      <AboutHallsCard profile={withHalls([row(1, { type: "user" })])} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("lists group rows with their role under the name", () => {
    render(
      <AboutGroupsCard
        profile={withHalls([
          row(1, { type: "hall" }),
          row(2, { type: "user", role_label: "Owner" }),
        ])}
      />,
    );
    const card = screen.getByTestId("about-card-groups");
    expect(card.textContent).toContain("Groups · 1");
    expect(card.textContent).toContain("Group 2");
    expect(card.textContent).not.toContain("Group 1");
    expect(screen.getByRole("link", { name: /Group 2/ })).toHaveAttribute(
      "href",
      "/communities/group-2",
    );
  });
});

describe("About groups card on a backend before #671 (no type)", () => {
  it("renders ONE neutral Groups card, no Halls card, all rows to /communities", () => {
    const profile = withHalls([row(1), row(2), row(3)]);
    const { unmount } = render(<AboutHallsCard profile={profile} />);
    expect(screen.queryByTestId("about-card-halls")).toBeNull();
    unmount();

    render(<AboutGroupsCard profile={profile} />);
    const card = screen.getByTestId("about-card-groups");
    expect(card.textContent).toMatch(/Groups/i);
    expect(card.textContent).not.toMatch(/Operator/i);
    const hrefs = Array.from(card.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/communities/group-1", "/communities/group-2", "/communities/group-3"]);
  });
});
