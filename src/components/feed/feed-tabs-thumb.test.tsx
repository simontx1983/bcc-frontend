/**
 * FeedTabs' sliding indicator, after the row learned to wrap.
 *
 * ## Why this file exists
 *
 * `FeedTabs` gained `flex-wrap` so a long label can no longer push the page
 * sideways. That was blocked on the thumb: it read only `offsetLeft` and
 * `offsetWidth` and was pinned vertically by `inset-y-1`, so a tab wrapped
 * onto a second row would have been underlined on the FIRST row at the right
 * horizontal position — the indicator pointing confidently at the wrong tab.
 *
 * The structural guard asserts the source now mentions `offsetTop` and
 * translates on both axes. That is a spelling check. It cannot tell whether
 * the rendered indicator actually lands on the selected tab, which is the
 * only thing that matters, so this file drives the real component and reads
 * the resulting style.
 *
 * ## Why geometry is installed on the prototype
 *
 * jsdom reports 0 for every offset. The thumb is positioned from a
 * `useLayoutEffect`, which runs before anything a test could do after
 * `render()`, so the numbers must already be there when the component first
 * measures. Prototype getters backed by a per-label map are the earliest
 * available hook. Original descriptors are captured and restored in
 * `afterEach`, so no other test file inherits the patch.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { FeedTabs } from "@/components/feed/FeedTabs";

// ── controlled geometry ───────────────────────────────────────────────

interface Box { left: number; top: number; width: number; height: number }

/** Keyed by the button's visible label. Set before render. */
let GEO: Record<string, Box> = {};

const OFFSET_PROPS = ["offsetLeft", "offsetTop", "offsetWidth", "offsetHeight"] as const;
const originalDescriptors = new Map<string, PropertyDescriptor | undefined>();

function labelOf(el: HTMLElement): string {
  return (el.textContent ?? "").trim();
}

function installPrototypeGeometry() {
  for (const prop of OFFSET_PROPS) {
    originalDescriptors.set(prop, Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop));
    Object.defineProperty(HTMLElement.prototype, prop, {
      configurable: true,
      get(this: HTMLElement) {
        const box = GEO[labelOf(this)];
        if (box === undefined) return 0;
        return prop === "offsetLeft" ? box.left
          : prop === "offsetTop" ? box.top
          : prop === "offsetWidth" ? box.width
          : box.height;
      },
    });
  }
}

function restorePrototypeGeometry() {
  for (const prop of OFFSET_PROPS) {
    const original = originalDescriptors.get(prop);
    if (original === undefined) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
    else Object.defineProperty(HTMLElement.prototype, prop, original);
  }
  originalDescriptors.clear();
}

/**
 * Single row. `nav` carries `p-1` (4px), so a button sits at top 4 with
 * height 40 — which is precisely what the retired `inset-y-1` produced on a
 * nav of height 48. That equivalence is asserted below.
 */
const ONE_ROW: Record<string, Box> = {
  "For You":  { left: 4,   top: 4, width: 100, height: 40 },
  "Watching": { left: 108, top: 4, width: 100, height: 40 },
  "Signals":  { left: 212, top: 4, width: 100, height: 40 },
};

/** Wrapped: the third tab drops to a second row at top 48. */
const TWO_ROWS: Record<string, Box> = {
  "For You":  { left: 4,   top: 4,  width: 100, height: 40 },
  "Watching": { left: 108, top: 4,  width: 100, height: 40 },
  "Signals":  { left: 4,   top: 48, width: 100, height: 40 },
};

// ── observers, restored per test ──────────────────────────────────────

let resizeCallbacks: Array<() => void> = [];
let liveObservers: Array<{ disconnected: boolean }> = [];
const RealResizeObserver = globalThis.ResizeObserver;

class TestResizeObserver {
  disconnected = false;
  constructor(cb: () => void) {
    resizeCallbacks.push(cb);
    liveObservers.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() { this.disconnected = true; }
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  GEO = { ...ONE_ROW };
  resizeCallbacks = [];
  liveObservers = [];
  installPrototypeGeometry();
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = TestResizeObserver;
});

afterEach(() => {
  cleanup();
  restorePrototypeGeometry();
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RealResizeObserver;
  vi.restoreAllMocks();
});

// ── helpers ───────────────────────────────────────────────────────────

/** The thumb is the aria-hidden span the nav renders behind the buttons. */
function thumb(): HTMLElement {
  const nav = screen.getByRole("tablist", { name: "Feed scope" });
  const el = nav.querySelector<HTMLElement>(":scope > span[aria-hidden]");
  if (el === null) throw new Error("thumb not rendered");
  return el;
}

/** Parse `translate(Xpx, Ypx)` — the only transform the thumb uses. */
function thumbPosition(): { x: number; y: number; width: number; height: number } {
  const s = thumb().style;
  const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(s.transform);
  if (m === null) throw new Error(`thumb transform is not a 2-axis translate: "${s.transform}"`);
  return {
    x: Number(m[1]), y: Number(m[2]),
    width: parseFloat(s.width), height: parseFloat(s.height),
  };
}

const tab = (label: string) => screen.getByRole("tab", { name: new RegExp(label) });

// ─────────────────────────────────────────────────────────────────────

