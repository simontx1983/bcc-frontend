/**
 * TabRail — the two things a scrollable tab strip needed and did not have.
 *
 * ## 1. The selected tab could be off-screen on arrival
 *
 * `useRovingTabs` scrolls the FOCUSED tab into view. That is right for
 * keyboard arrowing, but selection and focus are deliberately decoupled here
 * (manual activation), so a deep link like `?tab=account` selected a tab
 * without ever focusing it. The operator landed on the correct panel with the
 * active tab out of sight and no way to tell which one it was.
 *
 * ## 2. Nothing said the rail continued
 *
 * `overflow-x-auto` renders no scrollbar until you scroll, so a rail that
 * continues past the right edge is indistinguishable from one that ends
 * there. Same class of failure as the missing wrap that hid Account on
 * desktop — there the cause was layout, here it is the absence of a hint.
 *
 * ## Why the geometry is faked
 *
 * jsdom has no layout: every `getBoundingClientRect` is zeros and
 * `scrollWidth === clientWidth` always, so a rail can never overflow on its
 * own. These tests install real numbers on the specific elements under test
 * and let the component's actual arithmetic run against them. What is being
 * verified is the decision — "is it off-screen, which way, how far" — not the
 * browser's layout engine. Widths are checked for real in the browser pass.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { TabRail, TAB_RAIL_FADE } from "@/components/ui/TabRail";

// ── geometry harness ──────────────────────────────────────────────────

interface Geometry {
  clientWidth: number;
  scrollWidth: number;
  /** Left offset of each tab within the rail's scroll content. */
  tabAt: (index: number) => { left: number; width: number };
}

/**
 * Give a rail element real metrics and make scrollLeft actually settable.
 *
 * IDEMPOTENT, and that matters: the ref callback fires on every render, and a
 * fresh closure would reset `scrollLeft` to 0 each time. That fixture bug
 * looks exactly like the product bug it is meant to detect — "an unrelated
 * rerender pulled the user back" — so re-installing must preserve position
 * and only refresh the per-tab rects.
 */
const INSTALLED = new WeakMap<HTMLElement, { scrollLeft: number }>();

/** Every scrollTo the component performed, captured from install time so the
 *  mount-effect call is not missed. Cleared per test. */
let SCROLL_CALLS: ScrollToOptions[] = [];

function installGeometry(rail: HTMLElement, g: Geometry) {
  const prior = INSTALLED.get(rail);
  if (prior !== undefined) {
    // Already wired: just re-point the tab rects at the live scroll position.
    const tabsAgain = [...rail.querySelectorAll<HTMLElement>('[role="tab"]')];
    tabsAgain.forEach((tab, i) => {
      const { left, width } = g.tabAt(i);
      tab.getBoundingClientRect = () => {
        const x = left - rail.scrollLeft;
        return { left: x, right: x + width, width, top: 0, bottom: 40, height: 40, x, y: 0, toJSON: () => ({}) } as DOMRect;
      };
    });
    return;
  }
  const state = { scrollLeft: 0 };
  INSTALLED.set(rail, state);
  let scrollLeft = 0;
  Object.defineProperty(rail, "clientWidth", { get: () => g.clientWidth, configurable: true });
  Object.defineProperty(rail, "scrollWidth", { get: () => g.scrollWidth, configurable: true });
  Object.defineProperty(rail, "scrollLeft", {
    get: () => scrollLeft,
    set: (v: number) => {
      scrollLeft = Math.max(0, Math.min(v, g.scrollWidth - g.clientWidth));
      state.scrollLeft = scrollLeft;
      rail.dispatchEvent(new Event("scroll"));
    },
    configurable: true,
  });
  rail.scrollTo = ((opts: ScrollToOptions) => {
    SCROLL_CALLS.push(opts);
    if (typeof opts?.left === "number") {
      (rail as unknown as { scrollLeft: number }).scrollLeft = opts.left;
    }
  }) as HTMLElement["scrollTo"];
  rail.getBoundingClientRect = () =>
    ({ left: 0, right: g.clientWidth, width: g.clientWidth, top: 0, bottom: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;

  const tabs = [...rail.querySelectorAll<HTMLElement>('[role="tab"]')];
  tabs.forEach((tab, i) => {
    const { left, width } = g.tabAt(i);
    tab.getBoundingClientRect = () => {
      const x = left - rail.scrollLeft;
      return { left: x, right: x + width, width, top: 0, bottom: 40, height: 40, x, y: 0, toJSON: () => ({}) } as DOMRect;
    };
  });
}

/** Deliberately CHANGE an installed rail's metrics — the resize case. */
function regeometry(rail: HTMLElement, g: Geometry) {
  INSTALLED.delete(rail);
  installGeometry(rail, g);
}

/** Eight tabs, 120px each = 960px of content in a 375px rail. */
const PHONE: Geometry = {
  clientWidth: 375,
  scrollWidth: 960,
  tabAt: (i) => ({ left: i * 120, width: 120 }),
};
/** Wrapped / fits: no overflow at all. */
const WIDE: Geometry = {
  clientWidth: 960,
  scrollWidth: 960,
  tabAt: (i) => ({ left: i * 120, width: 120 }),
};

const KEYS = ["profile", "privacy", "notifications", "messages", "communities", "showcase", "account", "blocks"];

/**
 * `geometry` is installed from a REF CALLBACK, not after render. Ref
 * callbacks run during commit, before `useEffect`, so the metrics exist by
 * the time TabRail's mount effect measures — which is the whole point of the
 * deep-link test. Installing afterwards would let the effect run against a
 * zero-size rail, bail, and report a false pass.
 */
function Strip({
  active,
  surface,
  geometry,
}: {
  active: string;
  surface?: "theme" | "paper";
  geometry?: Geometry;
}) {
  return (
    <TabRail activeKey={active} {...(surface !== undefined ? { surface } : {})}>
      <div
        role="tablist"
        aria-label="Test strip"
        ref={(el) => {
          if (el !== null && geometry !== undefined) installGeometry(el, geometry);
        }}
      >
        {KEYS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={k === active}>
            {k}
          </button>
        ))}
      </div>
    </TabRail>
  );
}

