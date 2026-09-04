/**
 * The regrouped navigation still renders on the SERVER.
 *
 * "No file under `src/app/` changed" does not prove the server output is the
 * same: `ProfileTabs` is a client component, and a client component still
 * server-renders unless something pushes it behind a `ssr: false` boundary.
 * Grouping moved the visitor's landing panel (`backing`) one level down, so
 * the question is real — if Supporters had ended up inside a lazily-loaded
 * group wrapper, a crawler would get an empty strip and the seeded roster
 * rows would vanish from the HTML.
 *
 * `renderToStaticMarkup` is the honest check: it is the server path, with no
 * DOM, no effects and no client hydration.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("next/dynamic", () => ({
  default: () => {
    const S = () => null;
    S.displayName = "LazyBoundary";
    return S;
  },
}));

// The seeded roster is the thing that must survive into the HTML. Everything
// else about BackingPanel is another suite's business.
vi.mock("./panels/BackingPanel", () => ({
  BackingPanel: ({ rosterSeed }: { rosterSeed?: { rows: string[] } }) => (
    <ul data-testid="supporters">
      {(rosterSeed?.rows ?? []).map((r) => (
        <li key={r}>{r}</li>
      ))}
    </ul>
  ),
}));

const stub = (id: string) => {
  const S = () => <div data-testid={id} />;
  S.displayName = id;
  return S;
};
vi.mock("@/components/entity/panels/CardReviewsPanel", () => ({ CardReviewsPanel: stub("reviews") }));
vi.mock("./panels/ActivityPanel", () => ({ ActivityPanel: stub("activity") }));
vi.mock("./panels/ComingSoonPanel", () => ({ ComingSoonPanel: stub("soon") }));
vi.mock("./panels/DisputesPanel", () => ({ DisputesPanel: stub("disputes") }));
vi.mock("./panels/GroupsPanel", () => ({ GroupsPanel: stub("groups") }));
vi.mock("./panels/PhotosPanel", () => ({ PhotosPanel: stub("photos") }));
vi.mock("./panels/ProfileEditPanel", () => ({ ProfileEditPanel: stub("profile") }));
vi.mock("./panels/ReviewsPanel", () => ({ ReviewsPanel: stub("written") }));
vi.mock("./panels/SetupPanel", () => ({ SetupPanel: stub("setup") }));
vi.mock("./panels/WatchingPanel", () => ({ WatchingPanel: stub("watching") }));

const { ProfileTabs } = await import("@/components/profile/ProfileTabs");

const PROFILE = { handle: "dana", display_name: "Dana", user_id: 42, bio: "" } as never;
const SEED = { rows: ["Seeded Supporter A", "Seeded Supporter B"] } as never;

function ssr(isOwner: boolean, withSeed = true) {
  return renderToStaticMarkup(
    <ProfileTabs
      handle="dana"
      displayName="Dana"
      isOwner={isOwner}
      targetUserId={42}
      reputationScore={50}
      profile={PROFILE}
      reliability={undefined}
      isSignedIn={false}
      viewerHandle={null}
      {...(withSeed ? { rosterSeed: SEED } : {})}
    />,
  );
}

describe("the anonymous default survives server rendering", () => {
  const html = ssr(false);

  it("renders the four visitor groups in the HTML itself", () => {
    for (const g of ["Reputation", "Network", "Activity", "Content"]) {
      expect(html, `${g} missing from server HTML`).toContain(`>${g}<`);
    }
  });

  it("selects NETWORK up top while the leaf stays Supporters", () => {
    // The visitor's landing key is unchanged (`backing`); the regrouping only
    // changed which parent lights up.
    expect(html).toMatch(/id="tab-network"[^>]*aria-selected="true"/);
    expect(html).not.toMatch(/id="tab-reputation"[^>]*aria-selected="true"/);
    expect(html).toContain('id="profile-leaf-tab-backing"');
    expect(html).toMatch(/id="profile-leaf-tab-backing"[^>]*aria-selected="true"/);
  });

  it("keeps the SEEDED roster rows in the server HTML", () => {
    // This is what a crawler reads. If Supporters had slipped behind a lazy
    // boundary, these rows would be gone and the page would look empty.
    expect(html).toContain("Seeded Supporter A");
    expect(html).toContain("Seeded Supporter B");
  });

  it("still renders the panel when no seed is supplied", () => {
    expect(ssr(false, false)).toContain('data-testid="supporters"');
  });

  it("leaks NO owner navigation into anonymous HTML", () => {
    for (const owner of [
      "My Profile", "Standing", "Reliability", "Blocked accounts",
      "Community Access", "Privacy & Safety", "Showcase", "profile-settings",
    ]) {
      expect(html, `${owner} leaked into anonymous server HTML`).not.toContain(owner);
    }
  });

  it("emits no <script>, no inline handler and no client-only placeholder", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/onclick=/i);
  });
});

describe("the owner's server render is a superset, not a different shape", () => {
  const html = ssr(true);

  it("renders five groups", () => {
    for (const g of ["My Profile", "Reputation", "Network", "Activity", "Content"]) {
      expect(html).toContain(`>${g}<`);
    }
  });

  it("owner default is Activity, and it renders no child strip", () => {
    expect(html).toMatch(/id="tab-activity"[^>]*aria-selected="true"/);
    expect(html).not.toContain('id="profile-leaf-tab-');
  });
});

describe("mutation control", () => {
  it("SSR1: the markup assertions are not vacuous", () => {
    const html = ssr(false);
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain('role="tablist"');
    // And the two viewers genuinely differ, so the owner-leak check has teeth.
    expect(ssr(true)).not.toBe(html);
  });
});
