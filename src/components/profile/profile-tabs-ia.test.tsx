/**
 * Profile IA — parent/child tabs, preserved deep links, and the keyboard model.
 *
 * Two properties here are load-bearing beyond "the right panel shows":
 *
 *   • **Leaf keys survive.** The eight settings sections moved under a
 *     "My Profile" parent, but `?tab=account` still means `?tab=account`.
 *     Eight permanent 308 redirects in next.config.ts point at those URLs.
 *
 *   • **Ownership still gates.** Hiding the buttons is not the gate — a
 *     signed-in NON-owner deep-linking `?tab=account` must fall back, not
 *     mount their own editor under a stranger's handle.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const searchParamsState = vi.hoisted(() => ({ tab: null as string | null }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(
    searchParamsState.tab === null ? "" : `tab=${searchParamsState.tab}`,
  ),
}));

// next/dynamic would resolve real settings panels (and their network hooks).
// Every panel is stubbed to a marker so the tests assert routing, not content.
vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = () => <div data-testid="lazy-panel" />;
    Stub.displayName = "LazyPanelStub";
    return Stub;
  },
}));

function stub(testId: string) {
  const S = () => <div data-testid={testId} />;
  S.displayName = testId;
  return S;
}

vi.mock("@/components/entity/panels/CardReviewsPanel", () => ({ CardReviewsPanel: stub("panel-reviews") }));
vi.mock("./panels/ActivityPanel", () => ({ ActivityPanel: stub("panel-activity") }));
vi.mock("./panels/BackingPanel", () => ({ BackingPanel: stub("panel-backing") }));
vi.mock("./panels/ComingSoonPanel", () => ({ ComingSoonPanel: stub("panel-soon") }));
vi.mock("./panels/DisputesPanel", () => ({ DisputesPanel: stub("panel-disputes") }));
vi.mock("./panels/GroupsPanel", () => ({ GroupsPanel: stub("panel-groups") }));
vi.mock("./panels/PhotosPanel", () => ({ PhotosPanel: stub("panel-photos") }));
vi.mock("./panels/ProfileEditPanel", () => ({ ProfileEditPanel: stub("panel-profile") }));
vi.mock("./panels/ReviewsPanel", () => ({ ReviewsPanel: stub("panel-written") }));
vi.mock("./panels/SetupPanel", () => ({ SetupPanel: stub("panel-setup") }));
vi.mock("./panels/WatchingPanel", () => ({ WatchingPanel: stub("panel-watching") }));

const { ProfileTabs } = await import("@/components/profile/ProfileTabs");

const PROFILE = {
  handle: "dana",
  display_name: "Dana",
  user_id: 42,
  bio: "",
} as never;

function renderTabs(opts: { isOwner: boolean; tab?: string | null }) {
  searchParamsState.tab = opts.tab ?? null;
  return render(
    <ProfileTabs
      handle="dana"
      displayName="Dana"
      isOwner={opts.isOwner}
      targetUserId={42}
      reputationScore={50}
      profile={PROFILE}
      reliability={undefined}
      isSignedIn
      viewerHandle={opts.isOwner ? "dana" : "someone-else"}
      receivedCount={0}
      writtenCount={0}
    />,
  );
}

/** The PARENT strip only (the sub-strip has its own accessible name). */
function parentTabs(): HTMLElement[] {
  return within(screen.getByRole("tablist", { name: "Member sections" }))
    .getAllByRole("tab");
}

/**
 * Just the label. A tab's textContent also swallows its count badge (and the
 * PRIVATE / (SOON) chips), so "Reviews Received" reads as "Reviews Received0".
 * The label is the element's first child text node.
 */
function parentLabels(): string[] {
  return parentTabs().map((t) => (t.firstChild?.textContent ?? "").trim());
}

const SETTINGS_KEYS = [
  "profile",
  "privacy",
  "notifications",
  "messages",
  "communities",
  "showcase",
  "account",
  "blocks",
] as const;

beforeAll(() => {
  // useRovingTabs -> usePrefersReducedMotion calls matchMedia on mount, and
  // jsdom does not implement it. Same stub the sibling render tests use.
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

  // scrollIntoView follows keyboard focus; jsdom has no layout engine.
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  searchParamsState.tab = null;
  window.history.replaceState(null, "", "/u/dana");
});
afterEach(cleanup);