/** Renders with geometry already in place when effects run. */
function mountWith(g: Geometry, active: string, surface?: "theme" | "paper") {
  const view = render(
    <Strip active={active} geometry={g} {...(surface ? { surface } : {})} />,
  );
  return { ...view, rail: screen.getByRole("tablist") };
}

const fadeStart = () => document.querySelector('[data-tab-fade="start"]') as HTMLElement;
const fadeEnd = () => document.querySelector('[data-tab-fade="end"]') as HTMLElement;
const visible = (el: HTMLElement) => el.className.includes("opacity-100");

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  // jsdom lacks it; the component feature-detects, but the resize test needs
  // a real one to drive.
  if (typeof ResizeObserver === "undefined") {
    class RO {
      constructor(private cb: () => void) { ROs.push(this); }
      observe() {}
      disconnect() { ROs = ROs.filter((r) => r !== this); }
      fire() { this.cb(); }
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  }
});

let ROs: Array<{ fire: () => void }> = [];
beforeEach(() => { ROs = []; SCROLL_CALLS = []; });
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────
// Reveal the selected tab
// ─────────────────────────────────────────────────────────────────────

describe("the selected tab is brought into view", () => {
  it("a deep-linked OFF-SCREEN tab is revealed on mount", async () => {
    // "account" is 7th — left 720 in a 375-wide rail, far past the edge.
    // Nothing focuses it; only selection drives this.
    const { rail } = mountWith(PHONE, "account");
    await act(async () => { await Promise.resolve(); });

    // Centred: 720 - (375-120)/2 = 592.5, clamped to the 585 max.
    expect(rail.scrollLeft).toBeGreaterThan(400);
    // And it is genuinely on screen afterwards.
    const tab = screen.getByRole("tab", { name: "account" });
    const box = tab.getBoundingClientRect();
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(PHONE.clientWidth);
  });

  it("CONTROL: the same tab stays off-screen without the reveal", () => {
    // Proves the assertion above is measuring the component's work and not
    // an artefact of the geometry harness.
    render(
      <div role="tablist" aria-label="bare">
        {KEYS.map((k) => (
          <button key={k} type="button" role="tab" aria-selected={k === "account"}>
            {k}
          </button>
        ))}
      </div>,
    );
    const bare = screen.getByRole("tablist", { name: "bare" });
    installGeometry(bare, PHONE);
    expect(bare.scrollLeft).toBe(0);
    expect(screen.getAllByRole("tab", { name: "account" })[0]!.getBoundingClientRect().right)
      .toBeGreaterThan(PHONE.clientWidth);
  });

  it("a tab already visible is NOT scrolled — no gratuitous movement", async () => {
    const { rail } = mountWith(PHONE, "profile");
    await act(async () => { await Promise.resolve(); });
    expect(rail.scrollLeft).toBe(0);
  });

  it("a selection change reveals the new tab WITHOUT focus moving", async () => {
    function Harness() {
      const [active, setActive] = useState("profile");
      return (
        <>
          <button type="button" onClick={() => setActive("blocks")}>
            change selection
          </button>
          <Strip active={active} geometry={PHONE} />
        </>
      );
    }
    render(<Harness />);
    const rail = screen.getByRole("tablist");
    const before = document.activeElement;
    expect(rail.scrollLeft).toBe(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "change selection" }));
    });
    await act(async () => { await Promise.resolve(); });

    // "blocks" is 8th (left 840) — it was off-screen and is now revealed.
    expect(rail.scrollLeft).toBeGreaterThan(400);
    const box = screen.getByRole("tab", { name: "blocks" }).getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(PHONE.clientWidth);

    // …and focus never moved to a tab. Selection alone drove it, which is the
    // case useRovingTabs cannot cover.
    expect(document.activeElement).toBe(before);
    expect(screen.getByRole("tab", { name: "blocks" })).toHaveAttribute("aria-selected", "true");
  });

  it("does NOT scroll when the rail does not overflow", async () => {
    const { rail } = mountWith(WIDE, "account");
    await act(async () => { await Promise.resolve(); });
    expect(rail.scrollLeft).toBe(0);
  });

  it("scrolls the RAIL, never the page", async () => {
    // scrollIntoView walks every scrollable ancestor and would move the page
    // vertically. The component must not call it.
    const spy = vi.fn();
    const proto = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = spy;
    try {
      const { rail } = mountWith(PHONE, "account");
      installGeometry(rail, PHONE);
      await act(async () => { await Promise.resolve(); });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      Element.prototype.scrollIntoView = proto;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Edge fades
// ─────────────────────────────────────────────────────────────────────

describe("edge fades track the real scroll boundaries", () => {
  it("at the start: right hint only", async () => {
    const { rail } = mountWith(PHONE, "profile");
    await act(async () => { fireEvent.scroll(rail); });
    expect(visible(fadeStart())).toBe(false);
    expect(visible(fadeEnd())).toBe(true);
  });

  it("mid-scroll: both hints", async () => {
    const { rail } = mountWith(PHONE, "profile");
    await act(async () => {
      (rail as unknown as { scrollLeft: number }).scrollLeft = 300;
    });
    expect(visible(fadeStart())).toBe(true);
    expect(visible(fadeEnd())).toBe(true);
  });

  it("at the end: left hint only", async () => {
    const { rail } = mountWith(PHONE, "profile");
    await act(async () => {
      (rail as unknown as { scrollLeft: number }).scrollLeft = 9999;
    });
    expect(visible(fadeStart())).toBe(true);
    expect(visible(fadeEnd())).toBe(false);
  });

  it("no overflow: NEITHER hint — this is also the wrapped desktop state", async () => {
    const { rail } = mountWith(WIDE, "profile");
    await act(async () => { fireEvent.scroll(rail); });
    expect(visible(fadeStart())).toBe(false);
    expect(visible(fadeEnd())).toBe(false);
  });

  it("recalculates when the rail resizes", async () => {
    const { rail } = mountWith(PHONE, "profile");
    await act(async () => { fireEvent.scroll(rail); });
    expect(visible(fadeEnd())).toBe(true);

    // The rail grows past its content — the wrap flip at `sm`.
    regeometry(rail, WIDE);
    await act(async () => {
      for (const ro of ROs) ro.fire();
    });
    expect(visible(fadeEnd())).toBe(false);
  });

  it("both fades are hidden above sm regardless of state", () => {
    mountWith(PHONE, "profile");
    // The breakpoint is CSS, not JS: the elements carry sm:hidden so they
    // cannot paint over a wrapped row even while the overflow flags are set.
    expect(fadeStart().className).toContain("sm:hidden");
    expect(fadeEnd().className).toContain("sm:hidden");
  });
});

describe("boundaries survive fractional pixels", () => {
  /**
   * Real layouts produce sub-pixel scroll extents — a 0.5px difference at the
   * far right is common. A strict `scrollLeft < max` comparison leaves the
   * right fade lit forever at the end of the rail, permanently promising
   * content that is not there. EDGE_EPSILON exists for exactly this.
   */
  const FRACTIONAL: Geometry = {
    clientWidth: 375.4,
    scrollWidth: 960.7,
    tabAt: (i) => ({ left: i * 120.1, width: 120.1 }),
  };

  it("the right fade clears at a fractional maximum", async () => {
    const { rail } = mountWith(FRACTIONAL, "profile");
    await act(async () => {
      (rail as unknown as { scrollLeft: number }).scrollLeft = 960.7 - 375.4 - 0.4;
    });
    expect(visible(fadeEnd()), "right fade stuck on at the end").toBe(false);
    expect(visible(fadeStart())).toBe(true);
  });

  it("the left fade clears at a fractional zero", async () => {
    const { rail } = mountWith(FRACTIONAL, "profile");
    await act(async () => {
      (rail as unknown as { scrollLeft: number }).scrollLeft = 0.4;
    });
    expect(visible(fadeStart()), "left fade stuck on at the start").toBe(false);
  });

  it("a sub-pixel overflow is treated as no overflow", async () => {
    // scrollWidth can exceed clientWidth by a rounding artefact on a row that
    // visually fits. Showing a fade there would be a lie.
    const { rail } = mountWith(
      { clientWidth: 960, scrollWidth: 960.6, tabAt: (i) => ({ left: i * 120, width: 120 }) },
      "profile",
    );
    await act(async () => { fireEvent.scroll(rail); });
    expect(visible(fadeStart())).toBe(false);
    expect(visible(fadeEnd())).toBe(false);
  });
});

describe("the reveal never fights the user", () => {
  it("an unrelated rerender does NOT pull back a manual scroll", async () => {
    // The failure mode: any parent rerender re-running the reveal would yank
    // the rail back mid-swipe. The effect must key on the SELECTION, not on
    // render count.
    function Harness({ n }: { n: number }) {
      return (
        <>
          <span data-testid="n">{n}</span>
          <Strip active="profile" geometry={PHONE} />
        </>
      );
    }
    const { rerender } = render(<Harness n={1} />);
    const rail = screen.getByRole("tablist");

    await act(async () => {
      (rail as unknown as { scrollLeft: number }).scrollLeft = 300;
    });
    expect(rail.scrollLeft).toBe(300);

    await act(async () => { rerender(<Harness n={2} />); });
    await act(async () => { await Promise.resolve(); });

    expect(rail.scrollLeft, "an unrelated rerender moved the user's scroll").toBe(300);
  });

  it("re-selecting the SAME key does not re-scroll", async () => {
    function Harness() {
      const [, bump] = useState(0);
      return (
        <>
          <button type="button" onClick={() => bump((v) => v + 1)}>bump</button>
          <Strip active="profile" geometry={PHONE} />
        </>
      );
    }
    render(<Harness />);
    const rail = screen.getByRole("tablist");
    await act(async () => {
      (rail as unknown as { scrollLeft: number }).scrollLeft = 200;
    });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "bump" })); });
    await act(async () => { await Promise.resolve(); });
    expect(rail.scrollLeft).toBe(200);
  });
});

