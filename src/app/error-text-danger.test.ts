/**
 * #205, option 3, step 1 — error text on page and panel grounds moves from
 * safety orange to the theme-aware danger red.
 *
 * `--bcc-safety` (#f05a28) is theme-blind and reads 3.39:1 as small text on
 * the light page and panel. `--bcc-danger` is theme-aware (#dc2626 light,
 * #ef4444 dark) and clears 4.5:1 on exactly two grounds in both themes:
 * the page (`--bcc-bg`) and the panel (`--bcc-surface`). On every other
 * ground it still fails in at least one theme, and in dark it is WEAKER
 * than safety (it is the lighter-luminance red), so moving those sites
 * would trade one failure for another or make dark worse:
 *
 *   ground                safety L / D    danger L / D
 *   page                  3.39 / 5.59     4.83 / 5.03   -> moved
 *   panel (surface)       3.39 / 5.11     4.83 / 4.60   -> moved
 *   raised                3.22 / 4.78     4.59 / 4.30   -> kept
 *   hover                 3.08 / 4.49     4.39 / 4.04   -> kept
 *   safety/5 tint         3.20 / 4.86     4.55 / 4.38   -> kept
 *   paper (fixed)         2.95 / 2.95     4.21 / 3.28   -> kept
 *
 * 42 error lines moved; each one's ground was traced through its real
 * JSX ancestors (and mount sites where the component has none). The 15
 * kept error lines are a later PR. Labels, eyebrows, verdicts and marks
 * keep safety on purpose — #205 option 3 moves error text only.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => lin(v / 255));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/**
 * Light and dark values. Positional lookup is unsafe here: `--bcc-danger`
 * is declared four times (a theme-less base before the light block), so
 * the values are named and each is asserted to be declared in globals.css.
 */
const VALUES = {
  light: { danger: "#dc2626", bg: "#ffffff", surface: "#ffffff", hover: "#f3f4f6", raised: "#f9f9f9" },
  dark: { danger: "#ef4444", bg: "#0d1117", surface: "#161b22", hover: "#21262d", raised: "#1c2128" },
} as const;
const TOKEN_NAME = { danger: "bcc-danger", bg: "bcc-bg", surface: "bcc-surface", hover: "bcc-surface-hover", raised: "bcc-surface-raised" } as const;
type Theme = keyof typeof VALUES;
const token = (key: keyof typeof TOKEN_NAME, theme: Theme) => VALUES[theme][key];
const THEMES = [["light", "light"], ["dark", "dark"]] as const;

it("the named values are the declared token values", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const [key, name] of Object.entries(TOKEN_NAME)) {
      const v = VALUES[theme][key as keyof typeof TOKEN_NAME];
      expect(CSS, `--${name}: ${v}`).toMatch(new RegExp(`--${name}:\\s*${v}\\s*;`, "i"));
    }
  }
});

/** Files whose moved error lines now read `text-bcc-danger` → how many. */
const MOVED: Readonly<Record<string, number>> = {
  "src/app/(main)/(app)/communities/page.tsx": 1,
  "src/app/(main)/(app)/halls/page.tsx": 1,
  "src/app/(main)/(app)/messages/new/page.tsx": 2,
  "src/components/admin/ModerationQueue.tsx": 2,
  "src/components/admin/UndoToast.tsx": 1,
  "src/components/auth/EligibleCommunitiesModal.tsx": 1,
  "src/components/blog/BlogComposer.tsx": 1,
  "src/components/blog/CoverImageUpload.tsx": 1,
  "src/components/claim/ClaimFlow.tsx": 1,
  "src/components/communities/CommunityJoinCard.tsx": 1,
  "src/components/composer/Composer.tsx": 2,
  "src/components/disputes/DisputeDetail.tsx": 1,
  "src/components/disputes/OpenDisputeModal.tsx": 1,
  "src/components/endorse/EndorseButton.tsx": 2,
  "src/components/feed/ReportButton.tsx": 1,
  "src/components/groups/GroupTransferOwnership.tsx": 1,
  "src/components/halls/HallMembershipControls.tsx": 1,
  "src/components/messages/MessageComposer.tsx": 1,
  "src/components/onchain/NftPickerModal.tsx": 2,
  "src/components/onchain/NftShowcaseSettings.tsx": 2,
  "src/components/profile/AttestationActionCluster.tsx": 1,
  "src/components/profile/BlockToggle.tsx": 1,
  "src/components/profile/FindingsSection.tsx": 1,
  "src/components/profile/ReportMemberModal.tsx": 1,
  "src/components/profile/SlotHoldersPicker.tsx": 1,
  "src/components/review/ReviewCallout.tsx": 1,
  "src/components/settings/CommunitiesList.tsx": 1,
  "src/components/settings/NotificationPrefsForm.tsx": 1,
  "src/components/settings/PrivacySettingsForm.tsx": 1,
  "src/components/settings/SettingsSaveStatus.tsx": 1,
  "src/components/settings/profile/AccountSection.tsx": 2,
  "src/components/settings/profile/BioEditor.tsx": 1,
  "src/components/settings/profile/MentorSettingsSection.tsx": 1,
  "src/components/settings/profile/ProfileFieldsList.tsx": 1,
  "src/components/settings/profile/ProfileHero.tsx": 1,
};

