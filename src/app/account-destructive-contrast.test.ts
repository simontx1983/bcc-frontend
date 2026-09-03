/**
 * Destructive Account controls must be READABLE, not just red.
 *
 * ## The failure this replaces
 *
 * The Delete-account trigger and heading used `text-safety` (#f05a28).
 * Measured in Chromium against the rendered panel:
 *
 *   text-safety on the light panel   3.39:1   FAILS 1.4.3 (4.5 required)
 *   text-safety on the dark  panel   5.11:1   passes
 *
 * The first hardening pass measured that number and tried to defer it as
 * a pre-existing theme migration. It is not deferrable here: this slice
 * MOVED and REDESIGNED that exact control into a new Danger Zone, so the
 * control's readability is this slice's responsibility.
 *
 * ## The chosen treatment
 *
 * `--bcc-danger` is the theme-aware danger token:
 *
 *   text-bcc-danger on the light panel   4.83:1   passes
 *   text-bcc-danger on the dark  panel   4.60:1   passes
 *
 * Destructive MEANING is not carried by the text colour alone — it is
 * carried by the `border-safety` mark (3.39 light / 5.11 dark, both above
 * the 3:1 non-text bar in 1.4.11), the Danger Zone section treatment, and
 * the words themselves. That satisfies 1.4.1 too: colour is never the
 * only channel.
 *
 * ## Two surfaces, two tokens
 *
 * Provider cards sit on the TINTED `bg-bcc-surface-hover`, where danger
 * only reaches 4.39 light / 4.04 dark. The unknown-connection line uses
 * `--bcc-warning` there (4.56 / 7.09) — which is also the honest
 * semantic: an unread status is unknown, not destructive.
 *
 * The dialog's Cancel button carried `bcc-btn-outline`'s `--bcc-accent`
 * at 2.39:1 on the light panel. In a destructive confirmation the SAFE
 * escape route must be the readable one, so it is overridden locally.
 * The shared `.bcc-btn-outline` class is untouched — eight unrelated call
 * sites depend on it, and that is an app-wide accent problem, not this
 * slice's.
 *
 * Every detector below is paired with a mutation control: restoring the
 * failing colour must fail a test. A guard that cannot fail is not a
 * guard.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

const DELETE_CARD = "src/components/settings/profile/DeleteAccountCard.tsx";
const CONFIRM_DIALOG = "src/components/ui/ConfirmDialog.tsx";
const CONNECTIONS = "src/components/settings/ConnectionsSection.tsx";

const CSS = read("src/app/globals.css");

/** Strip comments so the docblocks above cannot satisfy a detector. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── contrast maths, so the pinned numbers are derived not asserted ──────
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lum(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

/**
 * Token values read out of globals.css rather than hardcoded, so a token
 * edit is caught here instead of silently invalidating the pin.
 */
function tokenValue(name: string, theme: "light" | "dark"): string {
  const all = [...CSS.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, "g"))].map(
    (m) => m[1] ?? "",
  );
  // globals.css declares the base (dark-leaning) value first, then the
  // [data-theme="light"] override. Two declarations: [0] base, [1] light.
  expect(all.length, `--${name} should be declared twice`).toBeGreaterThanOrEqual(2);
  return theme === "light" ? (all[1] as string) : (all[0] as string);
}

// Panel + tinted-surface grounds, browser-measured and pinned.
const PANEL = { light: "#ffffff", dark: "#161b22" };
const SURFACE_HOVER = { light: "#f3f4f6", dark: "#21262d" };
const AA = 4.5;
const AA_NON_TEXT = 3;

describe("preconditions — the scan surface is real", () => {
  it("reads all three components and the stylesheet", () => {
    expect(read(DELETE_CARD).length).toBeGreaterThan(3_000);
    expect(read(CONFIRM_DIALOG).length).toBeGreaterThan(2_000);
    expect(read(CONNECTIONS).length).toBeGreaterThan(5_000);
    expect(CSS.length).toBeGreaterThan(100_000);
  });

  it("resolves the tokens it reasons about", () => {
    expect(tokenValue("bcc-danger", "light")).toBe("#dc2626");
    expect(tokenValue("bcc-danger", "dark")).toBe("#ef4444");
    expect(tokenValue("bcc-warning", "light")).toBe("#b45309");
    expect(tokenValue("bcc-warning", "dark")).toBe("#f59e0b");
  });
});

// ─────────────────────────────────────────────────────────────────────
// The arithmetic
// ─────────────────────────────────────────────────────────────────────

