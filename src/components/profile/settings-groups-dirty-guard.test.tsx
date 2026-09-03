/**
 * The settings regrouping must not become a way around the dirty guard.
 *
 * The row of eight had one kind of navigation: click a leaf. There are now
 * three — a parent tab, a group, and a child — and every one of them changes
 * the panel. If any single path skipped the guard, an operator with an
 * unsaved form would lose it by clicking the wrong row, and the loss would be
 * silent.
 *
 * `requestNavigation` from `useSettingsDirtyGuard` is the one choke point.
 * These tests drive the REAL `ProfileTabs` with a REAL dirty registration and
 * assert the observable consequences: the dialog appears, and the URL does
 * NOT change. Asserting the URL matters as much as the dialog — a guard that
 * warns but navigates anyway has still lost the form.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const searchParamsState = vi.hoisted(() => ({ tab: null as string | null }));

/**
 * The real hook, shared with the hoisted mock factories below. A bare
 * `require("@/…")` inside a factory does not resolve under ESM — the alias is
 * a bundler concern, not a Node one — so the binding is captured here instead
 * and filled in after imports settle.
 */
const dirty = vi.hoisted(() => ({ use: null as null | ((o: { id: string; label: string; isDirty: boolean; isSaving: boolean }) => void) }));

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(searchParamsState.tab === null ? "" : `tab=${searchParamsState.tab}`),
}));

/**
 * The settings panels are lazy. This stub registers a DIRTY form the moment
 * it mounts, which is what gives the guard something to protect — the real
 * panels do the same through `useDirtyRegistration`.
 */
vi.mock("next/dynamic", () => ({
  default: () => {
    const DirtyPanel = () => {
      dirty.use?.({ id: "test-form", label: "Test form", isDirty: true, isSaving: false });
      return <div data-testid="lazy-panel" />;
    };
    DirtyPanel.displayName = "DirtyLazyPanel";
    return DirtyPanel;
  },
}));

function stub(id: string) {
  const S = () => <div data-testid={id} />;
  S.displayName = id;
  return S;
}
vi.mock("@/components/entity/panels/CardReviewsPanel", () => ({ CardReviewsPanel: stub("panel-reviews") }));
vi.mock("./panels/ActivityPanel", () => ({ ActivityPanel: stub("panel-activity") }));
vi.mock("./panels/BackingPanel", () => ({ BackingPanel: stub("panel-backing") }));
vi.mock("./panels/ComingSoonPanel", () => ({ ComingSoonPanel: stub("panel-soon") }));
vi.mock("./panels/DisputesPanel", () => ({ DisputesPanel: stub("panel-disputes") }));
vi.mock("./panels/GroupsPanel", () => ({ GroupsPanel: stub("panel-groups") }));
vi.mock("./panels/PhotosPanel", () => ({ PhotosPanel: stub("panel-photos") }));
vi.mock("./panels/ReviewsPanel", () => ({ ReviewsPanel: stub("panel-written") }));
vi.mock("./panels/SetupPanel", () => ({ SetupPanel: stub("panel-setup") }));
vi.mock("./panels/WatchingPanel", () => ({ WatchingPanel: stub("panel-watching") }));

/** ProfileEditPanel is NOT lazy, so it needs its own dirty registration. */
vi.mock("./panels/ProfileEditPanel", () => ({
  ProfileEditPanel: () => {
    dirty.use?.({ id: "details-form", label: "Details", isDirty: true, isSaving: false });
    return <div data-testid="panel-profile" />;
  },
}));

const { useDirtyRegistration } = await import("@/hooks/useDirtyRegistration");
dirty.use = useDirtyRegistration;

const { ProfileTabs } = await import("@/components/profile/ProfileTabs");

const PROFILE = { handle: "dana", display_name: "Dana", user_id: 42, bio: "" } as never;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  searchParamsState.tab = null;
  window.history.replaceState(null, "", "/u/dana");
});
afterEach(cleanup);

function renderAt(tab: string) {
  searchParamsState.tab = tab;
  window.history.replaceState(null, "", `/u/dana?tab=${tab}`);
  return render(
    <ProfileTabs
      handle="dana" displayName="Dana" isOwner
      targetUserId={42} reputationScore={50} profile={PROFILE}
      reliability={undefined} isSignedIn viewerHandle="dana"
      receivedCount={0} writtenCount={0}
    />,
  );
}

const groupStrip = () => screen.getByRole("tablist", { name: "My Profile settings" });
const childStrip = () =>
  screen.getAllByRole("tablist").find((l) => {
    const n = l.getAttribute("aria-label") ?? "";
    return n.endsWith(" sections") && n !== "Member sections";
  })!;
const parentStrip = () => screen.getByRole("tablist", { name: "Member sections" });
const dialog = () => screen.queryByRole("dialog");

/** The guard is only meaningful if something is actually dirty. */
function assertArmed() {
  expect(
    screen.queryByTestId("lazy-panel") ?? screen.queryByTestId("panel-profile"),
    "no settings panel mounted, so nothing registered dirty — the test would pass vacuously",
  ).not.toBeNull();
}

