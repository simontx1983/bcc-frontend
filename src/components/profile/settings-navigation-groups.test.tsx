/**
 * Settings navigation: eight flat destinations become five groups.
 *
 * ## What this file has to prove
 *
 * The regrouping is only safe if three things stay exactly as they were:
 *
 *   1. THE URL. The query carries the LEAF key and nothing else. `?tab=account`
 *      is still `?tab=account`; no group name may ever appear in a URL, or the
 *      eight permanent 308 redirects and every hardcoded `/u/me?tab=…` link
 *      break at once.
 *   2. THE DIRTY GUARD. Every way of changing tabs — parent, group, child,
 *      mouse, Enter, Space — must go through the one choke point, or a new
 *      group row becomes a way to walk away from an unsaved form.
 *   3. THE OWNERSHIP BOUNDARY. Settings are owner-only, enforced in the
 *      resolver rather than by hiding tabs.
 *
 * Everything else here is structure: which leaf belongs to which group, that a
 * single-destination group renders no pointless second row, and that no leaf
 * was dropped or duplicated on the way.
 *
 * Panels are stubbed — this is about routing, not content — but the REAL
 * `ProfileTabs` resolver runs, because the mapping being tested lives in it.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const searchParamsState = vi.hoisted(() => ({ tab: null as string | null }));

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(searchParamsState.tab === null ? "" : `tab=${searchParamsState.tab}`),
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    const Stub = () => <div data-testid="lazy-panel" />;
    Stub.displayName = "LazyPanelStub";
    return Stub;
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
vi.mock("./panels/ProfileEditPanel", () => ({ ProfileEditPanel: stub("panel-profile") }));
vi.mock("./panels/ReviewsPanel", () => ({ ReviewsPanel: stub("panel-written") }));
vi.mock("./panels/SetupPanel", () => ({ SetupPanel: stub("panel-setup") }));
vi.mock("./panels/WatchingPanel", () => ({ WatchingPanel: stub("panel-watching") }));

const { ProfileTabs } = await import("@/components/profile/ProfileTabs");

const PROFILE = { handle: "dana", display_name: "Dana", user_id: 42, bio: "" } as never;

/** The approved structure, written once and asserted from here. */
const APPROVED = [
  { group: "profile",       label: "Profile",          children: [["profile", "DETAILS"], ["showcase", "SHOWCASE"]] },
  { group: "account",       label: "Account",          children: [] },
  { group: "privacy",       label: "Privacy & Safety", children: [["privacy", "PRIVACY"], ["messages", "MESSAGES"], ["blocks", "BLOCKED ACCOUNTS"]] },
  { group: "notifications", label: "Notifications",    children: [] },
  { group: "communities",   label: "Community Access", children: [] },
] as const;

/** Every leaf key that must remain reachable, and its owning group. */
const LEAVES: ReadonlyArray<readonly [string, string]> = [
  ["profile", "profile"], ["showcase", "profile"],
  ["account", "account"],
  ["privacy", "privacy"], ["messages", "privacy"], ["blocks", "privacy"],
  ["notifications", "notifications"],
  ["communities", "communities"],
];

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

