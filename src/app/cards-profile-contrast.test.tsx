/**
 * E3 — shared card components, profile/dossier surfaces, and the deferred
 * `/u/[handle]` rail move off `--bcc-text-muted`.
 *
 * 30 occurrences were in scope. 25 migrated, 5 preserved.
 *
 * ## The surface check that shaped this slice
 *
 * Cards were de-cardstocked: `--card-surface` is theme-aware
 * (`#ffffff` / `#1c2128`), so `--bcc-text-secondary` is correct there
 * (7.56 / 5.26). That is NOT true of the fixed cream paper family, where
 * the background does not flip but the tokens do — secondary measures
 * 6.59 on `--paper` in light and only **2.68 in dark**. Any future slice
 * touching paper-resident text wants `--ink-ghost` (5.17, theme-
 * invariant), not secondary. Asserted below so the distinction survives.
 *
 * ## Status ticks
 *
 * Four ✓/○ checklist marks carried two different "done" colours:
 * `--bcc-success` (theme-scoped, 5.02 light / 7.10 dark) and
 * `--phosphor`, a single unscoped `#7dff9a` that measures **1.26:1 in
 * light theme** — the done mark was effectively invisible. Owner ruled
 * one pattern: `--bcc-success` for done, `--bcc-text-secondary` for
 * not-done. All four were converted to that meaning *before* being
 * extracted into `StatusTick`, so the shared component could not bake in
 * the inconsistency.
 *
 * ## MemberDossier.Row
 *
 * Migrating the dim state to secondary alone would have collapsed `dim`
 * and non-dim to the same colour — the E1b hover-collision shape one rung
 * up. Owner ruled a two-step ladder: normal `--bcc-text`, dim
 * `--bcc-text-secondary`, both accessible. Label/value hierarchy is
 * carried by existing typography (10px/0.16em vs 11px), **not** opacity —
 * opacity over secondary would drag it back below 4.5:1.
 *
 * ## Separators, classified individually
 *
 * Not treated alike merely because they are punctuation. Six encode a
 * relationship (rank progression `→`, score ratios `/`) and migrated;
 * two are pure dividers whose removal changes nothing, and stay muted
 * behind `aria-hidden`.
 */

import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { StatusTick } from "@/components/profile/StatusTick";

const C = "src/components/cards";
const P = "src/components/profile";

const TICK = `${P}/StatusTick.tsx`;
const STANDING = `${P}/StandingFileBody.tsx`;
const QUESTS = `${P}/TrustQuestsBlock.tsx`;
const LIVING = `${P}/LivingHeader.tsx`;
const FINDINGS = `${P}/FindingsSection.tsx`;
const ACTIVITY = `${P}/panels/ActivityPanel.tsx`;
const CLUSTER = `${P}/AttestationActionCluster.tsx`;
const REPORT = `${P}/ReportMemberModal.tsx`;
const DOSSIER = `${C}/MemberDossier.tsx`;
const FRONT = `${C}/CardFrontFace.tsx`;
const BACK = `${C}/CardBackFace.tsx`;
const SIGNALS = `${C}/CardOnchainSignals.tsx`;
const HANDLE = "src/app/(main)/(app)/u/[handle]/page.tsx";