/**
 * `role="alert"` lines still on safety, by file → count and ground. These
 * are the deferred half of #205, not exemptions: danger fails on each.
 */
const KEPT_ALERTS: Readonly<Record<string, readonly [number, string]>> = {
  "src/app/(main)/(app)/messages/[id]/page.tsx": [1, "paper (bcc-paper)"],
  "src/components/composer/Composer.tsx": [1, "raised (inline composer)"],
  "src/components/groups/GroupTransferOwnership.tsx": [2, "paper (group strip)"],
  "src/components/onchain/CollectionStancePanel.tsx": [2, "hover (load error) + paper (row error)"],
  "src/components/settings/ConnectionsSection.tsx": [1, "hover (provider card)"],
  "src/components/settings/WalletsSection.tsx": [3, "hover (link form) + safety/5 tint (recovery email) x2"],
};

function productionTsx(dir = resolve(process.cwd(), "src"), acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) productionTsx(full, acc);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
      acc.push(full.slice(resolve(process.cwd()).length + 1).replace(/\\/g, "/"));
    }
  }
  return acc;
}

const SAFETY_TEXT = /(?<![\w:\-[])text-safety\b/;

describe("#205 — the danger token clears AA on page and panel, in both themes", () => {
  for (const [theme, s] of THEMES) {
    it(`${theme}: danger >= 4.5 on page and panel, safety was not (light)`, () => {
      expect(ratio(token("danger", s), token("bg", s))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(token("danger", s), token("surface", s))).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("safety fails on the light page and panel (why the move exists)", () => {
    expect(CSS).toMatch(/--bcc-safety:\s*#f05a28\s*;/);
    expect(ratio("#f05a28", token("bg", "light"))).toBeLessThan(4.5);
    expect(ratio("#f05a28", token("surface", "light"))).toBeLessThan(4.5);
  });

  it("danger fails on the deferred grounds, so they were not moved", () => {
    expect(ratio(token("danger", "light"), token("hover", "light"))).toBeLessThan(4.5);
    expect(ratio(token("danger", "dark"), token("hover", "dark"))).toBeLessThan(4.5);
    expect(ratio(token("danger", "dark"), token("raised", "dark"))).toBeLessThan(4.5);
    const paper = /--paper:\s*(#[0-9a-fA-F]{6})/.exec(CSS)?.[1] ?? "";
    expect(paper).not.toBe("");
    expect(ratio(token("danger", "light"), paper)).toBeLessThan(4.5);
    expect(ratio(token("danger", "dark"), paper)).toBeLessThan(4.5);
  });
});

describe("#205 — moved error lines read text-bcc-danger", () => {
  for (const [file, n] of Object.entries(MOVED)) {
    it(`${file.split("/").pop()} has ${n} danger error line(s)`, () => {
      const hits = read(file).split(/\r?\n/).filter((l) => /\btext-bcc-danger\b/.test(l));
      expect(hits.length).toBeGreaterThanOrEqual(n);
    });
  }

  it("exactly 42 lines moved", () => {
    expect(Object.values(MOVED).reduce((a, b) => a + b, 0)).toBe(42);
  });
});

describe("#205 — no NEW alert line on safety text", () => {
  it("every role=alert line still on safety is a recorded deferral", () => {
    const counts: Record<string, number> = {};
    for (const f of productionTsx()) {
      for (const l of read(f).split(/\r?\n/)) {
        if (/role=["']alert["']/.test(l) && SAFETY_TEXT.test(l)) counts[f] = (counts[f] ?? 0) + 1;
      }
    }
    const expected = Object.fromEntries(Object.entries(KEPT_ALERTS).map(([f, [n]]) => [f, n]));
    expect(counts).toEqual(expected);
  });

  it("the scan saw a real tree", () => {
    expect(productionTsx().length).toBeGreaterThan(300);
  });
});
