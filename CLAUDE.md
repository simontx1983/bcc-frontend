# BCC Frontend

Headless Next.js frontend for the bcc-trust WordPress backend (Blue Collar Crypto).

## Stack
- Next.js 15.5 (App Router, `typedRoutes` enabled), React 19, TypeScript 5.9
- `strict` plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`
- TanStack Query v5, NextAuth v4, Tailwind CSS v3
- Headless WordPress backend (bcc-trust plugin); CORS handled server-side via `BCC_FRONTEND_ORIGIN`

## Next.js 15 constraints
These have caused Vercel build failures or runtime crashes before — treat as hard rules:
- `useSearchParams()` requires a `<Suspense>` boundary at the page level — wrap the component that uses it in `<Suspense>` inside the default export
- Never import `next-auth/react` in a server component file — "React Context is unavailable in Server Components"
- `SessionProvider` lives in `src/app/providers.tsx` only

## Design system

### Color rule (enforced by `.claude/hooks/color-token-check.sh` — a saved file that
### violates this is auto-blocked)

Every color must resolve to a `--bcc-*` custom property from `src/app/globals.css`.
Never hardcode a **literal** color value — a raw hex (`#f05a28`), an `rgb()`/`hsl()`
literal, or a named Tailwind palette class (`text-red-500`, `bg-white`, `border-yellow-400`).
Referencing a token is always fine, including inline: `style={{ color: "var(--bcc-accent)" }}`
and Tailwind arbitrary values `text-[var(--bcc-accent)]` are normal and expected,
especially for dynamic/conditional colors. What's banned is the literal standing in
for a token — not the inline `style` prop itself. A hardcoded hex never flips with
light/dark; that's why it looks broken in the other theme.

**Page chrome** (headers, backgrounds, titles, buttons, nav, borders, body text) uses
only:
- `--bcc-primary` / `--bcc-secondary` — the two brand colors (matching the logo: blue + orange)
- `--bcc-accent` / `--bcc-accent-subtle` — whichever brand color the user selected via
  the theme switcher; use for anything tracking that choice (active states, highlights,
  CTAs, selected tabs) — never a hardcoded primary/secondary
- `--bcc-bg` / `--bcc-surface` / `--bcc-border` / `--bcc-border-light` — backgrounds, dividers
- `--bcc-text` / `--bcc-text-secondary` / `--bcc-text-muted` / `--bcc-text-inverse` — text scale

All of these flip correctly with `[data-theme]` light/dark.

**Do NOT use `--bcc-safety` / `--bcc-weld` / `--bcc-verified` / `--bcc-blueprint` in page
chrome.** These are the trading-card "cardstock paper" aesthetic, not brand colors, and
they leak into headers/backgrounds/titles where they don't belong. They are allowed
**only** in trading-card FACE components under `src/components/cards/` (`CardFrontFace`,
`CardBackFace`, `CardFactory`, etc.). Nowhere else.

**Already-tokenized semantic colors** — use these, don't invent new hardcoded ones:
`--bcc-tier-{common,uncommon,rare,legendary}` (card rarity),
`--bcc-trust-{risky,caution,neutral,trusted,elite}` (RankChip trust-band dot),
`--bcc-type-{validator,project,nft,dao}` (operator type badges), `--bcc-stoke-ash`
(Stoke ember), `--bcc-{success,warning,danger,info}` (status).

Need a color that isn't a token yet? Add a new `--bcc-*` token in `globals.css` — same
pattern as the ones above; never hardcode it in the component. Genuine exceptions (e.g.
Satori OG-image code in `src/lib/og/`, which can't read CSS vars) carry an inline
`color-token-guard:allow — <reason>` marker on the same or preceding line.

**What the guard mechanically enforces vs. what's on you:** the hook blocks hardcoded
literals (hex, `rgb()/hsl()` literals, named Tailwind palette classes, `bg-white`) and the
brand-namespaced `--bcc-safety/-weld/-verified/-blueprint` outside `src/components/cards/`.
It does **not** flag the workshop aesthetic *classes* (`text-safety`, `text-cardstock`,
`text-ink`, `bg-paper`, …) — those are used ~1800× across the current chrome as the
"blue-collar workshop" design language, so a regex can't police them without flagging the
whole UI. Keeping the caution-tape (`safety`/`weld`) look out of page chrome per the rule
above is therefore on you, not the hook. Pulling the cardstock aesthetic out of chrome is
a deliberate redesign, not a lint fix.

**Dark-mode gotcha:** don't put the fixed cardstock ink (`text-ink` `#0f0d09`, `text-ink-soft`)
on a *theme* surface (`bcc-panel`/`bg-bcc-surface`) — it stays near-black while the surface
flips dark, so it's invisible in dark mode. Use the theme text scale (`text-bcc-text`,
`text-bcc-text-secondary`) on theme surfaces; reserve `text-ink` for the fixed cardstock/paper
surfaces (card faces) it's designed for.

### Other
- Glass effect uses the blur-layer sibling pattern — never add `backdrop-filter` to an element whose children also need `backdrop-filter`
- Font variables: `--font-stencil`, `--font-serif`, `--font-mono`, `--font-script`
- Theme: light/dark via `[data-theme]` on `<html>`, accent via `[data-accent="primary"|"secondary"]`

## Git
- Commit messages: `type(scope): description`, imperative mood, no trailing period — optional em-dash for extra detail
- No `Co-Authored-By` attribution
- Run `npm run typecheck` before committing — the strict tsconfig flags above catch errors plain `tsc` misses

## Code style
- Patch existing files with targeted diffs rather than full rewrites for small changes — state the reason explicitly if a rewrite is genuinely necessary
- Minimal inline comments — only for non-obvious logic, hidden constraints, or workarounds

## Workflow
- For multi-step features, write a plan and confirm before implementing
