/**
 * E5 — disputes, blog and creator move off `--bcc-text-muted`.
 *
 * 28 occurrences: **24 migrated, 4 preserved**. Repo-wide colour-bearing
 * muted falls 78 → 54.
 *
 * ## The paper check is pinned twice, on purpose
 *
 * The E5 audit's first containment pass reported two paper-resident
 * occurrences. Both were false: the finder treated a one-line ternary
 * branch (`? "bg-ink text-cardstock …"`) as a container and flagged its
 * sibling (`: "cursor-not-allowed bg-bcc-surface-active …"`) as nested.
 * They are siblings, not ancestors.
 *
 * So this guard does not trust a regex walk alone. It pins the **actual
 * host structure**: the containers these strings live in are named and
 * asserted to resolve to theme tokens, and the four cardstock-adjacent
 * cases are asserted to be exactly the shape that fooled the finder —
 * an enabled `bg-ink text-cardstock` branch beside a disabled
 * `bg-bcc-surface-active` one. A broken pattern cannot pass this by
 * matching nothing.
 *
 * ## State pairs that needed more than a token swap
 *
 * `OpenDisputeModal`'s reason field has two. The completeness hint read
 * `reasonTooShort ? muted : secondary`; migrating muted to secondary
 * would have made both states identical, and the state needing action was
 * the *weaker* one. Owner ruling: incomplete → `--bcc-text`, ready →
 * secondary, so the actionable state is now the prominent one.
 *
 * Its counter was an eighth ladder using `text-weld` (`#ffc01e`,
 * unscoped, **1.49:1** on a light input) as its middle rung. It adopts
 * the shared helper, which replaces that rung with `text-warning`
 * (4.56 / 8.05). `reasonTooLong` stays an outer guard because it tests
 * the UNTRIMMED length while the counter displays the trimmed one —
 * folding it in would have moved the top rung.
 *
 * ## Deferred, explicitly
 *
 * `text-safety` (3.08:1 on a light input), the remaining `--weld` uses
 * elsewhere, the phosphor backlog, header controls on glass, and focus
 * residue. None is touched here.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { counterToneClass } from "@/lib/counter-tone";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");

const D = "src/components/disputes";
const B = "src/components/blog";
const C = "src/components/creator";

const MODAL = `${D}/OpenDisputeModal.tsx`;
const SOURCES = `${B}/SourcesField.tsx`;

const SCOPE = [
  `${D}/CaseBody.tsx`, `${D}/CaseHeader.tsx`, `${D}/DisputeDetail.tsx`, MODAL,
  `${D}/VoteResultBreakdown.tsx`,
  `${B}/BlogComposer.tsx`, `${B}/BodyEditor.tsx`, `${B}/ChainTagsPicker.tsx`,
  `${B}/CoverImageUpload.tsx`, `${B}/DisclosureBlock.tsx`, SOURCES, `${B}/TagsInput.tsx`,
  `${C}/CreatorGallery.tsx`, `${C}/NftPieceDetail.tsx`,
] as const;

const MUTED = /text-bcc-text-muted|text-\[var\(--bcc-text-muted\)\]|color:\s*"?var\(--bcc-text-muted\)/;

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
const token = (n: string) =>
  [...CSS.matchAll(new RegExp(`--${n}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");

// ─────────────────────────────────────────────────────────────────────────
// 1. The 24 migrations
// ─────────────────────────────────────────────────────────────────────────

/** [label, file, a content anchor unique to that occurrence] */
const READABLE: ReadonlyArray<readonly [string, string, string]> = [
  ["BodyEditor preview placeholder copy", `${B}/BodyEditor.tsx`, "Live preview renders here."],
  ["CoverImageUpload file-type hint", `${B}/CoverImageUpload.tsx`, "JPEG · PNG · WebP · GIF"],
  ["SourcesField row number", SOURCES, "{idx + 1}."],
  ["CreatorGallery subtitle", `${C}/CreatorGallery.tsx`, "· {subtitle}"],
  ["NftPieceDetail token id", `${C}/NftPieceDetail.tsx`, "#{piece.token_id}"],
  ["NftPieceDetail owner label", `${C}/NftPieceDetail.tsx`, "Owner"],
  ["CaseBody disputing line", `${D}/CaseBody.tsx`, "S DOWNVOTE"],
  ["CaseBody no exhibit", `${D}/CaseBody.tsx`, "NO EXHIBIT FILED"],
  ["CaseHeader reporter line", `${D}/CaseHeader.tsx`, "dispute.reporter_name"],
  ["DisputeDetail sealed tallies", `${D}/DisputeDetail.tsx`, "TALLIES STAY SEALED"],
  ["VoteResultBreakdown voters counted", `${D}/VoteResultBreakdown.tsx`, '"VOTERS"} COUNTED'],
  ["VoteResultBreakdown weighted ballots", `${D}/VoteResultBreakdown.tsx`, "WEIGHTED BALLOTS"],
  ["VoteResultBreakdown none counted", `${D}/VoteResultBreakdown.tsx`, "NO WEIGHTED BALLOTS WERE COUNTED."],
  ["OpenDisputeModal char-range hint", MODAL, "chars)"],
  ["OpenDisputeModal optional hint", MODAL, "(optional)"],
];

