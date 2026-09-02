/**
 * ProfileHero's photo controls: visible, on a known surface, safety as a
 * mark only.
 *
 * ## What this file used to guard, and why it changed
 *
 * This was `profile-hero-badge-contrast.test.ts`. It guarded five buttons
 * that lived in hover overlays ON TOP of the cover photo and the avatar —
 * i.e. over an arbitrary user upload. That placement forced expensive
 * arithmetic, worth keeping on the record because it is the reason no
 * control may ever go back over user imagery:
 *
 *   - `text-cardstock` on any safety-derived fill is **capped at 2.71:1**
 *     and can never reach AA at any alpha. Safety's luminance (0.2599) sits
 *     between ink (0.0041) and cardstock (0.7889), so lowering alpha only
 *     slides the plate along that axis. The two REMOVE badges measured
 *     2.63:1 and 2.89:1 as shipped; `border-safety/70` over its own
 *     `bg-safety/80` fill measured 1.00:1 — the border did nothing.
 *   - The fix was an **opaque** ink plate, which drops the image out of the
 *     compositing entirely: 15.51:1 whatever the operator uploaded,
 *     measured as exactly `rgb(15,13,9)` in all 72 sampled cases.
 *   - `disabled:opacity-50` had to go from all five, because group opacity
 *     dims plate and label together and collapsed the badges to 1.70:1.
 *
 * All of that was the cost of putting text over an unknown background.
 *
 * The overlays are **deleted**. They were `opacity-0` until hover —
 * measured at 360px as `opacity: 0` with `pointer-events: auto`, so the
 * controls were invisible but clickable, and undiscoverable on any touch
 * device. Their replacement is a single labelled menu trigger in the
 * caption, on `bg-bcc-surface`: a known theme token, not a photo.
 * Per-button contrast arithmetic is therefore no longer this file's job —
 * the text/surface pair is the app-wide token pair, and
 * `disabled:opacity-*` is the ordinary house idiom again (WCAG 1.4.3
 * exempts inactive controls).
 *
 * ## What it guards now
 *
 * The regressions that would undo this work:
 *
 *   1. controls hidden behind hover, in any form;
 *   2. controls placed back over the cover or avatar imagery, which would
 *      reintroduce the whole unknown-background problem above;
 *   3. safety used as a fill or a text colour on a control rather than as
 *      a leading-edge mark — doctrine §5.4, "colour the mark, not the word";
 *   4. the trigger degrading to icon-only, which would leave a first-time
 *      owner with a "⋯" and no idea what it opens;
 *   5. the five-button wall coming back.
 *
 * Both ProfileHero and the ActionMenu primitive are scanned: the trigger
 * lives in one and the destructive mark in the other, so scanning either
 * alone would miss half the surface.
 *
 * Every detector is paired with a mutation control: a planted violation
 * must be caught, and a no-op mutation must change nothing. A detector
 * that cannot fail is not a guard.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const HERO = "src/components/settings/profile/ProfileHero.tsx";
const MENU = "src/components/ui/ActionMenu.tsx";
const HERO_SRC = readFileSync(resolve(process.cwd(), HERO), "utf-8");
const MENU_SRC = readFileSync(resolve(process.cwd(), MENU), "utf-8");

/** Strip block and line comments so prose can never satisfy a detector. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const HERO_CODE = stripComments(HERO_SRC);
const MENU_CODE = stripComments(MENU_SRC);
const BOTH = `${HERO_CODE}\n${MENU_CODE}`;

// ── detectors ────────────────────────────────────────────────────────────

/** A control container revealed only on hover. */
const HOVER_REVEAL = /opacity-0[^"`]*group-hover|group-hover[^"`]*opacity-100/;

/** The JSX body of the cover box and the avatar frame. */
function mediaRegions(src: string): string {
  const start = src.indexOf('data-bcc-hero="cover"');
  const end = src.indexOf("hasCover && reposMode");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("cannot locate the media region between the cover box and the crop panel");
  }
  return src.slice(start, end);
}
const hasButtonOverMedia = (src: string) => /<button/.test(mediaRegions(src));

/** Safety used as a background fill anywhere. */
const SAFETY_FILL = /\bbg-safety\b|\bbg-safety\/\d+/;

function safetyTokens(c: string): string[] {
  return c.match(/[\w:[\]/-]*safety[\w:[\]/-]*/g) ?? [];
}

/** Every className string literal, including template literals. */
function classStrings(src: string): string[] {
  return [
    ...[...src.matchAll(/className="([^"]+)"/g)].map((m) => m[1] ?? ""),
    ...[...src.matchAll(/className=\{`([^`]+)`\}/g)].map((m) => m[1] ?? ""),
    ...[...src.matchAll(/`([^`\\\n]*(?:bcc-mono|border|bg-)[^`\\\n]*)`/g)].map((m) => m[1] ?? ""),
  ];
}