describe("the parent strip", () => {
  it("gives an owner eleven tabs, not eighteen", () => {
    renderTabs({ isOwner: true });
    expect(parentTabs()).toHaveLength(11);
  });

  it("hides both owner-only tabs from a visitor", () => {
    renderTabs({ isOwner: false });
    const labels = parentLabels();
    expect(labels).not.toContain("My Profile");
    expect(labels).not.toContain("My Standing");
    expect(parentTabs()).toHaveLength(9);
  });

  it("does not list the grouped children as top-level tabs", () => {
    renderTabs({ isOwner: true });
    const labels = parentLabels();
    for (const orphan of ["Privacy", "Notifications", "Communities", "Showcase", "Account", "Blocks"]) {
      expect(labels, `${orphan} should be a child, not a parent tab`).not.toContain(orphan);
    }
  });

  it("carries the final labels", () => {
    renderTabs({ isOwner: true });
    const labels = parentLabels();
    expect(labels).toContain("Reviews Received");
    expect(labels).toContain("Reviews Written");
    expect(labels).toContain("My Standing");
    // Unchanged, deliberately.
    expect(labels).toContain("Supporters");
    expect(labels).toContain("Roster");
    // Retired wording must be gone.
    expect(labels).not.toContain("Setup");
    expect(labels).not.toContain("Written");
  });
});

describe("deep links are preserved", () => {
  /**
   * UPDATED for the settings regrouping. The eight leaves used to sit in one
   * flat strip; they now sit under five groups, two of which open a second
   * row. The URL contract is unchanged — every key below is still the key
   * that appears in `?tab=`, which is exactly what this table asserts.
   *
   * Stricter than the version it replaces: it now pins WHICH group each leaf
   * resolves to, and requires that a single-destination group render no
   * child strip at all.
   */
  const LEAF_TO_GROUP: Record<string, { group: string; hasChildStrip: boolean }> = {
    profile:       { group: "profile",       hasChildStrip: true  },
    showcase:      { group: "profile",       hasChildStrip: true  },
    account:       { group: "account",       hasChildStrip: false },
    privacy:       { group: "privacy",       hasChildStrip: true  },
    messages:      { group: "privacy",       hasChildStrip: true  },
    blocks:        { group: "privacy",       hasChildStrip: true  },
    notifications: { group: "notifications", hasChildStrip: false },
    communities:   { group: "communities",   hasChildStrip: false },
  };

  it.each(SETTINGS_KEYS)("?tab=%s selects My Profile, its group and its leaf", (key) => {
    renderTabs({ isOwner: true, tab: key });
    const { group, hasChildStrip } = LEAF_TO_GROUP[key]!;

    const parent = parentTabs().find((t) => t.firstChild?.textContent?.trim() === "My Profile");
    expect(parent, "My Profile tab missing").toBeDefined();
    expect(parent).toHaveAttribute("aria-selected", "true");

    // The GROUP strip is always present, with exactly one group selected.
    const groups = screen.getByRole("tablist", { name: "My Profile settings" });
    const selectedGroups = within(groups).getAllByRole("tab").filter(
      (t) => t.getAttribute("aria-selected") === "true",
    );
    expect(selectedGroups).toHaveLength(1);
    expect(selectedGroups[0]?.id).toBe(`profile-settings-group-tab-${group}`);

    // The CHILD strip exists only where the group holds a real choice.
    const childStrips = screen.queryAllByRole("tablist").filter(
      (l) => (l.getAttribute("aria-label") ?? "").endsWith(" sections") &&
             l.getAttribute("aria-label") !== "Member sections",
    );
    if (hasChildStrip) {
      expect(childStrips, `${key} should open a child strip`).toHaveLength(1);
      const selected = within(childStrips[0]!).getAllByRole("tab").filter(
        (t) => t.getAttribute("aria-selected") === "true",
      );
      expect(selected).toHaveLength(1);
      expect(selected[0]?.id).toBe(`profile-settings-tab-${key}`);
    } else {
      expect(childStrips, `${key} is a destination and must render no child strip`).toHaveLength(0);
    }
  });

  it("?tab=setup still resolves after the My Standing rename", () => {
    renderTabs({ isOwner: true, tab: "setup" });
    const tab = parentTabs().find((t) => t.firstChild?.textContent?.trim() === "My Standing");
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("panel-setup")).toBeInTheDocument();
  });

  it("shows no settings sub-strip on a public tab", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    expect(screen.queryByRole("tablist", { name: "My Profile sections" })).toBeNull();
  });
});

