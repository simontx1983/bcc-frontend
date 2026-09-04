/**
 * The profile-level regrouping: eleven top-level tabs become five.
 *
 * The hierarchy itself is the contract here, so it is asserted as EXACT
 * ordered lists and exact counts rather than as "contains". The first cut of
 * this change shipped Supporters under Reputation instead of Network, which
 * gave Reputation six children for an owner and four for a visitor. Every
 * "contains" assertion in the world passes that. Only an exact list catches it.
 *
 * Three further properties carry real risk:
 *
 *   • **Every legacy `?tab=` key still resolves, to the same content.** Two
 *     could have been repointed silently: `?tab=setup` used to open a panel
 *     whose own default sub-tab was Standing, `?tab=watching` one whose
 *     default was Watchers. Those sub-tabs are leaves now, so the keys must
 *     land on Standing and Watchers specifically. The panel stubs expose
 *     `section` and `direction` for exactly that — asserting "the Setup panel
 *     mounted" would pass either way.
 *
 *   • **Ownership gates by URL, not by hidden buttons.** The owner-only set
 *     grew: `reliability` joined the eight settings leaves, and it sits inside
 *     Reputation — a group visitors DO see. A leaf inheriting its group's
 *     visibility would expose it.
 *
 *   • **No parent name can reach the query.** Group keys are a separate type
 *     from `TabKey`, so this is structural; the tests below prove the
 *     structure holds at runtime too.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Raw query string, so malformed and repeated values can be exercised. */
const sp = vi.hoisted(() => ({ query: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(sp.query),
}));

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
vi.mock("./panels/DisputesPanel", () => ({ DisputesPanel: stub("panel-disputes") }));
vi.mock("./panels/GroupsPanel", () => ({ GroupsPanel: stub("panel-groups") }));
vi.mock("./panels/PhotosPanel", () => ({ PhotosPanel: stub("panel-photos") }));
vi.mock("./panels/ProfileEditPanel", () => ({ ProfileEditPanel: stub("panel-profile") }));
vi.mock("./panels/ReviewsPanel", () => ({ ReviewsPanel: stub("panel-written") }));

vi.mock("./panels/ComingSoonPanel", () => ({
  ComingSoonPanel: ({ label }: { label: string }) => (
    <div data-testid="panel-soon" data-label={label} />
  ),
}));

// The two flattened panels expose the prop that chooses which half renders.
vi.mock("./panels/SetupPanel", () => ({
  SetupPanel: ({ section }: { section: string }) => (
    <div data-testid="panel-setup" data-section={section} />
  ),
}));
vi.mock("./panels/WatchingPanel", () => ({
  WatchingPanel: ({ direction }: { direction: string }) => (
    <div data-testid="panel-watching" data-direction={direction} />
  ),
}));

const { ProfileTabs } = await import("@/components/profile/ProfileTabs");

const PROFILE = { handle: "dana", display_name: "Dana", user_id: 42, bio: "" } as never;

interface RenderOpts {
  isOwner: boolean;
  /** Leaf key; becomes `?tab=<key>`. Use `query` for anything exotic. */
  tab?: string | null;
  /** Raw query string, for malformed / repeated / empty values. */
  query?: string;
  receivedCount?: number;
  writtenCount?: number;
  tabs?: unknown[];
}

function renderTabs(opts: RenderOpts) {
  sp.query = opts.query ?? (opts.tab === undefined || opts.tab === null ? "" : `tab=${opts.tab}`);
  window.history.replaceState(null, "", sp.query === "" ? "/u/dana" : `/u/dana?${sp.query}`);
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
      {...(opts.receivedCount !== undefined ? { receivedCount: opts.receivedCount } : {})}
      {...(opts.writtenCount !== undefined ? { writtenCount: opts.writtenCount } : {})}
      {...(opts.tabs !== undefined ? { tabs: opts.tabs as never } : {})}
    />,
  );
}

// ── strip accessors ──────────────────────────────────────────────────
const groupStrip = () => screen.getByRole("tablist", { name: "Member sections" });
const groupTabs = () => within(groupStrip()).getAllByRole("tab");
/** Group label alone — a group must never render a badge, but read the label
 *  node rather than textContent so this stays true if one is ever added. */
const groupLabels = () => groupTabs().map((t) => (t.firstChild?.textContent ?? "").trim());
const selectedGroupLabel = () =>
  (groupTabs().find((t) => t.getAttribute("aria-selected") === "true")
    ?.firstChild?.textContent ?? "").trim();

/** Strips are found by the id namespace their tabs are minted under, never by
 *  accessible name — names are content and shift with the hierarchy. */
function stripWithIdPrefix(prefix: string): HTMLElement | undefined {
  return screen
    .queryAllByRole("tablist")
    .find((l) => within(l).queryAllByRole("tab").some((t) => t.id.startsWith(prefix)));
}
const leafStrip = () => stripWithIdPrefix("profile-leaf-tab-");
const settingsGroupStrip = () => stripWithIdPrefix("profile-settings-group-tab-");
const settingsLeafStrip = () => stripWithIdPrefix("profile-settings-tab-");

/** Leaf labels exactly as SubTabNav renders them (it uppercases). */
const labelsIn = (list: HTMLElement) =>
  within(list)
    .getAllByRole("tab")
    .map((t) => (t.firstChild?.textContent ?? "").trim());
const selectedIn = (list: HTMLElement) =>
  within(list)
    .getAllByRole("tab")
    .filter((t) => t.getAttribute("aria-selected") === "true");
const clickGroup = (label: string) =>
  fireEvent.click(groupTabs().find((t) => (t.firstChild?.textContent ?? "").trim() === label)!);

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  sp.query = "";
  window.history.replaceState(null, "", "/u/dana");
});
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────
// The required count matrix, measured from the rendered DOM
// ─────────────────────────────────────────────────────────────────────

