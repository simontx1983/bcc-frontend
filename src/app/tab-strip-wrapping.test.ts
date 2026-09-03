/**
 * A tab must never hide past the right edge of its own strip.
 *
 * ## The failure this replaces
 *
 * Six `role="tablist"` strips scroll horizontally below `sm` so labels stay
 * readable at 360px. Three of them paired that with `sm:flex-wrap`, so from
 * 640px up the row wraps and every tab is visible. Three did not — they
 * scrolled at every width.
 *
 * The settings sub-strip was one of the three. It carries eight tabs, so
 * "Account" (7th) sat past the right edge on an ordinary laptop, and
 * `overflow-x-auto` renders no scrollbar until you scroll — nothing on
 * screen suggested more tabs existed. It was reported as the Account
 * settings being missing entirely, which is the honest description of a
 * control nobody can see.
 *
 * `SubTabNav` is shared, so that one omission hid tabs on the settings,
 * Blog and Standing strips at once.
 *
 * ## The rule
 *
 * Any element with `role="tablist"` that opts into `overflow-x-auto` MUST
 * also declare `sm:flex-wrap`. Wrapping makes the overflow inert above the
 * breakpoint, so the mobile swipe is preserved and nothing is hidden on a
 * normal viewport.
 *
 * Non-tab horizontal scrollers are out of scope and deliberately untouched:
 * the cookie-policy table, the validators filter-chip row and the rank
 * modal's content row are all legitimately swipeable.
 */

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/**
 * Every source file DECLARING a tablist, found rather than hardcoded.
 *
 * `git grep` finds the string, which is not the same thing: `TabRail.tsx`
 * contains `querySelector('[role="tablist"]')` — it looks a tablist up, it
 * does not render one. A reference is preceded by `[` (an attribute
 * selector); a JSX declaration is not. Without that discriminator the guard
 * demanded a className from a file that has no tablist to give one, and
 * failed on a file it was never meant to police.
 */
function tablistFiles(): string[] {
  // `--untracked`: git grep searches only TRACKED files by default, so a
  // newly added strip was invisible to this guard until the moment it was
  // committed — precisely when the author most needs to be told. Verified:
  // an unwrapped scrolling tablist in an uncommitted file passed cleanly
  // before this flag was added.
  const out = execFileSync("git", ["grep", "-l", "--untracked", 'role="tablist"', "--", "src"], {
    encoding: "utf-8",
    cwd: process.cwd(),
  });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== "" && !s.includes(".test."))
    .filter((f) => /(^|[^[])role="tablist"/.test(read(f)));
}

/**
 * The className string on each `role="tablist"` element.
 *
 * Comments are stripped FIRST. The role and the class list are separated by
 * other attributes and often by a long explanatory comment — the first
 * version of this matcher capped the gap at 600 characters and silently
 * found nothing once a comment grew past it, which made the rule below pass
 * vacuously on the very file it was written for. Removing comments makes the
 * gap small and predictable instead of guessing at a limit.
 */
function tablistClassNames(src: string): string[] {
  const clean = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  const found: string[] = [];
  // `[^[]` excludes `[role="tablist"]` attribute selectors — see tablistFiles.
  const re = /(^|[^[])role="tablist"([\s\S]{0,400}?)className=(?:"([^"]*)"|\{`([^`]*)`\})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) found.push(m[3] ?? m[4] ?? "");
  return found;
}

describe("preconditions", () => {
  it("finds the tab strips at all", () => {
    const files = tablistFiles();
    expect(files.length, "no tablist files found — the search is broken").toBeGreaterThanOrEqual(5);
  });

  it("extracts a className for EVERY file that declares a tablist", () => {
    // Per-file, not a total. A total lets one unreadable file hide behind
    // the others — which is exactly how the first version of this guard
    // passed while seeing nothing in the file it was written for.
    const blind: string[] = [];
    for (const f of tablistFiles()) {
      if (tablistClassNames(read(f)).length === 0) blind.push(f);
    }
    expect(
      blind,
      `tablist declared but no className extracted — the guard is blind here:\n  ${blind.join("\n  ")}`,
    ).toHaveLength(0);
  });
});