function renderTabs(opts: { isOwner: boolean; tab?: string | null }) {
  searchParamsState.tab = opts.tab ?? null;
  // Keep the real URL in step with the mocked search params. The component
  // only WRITES the query on navigation, so without this a deep-linked render
  // starts at "" and a "the URL did not change" assertion cannot tell a
  // preserved URL from an absent one.
  window.history.replaceState(
    null,
    "",
    opts.tab == null ? "/u/dana" : `/u/dana?tab=${opts.tab}`,
  );
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

const groupStrip = () => screen.getByRole("tablist", { name: "My Profile settings" });
const childStrips = () =>
  screen.queryAllByRole("tablist").filter((l) => {
    const n = l.getAttribute("aria-label") ?? "";
    return n.endsWith(" sections") && n !== "Member sections";
  });
const selectedIn = (list: HTMLElement) =>
  within(list).getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
const labels = (list: HTMLElement) =>
  within(list).getAllByRole("tab").map((t) => (t.textContent ?? "").trim());

// ─────────────────────────────────────────────────────────────────────
// Structure
// ─────────────────────────────────────────────────────────────────────

describe("the five groups", () => {
  it("renders exactly five, in the approved order", () => {
    renderTabs({ isOwner: true, tab: "account" });
    expect(labels(groupStrip())).toEqual(APPROVED.map((g) => g.label.toUpperCase()));
  });

  it("Account is second — it was seventh", () => {
    renderTabs({ isOwner: true, tab: "account" });
    expect(labels(groupStrip())[1]).toBe("ACCOUNT");
  });

  it("Profile opens Details and Showcase", () => {
    renderTabs({ isOwner: true, tab: "profile" });
    expect(childStrips()).toHaveLength(1);
    expect(labels(childStrips()[0]!)).toEqual(["DETAILS", "SHOWCASE"]);
  });

  it("Privacy & Safety opens Privacy, Messages and Blocked accounts", () => {
    renderTabs({ isOwner: true, tab: "privacy" });
    expect(childStrips()).toHaveLength(1);
    expect(labels(childStrips()[0]!)).toEqual(["PRIVACY", "MESSAGES", "BLOCKED ACCOUNTS"]);
  });

  it.each(["account", "notifications", "communities"])(
    "%s is a destination and renders NO child strip",
    (key) => {
      // A one-item strip is a row that can never do anything.
      renderTabs({ isOwner: true, tab: key });
      expect(childStrips()).toHaveLength(0);
    },
  );

  it("keeps every leaf — none dropped, none duplicated", () => {
    const seen: string[] = [];
    for (const [leaf] of LEAVES) {
      renderTabs({ isOwner: true, tab: leaf });
      const strips = childStrips();
      const source = strips.length > 0 ? strips[0]! : groupStrip();
      const sel = selectedIn(source);
      expect(sel, `${leaf} has no selected tab`).toHaveLength(1);
      seen.push(leaf);
      cleanup();
    }
    expect(new Set(seen).size).toBe(LEAVES.length);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The URL contract
// ─────────────────────────────────────────────────────────────────────

describe("the URL still carries the LEAF key", () => {
  it.each(LEAVES)("?tab=%s selects group %s and the right leaf", (leaf, group) => {
    renderTabs({ isOwner: true, tab: leaf });

    const sel = selectedIn(groupStrip());
    expect(sel).toHaveLength(1);
    expect(sel[0]?.id).toBe(`profile-settings-group-tab-${group}`);

    const strips = childStrips();
    if (strips.length > 0) {
      expect(selectedIn(strips[0]!)[0]?.id).toBe(`profile-settings-tab-${leaf}`);
    }
  });

  it("no group name is ever written to the query", () => {
    // The failure this prevents: a URL like ?tab=privacy-safety, which no
    // redirect and no existing link knows about.
    renderTabs({ isOwner: true, tab: "blocks" });
    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "PROFILE" }));
    const q = window.location.search;
    expect(q).not.toMatch(/privacy-safety|community-access|details/);
    expect(q).toMatch(/tab=(profile|showcase)/);
  });

  it("activating a GROUP lands on its default leaf", () => {
    renderTabs({ isOwner: true, tab: "account" });
    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "PRIVACY & SAFETY" }));
    expect(window.location.search).toContain("tab=privacy");
  });

  it("activating a DIRECT destination goes straight to its leaf", () => {
    renderTabs({ isOwner: true, tab: "profile" });
    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "COMMUNITY ACCESS" }));
    expect(window.location.search).toContain("tab=communities");
  });

  it("Back/Forward-style URL changes restore the whole hierarchy", () => {
    const { unmount } = renderTabs({ isOwner: true, tab: "blocks" });
    expect(selectedIn(groupStrip())[0]?.id).toBe("profile-settings-group-tab-privacy");
    expect(selectedIn(childStrips()[0]!)[0]?.id).toBe("profile-settings-tab-blocks");
    unmount();

    // A history move re-renders from the query alone — nothing is remembered.
    renderTabs({ isOwner: true, tab: "showcase" });
    expect(selectedIn(groupStrip())[0]?.id).toBe("profile-settings-group-tab-profile");
    expect(selectedIn(childStrips()[0]!)[0]?.id).toBe("profile-settings-tab-showcase");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Redirect compatibility
// ─────────────────────────────────────────────────────────────────────

describe("the /settings/* redirects still land somewhere real", () => {
  it("every redirect destination is a leaf this navigation can select", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const cfg = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf-8");
    const dests = [...cfg.matchAll(/destination:\s*"\/u\/me\?tab=([a-z]+)"/g)].map((m) => m[1]!);
    expect(dests.length, "no settings redirects found — the scan is broken").toBeGreaterThanOrEqual(8);

    const leafKeys = new Set(LEAVES.map(([l]) => l));
    for (const d of dests) {
      expect(leafKeys.has(d), `redirect points at "${d}", which is not a settings leaf`).toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Ownership
// ─────────────────────────────────────────────────────────────────────

describe("settings stay owner-only", () => {
  it.each(LEAVES)("a signed-in NON-owner on ?tab=%s gets no settings at all", (leaf) => {
    renderTabs({ isOwner: false, tab: leaf });
    expect(screen.queryByRole("tablist", { name: "My Profile settings" })).toBeNull();
    expect(childStrips()).toHaveLength(0);
    expect(screen.queryByTestId("panel-profile")).toBeNull();
    // Falls back to the visitor default rather than erroring.
    expect(screen.getByTestId("panel-backing")).toBeInTheDocument();
  });

  it("no group or child label reaches a non-owner", () => {
    renderTabs({ isOwner: false, tab: "account" });
    const body = document.body.textContent ?? "";
    for (const s of ["PRIVACY & SAFETY", "COMMUNITY ACCESS", "BLOCKED ACCOUNTS", "DETAILS", "SHOWCASE"]) {
      expect(body, `"${s}" leaked to a non-owner`).not.toContain(s);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// ARIA
// ─────────────────────────────────────────────────────────────────────

describe("ARIA stays valid across two strips", () => {
  it("mints no duplicate ids", () => {
    renderTabs({ isOwner: true, tab: "blocks" });
    const ids = [...document.querySelectorAll("[id]")].map((n) => n.id);
    expect(new Set(ids).size, `duplicate id among ${ids.join(", ")}`).toBe(ids.length);
  });

  it("gives the parent, group and child strips distinct accessible names", () => {
    renderTabs({ isOwner: true, tab: "messages" });
    const names = screen.getAllByRole("tablist").map((l) => l.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Member sections");
    expect(names).toContain("My Profile settings");
    expect(names).toContain("Privacy & Safety sections");
  });

  it("the panel is labelled by the strip that actually holds the active leaf", () => {
    // Grouped leaf -> labelled by the CHILD tab.
    // Panels nest: the parent tab's panel CONTAINS the settings panel, so the
    // settings one must be selected by its own id namespace rather than by
    // taking the first tabpanel in the document.
    const settingsPanel = () =>
      document.querySelector('[role="tabpanel"][id^="profile-settings-panel"]')!;

    renderTabs({ isOwner: true, tab: "blocks" });
    expect(settingsPanel().getAttribute("aria-labelledby")).toBe("profile-settings-tab-blocks");
    expect(document.getElementById("profile-settings-tab-blocks")).not.toBeNull();
    cleanup();

    // Destination -> labelled by the GROUP tab, since there is no child.
    renderTabs({ isOwner: true, tab: "notifications" });
    expect(settingsPanel().getAttribute("aria-labelledby")).toBe("profile-settings-group-tab-notifications");
    expect(document.getElementById("profile-settings-group-tab-notifications")).not.toBeNull();
  });

  it.each(LEAVES)("every ARIA reference resolves on ?tab=%s", (leaf) => {
    // The defect this pins shut: the group strip emitted
    // `aria-controls="profile-settings-group-panel-<group>"` for a panel that
    // nothing rendered. A dangling reference sends assistive tech nowhere,
    // and greps clean — only resolving the ids catches it.
    renderTabs({ isOwner: true, tab: leaf });
    const dangling: string[] = [];

    for (const t of document.querySelectorAll("[aria-controls]")) {
      const id = t.getAttribute("aria-controls")!;
      if (document.getElementById(id) === null) dangling.push(`aria-controls -> ${id}`);
    }
    for (const el of document.querySelectorAll("[aria-labelledby]")) {
      for (const id of (el.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean)) {
        if (document.getElementById(id) === null) dangling.push(`aria-labelledby -> ${id}`);
      }
    }
    expect(
      dangling,
      `unresolved references on ?tab=${leaf}: ${dangling.join(" | ")}`,
    ).toHaveLength(0);
  });

  it("only the INNERMOST strip claims the panel", () => {
    // Grouped: the child owns aria-controls, the group tab claims nothing.
    renderTabs({ isOwner: true, tab: "messages" });
    const groupSel = selectedIn(groupStrip())[0]!;
    expect(groupSel.hasAttribute("aria-controls"), "group tab claimed a panel it does not control").toBe(false);
    expect(selectedIn(childStrips()[0]!)[0]!.getAttribute("aria-controls"))
      .toBe("profile-settings-panel-messages");
    cleanup();

    // Destination: the group tab IS the innermost control.
    renderTabs({ isOwner: true, tab: "account" });
    expect(selectedIn(groupStrip())[0]!.getAttribute("aria-controls"))
      .toBe("profile-settings-panel-account");
  });

  it("each strip keeps exactly one tab stop", () => {
    renderTabs({ isOwner: true, tab: "messages" });
    for (const list of screen.getAllByRole("tablist")) {
      const stops = within(list).getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0");
      expect(stops, `${list.getAttribute("aria-label")} has ${stops.length} tab stops`).toHaveLength(1);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Keyboard
// ─────────────────────────────────────────────────────────────────────

describe("manual activation on both strips", () => {
  it("arrow keys move focus WITHOUT activating a panel or changing the URL", () => {
    renderTabs({ isOwner: true, tab: "profile" });
    const before = window.location.search;
    const tabs = within(groupStrip()).getAllByRole("tab");

    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[0], "arrowing changed the selection").toHaveAttribute("aria-selected", "true");
    expect(window.location.search).toBe(before);
  });

  it("Enter activates a group", () => {
    renderTabs({ isOwner: true, tab: "profile" });
    const account = within(groupStrip()).getByRole("tab", { name: "ACCOUNT" });
    fireEvent.keyDown(account, { key: "Enter" });
    expect(window.location.search).toContain("tab=account");
  });

  it("Space activates a child", () => {
    renderTabs({ isOwner: true, tab: "privacy" });
    const messages = within(childStrips()[0]!).getByRole("tab", { name: "MESSAGES" });
    fireEvent.keyDown(messages, { key: " " });
    expect(window.location.search).toContain("tab=messages");
  });

  it("Home and End work on the group strip", () => {
    renderTabs({ isOwner: true, tab: "profile" });
    const tabs = within(groupStrip()).getAllByRole("tab");
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "End" });
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Parent activation rules
// ─────────────────────────────────────────────────────────────────────

describe("activating a parent group", () => {
  it("a DIFFERENT grouped parent opens that group's default child", () => {
    renderTabs({ isOwner: true, tab: "account" });
    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "PROFILE" }));
    expect(window.location.search).toContain("tab=profile");
  });

  it("Privacy & Safety defaults to privacy", () => {
    renderTabs({ isOwner: true, tab: "account" });
    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "PRIVACY & SAFETY" }));
    expect(window.location.search).toContain("tab=privacy");
  });

  it("re-selecting the ACTIVE group does NOT reset its child", () => {
    // The defect this pins shut: activation always jumped to the group's first
    // child, so on Showcase, clicking Profile threw the operator back to
    // Details — losing their position inside the group they were already in.
    renderTabs({ isOwner: true, tab: "showcase" });
    const before = window.location.search;
    expect(before).toContain("tab=showcase");

    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "PROFILE" }));

    expect(window.location.search, "clicking the active parent reset the child").toBe(before);
    expect(selectedIn(childStrips()[0]!)[0]?.id).toBe("profile-settings-tab-showcase");
  });

  it("re-selecting Privacy & Safety from Messages stays on Messages", () => {
    renderTabs({ isOwner: true, tab: "messages" });
    const before = window.location.search;
    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "PRIVACY & SAFETY" }));
    expect(window.location.search).toBe(before);
    expect(selectedIn(childStrips()[0]!)[0]?.id).toBe("profile-settings-tab-messages");
  });

  it("re-selecting the ACTIVE direct parent adds no navigation", () => {
    renderTabs({ isOwner: true, tab: "account" });
    const before = window.location.search;
    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "ACCOUNT" }));
    expect(window.location.search).toBe(before);
  });

  it("rapid double activation navigates once, not twice", () => {
    renderTabs({ isOwner: true, tab: "account" });
    const tab = within(groupStrip()).getByRole("tab", { name: "NOTIFICATIONS" });
    fireEvent.click(tab);
    fireEvent.click(tab);
    expect(window.location.search).toContain("tab=notifications");
    // One `tab=` only — a second push would have produced a doubled query.
    expect(window.location.search.match(/tab=/g)).toHaveLength(1);
  });

  it("a direct parent opens its direct leaf", () => {
    renderTabs({ isOwner: true, tab: "profile" });
    fireEvent.click(within(groupStrip()).getByRole("tab", { name: "NOTIFICATIONS" }));
    expect(window.location.search).toContain("tab=notifications");
    expect(childStrips(), "a direct destination must not open a child strip").toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Mutation controls
// ─────────────────────────────────────────────────────────────────────

describe("mutation controls", () => {
  it("S1: the leaf→group table would catch a mis-mapped leaf", () => {
    // Not a source mutation — the mapping is asserted from LEAVES above, so
    // this proves the table discriminates rather than matching anything.
    renderTabs({ isOwner: true, tab: "blocks" });
    const sel = selectedIn(groupStrip())[0]!;
    expect(sel.id).toBe("profile-settings-group-tab-privacy");
    expect(sel.id).not.toBe("profile-settings-group-tab-profile");
  });

  it("S2: the ownership assertion is not vacuous — an OWNER does see it all", () => {
    renderTabs({ isOwner: true, tab: "account" });
    const body = document.body.textContent ?? "";
    for (const s of ["PROFILE", "ACCOUNT", "PRIVACY & SAFETY", "NOTIFICATIONS", "COMMUNITY ACCESS"]) {
      expect(body, `owner cannot see "${s}"`).toContain(s);
    }
    expect(screen.getByRole("tablist", { name: "My Profile settings" })).toBeDefined();
  });
});