// ─────────────────────────────────────────────────────────────────────────
// 0. Preconditions — a guard that scans nothing passes everything
// ─────────────────────────────────────────────────────────────────────────

describe("preconditions — the scan surface is real", () => {
  it("reads a substantial hero and menu", () => {
    expect(HERO_SRC.length).toBeGreaterThan(8_000);
    expect(MENU_SRC.length).toBeGreaterThan(3_000);
    expect(HERO_CODE.length).toBeGreaterThan(4_000);
  });

  it("locates a non-empty media region to scan", () => {
    expect(mediaRegions(HERO_CODE).length).toBeGreaterThan(500);
  });

  it("renders the menu items it reasons about", () => {
    for (const label of [
      "Add profile photo",
      "Change profile photo",
      "Remove profile photo",
      "Add cover photo",
      "Change cover photo",
      "Reposition cover photo",
      "Remove cover photo",
    ]) {
      expect(HERO_CODE, label).toContain(label);
    }
  });

  it("extracts class strings from both files", () => {
    expect(classStrings(HERO_CODE).length).toBeGreaterThan(10);
    expect(classStrings(MENU_CODE).length).toBeGreaterThan(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 1. The invariants
// ─────────────────────────────────────────────────────────────────────────

describe("photo controls are discoverable", () => {
  it("no control is revealed by hover", () => {
    expect(HOVER_REVEAL.test(BOTH)).toBe(false);
  });

  it("no button sits over the cover photo or the avatar", () => {
    expect(hasButtonOverMedia(HERO_CODE)).toBe(false);
  });

  it("the trigger carries a text label, not just an icon", () => {
    expect(HERO_CODE).toContain('triggerLabel="Edit photos"');
    // The ellipsis is decorative and must stay hidden from assistive tech.
    expect(MENU_CODE).toMatch(/aria-hidden[^>]*>⋯|⋯/);
    expect(MENU_CODE).toContain("<span aria-hidden>⋯</span>");
  });

  it("the menu is a real menu, not a div of buttons", () => {
    expect(MENU_CODE).toContain('aria-haspopup="menu"');
    expect(MENU_CODE).toContain('role="menu"');
    expect(MENU_CODE).toContain('role="menuitem"');
    expect(MENU_CODE).toContain('role="group"');
    expect(MENU_CODE).toContain("aria-expanded");
  });

  it("the five-button control row is gone", () => {
    // Its distinguishing marker was a role=group of buttons in the hero.
    expect(HERO_CODE).not.toContain('aria-label="Profile photo controls"');
    // And the shared button constants it used.
    expect(HERO_CODE).not.toMatch(/const BTN(_\w+)?\s*=/);
  });

  it("controls sit on a theme surface, not a fixed plate over imagery", () => {
    const trigger = classStrings(MENU_CODE).find((c) => /bg-bcc-surface/.test(c));
    expect(trigger).toBeDefined();
    // `(?![\w-])` matters: a bare \b also matches inside
    // `bg-bcc-surface-hover`, which would pass on a hover-only mention.
    expect(trigger).toMatch(/\bbg-bcc-surface(?![\w-])/);
    expect(trigger).toMatch(/\btext-bcc-text(?![\w-])/);
    expect(trigger).not.toMatch(/\btext-cardstock\b/);
  });
});

describe("safety is a mark, never a fill or a word", () => {
  it("no safety background fill in either file", () => {
    expect(SAFETY_FILL.test(BOTH)).toBe(false);
  });

  it("every safety utility on a control is a border utility", () => {
    for (const c of classStrings(BOTH)) {
      for (const t of safetyTokens(c)) {
        // text-safety is allowed on validation alerts, which are not
        // controls; assert only that no CONTROL class uses it as a word.
        if (!/border|bg-/.test(c)) continue;
        expect(t, c).toMatch(/^(?:hover:|focus-visible:)?border(?:-[a-z])?(?:-\[\dpx\])?-safety$/);
      }
    }
  });

  it("the destructive menu item carries a leading-edge safety mark", () => {
    expect(MENU_CODE).toMatch(/border-l-\[\dpx\] border-l-safety/);
    expect(HERO_CODE).toContain("destructive: true");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Mutation controls — prove each detector can fail
// ─────────────────────────────────────────────────────────────────────────

describe("mutation controls", () => {
  function mutate(src: string, find: RegExp, replace: string, expected: number): string {
    let n = 0;
    const out = src.replace(find, () => {
      n += 1;
      return replace;
    });
    expect(n, `substitutions for ${find}`).toBe(expected);
    return out;
  }

  it("CONTROL: the real source trips none of the detectors", () => {
    expect(HOVER_REVEAL.test(BOTH)).toBe(false);
    expect(hasButtonOverMedia(HERO_CODE)).toBe(false);
    expect(SAFETY_FILL.test(BOTH)).toBe(false);
  });

  it("M1: reintroducing a hover-revealed overlay is caught", () => {
    const m = mutate(
      HERO_CODE,
      /triggerLabel="Edit photos"/,
      'triggerLabel="Edit photos" data-x="opacity-0 transition group-hover/cover:opacity-100"',
      1,
    );
    expect(HOVER_REVEAL.test(m)).toBe(true);
  });

  it("M2: putting a button back over the cover image is caught", () => {
    const m = mutate(
      HERO_CODE,
      /NO COVER PHOTO/,
      'NO COVER PHOTO</span><button type="button">Change cover</button><span>',
      1,
    );
    expect(hasButtonOverMedia(m)).toBe(true);
  });

  it("M3: a safety fill on a control is caught", () => {
    const m = mutate(MENU_CODE, /border-l-\[3px\] border-l-safety/, "bg-safety/80", 1);
    expect(SAFETY_FILL.test(m)).toBe(true);
  });

  it("M4: safety used as a text colour on a control is caught", () => {
    const m = mutate(MENU_CODE, /border-l-\[3px\] border-l-safety/, "text-safety", 1);
    const offenders = classStrings(m)
      .filter((c) => /border|bg-/.test(c))
      .flatMap((c) => safetyTokens(c))
      .filter((t) => !/^(?:hover:|focus-visible:)?border(?:-[a-z])?(?:-\[\dpx\])?-safety$/.test(t));
    expect(offenders.length).toBeGreaterThan(0);
  });

  it("M5: swapping the theme surface for a fixed cardstock plate is caught", () => {
    const m = mutate(MENU_CODE, /bg-bcc-surface px-3/, "bg-ink px-3", 1);
    const trigger = classStrings(m).find((c) => /min-h-\[36px\]/.test(c));
    expect(trigger).toBeDefined();
    expect(/\bbg-bcc-surface(?![\w-])/.test(trigger ?? "")).toBe(false);
  });

  it("M6: dropping the trigger's text label is caught", () => {
    const m = mutate(HERO_CODE, /triggerLabel="Edit photos"/, 'triggerLabel=""', 1);
    expect(m).not.toContain('triggerLabel="Edit photos"');
  });

  it("M7: reintroducing the five-button row is caught", () => {
    const m = mutate(
      HERO_CODE,
      /<div ref=\{menuAnchorRef\}/,
      '<div role="group" aria-label="Profile photo controls" ref={menuAnchorRef}',
      1,
    );
    expect(m).toContain('aria-label="Profile photo controls"');
  });

  it("MUTATION-CONTROL SELF-TEST: a no-op mutation changes nothing", () => {
    const m = mutate(HERO_CODE, /triggerLabel="Edit photos"/, 'triggerLabel="Edit photos"', 1);
    expect(m).toBe(HERO_CODE);
    expect(HOVER_REVEAL.test(m)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Comment-stripping is load-bearing
// ─────────────────────────────────────────────────────────────────────────

describe("the detectors read code, not prose", () => {
  it("the components' own docblocks cannot satisfy a detector", () => {
    // Both headers discuss the deleted overlays, including `opacity-0`.
    // If stripping regressed, that prose would read as a live overlay.
    expect(HERO_SRC).toMatch(/opacity-0/);
    expect(HERO_CODE).not.toMatch(/opacity-0/);
    expect(MENU_SRC).toMatch(/hover/i);
  });

  it("stripping removes a substantial amount of prose", () => {
    expect(HERO_SRC.length - HERO_CODE.length).toBeGreaterThan(2_000);
  });
});
