import type { Config } from "tailwindcss";

/**
 * BCC design tokens — lifted from validator-card-prototype.html.
 *
 * The CSS custom properties in globals.css are the authoritative
 * source; this config aliases them so Tailwind utility classes
 * (bg-cardstock, text-ink, border-tier-legendary, etc.) resolve to
 * the same CSS variables. Editing one place keeps both in sync.
 *
 * Why duplicate at all: Tailwind needs literal strings at build time
 * to generate utility classes. Pointing each color at `var(--token)`
 * defers the actual value to CSS so dark-mode / theme variants can
 * swap variables without rebuilding Tailwind.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Cardstock palette — the warm paper tones that surfaces sit on.
        cardstock: {
          DEFAULT: "var(--cardstock)",        // #efe5cf
          deep:    "var(--cardstock-deep)",   // #d9c9a3
          edge:    "var(--cardstock-edge)",   // #b09877
        },
        // Paper — warmer/brighter cardstock variants used on full sheets.
        paper: {
          DEFAULT: "var(--paper)",       // #f7efd9
          warm:    "var(--paper-warm)",  // #f2e6c8
        },
        // Ink — high-contrast type on cardstock.
        ink: {
          DEFAULT: "var(--ink)",         // #0f0d09
          soft:    "var(--ink-soft)",    // #2a251c
          ghost:   "var(--ink-ghost)",   // #6b6355 — muted secondary text
        },
        // Phosphor + Verified — "live" green and good-standing green.
        phosphor: "var(--phosphor)",     // #7dff9a
        verified: "var(--verified)",     // #2c9d66
        // Concrete — the warehouse-floor backdrop.
        concrete: {
          DEFAULT: "var(--concrete)",     // #14110d
          hi:      "var(--concrete-hi)",  // #1d1913
        },
        // Accent / chrome.
        blueprint: "var(--blueprint)", // #0f1e3c
        safety:    "var(--safety)",    // #f05a28 — caution-tape orange
        weld:      "var(--weld)",      // #ffc01e — arc-weld yellow
        // Chain colors — each network gets a stable hue.
        chain: {
          cosmos:    "var(--chain-cosmos)",    // #1a0f3e
          osmosis:   "var(--chain-osmosis)",   // #c73f86
          injective: "var(--chain-injective)", // #0a72ff
          kujira:    "var(--chain-kujira)",    // #e62c3f
        },
        // Card tiers — derived from reputation_tier on the server (§C1).
        // Server returns card_tier; we just paint it.
        tier: {
          common:    "var(--tier-common)",    // #6b6e72
          uncommon:  "var(--tier-uncommon)",  // #247a3f
          rare:      "var(--tier-rare)",      // #1d4fbb
          legendary: "var(--tier-legendary)", // #d9a400
        },
      },
      fontFamily: {
        // Loaded via next/font/google in src/app/layout.tsx.
        // CSS variables are set there; Tailwind references them.
        stencil: ["var(--font-stencil)", "Impact", "sans-serif"],
        serif:   ["var(--font-fraunces)", "Georgia", "serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "monospace"],
        script:  ["var(--font-script)", "cursive"],
      },
      letterSpacing: {
        // Stencil + caption tracking from the prototype rail (.rail font-size:11px / letter-spacing:.12em).
        rail: "0.12em",
      },
      backgroundImage: {
        // Concrete + blueprint grid + soft vignettes — the warehouse floor.
        // Pulled verbatim from validator-card-prototype.html body styles.
        "warehouse-floor": [
          "repeating-linear-gradient(0deg,  transparent 0 72px, rgba(239, 229, 207, 0.025) 72px 73px)",
          "repeating-linear-gradient(90deg, transparent 0 72px, rgba(239, 229, 207, 0.025) 72px 73px)",
          "radial-gradient(ellipse at 22% 10%, rgba(240, 90, 40, 0.10), transparent 55%)",
          "radial-gradient(ellipse at 85% 85%, rgba(29, 79, 187, 0.08), transparent 60%)",
        ].join(", "),
      },
      backgroundSize: {
        "warehouse-floor": "72px 72px, 72px 72px, 100% 100%, 100% 100%",
      },
    },
  },
  plugins: [],
};

export default config;