describe("exact tab counts per named tablist", () => {
  /** [strip, tab that opens it, owner count, visitor count | null = absent] */
  const MATRIX: ReadonlyArray<[string, string, number, number | null]> = [
    ["top-level groups",          "activity", 5, 4],
    ["Reputation children",       "reviews",  5, 3],
    ["Network children",          "backing",  4, 4],
    ["Content children",          "blog",     2, 2],
    ["My Profile settings groups", "profile", 5, null],
    ["Profile settings children",  "profile", 2, null],
    ["Privacy & Safety children",  "privacy", 3, null],
  ];

  function count(name: string): number | null {
    if (name === "top-level groups") return groupTabs().length;
    if (name === "My Profile settings groups") {
      const s = settingsGroupStrip();
      return s === undefined ? null : within(s).getAllByRole("tab").length;
    }
    if (name.endsWith("settings children") || name === "Privacy & Safety children") {
      const s = settingsLeafStrip();
      return s === undefined ? null : within(s).getAllByRole("tab").length;
    }
    const s = leafStrip();
    return s === undefined ? null : within(s).getAllByRole("tab").length;
  }

  it.each(MATRIX)("%s — owner", (name, tab, owner) => {
    renderTabs({ isOwner: true, tab });
    expect(count(name)).toBe(owner);
  });

  it.each(MATRIX)("%s — visitor", (name, tab, _owner, visitor) => {
    renderTabs({ isOwner: false, tab });
    expect(count(name)).toBe(visitor);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Hierarchy
// ─────────────────────────────────────────────────────────────────────

describe("the top level", () => {
  it("an owner sees exactly these five, in this order", () => {
    renderTabs({ isOwner: true });
    expect(groupLabels()).toEqual([
      "My Profile", "Reputation", "Network", "Activity", "Content",
    ]);
  });

  it("a visitor sees exactly these four, in this order", () => {
    renderTabs({ isOwner: false });
    expect(groupLabels()).toEqual(["Reputation", "Network", "Activity", "Content"]);
  });

  it("NO retired top-level destination survives as a group", () => {
    renderTabs({ isOwner: true });
    const labels = groupLabels();
    for (const gone of [
      "My Standing", "Supporters", "Reviews Received", "Reviews Written",
      "Roster", "Photos", "Disputes", "Groups", "Blog", "Setup", "Watching",
    ]) {
      expect(labels, `${gone} must live under a group, not beside them`).not.toContain(gone);
    }
  });

  it("a group carries no count badge and no PRIVATE chip", () => {
    // A count on "Reputation" would have to add unlike quantities into one
    // number that answers nothing.
    renderTabs({ isOwner: true, tab: "reviews", receivedCount: 7, writtenCount: 3 });
    for (const t of groupTabs()) {
      expect(t.querySelector(".bcc-tab-count")).toBeNull();
      expect(t.textContent).not.toMatch(/PRIVATE/);
    }
  });
});

describe("exact group contents, in order", () => {
  it("Reputation — owner", () => {
    renderTabs({ isOwner: true, tab: "reviews" });
    expect(labelsIn(leafStrip()!)).toEqual([
      "STANDING", "RELIABILITY", "REVIEWS RECEIVED", "REVIEWS WRITTEN", "DISPUTES",
    ]);
  });

  it("Reputation — visitor keeps only the public three", () => {
    renderTabs({ isOwner: false, tab: "reviews" });
    expect(labelsIn(leafStrip()!)).toEqual([
      "REVIEWS RECEIVED", "REVIEWS WRITTEN", "DISPUTES",
    ]);
  });

  it("Network — four, identical for owner and visitor", () => {
    renderTabs({ isOwner: true, tab: "backing" });
    expect(labelsIn(leafStrip()!)).toEqual([
      "SUPPORTERS", "WATCHERS", "WATCHING", "COMMUNITIES",
    ]);
    cleanup();
    renderTabs({ isOwner: false, tab: "backing" });
    expect(labelsIn(leafStrip()!)).toEqual([
      "SUPPORTERS", "WATCHERS", "WATCHING", "COMMUNITIES",
    ]);
  });

  it("Content — Blog then Photos", () => {
    renderTabs({ isOwner: false, tab: "blog" });
    expect(labelsIn(leafStrip()!)).toEqual(["BLOG", "PHOTOS"]);
  });

  it("the label GROUPS is gone from profile navigation", () => {
    for (const owner of [true, false]) {
      cleanup();
      renderTabs({ isOwner: owner, tab: "groups" });
      const all = screen.getAllByRole("tab").map((t) => (t.firstChild?.textContent ?? "").trim());
      expect(all, "the retired Groups label came back").not.toContain("GROUPS");
      expect(all).toContain("COMMUNITIES");
    }
  });

  it("Activity is a DESTINATION — one leaf, so no second row at all", () => {
    renderTabs({ isOwner: false, tab: "activity" });
    expect(leafStrip(), "Activity grew a one-item strip").toBeUndefined();
    expect(screen.getByTestId("panel-activity")).toBeInTheDocument();
  });

  it("My Profile delegates to the settings manifest, not to a leaf strip", () => {
    renderTabs({ isOwner: true, tab: "profile" });
    expect(settingsGroupStrip()).toBeDefined();
    expect(leafStrip(), "My Profile forked its own strip").toBeUndefined();
    expect(labelsIn(settingsGroupStrip()!)).toEqual([
      "PROFILE", "ACCOUNT", "PRIVACY & SAFETY", "NOTIFICATIONS", "COMMUNITY ACCESS",
    ]);
  });
});

describe("defaults when a group is activated", () => {
  it("owner opening Reputation lands on STANDING", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    clickGroup("Reputation");
    expect(screen.getByTestId("panel-setup")).toHaveAttribute("data-section", "standing");
    expect(window.location.search).toContain("tab=setup");
  });

  it("visitor opening Reputation lands on REVIEWS RECEIVED", () => {
    renderTabs({ isOwner: false, tab: "activity" });
    clickGroup("Reputation");
    expect(screen.getByTestId("panel-reviews")).toBeInTheDocument();
    expect(window.location.search).toContain("tab=reviews");
  });

  it("Network opens on Supporters for both viewers", () => {
    for (const owner of [true, false]) {
      cleanup();
      renderTabs({ isOwner: owner, tab: "activity" });
      clickGroup("Network");
      expect(screen.getByTestId("panel-backing")).toBeInTheDocument();
      expect(window.location.search).toContain("tab=backing");
    }
  });

  it("Content opens on Blog", () => {
    renderTabs({ isOwner: false, tab: "activity" });
    clickGroup("Content");
    expect(window.location.search).toContain("tab=blog");
  });

  it("My Profile opens on Details", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    clickGroup("My Profile");
    expect(window.location.search).toContain("tab=profile");
    expect(selectedIn(settingsLeafStrip()!)[0]?.id).toBe("profile-settings-tab-profile");
  });

  it("a visitor is never sent to an owner-only leaf by a group default", () => {
    renderTabs({ isOwner: false, tab: "activity" });
    clickGroup("Reputation");
    expect(window.location.search).not.toContain("tab=setup");
    expect(window.location.search).not.toContain("tab=reliability");
  });
});

// ─────────────────────────────────────────────────────────────────────
// URL contract
// ─────────────────────────────────────────────────────────────────────

/** Every visible destination → its required query key, group, and panel. */
const URL_MAP: ReadonlyArray<[string, string, string, string]> = [
  ["Details",          "profile",       "My Profile", "panel-profile"],
  ["Showcase",         "showcase",      "My Profile", "lazy-panel"],
  ["Account",          "account",       "My Profile", "lazy-panel"],
  ["Privacy",          "privacy",       "My Profile", "lazy-panel"],
  ["Messages",         "messages",      "My Profile", "lazy-panel"],
  ["Blocked Accounts", "blocks",        "My Profile", "lazy-panel"],
  ["Notifications",    "notifications", "My Profile", "lazy-panel"],
  ["Community Access", "communities",   "My Profile", "lazy-panel"],
  ["Standing",         "setup",         "Reputation", "panel-setup"],
  ["Reliability",      "reliability",   "Reputation", "panel-setup"],
  ["Reviews Received", "reviews",       "Reputation", "panel-reviews"],
  ["Reviews Written",  "written",       "Reputation", "panel-written"],
  ["Disputes",         "disputes",      "Reputation", "panel-disputes"],
  ["Supporters",       "backing",       "Network",    "panel-backing"],
  ["Watchers",         "watching",      "Network",    "panel-watching"],
  ["Watching",         "following",     "Network",    "panel-watching"],
  ["Communities",      "groups",        "Network",    "panel-groups"],
  ["Activity",         "activity",      "Activity",   "panel-activity"],
  ["Blog",             "blog",          "Content",    "lazy-panel"],
  ["Photos",           "photos",        "Content",    "panel-photos"],
];

describe("the URL mapping, proved behaviourally", () => {
  it.each(URL_MAP)("%s ⇒ ?tab=%s selects %s", (_name, key, group, panel) => {
    renderTabs({ isOwner: true, tab: key });
    expect(selectedGroupLabel()).toBe(group);
    expect(screen.getByTestId(panel)).toBeInTheDocument();
  });

  it("the table covers every leaf the manifest accepts", () => {
    // Stops the table drifting behind the manifest: a leaf added to a group
    // but forgotten here would never be exercised.
    const seen = new Set<string>();
    for (const tab of ["reviews", "backing", "blog"]) {
      cleanup();
      renderTabs({ isOwner: true, tab });
      for (const t of within(leafStrip()!).getAllByRole("tab")) {
        seen.add(t.id.replace("profile-leaf-tab-", ""));
      }
    }
    seen.add("activity");
    cleanup();
    renderTabs({ isOwner: true, tab: "profile" });
    const settingsGroups = within(settingsGroupStrip()!).getAllByRole("tab").length;
    // 8 settings leaves under 5 settings groups.
    expect(settingsGroups).toBe(5);
    expect(seen.size + 8).toBe(URL_MAP.length);
  });
});

describe("the two keys that could have been silently repointed", () => {
  it("?tab=setup opens STANDING, the sub-tab it already opened", () => {
    renderTabs({ isOwner: true, tab: "setup" });
    expect(screen.getByTestId("panel-setup")).toHaveAttribute("data-section", "standing");
    expect(selectedIn(leafStrip()!)[0]?.id).toBe("profile-leaf-tab-setup");
  });

  it("?tab=watching opens WATCHERS, the sub-tab it already opened", () => {
    renderTabs({ isOwner: false, tab: "watching" });
    expect(screen.getByTestId("panel-watching")).toHaveAttribute("data-direction", "followers");
    expect(selectedIn(leafStrip()!)[0]?.id).toBe("profile-leaf-tab-watching");
  });

  it("?tab=groups still renders the communities panel", () => {
    renderTabs({ isOwner: false, tab: "groups" });
    expect(screen.getByTestId("panel-groups")).toBeInTheDocument();
    expect(selectedIn(leafStrip()!)[0]?.id).toBe("profile-leaf-tab-groups");
  });

  it("?tab=reliability and ?tab=following are ADDITIVE new keys", () => {
    renderTabs({ isOwner: true, tab: "reliability" });
    expect(screen.getByTestId("panel-setup")).toHaveAttribute("data-section", "reliability");
    cleanup();
    renderTabs({ isOwner: true, tab: "following" });
    expect(screen.getByTestId("panel-watching")).toHaveAttribute("data-direction", "following");
  });
});

describe("no parent name can reach the query", () => {
  const GROUP_KEYS = ["my-profile", "reputation", "network", "content"];

  it("clicking every group writes only a leaf key, and only one param", () => {
    const written: string[] = [];
    for (const label of ["My Profile", "Reputation", "Network", "Content"]) {
      cleanup();
      renderTabs({ isOwner: true, tab: "activity" });
      clickGroup(label);
      const params = new URLSearchParams(window.location.search);
      expect([...params.keys()], `${label} added a second query parameter`).toEqual(["tab"]);
      written.push(params.get("tab")!);
    }
    expect(written).toEqual(["profile", "setup", "backing", "blog"]);
    for (const w of written) expect(GROUP_KEYS).not.toContain(w);
  });

  it("a group key is never itself a reachable leaf", () => {
    // The invariant: a group key resolves to a panel only when the group has
    // exactly one leaf whose key equals it (Activity). Everything else must
    // fall back.
    for (const key of GROUP_KEYS) {
      cleanup();
      renderTabs({ isOwner: true, query: `tab=${key}` });
      // `profile` IS a real leaf; `my-profile` is the group key and must not be.
      expect(screen.getByTestId("panel-activity"), `${key} resolved to a panel`).toBeInTheDocument();
    }
  });

  it("rapid activation cannot leave conflicting parameters behind", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    clickGroup("Reputation");
    clickGroup("Network");
    clickGroup("Content");
    const params = new URLSearchParams(window.location.search);
    expect([...params.keys()]).toEqual(["tab"]);
    expect(params.getAll("tab")).toHaveLength(1);
    expect(params.get("tab")).toBe("blog");
  });

  it("activation REPLACES history rather than pushing", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    const before = window.history.length;
    clickGroup("Reputation");
    clickGroup("Network");
    expect(window.history.length, "a history entry per tab click").toBe(before);
  });

  it("an unrelated query parameter is preserved", () => {
    renderTabs({ isOwner: true, query: "tab=activity&ref=email" });
    clickGroup("Content");
    const params = new URLSearchParams(window.location.search);
    expect(params.get("ref")).toBe("email");
    expect(params.get("tab")).toBe("blog");
  });
});

