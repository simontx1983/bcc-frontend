/**
 * The dirty guard has to cover the NEW top level, not just the settings rows.
 *
 * Before the profile regrouping, the only way to leave an unsaved settings
 * form was to click another settings tab. There are now four kinds of move —
 * top-level GROUP, group LEAF, settings group, settings leaf — plus a no-op
 * path that must not warn. If any one of them skipped `requestNavigation`,
 * an operator would lose a form by clicking the wrong row, silently.
 *
 * These drive the REAL `ProfileTabs` with a REAL dirty registration and assert
 * the observable consequences: the dialog appears AND the URL does not change.
 * Both halves matter — a guard that warns but navigates anyway has still lost
 * the form, and a URL that moved means the panel unmounted behind the dialog.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const sp = vi.hoisted(() => ({ tab: null as string | null }));
/** Filled in after imports settle; a bare alias import inside a hoisted
 *  factory does not resolve under ESM. */
const reg = vi.hoisted(() => ({
  use: null as null | ((o: { id: string; label: string; isDirty: boolean; isSaving: boolean }) => void),
  /** Per-render state for the stub panels, so a test can put a form into
   *  "saving" without reaching into the provider. */
  dirty: true,
  saving: false,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams(sp.tab === null ? "" : `tab=${sp.tab}`),
}));

