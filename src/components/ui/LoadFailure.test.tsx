/**
 * LoadFailure — surface + optional-retry contract.
 *
 * Two things are pinned here.
 *
 * 1. **Contrast.** jsdom has no CSS engine and `vitest.config.ts` sets
 *    `css: false`, so `getComputedStyle` cannot help. Instead this reads
 *    the real token values out of `globals.css` and computes WCAG ratios
 *    directly. That makes the assertion about the palette itself rather
 *    than about a rendered pixel — a later edit that darkens `--paper`
 *    or lightens `--ink-soft` fails right here, before any consumer
 *    surfaces the regression.
 *
 * 2. **Surface separation.** Doctrine §5.3: theme-aware app surfaces and
 *    fixed cream/ink paper are two families, and mixing them is this
 *    repo's most-repeated bug (it measured 1.03:1 in dark mode before
 *    Batch A). Each variant is asserted to use its own family and to
 *    leak none of the other's tokens.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LOAD_FAILURE_TOKENS, LoadFailure } from "@/components/ui/LoadFailure";

afterEach(cleanup);

// ── palette, read from the real stylesheet ────────────────────────────

// Vitest's root is bcc-frontend/, so resolve from there rather than from
// import.meta.url (which is not a file: URL under the transform).
const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");

/** First declaration of a custom property, as authored. */
function token(name: string): string {
  const m = new RegExp("--" + name + ":\\s*([^;]+);").exec(CSS);
  if (m?.[1] === undefined) throw new Error(`token --${name} not found in globals.css`);
  return m[1].trim();
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (m?.[1] === undefined) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) =>
    srgbToLinear(Number.parseInt(m[1]!.slice(i, i + 2), 16) / 255),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** A translucent colour is only as visible as what it composites to, so
 *  `border-ink/60` has to be measured after blending, not at full ink. */
function composite(fg: string, bg: string, alpha: number): string {
  const parse = (hex: string) =>
    [0, 2, 4].map((i) => Number.parseInt(hex.trim().slice(1 + i, 3 + i), 16));
  const [f, b] = [parse(fg), parse(bg)];
  return (
    "#" +
    f
      .map((c, i) =>
        Math.round(alpha * c + (1 - alpha) * b[i]!)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

const AA_TEXT = 4.5;
const AA_NON_TEXT = 3; // WCAG 2.2 §1.4.11 — UI components and focus rings

/** Alpha of `border-ink/60` on the paper retry button. */
const PAPER_BUTTON_BORDER_ALPHA = 0.6;

describe("paper palette clears WCAG AA on the paper surface", () => {
  const paper = token("paper"); // .bcc-paper background

  it("sanity: the contrast maths agrees on a known pair", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("message text (--ink-soft) clears 4.5:1", () => {
    const ratio = contrast(token("ink-soft"), paper);
    expect(ratio).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("retry label (--ink) clears 4.5:1", () => {
    expect(contrast(token("ink"), paper)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("the retry button's border stays visible once composited", () => {
    // border-ink/60 is translucent, so what matters is the blend against
    // cream, not ink at full strength. Below ~50% this misses the bar.
    const blended = composite(token("ink"), paper, PAPER_BUTTON_BORDER_ALPHA);
    expect(contrast(blended, paper)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("focus ring (--ink) clears the 3:1 non-text bar against paper", () => {
    expect(contrast(token("ink"), paper)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("the decorative glyph is aria-hidden, so it is exempt from the text bar", () => {
    render(<LoadFailure message="x" surface="paper" />);
    const svg = document.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden");
  });
});

describe("theme palette is unchanged and still clears AA", () => {
  it("message text (--bcc-text-secondary) clears 4.5:1 in both themes", () => {
    // Light block is the first declaration; dark is the later one.
    const secondaries = [...CSS.matchAll(/--bcc-text-secondary:\s*([^;]+);/g)].map((m) =>
      m[1]!.trim(),
    );
    const backgrounds = [...CSS.matchAll(/--bcc-bg:\s*([^;]+);/g)].map((m) => m[1]!.trim());
    expect(secondaries.length).toBeGreaterThan(0);
    expect(backgrounds.length).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(secondaries.length, backgrounds.length); i++) {
      const fg = secondaries[i]!;
      const bg = backgrounds[i]!;
      if (!fg.startsWith("#") || !bg.startsWith("#")) continue;
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

// ── surface separation ────────────────────────────────────────────────

const THEME_MARKERS = ["--bcc-text", "bcc-btn-outline"];
const PAPER_MARKERS = ["ink", "paper", "cardstock"];

describe("surface separation — neither family leaks into the other", () => {
  it("the theme variant uses only theme tokens", () => {
    const all = Object.values(LOAD_FAILURE_TOKENS.theme).join(" ");
    expect(all).toContain("--bcc-text-secondary");
    expect(all).toContain("--bcc-text-muted");
    for (const marker of PAPER_MARKERS) {
      expect(all).not.toMatch(new RegExp(`\\b(?:text|bg|border|outline)-${marker}\\b`));
    }
  });

  it("the paper variant uses only fixed cream/ink tokens", () => {
    const all = Object.values(LOAD_FAILURE_TOKENS.paper).join(" ");
    expect(all).toContain("text-ink-soft");
    expect(all).toContain("text-ink-ghost");
    for (const marker of THEME_MARKERS) {
      expect(all).not.toContain(marker);
    }
  });

  it("the paper variant overrides the accent-coloured global focus ring", () => {
    // :focus-visible { outline: 2px solid var(--bcc-accent) } would put a
    // pale cyan/orange ring on cream. The paper button must re-point it.
    expect(LOAD_FAILURE_TOKENS.paper.button).toContain("focus-visible:outline-ink");
  });

  it("ships the same border alpha the contrast test measures", () => {
    // Without this, the class could be tuned down to border-ink/20 and
    // the composited-contrast test above would still pass against 0.6.
    const pct = PAPER_BUTTON_BORDER_ALPHA * 100;
    expect(LOAD_FAILURE_TOKENS.paper.button).toContain(`border-ink/${pct}`);
  });
});

// ── rendered contract ─────────────────────────────────────────────────

describe("surface prop", () => {
  it("defaults to theme, so existing callers are untouched", () => {
    render(<LoadFailure message="Couldn't load." onRetry={() => {}} />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("--bcc-text-secondary");
    expect(alert.className).not.toContain("ink");
  });

  it("renders paper tokens when asked", () => {
    render(<LoadFailure message="Couldn't load." onRetry={() => {}} surface="paper" />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("text-ink-soft");
    expect(alert.className).not.toContain("--bcc-text");
  });

  it("keeps the alert role and message on both surfaces", () => {
    for (const surface of ["theme", "paper"] as const) {
      render(<LoadFailure message={`failed on ${surface}`} surface={surface} />);
      expect(screen.getByRole("alert")).toHaveTextContent(`failed on ${surface}`);
      cleanup();
    }
  });
});

describe("optional onRetry", () => {
  it("renders a working Retry button when a handler is given", () => {
    const onRetry = vi.fn();
    render(<LoadFailure message="Couldn't load." onRetry={onRetry} />);

    const button = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("renders NO button at all when omitted — not a disabled shell", () => {
    render(<LoadFailure message="You don't have access." />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.querySelectorAll("button")).toHaveLength(0);
    // and no empty action region left behind
    expect(screen.getByRole("alert").parentElement?.children).toHaveLength(2);
  });

  it("omits the button on the paper surface too", () => {
    render(<LoadFailure message="Not found." surface="paper" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
