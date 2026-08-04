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

### Color rule (NOT machine-enforced — this one is on you)

> **2026-08-04:** this section used to say the rule was enforced by
> `.claude/hooks/color-token-check.sh` and that a violating save was auto-blocked.
> That hook does not exist in this repo — it has never been committed, and the only
> hook present is `.claude/hooks/stop-typecheck.sh`. Assume **nothing** below is
> caught automatically.

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

**Do NOT use `--bcc-safety` / `--bcc-weld` / `--bcc-blueprint` in page chrome.** These
are the old "cardstock paper" aesthetic, not brand colors, and they leak into
headers/backgrounds/titles where they don't belong.

**The trading-card carve-out is GONE (2026-08-04).** This rule used to exempt
`src/components/cards/`, because the card was a cream cardstock object with its own
fixed palette. The card is now a brand-native, theme-aware component built on
`--bcc-*` plus the card tokens below, so there is no longer anywhere in the app that
gets to use the cardstock palette. `--bcc-verified` remains legitimate anywhere as
the semantic "verified" green (the Vouch pill, verification dots) — it just isn't an
aesthetic.

**Already-tokenized semantic colors** — use these, don't invent new hardcoded ones:
`--bcc-trust-{risky,caution,neutral,trusted,proven}` (trust band — drives the RankChip
dot AND its pill tint; `--bcc-trust-elite` is a legacy alias for `proven` kept only
until bcc-trust ships the rename), `--bcc-type-{validator,project,nft,dao}` (operator
type badges), `--bcc-stoke-ash` (Stoke ember), `--bcc-{success,warning,danger,info}`
(status).

The rarity palette (`--bcc-tier-{common,uncommon,rare,legendary}`) was **retired in
v1.57** along with the vocabulary it served — it had four values for a five-value axis,
so `risky` had no color at all. Everything tier-colored uses the trust ramp.

**Trading-card tokens** (`src/components/cards/` only): `--kind-{member,validator,
project,creator,community}` is the card's frame color — data, not chrome, so it does
NOT flip with theme. `--card-{surface,border,dot,lift,shadow}` are the theme-aware card
surface. Note these do not carry the `--bcc-` prefix, which is a deliberate exception
the card redesign introduced; don't extend the pattern elsewhere without deciding to.

Need a color that isn't a token yet? Add a new `--bcc-*` token in `globals.css` — same
pattern as the ones above; never hardcode it in the component. Genuine exceptions (e.g.
Satori OG-image code in `src/lib/og/`, which can't read CSS vars) carry an inline
`color-token-guard:allow — <reason>` marker on the same or preceding line.

**Nothing here is machine-checked.** The workshop aesthetic *classes* (`text-safety`,
`text-cardstock`, `text-ink`, `bg-paper`, …) are still used ~1800× across the current
chrome as the "blue-collar workshop" design language, so no regex could police them
without flagging the whole UI anyway. Keeping that look out of page chrome is on you.
Pulling the cardstock aesthetic out is a deliberate redesign, not a lint fix.

**Dark-mode gotcha — the single most repeated bug in this repo.** Any FIXED color on a
THEME surface is a latent dark-mode bug. It stays put while the surface flips, so it
reads fine in one theme and is invisible in the other. This has now bitten at least
three ways:
- `text-ink` (`#0f0d09`) / `text-ink-soft` on `bcc-panel` / `bg-bcc-surface`
- the same classes on the card once the card stopped being cardstock
- `crest.monogram_color` — a **server-supplied** fixed hex, picked against cream paper,
  rendering avatar initials near-black on a dark card

Use the theme text scale (`text-bcc-text`, `text-bcc-text-secondary`, `text-bcc-text-muted`).
A fixed hex is only safe on a surface that is itself fixed in both themes.

**Color the mark, not the word.** Where a chip/row carries a semantic color (trust tier,
verification, a barrier), the DOT, border and fill take the hue and the TEXT stays neutral
(`--bcc-text` / `--bcc-text-secondary`). Tinting the text makes each element's legibility
depend on where its own hue happens to sit against the surface — Proven violet went murky
on a dark card exactly this way. Applies to `RankChip` and `CardStandingStrip`.

### Other
- Glass effect uses the blur-layer sibling pattern — never add `backdrop-filter` to an element whose children also need `backdrop-filter`
- **`backdrop-filter` flattens a 3D transform context.** A rotating element and a glass surface cannot coexist — pick one per host (the trading card ships opaque + real rotation on the profile/directory, glass + cross-fade on the hovercard)
- Font variables: `--font-stencil`, `--font-serif`, `--font-mono`, `--font-script`
- Theme: light/dark via `[data-theme]` on `<html>`, accent via `[data-accent="primary"|"secondary"]`

## Responsiveness (hard rule)

> **Reconstructed 2026-08-04.** This section was added 2026-07-21 but only ever existed
> in the local, untracked copy of this file, so it was lost when the file was. The text
> below is rebuilt from the memory record of it — the substance is right, the original
> wording is gone.

A component that reads fine at 1440px but breaks or misleads at 375px **is not done**.

- **Breakpoints:** Tailwind defaults. Primary target **375px**; hard floor **360px**.
- **Flag, don't silently ship.** If a layout decision has a real small-screen tradeoff,
  either resolve it with a genuinely responsive default, or surface it — an
  `AskUserQuestion` mid-build, or called out explicitly in the summary. Never ship a
  desktop-only choice quietly.
- **Playwright is sanctioned for this, by exception.** The standing rule is not to use
  the Playwright MCP (it burns tokens and leaves artifacts) — but checking a real mobile
  viewport is a legitimate reason to ask for it via `AskUserQuestion`, using the local
  test-account login.

**Mobile check-list** — run against anything you touch:
1. Horizontal overflow, especially inside fixed-size or `overflow: hidden` containers
2. App-shell collapse (sidebar → offcanvas) still reaches every destination
3. Type/element scale — does it shrink, or just clip?
4. Touch targets are actually tappable (~44px), not hover-only affordances
5. `next/image` `sizes` matches the real rendered width
6. Narrow-width states: long names, long handles, big numbers, empty states

**Never fix a small-screen layout with a breakpoint when structure will do it.** The
card's action bar stacked three buttons to 132px inside a fixed 440px card under 640px,
clipping the card — the fix was flex pills, not another breakpoint.

## Git
- Commit messages: `type(scope): description`, imperative mood, no trailing period — optional em-dash for extra detail
- No `Co-Authored-By` attribution
- Run `npm run typecheck` before committing — the strict tsconfig flags above catch errors plain `tsc` misses

## Code style
- Patch existing files with targeted diffs rather than full rewrites for small changes — state the reason explicitly if a rewrite is genuinely necessary
- Minimal inline comments — only for non-obvious logic, hidden constraints, or workarounds

## Workflow
- For multi-step features, write a plan and confirm before implementing
- Never commit, push, or open a PR unless explicitly told to that turn — make the change and stop
- **Attempt backend work too.** A change in `bcc-trust` / `bcc-core` is in scope, not
  automatically Phillip's. Stop and raise it only when the blast radius is genuinely wide
  or the change is behaviour-critical (live capability/permission data, vote weighting,
  rate limiting, migrations over existing user rows) — then present the call and let Tia
  decide whether to proceed or hand it over. `php -l` every file touched; local PHPStan
  and PHPUnit can't run here (`composer install` doesn't resolve), so CI is the real gate
