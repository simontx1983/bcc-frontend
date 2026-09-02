/**
 * The photo-actions menu: one visible trigger, correct items, one status.
 *
 * ## What this replaced, twice
 *
 * First the controls were hover-revealed overlays over the cover and the
 * avatar — `opacity-0` with `pointer-events: auto`, so invisible but
 * clickable, and unreachable on touch. Those became five always-visible
 * labelled buttons, which fixed discoverability but never fitted: the
 * profile column is 680px, five labelled controls need ~600px, so the row
 * wrapped at every width and added ~118px to the hero.
 *
 * Now it is one labelled trigger. The label is required — a bare "⋯"
 * does not tell a first-time owner what it opens.
 *
 * ## The status defect this also fixes
 *
 * The five-button version had one live region per image. That looked safe
 * because all five media mutations share `busy`, but `Saved` lingers for
 * three seconds after its mutation settles, so starting a cover save
 * inside that window left two polite regions holding content at once. A
 * screen reader could hear a stale "Saved" interleaved with a new
 * operation. There is now exactly one region, and it names its subject.
 */

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

interface Captured {
  onSuccess?: (data: unknown, vars?: unknown) => void;
  onError?: (err: unknown) => void;
}
const captured: Record<string, Captured> = {};
const mutateSpies: Record<string, ReturnType<typeof vi.fn>> = {};
let pending: Record<string, boolean> = {};

function fakeHook(name: string) {
  return (opts: Captured = {}) => {
    captured[name] = opts;
    mutateSpies[name] ??= vi.fn();
    return {
      mutate: mutateSpies[name],
      reset: vi.fn(),
      isPending: pending[name] === true,
      isError: false,
      isSuccess: false,
    };
  };
}
vi.mock("@/hooks/useUpdateProfile", () => ({
  useUpdateBio: fakeHook("bio"),
  useUpdateCoverPosition: fakeHook("position"),
  useUploadAvatar: fakeHook("uploadAvatar"),
  useDeleteAvatar: fakeHook("deleteAvatar"),
  useUploadCover: fakeHook("uploadCover"),
  useDeleteCover: fakeHook("deleteCover"),
}));

import { ProfileHero } from "@/components/settings/profile/ProfileHero";
import type { MemberProfile } from "@/lib/api/types";

const BASE = {
  id: 7,
  user_id: 7,
  handle: "welder",
  display_name: "Dale",
  bio: "",
  avatar_url: "/a.png",
  cover_photo_url: "/c.png",
  cover_photo_position: { x: 50, y: 50 },
} as unknown as MemberProfile;

const withPhotos = (avatar: boolean, cover: boolean): MemberProfile =>
  ({
    ...BASE,
    avatar_url: avatar ? "/a.png" : "",
    cover_photo_url: cover ? "/c.png" : null,
  }) as MemberProfile;

const trigger = () => screen.getByRole("button", { name: /Edit photos/ });
const openMenu = () => fireEvent.click(trigger());
const items = () =>
  screen.queryAllByRole("menuitem").map((i) => i.textContent?.trim() ?? "");

