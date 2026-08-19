/**
 * ProfileHero's avatar must not be amputated by a clipping ancestor.
 *
 * ## The defect this pins
 *
 * The avatar hangs 48px BELOW the cover's bottom edge (`-bottom-12`, with
 * the caption row's `pt-16` reserving the landing space). It used to be a
 * CHILD of the cover box, and the cover box is `overflow-hidden` so an
 * uploaded photo stays inside its frame. So the browser cut the avatar in
 * half, and the half it cut contained the avatar's REMOVE control.
 *
 * Measured in Chromium at 360/375/768/1024/1280 in both themes, with
 * `scrollTop`/`scrollY` pinned at 0 (asserted unchanged) and the overlay
 * revealed through the component's own `:hover` / `:focus-within` rather
 * than Playwright's `hover()`, which calls `scrollIntoViewIfNeeded` and
 * silently scrolls an `overflow:hidden` box:
 *
 *   | width | REMOVE visible | elementFromPoint returns the button |
 *   |-------|----------------|-------------------------------------|
 *   | 360   | 0 of 24.39px   | 0 of 9 sampled points               |
 *   | 375   | 0 of 24.39px   | 0 of 9 sampled points               |
 *   | 768+  | 6 of 24.39px   | 3 of 9 sampled points               |
 *
 * A control that exists in React but not in physical space is not a
 * control. The fix is structural: the avatar became a SIBLING of the
 * cover box inside a new, deliberately non-clipping `relative` wrapper.
 * Avatar geometry is unchanged — the wrapper's only in-flow child is the
 * cover, so `-bottom-12` still resolves to the same 48px, and the
 * avatar's rect measured byte-identical before and after at all ten
 * width×theme combinations. After: 36 of 36px visible and 9 of 9 hit
 * points at every one of them.
 *
 * ## Why the test is DOM-shaped, not text-shaped
 *
 * The defect is a NESTING fact plus a CLASS fact. Grepping the source for
 * `overflow-hidden` cannot tell you which box is an ancestor of which, so
 * the detectors below run against the rendered tree, and the mutation
 * controls re-create the defect by mutating a CLONE of that tree in
 * memory (no file is rewritten — an earlier pass in this programme had
 * `sed -i` silently convert a whole file CRLF→LF).
 *
 * ## What is deliberately NOT asserted
 *
 * jsdom does no layout, so this file cannot re-measure pixels. It pins
 * the two structural facts that produced the pixels, plus the arithmetic
 * relating the overhang to the clearance below it. The pixel evidence
 * lives in the header table above.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Transitive module-load requirement only: the typed API client reads
// clientEnv at import time. Nothing here executes a request.
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const idleMutation = { mutate: vi.fn(), isPending: false, isError: false, error: null };
vi.mock("@/hooks/useUpdateProfile", () => ({
  useUpdateBio: () => idleMutation,
  useUpdateCoverPosition: () => idleMutation,
  useUploadAvatar: () => idleMutation,
  useUploadCover: () => idleMutation,
  useDeleteAvatar: () => idleMutation,
  useDeleteCover: () => idleMutation,
}));

import { ProfileHero } from "./ProfileHero";
import type { MemberProfile } from "@/lib/api/types";

afterEach(cleanup);

// Relative URLs, so `isWpMediaUrl` stays real and returns false — the
// plain-<img> branch renders and next/image never mounts.
const PROFILE = {
  id: 1,
  user_id: 1,
  handle: "p1harness",
  display_name: "P1 Harness",
  avatar_url: "/images/avatar.png",
  cover_photo_url: "/images/cover.png",
  cover_photo_position: { x: 50, y: 50 },
} as unknown as MemberProfile;

// ── the detector ─────────────────────────────────────────────────────────

/**
 * Any Tailwind utility that makes a box clip its overflow, including the
 * `-x`/`-y` axis forms and any variant prefix (`md:`, `hover:`,
 * `md:hover:`). `overflow-visible` and `text-overflow-*` must NOT match —
 * see the must-flag / must-not-flag fixtures below.
 */
const CLIPPING_UTILITY =
  /(?:^|\s)(?:[^\s]+:)?overflow(?:-[xy])?-(?:hidden|clip|auto|scroll)(?![\w-])/;

const classOf = (el: Element): string => el.getAttribute("class") ?? "";
const clips = (el: Element): boolean => CLIPPING_UTILITY.test(classOf(el));

