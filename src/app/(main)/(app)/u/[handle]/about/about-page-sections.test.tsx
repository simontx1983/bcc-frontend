/**
 * /u/[handle]/about — SHOW ON PROFILE gating (umbrella #290).
 *
 *   - a visitor gets no card whose `profile.sections` flag is false
 *   - `sections` absent (older backend) → every card renders
 *   - the halls flag hides both HALLS and the GROUPS card
 *   - the owner gets every card, each with the HIDDEN marker slot bound to
 *     its own pref (the marker itself is covered in its own suite)
 *
 * The cards are stubbed to their test ids + the `aside` they receive.
 */

import { cleanup, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { MemberProfileSections } from "@/lib/api/types";

const getUser = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ current: null as null | { user: { handle: string } } }));

vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/api/user-endpoints", () => ({ getUser }));
vi.mock("@/lib/api/client", () => ({
  tokenFromSession: (s: unknown) => (s === null ? null : "tok"),
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
}));
vi.mock("@/components/profile/TrustHeader", () => ({ TrustHeader: () => null }));
vi.mock("@/components/profile/about/AboutCard", () => ({
  AboutBackLink: () => null,
}));

function stub(testId: string) {
  return function Stub({ aside }: { aside?: ReactNode }) {
    return <section data-testid={testId}>{aside}</section>;
  };
}
vi.mock("@/components/profile/about/AboutSections", () => ({
  AboutBioCard: stub("about-card-bio"),
  AboutVerificationsCard: stub("about-card-verifications"),
  AboutHallsCard: stub("about-card-halls"),
  AboutGroupsCard: stub("about-card-groups"),
}));
vi.mock("@/components/profile/about/AboutBlogsCard", () => ({
  AboutBlogsCard: stub("about-card-blogs"),
}));
vi.mock("@/components/profile/about/AboutReviewsCard", () => ({
  AboutReviewsCard: stub("about-card-reviews"),
}));
vi.mock("@/components/profile/about/HiddenFromProfileMarker", () => ({
  HiddenFromProfileMarker: ({ prefKeys }: { prefKeys: string[] }) => (
    <span data-testid="marker">{prefKeys.join(",")}</span>
  ),
}));

const { default: MemberAboutPage } = await import("./page");

afterEach(() => {
  cleanup();
  getUser.mockReset();
  session.current = null;
});

const ALL = [
  "about-card-bio",
  "about-card-verifications",
  "about-card-halls",
  "about-card-groups",
  "about-card-blogs",
  "about-card-reviews",
];

function profile(sections?: Partial<MemberProfileSections>, typed = true) {
  return {
    id: 7,
    user_id: 7,
    handle: "alice",
    display_name: "Alice",
    bio: "hi",
    halls: [{ id: 1, slug: "g", name: "G", ...(typed ? { type: "project" } : {}) }],
    counts: { blog_posts_written: 2, reviews_received: 3 },
    ...(sections !== undefined
      ? {
          sections: {
            about: true,
            verifications: true,
            halls: true,
            operator: true,
            blogs: true,
            reviews: true,
            disputes: true,
            ...sections,
          },
        }
      : {}),
  };
}

const params = Promise.resolve({ handle: "alice" });

async function renderPage() {
  return render(await MemberAboutPage({ params }));
}

function rendered(container: HTMLElement): string[] {
  return ALL.filter((id) => within(container).queryByTestId(id) !== null);
}

describe("about page — SHOW ON PROFILE", () => {
  it("absent sections → every card renders for a visitor", async () => {
    getUser.mockResolvedValue(profile());
    const { container } = await renderPage();
    expect(rendered(container)).toEqual(ALL);
    expect(within(container).queryByTestId("marker")).toBeNull();
  });

  it("a visitor gets no card whose flag is false", async () => {
    getUser.mockResolvedValue(profile({ about: false, blogs: false, reviews: false }));
    const { container } = await renderPage();
    expect(rendered(container)).toEqual([
      "about-card-verifications",
      "about-card-halls",
      "about-card-groups",
    ]);
  });

  it("the halls flag hides both HALLS and GROUPS; operator hides the typed GROUPS card", async () => {
    getUser.mockResolvedValue(profile({ halls: false }));
    let { container } = await renderPage();
    expect(rendered(container)).not.toContain("about-card-halls");
    expect(rendered(container)).not.toContain("about-card-groups");
    cleanup();

    getUser.mockResolvedValue(profile({ operator: false }));
    ({ container } = await renderPage());
    expect(rendered(container)).toContain("about-card-halls");
    expect(rendered(container)).not.toContain("about-card-groups");
    cleanup();

    // Untyped rows are plain membership, not OPERATOR / PROJECTS.
    getUser.mockResolvedValue(profile({ operator: false }, false));
    ({ container } = await renderPage());
    expect(rendered(container)).toContain("about-card-groups");
  });

  it("the owner gets every card, each with the marker for its own pref", async () => {
    session.current = { user: { handle: "alice" } };
    // The server sends the owner all-true; even a false must not hide a card.
    getUser.mockResolvedValue(profile({ about: false }));
    const { container } = await renderPage();
    expect(rendered(container)).toEqual(ALL);
    const markerOf = (id: string) =>
      within(within(container).getByTestId(id)).getByTestId("marker").textContent;
    expect(markerOf("about-card-bio")).toBe("show_about_on_profile");
    expect(markerOf("about-card-verifications")).toBe("show_verifications_on_profile");
    expect(markerOf("about-card-halls")).toBe("show_groups_on_profile");
    expect(markerOf("about-card-groups")).toBe("show_groups_on_profile,show_operator_on_profile");
    expect(markerOf("about-card-blogs")).toBe("show_blogs_on_profile");
    expect(markerOf("about-card-reviews")).toBe("show_reviews_on_profile");
  });
});
