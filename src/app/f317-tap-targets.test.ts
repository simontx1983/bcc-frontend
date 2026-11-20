/**
 * F-317 M-gr3 — the groups and halls controls were drawn at ~28-30px with
 * nothing making the tap target bigger: the join/leave button, the
 * posting-policy switch, the Hall feed's MAIN/RANKED chips, the Hall
 * membership buttons, and the /communities and /halls filter pills, chain
 * picker and APPLY.
 *
 * Same source-scan idiom as F-440, through the shared scanner
 * (tap-target-scan.testing.ts): every covered opening tag must carry a real
 * 44px box or HIT_AREA_44. Each scope has a floor on how many controls the
 * scan found, so a scan that stops matching fails instead of passing over
 * nothing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { classesOf, MECHANISM, openTags } from "@/app/tap-target-scan.testing";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/** One top-level function's source: from its declaration to the next one. */
function functionBody(src: string, name: string): string {
  const start = src.indexOf(`\nfunction ${name}(`);
  if (start === -1) throw new Error(`function ${name} not found`);
  const ends = ["\nfunction ", "\nexport "]
    .map((m) => src.indexOf(m, start + 1))
    .filter((i) => i !== -1);
  return src.slice(start, ends.length > 0 ? Math.min(...ends) : src.length);
}

const short = (tags: string[], src: string) => tags.filter((t) => !MECHANISM.test(classesOf(t, src)));

/** Whole files: every <button> and <select> in them. */
const FILES: ReadonlyArray<{ path: string; buttons: number }> = [
  { path: "src/components/groups/GroupActionButton.tsx", buttons: 1 },
  // CONNECT ANOTHER WALLET, ACCEPT INVITATION, DECLINE.
  { path: "src/components/groups/GroupMembershipStrip.tsx", buttons: 3 },
  { path: "src/components/groups/GroupPostPolicyToggle.tsx", buttons: 1 },
  // The channel chip and the two load-more buttons.
  { path: "src/components/groups/GroupFeedSection.tsx", buttons: 3 },
  // PrimaryButton and SecondaryButton.
  { path: "src/components/halls/HallMembershipControls.tsx", buttons: 2 },
];

describe("F-317 — every button in the groups and halls controls has a 44px target", () => {
  for (const f of FILES) {
    it(f.path, () => {
      const src = read(f.path);
      const tags = [...openTags(src, "button"), ...openTags(src, "select")];
      expect(tags.length).toBeGreaterThanOrEqual(f.buttons);
      expect(short(tags, src)).toEqual([]);
    });
  }
});

describe("F-317 — the discovery filters have a 44px target", () => {
  const COMMUNITIES = "src/app/(main)/(app)/communities/page.tsx";
  const HALLS = "src/app/(main)/(app)/halls/page.tsx";

  it("/communities scope pills", () => {
    const body = functionBody(read(COMMUNITIES), "FilterStrip");
    const pills = openTags(body, "Link");
    expect(pills.length).toBeGreaterThanOrEqual(1);
    expect(short(pills, body)).toEqual([]);
  });

  it("/communities chain picker, APPLY and CLEAR", () => {
    const body = functionBody(read(COMMUNITIES), "ChainDropdown");
    const tags = [...openTags(body, "select"), ...openTags(body, "button"), ...openTags(body, "Link")];
    expect(tags.length).toBeGreaterThanOrEqual(3);
    expect(short(tags, body)).toEqual([]);
  });

  it("/halls chain pills", () => {
    const body = functionBody(read(HALLS), "ChainFilterStrip");
    const pills = openTags(body, "Link");
    expect(pills.length).toBeGreaterThanOrEqual(1);
    expect(short(pills, body)).toEqual([]);
  });

  it("the chain picker's text is 16px, so iOS Safari doesn't zoom into it", () => {
    const body = functionBody(read(COMMUNITIES), "ChainDropdown");
    const [select] = openTags(body, "select");
    expect(select).toMatch(/\btext-base\b/);
    expect(select).not.toMatch(/\btext-\[(?:[0-9]|1[0-5])px\]|\btext-(?:xs|sm)\b/);
  });

  it("pill rows that wrap leave room for the hit areas between rows", () => {
    // HIT_AREA_44 reaches 7px past a ~30px pill, above and below; a wrapped
    // row 8px away would put two areas over each other. gap-y-4 is 16px.
    for (const [path, name] of [
      [COMMUNITIES, "FilterStrip"],
      [HALLS, "ChainFilterStrip"],
    ] as const) {
      expect(functionBody(read(path), name), `${path} ${name}`).toMatch(
        /<div className="flex flex-wrap items-center gap-x-2 gap-y-4">/,
      );
    }
  });
});

describe("F-317 — the group page strip draws its actions at 44px", () => {
  const STRIP = "src/components/groups/GroupMembershipStrip.tsx";

  it("every GroupActionButton in the strip passes touchTarget", () => {
    const src = read(STRIP);
    const re = /<GroupActionButton[\s>]/g;
    const tags: string[] = [];
    for (let m = re.exec(src); m !== null; m = re.exec(src)) tags.push(src.slice(m.index, src.indexOf("/>", m.index)));
    // Holder, Hall and plain JOIN; Hall and plain LEAVE; CHECK & JOIN and
    // CONNECT WALLET & VERIFY; REQUEST TO JOIN; CANCEL REQUEST.
    expect(tags.length).toBeGreaterThanOrEqual(9);
    expect(tags.filter((t) => !/\btouchTarget\b/.test(t))).toEqual([]);
  });

  it("the holder and delegator LEAVE (behind their confirms) pass it too", () => {
    const src = read(STRIP);
    for (const name of ["HolderLeaveConfirm", "ValidatorLeaveConfirm"]) {
      // The source is CRLF, so match any whitespace after the name.
      const at = src.search(new RegExp(`<${name}\\s`));
      expect(at, name).toBeGreaterThan(-1);
      expect(src.slice(at, src.indexOf("/>", at)), name).toMatch(/\btouchTarget\b/);
    }
    const confirm = read("src/components/groups/HolderLeaveConfirm.tsx");
    expect(confirm).toMatch(/touchTarget=\{touchTarget\}/);
  });
});