describe("the revealed tab is not left under the fade", () => {
  it("centring keeps a MIDDLE selected tab clear of both 32px fade bands", async () => {
    // Revealing a tab flush against the edge would tuck it under the very
    // gradient meant to say "there is more" — visible, but dimmed and
    // ambiguous. Centring is what buys the clearance, so it is asserted as a
    // requirement rather than left as an implementation detail.
    // A MIDDLE tab is the discriminating case. For a tab near the far end the
    // scroll clamps at the maximum and the tab lands clear by accident, so a
    // left-aligning implementation would pass. "messages" (4th of 8) has room
    // on both sides: left-aligned it sits flush at x=0, directly beneath the
    // start fade; only centring clears it.
    const FADE_W = 32;
    const { rail } = mountWith(PHONE, "messages");
    await act(async () => { await Promise.resolve(); });

    const railBox = rail.getBoundingClientRect();
    const tabBox = screen.getByRole("tab", { name: "messages" }).getBoundingClientRect();
    expect(tabBox.left).toBeGreaterThanOrEqual(railBox.left + FADE_W - 1);
    expect(tabBox.right).toBeLessThanOrEqual(railBox.right - FADE_W + 1);
  });
});

describe("observer lifecycle", () => {
  it("disconnects its ResizeObserver on unmount", () => {
    const live: Array<{ disconnected: boolean }> = [];
    const Real = globalThis.ResizeObserver;
    class Tracking {
      disconnected = false;
      constructor() { live.push(this); }
      observe() {}
      unobserve() {}
      disconnect() { this.disconnected = true; }
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = Tracking;
    try {
      const view = mountWith(PHONE, "profile");
      expect(live.length, "no observer created").toBeGreaterThan(0);
      expect(live.every((o) => o.disconnected)).toBe(false);
      view.unmount();
      expect(live.every((o) => o.disconnected), "observer leaked past unmount").toBe(true);
    } finally {
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = Real;
    }
  });

  it("removes its scroll listener on unmount", () => {
    const view = mountWith(PHONE, "profile");
    const rail = screen.getByRole("tablist");
    const removed: string[] = [];
    const realRemove = rail.removeEventListener.bind(rail);
    rail.removeEventListener = ((t: string, ...rest: unknown[]) => {
      removed.push(t);
      return (realRemove as unknown as (...a: unknown[]) => void)(t, ...rest);
    }) as typeof rail.removeEventListener;
    view.unmount();
    expect(removed).toContain("scroll");
  });

  it("survives a runtime with NO ResizeObserver", () => {
    const Real = globalThis.ResizeObserver;
    // @ts-expect-error deliberately removing the global
    delete globalThis.ResizeObserver;
    try {
      expect(() => mountWith(PHONE, "profile")).not.toThrow();
      // Falls back to the window-level signal rather than going blind.
      expect(visible(fadeEnd())).toBe(true);
    } finally {
      (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = Real;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Decoration only
// ─────────────────────────────────────────────────────────────────────

describe("the fade is decoration", () => {
  it("is hidden from assistive tech and unfocusable", () => {
    mountWith(PHONE, "profile");
    for (const el of [fadeStart(), fadeEnd()]) {
      expect(el).toHaveAttribute("aria-hidden", "true");
      expect(el.hasAttribute("tabindex")).toBe(false);
      expect(el.textContent).toBe("");
    }
    // Nothing announced, so nothing to repeat.
    expect(document.querySelectorAll('[role="status"], [aria-live]')).toHaveLength(0);
  });

  it("cannot intercept a swipe or a tap", () => {
    mountWith(PHONE, "profile");
    for (const el of [fadeStart(), fadeEnd()]) {
      expect(el.className).toContain("pointer-events-none");
    }
  });

  it("adds no focusable element to the strip", () => {
    mountWith(PHONE, "profile");
    const focusable = document.querySelectorAll("a,button,input,select,textarea,[tabindex]");
    // Exactly the eight tabs, nothing else.
    expect(focusable).toHaveLength(KEYS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Surface families
// ─────────────────────────────────────────────────────────────────────

describe("forced colors", () => {
  /**
   * A high-contrast user replaced the palette deliberately. A gradient is a
   * hint, not information — the tabs, their active underline and the focus
   * ring all survive without it — so the honest response is to remove the
   * decoration rather than fight the chosen palette.
   *
   * Browsers do drop most background images under forced-colors, but not
   * uniformly, and the only way to force a gradient back would be
   * `forced-color-adjust: none` — overriding a user's accessibility setting
   * to preserve decoration. The fade opts out instead.
   *
   * jsdom cannot evaluate `@media (forced-colors: active)`, so the class
   * contract is asserted here and the rendered behaviour is asserted below;
   * the real-emulation result is recorded in the review.
   */
  it("both fades opt out of forced-colors mode", () => {
    mountWith(PHONE, "profile");
    for (const el of [fadeStart(), fadeEnd()]) {
      expect(el.className, "fade would paint over a forced-colors palette")
        .toContain("forced-colors:hidden");
    }
  });

  it("never uses forced-color-adjust to override the user's palette", () => {
    // Comments stripped first: the docblock NAMES the property to explain why
    // it is not used, and the first version of this assertion matched its own
    // documentation rather than any code.
    const raw = readFileSync(resolve(process.cwd(), "src/components/ui/TabRail.tsx"), "utf-8");
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code, "forced-color-adjust would push decoration back into high contrast")
      .not.toMatch(/forced-color-adjust/);
    expect(code).not.toMatch(/forcedColorAdjust/);
  });

  it("the navigation itself is untouched by the opt-out", () => {
    // Only the decoration hides. Tabs, selection, roving focus and the rail's
    // own scrolling must all still be there.
    mountWith(PHONE, "account");
    expect(screen.getAllByRole("tab")).toHaveLength(KEYS.length);
    expect(
      screen.getAllByRole("tab").filter((t) => t.getAttribute("aria-selected") === "true"),
    ).toHaveLength(1);
    // Roving tabIndex belongs to the strips, not to this bare fixture — it is
    // asserted against the real SubTabNav in tab-rail-aria.test.tsx. What this
    // fixture can prove is that the opt-out adds no focusable node of its own.
    expect(document.querySelectorAll("[data-tab-fade][tabindex]")).toHaveLength(0);
    for (const el of [fadeStart(), fadeEnd()]) {
      expect(el.getAttribute("aria-hidden")).toBe("true");
      expect(el.className).toContain("pointer-events-none");
      expect(el.hasAttribute("tabindex")).toBe(false);
    }
  });
});

describe("the two surface families do not cross", () => {
  it("theme is the default and fades to the app background", () => {
    mountWith(PHONE, "profile");
    expect(fadeStart().className).toContain("from-bcc-bg");
    expect(fadeEnd().className).toContain("from-bcc-bg");
  });

  it("paper fades to fixed cream, never a theme token", () => {
    mountWith(PHONE, "profile", "paper");
    for (const el of [fadeStart(), fadeEnd()]) {
      expect(el.className).toContain("from-paper");
      expect(el.className).not.toContain("bcc-bg");
      expect(el.className).not.toContain("bcc-surface");
    }
  });

  it("the token table carries no raw colour literal", () => {
    const all = JSON.stringify(TAB_RAIL_FADE);
    expect(all).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(all).not.toMatch(/\brgba?\(/);
    expect(all).not.toMatch(/\bhsla?\(/);
  });

  it("the two families resolve to different gradients", () => {
    // Guards against a copy-paste that silently points paper at the theme token.
    expect(TAB_RAIL_FADE.theme.left).not.toBe(TAB_RAIL_FADE.paper.left);
    expect(TAB_RAIL_FADE.theme.right).not.toBe(TAB_RAIL_FADE.paper.right);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Reduced motion
// ─────────────────────────────────────────────────────────────────────

describe("reduced motion", () => {
  it("scrolls WITHOUT animating when the user asks for less motion", async () => {
    window.matchMedia = ((q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
      media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    // "account" is off-screen, so the mount effect must scroll — captured
    // from install time rather than by swapping scrollTo afterwards, which is
    // how the first version of this test managed to observe nothing at all.
    mountWith(PHONE, "account");
    await act(async () => { await Promise.resolve(); });

    expect(SCROLL_CALLS.length, "no scroll attempted — behaviour never proven")
      .toBeGreaterThan(0);
    expect(
      SCROLL_CALLS.every((o) => o.behavior === "auto"),
      `reduced motion must not animate; saw ${JSON.stringify(SCROLL_CALLS.map((o) => o.behavior))}`,
    ).toBe(true);
    expect(fadeStart().className).toContain("motion-reduce:transition-none");
  });

  it("DOES animate when motion is permitted — the other half of the branch", async () => {
    window.matchMedia = ((q: string) => ({
      matches: false, media: q, onchange: null,
      addEventListener: () => {}, removeEventListener: () => {},
      addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    mountWith(PHONE, "account");
    await act(async () => { await Promise.resolve(); });

    expect(SCROLL_CALLS.length).toBeGreaterThan(0);
    expect(SCROLL_CALLS.every((o) => o.behavior === "smooth")).toBe(true);
  });
});
