/**
 * #205 closure guard — small orange text and error text.
 *
 * `--bcc-safety` (#f05a28) is theme-blind. As small text it fails 4.5:1 on
 * the light page (3.39), on paper (2.95) and on cardstock (2.71). PR #208
 * moved 42 page/panel error lines to `--bcc-danger`, but danger fails on
 * the raised, hover, tint and paper grounds, so 15 error lines stayed
 * orange. #205 closes the issue with two theme-aware TEXT tokens:
 *
 *   token               light     dark      used for
 *   --bcc-text-error    #b91c1c   #f87171   every error / validation line
 *   --bcc-text-safety   #b53d14   #f4733f   every other orange word
 *
 * Both clear 4.5:1 on page, panel, raised, hover, active and the safety/5
 * tint in both themes. Paper and cardstock are cream in BOTH themes, so
 * every paper container re-declares both tokens to their light values;
 * solid ink (and the ink bar of a paper sheet) re-declares them to their
 * dark values. Text inherits the nearest declaration.
 *
 * What this file pins:
 *   1. the declared values, and their ratios on every ground;
 *   2. the paper and ink re-declarations, container by container;
 *   3. zero production `text-safety` utilities (any variant prefix or
 *      opacity suffix) and zero inline `color:` uses of the safety colour;
 *   4. every `role="alert"` element painted with a status utility uses the
 *      error-text token — not safety, not danger;
 *   5. the error-line inventory (74 lines), and `text-bcc-danger` confined
 *      to the destructive headings and buttons it still owns.
 * A control proves the scanners find planted offenders.
 *
 * `bg-safety*`, `border-safety*`, fills, strokes and marks keep the bare
 * safety colour on purpose: #205 is about text.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");
const TW = read("tailwind.config.ts");

// ─────────────────────────────────────────────────────────────────────────
// Contrast maths
// ─────────────────────────────────────────────────────────────────────────

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
const lumOf = (c: number[]) => {
  const [r, g, b] = c.map((v) => lin(v / 255));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratioRgb = (a: number[], b: number[]) => {
  const [x, y] = [lumOf(a), lumOf(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const ratio = (a: string, b: string) => ratioRgb(rgb(a), rgb(b));
/** `alpha` of `top` composited over `base`. */
const over = (top: string, alpha: number, base: string) =>
  rgb(top).map((t, i) => alpha * t + (1 - alpha) * (rgb(base)[i] ?? 0));

// ─────────────────────────────────────────────────────────────────────────
// Named values. Positional lookup is unsafe: `--bcc-danger` is declared
// four times (a theme-less base first) and these tokens are re-declared on
// paper and ink, so each value is named and asserted to be declared.
// ─────────────────────────────────────────────────────────────────────────

const TOKENS = {
  light: { error: "#b91c1c", safety: "#b53d14" },
  dark: { error: "#f87171", safety: "#f4733f" },
} as const;
const TOKEN_NAME = { error: "bcc-text-error", safety: "bcc-text-safety" } as const;

const GROUNDS = {
  light: { bg: "#ffffff", surface: "#ffffff", raised: "#f9f9f9", hover: "#f3f4f6", active: "#eef0f3" },
  dark: { bg: "#0d1117", surface: "#161b22", raised: "#1c2128", hover: "#21262d", active: "#282e37" },
} as const;
const GROUND_NAME = {
  bg: "bcc-bg",
  surface: "bcc-surface",
  raised: "bcc-surface-raised",
  hover: "bcc-surface-hover",
  active: "bcc-surface-active",
} as const;
const FIXED = { paper: "#f7efd9", cardstock: "#efe5cf", ink: "#0f0d09", safety: "#f05a28" } as const;
const FIXED_NAME = { paper: "paper", cardstock: "cardstock", ink: "ink", safety: "bcc-safety" } as const;

const declared = (name: string, v: string) => new RegExp(`--${name}:\\s*${v}\\s*;`, "i").test(CSS);