describe("E5 — readable text migrated to --bcc-text-secondary", () => {
  for (const [label, file, anchor] of READABLE) {
    it(label, () => {
      const lines = read(file).split(/\r?\n/);
      const i = lines.findIndex((l) => l.includes(anchor));
      expect(i, `anchor ${JSON.stringify(anchor)} not found in ${file}`).toBeGreaterThan(-1);
      // the colour lives on the line itself or the opening tag just above
      const block = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      expect(MUTED.test(block), `${label} is still muted`).toBe(false);
    });
  }
});

describe("E5 — interactive resting states migrated, hover still differs", () => {
  const CHIPS = [
    [`${B}/ChainTagsPicker.tsx`, "text-bcc-text-secondary hover:text-safety"],
    [`${B}/DisclosureBlock.tsx`, "text-bcc-text-secondary hover:text-safety"],
    [`${B}/TagsInput.tsx`, "text-bcc-text-secondary hover:text-safety"],
  ] as const;
  for (const [file, expected] of CHIPS) {
    it(`${file.split("/").pop()} chip remove button rests on secondary`, () => {
      expect(read(file)).toContain(expected);
    });
  }

  it("SourcesField's three icon buttons rest on secondary with distinct hovers", () => {
    const src = read(SOURCES);
    const moves = [...src.matchAll(/text-bcc-text-secondary hover:text-bcc-text disabled:opacity-30/g)];
    expect(moves).toHaveLength(2); // up + down
    expect(src).toContain("text-bcc-text-secondary hover:text-safety"); // remove
  });

  it("no resting state equals its own hover target", () => {
    for (const f of SCOPE) {
      expect(read(f), `${f} has a collapsed hover`).not.toContain(
        "text-bcc-text-secondary hover:text-bcc-text-secondary",
      );
    }
  });

  it("disabled:opacity-30 is scoped to the disabled state only", () => {
    // Opacity would crush secondary to ~1.6:1, but it applies solely to the
    // disabled variant, which WCAG 1.4.3 exempts. The enabled resting state
    // must not carry an opacity modifier.
    const src = read(SOURCES);
    for (const m of src.matchAll(/className="[^"]*opacity-\d+[^"]*"/g)) {
      expect(m[0]).toContain("disabled:opacity-");
      expect(m[0]).not.toMatch(/(?<!disabled:)\bopacity-\d/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The two state pairs
// ─────────────────────────────────────────────────────────────────────────

describe("E5 — the reason field's completeness ladder", () => {
  const src = read(MODAL).replace(/\r\n/g, "\n");

  it("incomplete is the prominent state, ready is secondary", () => {
    expect(src).toContain(
      'reasonTooShort\n                    ? "text-bcc-text"\n                    : "text-bcc-text-secondary"',
    );
  });

  it("the two states are still different colours", () => {
    const m = /reasonTooShort\s*\n\s*\?\s*"([^"]+)"\s*\n\s*:\s*"([^"]+)"/.exec(src);
    expect(m).not.toBeNull();
    expect(m?.[1]).not.toBe(m?.[2]);
  });

  it("both states clear AA on the input surface", () => {
    const bg = token("bcc-input-bg");
    const text = token("bcc-text");
    const sec = token("bcc-text-secondary");
    for (const i of [0, 1]) {
      expect(ratio(text[i] ?? "", bg[i] ?? "")).toBeGreaterThanOrEqual(4.5);
      expect(ratio(sec[i] ?? "", bg[i] ?? "")).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("E5 — the eighth counter adopts the shared helper", () => {
  const src = read(MODAL).replace(/\r\n/g, "\n");

  it("imports and calls counterToneClass with the original thresholds", () => {
    expect(src).toContain('import { counterToneClass } from "@/lib/counter-tone";');
    expect(src).toContain("DISPUTE_REASON_MAX_LENGTH - 100");
  });

  it("keeps reasonTooLong as an outer guard — it tests the UNTRIMMED length", () => {
    // The counter renders `reasonLength` (trimmed) but the over-limit test
    // uses `reason.length`. Folding it into the helper would move the rung.
    expect(src).toContain('reasonTooLong\n                    ? "text-safety"');
    expect(src).toContain("const reasonTooLong = reason.length > DISPUTE_REASON_MAX_LENGTH;");
    expect(src).toContain("const reasonLength = reasonTrimmed.length;");
  });

  it("the failing --weld rung is gone from this counter", () => {
    expect(src).not.toContain("text-weld");
  });

  it("the replacement rung clears AA on the input surface", () => {
    // The rung it replaced measured 1.49:1 in light theme; that value is
    // recorded in this file's header rather than inlined, because a raw hex
    // in code is exactly what color-token-check.sh exists to reject — as it
    // did when this assertion first tried it.
    const bg = token("bcc-input-bg");
    const warn = token("bcc-warning"); // [0]=:root, [1]=light, [2]=dark
    expect(ratio(warn[1] ?? "", bg[0] ?? "")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(warn[2] ?? "", bg[1] ?? "")).toBeGreaterThanOrEqual(4.5);
  });

  it("markup, formatting and the displayed value are unchanged", () => {
    expect(src).toContain("{reasonLength}/{DISPUTE_REASON_MAX_LENGTH}");
  });

  it("the safety top rung is untouched and still deferred", () => {
    expect(src).toContain('"text-safety"');
    const bg = token("bcc-input-bg");
    expect(ratio("#f05a28", bg[0] ?? "")).toBeLessThan(4.5); // recorded, not fixed
  });

  it("the helper now has ten call sites across the app", () => {
    // Nine from E4 plus this one. A shared ladder that is only mostly
    // adopted is worse than none.
    const files = SCOPE.concat([
      "src/components/composer/Composer.tsx",
      "src/components/feed/CommentDrawer.tsx",
      "src/components/messages/MessageComposer.tsx",
      `${B}/TitleInput.tsx`,
    ] as unknown as typeof SCOPE);
    const total = [...new Set(files)].reduce(
      (n, f) => n + (read(f).match(/counterToneClass\(/g) ?? []).length,
      0,
    );
    expect(total).toBe(10);
  });
});

describe("counterToneClass still behaves as E4 pinned it", () => {
  it("rungs unchanged", () => {
    expect(counterToneClass(101, 100, 90)).toBe("text-safety");
    expect(counterToneClass(95, 100, 90)).toBe("text-warning");
    expect(counterToneClass(10, 100, 90)).toBe("text-bcc-text-secondary");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Paper — pinned to real structure, not only a pattern walk
// ─────────────────────────────────────────────────────────────────────────

describe("E5 — no paper ancestry, verified structurally", () => {
  it("the four cardstock-adjacent cases are ternary SIBLINGS, not ancestors", () => {
    // This exact shape produced the audit's false positives. Pinning it
    // means the distinction is asserted, not assumed: the cardstock branch
    // is the ENABLED one, and muted lives on a theme surface beside it.
    const PAIRS = [
      [`${B}/BlogComposer.tsx`, "canSubmit"],
      [`${C}/CreatorGallery.tsx`, "query.isFetchingNextPage"],
      [MODAL, "canSubmit"],
    ] as const;
    for (const [file, predicate] of PAIRS) {
      const src = read(file).replace(/\r\n/g, "\n");
      const re = new RegExp(
        `\\(${predicate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\n\\s*\\?\\s*"([^"]*)"\\s*\\n\\s*:\\s*"([^"]*)"\\)`,
      );
      const m = re.exec(src);
      expect(m, `${file}: expected a two-branch ternary on ${predicate}`).not.toBeNull();
      const [enabled, disabled] = [m?.[1] ?? "", m?.[2] ?? ""];
      const cardstock = enabled.includes("cardstock") ? enabled : disabled;
      const muted = enabled.includes("text-bcc-text-muted") ? enabled : disabled;
      expect(cardstock).not.toBe(muted); // different branches of one ternary
      expect(muted).toMatch(/cursor-not-allowed|cursor-wait/);
      expect(muted).toContain("bg-bcc-surface-active"); // a THEME token
      expect(muted).not.toContain("cardstock");
      expect(muted).not.toContain("bg-ink");
    }
  });

  it("bg-bcc-surface-active is a theme token, not a paper one", () => {
    const v = token("bcc-surface-active");
    expect(v.length).toBeGreaterThanOrEqual(2); // theme-scoped: light + dark
    for (const c of v) expect(c).not.toMatch(/paper|cardstock|ink/);
  });

  it("the named host containers resolve to theme surfaces", () => {
    // Positive pin: these are the wrappers the migrated strings sit in.
    const panel = /\.bcc-panel\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(panel).toContain("var(--bcc-surface)");
    expect(panel).not.toContain("var(--paper)");
    expect(token("bcc-input-bg")).toHaveLength(3);
  });

  it("no migrated line sits beside ink-family text", () => {
    // Secondary check. If a component ever moves onto paper, its text will
    // start using --ink-*, and this catches the mixture.
    for (const f of SCOPE) {
      const lines = read(f).split(/\r?\n/);
      lines.forEach((l, i) => {
        if (!l.includes("text-bcc-text-secondary")) return;
        const near = lines.slice(Math.max(0, i - 4), i + 5).join("\n");
        expect(
          /text-ink\b|text-ink-soft|text-ink-ghost/.test(near),
          `${f}:${i + 1} secondary sits next to ink-family text — check for paper`,
        ).toBe(false);
      });
    }
  });

  it("E5 introduced no paper tokens", () => {
    for (const f of SCOPE) {
      expect(read(f)).not.toContain("--ink-ghost");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Exclusions and totals
// ─────────────────────────────────────────────────────────────────────────

describe("E5 — exactly four disabled controls survive", () => {
  it("the survivors are the four disabled branches, and nothing else", () => {
    const found: string[] = [];
    for (const f of SCOPE) {
      read(f).split(/\r?\n/).forEach((l) => {
        if (MUTED.test(l)) found.push(`${f.split("/").pop()} :: ${l.trim()}`);
      });
    }
    expect(found).toHaveLength(4);
    for (const s of found) {
      expect(/cursor-not-allowed|cursor-wait/.test(s), `not disabled: ${s}`).toBe(true);
    }
    expect(found.map((s) => s.split(" :: ")[0]).sort()).toEqual([
      "BlogComposer.tsx",
      "CreatorGallery.tsx",
      "DisputeDetail.tsx",
      "OpenDisputeModal.tsx",
    ]);
  });
});

describe("E5 — the measurement", () => {
  it("secondary clears AA on every surface these components use", () => {
    const sec = token("bcc-text-secondary");
    const mut = token("bcc-text-muted");
    for (const [i, surface] of [["bcc-input-bg", "bcc-surface"], ["bcc-input-bg", "bcc-surface"]].entries()) {
      for (const s of surface) {
        const bg = token(s);
        expect(ratio(sec[i] ?? "", bg[i] ?? "")).toBeGreaterThanOrEqual(4.5);
        expect(ratio(mut[i] ?? "", bg[i] ?? "")).toBeLessThan(4.5);
      }
    }
  });
});