beforeAll(() => {
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

beforeEach(() => {
  pending = {};
  for (const k of Object.keys(captured)) delete captured[k];
  for (const k of Object.keys(mutateSpies)) mutateSpies[k]?.mockReset();
});
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────────
// 1. The trigger
// ─────────────────────────────────────────────────────────────────────────

describe("the Edit photos trigger", () => {
  it("is always visible to the owner, with a text label", () => {
    render(<ProfileHero profile={BASE} />);
    const t = trigger();
    expect(t.textContent).toContain("Edit photos");
    expect(getComputedStyle(t).opacity).not.toBe("0");
  });

  it("is a menu button, collapsed until asked", () => {
    render(<ProfileHero profile={BASE} />);
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("no hover-revealed overlay and no five-button row survive", () => {
    const { container } = render(<ProfileHero profile={BASE} />);
    expect(container.innerHTML).not.toContain("group-hover/avatar");
    expect(container.innerHTML).not.toContain("group-hover/cover");
    expect(screen.queryByRole("group", { name: "Profile photo controls" })).toBeNull();
    // Before the menu opens the hero exposes exactly one photo control.
    const buttons = screen.getAllByRole("button").map((b) => b.textContent?.trim());
    expect(buttons.filter((b) => /photo|cover/i.test(b ?? ""))).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Items by image state
// ─────────────────────────────────────────────────────────────────────────

describe("menu items match the current image state", () => {
  it("neither image: only the two Add actions", () => {
    render(<ProfileHero profile={withPhotos(false, false)} />);
    openMenu();
    expect(items()).toEqual(["Add profile photo", "Add cover photo"]);
  });

  it("profile photo only", () => {
    render(<ProfileHero profile={withPhotos(true, false)} />);
    openMenu();
    expect(items()).toEqual([
      "Change profile photo",
      "Remove profile photo",
      "Add cover photo",
    ]);
  });

  it("cover only", () => {
    render(<ProfileHero profile={withPhotos(false, true)} />);
    openMenu();
    expect(items()).toEqual([
      "Add profile photo",
      "Change cover photo",
      "Reposition cover photo",
      "Remove cover photo",
    ]);
  });

  it("both present", () => {
    render(<ProfileHero profile={withPhotos(true, true)} />);
    openMenu();
    expect(items()).toEqual([
      "Change profile photo",
      "Remove profile photo",
      "Change cover photo",
      "Reposition cover photo",
      "Remove cover photo",
    ]);
  });

  it("Reposition exists only when a cover does", () => {
    render(<ProfileHero profile={withPhotos(true, false)} />);
    openMenu();
    expect(screen.queryByRole("menuitem", { name: /Reposition/ })).toBeNull();
  });

  it("groups are labelled, so a screen reader hears which image", () => {
    render(<ProfileHero profile={withPhotos(true, true)} />);
    openMenu();
    const groups = screen.getAllByRole("group");
    const names = groups.map((g) =>
      document.getElementById(g.getAttribute("aria-labelledby") ?? "")?.textContent,
    );
    expect(names).toEqual(["PROFILE PHOTO", "COVER PHOTO"]);
  });

  it("destructive items are marked apart from ordinary ones", () => {
    render(<ProfileHero profile={withPhotos(true, true)} />);
    openMenu();
    const remove = screen.getByRole("menuitem", { name: "Remove profile photo" });
    const change = screen.getByRole("menuitem", { name: "Change profile photo" });
    expect(remove.getAttribute("class")).toMatch(/border-l-safety/);
    expect(change.getAttribute("class")).not.toMatch(/border-l-safety/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Keyboard and pointer
// ─────────────────────────────────────────────────────────────────────────

describe("opening and closing", () => {
  it("opens on click and focuses the first item", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toBe("Change profile photo");
  });

  it("opens on Enter and on Space", () => {
    render(<ProfileHero profile={BASE} />);
    fireEvent.keyDown(trigger(), { key: "Enter" });
    expect(screen.getByRole("menu")).toBeDefined();
    fireEvent.keyDown(document.querySelector('[role="menu"]') as Element, { key: "Escape" });

    fireEvent.keyDown(trigger(), { key: " " });
    expect(screen.getByRole("menu")).toBeDefined();
  });

  it("ArrowUp opens at the LAST item", () => {
    render(<ProfileHero profile={BASE} />);
    fireEvent.keyDown(trigger(), { key: "ArrowUp" });
    expect(document.activeElement?.textContent).toBe("Remove cover photo");
  });

  it("arrow keys move and wrap across group boundaries", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    const menu = screen.getByRole("menu");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("Remove profile photo");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    // Crosses into the COVER PHOTO group.
    expect(document.activeElement?.textContent).toBe("Change cover photo");
    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement?.textContent).toBe("Remove profile photo");
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement?.textContent).toBe("Remove cover photo");
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("Change profile photo");
    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement?.textContent).toBe("Change profile photo");
  });

  it("Escape closes and returns focus to the trigger", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("an outside pointer press closes it", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("hover opens nothing", () => {
    render(<ProfileHero profile={BASE} />);
    fireEvent.mouseEnter(trigger());
    fireEvent.mouseOver(trigger());
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Selecting an action
// ─────────────────────────────────────────────────────────────────────────

describe("selecting an action", () => {
  it("closes the menu before the file picker opens, and clicks the input once", () => {
    const { container } = render(<ProfileHero profile={BASE} />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const spy = vi.spyOn(input, "click");
    let menuOpenAtClick: boolean | null = null;
    spy.mockImplementation(() => {
      menuOpenAtClick = document.querySelector('[role="menu"]') !== null;
    });

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Change profile photo" }));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(menuOpenAtClick).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Remove still requires confirmation and starts no mutation on its own", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove profile photo" }));
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(mutateSpies["deleteAvatar"]).not.toHaveBeenCalled();
  });

  it("double activation cannot start two removals", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove profile photo" }));
    const confirm = screen.getByRole("button", { name: "Remove photo" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mutateSpies["deleteAvatar"]).toHaveBeenCalledTimes(1);
  });

  it("Reposition opens the crop panel", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reposition cover photo" }));
    expect(screen.getByText("CROP POSITION")).toBeDefined();
  });

  it("every item goes inert while a media save is in flight", () => {
    pending = { uploadCover: true };
    render(<ProfileHero profile={BASE} />);
    openMenu();
    // With all items disabled the menu has nothing to operate on and closes.
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Success updates the options, failure preserves the image
// ─────────────────────────────────────────────────────────────────────────

describe("after an operation", () => {
  it("a successful removal flips Remove/Change to Add with no refresh", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    expect(items()).toContain("Remove profile photo");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });

    act(() => captured["deleteAvatar"]?.onSuccess?.({ ...BASE, avatar_url: "" }));

    openMenu();
    expect(items()).toContain("Add profile photo");
    expect(items()).not.toContain("Remove profile photo");
    expect(items()).not.toContain("Change profile photo");
  });

  it("a failed removal keeps the image and its Remove action", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove profile photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    act(() => captured["deleteAvatar"]?.onError?.(new Error("network")));

    // Dialog stays open with a retry, image untouched.
    expect(screen.getByRole("dialog")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Keep photo" }));
    openMenu();
    expect(items()).toContain("Remove profile photo");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Exactly one media live region
// ─────────────────────────────────────────────────────────────────────────

function politeRegions(): string[] {
  return Array.from(document.querySelectorAll('[role="status"]')).map(
    (n) => n.textContent ?? "",
  );
}

describe("media announcements", () => {
  it("there is exactly one media status region", () => {
    render(<ProfileHero profile={BASE} />);
    // The hero's only other live region is the display-name alert, which
    // is role=alert and only exists while a name error is showing.
    expect(politeRegions()).toHaveLength(1);
  });

  it("a success names its subject", () => {
    render(<ProfileHero profile={BASE} />);
    act(() => captured["uploadAvatar"]?.onSuccess?.({ ...BASE, avatar_url: "/a2.png" }));
    expect(politeRegions().join("")).toBe("Profile photo saved.");
  });

  it("a later cover operation REPLACES the lingering profile-photo Saved", () => {
    // The two-region design could hold "Profile photo saved" and
    // "Saving your cover photo…" simultaneously, because Saved lingers
    // three seconds. One region cannot.
    render(<ProfileHero profile={BASE} />);
    act(() => captured["uploadAvatar"]?.onSuccess?.({ ...BASE, avatar_url: "/a2.png" }));
    expect(politeRegions().join("")).toBe("Profile photo saved.");

    act(() => captured["uploadCover"]?.onSuccess?.({ ...BASE, cover_photo_url: "/c2.png" }));
    const regions = politeRegions();
    expect(regions).toHaveLength(1);
    expect(regions.join("")).toBe("Cover photo saved.");
    expect(regions.join("")).not.toContain("Profile photo");
  });

  it("the reverse order behaves the same", () => {
    render(<ProfileHero profile={BASE} />);
    act(() => captured["uploadCover"]?.onSuccess?.({ ...BASE, cover_photo_url: "/c2.png" }));
    expect(politeRegions().join("")).toBe("Cover photo saved.");
    act(() => captured["uploadAvatar"]?.onSuccess?.({ ...BASE, avatar_url: "/a2.png" }));
    expect(politeRegions().join("")).toBe("Profile photo saved.");
  });

  it("a success followed by a failure leaves no stale success anywhere", () => {
    render(<ProfileHero profile={BASE} />);
    act(() => captured["uploadAvatar"]?.onSuccess?.({ ...BASE, avatar_url: "/a2.png" }));
    act(() => captured["uploadCover"]?.onError?.(new Error("network")));

    // Polite region silent during an error; the alert carries it, once.
    expect(politeRegions().join("")).toBe("");
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain("Couldn't update your cover photo.");
    expect(alerts[0]?.textContent).not.toContain("saved");
  });

  it("the failure names which image failed", () => {
    render(<ProfileHero profile={BASE} />);
    act(() => captured["deleteAvatar"]?.onError?.(new Error("network")));
    // While the dialog is closed the shared region reports it.
    expect(screen.getByRole("alert").textContent).toContain(
      "Couldn't update your profile photo.",
    );
  });

  it("the shared region stays silent while a confirmation dialog owns the error", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove profile photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove photo" }));
    act(() => captured["deleteAvatar"]?.onError?.(new Error("network")));

    const dialog = screen.getByRole("dialog");
    // Exactly one alert, and it is inside the dialog.
    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(1);
    expect(dialog.contains(alerts[0] as Node)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. Identity reset
// ─────────────────────────────────────────────────────────────────────────

describe("switching to a different profile", () => {
  it("drops status, menu state and reposition mode from the previous person", () => {
    const { rerender } = render(<ProfileHero profile={BASE} />);
    act(() => captured["uploadAvatar"]?.onSuccess?.({ ...BASE, avatar_url: "/a2.png" }));
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Reposition cover photo" }));
    expect(screen.getByText("CROP POSITION")).toBeDefined();
    expect(politeRegions().join("")).toBe("Profile photo saved.");

    rerender(<ProfileHero profile={{ ...BASE, id: 99, user_id: 99, display_name: "Other" }} />);

    expect(screen.queryByText("CROP POSITION")).toBeNull();
    expect(politeRegions().join("")).toBe("");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByText("Other")).toBeDefined();
  });

  it("drops an open confirmation dialog", () => {
    const { rerender } = render(<ProfileHero profile={BASE} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove profile photo" }));
    expect(screen.getByRole("dialog")).toBeDefined();

    rerender(<ProfileHero profile={{ ...BASE, id: 99, user_id: 99 }} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("drops a half-typed display name and its editing mode", () => {
    const { rerender } = render(<ProfileHero profile={BASE} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit display name" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "half typed" } });

    rerender(<ProfileHero profile={{ ...BASE, id: 99, user_id: 99, display_name: "Other" }} />);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Other")).toBeDefined();
    expect(screen.queryByDisplayValue("half typed")).toBeNull();
  });

  it("an ordinary refresh of the SAME person keeps the menu and status", () => {
    const { rerender } = render(<ProfileHero profile={BASE} />);
    act(() => captured["uploadAvatar"]?.onSuccess?.({ ...BASE, avatar_url: "/a2.png" }));
    rerender(<ProfileHero profile={{ ...BASE, display_name: "Dale" }} />);
    expect(politeRegions().join("")).toBe("Profile photo saved.");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8. The menu itself does not leak work
// ─────────────────────────────────────────────────────────────────────────

describe("teardown", () => {
  it("unmounting while the menu is open removes its document listener", () => {
    const add = vi.spyOn(document, "addEventListener");
    const remove = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<ProfileHero profile={BASE} />);
    openMenu();
    const added = add.mock.calls.filter(([e]) => e === "pointerdown").length;
    unmount();
    const removed = remove.mock.calls.filter(([e]) => e === "pointerdown").length;
    expect(added).toBeGreaterThan(0);
    expect(removed).toBe(added);
    add.mockRestore();
    remove.mockRestore();
  });

  it("no state update escapes after unmount", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<ProfileHero profile={BASE} />);
    openMenu();
    unmount();
    // A late mutation callback from an in-flight request must not warn.
    act(() => captured["uploadAvatar"]?.onSuccess?.({ ...BASE, avatar_url: "/a3.png" }));
    const warned = spy.mock.calls.some((c) =>
      String(c[0] ?? "").includes("unmounted"),
    );
    expect(warned).toBe(false);
    spy.mockRestore();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 9. Narrow viewport
// ─────────────────────────────────────────────────────────────────────────

describe("360px", () => {
  it("the menu constrains itself to the viewport", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    const menu = screen.getByRole("menu");
    expect(menu.getAttribute("class")).toMatch(/max-w-\[calc\(100vw-2rem\)\]/);
  });

  it("the confirmation still exposes both choices", () => {
    render(<ProfileHero profile={BASE} />);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove cover photo" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Keep cover" })).toBeDefined();
    expect(within(dialog).getByRole("button", { name: "Remove cover" })).toBeDefined();
  });
});