describe("#205 — the named values are the declared values", () => {
  it("both tokens, both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const [k, name] of Object.entries(TOKEN_NAME)) {
        const v = TOKENS[theme][k as keyof typeof TOKEN_NAME];
        expect(declared(name, v), `--${name} ${theme} ${v}`).toBe(true);
      }
    }
  });

  it("every ground, both themes", () => {
    for (const theme of ["light", "dark"] as const) {
      for (const [k, name] of Object.entries(GROUND_NAME)) {
        const v = GROUNDS[theme][k as keyof typeof GROUND_NAME];
        expect(declared(name, v), `--${name} ${theme} ${v}`).toBe(true);
      }
    }
    for (const [k, name] of Object.entries(FIXED_NAME)) {
      const v = FIXED[k as keyof typeof FIXED_NAME];
      expect(declared(name, v), `--${name} ${v}`).toBe(true);
    }
  });

  it("each token is declared in all three theme scopes", () => {
    // light block, the prefers-color-scheme dark block, [data-theme="dark"]
    for (const name of Object.values(TOKEN_NAME)) {
      const blocks = ['[data-theme="light"] {', ':root:not([data-theme="light"]) {', '[data-theme="dark"] {'];
      for (const head of blocks) {
        const start = CSS.indexOf(head);
        expect(start, head).toBeGreaterThan(-1);
        const body = CSS.slice(start, CSS.indexOf("}", start));
        expect(body, `--${name} in ${head}`).toMatch(new RegExp(`--${name}:`));
      }
    }
  });

  it("Tailwind exposes both tokens", () => {
    expect(TW).toMatch(/"bcc-text-error":\s*"var\(--bcc-text-error\)"/);
    expect(TW).toMatch(/"bcc-text-safety":\s*"var\(--bcc-text-safety\)"/);
  });
});

