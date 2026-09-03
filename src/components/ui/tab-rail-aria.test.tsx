/**
 * TabRail must be invisible to the accessibility tree.
 *
 * It inserts a positioned wrapper and two decorative spans around a strip
 * that already had a correct ARIA tabs structure. Neither may disturb it:
 * the wrapper sits OUTSIDE the tablist so tab ownership is untouched, and
 * the fades are siblings of the tablist rather than children, so they can
 * never be mistaken for tabs.
 *
 * Asserted against the real `SubTabNav` and the real `GroupTabs` rather than
 * the minimal fixture — a wrapper that breaks ownership would break it in
 * the consumers, not in a bespoke test strip.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { SubTabNav } from "@/components/profile/SubTabNav";
import { GroupTabs } from "@/components/groups/GroupTabs";

const SETTINGS = [
  { key: "profile", label: "Profile" },
  { key: "privacy", label: "Privacy" },
  { key: "account", label: "Account" },
  { key: "blocks", label: "Blocks" },
] as const;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {}, writable: true, configurable: true,
  });
});
afterEach(cleanup);

function Settings({ initial = "account" }: { initial?: string }) {
  const [active, setActive] = useState<string>(initial);
  return (
    <SubTabNav
      tabs={SETTINGS as never}
      active={active as never}
      onSelect={(k: string) => setActive(k)}
      ariaLabel="My Profile sections"
      idBase="s"
    />
  );
}

function Group() {
  return (
    <GroupTabs
      initialTab="members"
      streamPanel={<p>stream</p>}
      aboutPanel={<p>about</p>}
      membersPanel={<p>members</p>}
    />
  );
}

describe("tab ownership survives the wrapper", () => {
  it("every tab is a DESCENDANT of its tablist", () => {
    render(<Settings />);
    const list = screen.getByRole("tablist", { name: "My Profile sections" });
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(SETTINGS.length);
    for (const t of tabs) expect(list.contains(t), "tab escaped its tablist").toBe(true);
  });

  it("the fades are SIBLINGS of the tablist, never inside it", () => {
    render(<Settings />);
    const list = screen.getByRole("tablist");
    for (const f of document.querySelectorAll("[data-tab-fade]")) {
      expect(list.contains(f), "a fade rendered inside the tablist").toBe(false);
      expect(f.parentElement).toBe(list.parentElement);
    }
  });

  it("no fade is exposed as tab, button, image or landmark", () => {
    render(<Settings />);
    for (const f of document.querySelectorAll("[data-tab-fade]")) {
      expect(f.getAttribute("aria-hidden")).toBe("true");
      expect(f.getAttribute("role")).toBeNull();
      expect(f.tagName).toBe("SPAN");
    }
    // The accessible tree gains nothing. `role="tab"` overrides the implicit
    // button role, so zero buttons is the correct expectation here — the tabs
    // are the only interactive nodes and they are already counted as tabs.
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.queryAllByRole("banner")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getAllByRole("tab")).toHaveLength(SETTINGS.length);
    expect(document.querySelectorAll("button")).toHaveLength(SETTINGS.length);
  });

  it("adds no tab stop — roving tabIndex still leaves exactly one", () => {
    render(<Settings />);
    const stops = [...document.querySelectorAll("[tabindex]")].filter(
      (n) => n.getAttribute("tabindex") === "0",
    );
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute("aria-selected", "true");
    // The wrapper and fades carry no tabindex at all.
    expect(document.querySelector("div.relative")?.hasAttribute("tabindex")).toBe(false);
    for (const f of document.querySelectorAll("[data-tab-fade]")) {
      expect(f.hasAttribute("tabindex")).toBe(false);
    }
  });

  it("aria-selected and aria-controls stay correct through a change", () => {
    render(<Settings />);
    const before = screen.getByRole("tab", { name: "ACCOUNT" });
    expect(before).toHaveAttribute("aria-selected", "true");
    expect(before).toHaveAttribute("aria-controls");

    fireEvent.click(screen.getByRole("tab", { name: "BLOCKS" }));
    expect(screen.getByRole("tab", { name: "BLOCKS" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "ACCOUNT" })).toHaveAttribute("aria-selected", "false");
    // Exactly one selected tab at all times.
    expect(
      screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1);
  });

  it("arrow keys move focus WITHOUT changing selection; Enter activates", () => {
    render(<Settings initial="profile" />);
    const tabs = () => screen.getAllByRole("tab");
    tabs()[0]!.focus();

    fireEvent.keyDown(tabs()[0]!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs()[0], "arrowing changed the selection").toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(tabs()[1]!, { key: "Enter" });
    expect(tabs()[1]).toHaveAttribute("aria-selected", "true");
  });

  it("Home and End still work", () => {
    render(<Settings initial="profile" />);
    const tabs = () => screen.getAllByRole("tab");
    tabs()[0]!.focus();
    fireEvent.keyDown(tabs()[0]!, { key: "End" });
    expect(document.activeElement).toBe(tabs()[tabs().length - 1]);
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(tabs()[0]);
  });

  it("Space activates", () => {
    render(<Settings initial="profile" />);
    const tabs = screen.getAllByRole("tab");
    tabs[2]!.focus();
    fireEvent.keyDown(tabs[2]!, { key: " " });
    expect(screen.getAllByRole("tab")[2]).toHaveAttribute("aria-selected", "true");
  });
});

describe("the real GroupTabs keeps its structure", () => {
  it("panel association survives the wrapper", () => {
    render(<Group />);
    const list = screen.getByRole("tablist", { name: "Group sections" });
    const selected = within(list)
      .getAllByRole("tab")
      .find((t) => t.getAttribute("aria-selected") === "true")!;
    const panelId = selected.getAttribute("aria-controls")!;
    const panel = document.getElementById(panelId);
    expect(panel, "aria-controls points at nothing").not.toBeNull();
    expect(panel).toHaveAttribute("aria-labelledby", selected.id);
  });

  it("conditional tabs render only when their panel exists", () => {
    render(<Group />);
    // Three panels supplied, so three tabs — collections/validators absent.
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.queryByRole("tab", { name: "NFT Collections" })).toBeNull();
  });
});

describe("two rails on one page do not interfere", () => {
  it("each rail owns only its own tablist and fades", () => {
    render(
      <>
        <Settings />
        <Group />
      </>,
    );
    const lists = screen.getAllByRole("tablist");
    expect(lists).toHaveLength(2);

    // Accessible names stay distinct — the duplicate-label problem must not
    // be reintroduced by wrapping.
    const names = lists.map((l) => l.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);

    // Every wrapper holds exactly one tablist and its own two fades.
    const wrappers = [...document.querySelectorAll("div.relative")].filter((w) =>
      w.querySelector(":scope > [role='tablist']"),
    );
    expect(wrappers).toHaveLength(2);
    for (const w of wrappers) {
      expect(w.querySelectorAll(":scope > [role='tablist']")).toHaveLength(1);
      expect(w.querySelectorAll(":scope > [data-tab-fade]")).toHaveLength(2);
    }
  });

  it("selecting in one rail does not alter the other", () => {
    render(
      <>
        <Settings />
        <Group />
      </>,
    );
    const groupList = screen.getByRole("tablist", { name: "Group sections" });
    const groupBefore = within(groupList)
      .getAllByRole("tab")
      .find((t) => t.getAttribute("aria-selected") === "true")!.textContent;

    fireEvent.click(screen.getByRole("tab", { name: "BLOCKS" }));

    const groupAfter = within(screen.getByRole("tablist", { name: "Group sections" }))
      .getAllByRole("tab")
      .find((t) => t.getAttribute("aria-selected") === "true")!.textContent;
    expect(groupAfter).toBe(groupBefore);
  });
});