describe("every scrolling tab strip also wraps", () => {
  it("no tablist scrolls horizontally at ALL widths", () => {
    const offenders: string[] = [];
    for (const file of tablistFiles()) {
      for (const cls of tablistClassNames(read(file))) {
        const scrolls = /\boverflow-x-(auto|scroll)\b/.test(cls);
        const wraps = /\bsm:flex-wrap\b/.test(cls) || /(^|\s)flex-wrap\b/.test(cls);
        if (scrolls && !wraps) offenders.push(`${file}: ${cls}`);
      }
    }
    expect(
      offenders,
      `tablist scrolls with no wrap — tabs past the right edge are unreachable:\n  ${offenders.join("\n  ")}`,
    ).toHaveLength(0);
  });

  it("the three strips that were broken now wrap", () => {
    // Named explicitly: the generic rule above would also pass if these
    // files stopped being tab strips altogether.
    const fixed = [
      "src/components/profile/SubTabNav.tsx",
      "src/components/watching/WatchingTabs.tsx",
      "src/components/search/SearchResultsPage.tsx",
    ];
    for (const f of fixed) {
      const classes = tablistClassNames(read(f));
      expect(classes.length, `${f} no longer declares a tablist`).toBeGreaterThan(0);
      expect(classes.some((c) => c.includes("sm:flex-wrap")), `${f} missing sm:flex-wrap`).toBe(true);
    }
  });

  it("the three that were already correct still are", () => {
    for (const f of [
      "src/components/profile/ProfileTabs.tsx",
      "src/components/entity/EntityTabs.tsx",
      "src/components/groups/GroupTabs.tsx",
    ]) {
      expect(read(f)).toMatch(/sm:flex-wrap/);
    }
  });

  it("the mobile swipe is preserved — wrapping did not replace scrolling", () => {
    // The fix ADDS a breakpoint; it must not drop overflow-x-auto, or 360px
    // regresses to a squashed or clipped row.
    for (const f of [
      "src/components/profile/SubTabNav.tsx",
      "src/components/watching/WatchingTabs.tsx",
    ]) {
      const cls = tablistClassNames(read(f))[0] ?? "";
      expect(cls, `${f} lost its mobile scroll`).toMatch(/overflow-x-auto/);
      expect(cls, `${f} lost its edge bleed`).toMatch(/-mx-4/);
    }
  });
});

/**
 * Mode switchers are not destination navigation and are out of scope: they
 * change what a control is doing, not where you are. Listed explicitly rather
 * than pattern-matched so adding one is a deliberate act.
 */
const MODE_SWITCHERS = new Set([
  "src/components/composer/Composer.tsx",
  "src/components/blog/BodyEditor.tsx",
  "src/components/admin/ModerationQueue.tsx",
]);

describe("every destination tablist has a strategy", () => {
  /**
   * The gap this closes: the earlier guard only asked "if it scrolls, does it
   * wrap / have a rail". A strip with NEITHER passed silently — no wrap, no
   * scroll, so a long label simply pushes the row past the viewport and takes
   * the page into horizontal overflow. `FeedTabs` was measurably in that state
   * (scrollWidth 297 against clientWidth 296 at 360px/200% text) and
   * `BackingPanel` was one translation away from it.
   *
   * Every destination tablist must therefore declare one of two strategies:
   *   WRAP   — `flex-wrap` (or `sm:flex-wrap` paired with a scroll below it)
   *   SCROLL — `overflow-x-auto` AND `sm:flex-wrap` AND a `TabRail`
   */
  it("no destination tablist has neither wrap nor scroll", () => {
    const offenders: string[] = [];
    for (const file of tablistFiles()) {
      if (MODE_SWITCHERS.has(file)) continue;
      for (const cls of tablistClassNames(read(file))) {
        const wraps = /(^|\s)(sm:)?flex-wrap\b/.test(cls);
        const scrolls = /overflow-x-(auto|scroll)/.test(cls);
        if (!wraps && !scrolls) offenders.push(`${file}: ${cls}`);
      }
    }
    expect(
      offenders,
      `destination tablist with no wrap and no scroll — a long label pushes the page sideways:\n  ${offenders.join("\n  ")}`,
    ).toHaveLength(0);
  });

  it("the two controls fixed here declare a wrap", () => {
    for (const f of [
      "src/components/feed/FeedTabs.tsx",
      "src/components/profile/panels/BackingPanel.tsx",
    ]) {
      const classes = tablistClassNames(read(f));
      expect(classes.length, `${f} no longer declares a tablist`).toBeGreaterThan(0);
      expect(
        classes.some((c) => /(^|\s)flex-wrap\b/.test(c)),
        `${f} lost its wrap — it has no scroll strategy either`,
      ).toBe(true);
    }
  });

  it("FeedTabs' sliding thumb tracks BOTH axes, so wrapping is safe", () => {
    // Wrapping was blocked on this: the thumb read only offsetLeft/offsetWidth
    // and was pinned by `inset-y-1`, so a wrapped second-row tab would have
    // been underlined on the first row at the right x.
    const src = read("src/components/feed/FeedTabs.tsx");
    expect(src).toMatch(/offsetTop/);
    expect(src).toMatch(/offsetHeight/);
    expect(src).toMatch(/translate\(\$\{thumbRect\.left\}px, \$\{thumbRect\.top\}px\)/);
    expect(src, "thumb still vertically pinned").not.toMatch(/absolute inset-y-1/);
  });
});

