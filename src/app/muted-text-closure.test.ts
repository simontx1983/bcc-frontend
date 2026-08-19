/**
 * E6 — the closure guard for the `--bcc-text-muted` AA remediation.
 *
 * This is not a slice guard. It asserts the **programme invariant**:
 *
 *   > Every remaining colour-bearing use of `--bcc-text-muted` in
 *   > production TSX/TS is a disabled control or `aria-hidden`
 *   > decoration. No readable text uses the token anywhere.
 *
 * The token measures 2.54:1 light and 2.28:1 dark — it fails AA as text
 * on every surface in the app. WCAG 1.4.3 exempts inactive controls and
 * pure decoration, and nothing else. So the set of survivors is not a
 * matter of taste: **37 occurrences, each with a stated mechanism.**
 *
 * ## No "known exception" bucket
 *
 * Every survivor is classified by an evidenced mechanism, not by being
 * on a list:
 *
 *   - `disabled-inline`   the line carries `cursor-not-allowed`,
 *                         `cursor-wait`, or a `disabled:` variant
 *   - `disabled-branch`   the line is the else-branch of a ternary whose
 *                         other branch is a live `<Link href=…>` — the
 *                         pager spans, which have no `href` and no
 *                         cursor class, so their inactivity is structural
 *   - `disabled-guard`    the line sits inside an `if (isDisabled)` block
 *   - `decorative-inline` `aria-hidden` appears on the line itself
 *   - `decorative-typed`  the value feeds a prop whose renderer is
 *                         `aria-hidden` (LoadFailure's glyph token)
 *
 * A survivor that matches no mechanism fails the suite. There is
 * deliberately no escape hatch: if a future occurrence is genuinely
 * exempt, it must earn a mechanism, and that mechanism must be provable
 * from the source.
 *
 * ## Scope note
 *
 * `--bcc-search-placeholder` is NOT one of the 37. It is a separate
 * token, carved out in E4 because `.bcc-search-input` sits on
 * `--bcc-glass-bg-frosted` with a `backdrop-filter` and its backdrop is
 * unbounded. It is tested below only as a **deferred invariant** — that
 * it still exists, still holds the pre-repair values, and is still
 * failing. It must never be counted as a muted-token exclusion or read
 * as resolved.
 *
 * Likewise out of scope and untouched: `--phosphor`, `--bcc-safety` and
 * `--weld` (three unscoped, theme-blind tokens that fail light theme),
 * focus residue, touch targets, loading states, tab keyboard navigation.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd(), "src");
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");

/** Every colour-bearing spelling of the token. */
const MUTED =
  /text-bcc-text-muted|text-\[var\(--bcc-text-muted\)\]|color:\s*"?var\(--bcc-text-muted\)|(?<![-\w[])bcc-text-muted(?![-\w)])/;

interface Hit {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

/** Walk production TSX/TS — tests excluded, since they discuss the token. */
function productionFiles(dir = ROOT, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      productionFiles(full, acc);
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
      acc.push(full.slice(resolve(process.cwd()).length + 1).replace(/\\/g, "/"));
    }
  }
  return acc;
}

const FILES = productionFiles();
const HITS: Hit[] = FILES.flatMap((f) =>
  read(f)
    .split(/\r?\n/)
    .map((text, i) => ({ file: f, line: i + 1, text: text.trim() }))
    .filter((h) => MUTED.test(h.text)),
);

// ─────────────────────────────────────────────────────────────────────────
// 0. The scan must have actually scanned something
// ─────────────────────────────────────────────────────────────────────────

