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
 *
 * Each file also has a floor on how many controls the scan found, so a scan
 * that stops matching fails instead of passing over nothing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/**
 * The opening tag starting at `start` ("<button …>"), up to the first `>`
 * outside any `{…}`, string, template literal or comment. A plain regex
 * stops at the `>` of `onClick={() => …}`, and the JSX comments in these
 * tags contain apostrophes.
 */
function openTagAt(src: string, start: number): string {
  const stack: string[] = [];
  for (let i = start + 1; i < src.length; i++) {
    const c = src[i];
    const top = stack[stack.length - 1];
    if (top === '"' || top === "'") {
      if (c === top) stack.pop();
      continue;
    }
    if (top === "`") {
      if (c === "`") stack.pop();
      else if (c === "$" && src[i + 1] === "{") {
        stack.push("{");
        i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      const close = src.indexOf("*/", i + 2);
      i = close === -1 ? src.length : close + 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") stack.push(c);
    else if (c === "{") stack.push("{");
    else if (c === "}") stack.pop();
    else if (c === ">" && stack.length === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated tag at ${start}`);
}

function openTags(src: string, tag: "button" | "select"): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}[\\s>]`, "g");
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const t = openTagAt(src, m.index);
    // A bare `<select>` is prose in a comment ("not a native <select>");
    // every real control here carries attributes (type=, onChange=, …).
    if (t !== `<${tag}>`) out.push(t);
  }
  return out;
}

const MECHANISM = /min-h-\[44px\]|\bmin-h-11\b|\bh-11\b|\bHIT_AREA_44\b/;

/** The tag's own classes, with `className={someConst}` resolved. */
function classesOf(tag: string, src: string): string {
  const ident = /className=\{(\w+)\}/.exec(tag)?.[1];
  if (ident === undefined) return tag;
  const def = new RegExp(`const ${ident} =\\s*"([^"]*)"`).exec(src);
  if (def === null) throw new Error(`className constant ${ident} not found`);
  return `${tag} ${def[1]}`;
}

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
    expect(src).toMatch(/<div className="-ml-1 flex items-center gap-3">\s*<CommentStokeButton/);
  });

  it("the composer toolbar, both groups", () => {
    expect(src).toMatch(/<div className="flex min-w-0 items-center gap-3">\s*<MediaIconButton/);
    expect(src).toMatch(/<div className="flex items-center gap-3">\s*<button\s+type="button"\s+onClick=\{collapse\}/);
  });

  it("the attachment remove box only grows down and left, never over the textarea", () => {
    expect(src).toMatch(/className="group absolute -right-3 -top-1\.5 inline-flex h-11 w-11 items-start justify-end pr-1\.5"/);
  });
});
