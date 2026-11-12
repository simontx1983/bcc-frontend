/**
 * H1 — a dialog taller than the viewport stays reachable.
 *
 * Before: the backdrop was a fixed flex box that placed the panel with
 * `items-center` (or `items-end` on phones) and no scroll. On a 375px
 * phone a tall panel (wallet sign-up, New Post with the GIF picker, any
 * form with the keyboard up) overflowed both ends, and with body scroll
 * locked the top and bottom, often including Cancel and Submit, could
 * not be reached.
 *
 * Now the backdrop scrolls and the panel is placed with auto margins,
 * which fall to zero when there is no room, so the panel starts at the
 * top and the rest scrolls. jsdom does no layout, so this pins the class
 * contract; the behaviour was checked in a real browser at 375px.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { Dialog } from "@/components/ui/Dialog";

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
afterEach(cleanup);

function parts() {
  const backdrop = screen.getByRole("dialog");
  const panel = backdrop.firstElementChild as HTMLElement;
  return { backdrop: backdrop.className.split(/\s+/), panel: panel.className.split(/\s+/) };
}

describe("Dialog overflow", () => {
  it("the backdrop is the scroll container", () => {
    render(<Dialog title="T" onClose={() => {}}>body</Dialog>);
    const { backdrop } = parts();
    expect(backdrop).toContain("overflow-y-auto");
    expect(backdrop).toContain("overscroll-contain");
  });

  it("never places the panel with flex alignment, which clips an overflowing top", () => {
    for (const center of [true, false]) {
      render(<Dialog title="T" onClose={() => {}} center={center}>body</Dialog>);
      const { backdrop } = parts();
      expect(backdrop.some((c) => /(^|:)items-(center|end)$/.test(c))).toBe(false);
      cleanup();
    }
  });

  it("centered dialogs use my-auto", () => {
    render(<Dialog title="T" onClose={() => {}} center>body</Dialog>);
    expect(parts().panel).toContain("my-auto");
  });

  it("default dialogs are a bottom sheet on phones and centered on md+", () => {
    render(<Dialog title="T" onClose={() => {}}>body</Dialog>);
    const { panel } = parts();
    expect(panel).toContain("mt-auto");
    expect(panel).toContain("md:mb-auto");
    expect(panel).not.toContain("my-auto");
  });

  it("applies to bare and mobileSheet panels too", () => {
    render(<Dialog title="T" onClose={() => {}} bare mobileSheet>body</Dialog>);
    expect(parts().panel).toContain("mt-auto");
    cleanup();
    render(<Dialog title="T" onClose={() => {}} bare center>body</Dialog>);
    expect(parts().panel).toContain("my-auto");
  });
});