describe("#205 — both tokens clear 4.5:1 on every ground", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const k of ["error", "safety"] as const) {
      it(`${theme} ${TOKEN_NAME[k]} on page, panel, raised, hover, active and the safety/5 tint`, () => {
        const fg = TOKENS[theme][k];
        for (const [g, bg] of Object.entries(GROUNDS[theme])) {
          expect(ratio(fg, bg), `${g} ${bg}`).toBeGreaterThanOrEqual(4.5);
        }
        const tint = over(FIXED.safety, 0.05, GROUNDS[theme].surface);
        expect(ratioRgb(rgb(fg), tint), "safety/5 tint").toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("paper and cardstock, using the LIGHT values (paper is fixed-light)", () => {
    for (const k of ["error", "safety"] as const) {
      expect(ratio(TOKENS.light[k], FIXED.paper)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(TOKENS.light[k], FIXED.cardstock)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("solid ink, using the DARK values (ink is fixed-dark)", () => {
    for (const k of ["error", "safety"] as const) {
      expect(ratio(TOKENS.dark[k], FIXED.ink)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("why: the bare safety colour fails as small text", () => {
    expect(ratio(FIXED.safety, GROUNDS.light.bg)).toBeLessThan(4.5);
    expect(ratio(FIXED.safety, FIXED.paper)).toBeLessThan(4.5);
    expect(ratio(FIXED.safety, FIXED.cardstock)).toBeLessThan(4.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Paper and ink re-declarations
// ─────────────────────────────────────────────────────────────────────────

/** Selectors of every rule whose body pins both tokens to the given values. */
function selectorsPinning(error: string, safety: string): Set<string> {
  const css = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Set<string>();
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2] ?? "";
    if (
      new RegExp(`--bcc-text-error:\\s*${error}\\s*;`, "i").test(body) &&
      new RegExp(`--bcc-text-safety:\\s*${safety}\\s*;`, "i").test(body)
    ) {
      for (const s of (m[1] ?? "").split(",")) out.add(s.trim());
    }
  }
  return out;
}

const PAPER_CONTAINERS = [
  ".bcc-paper",
  ".bg-paper",
  ".bg-paper\\/90",
  ".bg-cardstock",
  ".bg-cardstock\\/95",
  ".bg-cardstock-deep",
  ".bcc-paper-ground", // for elements that paint var(--paper) inline
] as const;
const INK_CONTAINERS = [".bcc-paper-head", ".bg-ink"] as const;

describe("#205 — fixed grounds pin the tokens", () => {
  it("every paper container re-declares both tokens to the LIGHT values", () => {
    const pinned = selectorsPinning(TOKENS.light.error, TOKENS.light.safety);
    for (const c of PAPER_CONTAINERS) expect(pinned.has(c), c).toBe(true);
  });

  it("every ink container re-declares both tokens to the DARK values", () => {
    const pinned = selectorsPinning(TOKENS.dark.error, TOKENS.dark.safety);
    for (const c of INK_CONTAINERS) expect(pinned.has(c), c).toBe(true);
  });

  it("the re-declarations are unlayered, so Tailwind cannot purge them", () => {
    const at = CSS.indexOf(".bcc-paper,\r\n.bg-paper,") >= 0
      ? CSS.indexOf(".bcc-paper,\r\n.bg-paper,")
      : CSS.indexOf(".bcc-paper,\n.bg-paper,");
    expect(at).toBeGreaterThan(-1);
    const before = CSS.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, "");
    const depth = [...before].reduce((d, ch) => d + (ch === "{" ? 1 : ch === "}" ? -1 : 0), 0);
    expect(depth).toBe(0);
  });

  it("every inline var(--paper) background carries bcc-paper-ground", () => {
    let sites = 0;
    for (const f of production()) {
      const lines = read(f).split(/\r?\n/);
      lines.forEach((l, i) => {
        if (!/background:\s*"var\(--paper\)"/.test(l)) return;
        sites++;
        const tag = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
        expect(tag, `${f}:${i + 1}`).toMatch(/\bbcc-paper-ground\b/);
      });
    }
    expect(sites).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Closure scanners
// ─────────────────────────────────────────────────────────────────────────

function production(dir = resolve(process.cwd(), "src"), acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) production(full, acc);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      acc.push(full.slice(resolve(process.cwd()).length + 1).replace(/\\/g, "/"));
    }
  }
  return acc;
}

/** Comments blanked, newlines kept so line numbers stay true. */
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/(?<![:"'`])\/\/.*$/gm, "");

/** `text-safety` with any variant prefix or opacity suffix, or its arbitrary-value twin. */
const SAFETY_UTILITY = /(?<![\w-])text-safety(?![\w-])|text-\[var\(--(?:bcc-)?safety\)\]/g;
/** An inline text colour of the bare safety colour. */
const SAFETY_INLINE = /\bcolor:\s*["'`]var\(--(?:bcc-)?safety\)["'`]/g;

function scan(re: RegExp, sources: ReadonlyArray<readonly [string, string]>): string[] {
  const hits: string[] = [];
  for (const [path, src] of sources) {
    stripComments(src)
      .split(/\r?\n/)
      .forEach((l, i) => {
        for (const m of l.matchAll(re)) hits.push(`${path}:${i + 1} ${m[0]}`);
      });
  }
  return hits;
}

/** Every opening tag that carries role="alert" (static or conditional). */
function alertTags(path: string, src: string): Array<{ at: string; tag: string }> {
  const code = stripComments(src);
  const out: Array<{ at: string; tag: string }> = [];
  for (const m of code.matchAll(/\brole=(?:"alert"|\{[^}]*"alert"[^}]*\})/g)) {
    const idx = m.index ?? 0;
    const start = code.lastIndexOf("<", idx);
    let depth = 0;
    let end = idx;
    for (; end < code.length; end++) {
      const ch = code[end];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === ">" && depth === 0) break;
    }
    const line = code.slice(0, idx).split("\n").length;
    out.push({ at: `${path}:${line}`, tag: code.slice(start, end + 1) });
  }
  return out;
}

const STATUS_TEXT = /(?<![\w-])text-(?:safety|bcc-danger|bcc-text-error)(?![\w-])/;

function alertOffenders(sources: ReadonlyArray<readonly [string, string]>): string[] {
  const bad: string[] = [];
  for (const [path, src] of sources) {
    for (const { at, tag } of alertTags(path, src)) {
      if (!STATUS_TEXT.test(tag)) continue; // CSS-class or neutral alerts
      if (/(?<![\w-])text-(?:safety|bcc-danger)(?![\w-])/.test(tag) || !/\btext-bcc-text-error\b/.test(tag)) {
        bad.push(at);
      }
    }
  }
  return bad;
}

const SOURCES: ReadonlyArray<readonly [string, string]> = production().map((f) => [f, read(f)] as const);

describe("#205 — closure: no orange text survives", () => {
  it("the scan saw a real tree", () => {
    expect(SOURCES.length).toBeGreaterThan(400);
  });

  it("zero production text-safety utilities, any variant", () => {
    expect(scan(SAFETY_UTILITY, SOURCES)).toEqual([]);
  });

  // color-token-guard:allow — the test title names the spelling it forbids
  it("zero inline color: var(--safety) / var(--bcc-safety)", () => {
    expect(scan(SAFETY_INLINE, SOURCES)).toEqual([]);
  });

  it("every status-coloured role=alert element uses text-bcc-text-error", () => {
    expect(alertOffenders(SOURCES)).toEqual([]);
  });

  it("and there are real error-text alerts to check", () => {
    const n = SOURCES.flatMap(([p, s]) => alertTags(p, s)).filter(({ tag }) =>
      /\btext-bcc-text-error\b/.test(tag),
    ).length;
    expect(n).toBeGreaterThanOrEqual(50);
  });
});

describe("#205 — control: the scanners find planted offenders", () => {
  const PLANTED: ReadonlyArray<readonly [string, string]> = [
    ["planted/a.tsx", '<p className="bcc-mono text-safety">X</p>'],
    ["planted/b.tsx", '<a className="hover:text-safety">X</a>'],
    ["planted/c.tsx", '<p className="group-hover:text-safety/80">X</p>'],
    ["planted/d.tsx", 'const s = { color: "var(--safety)" };'],
    ["planted/e.tsx", '<p\n  role="alert"\n  className="bcc-mono text-bcc-danger"\n>\n  {error}\n</p>'],
    ["planted/f.tsx", '<span role={bad ? "alert" : undefined} className={`x ${bad ? "text-safety" : ""}`}>'],
  ];

  it("finds every planted text-safety utility", () => {
    expect(scan(SAFETY_UTILITY, PLANTED)).toHaveLength(4); // a, b, c, f
  });

  it("finds the planted inline colour", () => {
    expect(scan(SAFETY_INLINE, PLANTED)).toEqual(['planted/d.tsx:1 color: "var(--safety)"']);
  });

  it("flags multi-line and conditional alerts on the wrong token", () => {
    expect(alertOffenders(PLANTED)).toEqual(["planted/e.tsx:2", "planted/f.tsx:1"]);
  });

  it("ignores the same text inside a comment", () => {
    const commented: ReadonlyArray<readonly [string, string]> = [
      ["planted/g.tsx", "// was text-safety\n/* text-safety */"],
    ];
    expect(scan(SAFETY_UTILITY, commented)).toEqual([]);
  });

  it("does not flag the new tokens", () => {
    const ok: ReadonlyArray<readonly [string, string]> = [
      ["planted/h.tsx", '<p role="alert" className="text-bcc-text-error hover:text-bcc-text-safety">X</p>'],
    ];
    expect(scan(SAFETY_UTILITY, ok)).toEqual([]);
    expect(alertOffenders(ok)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Error-line inventory
// ─────────────────────────────────────────────────────────────────────────

/**
 * Files whose error / validation lines read `text-bcc-text-error` → count.
 * 74 lines: the 42 PR #208 moved to danger, 5 older role=alert lines that
 * were already on danger, the 15 error lines #208 deferred on orange,
 * 9 over-limit / invalid-input states (the counter-tone top rung, the
 * mention cap and seven inline over-cap counters), the email-change
 * code step's alert in AccountSection (verify-before-apply), and the
 * per-row unblock failure in BlocksList, and the delegator-group join
 * failure in DelegatorGroupPanel (#198).
 */
const ERROR_LINES: Readonly<Record<string, number>> = {
  "src/app/(main)/(app)/communities/new/page.tsx": 1,
  "src/app/(main)/(app)/communities/page.tsx": 1,
  "src/app/(main)/(app)/halls/page.tsx": 1,
  "src/app/(main)/(app)/messages/[id]/page.tsx": 1,
  "src/app/(main)/(app)/messages/new/page.tsx": 3,
  "src/components/admin/ModerationQueue.tsx": 2,
  "src/components/admin/UndoToast.tsx": 1,
  "src/components/announcements/AnnouncementComments.tsx": 1,
  "src/components/announcements/AnnouncementComposer.tsx": 1,
  "src/components/auth/EligibleCommunitiesModal.tsx": 1,
  "src/components/auth/WalletSignupPrompt.tsx": 1,
  "src/components/blog/BlogComposer.tsx": 2,
  "src/components/blog/CoverImageUpload.tsx": 1,
  "src/components/claim/ClaimFlow.tsx": 1,
  "src/components/communities/CommunityJoinCard.tsx": 1,
  "src/components/composer/Composer.tsx": 4,
  "src/components/composer/GifPicker.tsx": 1,
  "src/components/composer/MentionPopover.tsx": 1,
  "src/components/composer/PhotoPicker.tsx": 1,
  "src/components/disputes/DisputeDetail.tsx": 1,
  "src/components/entity/panels/DelegatorGroupPanel.tsx": 1,
  "src/components/disputes/OpenDisputeModal.tsx": 2,
  "src/components/endorse/EndorseButton.tsx": 2,
  "src/components/feed/ReportButton.tsx": 2,
  "src/components/groups/GroupActionButton.tsx": 1,
  "src/components/groups/GroupPostPolicyToggle.tsx": 1,
  "src/components/groups/GroupTransferOwnership.tsx": 3,
  "src/components/halls/HallMembershipControls.tsx": 1,
  "src/components/messages/MessageComposer.tsx": 1,
  "src/components/onchain/CollectionStancePanel.tsx": 2,
  "src/components/onchain/NftPickerModal.tsx": 2,
  "src/components/onchain/NftShowcaseSettings.tsx": 2,
  "src/components/profile/AttestationActionCluster.tsx": 1,
  "src/components/profile/BlockToggle.tsx": 1,
  "src/components/profile/FindingsSection.tsx": 1,
  "src/components/profile/ReportMemberModal.tsx": 2,
  "src/components/profile/SlotHoldersPicker.tsx": 1,
  "src/components/review/ReviewCallout.tsx": 1,
  "src/components/settings/BlocksList.tsx": 1,
  "src/components/settings/CommunitiesList.tsx": 1,
  "src/components/settings/ConnectionsSection.tsx": 1,
  "src/components/settings/NotificationPrefsForm.tsx": 1,
  "src/components/settings/PrivacySettingsForm.tsx": 1,
  "src/components/settings/SettingsSaveStatus.tsx": 1,
  // F-332 moved the recovery-email form (2 lines) to RecoveryEmail.tsx.
  "src/components/settings/RecoveryEmail.tsx": 2,
  "src/components/settings/WalletsSection.tsx": 2,
  "src/components/settings/profile/AccountSection.tsx": 3,
  "src/components/settings/profile/BioEditor.tsx": 1,
  "src/components/settings/profile/DeleteAccountCard.tsx": 1,
  "src/components/settings/profile/MentorSettingsSection.tsx": 1,
  "src/components/settings/profile/ProfileFieldsList.tsx": 1,
  "src/components/settings/profile/ProfileHero.tsx": 1,
  "src/components/ui/ConfirmDialog.tsx": 1,
  "src/lib/counter-tone.ts": 1,
};

/** The only `text-bcc-danger` left: destructive headings and buttons, not error text. */
const DANGER_KEPT: Readonly<Record<string, number>> = {
  "src/components/settings/profile/DeleteAccountCard.tsx": 3, // two headings + the trigger
  "src/components/ui/ConfirmDialog.tsx": 1, // the destructive confirm button
};

const countIn = (re: RegExp, src: string) =>
  stripComments(src).split(/\r?\n/).filter((l) => re.test(l)).length;

describe("#205 — error-line inventory", () => {
  it("74 error lines in total", () => {
    expect(Object.values(ERROR_LINES).reduce((a, b) => a + b, 0)).toBe(74);
  });

  for (const [file, n] of Object.entries(ERROR_LINES)) {
    it(`${file.split("/").pop()} has ${n} error-text line(s)`, () => {
      expect(countIn(/\btext-bcc-text-error\b/, read(file))).toBe(n);
    });
  }

  it("text-bcc-danger survives only on destructive headings and buttons", () => {
    const counts: Record<string, number> = {};
    for (const [f, src] of SOURCES) {
      const n = countIn(/(?<![\w-])text-bcc-danger(?![\w-])/, src);
      if (n > 0) counts[f] = n;
    }
    expect(counts).toEqual(DANGER_KEPT);
  });
});
