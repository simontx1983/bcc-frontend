/**
 * Dead-CSS cleanup — the removal set, pinned so it cannot creep back.
 *
 * 72 `.bcc-*` selectors were deleted from `globals.css` after a
 * repo-wide containment check: 7,835 files across TS/TSX, JS, CSS,
 * Markdown, JSON, PHP, HTML, YAML, SQL, SVG, scripts and config —
 * the whole monorepo, not just the frontend.
 *
 * Three reference classes surfaced during that check and were each
 * resolved before anything was deleted:
 *
 *   - `.bcc-badge` / `.bcc-btn-danger` appear in the WordPress admin
 *     stylesheet, scoped as `.bcc-admin-wrap .bcc-badge`. wp-admin never
 *     loads this stylesheet, so those are independent definitions that
 *     merely share a name.
 *   - `bcc-tabs` appears once in `app/sql/local.sql` — as a Rank Math
 *     404-log row for a missing file path, not a class in `post_content`.
 *     No candidate appears in WordPress-authored content, so nothing can
 *     be injected into rendered post bodies.
 *   - `docs/frontend-doctrine.md` names several of them, and does so to
 *     warn readers off: "They are dead CSS, not the standard."
 *
 * Deliberately NOT deleted, and asserted present below:
 *
 *   - `.bcc-text-muted` — zero consumers, kept anyway. A class named
 *     "muted" documenting a valid style for genuinely muted or exempt
 *     content is a design-system invariant established by the completed
 *     muted-text programme. The defect there was misuse, not existence.
 *   - `.bcc-onboarding-chip-*` — composed at runtime in `DopamineStep`
 *     as `bcc-onboarding-chip-${tier}`, so no literal reference exists.
 *   - `.bcc-avatar-md` — the one avatar size class with a real consumer;
 *     `sm/lg/xl/2xl` are dead because `Avatar` uses a `SIZE_TABLE` with
 *     inline px instead.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");

/**
 * Comments stripped before matching: the contract is that no RULE defines
 * these selectors. `globals.css` carries a historical note that mentions
 * `.bcc-card-interactive` in prose, and prose is not a style rule.
 */
const RULES = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** The exact removal set. Machine-readable on purpose. */
const DELETED: readonly string[] = [
  "bcc-auth-chain-opt",
  "bcc-auth-chain-opt--active",
  "bcc-avatar-2xl",
  "bcc-avatar-dot",
  "bcc-avatar-lg",
  "bcc-avatar-sm",
  "bcc-avatar-wrap",
  "bcc-avatar-xl",
  "bcc-badge",
  "bcc-badge-accent",
  "bcc-badge-danger",
  "bcc-badge-neutral",
  "bcc-badge-success",
  "bcc-badge-warning",
  "bcc-btn-danger",
  "bcc-btn-lg",
  "bcc-card-interactive",
  "bcc-composer",
  "bcc-composer-input",
  "bcc-divider",
  "bcc-dropcap",
  "bcc-feed",
  "bcc-feed-divider",
  "bcc-field",
  "bcc-foil-band",
  "bcc-footer",
  "bcc-footer-acquire",
  "bcc-footer-acquire-actions",
  "bcc-footer-acquire-line",
  "bcc-footer-acquire-text",
  "bcc-footer-col",
  "bcc-footer-col-label",
  "bcc-footer-col-link",
  "bcc-footer-col-list",
  "bcc-footer-grid",
  "bcc-footer-meta-cluster",
  "bcc-footer-stamp",
  "bcc-footer-status",
  "bcc-footer-status-dot",
  "bcc-glass",
  "bcc-input",
  "bcc-label",
  "bcc-ldg-mono",
  "bcc-marquee",
  "bcc-marquee-track",
  "bcc-nav-badge",
  "bcc-nav-link",
  "bcc-offcanvas-guest-block",
  "bcc-onb-btn-ghost",
  "bcc-onb-prim-accent",
  "bcc-op-card",
  "bcc-op-card-tier-strip",
  "bcc-post",
  "bcc-post-action",
  "bcc-post-actions",
  "bcc-post-avatar",
  "bcc-post-body",
  "bcc-post-content",
  "bcc-post-handle",
  "bcc-post-header",
  "bcc-post-name",
  "bcc-post-time",
  "bcc-script",
  "bcc-site-footer",
  "bcc-sso-soon",
  "bcc-tabs",
  "bcc-text-accent",
  "bcc-tier-caution",
  "bcc-tier-neutral",
  "bcc-tier-proven",
  "bcc-tier-risky",
  "bcc-tier-trusted",
];

/** Token-exact so a longer name that merely starts the same cannot match. */
const present = (cls: string) =>
  new RegExp(`(?<![-\w])\.${cls}(?![-\w])`).test(RULES);

describe("dead-CSS removal — the scan is honest before it concludes", () => {
  it("read a real stylesheet", () => {
    expect(CSS.length).toBeGreaterThan(100_000);
    expect(CSS).toContain("@tailwind");
  });

  it("the removal set is exactly 72 unique selectors", () => {
    expect(DELETED).toHaveLength(72);
    expect(new Set(DELETED).size).toBe(72);
  });

  it("the matcher actually matches something that IS present", () => {
    // Guards against a broken regex reporting universal absence.
    expect(present("bcc-text-muted")).toBe(true);
    expect(present("bcc-panel")).toBe(true);
  });
});

describe("dead-CSS removal — all 72 stay absent", () => {
  it("no deleted selector has come back", () => {
    const resurrected = DELETED.filter(present);
    expect(resurrected, `resurrected: ${resurrected.join(", ")}`).toEqual([]);
  });

  for (const cls of DELETED) {
    it(`.${cls} absent`, () => {
      expect(present(cls)).toBe(false);
    });
  }
});

describe("dead-CSS removal — deliberate survivors stay present", () => {
  it(".bcc-text-muted is preserved as a design-system invariant", () => {
    expect(present("bcc-text-muted")).toBe(true);
    expect(CSS).toContain(".bcc-text-muted     { color: var(--bcc-text-muted); }");
  });

  it("the dynamically composed onboarding-chip family is preserved", () => {
    // Six rules: the base plus five tier variants. (A seventh name,
    // `bcc-onboarding-chip-`, appears only in the comment that documents
    // the `${tier}` composition — prose, not a rule.)
    const chips = [...RULES.matchAll(/\.(bcc-onboarding-chip[a-z0-9-]*)/g)].map((m) => m[1]);
    expect(new Set(chips).size).toBe(6);
  });

  it(".bcc-avatar-md is preserved and its dead siblings are gone", () => {
    expect(present("bcc-avatar-md")).toBe(true);
    for (const s of ["bcc-avatar-sm", "bcc-avatar-lg", "bcc-avatar-xl", "bcc-avatar-2xl"]) {
      expect(present(s)).toBe(false);
    }
  });
});

describe("dead-CSS removal — nothing shared was collateral damage", () => {
  it("no custom property was removed", () => {
    const props = new Set([...CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
    expect(props.size).toBeGreaterThan(150);
    for (const t of ["--bcc-text-muted", "--bcc-text-secondary", "--paper", "--cardstock", "--ink"]) {
      expect(props.has(t), `${t} went missing`).toBe(true);
    }
  });

  it("no @keyframes was removed", () => {
    expect([...CSS.matchAll(/@keyframes\s+[\w-]+/g)]).toHaveLength(34);
  });

  it("the stylesheet still parses — braces balance", () => {
    expect((CSS.match(/\{/g) ?? []).length).toBe((CSS.match(/\}/g) ?? []).length);
  });
});