const SCOPE = [
  FRONT, BACK, SIGNALS, DOSSIER,
  STANDING, QUESTS, LIVING, FINDINGS, ACTIVITY, CLUSTER, REPORT, TICK,
  HANDLE,
] as const;

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf-8");
}
/** Strip comments so "must not contain" assertions test code, not prose. */
function code(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const MUTED = /text-bcc-text-muted|text-\[var\(--bcc-text-muted\)\]|color:\s*"?var\(--bcc-text-muted\)/;

// ─────────────────────────────────────────────────────────────────────────
// 1. StatusTick — the extracted mark
// ─────────────────────────────────────────────────────────────────────────

describe("StatusTick — one meaning for every checklist mark", () => {
  afterEach(cleanup);
  const SRC = read(TICK);

  it("renders ✓ when done and ○ when not", () => {
    const { container: a } = render(<StatusTick done />);
    expect(a.textContent).toBe("✓");
    cleanup();
    const { container: b } = render(<StatusTick done={false} />);
    expect(b.textContent).toBe("○");
  });

  it("is aria-hidden — the row's text label already carries the state", () => {
    const { container } = render(<StatusTick done />);
    const span = container.querySelector("span");
    expect(span?.getAttribute("aria-hidden")).toBe("true");
  });

  it("done uses --bcc-success, not-done uses --bcc-text-secondary", () => {
    const { container: a } = render(<StatusTick done />);
    expect(a.querySelector("span")?.className).toContain("text-[var(--bcc-success)]");
    cleanup();
    const { container: b } = render(<StatusTick done={false} />);
    expect(b.querySelector("span")?.className).toContain("text-bcc-text-secondary");
  });

  it("never uses --phosphor — it is 1.26:1 in light theme", () => {
    expect(code(SRC)).not.toContain("phosphor");
    const { container } = render(<StatusTick done />);
    expect(container.innerHTML).not.toContain("phosphor");
  });

  it("carries the checklist size by default and inherits when sizeClass is empty", () => {
    const { container: a } = render(<StatusTick done />);
    expect(a.querySelector("span")?.className).toContain("bcc-mono text-lg leading-none");
    cleanup();
    const { container: b } = render(<StatusTick done sizeClass="" />);
    const cls = b.querySelector("span")?.className ?? "";
    expect(cls).not.toContain("text-lg");
    expect(cls.startsWith(" ")).toBe(false); // no stray leading space
  });

  it("takes exactly two props — four symbols do not need a design system", () => {
    const props = [...code(SRC).matchAll(/^ {2}(\w+)\??: /gm)].map((m) => m[1]);
    expect(props).toEqual(["done", "sizeClass"]);
  });

  it("emits no muted token", () => {
    expect(MUTED.test(code(SRC))).toBe(false);
  });
});

describe("StatusTick — all four copies collapsed into it", () => {
  const SITES = [
    ["StandingFileBody connected row", STANDING, "<StatusTick done={row.connected} />"],
    ["StandingFileBody done row", STANDING, "<StatusTick done={row.done} />"],
    ["TrustQuestsBlock", QUESTS, "<StatusTick done={quest.done} />"],
    ["LivingHeader (compact, inherits size)", LIVING, '<StatusTick done={row.done} sizeClass="" />'],
  ] as const;

  for (const [label, file, usage] of SITES) {
    it(`${label} renders through the shared mark`, () => {
      const src = read(file);
      expect(src).toContain('import { StatusTick } from "@/components/profile/StatusTick";');
      expect(src).toContain(usage);
    });
  }

  it("no local ✓/○ span survives anywhere outside StatusTick", () => {
    for (const f of SCOPE) {
      if (f === TICK) continue;
      expect(read(f), `${f} still hand-rolls a tick`).not.toContain('"✓" : "○"');
    }
  });

  it("no consumer still uses --phosphor for a status mark", () => {
    for (const f of [STANDING, QUESTS, LIVING]) {
      expect(read(f)).not.toMatch(/\?\s*"text-phosphor"\s*:/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Cards
// ─────────────────────────────────────────────────────────────────────────

describe("E3 — shared card components carry no muted text", () => {
  const CARD_SITES = [
    ["CardFrontFace @handle", FRONT, "@{card.handle}"],
    ["CardBackFace @handle", BACK, "@{card.handle}"],
    ["CardBackFace social proof", BACK, "{card.social_proof.headline}"],
    ["CardOnchainSignals dt label", SIGNALS, "{row.label}"],
  ] as const;

  for (const [label, file, anchor] of CARD_SITES) {
    it(`${label} is present and its file is muted-free`, () => {
      expect(read(file)).toContain(anchor);
      expect(MUTED.test(read(file)), `${file} still has muted`).toBe(false);
    });
  }

  it("all three card faces are muted-free — one fix, every card-bearing route", () => {
    for (const f of [FRONT, BACK, SIGNALS]) expect(MUTED.test(read(f))).toBe(false);
  });

  it("the card surface is theme-aware, which is why secondary is correct here", () => {
    // If cards ever move back onto fixed cream paper this assertion fails,
    // and secondary would be the wrong token (2.68:1 in dark on paper).
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");
    const vals = [...css.matchAll(/--card-surface:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(vals).toEqual(["#ffffff", "#1c2128", "#1c2128"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. MemberDossier.Row ladder
// ─────────────────────────────────────────────────────────────────────────

describe("MemberDossier.Row — a two-step ladder where both steps are readable", () => {
  const SRC = read(DOSSIER);

  it("dim is secondary and normal is --bcc-text, for both label and value", () => {
    const ternaries = [...SRC.matchAll(/\(dim \? "([^"]+)" : "([^"]+)"\)/g)].map((m) => [m[1], m[2]]);
    expect(ternaries).toHaveLength(2);
    for (const [dim, normal] of ternaries) {
      expect(dim).toBe("text-[var(--bcc-text-secondary)]");
      expect(normal).toBe("text-[var(--bcc-text)]");
      expect(dim).not.toBe(normal); // the state must stay visible
    }
  });

  it("hierarchy is typography, not opacity", () => {
    // Opacity over secondary would drag it back under 4.5:1 — the exact
    // hole this programme is climbing out of.
    expect(SRC).toContain('"bcc-mono text-[10px] tracking-[0.16em] "');
    expect(SRC).toContain('"bcc-mono text-[11px] "');
    expect(code(SRC)).not.toMatch(/\bopacity-\d/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Readable prose + the deferred rail
// ─────────────────────────────────────────────────────────────────────────

describe("E3 — readable profile prose", () => {
  const PROSE = [
    ["StandingFileBody requirement", STANDING, "{row.requirement}"],
    ["StandingFileBody window explainer", STANDING, "Days at {w.min_tier.toUpperCase()}+"],
    ["StandingFileBody vesting explainer", STANDING, "Vesting runs on its own clock"],
    ["FindingsSection on-file date", FINDINGS, "On file {finding.created_at} (UTC)"],
    ["ActivityPanel end of wall", ACTIVITY, "End of the wall."],
  ] as const;

  for (const [label, file, anchor] of PROSE) {
    it(`${label} is not muted`, () => {
      const lines = read(file).split(/\r?\n/);
      const i = lines.findIndex((l) => l.includes(anchor));
      expect(i, `anchor ${anchor} not found in ${file}`).toBeGreaterThan(-1);
      const block = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      expect(MUTED.test(block), `${label} still muted`).toBe(false);
      expect(block).toContain("text-bcc-text-secondary");
    });
  }

  it("the deferred /u/[handle] rail is closed", () => {
    const src = read(HANDLE);
    expect(src).toContain(
      '<span className="bcc-mono inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-bcc-text-secondary">',
    );
    expect(MUTED.test(src)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Separators, one classification each
// ─────────────────────────────────────────────────────────────────────────

describe("E3 — separators classified by meaning, not by being punctuation", () => {
  const MEANINGFUL = [
    ["→ current→next rank (StandingFileBody)", STANDING, '<span className="text-bcc-text-secondary">→</span>'],
    ["/ rank score ÷ threshold", STANDING, '<span className="mx-1 text-bcc-text-secondary">/</span>'],
    ["→ current→next rank (LivingHeader)", LIVING, '<span className="mx-2 text-bcc-text-secondary">→</span>'],
    ["/ quests complete ÷ total", QUESTS, '<span className="text-bcc-text-secondary">/</span>'],
  ] as const;

  for (const [label, file, frag] of MEANINGFUL) {
    it(`${label} — carries a relationship, migrated`, () => {
      expect(read(file)).toContain(frag);
    });
  }

  it("all three ratio slashes in StandingFileBody migrated", () => {
    const n = [...read(STANDING).matchAll(/<span className="mx-1 text-bcc-text-secondary">\/<\/span>/g)];
    expect(n).toHaveLength(3); // rank score, category, window
  });

  const DECORATIVE = [
    ["· divider between two self-labelled facts", STANDING, '<span aria-hidden className="mx-2 text-bcc-text-muted">·</span>'],
    ["○ list bullet before a labelled privilege", STANDING, '<span aria-hidden className="text-bcc-text-muted">'],
  ] as const;

  for (const [label, file, frag] of DECORATIVE) {
    it(`${label} — removable without information loss, aria-hidden and left muted`, () => {
      expect(read(file)).toContain(frag);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 6. The three genuinely disabled controls
// ─────────────────────────────────────────────────────────────────────────

describe("E3 — disabled controls stay muted (WCAG 1.4.3 exempt)", () => {
  it("AttestationActionCluster's disabled button", () => {
    const src = read(CLUSTER);
    const i = src.indexOf("if (isDisabled)");
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(i, i + 400)).toContain("text-bcc-text-muted");
  });

  it("ReportMemberModal's submit while incomplete", () => {
    expect(read(REPORT)).toContain('"cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted"');
  });

  it("FindingsSection's request button, muted only inside a disabled: variant", () => {
    const src = read(FINDINGS);
    expect(src).toMatch(/disabled:[\w:[\]-]*text-bcc-text-muted|disabled:text-bcc-text-muted/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. Set equality across the scope
// ─────────────────────────────────────────────────────────────────────────

describe("E3 — exactly five muted occurrences survive in scope", () => {
  it("three disabled controls plus two decorative marks, and nothing else", () => {
    const found: string[] = [];
    for (const f of SCOPE) {
      read(f)
        .split(/\r?\n/)
        .forEach((l) => {
          if (MUTED.test(l)) found.push(`${f.split("/").slice(-1)[0]} :: ${l.trim().slice(0, 60)}`);
        });
    }
    expect(found).toHaveLength(5);
    const names = found.map((f) => f.split(" :: ")[0]).sort();
    expect(names).toEqual([
      "AttestationActionCluster.tsx",
      "FindingsSection.tsx",
      "ReportMemberModal.tsx",
      "StandingFileBody.tsx",
      "StandingFileBody.tsx",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8. The measurements
// ─────────────────────────────────────────────────────────────────────────

describe("E3 — contrast on the surfaces these components actually render on", () => {
  const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");
  const tok = (n: string, i: number) => {
    const all = [...CSS.matchAll(new RegExp(`--${n}:\\s*([^;]+);`, "g"))];
    const v = all[i]?.[1]?.trim();
    if (v === undefined) throw new Error(`--${n}[${i}] missing`);
    return v;
  };
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (h: string) => {
    const s = h.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(s.slice(i, i + 2), 16) / 255));
    return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  it("light: secondary clears 4.5:1 on the card surface", () => {
    expect(ratio(tok("bcc-text-secondary", 0), tok("card-surface", 0))).toBeGreaterThanOrEqual(4.5);
  });
  it("dark: secondary clears 4.5:1 on the card surface", () => {
    expect(ratio(tok("bcc-text-secondary", 1), tok("card-surface", 1))).toBeGreaterThanOrEqual(4.5);
  });
  it("the done mark clears the 3:1 non-text bar in both themes", () => {
    // --bcc-success: [0]=:root, [1]=light, [2]=dark(@media), [3]=[data-theme=dark]
    expect(ratio(tok("bcc-success", 1), tok("card-surface", 0))).toBeGreaterThanOrEqual(3);
    expect(ratio(tok("bcc-success", 2), tok("card-surface", 1))).toBeGreaterThanOrEqual(3);
  });
  it("--phosphor is unscoped and fails light — recorded, not used for ticks", () => {
    const all = [...CSS.matchAll(/--phosphor:\s*([^;]+);/g)];
    expect(all).toHaveLength(1); // no theme-scoped variant exists
    expect(ratio(all[0]?.[1]?.trim() ?? "#000", "#ffffff")).toBeLessThan(3);
  });
  it("muted would still have failed — why the 25 moved", () => {
    expect(ratio(tok("bcc-text-muted", 0), tok("card-surface", 0))).toBeLessThan(4.5);
    expect(ratio(tok("bcc-text-muted", 1), tok("card-surface", 1))).toBeLessThan(4.5);
  });
  it("on FIXED CREAM PAPER secondary is the WRONG token — ink-ghost is right", () => {
    // Guards the trap for whatever slice touches paper next: the paper
    // background does not flip with theme, but the text tokens do.
    const paper = tok("paper", 0);
    expect(ratio(tok("bcc-text-secondary", 1), paper)).toBeLessThan(4.5); // dark secondary on paper
    expect(ratio(tok("ink-ghost", 0), paper)).toBeGreaterThanOrEqual(4.5);
  });
});