describe("a dirty form survives every navigation path", () => {
  it("GROUP click is guarded — dialog appears, URL unchanged", () => {
    renderAt("profile");
    assertArmed();
    const before = window.location.search;

    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "ACCOUNT" }));

    expect(dialog(), "clicking another group walked past the guard").not.toBeNull();
    expect(window.location.search, "the URL moved despite the warning").toBe(before);
  });

  it("CHILD click is guarded", () => {
    renderAt("privacy");
    assertArmed();
    const before = window.location.search;

    fireEvent.click(within(childStrip()).getByRole("tab", { name: "MESSAGES" }));

    expect(dialog()).not.toBeNull();
    expect(window.location.search).toBe(before);
  });

  it("DIRECT-destination group click is guarded", () => {
    // Community Access has no child strip, so its activation path differs.
    renderAt("profile");
    assertArmed();
    const before = window.location.search;

    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "COMMUNITY ACCESS" }));

    expect(dialog()).not.toBeNull();
    expect(window.location.search).toBe(before);
  });

  it("PARENT tab click is guarded", () => {
    renderAt("profile");
    assertArmed();
    const before = window.location.search;

    const activity = within(parentStrip()).getAllByRole("tab")
      .find((t) => (t.firstChild?.textContent ?? "").trim() === "Activity")!;
    fireEvent.click(activity);

    expect(dialog()).not.toBeNull();
    expect(window.location.search).toBe(before);
  });

  it("ENTER on a group is guarded", () => {
    renderAt("privacy");
    assertArmed();
    const before = window.location.search;

    fireEvent.keyDown(within(groupStrip()).getByRole("tab", { name: "ACCOUNT" }), { key: "Enter" });

    expect(dialog()).not.toBeNull();
    expect(window.location.search).toBe(before);
  });

  it("SPACE on a child is guarded", () => {
    renderAt("privacy");
    assertArmed();
    const before = window.location.search;

    fireEvent.keyDown(within(childStrip()).getByRole("tab", { name: "BLOCKED ACCOUNTS" }), { key: " " });

    expect(dialog()).not.toBeNull();
    expect(window.location.search).toBe(before);
  });

  it("ARROW keys are not navigation and raise no dialog", () => {
    renderAt("profile");
    assertArmed();
    const tabs = within(groupStrip()).getAllByRole("tab");
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(dialog(), "arrowing should move focus only").toBeNull();
  });
});

describe("resolving the dialog", () => {
  it("Discard navigates EXACTLY once", () => {
    renderAt("profile");
    assertArmed();
    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "ACCOUNT" }));

    const d = screen.getByRole("dialog");
    const discard = within(d).getAllByRole("button")
      .find((b) => /discard|leave|don.t save/i.test(b.textContent ?? ""))!;
    expect(discard, "no discard affordance in the dialog").toBeDefined();
    fireEvent.click(discard);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toContain("tab=account");
    // One move, not two: the guard must not also replay the original click.
    expect(window.location.search.match(/tab=/g)).toHaveLength(1);
  });

  it("Cancel keeps the leaf, the form and the URL", () => {
    renderAt("privacy");
    assertArmed();
    const before = window.location.search;
    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "ACCOUNT" }));

    const d = screen.getByRole("dialog");
    const stay = within(d).getAllByRole("button")
      .find((b) => /stay|cancel|keep/i.test(b.textContent ?? ""))!;
    fireEvent.click(stay);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe(before);
    // Still on the same leaf, with the same strip open.
    expect(
      within(groupStrip()).getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true")[0]?.id,
    ).toBe("profile-settings-group-tab-privacy");
  });
});

describe("mutation control", () => {
  it("D1: the guard assertions are not vacuous — a CLEAN form navigates freely", () => {
    // Every test above asserts a dialog appeared. If the dialog appeared
    // unconditionally, they would all pass for the wrong reason. Here nothing
    // is dirty, so the same click must go straight through.
    searchParamsState.tab = "account";
    window.history.replaceState(null, "", "/u/dana?tab=account");
    render(
      <ProfileTabs
        handle="dana" displayName="Dana" isOwner
        targetUserId={42} reputationScore={50} profile={PROFILE}
        reliability={undefined} isSignedIn viewerHandle="dana"
        receivedCount={0} writtenCount={0}
      />,
    );
    // `account` mounts the lazy stub, which registers dirty — so navigate
    // from a PUBLIC tab instead, where nothing is registered at all.
    cleanup();
    searchParamsState.tab = "activity";
    window.history.replaceState(null, "", "/u/dana?tab=activity");
    render(
      <ProfileTabs
        handle="dana" displayName="Dana" isOwner
        targetUserId={42} reputationScore={50} profile={PROFILE}
        reliability={undefined} isSignedIn viewerHandle="dana"
        receivedCount={0} writtenCount={0}
      />,
    );
    expect(screen.getByTestId("panel-activity")).toBeInTheDocument();

    const groups = within(parentStrip()).getAllByRole("tab");
    const disputes = groups.find((t) => (t.firstChild?.textContent ?? "").trim() === "Disputes")!;
    fireEvent.click(disputes);

    expect(screen.queryByRole("dialog"), "a clean form must not warn").toBeNull();
    expect(window.location.search).toContain("tab=disputes");
  });
});