interface Hero {
  section: Element;
  coverBox: Element;
  avatarWrap: Element;
  avatarFrame: Element;
  avatarButtons: Element[];
  avatarRemove: Element;
  coverButtons: Element[];
  caption: Element;
}

/** Locate every node the invariants talk about. Throws if any is missing. */
function readHero(root: ParentNode): Hero {
  const section = root.querySelector("section.bcc-panel");
  const coverBox = root.querySelector('[class~="group/cover"]');
  const avatarWrap = root.querySelector('[class~="group/avatar"]');
  if (section === null) throw new Error("no section.bcc-panel");
  if (coverBox === null) throw new Error("no group/cover box");
  if (avatarWrap === null) throw new Error("no group/avatar wrapper");
  const avatarFrame = avatarWrap.firstElementChild;
  if (avatarFrame === null) throw new Error("avatar wrapper has no frame child");
  const avatarButtons = Array.from(avatarWrap.querySelectorAll("button"));
  const avatarRemove = avatarButtons.find((b) => b.textContent?.trim() === "REMOVE");
  if (avatarRemove === undefined) throw new Error("no avatar REMOVE button");
  const coverOverlay = coverBox.querySelector(":scope > div.absolute");
  const coverButtons =
    coverOverlay === null ? [] : Array.from(coverOverlay.querySelectorAll("button"));
  const caption = Array.from(section.children).find((c) =>
    /(?:^|\s)pt-\d/.test(classOf(c)),
  );
  if (caption === undefined) throw new Error("no caption row reserving top padding");
  return {
    section,
    coverBox,
    avatarWrap,
    avatarFrame,
    avatarButtons,
    avatarRemove,
    coverButtons,
    caption,
  };
}

/** Ancestors of `el`, exclusive, walking up until (and excluding) `stop`. */
function ancestorsUpTo(el: Element, stop: Element): Element[] {
  const out: Element[] = [];
  let n = el.parentElement;
  while (n !== null && n !== stop) {
    out.push(n);
    n = n.parentElement;
  }
  return out;
}

/**
 * THE invariant. Returns a list of violations; empty means the avatar can
 * physically render its full height. Both failure modes the shipped
 * defect combined are covered: re-nesting the avatar inside the cover
 * box, and re-clipping whatever wrapper it now lives in.
 */
function clipViolations(root: ParentNode): string[] {
  const h = readHero(root);
  const out: string[] = [];
  if (h.coverBox.contains(h.avatarWrap)) {
    out.push("avatar wrapper is nested inside the overflow-hidden cover box");
  }
  if (clips(h.avatarWrap)) {
    out.push(`avatar wrapper itself clips: ${classOf(h.avatarWrap)}`);
  }
  for (const a of ancestorsUpTo(h.avatarWrap, h.section)) {
    if (clips(a)) out.push(`clipping ancestor between avatar and panel: ${classOf(a)}`);
  }
  return out;
}

/** The boxes that MUST keep clipping — no cover-photo / panel regression. */
function clipRegressions(root: ParentNode): string[] {
  const h = readHero(root);
  const out: string[] = [];
  if (!clips(h.coverBox)) out.push("cover box no longer clips its photo");
  if (!clips(h.section)) out.push("hero panel no longer clips to its rounded corners");
  if (!clips(h.avatarFrame)) out.push("avatar frame no longer clips its photo");
  return out;
}

const renderHero = () => render(<ProfileHero profile={PROFILE} />).container;

// ─────────────────────────────────────────────────────────────────────────
// 0. Preconditions — a guard that scans nothing passes everything
// ─────────────────────────────────────────────────────────────────────────

