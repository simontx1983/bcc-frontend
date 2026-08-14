/**
 * `/u/[handle]` adopts the shared `FileRail`, and its owner chip moves off
 * `--phosphor`.
 *
 * The member profile carried a private 34-line `FileRail` that shadowed the
 * shared component of the same name — same vocabulary, same geometry, one
 * different colour. Seven other surfaces already route through
 * `components/layout/FileRail`. This deletes the duplicate and points the
 * eighth at the maintained one.
 *
 * ## The colour change is the point, not a side effect
 *
 * The local copy painted the owner chip `text-phosphor` (`#7dff9a`), which
 * measures **1.26:1** on `--bcc-bg` in light theme — the worst readable-text
 * value left in the app. The shared component already paints it
 * `text-verified` (`#2c9d66`), which is both semantically right (the chip
 * asserts verified ownership) and far more readable: **3.43:1 light /
 * 5.52:1 dark**.
 *
 * ## The light-theme shortfall this slice left behind has since been closed
 *
 * As shipped, this change took the chip from 1.26:1 to **3.43:1** in light —
 * a large improvement, but short of the 4.5:1 that 12px `.bcc-mono` owes.
 * That residue was pre-existing and shared: `--bcc-verified` was a single
 * unscoped `:root` value, so all eight `FileRail` routes rendered the chip at
 * 3.43. Consolidating did not cause it; it made it uniform, and therefore
 * repairable in one edit.
 *
 * That edit has now landed. `--bcc-verified` is theme-scoped — `#20794e`
 * light (**5.38:1**), `#2c9d66` dark (5.52:1) — with `--verified-rgb` moved
 * in lockstep so the Tailwind utilities cannot drift from the CSS variable.
 * See `verified-theme-scope.test.ts` for the full matrix and the reasoning
 * behind keeping one token rather than splitting text from indicator.
 *
 * The assertions below never pinned the light value *below* 4.5 — a guard
 * that fails when someone fixes the colour punishes the fix. What they did
 * pin was that the token was unscoped, and that assertion fired the moment
 * the scoping landed. That is the guard working, not breaking.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FileRail } from "@/components/layout/FileRail";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const PAGE = "src/app/(main)/(app)/u/[handle]/page.tsx";
const RAIL = "src/components/layout/FileRail.tsx";

// ─────────────────────────────────────────────────────────────────────────
// 1. The duplicate is gone
// ─────────────────────────────────────────────────────────────────────────

describe("the private FileRail is completely removed", () => {
  const src = read(PAGE);

  it("the page file was actually read", () => {
    expect(src.length).toBeGreaterThan(10_000);
    expect(src).toContain("export default");
  });

  it("declares no local FileRail of any form", () => {
    expect(src).not.toMatch(/(?:function|const|class)\s+FileRail\b/);
  });

  it("imports the shared component instead", () => {
    expect(src).toContain('import { FileRail } from "@/components/layout/FileRail";');
  });

  it("carries no text-phosphor anywhere", () => {
    expect(src).not.toContain("text-phosphor");
  });

  it("passes the shared component's prop names, not the old local ones", () => {
    const call = /<FileRail\b[\s\S]*?\/>/.exec(src)?.[0] ?? "";
    expect(call, "no <FileRail .../> call site found").not.toBe("");
    expect(call).toContain('kind="OPERATOR"');
    expect(call).toContain("subject={`@${profile.handle.toUpperCase()}`}");
    expect(call).toContain("isOwner={isOwner}");
    expect(call).toContain("joinedLabel={formatJoinDate(profile.joined_at)}");
    // `handle` was the local component's prop; the shared one takes `subject`.
    expect(call).not.toMatch(/\bhandle=\{profile\.handle\}/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Rendered output is equivalent — proven by rendering both
// ─────────────────────────────────────────────────────────────────────────

/**
 * The deleted component, reproduced verbatim from `page.tsx` at 5ead24b.
 * Kept here as the historical reference so equivalence is demonstrated
 * against the real thing rather than asserted from memory.
 */
function LegacyFileRail({
  handle,
  isOwner,
  joinedLabel,
}: {
  handle: string;
  isOwner: boolean;
  joinedLabel: string;
}) {
  return (
    <div className="border-b border-dashed border-bcc-border">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-7">
        <span className="bcc-mono inline-flex items-center gap-2 text-bcc-text-secondary">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; OPERATOR</span>
          <span className="text-bcc-text">@{handle.toUpperCase()}</span>
          {isOwner && (
            <span className="text-phosphor">&nbsp;·&nbsp;YOU</span>
          )}
        </span>
        <span className="bcc-mono inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-bcc-text-secondary">
          <span>JOINED&nbsp;{joinedLabel}</span>
          <span>FILE 0001&nbsp;//&nbsp;OPEN</span>
        </span>
      </div>
    </div>
  );
}

const HANDLE = "phillip";
const JOINED = "MAY 2026";

const legacy = (isOwner: boolean) =>
  render(<LegacyFileRail handle={HANDLE} isOwner={isOwner} joinedLabel={JOINED} />)
    .container.innerHTML;

const shared = (isOwner: boolean) =>
  render(
    <FileRail
      kind="OPERATOR"
      subject={`@${HANDLE.toUpperCase()}`}
      isOwner={isOwner}
      joinedLabel={JOINED}
    />,
  ).container.innerHTML;