/** Every lazy settings panel registers a form with the current flags. */
vi.mock("next/dynamic", () => ({
  default: () => {
    const P = () => {
      reg.use?.({ id: "lazy-form", label: "Lazy form", isDirty: reg.dirty, isSaving: reg.saving });
      return <div data-testid="lazy-panel" />;
    };
    P.displayName = "DirtyLazyPanel";
    return P;
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

/** ProfileEditPanel is NOT lazy, so it needs its own registration. */
vi.mock("./panels/ProfileEditPanel", () => ({
  ProfileEditPanel: () => {
    reg.use?.({ id: "details-form", label: "Details", isDirty: reg.dirty, isSaving: reg.saving });
    return <div data-testid="panel-profile" />;
  },
}));

const { useDirtyRegistration } = await import("@/hooks/useDirtyRegistration");
reg.use = useDirtyRegistration;

const { ProfileTabs } = await import("@/components/profile/ProfileTabs");

const PROFILE = { handle: "dana", display_name: "Dana", user_id: 42, bio: "" } as never;

function renderAt(tab: string) {
  sp.tab = tab;
  window.history.replaceState(null, "", `/u/dana?tab=${tab}`);
  return render(
    <ProfileTabs
      handle="dana" displayName="Dana" isOwner targetUserId={42}
      reputationScore={50} profile={PROFILE} reliability={undefined}
      isSignedIn viewerHandle="dana" receivedCount={0} writtenCount={0}
    />,
  );
}

const groupStrip = () => screen.getByRole("tablist", { name: "Member sections" });
const clickGroup = (label: string) =>
  fireEvent.click(
    within(groupStrip())
      .getAllByRole("tab")
      .find((t) => (t.firstChild?.textContent ?? "").trim() === label)!,
  );
const settingsGroupStrip = () => screen.getByRole("tablist", { name: "My Profile settings" });
const settingsLeafStrip = () =>
  screen.getAllByRole("tablist").find((l) =>
    within(l).queryAllByRole("tab").some((t) => t.id.startsWith("profile-settings-tab-")),
  )!;
const dialog = () => screen.queryByRole("dialog");

/** The guard only means anything if a form actually registered. */
function assertArmed() {
  expect(
    screen.queryByTestId("lazy-panel") ?? screen.queryByTestId("panel-profile"),
    "no settings panel mounted, so nothing registered — the test would pass vacuously",
  ).not.toBeNull();
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  sp.tab = null;
  reg.dirty = true;
  reg.saving = false;
  window.history.replaceState(null, "", "/u/dana");
});
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────

describe("a dirty form survives every top-level group move", () => {
  it.each([
    ["Details",  "profile",  "Reputation"],
    ["Showcase", "showcase", "Network"],
    ["Account",  "account",  "Activity"],
    ["Privacy",  "privacy",  "Content"],
    ["Messages", "messages", "Reputation"],
  ])("dirty %s → %s is guarded", (_form, tab, group) => {
    renderAt(tab);
    assertArmed();
    const before = window.location.search;

    clickGroup(group);

    expect(dialog(), `${group} walked past the guard`).not.toBeNull();
    expect(window.location.search, "the URL moved despite the warning").toBe(before);
  });

  it("the panel is still mounted behind the dialog — nothing unmounted first", () => {
    renderAt("profile");
    assertArmed();
    clickGroup("Reputation");
    expect(dialog()).not.toBeNull();
    // The form the operator is being warned about must still be on screen.
    expect(screen.getByTestId("panel-profile")).toBeInTheDocument();
    expect(screen.queryByTestId("panel-setup")).toBeNull();
  });

  it("a settings GROUP move is still guarded", () => {
    renderAt("profile");
    assertArmed();
    const before = window.location.search;
    fireEvent.click(within(settingsGroupStrip()).getByRole("tab", { name: "ACCOUNT" }));
    expect(dialog()).not.toBeNull();
    expect(window.location.search).toBe(before);
  });

  it("a settings LEAF move is still guarded", () => {
    renderAt("privacy");
    assertArmed();
    const before = window.location.search;
    fireEvent.click(within(settingsLeafStrip()).getByRole("tab", { name: "MESSAGES" }));
    expect(dialog()).not.toBeNull();
    expect(window.location.search).toBe(before);
  });

  it("ENTER on a top-level group is guarded", () => {
    renderAt("profile");
    assertArmed();
    const before = window.location.search;
    const content = within(groupStrip())
      .getAllByRole("tab")
      .find((t) => (t.firstChild?.textContent ?? "").trim() === "Content")!;
    fireEvent.keyDown(content, { key: "Enter" });
    expect(dialog()).not.toBeNull();
    expect(window.location.search).toBe(before);
  });

  it("SPACE on a top-level group is guarded", () => {
    renderAt("privacy");
    assertArmed();
    const before = window.location.search;
    const network = within(groupStrip())
      .getAllByRole("tab")
      .find((t) => (t.firstChild?.textContent ?? "").trim() === "Network")!;
    fireEvent.keyDown(network, { key: " " });
    expect(dialog()).not.toBeNull();
    expect(window.location.search).toBe(before);
  });

  it("Arrow / Home / End are not navigation and raise no dialog", () => {
    renderAt("profile");
    assertArmed();
    const tabs = within(groupStrip()).getAllByRole("tab");
    for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
      fireEvent.keyDown(tabs[0]!, { key });
      expect(dialog(), `${key} triggered a navigation`).toBeNull();
    }
    expect(window.location.search).toBe("?tab=profile");
  });

  it("re-selecting the ACTIVE My Profile group neither navigates nor warns", () => {
    renderAt("blocks");
    assertArmed();
    const before = window.location.search;
    clickGroup("My Profile");
    expect(dialog(), "warned about a move that is not happening").toBeNull();
    expect(window.location.search).toBe(before);
  });
});

describe("resolving the dialog", () => {
  it("Discard navigates EXACTLY once, to the group's default leaf", () => {
    renderAt("profile");
    assertArmed();
    clickGroup("Reputation");

    const d = screen.getByRole("dialog");
    const discard = within(d).getAllByRole("button")
      .find((b) => /discard|leave|don.t save/i.test(b.textContent ?? ""))!;
    expect(discard, "no discard affordance").toBeDefined();
    fireEvent.click(discard);

    expect(screen.queryByRole("dialog")).toBeNull();
    const params = new URLSearchParams(window.location.search);
    expect(params.getAll("tab"), "navigated twice").toHaveLength(1);
    expect(params.get("tab")).toBe("setup");
  });

  it("Stay Here preserves the leaf, the URL and the mounted form", () => {
    renderAt("privacy");
    assertArmed();
    const before = window.location.search;
    clickGroup("Network");

    const d = screen.getByRole("dialog");
    const stay = within(d).getAllByRole("button")
      .find((b) => /stay|cancel|keep/i.test(b.textContent ?? ""))!;
    fireEvent.click(stay);

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe(before);
    expect(screen.getByTestId("lazy-panel")).toBeInTheDocument();
    expect(
      within(settingsGroupStrip()).getAllByRole("tab")
        .find((t) => t.getAttribute("aria-selected") === "true")?.id,
    ).toBe("profile-settings-group-tab-privacy");
  });
});

describe("a form mid-save", () => {
  it("a SAVING form does not navigate, and offers no Discard", () => {
    reg.dirty = false;
    reg.saving = true;
    renderAt("account");
    assertArmed();
    const before = window.location.search;

    clickGroup("Activity");

    const d = screen.getByRole("dialog");
    expect(d, "a save in flight must not be abandoned silently").not.toBeNull();
    expect(
      within(d).queryAllByRole("button").find((b) => /discard|don.t save/i.test(b.textContent ?? "")),
      "a save in flight must not offer Discard",
    ).toBeUndefined();
    expect(window.location.search).toBe(before);
  });

  it("one form saving while another is dirty still blocks", () => {
    reg.dirty = true;
    reg.saving = true;
    renderAt("profile");
    assertArmed();
    const before = window.location.search;
    clickGroup("Content");
    expect(dialog()).not.toBeNull();
    expect(window.location.search).toBe(before);
  });
});

describe("mutation controls", () => {
  it("G1: a CLEAN form navigates freely — the dialogs above are not unconditional", () => {
    reg.dirty = false;
    reg.saving = false;
    renderAt("profile");
    assertArmed();

    clickGroup("Network");

    expect(dialog(), "a clean form must not warn").toBeNull();
    expect(window.location.search).toContain("tab=backing");
  });

  it("G2: the group labels used above really are on the top strip", () => {
    renderAt("profile");
    const labels = within(groupStrip()).getAllByRole("tab")
      .map((t) => (t.firstChild?.textContent ?? "").trim());
    expect(labels).toEqual(["My Profile", "Reputation", "Network", "Activity", "Content"]);
  });
});