describe("ownership still gates the editors", () => {
  it.each(SETTINGS_KEYS)("a signed-in non-owner on ?tab=%s falls back", (key) => {
    renderTabs({ isOwner: false, tab: key });

    // No sub-strip, no owner editor, and the visitor default is selected.
    expect(screen.queryByRole("tablist", { name: "My Profile sections" })).toBeNull();
    expect(screen.queryByTestId("panel-profile")).toBeNull();
    expect(screen.getByTestId("panel-backing")).toBeInTheDocument();
  });

  it("a non-owner on ?tab=setup falls back too", () => {
    renderTabs({ isOwner: false, tab: "setup" });
    expect(screen.queryByTestId("panel-setup")).toBeNull();
    expect(screen.getByTestId("panel-backing")).toBeInTheDocument();
  });
});

describe("ARIA wiring", () => {
  it("uses roving tabIndex — one stop for the whole strip", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    const tabs = parentTabs();
    const zero = tabs.filter((t) => t.getAttribute("tabindex") === "0");
    expect(zero).toHaveLength(1);
    expect(zero[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs.filter((t) => t.getAttribute("tabindex") === "-1")).toHaveLength(tabs.length - 1);
  });

  it("sets aria-controls ONLY on the selected tab", () => {
    // Only the active panel is rendered; pointing at an absent id would be
    // invalid, and rendering every owner editor to satisfy it would defeat
    // the lazy boundary.
    renderTabs({ isOwner: true, tab: "activity" });
    const withControls = parentTabs().filter((t) => t.hasAttribute("aria-controls"));
    expect(withControls).toHaveLength(1);
    expect(withControls[0]).toHaveAttribute("aria-selected", "true");
    expect(
      document.getElementById(withControls[0]!.getAttribute("aria-controls")!),
    ).not.toBeNull();
  });

  it("mints distinct ids for the parent and sub strips", () => {
    renderTabs({ isOwner: true, tab: "account" });
    const ids = screen.getAllByRole("tab").map((t) => t.id).filter((i) => i !== "");
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("keyboard — MANUAL activation", () => {
  it("Arrow moves focus WITHOUT changing the panel", () => {
    // Panels are lazy and network-backed; arrowing must not mount them.
    renderTabs({ isOwner: true, tab: "activity" });
    const before = parentLabels().find(
      (_l, i) => parentTabs()[i]?.getAttribute("aria-selected") === "true",
    );

    fireEvent.keyDown(document.activeElement ?? parentTabs()[0]!, { key: "ArrowRight" });
    fireEvent.keyDown(
      parentTabs().find((t) => t.getAttribute("tabindex") === "0") ?? parentTabs()[0]!,
      { key: "ArrowRight" },
    );

    const after = parentLabels().find(
      (_l, i) => parentTabs()[i]?.getAttribute("aria-selected") === "true",
    );
    expect(after).toBe(before);
    expect(window.location.search).not.toContain("tab=");
  });

  it("Enter activates the focused tab", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    const tabs = parentTabs();
    const groups = tabs.find((t) => t.firstChild?.textContent?.trim() === "Groups")!;
    fireEvent.keyDown(groups, { key: "Enter" });
    expect(screen.getByTestId("panel-groups")).toBeInTheDocument();
  });

  it("Space activates the focused tab", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    const photos = parentTabs().find((t) => t.firstChild?.textContent?.trim() === "Photos")!;
    fireEvent.keyDown(photos, { key: " " });
    expect(screen.getByTestId("panel-photos")).toBeInTheDocument();
  });

  it("wraps at both ends and honours Home / End", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    const tabs = parentTabs();
    const first = tabs[0]!;
    const last = tabs[tabs.length - 1]!;

    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: "ArrowRight" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "End" });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: "Home" });
    expect(document.activeElement).toBe(first);
  });

  it("applies the same model to the settings GROUP strip", () => {
    // Renamed target only: the settings sub-strip is now two strips, and the
    // group strip is the one that occupies the old position. The keyboard
    // assertions themselves are unchanged.
    renderTabs({ isOwner: true, tab: "profile" });
    const sub = screen.getByRole("tablist", { name: "My Profile settings" });
    const subTabs = within(sub).getAllByRole("tab");

    fireEvent.keyDown(subTabs[0]!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(subTabs[subTabs.length - 1]);
    // Focus moved; selection did not.
    expect(subTabs[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(subTabs[subTabs.length - 1]!, { key: "Enter" });
    expect(screen.getByTestId("lazy-panel")).toBeInTheDocument();
  });
});
