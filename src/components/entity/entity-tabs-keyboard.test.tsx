/**
 * EntityTabs — the APG keyboard model and the tab-to-panel relationship.
 *
 * EntityTabs had no tests at all before this file, and shipped with two
 * defects the strip is now fixed for:
 *
 *   1. NO KEYBOARD MODEL. Six separate tab stops, no arrows, no roving
 *      tabIndex — while `useRovingTabs` already served both profile strips.
 *   2. FIVE OF SIX `aria-controls` POINTED AT NOTHING. Every tab carried
 *      `aria-controls="entity-tabpanel-<its own key>"`, but only the active
 *      panel is in the DOM, so the other five referenced dangling ids.
 *
 * Activation stays MANUAL: Backing, Reviews and Watchers each fetch on
 * mount, so selection-following-focus would fire a request for every tab
 * the operator arrows past. Focus and selection therefore diverge while
 * arrowing — that is the correct behaviour, and it is asserted here.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { EntityTabs } from "@/components/entity/EntityTabs";

beforeAll(() => {
  // usePrefersReducedMotion (via useRovingTabs) and TabRail both read
  // matchMedia; jsdom does not implement it.
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
  // jsdom implements neither; useRovingTabs follows focus with the first and
  // TabRail reveals the selected tab with the second.
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scrollTo = () => {};
});

afterEach(cleanup);

function renderTabs(opts: { withOptional?: boolean } = {}) {
  return render(
    <EntityTabs
      backingPanel={<div>backing body</div>}
      reviewsPanel={<div>reviews body</div>}
      activityPanel={<div>activity body</div>}
      watchersPanel={<div>watchers body</div>}
      {...(opts.withOptional === true
        ? {
            onchainPanel: <div>onchain body</div>,
            chainsPanel: <div>chains body</div>,
          }
        : {})}
    />,
  );
}

const tabNames = () =>
  screen.getAllByRole("tab").map((el) => el.textContent ?? "");

describe("tab to panel relationship", () => {
  it("exposes aria-controls on the selected tab ONLY", () => {
    renderTabs({ withOptional: true });
    const withControls = screen
      .getAllByRole("tab")
      .filter((el) => el.hasAttribute("aria-controls"));
    expect(withControls).toHaveLength(1);
    expect(withControls[0]).toHaveAttribute("aria-selected", "true");
  });

  it("points aria-controls at a panel that is actually in the document", () => {
    // This is the defect itself: a dangling idref is invisible to any test
    // that only checks the attribute is present.
    renderTabs({ withOptional: true });
    const selected = screen
      .getAllByRole("tab")
      .find((el) => el.getAttribute("aria-selected") === "true");
    const id = selected?.getAttribute("aria-controls");
    expect(id).toBeTruthy();
    const panel = document.getElementById(id as string);
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("role", "tabpanel");
  });

  it("keeps the panel labelled by the selected tab after a switch", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: "Reviews" }));
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", "entity-tab-reviews");
    expect(document.getElementById("entity-tab-reviews")).not.toBeNull();
    expect(
      screen.getByRole("tab", { name: "Reviews" }).getAttribute("aria-controls"),
    ).toBe(panel.id);
  });
});

describe("roving tabIndex", () => {
  it("gives the strip one tab stop, on the selected tab", () => {
    renderTabs({ withOptional: true });
    const tabs = screen.getAllByRole("tab");
    const stops = tabs.filter((el) => el.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute("aria-selected", "true");
    expect(
      tabs.filter((el) => el.getAttribute("tabindex") === "-1"),
    ).toHaveLength(tabs.length - 1);
  });

  it("moves the tab stop with the selection", () => {
    renderTabs();
    fireEvent.click(screen.getByRole("tab", { name: "Watchers" }));
    expect(screen.getByRole("tab", { name: "Watchers" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("tab", { name: "Reviews" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });
});

describe("manual activation — arrows move focus, they do not select", () => {
  it("ArrowRight focuses the next tab and leaves the panel alone", () => {
    renderTabs();
    const first = screen.getAllByRole("tab")[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });

    expect(document.activeElement).toBe(
      screen.getByRole("tab", { name: "Reviews" }),
    );
    // Selection did NOT follow focus — this is what keeps unfetched panels
    // from mounting as the operator arrows across the strip.
    expect(screen.getByRole("tab", { name: "Reviews" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
    expect(screen.getByText("backing body")).toBeInTheDocument();
    expect(screen.queryByText("reviews body")).toBeNull();
  });

  it("ArrowLeft from the first tab wraps to the last", () => {
    renderTabs({ withOptional: true });
    const tabs = screen.getAllByRole("tab");
    const first = tabs[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
  });

  it("Home and End jump to the ends", () => {
    renderTabs({ withOptional: true });
    const tabs = screen.getAllByRole("tab");
    const third = tabs[2]!;
    third.focus();
    fireEvent.keyDown(third, { key: "End" });
    expect(document.activeElement).toBe(tabs[tabs.length - 1]);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Home" });
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("Enter activates the focused tab", () => {
    renderTabs();
    const first = screen.getAllByRole("tab")[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });

    expect(screen.getByRole("tab", { name: "Reviews" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("reviews body")).toBeInTheDocument();
  });

  it("Space activates the focused tab", () => {
    renderTabs();
    const first = screen.getAllByRole("tab")[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: " " });
    expect(screen.getByRole("tab", { name: "Reviews" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("an unhandled key changes neither focus nor selection", () => {
    renderTabs();
    const first = screen.getAllByRole("tab")[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: "x" });
    expect(document.activeElement).toBe(first);
    expect(first).toHaveAttribute("aria-selected", "true");
  });
});

describe("behaviour that must not have changed", () => {
  it("still lands on the first tab with the documented roster", () => {
    renderTabs({ withOptional: true });
    expect(tabNames()).toEqual([
      "Supporters",
      "Reviews",
      "Activity",
      "Watchers",
      "On-chain",
      "Chains",
    ]);
    expect(screen.getAllByRole("tab")[0]).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("still hides the optional tabs when their panels are null", () => {
    render(
      <EntityTabs
        backingPanel={<div />}
        reviewsPanel={<div />}
        activityPanel={<div />}
        watchersPanel={<div />}
        onchainPanel={null}
        chainsPanel={null}
      />,
    );
    expect(tabNames()).toEqual(["Supporters", "Reviews", "Activity", "Watchers"]);
  });

  it("still renders only the active panel", () => {
    renderTabs({ withOptional: true });
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.queryByText("chains body")).toBeNull();
  });
});
