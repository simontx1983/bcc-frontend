import type { Config } from "tailwindcss";

/**
 * BCC Tailwind Config — v2
 *
 * This file aliases CSS custom properties from globals.css into
 * Tailwind utility classes. globals.css remains the single source
 * of truth for all values — Tailwind just gets named shortcuts.
 *
 * Why alias CSS vars instead of hardcoding hex values?
 *   Hardcoding would break the theme system. By pointing each color
 *   at var(--bcc-*), the light/dark swap and primary/secondary accent
 *   swap in globals.css flow through automatically at runtime —
 *   no Tailwind rebuild needed.
 *
 * Usage in components:
 *   bg-bcc-bg            → background: var(--bcc-bg)
 *   text-bcc-accent      → color: var(--bcc-accent)
 *   border-bcc-border    → border-color: var(--bcc-border)
 *   shadow-bcc-md        → box-shadow: var(--bcc-shadow-md)
 *   rounded-bcc-lg       → border-radius: var(--bcc-radius-lg)
 *   font-stencil         → font-family: var(--font-stencil), Impact, sans-serif
 */

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],

  // We control dark mode via [data-theme="dark"] on <html>, not Tailwind's
  // built-in dark: variant. This keeps the theme system 100% in globals.css.
  darkMode: ["selector", '[data-theme="dark"]'],

  theme: {
    extend: {
      colors: {
        // ── Fixed black/white (theme-independent) ──────────────────────────
        // Use these instead of Tailwind's raw `text-white`/`bg-black`. The
        // `<alpha-value>` placeholder lets opacity modifiers work:
        // `text-bcc-white/70`, `bg-bcc-black/50`.
        "bcc-white":            "rgb(var(--bcc-white-rgb) / <alpha-value>)",
        "bcc-black":            "rgb(var(--bcc-black-rgb) / <alpha-value>)",

        // ── Brand constants (never change with theme) ──────────────────────
        "bcc-primary":          "var(--bcc-primary)",
        "bcc-primary-light":    "var(--bcc-primary-light)",
        "bcc-primary-dark":     "var(--bcc-primary-dark)",
        "bcc-primary-subtle":   "var(--bcc-primary-subtle)",
        "bcc-primary-glow":     "var(--bcc-primary-glow)",

        "bcc-secondary":        "var(--bcc-secondary)",
        "bcc-secondary-light":  "var(--bcc-secondary-light)",
        "bcc-secondary-dark":   "var(--bcc-secondary-dark)",
        "bcc-secondary-subtle": "var(--bcc-secondary-subtle)",
        "bcc-secondary-glow":   "var(--bcc-secondary-glow)",

        // ── Accent (swapped by data-accent on <html>) ──────────────────────
        // These are the ones you should use in most components.
        // They automatically become blue or orange based on user preference.
        "bcc-accent":           "var(--bcc-accent)",
        "bcc-accent-light":     "var(--bcc-accent-light)",
        "bcc-accent-dark":      "var(--bcc-accent-dark)",
        "bcc-accent-subtle":    "var(--bcc-accent-subtle)",
        "bcc-accent-glow":      "var(--bcc-accent-glow)",

        // ── Surfaces (swap with light/dark theme) ──────────────────────────
        "bcc-bg":               "var(--bcc-bg)",
        "bcc-bg-elevated":      "var(--bcc-bg-elevated)",
        "bcc-bg-sunken":        "var(--bcc-bg-sunken)",
        "bcc-bg-overlay":       "var(--bcc-bg-overlay)",

        "bcc-surface":          "var(--bcc-surface)",
        "bcc-surface-raised":   "var(--bcc-surface-raised)",
        "bcc-surface-hover":    "var(--bcc-surface-hover)",
        "bcc-surface-active":   "var(--bcc-surface-active)",

        // ── Borders ────────────────────────────────────────────────────────
        "bcc-border":           "var(--bcc-border)",
        "bcc-border-light":     "var(--bcc-border-light)",
        "bcc-border-strong":    "var(--bcc-border-strong)",

        // ── Text ───────────────────────────────────────────────────────────
        "bcc-text":             "var(--bcc-text)",
        "bcc-text-secondary":   "var(--bcc-text-secondary)",
        "bcc-text-muted":       "var(--bcc-text-muted)",
        "bcc-text-placeholder": "var(--bcc-text-placeholder)",
        "bcc-text-inverse":     "var(--bcc-text-inverse)",

        // ── Glass ──────────────────────────────────────────────────────────
        "bcc-glass-bg":         "var(--bcc-glass-bg)",
        "bcc-glass-border":     "var(--bcc-glass-border)",

        // ── Header & Sidebar ───────────────────────────────────────────────
        "bcc-header-bg":        "var(--bcc-header-bg)",
        "bcc-header-border":    "var(--bcc-header-border)",
        "bcc-sidebar-bg":       "var(--bcc-sidebar-bg)",
        "bcc-sidebar-border":   "var(--bcc-sidebar-border)",

        // ── Inputs ─────────────────────────────────────────────────────────
        "bcc-input-bg":         "var(--bcc-input-bg)",
        "bcc-input-bg-focus":   "var(--bcc-input-bg-focus)",
        "bcc-input-border":     "var(--bcc-input-border)",

        // ── Status ─────────────────────────────────────────────────────────
        "bcc-success":          "var(--bcc-success)",
        "bcc-warning":          "var(--bcc-warning)",
        "bcc-danger":           "var(--bcc-danger)",
        "bcc-info":             "var(--bcc-info)",

        // ── Card tiers (data-driven, stable across themes) ─────────────────
        "bcc-tier-common":      "var(--bcc-tier-common)",
        "bcc-tier-uncommon":    "var(--bcc-tier-uncommon)",
        "bcc-tier-rare":        "var(--bcc-tier-rare)",
        "bcc-tier-legendary":   "var(--bcc-tier-legendary)",

        // ── Operator type badges ───────────────────────────────────────────
        "bcc-type-validator":   "var(--bcc-type-validator)",
        "bcc-type-project":     "var(--bcc-type-project)",
        "bcc-type-nft":         "var(--bcc-type-nft)",
        "bcc-type-dao":         "var(--bcc-type-dao)",

        // ── Trading-card / workshop layer aliases (RESTORED) ───────────────
        // Restored post-PR-#10 merge — dropped in the keep-redesign conflict
        // resolution. Classes like text-ink / bg-cardstock across CardFactory,
        // PageHero, profile panels etc. compile to nothing without these.
        // The CSS variables live in the "TRADING-CARD + WORKSHOP LAYER —
        // RESTORED" block at the bottom of globals.css.
        cardstock: {
          DEFAULT: "var(--cardstock)",        // #efe5cf
          deep:    "var(--cardstock-deep)",   // #d9c9a3
          edge:    "var(--cardstock-edge)",   // #b09877
        },
        paper: {
          DEFAULT: "var(--paper)",       // #f7efd9
          warm:    "var(--paper-warm)",  // #f2e6c8
        },
        ink: {
          DEFAULT: "var(--ink)",         // #0f0d09
          soft:    "var(--ink-soft)",    // #2a251c
          ghost:   "var(--ink-ghost)",   // #6b6355 — muted secondary text
        },
        phosphor: "var(--phosphor)",     // #7dff9a — "live" green
        verified: "var(--verified)",     // #2c9d66 — good-standing green
        concrete: {
          DEFAULT: "var(--concrete)",     // #14110d
          hi:      "var(--concrete-hi)",  // #1d1913
        },
        blueprint: "var(--blueprint)", // #0f1e3c
        safety:    "var(--safety)",    // #f05a28 — caution-tape orange
        weld:      "var(--weld)",      // #ffc01e — arc-weld yellow
        chain: {
          cosmos:    "var(--chain-cosmos)",    // #1a0f3e
          osmosis:   "var(--chain-osmosis)",   // #c73f86
          injective: "var(--chain-injective)", // #0a72ff
          kujira:    "var(--chain-kujira)",    // #e62c3f
        },
        // Card tiers — server returns card_tier; we just paint it.
        // --tier-* map onto the redesign's --bcc-tier-* tokens.
        tier: {
          common:    "var(--tier-common)",    // #6b6e72
          uncommon:  "var(--tier-uncommon)",  // #247a3f
          rare:      "var(--tier-rare)",      // #1d4fbb
          legendary: "var(--tier-legendary)", // #d9a400
        },
      },

      // ── Typography ────────────────────────────────────────────────────────
      // Fonts are loaded via next/font in layout.tsx.
      // CSS variables are injected there; we just reference them here.
      fontFamily: {
        stencil: ["var(--font-stencil)", "Impact", "sans-serif"],
        serif:   ["var(--font-serif)", "Georgia", "serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "monospace"],
        script:  ["var(--font-script)", "cursive"],
      },

      // ── Border radius ─────────────────────────────────────────────────────
      borderRadius: {
        "bcc-sm":   "var(--bcc-radius-sm)",   // 6px
        "bcc-md":   "var(--bcc-radius-md)",   // 10px
        "bcc-lg":   "var(--bcc-radius-lg)",   // 16px
        "bcc-xl":   "var(--bcc-radius-xl)",   // 24px
        "bcc-full": "var(--bcc-radius-full)",  // 9999px
      },

      // ── Box shadows ───────────────────────────────────────────────────────
      boxShadow: {
        "bcc-sm": "var(--bcc-shadow-sm)",
        "bcc-md": "var(--bcc-shadow-md)",
        "bcc-lg": "var(--bcc-shadow-lg)",
        "bcc-xl": "var(--bcc-shadow-xl)",
      },

      // ── Spacing / sizing for layout dimensions ────────────────────────────
      // Useful for header height, sidebar widths in utility classes.
      height: {
        "bcc-header": "var(--bcc-header-h)", // 60px
      },
      width: {
        "bcc-sidebar-left":  "var(--bcc-sidebar-left-w)",   // 260px
        "bcc-sidebar-right": "var(--bcc-sidebar-right-w)",  // 280px
      },
      maxWidth: {
        "bcc-content": "var(--bcc-content-max-w)", // 680px
      },

      // ── Letter spacing ────────────────────────────────────────────────────
      letterSpacing: {
        rail: "0.12em", // used on mono labels, status rails
      },

      // ── Transitions ───────────────────────────────────────────────────────
      transitionDuration: {
        "bcc-fast": "120ms",
        "bcc-base": "200ms",
        "bcc-slow": "360ms",
      },
    },
  },

  plugins: [],
};

export default config;