describe("the chosen tokens actually clear AA", () => {
  it("danger on the panel passes in BOTH themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const r = ratio(tokenValue("bcc-danger", theme), PANEL[theme]);
      expect(r, `danger/${theme} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("warning on the tinted provider surface passes in BOTH themes", () => {
    for (const theme of ["light", "dark"] as const) {
      const r = ratio(tokenValue("bcc-warning", theme), SURFACE_HOVER[theme]);
      expect(r, `warning/${theme} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("safety would FAIL on the light panel — the reason it was replaced", () => {
    const r = ratio("#f05a28", PANEL.light);
    expect(r).toBeLessThan(AA);
    expect(+r.toFixed(2)).toBe(3.39);
  });

  it("danger would FAIL on the tinted surface — the reason warning is used there", () => {
    for (const theme of ["light", "dark"] as const) {
      expect(ratio(tokenValue("bcc-danger", theme), SURFACE_HOVER[theme])).toBeLessThan(AA);
    }
  });

  it("the safety BORDER still clears the 3:1 non-text bar, so the mark survives", () => {
    for (const theme of ["light", "dark"] as const) {
      const r = ratio("#f05a28", PANEL[theme]);
      expect(r, `border/${theme} = ${r.toFixed(2)}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// The source must use those tokens
// ─────────────────────────────────────────────────────────────────────

describe("destructive Account text uses the passing token", () => {
  it("DeleteAccountCard carries NO text-safety at all", () => {
    expect(strip(read(DELETE_CARD))).not.toMatch(/\btext-safety\b/);
  });

  it("the Delete trigger and heading use text-bcc-danger", () => {
    const src = strip(read(DELETE_CARD));
    expect(src).toMatch(/text-lg text-bcc-danger">Delete account</);
    expect(src).toMatch(/text-bcc-danger[^"]*"\s*>\s*\n?\s*Delete my account/);
  });

  it("the destructive mark is still a safety BORDER, not a safety word", () => {
    const src = strip(read(DELETE_CARD));
    expect(src).toMatch(/border-safety\/\d+/);
  });

  it("ConfirmDialog's confirm and alert use danger, and Cancel is readable", () => {
    const src = strip(read(CONFIRM_DIALOG));
    expect(src).not.toMatch(/\btext-safety\b/);
    expect(src).toMatch(/text-bcc-danger/);
    // Cancel overrides bcc-btn-outline's accent locally.
    expect(src).toMatch(/bcc-btn-outline[^"]*text-bcc-text/);
  });

  it("the unknown-connection line uses warning, not danger or safety", () => {
    const src = strip(read(CONNECTIONS));
    const line = src.split("\n").find((l) => l.includes("text-bcc-warning"));
    expect(line, "warning token missing from ConnectionsSection").toBeDefined();
    // The old failing pairing must not come back on that surface.
    expect(src).not.toMatch(/text-bcc-danger[\s\S]{0,120}couldn/i);
  });

  it("no raw colour literal was introduced in any of the three", () => {
    for (const f of [DELETE_CARD, CONFIRM_DIALOG, CONNECTIONS]) {
      const src = strip(read(f));
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, f).not.toMatch(/\brgba?\(/);
      expect(src, f).not.toMatch(/\bhsla?\(/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Mutation controls — restoring the failure must fail
// ─────────────────────────────────────────────────────────────────────

describe("mutation controls", () => {
  function mutate(src: string, find: RegExp, replace: string, expected: number): string {
    let n = 0;
    const out = src.replace(find, () => {
      n += 1;
      return replace;
    });
    expect(n, `substitutions for ${find}`).toBe(expected);
    return out;
  }

  it("CONTROL: the real sources trip nothing", () => {
    expect(strip(read(DELETE_CARD))).not.toMatch(/\btext-safety\b/);
    expect(strip(read(CONFIRM_DIALOG))).not.toMatch(/\btext-safety\b/);
  });

  it("M1: restoring text-safety on the Delete trigger is caught", () => {
    const m = mutate(
      strip(read(DELETE_CARD)),
      /tracking-\[0\.16em\] text-bcc-danger/,
      "tracking-[0.16em] text-safety",
      1,
    );
    expect(m).toMatch(/\btext-safety\b/);
  });

  it("M2: restoring text-safety on the Delete heading is caught", () => {
    const m = mutate(
      strip(read(DELETE_CARD)),
      /text-lg text-bcc-danger/g,
      "text-lg text-safety",
      2,
    );
    expect(m).toMatch(/text-lg text-safety/);
  });

  it("M3: restoring text-safety on the dialog's confirm button is caught", () => {
    const m = mutate(
      strip(read(CONFIRM_DIALOG)),
      /border-safety\/70 text-bcc-danger/,
      "border-safety/70 text-safety",
      1,
    );
    expect(m).toMatch(/\btext-safety\b/);
  });

  it("M4: dropping the Cancel readability override is caught", () => {
    const m = mutate(
      strip(read(CONFIRM_DIALOG)),
      /bcc-btn-outline bcc-btn-sm text-bcc-text/,
      "bcc-btn-outline bcc-btn-sm",
      1,
    );
    expect(m).not.toMatch(/bcc-btn-outline[^"]*text-bcc-text/);
  });

  it("M5: a raw hex literal would be caught", () => {
    const m = mutate(strip(read(DELETE_CARD)), /text-bcc-danger/, "text-[#f05a28]", 1);
    expect(m).toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("M6: swapping the provider line back to danger is caught by the arithmetic", () => {
    // Not a source mutation — the point is that the maths itself rejects
    // the pairing, so the choice cannot be undone by opinion.
    for (const theme of ["light", "dark"] as const) {
      expect(ratio(tokenValue("bcc-danger", theme), SURFACE_HOVER[theme])).toBeLessThan(AA);
    }
  });

  it("SELF-TEST: a no-op mutation changes nothing", () => {
    const src = strip(read(DELETE_CARD));
    const m = mutate(src, /text-bcc-danger/, "text-bcc-danger", 1);
    expect(m).toBe(src);
  });
});