describe("malformed, empty, repeated and unknown values", () => {
  it.each([
    ["empty", "tab="],
    ["whitespace", "tab=%20%20"],
    ["unknown word", "tab=not-a-tab"],
    ["punctuation", "tab=%25%25%25"],
    ["uppercase of a real key", "tab=ACTIVITY"],
    ["path-ish", "tab=..%2F..%2Fetc"],
    ["no tab param at all", "other=1"],
  ])("%s falls back safely for an owner", (_n, query) => {
    renderTabs({ isOwner: true, query });
    expect(screen.getByTestId("panel-activity")).toBeInTheDocument();
    expect(screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true"))
      .toHaveLength(1);
  });

  it("a repeated tab parameter uses the first and stays deterministic", () => {
    renderTabs({ isOwner: false, query: "tab=reviews&tab=blog" });
    expect(screen.getByTestId("panel-reviews")).toBeInTheDocument();
    expect(selectedGroupLabel()).toBe("Reputation");
  });

  it("a visitor's malformed value falls back to Supporters, not to an owner leaf", () => {
    renderTabs({ isOwner: false, query: "tab=%25%25%25" });
    expect(screen.getByTestId("panel-backing")).toBeInTheDocument();
    expect(selectedGroupLabel()).toBe("Network");
  });
});

describe("?tab=network cannot bypass leaf selection", () => {
  // `network` is a dormant §9 contract key. It has no leaf and no panel, and
  // the Network GROUP does not resurrect it — the group's key lives in a
  // different namespace entirely.
  it("an owner gets the ordinary fallback and no placeholder", () => {
    renderTabs({ isOwner: true, tab: "network" });
    expect(screen.getByTestId("panel-activity")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-soon"), "a stale placeholder rendered").toBeNull();
    expect(selectedGroupLabel()).toBe("Activity");
  });

  it("a visitor gets the ordinary fallback and no placeholder", () => {
    renderTabs({ isOwner: false, tab: "network" });
    expect(screen.getByTestId("panel-backing")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-soon")).toBeNull();
    expect(selectedGroupLabel()).toBe("Network");
  });

  it("it selects exactly one leaf — never zero, never two", () => {
    renderTabs({ isOwner: true, tab: "network" });
    const selected = screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
  });

  it("the URL is left alone — falling back must not rewrite someone's link", () => {
    renderTabs({ isOwner: true, tab: "network" });
    expect(window.location.search).toBe("?tab=network");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Ownership and privacy
// ─────────────────────────────────────────────────────────────────────

const OWNER_ONLY_KEYS = [
  "profile", "showcase", "account", "privacy", "messages", "blocks",
  "notifications", "communities",
  "setup", "reliability",
] as const;

describe("ownership gates by URL, not by hidden buttons", () => {
  it.each(OWNER_ONLY_KEYS)("a signed-in NON-owner on ?tab=%s falls back", (key) => {
    renderTabs({ isOwner: false, tab: key });
    expect(screen.getByTestId("panel-backing")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-profile")).toBeNull();
    expect(screen.queryByTestId("panel-setup")).toBeNull();
    expect(settingsGroupStrip()).toBeUndefined();
    expect(settingsLeafStrip()).toBeUndefined();
  });

  it("a visitor's Reputation strip never names Standing or Reliability", () => {
    renderTabs({ isOwner: false, tab: "reviews" });
    const labels = labelsIn(leafStrip()!);
    expect(labels).not.toContain("STANDING");
    expect(labels).not.toContain("RELIABILITY");
  });

  it("no settings vocabulary appears anywhere for a visitor", () => {
    renderTabs({ isOwner: false, tab: "reviews" });
    const text = document.body.textContent ?? "";
    for (const word of [
      "My Profile", "Blocked", "Community Access", "Privacy & Safety",
      "Notifications", "Showcase", "Account",
    ]) {
      expect(text, `${word} leaked to a visitor`).not.toContain(word);
    }
  });

  it("Reputation stays visible to a visitor despite holding owner-only leaves", () => {
    // A group must disappear only when it has NO permitted children.
    renderTabs({ isOwner: false });
    expect(groupLabels()).toContain("Reputation");
  });

  it("the URL is preserved when an owner-only deep link falls back", () => {
    renderTabs({ isOwner: false, tab: "reliability" });
    expect(window.location.search).toBe("?tab=reliability");
    expect(screen.getByTestId("panel-backing")).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Optional `tabs` metadata contract
// ─────────────────────────────────────────────────────────────────────

describe("the review counts survive the move down a level", () => {
  // `receivedCount` / `writtenCount` are the LIVE count path — the only one a
  // caller actually uses. They used to badge top-level tabs; those tabs are
  // leaves of Reputation now, so the numbers had to travel with them.
  it("receivedCount lands on Reviews Received, writtenCount on Reviews Written", () => {
    renderTabs({ isOwner: false, tab: "reviews", receivedCount: 7, writtenCount: 3 });
    const tabs = within(leafStrip()!).getAllByRole("tab");
    const received = tabs.find((t) => t.textContent?.startsWith("REVIEWS RECEIVED"))!;
    const written = tabs.find((t) => t.textContent?.startsWith("REVIEWS WRITTEN"))!;
    expect(received.querySelector(".bcc-tab-count")?.textContent).toBe("7");
    expect(written.querySelector(".bcc-tab-count")?.textContent).toBe("3");
  });

  it("the two counts are not interchangeable", () => {
    // Distinct values, so swapping the two assignments cannot pass.
    renderTabs({ isOwner: false, tab: "reviews", receivedCount: 11, writtenCount: 2 });
    const tabs = within(leafStrip()!).getAllByRole("tab");
    expect(tabs.find((t) => t.textContent?.startsWith("REVIEWS RECEIVED"))!.textContent).toContain("11");
    expect(tabs.find((t) => t.textContent?.startsWith("REVIEWS RECEIVED"))!.textContent).not.toContain("2");
    expect(tabs.find((t) => t.textContent?.startsWith("REVIEWS WRITTEN"))!.textContent).toContain("2");
    expect(tabs.find((t) => t.textContent?.startsWith("REVIEWS WRITTEN"))!.textContent).not.toContain("11");
  });

  it("only those two leaves are badged — no other leaf invents a number", () => {
    renderTabs({ isOwner: true, tab: "reviews", receivedCount: 7, writtenCount: 3 });
    const badged = within(leafStrip()!)
      .getAllByRole("tab")
      .filter((t) => t.querySelector(".bcc-tab-count") !== null)
      .map((t) => (t.firstChild?.textContent ?? "").trim());
    expect(badged).toEqual(["REVIEWS RECEIVED", "REVIEWS WRITTEN"]);
  });

  it("an absent count renders no badge rather than a zero", () => {
    renderTabs({ isOwner: false, tab: "reviews" });
    expect(leafStrip()!.querySelectorAll(".bcc-tab-count")).toHaveLength(0);
  });
});

describe("the optional `tabs` metadata decorates, it does not restructure", () => {
  const meta = (o: Record<string, unknown>) => ({ label: "", count: 0, hidden: false, ...o });

  it("counts land on the correct leaf", () => {
    renderTabs({
      isOwner: false, tab: "reviews",
      tabs: [meta({ key: "reviews", count: 7 }), meta({ key: "written", count: 3 })],
    });
    const tabs = within(leafStrip()!).getAllByRole("tab");
    const received = tabs.find((t) => t.textContent?.startsWith("REVIEWS RECEIVED"))!;
    const written = tabs.find((t) => t.textContent?.startsWith("REVIEWS WRITTEN"))!;
    expect(received.querySelector(".bcc-tab-count")?.textContent).toBe("7");
    expect(written.querySelector(".bcc-tab-count")?.textContent).toBe("3");
  });

  it("Reviews Received never inherits Reviews Written's count", () => {
    renderTabs({ isOwner: false, tab: "reviews", tabs: [meta({ key: "written", count: 99 })] });
    const tabs = within(leafStrip()!).getAllByRole("tab");
    const received = tabs.find((t) => t.textContent?.startsWith("REVIEWS RECEIVED"))!;
    expect(received.querySelector(".bcc-tab-count")).toBeNull();
  });

  it("it cannot reorder the hierarchy", () => {
    renderTabs({
      isOwner: false, tab: "reviews",
      tabs: [meta({ key: "disputes", count: 1 }), meta({ key: "reviews", count: 2 })],
    });
    expect(labelsIn(leafStrip()!)).toEqual([
      "REVIEWS RECEIVED", "REVIEWS WRITTEN", "DISPUTES",
    ]);
  });

  it("it cannot drop frontend-only leaves", () => {
    // `photos`, `backing`, `blog` are not in the §9 metadata contract at all.
    renderTabs({ isOwner: false, tab: "backing", tabs: [meta({ key: "reviews", count: 1 })] });
    expect(labelsIn(leafStrip()!)).toEqual([
      "SUPPORTERS", "WATCHERS", "WATCHING", "COMMUNITIES",
    ]);
  });

  it("an unknown key is ignored rather than creating a tab", () => {
    renderTabs({
      isOwner: false, tab: "reviews",
      tabs: [meta({ key: "not-a-leaf", count: 5 }), meta({ key: "network", count: 9 })],
    });
    expect(labelsIn(leafStrip()!)).toEqual([
      "REVIEWS RECEIVED", "REVIEWS WRITTEN", "DISPUTES",
    ]);
    expect(groupLabels()).toEqual(["Reputation", "Network", "Activity", "Content"]);
  });

  it("duplicate keys resolve to the LAST entry, deterministically", () => {
    renderTabs({
      isOwner: false, tab: "reviews",
      tabs: [meta({ key: "reviews", count: 1 }), meta({ key: "reviews", count: 2 })],
    });
    const received = within(leafStrip()!)
      .getAllByRole("tab")
      .find((t) => t.textContent?.startsWith("REVIEWS RECEIVED"))!;
    expect(received.querySelector(".bcc-tab-count")?.textContent).toBe("2");
  });

  it("PRIVATE stays attached to its own leaf and its siblings survive", () => {
    renderTabs({
      isOwner: false, tab: "reviews",
      tabs: [meta({ key: "written", hidden: true })],
    });
    const tabs = within(leafStrip()!).getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    const written = tabs.find((t) => t.textContent?.startsWith("REVIEWS WRITTEN"))!;
    const received = tabs.find((t) => t.textContent?.startsWith("REVIEWS RECEIVED"))!;
    expect(written.textContent).toContain("PRIVATE");
    expect(received.textContent).not.toContain("PRIVATE");
  });

  it("a hidden leaf shows the placeholder instead of its real panel", () => {
    renderTabs({
      isOwner: false, tab: "written",
      tabs: [meta({ key: "written", hidden: true })],
    });
    expect(screen.queryByTestId("panel-written")).toBeNull();
    expect(screen.getByTestId("panel-soon")).toHaveAttribute("data-label", "Reviews Written");
  });

  it("hiding an owner-only leaf cannot make it a visitor's default", () => {
    renderTabs({
      isOwner: false, tab: "activity",
      tabs: [meta({ key: "setup", hidden: true })],
    });
    clickGroup("Reputation");
    expect(window.location.search).toContain("tab=reviews");
    expect(screen.queryByTestId("panel-setup")).toBeNull();
  });

  it("metadata never puts a count on the group strip", () => {
    renderTabs({
      isOwner: false, tab: "reviews",
      tabs: [meta({ key: "reviews", count: 7 }), meta({ key: "disputes", count: 2 })],
    });
    for (const t of groupTabs()) expect(t.querySelector(".bcc-tab-count")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Manifest integrity
// ─────────────────────────────────────────────────────────────────────

describe("manifest integrity, observed through the DOM", () => {
  it("no leaf appears in two groups, and none is duplicated within one", () => {
    const owners = new Map<string, string>();
    for (const tab of ["reviews", "backing", "blog", "activity", "profile"]) {
      cleanup();
      renderTabs({ isOwner: true, tab });
      const group = selectedGroupLabel();
      const strip = leafStrip() ?? settingsGroupStrip();
      const keys = strip === undefined
        ? [tab]
        : within(strip).getAllByRole("tab").map((t) => t.id.replace(/^.*-tab-/, ""));
      expect(new Set(keys).size, `${group} lists a leaf twice`).toBe(keys.length);
      for (const k of keys) {
        const prev = owners.get(k);
        if (prev !== undefined) expect(prev, `${k} belongs to two groups`).toBe(group);
        owners.set(k, group);
      }
    }
  });

  it("exactly one leaf is selected across the whole page, at every level", () => {
    for (const tab of ["setup", "following", "groups", "photos", "activity", "blocks"]) {
      cleanup();
      renderTabs({ isOwner: true, tab });
      const strips = screen.getAllByRole("tablist");
      for (const s of strips) {
        expect(selectedIn(s), `${tab}: strip ${s.getAttribute("aria-label")}`).toHaveLength(1);
      }
    }
  });

  it("a grouped destination renders exactly ONE leaf strip", () => {
    for (const tab of ["setup", "backing", "blog"]) {
      cleanup();
      renderTabs({ isOwner: true, tab });
      const leafStrips = screen.getAllByRole("tablist").filter((l) =>
        within(l).queryAllByRole("tab").some((t) => t.id.startsWith("profile-leaf-tab-")),
      );
      expect(leafStrips, `${tab} rendered ${leafStrips.length} leaf strips`).toHaveLength(1);
    }
  });

  it("every rendered panel key is one the manifest lists", () => {
    // Invalid keys cannot reach an impossible panel: the fallback is the only
    // other outcome, and it is a manifest leaf too.
    renderTabs({ isOwner: true, tab: "totally-invented" });
    expect(screen.getByTestId("panel-activity")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-soon")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Flattened panels
// ─────────────────────────────────────────────────────────────────────

describe("Standing / Reliability carry no third destination strip", () => {
  it("neither leaf renders a nested Standing sections tablist", () => {
    for (const tab of ["setup", "reliability"]) {
      cleanup();
      renderTabs({ isOwner: true, tab });
      // Top strip + Reputation leaf strip, and nothing else.
      expect(screen.getAllByRole("tablist")).toHaveLength(2);
      expect(screen.queryByRole("tablist", { name: "Standing sections" })).toBeNull();
    }
  });

  it("switching between them renders one section at a time", () => {
    renderTabs({ isOwner: true, tab: "setup" });
    expect(screen.getAllByTestId("panel-setup")).toHaveLength(1);
    expect(screen.getByTestId("panel-setup")).toHaveAttribute("data-section", "standing");
    fireEvent.click(within(leafStrip()!).getByRole("tab", { name: "RELIABILITY" }));
    expect(screen.getAllByTestId("panel-setup")).toHaveLength(1);
    expect(screen.getByTestId("panel-setup")).toHaveAttribute("data-section", "reliability");
  });
});

describe("Watchers / Watching carry no third destination strip", () => {
  it("neither leaf renders the retired Watching sections tablist", () => {
    for (const tab of ["watching", "following"]) {
      cleanup();
      renderTabs({ isOwner: false, tab });
      expect(screen.getAllByRole("tablist")).toHaveLength(2);
      expect(screen.queryByRole("tablist", { name: "Watching sections" })).toBeNull();
    }
  });

  it("switching direction renders one direction at a time", () => {
    renderTabs({ isOwner: false, tab: "watching" });
    expect(screen.getAllByTestId("panel-watching")).toHaveLength(1);
    fireEvent.click(within(leafStrip()!).getByRole("tab", { name: "WATCHING" }));
    expect(screen.getAllByTestId("panel-watching")).toHaveLength(1);
    expect(screen.getByTestId("panel-watching")).toHaveAttribute("data-direction", "following");
  });
});

// ─────────────────────────────────────────────────────────────────────
// ARIA and keyboard
// ─────────────────────────────────────────────────────────────────────

describe("ARIA wiring across three levels", () => {
  const SAMPLE = ["reviews", "profile", "account", "activity", "following", "privacy"];

  it("every aria-controls resolves to a real element", () => {
    for (const tab of SAMPLE) {
      cleanup();
      renderTabs({ isOwner: true, tab });
      const refs = screen.getAllByRole("tab").filter((t) => t.hasAttribute("aria-controls"));
      expect(refs.length, `${tab}: nothing claims a panel`).toBeGreaterThan(0);
      for (const r of refs) {
        expect(
          document.getElementById(r.getAttribute("aria-controls")!),
          `${tab}: dangling aria-controls ${r.getAttribute("aria-controls")}`,
        ).not.toBeNull();
      }
    }
  });

  it("every aria-labelledby on a panel resolves", () => {
    for (const tab of SAMPLE) {
      cleanup();
      renderTabs({ isOwner: true, tab });
      for (const p of document.querySelectorAll('[role="tabpanel"][aria-labelledby]')) {
        const id = p.getAttribute("aria-labelledby")!;
        expect(document.getElementById(id), `${tab}: dangling aria-labelledby ${id}`).not.toBeNull();
      }
    }
  });

  it("at most one tab per strip claims a panel, and it is the selected one", () => {
    renderTabs({ isOwner: true, tab: "following" });
    for (const list of screen.getAllByRole("tablist")) {
      const claiming = within(list).getAllByRole("tab").filter((t) => t.hasAttribute("aria-controls"));
      expect(claiming.length).toBeLessThanOrEqual(1);
      if (claiming[0] !== undefined) expect(claiming[0]).toHaveAttribute("aria-selected", "true");
    }
  });

  it("ids are unique with all three strips on screen", () => {
    renderTabs({ isOwner: true, tab: "privacy" });
    expect(screen.getAllByRole("tablist")).toHaveLength(3);
    const ids = screen.getAllByRole("tab").map((t) => t.id);
    expect(ids.every((i) => i !== "")).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every visible strip has exactly one tabIndex=0", () => {
    for (const tab of SAMPLE) {
      cleanup();
      renderTabs({ isOwner: true, tab });
      for (const list of screen.getAllByRole("tablist")) {
        const stops = within(list).getAllByRole("tab").filter((t) => t.getAttribute("tabindex") === "0");
        expect(stops, `${tab}: ${list.getAttribute("aria-label")}`).toHaveLength(1);
        expect(stops[0]).toHaveAttribute("aria-selected", "true");
      }
    }
  });

  it("strips on one page have distinct accessible names", () => {
    renderTabs({ isOwner: true, tab: "privacy" });
    const names = screen.getAllByRole("tablist").map((l) => l.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(
      expect.arrayContaining(["Member sections", "My Profile settings", "Privacy & Safety sections"]),
    );
  });

  it("the group strip's name distinguishes it from every child strip", () => {
    for (const [tab, child] of [["reviews", "Reputation sections"], ["backing", "Network sections"], ["blog", "Content sections"]] as const) {
      cleanup();
      renderTabs({ isOwner: false, tab });
      expect(screen.getByRole("tablist", { name: child })).toBeInTheDocument();
      expect(screen.getByRole("tablist", { name: "Member sections" })).toBeInTheDocument();
    }
  });

  it("a one-leaf group renders ONE tabpanel, not a nested pair", () => {
    renderTabs({ isOwner: false, tab: "activity" });
    expect(document.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
  });

  it("no hidden child lingers in the accessibility tree", () => {
    renderTabs({ isOwner: true, tab: "setup" });
    // Only Reputation's leaves are exposed; Network's and Content's are not.
    const all = screen.getAllByRole("tab").map((t) => (t.firstChild?.textContent ?? "").trim());
    expect(all).not.toContain("WATCHERS");
    expect(all).not.toContain("PHOTOS");
  });
});

describe("keyboard — manual activation on every strip", () => {
  it("arrowing the group strip moves focus only", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    const before = selectedGroupLabel();
    groupTabs()[0]!.focus();
    fireEvent.keyDown(groupTabs()[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(groupTabs()[1]);
    expect(selectedGroupLabel()).toBe(before);
    expect(window.location.search).toBe("?tab=activity");
  });

  it("arrowing a leaf strip moves focus only", () => {
    renderTabs({ isOwner: false, tab: "backing" });
    const tabs = within(leafStrip()!).getAllByRole("tab");
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs[1]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("panel-backing")).toBeInTheDocument();
  });

  it("Enter activates a group once", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    const network = groupTabs().find((t) => (t.firstChild?.textContent ?? "").trim() === "Network")!;
    fireEvent.keyDown(network, { key: "Enter" });
    expect(screen.getByTestId("panel-backing")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).getAll("tab")).toEqual(["backing"]);
  });

  it("Space activates a leaf once", () => {
    renderTabs({ isOwner: false, tab: "backing" });
    const tabs = within(leafStrip()!).getAllByRole("tab");
    fireEvent.keyDown(tabs[3]!, { key: " " });
    expect(screen.getByTestId("panel-groups")).toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).getAll("tab")).toEqual(["groups"]);
  });

  it("Home and End work on the group strip", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    const tabs = groupTabs();
    tabs[0]!.focus();
    fireEvent.keyDown(tabs[0]!, { key: "End" });
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("group focus survives a child strip mounting", () => {
    renderTabs({ isOwner: true, tab: "activity" });
    const network = groupTabs().find((t) => (t.firstChild?.textContent ?? "").trim() === "Network")!;
    network.focus();
    fireEvent.keyDown(network, { key: "Enter" });
    // The child strip appeared; the group tab is still a valid, focusable node.
    expect(leafStrip()).toBeDefined();
    const stillThere = groupTabs().find((t) => (t.firstChild?.textContent ?? "").trim() === "Network")!;
    expect(stillThere).toHaveAttribute("aria-selected", "true");
    expect(stillThere).toHaveAttribute("tabindex", "0");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Re-selecting the active group
// ─────────────────────────────────────────────────────────────────────

describe("re-selecting the ACTIVE group is a true no-op", () => {
  it("keeps the current leaf instead of resetting to the group default", () => {
    renderTabs({ isOwner: false, tab: "groups" });
    expect(screen.getByTestId("panel-groups")).toBeInTheDocument();
    clickGroup("Network");
    expect(screen.getByTestId("panel-groups"), "thrown back to Supporters").toBeInTheDocument();
    expect(window.location.search).toContain("tab=groups");
  });

  it("writes nothing to the URL", () => {
    renderTabs({ isOwner: false, tab: "photos" });
    const before = window.location.search;
    clickGroup("Content");
    expect(window.location.search).toBe(before);
  });

  it("holds for an owner sitting on a deep settings leaf", () => {
    renderTabs({ isOwner: true, tab: "blocks" });
    const before = window.location.search;
    clickGroup("My Profile");
    expect(window.location.search).toBe(before);
    expect(selectedIn(settingsLeafStrip()!)[0]?.id).toBe("profile-settings-tab-blocks");
  });
});

// ─────────────────────────────────────────────────────────────────────
// External URL changes
// ─────────────────────────────────────────────────────────────────────

describe("a genuine external URL change re-derives group and leaf", () => {
  it("moving from a Network leaf to a Reputation leaf follows", () => {
    const { rerender } = renderTabs({ isOwner: true, tab: "watching" });
    expect(selectedGroupLabel()).toBe("Network");

    sp.query = "tab=disputes";
    rerender(
      <ProfileTabs
        handle="dana" displayName="Dana" isOwner targetUserId={42}
        reputationScore={50} profile={PROFILE} reliability={undefined}
        isSignedIn viewerHandle="dana"
      />,
    );

    expect(selectedGroupLabel()).toBe("Reputation");
    expect(screen.getByTestId("panel-disputes")).toBeInTheDocument();
    expect(selectedIn(leafStrip()!)[0]?.id).toBe("profile-leaf-tab-disputes");
  });
});

// ─────────────────────────────────────────────────────────────────────
// In-file mutation controls — the assertions above must be able to fail
// ─────────────────────────────────────────────────────────────────────

describe("mutation controls", () => {
  it("N1: the group strip really is the one named 'Member sections'", () => {
    renderTabs({ isOwner: false });
    expect(groupStrip().getAttribute("aria-label")).toBe("Member sections");
    expect(groupTabs().length).toBeGreaterThan(0);
  });

  it("N2: leafStrip() returns undefined only when there truly is no strip", () => {
    renderTabs({ isOwner: false, tab: "activity" });
    expect(leafStrip()).toBeUndefined();
    cleanup();
    renderTabs({ isOwner: false, tab: "backing" });
    expect(leafStrip()).toBeDefined();
  });

  it("N3: the panel stubs genuinely vary with their prop", () => {
    renderTabs({ isOwner: true, tab: "setup" });
    expect(screen.getByTestId("panel-setup")).toHaveAttribute("data-section", "standing");
    cleanup();
    renderTabs({ isOwner: true, tab: "reliability" });
    expect(screen.getByTestId("panel-setup")).toHaveAttribute("data-section", "reliability");
    cleanup();
    renderTabs({ isOwner: true, tab: "watching" });
    expect(screen.getByTestId("panel-watching")).toHaveAttribute("data-direction", "followers");
    cleanup();
    renderTabs({ isOwner: true, tab: "following" });
    expect(screen.getByTestId("panel-watching")).toHaveAttribute("data-direction", "following");
  });

  it("N4: owner and visitor renders genuinely differ", () => {
    // Every ownership assertion would be vacuous if `isOwner` were ignored.
    renderTabs({ isOwner: true, tab: "reviews" });
    const ownerLeaves = labelsIn(leafStrip()!);
    cleanup();
    renderTabs({ isOwner: false, tab: "reviews" });
    expect(labelsIn(leafStrip()!)).not.toEqual(ownerLeaves);
  });
});
