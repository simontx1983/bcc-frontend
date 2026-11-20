/**
 * F-440 (a slice of F-259) — tap targets under 44px in the post menu, the
 * comment drawer, and four settings sections.
 *
 * jsdom does no layout, so a rendered test cannot measure a tap target and
 * Tailwind classes are only strings until build time. This uses the repo's
 * source-scan idiom (panel-touch-targets.test.ts, f355-tap-targets.test.tsx):
 * every <button> and <select> opening tag in these files must carry one of
 * the two 44px mechanisms —
 *   - a real 44px box: `min-h-[44px]`, `min-h-11` or `h-11`, or
 *   - HIT_AREA_44 (feed/hitArea.ts): an invisible 44×44 ::before, for small
 *     controls whose look must not change.
 * A className given as a file-level constant (`className={fieldClass}`) is
 * resolved to that constant's string.
 * The scanner itself lives in tap-target-scan.testing.ts (shared with F-317).
 *
 * Each file also has a floor on how many controls the scan found, so a scan
 * that stops matching fails instead of passing over nothing.
 *
 * F-443 / F-444 (ProfileFieldsList follow-ups found during F-440) reuse the
 * same scanner at the end of this file: no form control under 16px, and no
 * display:none checkbox.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { classesOf, MECHANISM, openTags } from "@/app/tap-target-scan.testing";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

const FILES: ReadonlyArray<{ path: string; buttons: number; selects: number }> = [
  { path: "src/components/feed/PostOverflowMenu.tsx", buttons: 4, selects: 0 },
  { path: "src/components/feed/CommentDrawer.tsx", buttons: 19, selects: 0 },
  { path: "src/components/settings/profile/MentorSettingsSection.tsx", buttons: 1, selects: 0 },
  { path: "src/components/settings/profile/ProfileFieldsList.tsx", buttons: 1, selects: 2 },
  { path: "src/components/settings/profile/AccountSection.tsx", buttons: 6, selects: 0 },
  { path: "src/components/settings/profile/DeleteAccountCard.tsx", buttons: 3, selects: 0 },
];

/**
 * Exempt on purpose: the comment photo IS the button (it opens the zoom),
 * so its box is the image's — 64px+ — not a small chrome control.
 */
const EXEMPT = [/setZoomed\(true\)/];

describe("F-440 — the scan sees the controls", () => {
  for (const f of FILES) {
    it(`${f.path}: finds at least ${f.buttons} button(s) and ${f.selects} select(s)`, () => {
      const src = read(f.path);
      expect(openTags(src, "button").length).toBeGreaterThanOrEqual(f.buttons);
      expect(openTags(src, "select").length).toBeGreaterThanOrEqual(f.selects);
    });
  }
});

describe("F-440 — every button and select has a 44px target", () => {
  for (const f of FILES) {
    it(f.path, () => {
      const src = read(f.path);
      const short = [...openTags(src, "button"), ...openTags(src, "select")]
        .filter((tag) => !EXEMPT.some((e) => e.test(tag)))
        .filter((tag) => !MECHANISM.test(classesOf(tag, src)));
      expect(short).toEqual([]);
    });
  }
});