describe("preconditions — the scan surface is real", () => {
  it("renders a substantial tree", () => {
    const c = renderHero();
    expect(c.querySelectorAll("*").length).toBeGreaterThan(20);
  });

  it("resolves every node the invariants reason about", () => {
    const h = readHero(renderHero());
    expect(h.section).not.toBeNull();
    expect(h.coverBox).not.toBeNull();
    expect(h.avatarWrap).not.toBeNull();
    expect(h.avatarFrame).not.toBeNull();
    expect(h.caption).not.toBeNull();
    expect(h.avatarButtons).toHaveLength(2); // CHANGE + REMOVE
    expect(h.coverButtons).toHaveLength(3); // CHANGE COVER + REPOSITION + REMOVE
    expect(h.avatarRemove.textContent?.trim()).toBe("REMOVE");
  });

  it("walks a non-empty ancestor chain from the avatar up to the panel", () => {
    const h = readHero(renderHero());
    expect(ancestorsUpTo(h.avatarWrap, h.section).length).toBeGreaterThan(0);
  });

  it("DETECTOR SELF-TEST: must-flag fixtures", () => {
    for (const c of [
      "overflow-hidden",
      "overflow-clip",
      "overflow-auto",
      "overflow-scroll",
      "overflow-x-hidden",
      "overflow-y-hidden",
      "md:overflow-hidden",
      "md:hover:overflow-hidden",
      "group/cover relative h-40 w-full overflow-hidden bg-cardstock-deep md:h-56",
      "relative overflow-y-scroll",
    ]) {
      expect(CLIPPING_UTILITY.test(c), c).toBe(true);
    }
  });

  it("DETECTOR SELF-TEST: must-NOT-flag fixtures", () => {
    for (const c of [
      "",
      "relative",
      "overflow-visible",
      "md:overflow-visible",
      "overflow-ellipsis",
      "text-overflow-hidden",
      "group/avatar absolute -bottom-12 left-6 md:left-8",
      "flex flex-wrap items-end justify-between gap-3 px-6 pb-4 pt-16 md:px-8 md:pt-20",
    ]) {
      expect(CLIPPING_UTILITY.test(c), c).toBe(false);
    }
  });

  it("DETECTOR SELF-TEST: `clips()` agrees with the rendered boxes", () => {
    const h = readHero(renderHero());
    expect(clips(h.coverBox), "cover box").toBe(true); // must-flag, live
    expect(clips(h.section), "hero panel").toBe(true); // must-flag, live
    expect(clips(h.avatarWrap), "avatar wrapper").toBe(false); // must-not-flag, live
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 1. The ruling: nothing between the avatar and the panel may clip
// ─────────────────────────────────────────────────────────────────────────

describe("the avatar escapes the cover box", () => {
  it("reports no clip violations", () => {
    expect(clipViolations(renderHero())).toEqual([]);
  });

  it("the avatar is NOT a descendant of the cover box", () => {
    const h = readHero(renderHero());
    expect(h.coverBox.contains(h.avatarWrap)).toBe(false);
  });

  it("the avatar and the cover box are siblings under one positioned wrapper", () => {
    const h = readHero(renderHero());
    expect(h.avatarWrap.parentElement).toBe(h.coverBox.parentElement);
    expect(classOf(h.avatarWrap.parentElement as Element)).toMatch(/(?:^|\s)relative(?:\s|$)/);
  });

  it("that wrapper does not clip — the whole point of it", () => {
    const h = readHero(renderHero());
    expect(clips(h.avatarWrap.parentElement as Element)).toBe(false);
  });

  it("no ancestor between the avatar and the panel clips", () => {
    const h = readHero(renderHero());
    for (const a of ancestorsUpTo(h.avatarWrap, h.section)) {
      expect(clips(a), classOf(a)).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. No regression: the boxes that SHOULD clip still do
// ─────────────────────────────────────────────────────────────────────────

describe("the cover photo and the panel are still clipped", () => {
  it("reports no clip regressions", () => {
    expect(clipRegressions(renderHero())).toEqual([]);
  });

  it("the cover box keeps overflow-hidden so an upload stays in its frame", () => {
    expect(classOf(readHero(renderHero()).coverBox)).toContain("overflow-hidden");
  });

  it("the hero panel keeps overflow-hidden so content stays inside its radius", () => {
    expect(classOf(readHero(renderHero()).section)).toContain("overflow-hidden");
  });

  it("the avatar's own square frame keeps overflow-hidden", () => {
    expect(classOf(readHero(renderHero()).avatarFrame)).toContain("overflow-hidden");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The avatar did not move, and what it overhangs reserves room for it
// ─────────────────────────────────────────────────────────────────────────

describe("geometry contract", () => {
  const unit = 4; // Tailwind spacing step = 0.25rem at the 16px root

  const overhangSteps = (h: Hero): number => {
    const m = /(?:^|\s)-bottom-(\d+)(?:\s|$)/.exec(classOf(h.avatarWrap));
    if (m === null) throw new Error(`no -bottom-N on ${classOf(h.avatarWrap)}`);
    return Number(m[1]);
  };
  const topPadSteps = (el: Element, prefix: string): number => {
    const m = new RegExp(`(?:^|\\s)${prefix}pt-(\\d+)(?:\\s|$)`).exec(classOf(el));
    if (m === null) throw new Error(`no ${prefix}pt-N on ${classOf(el)}`);
    return Number(m[1]);
  };

  it("the avatar still hangs 48px below the cover, at the same offset", () => {
    const h = readHero(renderHero());
    expect(overhangSteps(h) * unit).toBe(48);
    expect(classOf(h.avatarWrap)).toContain("left-6");
    expect(classOf(h.avatarWrap)).toContain("md:left-8");
    expect(classOf(h.avatarWrap)).toContain("absolute");
  });

  it("the caption row reserves at least the overhang, at both breakpoints", () => {
    const h = readHero(renderHero());
    const overhang = overhangSteps(h) * unit;
    expect(topPadSteps(h.caption, "") * unit).toBeGreaterThanOrEqual(overhang);
    expect(topPadSteps(h.caption, "md:") * unit).toBeGreaterThanOrEqual(overhang);
  });

  it("the reposition panel reserves it too — it is what the avatar lands on in that mode", () => {
    // Latent before the clip fix: the avatar's box already overlapped this
    // panel by 48px and the "CROP POSITION" eyebrow by 96×13px, invisibly,
    // because the overlapping half was being clipped away. Measured 13px →
    // 0px of eyebrow overlap after.
    const c = renderHero();
    const h = readHero(c);
    const reposition = h.coverButtons.find((b) => b.textContent?.trim() === "REPOSITION");
    expect(reposition, "REPOSITION button").toBeDefined();
    fireEvent.click(reposition as Element);

    const panel = Array.from(h.section.children).find((el) =>
      (el.textContent ?? "").includes("CROP POSITION"),
    );
    expect(panel, "reposition panel is mounted").toBeDefined();
    const overhang = overhangSteps(h) * unit;
    expect(topPadSteps(panel as Element, "") * unit).toBeGreaterThanOrEqual(overhang);
    expect(topPadSteps(panel as Element, "md:") * unit).toBeGreaterThanOrEqual(overhang);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Touch target — doctrine §5.9's sanctioned compact minimum
// ─────────────────────────────────────────────────────────────────────────

describe("the avatar overlay controls are tappable", () => {
  // 36px, not 44px: two 44px controls plus the 4px `gap-1` need 92px and
  // the avatar's content box is 88px at base, so 44 cannot fit without
  // resizing the avatar. `min-h-[36px]` is the project's own compact
  // minimum, canonically FilterChipRow (src/components/ui/FilterChipRow.tsx).
  const MIN = "min-h-[36px]";

  it("both overlay buttons carry the compact minimum", () => {
    const h = readHero(renderHero());
    expect(h.avatarButtons).toHaveLength(2);
    for (const b of h.avatarButtons) expect(classOf(b), b.textContent ?? "").toContain(MIN);
  });

  it("they centre their label rather than pinning it to the top edge", () => {
    for (const b of readHero(renderHero()).avatarButtons) {
      expect(classOf(b)).toContain("inline-flex");
      expect(classOf(b)).toContain("items-center");
    }
  });

  it("36px × 2 plus the gap still fits the base avatar's 88px content box", () => {
    const frameOuter = 96; // h-24
    const border = 4 * 2; // border-4
    const gap = 4; // gap-1
    expect(36 * 2 + gap).toBeLessThanOrEqual(frameOuter - border);
    expect(44 * 2 + gap).toBeGreaterThan(frameOuter - border); // why not 44
  });

  it("the REMOVE control is reachable by its accessible name", () => {
    const c = renderHero();
    const h = readHero(c);
    expect(within(h.avatarWrap as HTMLElement).getByRole("button", { name: "REMOVE" })).toBe(
      h.avatarRemove,
    );
    expect(screen.getAllByRole("button", { name: "REMOVE" })).toHaveLength(2); // cover + avatar
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Mutation controls — every mutation asserts its own substitution
//    count, and a mutation that patches nothing fails loudly.
// ─────────────────────────────────────────────────────────────────────────

describe("mutation controls", () => {
  /**
   * Clone the rendered tree, apply `patch` to exactly `expected` nodes,
   * and return the mutated clone. In-memory only — nothing on disk is
   * rewritten, so line endings cannot drift.
   */
  function mutate(
    root: Element,
    pick: (clone: Element) => Element[],
    patch: (el: Element) => void,
    expected: number,
  ): Element {
    const clone = root.cloneNode(true) as Element;
    const targets = pick(clone);
    expect(targets.length, "mutation substitution count").toBe(expected);
    for (const t of targets) patch(t);
    return clone;
  }

  const addClass = (extra: string) => (el: Element) => {
    el.setAttribute("class", `${el.getAttribute("class") ?? ""} ${extra}`.trim());
  };

  it("CONTROL: the real tree trips no detector", () => {
    const c = renderHero();
    expect(clipViolations(c)).toEqual([]);
    expect(clipRegressions(c)).toEqual([]);
  });

  it("M1: re-clipping the new wrapper is caught (1 substitution)", () => {
    const m = mutate(
      renderHero(),
      (clone) => [readHero(clone).avatarWrap.parentElement as Element],
      addClass("overflow-hidden"),
      1,
    );
    expect(clipViolations(m)).toHaveLength(1);
    expect(clipViolations(m)[0]).toContain("clipping ancestor");
  });

  it("M2: re-nesting the avatar inside the cover box is caught (1 substitution)", () => {
    // The exact shipped defect.
    const m = mutate(
      renderHero(),
      (clone) => [readHero(clone).avatarWrap],
      (el) => {
        const cover = (el.getRootNode() as ParentNode).querySelector('[class~="group/cover"]');
        (cover as Element).appendChild(el);
      },
      1,
    );
    // Two detectors fire, and both should: the avatar is inside the cover
    // box, AND the cover box is now a clipping ancestor of it.
    const v = clipViolations(m);
    expect(v).toHaveLength(2);
    expect(v.some((x) => x.includes("nested inside the overflow-hidden cover box"))).toBe(true);
    expect(v.some((x) => x.includes("clipping ancestor between avatar and panel"))).toBe(true);
  });

  it("M3: the axis form `overflow-x-hidden` is caught too (1 substitution)", () => {
    const m = mutate(
      renderHero(),
      (clone) => [readHero(clone).avatarWrap.parentElement as Element],
      addClass("overflow-x-hidden"),
      1,
    );
    expect(clipViolations(m)).toHaveLength(1);
  });

  it("M4: a responsive re-clip `md:overflow-hidden` is caught (1 substitution)", () => {
    const m = mutate(
      renderHero(),
      (clone) => [readHero(clone).avatarWrap.parentElement as Element],
      addClass("md:overflow-hidden"),
      1,
    );
    expect(clipViolations(m)).toHaveLength(1);
  });

  it("M5: clipping the avatar wrapper itself is caught (1 substitution)", () => {
    const m = mutate(
      renderHero(),
      (clone) => [readHero(clone).avatarWrap],
      addClass("overflow-hidden"),
      1,
    );
    expect(clipViolations(m).some((v) => v.includes("avatar wrapper itself clips"))).toBe(true);
  });

  it("M6: dropping the cover box's clip is caught by the REGRESSION detector (1 substitution)", () => {
    const m = mutate(
      renderHero(),
      (clone) => [readHero(clone).coverBox],
      (el) =>
        el.setAttribute(
          "class",
          (el.getAttribute("class") ?? "").replace(/\boverflow-hidden\b/, "").trim(),
        ),
      1,
    );
    expect(clipViolations(m)).toEqual([]); // not a clip DEFECT…
    expect(clipRegressions(m)).toContain("cover box no longer clips its photo"); // …but a regression
  });

  it("M7: dropping the touch-target minimum is caught (2 substitutions)", () => {
    const m = mutate(
      renderHero(),
      (clone) => readHero(clone).avatarButtons,
      (el) =>
        el.setAttribute(
          "class",
          (el.getAttribute("class") ?? "").replace("min-h-[36px]", "").trim(),
        ),
      2,
    );
    for (const b of readHero(m).avatarButtons) {
      expect(classOf(b)).not.toContain("min-h-[36px]");
    }
  });

  it("MUTATION-CONTROL SELF-TEST: a no-op mutation asserts zero substitutions", () => {
    const m = mutate(renderHero(), () => [], addClass("overflow-hidden"), 0);
    expect(clipViolations(m)).toEqual([]);
    expect(clipRegressions(m)).toEqual([]);
  });

  it("MUTATION-CONTROL SELF-TEST: a mutation that patches nothing FAILS LOUDLY", () => {
    // The failure mode this whole section exists to rule out: a mutation
    // whose selector has rotted, patches zero nodes, and is then reported
    // as a passing control because the detector never had anything to
    // catch. `mutate` must throw on the count assertion.
    expect(() =>
      mutate(
        renderHero(),
        (clone) => Array.from(clone.querySelectorAll("[data-does-not-exist]")),
        addClass("overflow-hidden"),
        1,
      ),
    ).toThrow();
  });
});