describe("rendered content is equivalent", () => {
  it("non-owner view is byte-identical", () => {
    expect(shared(false)).toBe(legacy(false));
  });

  it("owner view differs in exactly one token: the chip colour", () => {
    const before = legacy(true);
    const after = shared(true);
    expect(after).not.toBe(before);
    // Substituting the colour back reproduces the legacy markup exactly —
    // so nothing else about the owner view moved.
    expect(after.replace("text-verified", "text-phosphor")).toBe(before);
  });

  it("the owner chip still reads · YOU and is the only added node", () => {
    expect(shared(true)).toContain("&nbsp;·&nbsp;YOU");
    expect(shared(false)).not.toContain("YOU");
    expect(shared(true).replace(/<span class="text-verified">.*?<\/span>/, "")).toBe(
      shared(false),
    );
  });

  it("both labels and the rail dot survive", () => {
    const html = shared(true);
    expect(html).toContain("bcc-rail-dot");
    expect(html).toContain("FLOOR &nbsp;//&nbsp; OPERATOR");
    expect(html).toContain("@PHILLIP");
    expect(html).toContain("JOINED&nbsp;MAY 2026");
    expect(html).toContain("FILE 0001&nbsp;//&nbsp;OPEN");
  });

  it("the kind label is not double-transformed", () => {
    // `kind` is upper-cased by the component; a lower-case caller must not
    // produce a different rail than the upper-case one it replaced.
    const lower = render(
      <FileRail kind="operator" subject="@PHILLIP" joinedLabel={JOINED} />,
    ).container.innerHTML;
    expect(lower).toContain("FLOOR &nbsp;//&nbsp; OPERATOR");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Geometry is unchanged
// ─────────────────────────────────────────────────────────────────────────

describe("geometry stays on the 1440px file grid", () => {
  const GEOMETRY =
    "mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-7";

  it("the shared component carries the exact container class the local one had", () => {
    expect(read(RAIL)).toContain(GEOMETRY);
  });

  it("the rendered container uses it", () => {
    const { container } = render(
      <FileRail kind="OPERATOR" subject="@PHILLIP" joinedLabel={JOINED} />,
    );
    expect(container.querySelector(`.${CSS.escape("max-w-[1440px]")}`)).not.toBeNull();
    expect(container.innerHTML).toContain(GEOMETRY);
  });

  it("responsive padding is px-4 with an sm:px-7 step, not a single value", () => {
    expect(GEOMETRY).toContain("px-4");
    expect(GEOMETRY).toContain("sm:px-7");
    expect(read(RAIL)).not.toContain("max-w-[1560px]"); // that is RouteRail's grid
  });

  it("the dashed bottom border is preserved", () => {
    expect(read(RAIL)).toContain("border-b border-dashed border-bcc-border");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The owner chip's contrast, measured
// ─────────────────────────────────────────────────────────────────────────

const CSS_SRC = read("src/app/globals.css");

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
  [...CSS_SRC.matchAll(new RegExp(`--${n}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");

describe("the owner chip's colour", () => {
  const LIGHT_BG = "#ffffff";
  const DARK_BG = "#0d1117";

  // ── UPDATED: the deferral this block described has since been closed.
  //
  // When this guard landed, --bcc-verified was a single unscoped #2c9d66 and
  // the chip measured 3.43:1 in light — better than phosphor's 1.26, short of
  // 4.5. The two assertions recording that state were replaced rather than
  // deleted: they did their job by failing the moment the token was scoped.
  // Full detail lives in verified-theme-scope.test.ts.
  const LIGHT_VERIFIED = "#20794e";
  const DARK_VERIFIED = "#2c9d66";

  it("the tokens resolve to the values measured here", () => {
    expect(token("bcc-verified")).toEqual([LIGHT_VERIFIED, DARK_VERIFIED, DARK_VERIFIED]);
    expect(token("phosphor")).toEqual(["#7dff9a"]);
    expect(token("bcc-bg")).toEqual([LIGHT_BG, DARK_BG, DARK_BG]);
  });

  it("clears 4.5:1 in dark theme", () => {
    expect(ratio(DARK_VERIFIED, DARK_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it("now clears 4.5:1 in LIGHT theme too — the deferral is closed", () => {
    const before = ratio("#7dff9a", LIGHT_BG); // phosphor, 1.26
    const after = ratio(LIGHT_VERIFIED, LIGHT_BG); // 5.38
    expect(before).toBeLessThan(1.5);
    expect(after).toBeGreaterThanOrEqual(4.5);
  });

  it("the chip is normal-size text, which is why 4.5:1 was the bar", () => {
    // .bcc-mono is 12px — recorded so a later reader does not mistake the
    // 3:1 pass above for compliance.
    expect(CSS_SRC).toMatch(/\.bcc-mono\s*\{[^}]*font-size:\s*12px/);
  });

  it("--bcc-verified is theme-scoped, and its triplet moves with it", () => {
    expect(token("bcc-verified")).toHaveLength(3);
    expect(token("verified-rgb")).toEqual(["32 121 78", "44 157 102", "44 157 102"]);
  });

  it("phosphor is untouched for its other consumers", () => {
    expect(token("phosphor")).toEqual(["#7dff9a"]);
    expect(token("phosphor-rgb")).toEqual(["125 255 154"]);
  });
});