describe("F-440 — form fields and option labels", () => {
  it("the settings text fields are 44px tall", () => {
    for (const [path, name] of [
      ["src/components/settings/profile/AccountSection.tsx", "fieldClass"],
      ["src/components/settings/profile/DeleteAccountCard.tsx", "fieldClass"],
      ["src/components/settings/profile/ProfileFieldsList.tsx", "inputClass"],
    ] as const) {
      const def = new RegExp(`const ${name} =\\s*"([^"]*)"`).exec(read(path));
      expect(def?.[1], `${path} ${name}`).toMatch(/min-h-\[44px\]/);
    }
  });

  it("Yes/No radio labels are 44px; multi-select chips use the 36px chip size", () => {
    const src = read("src/components/settings/profile/ProfileFieldsList.tsx");
    expect(src).toMatch(/<label key=\{opt\.value\} className="bcc-mono flex min-h-\[44px\] items-center/);
    expect(src).toMatch(/"bcc-mono inline-flex min-h-\[36px\] cursor-pointer items-center gap-2 border-2/);
  });
});

describe("F-440 — HIT_AREA_44 neighbours are spaced apart", () => {
  // hitArea.ts: callers must space neighbours so the enlarged areas don't
  // cover each other's visible control (PostActionBar uses gap-x-3).
  const src = read("src/components/feed/CommentDrawer.tsx");

  it("the comment action row", () => {
    expect(src).toMatch(/<div className="-ml-1 flex items-center gap-3 sm:mt-1">\s*<CommentStokeButton/);
    // The 16px collapse toggle's area reaches 14px, 2px past gap-3: ml-0.5
    // keeps it off the Helpful pill beside it.
    expect(src).toMatch(/\$\{HIT_AREA_44\} ml-0\.5 inline-flex h-4 w-4 items-center/);
  });

  it("the comment Helpful pill carries HIT_AREA_44 too, not only the feed one", () => {
    // HelpfulButton renders both sizes from one view; the comment size sits
    // in the same gap-3 rail, so it needs the same area.
    const helpful = read("src/components/feed/HelpfulButton.tsx");
    const minH = /const minH = ([^;]+);/.exec(helpful)?.[1] ?? "";
    const [feed, comment] = minH.split(" : ");
    expect(feed).toMatch(/HIT_AREA_44/);
    expect(comment).toMatch(/HIT_AREA_44/);
  });

  it("the composer toolbar, both groups", () => {
    expect(src).toMatch(/<div className="flex min-w-0 items-center gap-3">\s*<MediaIconButton/);
    expect(src).toMatch(/<div className="flex items-center gap-3">\s*<button\s+type="button"\s+onClick=\{collapse\}/);
  });

  it("the attachment remove box only grows down and left, never over the textarea", () => {
    expect(src).toMatch(/className="group absolute -right-3 -top-1\.5 inline-flex h-11 w-11 items-start justify-end pr-1\.5"/);
  });
});

const PROFILE_FIELDS = "src/components/settings/profile/ProfileFieldsList.tsx";

describe("F-443 — no ProfileFieldsList form control under 16px", () => {
  // iOS Safari zooms the page into a focused control whose font is under
  // 16px, and leaves it zoomed. The visibility select was text-[10px].
  const SMALL_TEXT = /\btext-\[(?:[0-9]|1[0-5])px\]|\btext-(?:xs|sm)\b/;

  it("every select and input", () => {
    const src = read(PROFILE_FIELDS);
    const tags = [...openTags(src, "select"), ...openTags(src, "input")];
    // 2 selects + date, url, email, radio, checkbox, text inputs.
    expect(tags.length).toBeGreaterThanOrEqual(8);
    expect(tags.filter((t) => SMALL_TEXT.test(classesOf(t, src)))).toEqual([]);
  });
});

describe("F-444 — the multi-select chips are reachable by keyboard", () => {
  const src = read(PROFILE_FIELDS);

  it("no checkbox is display:none; the chip's checkbox is sr-only", () => {
    const boxes = openTags(src, "input").filter((t) => /type="checkbox"/.test(t));
    expect(boxes.length).toBeGreaterThanOrEqual(1);
    for (const t of boxes) {
      expect(t).not.toMatch(/className="hidden"/);
      expect(t).toMatch(/className="sr-only"/);
    }
  });

  it("the chip shows the focus ring while its checkbox has keyboard focus", () => {
    // The global :focus-visible ring would draw on the 1px clipped
    // checkbox, so the label carries it.
    expect(src).toMatch(
      /"bcc-mono inline-flex min-h-\[36px\] cursor-pointer[^"]*has-\[:focus-visible\]:outline has-\[:focus-visible\]:outline-2[^"]*has-\[:focus-visible\]:outline-\[color:var\(--bcc-accent\)\]/,
    );
  });
});