describe("every scrolling navigation strip has a rail", () => {
  /**
   * A strip that scrolls can hide tabs, and a hidden tab needs two things:
   * something on screen saying the rail continues, and the selected tab
   * scrolled into view. `TabRail` supplies both. Wrapping alone is not enough
   * below `sm`, where the strips deliberately still scroll.
   *
   * The first pass wired four strips and missed two. `GroupTabs` was the
   * costly miss: `/communities/[slug]/about` and `/members` mount it with
   * `initialTab` set, and in urlBase mode a tab click navigates to a sibling
   * ROUTE — so every tab change is a fresh mount whose active tab is 2nd or
   * 3rd of five, exactly the arrive-off-screen case.
   */
  it("no tablist scrolls without a TabRail around it", () => {
    const offenders: string[] = [];
    for (const file of tablistFiles()) {
      const src = read(file);
      const scrolls = tablistClassNames(src).some((c) => /overflow-x-(auto|scroll)/.test(c));
      if (scrolls && !src.includes("TabRail")) offenders.push(file);
    }
    expect(
      offenders,
      `scrolling strip with no rail — its tabs can hide with no way to know:\n  ${offenders.join("\n  ")}`,
    ).toHaveLength(0);
  });

  it("names the six wired strips explicitly", () => {
    // The generic rule above would pass if a file stopped scrolling; this
    // pins the actual coverage so a silent regression is visible.
    for (const f of [
      "src/components/profile/SubTabNav.tsx",
      "src/components/profile/ProfileTabs.tsx",
      "src/components/watching/WatchingTabs.tsx",
      "src/components/search/SearchResultsPage.tsx",
      "src/components/entity/EntityTabs.tsx",
      "src/components/groups/GroupTabs.tsx",
    ]) {
      expect(read(f), `${f} lost its TabRail`).toContain("<TabRail");
    }
  });

  it("strips that WRAP at every width correctly have no rail", () => {
    // Not an oversight: these never overflow, so a rail would add a wrapper
    // and two dead nodes for nothing.
    for (const f of [
      "src/components/profile/panels/WatchingPanel.tsx",
      "src/components/profile/panels/PhotosPanel.tsx",
    ]) {
      const src = read(f);
      const classes = tablistClassNames(src);
      expect(classes.some((c) => /(^|\s)flex-wrap/.test(c)), `${f} no longer wraps`).toBe(true);
      expect(classes.some((c) => /overflow-x-(auto|scroll)/.test(c)), `${f} now scrolls`).toBe(false);
    }
  });
});

describe("mutation controls", () => {
  it("W1: dropping sm:flex-wrap from the shared strip is caught", () => {
    const src = read("src/components/profile/SubTabNav.tsx");
    const mutated = src.replace(" sm:flex-wrap", "");
    expect(mutated, "mutation did not apply").not.toBe(src);
    const offenders = tablistClassNames(mutated).filter(
      (c) => /overflow-x-(auto|scroll)/.test(c) && !/flex-wrap/.test(c),
    );
    expect(offenders.length).toBeGreaterThan(0);
  });

  it("W2: a NEW scrolling strip with no wrap would be caught", () => {
    const invented = `<div role="tablist" aria-label="New" className="flex overflow-x-auto border-b">`;
    const offenders = tablistClassNames(invented).filter(
      (c) => /overflow-x-(auto|scroll)/.test(c) && !/flex-wrap/.test(c),
    );
    expect(offenders).toHaveLength(1);
  });

  it("SELF-TEST: a compliant strip trips nothing", () => {
    const ok = `<div role="tablist" className="flex overflow-x-auto sm:flex-wrap border-b">`;
    const offenders = tablistClassNames(ok).filter(
      (c) => /overflow-x-(auto|scroll)/.test(c) && !/flex-wrap/.test(c),
    );
    expect(offenders).toHaveLength(0);
  });
});