describe("closure scan — the scan itself is honest", () => {
  it("walked a real number of production files", () => {
    // A pattern that matches nothing certifies an empty room. This suite
    // has produced exactly that failure more than once during the
    // programme, so the floor is asserted before anything is concluded.
    expect(FILES.length).toBeGreaterThan(300);
    expect(FILES.some((f) => f.endsWith("src/components/layout/LeftSidebar.tsx"))).toBe(true);
    expect(FILES.some((f) => f.startsWith("src/app/"))).toBe(true);
  });

  it("excluded test files, which legitimately discuss the token", () => {
    expect(FILES.filter((f) => /\.(test|spec)\.tsx?$/.test(f))).toHaveLength(0);
  });

  it("found a non-zero number of occurrences", () => {
    expect(HITS.length).toBeGreaterThan(0);
  });

  it("the matcher recognises all four spellings", () => {
    for (const s of [
      'className="text-bcc-text-muted"',
      'className="text-[var(--bcc-text-muted)]"',
      'style={{ color: "var(--bcc-text-muted)" }}',
      'className="bcc-mono bcc-text-muted"',
    ]) {
      expect(MUTED.test(s), `matcher missed: ${s}`).toBe(true);
    }
    expect(MUTED.test('className="text-bcc-text-secondary"')).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 1. The invariant: 37 survivors, every one exempt
// ─────────────────────────────────────────────────────────────────────────

type Mechanism =
  | "disabled-inline"
  | "disabled-branch"
  | "disabled-guard"
  | "decorative-inline"
  | "decorative-typed";

/** Classify a survivor, or return null if nothing justifies it. */
function mechanismFor(hit: Hit): Mechanism | null {
  if (/cursor-not-allowed|cursor-wait|disabled:/.test(hit.text)) return "disabled-inline";
  if (/aria-hidden/.test(hit.text)) return "decorative-inline";

  const lines = read(hit.file).split(/\r?\n/);
  const i = hit.line - 1;

  // disabled-branch: the `: (` arm of `cond ? <Link href=…> : <span…>`
  const above = lines.slice(Math.max(0, i - 12), i).join("\n");
  if (/<Link\b[\s\S]*href=/.test(above) && /\)\s*:\s*\($/m.test(above) && !/href=/.test(hit.text)) {
    return "disabled-branch";
  }

  // disabled-guard: inside an `if (isDisabled) {` block
  for (let j = i; j >= 0 && j > i - 8; j -= 1) {
    if (/if \(isDisabled\)/.test(lines[j] ?? "")) return "disabled-guard";
  }

  // decorative-typed: a token consumed by an aria-hidden renderer
  const key = /^(\w+):/.exec(hit.text)?.[1];
  if (key !== undefined) {
    const src = read(hit.file);
    const declaresAriaHidden = new RegExp(`Decorative[^*]*aria-hidden[\\s\\S]{0,120}${key}:`).test(src);
    const rendererIsHidden = /className=\{tokens\.\w+\}/.test(src) && /aria-hidden/.test(src);
    if (declaresAriaHidden && rendererIsHidden) return "decorative-typed";
  }
  return null;
}

/**
 * The approved survivors, as a sorted multiset of `file :: source line`.
 *
 * Identity is file + content rather than file + line: line numbers shift
 * whenever anything above them is edited, which would make this fail for
 * reasons unrelated to the contract. Five entries are genuine duplicates
 * (identical lines within one file), so this is compared as a sorted
 * array, not a Set — collapsing them would hide a deletion.
 */
const APPROVED_SURVIVORS: readonly string[] = [
    "src/app/(main)/(app)/communities/page.tsx :: <span className=\"bcc-mono text-bcc-text-muted\">Next \u2192</span>",
    "src/app/(main)/(app)/communities/page.tsx :: <span className=\"bcc-mono text-bcc-text-muted\">\u2190 Previous</span>",
    "src/app/(main)/(app)/directory/page.tsx :: <span aria-hidden className=\"text-bcc-text-muted\">\u2715</span>",
    "src/app/(main)/(app)/halls/page.tsx :: <span className=\"bcc-mono text-bcc-text-muted\">Next \u2192</span>",
    "src/app/(main)/(app)/halls/page.tsx :: <span className=\"bcc-mono text-bcc-text-muted\">\u2190 Previous</span>",
    "src/app/(main)/(app)/validators/page.tsx :: <span aria-hidden className=\"text-bcc-text-muted\">\u2715</span>",
    "src/components/auth/EligibleCommunitiesModal.tsx :: <span aria-hidden className=\"text-bcc-text-muted\">\u00b7</span>",
    "src/components/auth/EligibleCommunitiesModal.tsx :: <span aria-hidden className=\"text-bcc-text-muted\">\u00b7</span>",
    "src/components/blog/BlogComposer.tsx :: : \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\")",
    "src/components/claim/ClaimCallout.tsx :: : \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\")",
    "src/components/claim/ClaimFlow.tsx :: ? \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\"",
    "src/components/composer/Composer.tsx :: : \"cursor-not-allowed bg-[var(--bcc-surface-active)] text-[var(--bcc-text-muted)]\")",
    "src/components/composer/Composer.tsx :: : \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\")",
    "src/components/composer/Composer.tsx :: : \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\")",
    "src/components/composer/Composer.tsx :: className=\"inline-flex h-6 w-6 shrink-0 cursor-not-allowed items-center justify-center r",
    "src/components/composer/Composer.tsx :: className=\"inline-flex h-6 w-6 shrink-0 cursor-not-allowed items-center justify-center r",
    "src/components/creator/CreatorGallery.tsx :: ? \"cursor-wait bg-bcc-surface-active text-bcc-text-muted\"",
    "src/components/disputes/DisputeDetail.tsx :: ? \"cursor-not-allowed border-bcc-border text-bcc-text-muted\"",
    "src/components/disputes/OpenDisputeModal.tsx :: : \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\")",
    "src/components/endorse/EndorseButton.tsx :: : \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\")",
    "src/components/endorse/EndorseButton.tsx :: ? \"cursor-wait bg-bcc-surface-active text-bcc-text-muted\"",
    "src/components/feed/CommentDrawer.tsx :: className=\"bcc-mono block w-full cursor-not-allowed rounded-lg px-2 py-1.5 text-left tex",
    "src/components/feed/CommentDrawer.tsx :: className=\"bcc-mono block w-full cursor-not-allowed rounded-lg px-2 py-1.5 text-left tex",
    "src/components/feed/ReportButton.tsx :: : \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\")",
    "src/components/messages/ConversationsPanel.tsx :: <div style={{ display: \"flex\", justifyContent: \"center\", marginBottom: 10, color: \"var(-",
    "src/components/notifications/NotificationsPanel.tsx :: className=\"bcc-mono text-[10px] tracking-[0.16em] normal-case text-[var(--bcc-accent)] h",
    "src/components/profile/AttestationActionCluster.tsx :: return `${BASE_BUTTON_CLASS} ${sizeClass} border border-bcc-border text-bcc-text-muted`;",
    "src/components/profile/FindingsSection.tsx :: className=\"bcc-mono text-safety hover:underline underline-offset-4 disabled:cursor-not-a",
    "src/components/profile/ReportMemberModal.tsx :: : \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\")",
    "src/components/profile/StandingFileBody.tsx :: <span aria-hidden className=\"mx-2 text-bcc-text-muted\">\u00b7</span>",
    "src/components/profile/StandingFileBody.tsx :: <span aria-hidden className=\"text-bcc-text-muted\">",
    "src/components/review/ReviewCallout.tsx :: : \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\")",
    "src/components/review/ReviewCallout.tsx :: ? \"cursor-wait bg-bcc-surface-active text-bcc-text-muted\"",
    "src/components/settings/CommunitiesList.tsx :: <span aria-hidden className=\"text-bcc-text-muted\">\u00b7</span>",
    "src/components/settings/CommunitiesList.tsx :: <span aria-hidden className=\"text-bcc-text-muted\">\u00b7</span>",
    "src/components/settings/NotificationPrefsForm.tsx :: : \"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted\")",
    "src/components/ui/LoadFailure.tsx :: glyph: \"text-[var(--bcc-text-muted)]\","
];

const identity = (h: Hit) => `${h.file} :: ${h.text.slice(0, 88)}`;

describe("closure invariant — every surviving muted use is exempt", () => {
  it("there are exactly 37 survivors", () => {
    expect(HITS).toHaveLength(37);
  });

  it("the survivors are EXACTLY the approved set, member for member", () => {
    // Not just the count and not just per-slice tallies: an occurrence that
    // moved between files, or a new one appearing while another vanished,
    // would keep those numbers right and this assertion wrong.
    expect(APPROVED_SURVIVORS).toHaveLength(37);
    expect([...HITS].map(identity).sort()).toEqual([...APPROVED_SURVIVORS].sort());
  });

  it("every survivor has a provable exemption mechanism", () => {
    const unexplained = HITS.filter((h) => mechanismFor(h) === null).map(
      (h) => `${h.file}:${h.line}  ${h.text.slice(0, 80)}`,
    );
    expect(unexplained, `muted text with no exemption:\n${unexplained.join("\n")}`).toEqual([]);
  });

  it("zero readable muted sites remain", () => {
    const readable = HITS.filter((h) => {
      const m = mechanismFor(h);
      return m === null;
    });
    expect(readable).toHaveLength(0);
  });

  it("the mechanism split is what the audit found", () => {
    const counts = HITS.reduce<Record<string, number>>((acc, h) => {
      const m = mechanismFor(h) ?? "UNEXPLAINED";
      acc[m] = (acc[m] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts).toEqual({
      "disabled-inline": 22,
      "disabled-branch": 4,
      "disabled-guard": 1,
      "decorative-inline": 9,
      "decorative-typed": 1,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The earlier slices' exclusions are still there
// ─────────────────────────────────────────────────────────────────────────

const at = (file: string, line: number) => HITS.some((h) => h.file === file && h.line === line);

describe("closure — E2's six exclusions survive", () => {
  const APP = "src/app/(main)/(app)";
  const E2: ReadonlyArray<readonly [string, number, string]> = [
    // 467/483 before the solid-safety-foreground slice added a five-line
    // rationale comment to the CreateCommunityCta className at :273 (net +5).
    // The exclusions themselves are untouched — only their line numbers moved.
    [`${APP}/communities/page.tsx`, 472, "← Previous, no prev page"],
    [`${APP}/communities/page.tsx`, 488, "Next →, no next page"],
    // 300/316 before the phosphor-confinement slice removed a verified tint
    // and added its rationale comment three lines above these (net +2).
    [`${APP}/halls/page.tsx`, 302, "← Previous, no prev page"],
    [`${APP}/halls/page.tsx`, 318, "Next →, no next page"],
    [`${APP}/directory/page.tsx`, 252, "aria-hidden ✕ chip"],
    [`${APP}/validators/page.tsx`, 239, "aria-hidden ✕ chip"],
  ];
  for (const [file, line, why] of E2) {
    it(`${file.split("/").pop()}:${line} — ${why}`, () => {
      expect(at(file, line), `${file}:${line} lost its exclusion`).toBe(true);
    });
  }
});

describe("closure — the 19 exclusions from E3, E4 and E5 survive", () => {
  const E3 = ["src/components/profile/AttestationActionCluster.tsx", "src/components/profile/FindingsSection.tsx",
    "src/components/profile/ReportMemberModal.tsx", "src/components/profile/StandingFileBody.tsx"];
  const E4 = ["src/components/composer/Composer.tsx", "src/components/feed/CommentDrawer.tsx",
    "src/components/feed/ReportButton.tsx", "src/components/notifications/NotificationsPanel.tsx",
    "src/components/messages/ConversationsPanel.tsx"];
  const E5 = ["src/components/blog/BlogComposer.tsx", "src/components/creator/CreatorGallery.tsx",
    "src/components/disputes/DisputeDetail.tsx", "src/components/disputes/OpenDisputeModal.tsx"];
  const count = (files: readonly string[]) => HITS.filter((h) => files.includes(h.file)).length;

  it("E3 kept its 5", () => expect(count(E3)).toBe(5));
  it("E4 kept its 10", () => expect(count(E4)).toBe(10));
  it("E5 kept its 4", () => expect(count(E5)).toBe(4));
  it("19 in total, plus E6's 18, is the whole set", () => {
    expect(count([...E3, ...E4, ...E5])).toBe(19);
    expect(HITS.length - count([...E3, ...E4, ...E5])).toBe(18);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. E6's own 17 migrations
// ─────────────────────────────────────────────────────────────────────────

describe("E6 — the 17 migrations", () => {
  const MIGRATED: ReadonlyArray<readonly [string, string, string]> = [
    ["cookies table cell", "src/app/(legal)/cookies/page.tsx", "py-2 pr-4 text-[var(--bcc-text-secondary)]"],
    ["wallet auth status", "src/components/auth/WalletAuthButton.tsx", 'color: "var(--bcc-text-secondary)"'],
    ["AuthorCard empty bio", "src/components/identity/AuthorCard.tsx", "italic leading-snug text-[var(--bcc-text-secondary)]"],
    ["RankInfoModal standing", "src/components/identity/RankInfoModal.tsx", 'tracking-[0.24em] text-[var(--bcc-text-secondary)]'],
    ["RankInfoModal arrow", "src/components/identity/RankInfoModal.tsx", '<span className="text-[var(--bcc-text-secondary)]">→</span>'],
    ["BioBox empty state", "src/components/layout/BioBox.tsx", "font-serif italic mt-3 text-bcc-text-secondary"],
    ["RightSidebar utility", "src/components/layout/RightSidebar.tsx", 'className="bcc-mono bcc-text-secondary"'],
    ["LegalDoc meta a", "src/components/legal/LegalDoc.tsx", 'className="bcc-mono mt-4 text-[var(--bcc-text-secondary)]"'],
    ["LegalDoc meta b", "src/components/legal/LegalDoc.tsx", 'className="bcc-mono text-[var(--bcc-text-secondary)]"'],
    ["DemoAuthorCard empty bio", "src/components/onboarding/reputation-demo/DemoAuthorCard.tsx", "italic leading-snug text-[var(--bcc-text-secondary)]"],
    ["Connections repo counts", "src/components/settings/ConnectionsSection.tsx", '<span className="ml-2 text-bcc-text-secondary">'],
    ["Connections checking", "src/components/settings/ConnectionsSection.tsx", 'text-bcc-text-secondary">Checking…</span>'],
    ["Identity @ prefix", "src/components/settings/IdentitySettingsForm.tsx", 'className="bcc-mono pl-3 text-bcc-text-secondary">@</span>'],
    ["Wallets metadata row", "src/components/settings/WalletsSection.tsx", "gap-3 text-[10px] text-bcc-text-secondary"],
    ["Watching heading", "src/components/watching/WatchingCardsPanel.tsx", 'tracking-[0.24em] text-bcc-text-secondary">'],
    ["Watching kind label", "src/components/watching/WatchingCardsPanel.tsx", 'tracking-[0.18em] text-bcc-text-secondary'],
  ];

  for (const [label, file, anchor] of MIGRATED) {
    it(`${label} reads secondary`, () => {
      expect(read(file)).toContain(anchor);
    });
  }

  it("LeftSidebar's collapse button — the 17th — inherits from the shared class", () => {
    // The inline `color` overrode .bcc-btn-icon and, being inline, also
    // defeated its :hover rule outright. Deleting it restores both.
    const src = read("src/components/layout/LeftSidebar.tsx");
    expect(src).toContain('className="bcc-btn-icon"');
    expect(src).not.toContain('color: "var(--bcc-text-muted)"');
    // Anchored on the collapse button's own aria-label: this file has a
    // second `bcc-btn-icon` (NewPostTrigger) whose inline style sets an
    // unrelated `color`, and a looser regex grabs that one instead.
    const style =
      /aria-label=\{collapsed \? "Expand sidebar" : "Collapse sidebar"\}[\s\S]*?style=\{\{([\s\S]*?)\}\}/.exec(src)?.[1] ??
      "";
    expect(style, "collapse-button style object not found").not.toBe("");
    expect(style).not.toContain("color:");
    // the unrelated inline styles must survive
    for (const kept of ["width:", "justifyContent:", "gap:", "padding:", "borderRadius:", "height:"]) {
      expect(style, `LeftSidebar lost an unrelated inline style: ${kept}`).toContain(kept);
    }
  });

  it(".bcc-btn-icon controls both rest and hover", () => {
    const rest = /\.bcc-btn-icon\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    const hover = /\.bcc-btn-icon:hover\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(rest).toContain("color: var(--bcc-text-secondary)");
    expect(hover).toContain("color: var(--bcc-text)");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The utility swap
// ─────────────────────────────────────────────────────────────────────────

describe("E6 — the .bcc-text-muted utility has no production consumers left", () => {
  it("zero consumers of .bcc-text-muted", () => {
    const consumers = FILES.filter((f) =>
      read(f)
        .split(/\r?\n/)
        .some((l) => /(?<![-\w[])bcc-text-muted(?![-\w)])/.test(l)),
    );
    expect(consumers).toEqual([]);
  });

  it("RightSidebar now uses the secondary utility", () => {
    expect(read("src/components/layout/RightSidebar.tsx")).toContain('className="bcc-mono bcc-text-secondary"');
  });

  it("both utility definitions are unchanged — the swap was at the call site", () => {
    // Column-aligned in the stylesheet, so match tolerantly rather than
    // pinning the exact run of spaces.
    expect(CSS).toMatch(/\.bcc-text-muted\s+\{\s*color:\s*var\(--bcc-text-muted\);\s*\}/);
    expect(CSS).toMatch(/\.bcc-text-secondary\s+\{\s*color:\s*var\(--bcc-text-secondary\);\s*\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Deferred invariants — recorded, NOT counted, NOT resolved
// ─────────────────────────────────────────────────────────────────────────

describe("deferred — the header search placeholder is still broken", () => {
  const values = (n: string) =>
    [...CSS.matchAll(new RegExp(`--${n}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (hex: string) => {
    const h = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  it("is a SEPARATE token and therefore not one of the 37", () => {
    expect(values("bcc-search-placeholder")).toEqual(["#b3b8c3", "#3d444d", "#3d444d"]);
    // it must never appear in the muted census
    expect(HITS.some((h) => /search-placeholder/.test(h.text))).toBe(false);
  });

  it("still fails, and is not to be read as resolved", () => {
    expect(ratio(values("bcc-search-placeholder")[0] ?? "", "#ffffff")).toBeLessThan(4.5);
  });

  it("the general placeholder token stays repaired", () => {
    expect(values("bcc-text-placeholder")).toEqual(["#5f626a", "#82878f", "#82878f"]);
  });
});

describe("deferred — the three theme-blind tokens are untouched by this programme", () => {
  it("phosphor, safety and weld remain unscoped, and are somebody else's slice", () => {
    // Recorded so the finale cannot be mistaken for "all contrast fixed".
    // color-token-guard:allow — asserting that these DEFINITIONS exist and
    // remain unscoped; nothing here styles anything, and the brand spelling
    // is the only spelling globals.css declares them under.
    expect([...CSS.matchAll(/--phosphor:\s*([^;]+);/g)]).toHaveLength(1);
    // color-token-guard:allow — definition assertion, see above
    expect([...CSS.matchAll(/--bcc-safety:\s*([^;]+);/g)]).toHaveLength(1);
    // color-token-guard:allow — definition assertion, see above
    expect([...CSS.matchAll(/--bcc-weld:\s*([^;]+);/g)]).toHaveLength(1);
  });
});