describe("the thumb is placed from the selected tab's real box", () => {
  it("uses offsetLeft/Top/Width/Height on first paint", () => {
    render(<FeedTabs active="following" onChange={() => {}} />);
    // "Watching" is the second tab: left 108, top 4, 100x40.
    expect(thumbPosition()).toEqual({ x: 108, y: 4, width: 100, height: 40 });
  });

  it("single-row geometry matches the retired inset-y-1 exactly", () => {
    // `inset-y-1` on a 48px nav produced top 4 and height 40. The explicit
    // geometry must reproduce that, or the pill visibly changes on the
    // overwhelmingly common single-row case.
    render(<FeedTabs active="for_you" onChange={() => {}} />);
    const t = thumbPosition();
    expect(t.y, "top no longer matches inset-y-1").toBe(4);
    expect(t.height, "height no longer matches inset-y-1").toBe(40);
  });
});

describe("wrapping — the defect this guards", () => {
  it("follows the selected tab DOWN to a second row", () => {
    GEO = { ...TWO_ROWS };
    render(<FeedTabs active="signals" onChange={() => {}} />);

    const t = thumbPosition();
    expect(t.y, "thumb stayed on row one while the selected tab wrapped").toBe(48);
    expect(t.x).toBe(4);
    expect(t.width).toBe(100);
    expect(t.height).toBe(40);
  });

  it("NEVER sits on row one while the selection is on row two", () => {
    // The exact failure the horizontal-only implementation produced: correct
    // x, wrong row — an indicator pointing confidently at the wrong tab.
    GEO = { ...TWO_ROWS };
    render(<FeedTabs active="signals" onChange={() => {}} />);
    const selectedTop = GEO["Signals"]!.top;
    expect(thumbPosition().y).toBe(selectedTop);
    expect(thumbPosition().y).not.toBe(GEO["For You"]!.top);
  });

  it("returns to the first row when the selection moves back", () => {
    GEO = { ...TWO_ROWS };
    const { rerender } = render(<FeedTabs active="signals" onChange={() => {}} />);
    expect(thumbPosition().y).toBe(48);

    rerender(<FeedTabs active="for_you" onChange={() => {}} />);
    expect(thumbPosition()).toEqual({ x: 4, y: 4, width: 100, height: 40 });
  });

  it("recalculates when the nav resizes into a wrapped layout", () => {
    render(<FeedTabs active="signals" onChange={() => {}} />);
    // Starts unwrapped: Signals is third on row one.
    expect(thumbPosition()).toEqual({ x: 212, y: 4, width: 100, height: 40 });

    // The viewport narrows and the row wraps; the observer fires.
    GEO = { ...TWO_ROWS };
    act(() => {
      for (const cb of resizeCallbacks) cb();
    });

    expect(thumbPosition(), "resize did not re-measure").toEqual({
      x: 4, y: 48, width: 100, height: 40,
    });
  });
});

describe("selection and painting order", () => {
  it("reports the chosen scope and does not self-select", () => {
    const onChange = vi.fn();
    render(<FeedTabs active="for_you" onChange={onChange} />);

    fireEvent.click(tab("Signals"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("signals");

    // Controlled component: the parent owns `active`, so aria-selected must
    // not move on its own.
    expect(tab("For You")).toHaveAttribute("aria-selected", "true");
    expect(tab("Signals")).toHaveAttribute("aria-selected", "false");
  });

  it("has no arrow-key model — activation is the native button click", () => {
    // Recorded rather than asserted as desirable: unlike the profile strips,
    // FeedTabs has no roving tabIndex or arrow handling. Three tabs, each its
    // own tab stop. Noted so a future reader does not assume parity.
    const onChange = vi.fn();
    render(<FeedTabs active="for_you" onChange={onChange} />);
    fireEvent.keyDown(tab("Signals"), { key: "ArrowRight" });
    expect(onChange).not.toHaveBeenCalled();
    for (const label of ["For You", "Watching", "Signals"]) {
      expect(tab(label).getAttribute("tabindex")).toBeNull();
    }
  });

  it("the thumb paints BEHIND the tabs, never over their labels", () => {
    render(<FeedTabs active="for_you" onChange={() => {}} />);
    const nav = screen.getByRole("tablist", { name: "Feed scope" });
    const children = [...nav.children];
    // Thumb first in DOM, and every button raised above it.
    expect(children[0]).toBe(thumb());
    for (const label of ["For You", "Watching", "Signals"]) {
      expect(tab(label).className).toMatch(/\bz-10\b/);
    }
    expect(thumb().className).not.toMatch(/\bz-\d+\b/);
    expect(thumb()).toHaveAttribute("aria-hidden");
  });
});

describe("lifecycle hygiene", () => {
  it("disconnects its ResizeObserver on unmount", () => {
    const view = render(<FeedTabs active="for_you" onChange={() => {}} />);
    expect(liveObservers.length).toBeGreaterThan(0);
    view.unmount();
    expect(liveObservers.every((o) => o.disconnected)).toBe(true);
  });

  it("this file installs and removes its own prototype patch", () => {
    // Proves the teardown claim rather than asserting it in prose: the
    // getters are live here, and `afterEach` restores them for every other
    // file in the run.
    const el = document.createElement("div");
    el.textContent = "For You";
    expect(el.offsetTop).toBe(4);
    restorePrototypeGeometry();
    expect(el.offsetTop).toBe(0);
    installPrototypeGeometry(); // leave the suite as it was found
  });
});
