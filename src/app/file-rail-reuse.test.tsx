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
 * ## ⚠ Light theme is improved, NOT yet compliant — read this before
 * ## calling the chip done
 *
 * `.bcc-mono` is **12px**, so the chip is normal-size text and owes 4.5:1.
 * At 3.43:1 light it does not clear that bar. This slice takes the chip from
 * catastrophic to merely short, and makes the shortfall uniform instead of
 * route-specific.
 *
 * That residue is **pre-existing and shared**: `--bcc-verified` is defined
 * once in `:root`, unscoped, so all seven existing `FileRail` routes already
 * render the chip at 3.43:1. This change inherits that defect rather than
 * introducing it — and having one failing value in one component is what
 * makes it fixable in a single later edit, which two divergent copies never
 * were.
 *
 * The fix is a light-theme-scoped value (the `--bcc-accent-indicator` and
 * `--bcc-search-placeholder` precedents), and it is deliberately NOT done
 * here: `var(--verified)` has 41 uses across the stylesheet, so re-toning the
 * token is a colour decision with its own blast radius, not housekeeping.
 *
 * Note the assertions below do not pin the light value *below* 4.5 — a guard
 * that fails when someone fixes the colour is a guard that punishes the fix.
 * They pin the improvement over phosphor and the dark-theme pass.
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

  it("the tokens resolve to the values measured here", () => {
    expect(token("bcc-verified")).toEqual(["#2c9d66"]);
    expect(token("phosphor")).toEqual(["#7dff9a"]);
    expect(token("bcc-bg")).toEqual([LIGHT_BG, DARK_BG, DARK_BG]);
  });

  it("clears 4.5:1 in dark theme", () => {
    expect(ratio("#2c9d66", DARK_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it("is a large improvement on phosphor in light theme", () => {
    const before = ratio("#7dff9a", LIGHT_BG); // 1.26
    const after = ratio("#2c9d66", LIGHT_BG); // 3.43
    expect(before).toBeLessThan(1.5);
    expect(after).toBeGreaterThan(before * 2.5);
    expect(after).toBeGreaterThanOrEqual(3.0); // clears the non-text / large-text bar
  });

  it("the chip is normal-size text, which is why 3:1 is not the finish line", () => {
    // .bcc-mono is 12px — recorded so a later reader does not mistake the
    // 3:1 pass above for compliance.
    expect(CSS_SRC).toMatch(/\.bcc-mono\s*\{[^}]*font-size:\s*12px/);
  });

  it("--bcc-verified is still unscoped, so any fix must add theme scopes", () => {
    // One definition = both themes share it. The eventual repair adds a
    // light-theme value; this records why a single edit is not enough.
    expect(token("bcc-verified")).toHaveLength(1);
  });

  it("phosphor is untouched for its other consumers", () => {
    expect(token("phosphor")).toEqual(["#7dff9a"]);
    expect(token("phosphor-rgb")).toEqual(["125 255 154"]);
  });
});
