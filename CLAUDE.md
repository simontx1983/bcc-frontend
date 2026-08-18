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

## Visual language

> **Canonical reference: [docs/frontend-doctrine.md §5](docs/frontend-doctrine.md).**
> That section was reconstructed in August 2026 from a full audit of the shipped
> frontend and is the authority. What follows is the condensed operational
> version — when the two disagree, the doctrine is right and this needs updating.

**Precedence.** The doctrine, the shared `--bcc-*` tokens in `src/app/globals.css`,
and the established reusable components are authoritative for future work. The
current implemented frontend is the evidence those rules were derived from. When
the docs don't cover a situation, inspect nearby representative screens and
repeated shared patterns before introducing anything new. **An isolated
implementation does not override the doctrine or establish a new convention.**

This is a preservation-and-extension brief, not a redesign licence. Don't
restyle shipped surfaces to match the docs, and don't change behavior, routes,
contracts, copy or terminology in the name of visual consistency.

### The look, in one paragraph

Flat, bordered, dense and micro-typographic. Separation comes from 1px and dashed
lines, not elevation — there are ~16 `shadow-*` utilities in the entire app.
Corners are tight (`rounded-sm` / `rounded-full`). Type does the heavy lifting:
uppercase wide-tracked mono labels, stencil headings and controls, serif prose.

### Typography — three faces, three jobs

| Face | Class | Role |
|---|---|---|
| Mono (JetBrains Mono) | `bcc-mono` | Labels, eyebrows, meta, counts, timestamps, handles, chips — the most-used class in the app |
| Stencil (Big Shoulders Stencil) | `bcc-stencil` | Headings, `h1`–`h3`, buttons, nav rows, tabs, widget heads |
| Serif (Fraunces) | `font-serif` | Prose: post bodies, bios, descriptions, inputs. The `<body>` default |

Never introduce a sans-serif stack — there effectively isn't one, and it reads as
foreign immediately. The rhythm is mono eyebrow → stencil heading → serif body.

**The signature micro-label:** `bcc-mono text-[10px] tracking-[0.18em]`
(also `text-[11px]`, and `0.16 / 0.2 / 0.24em`), uppercase. Canonical:
[`FilterChipRow`](src/components/ui/FilterChipRow.tsx).

### Two surface families — the binding rule

**Both are intentional and current. Neither is legacy, and neither is limited to
trading-card faces.**

| Family | Surfaces | Text scale | Borders |
|---|---|---|---|
| **A. Theme-aware app surfaces** | `.bcc-panel`, `bg-bcc-surface*`, `bg-bcc-input-bg`, page bg | `text-bcc-text`, `-secondary`, `-muted`, `-placeholder` | `border-bcc-border`, `-light`, `-strong` |
| **B. Fixed cream/ink paper** | `.bcc-paper` (+ `.bcc-paper-head`), `bg-cardstock*`, `bg-paper`, solid `bg-ink` | `text-ink`, `-soft`, `-ghost`; `text-cardstock` on ink | `border-cardstock-edge`, `border-cardstock`, `border-ink/…` |

> **The text palette must match its surface family.** Fixed ink on a fixed cream
> surface is correct. Fixed ink on a *theme* surface is the single most repeated
> bug in this repo — it reads fine in one theme and is invisible in the other.
> Theme text on a fixed cream surface is the same bug in reverse.
>
> Before picking a text color, name the surface you're painting on.

Family B is the "worksite paper" object: empty states, record sheets, bio blocks,
stream boxes, cover/avatar editors — things meant to read as a printed artifact
sitting on the app rather than as part of it.

### Color

- Every color resolves to a token in `src/app/globals.css`. Never a raw hex,
  `rgb()`/`hsl()` literal, or named Tailwind palette class (`text-red-500`,
  `bg-white`) — those don't flip with theme. Referencing a token inline is fine
  and normal: `style={{ color: "var(--bcc-accent)" }}`, `text-[var(--bcc-accent)]`.
- `--bcc-accent*` follows the viewer's `[data-accent]` choice — use it for active
  tabs, current nav rows, selected chips, primary CTAs, links. Never hardcode
  `--bcc-primary`/`--bcc-secondary` where the accent belongs.
- **`text-safety` is the established eyebrow and inline-alert color** on both
  surface families. `--weld` and `--blueprint` are likewise part of the shipped
  vocabulary. Use them where a nearby screen already does.
- **`--weld` is fixed-dark only, and is not a warning colour.** 11.84:1 on
  `--ink`, 1.64:1 on white — it belongs on caution tape, stencil stamps, grade
  badges and `.bcc-paper-head` kickers. Warning states use `--bcc-warning`
  (theme-scoped). Note the utility is `text-bcc-warning`: there is no bare
  `warning` key, so `text-warning` compiles to nothing.
- Semantic ramps are data, not decoration — don't invent parallels:
  `--bcc-trust-{risky,caution,neutral,trusted,proven}` (the only tier palette;
  `-elite` is a legacy alias for `proven`), `--kind-*` (card frame),
  `--bcc-type-{validator,project,nft,dao}`, `--bcc-{success,warning,danger,info}`,
  `--bcc-stoke-ash`.
- **Color the mark, not the word.** Where a chip/row carries a semantic hue, the
  dot, border and fill take the hue and the text stays neutral. Tinting the text
  makes legibility depend on where that hue lands against the surface — Proven
  violet went murky on a dark card exactly this way. Applies to `RankChip` and
  `CardStandingStrip`. Tier color is never the only signal; a label carries it too.
- The rarity palette (`--bcc-tier-{common,uncommon,rare,legendary}`) was retired
  in v1.57 with the vocabulary it served. Everything tier-colored uses the trust ramp.
- Need a color that isn't a token? Add a `--bcc-*` token, then reference it.
  Genuine exceptions (Satori OG code in `src/lib/og/`, which can't read CSS vars)
  carry an inline `color-token-guard:allow — <reason>` marker.

> A `color-token-check.sh` PostToolUse hook lives in the umbrella repo's
> `.claude/hooks/` and blocks literal colors on save. It does **not** police the
> workshop alias classes (`text-safety`, `text-ink`, `bg-cardstock`, …) — those
> are the app-wide design language. Surface-family discipline is on you.

### Structure, spacing, radii, shadows

- 1px borders are the primary divider; `border-dashed` is a real motif (see
  [`PageHero`](src/components/layout/PageHero.tsx), whose hero frame is a dashed box).
- Radii: `rounded-sm` (2px) and `rounded-full` are the working scale. Larger radii
  appear only on a few deliberately soft objects. Don't round things to "modernize".
- **Shadows are close to absent.** If you're reaching for one to separate two
  elements, use a border. `.bcc-paper` and the trading card carry their own
  because they're physical objects.
- Spacing rhythm actually in use: `gap-2`/`gap-3` (then `gap-1`/`1.5` tight,
  `gap-4`/`gap-6` between blocks); `px-3 py-1.5` chips, `px-4 py-2` standard;
  `p-5`/`p-6` panels, `p-8` centered empty states; `mt-1/2/3` within a block,
  `mt-4/6` between; `pb-24` on wide pages to clear the mobile nav.
- **Don't reach for `rounded-bcc-*` or `shadow-bcc-*`** — those Tailwind aliases
  have zero consumers. Same for the several zero-consumer `.bcc-*` classes listed
  in doctrine §5.13.4. Dead CSS is not the standard.

### Layout

- Three-column app shell; fixed viewport height, `body` scroll locked, each
  column scrolls independently. Center column caps reading width at 680px.
- **`.bcc-page-wide`** is the sanctioned escape hatch for grid pages
  (`/members`, `/directory`, `/communities`, `/validators`, `/mentors`,
  `/watching`); the page then owns its cap — `max-w-[1560px]` grids,
  `max-w-[1440px]` hero pages, with `px-4 sm:px-7`.
- [`PageHero`](src/components/layout/PageHero.tsx) is the hero grammar for every
  profile-style and group-style page. Compose it; don't hand-roll a parallel hero.
- Layering, established: MobileNav 200 · header 200 CSS / 300 in `SiteHeader` ·
  offcanvas scrim 390 / panel 400 · hovercard 500 · `Dialog` 550 · tour 4000.

### Interaction states

- **Hover** is small and cheap: background → `bcc-surface-hover`/`-active`, text
  `-secondary` → `text-bcc-text`, border → `border-bcc-border-strong`, or
  `hover:underline` on links. Not a transform, not a shadow bloom.
- **Active/selected** uses the accent (`bg-bcc-accent` + `text-bcc-text-inverse`
  chips; accent text + accent underline tabs; `bcc-accent-subtle` + accent bar nav).
  Always pair with the matching ARIA (`aria-current`, `aria-selected`, `aria-pressed`).
- **Disabled** is `disabled:opacity-50` + `cursor: not-allowed`. The product
  pattern is visible-but-disabled with an explanatory tooltip, never hidden.
- **Focus is global.** `globals.css` sets `:focus-visible { outline: 2px solid
  var(--bcc-accent); outline-offset: 2px }` in the base layer, so every
  interactive element gets a keyboard ring for free. **Don't add per-component
  `focus-visible:` ring utilities as a matter of course** — only when the element
  genuinely needs different treatment (e.g. the ring is clipped by an
  `overflow: hidden` ancestor), and say why.
- **Touch targets (contextual):** ~**44×44px** for primary navigation, dialog
  controls, form controls, important actions and standalone icon buttons.
  **36px is the sanctioned compact exception** for established dense repeated
  controls — filter chips, tag chips, pager chips (`min-h-[36px]`, canonically
  `FilterChipRow`). Don't generalize 36px to ordinary or primary buttons.

### Motion

- Short, mostly color/background: `--bcc-transition-fast` 120ms, `-base` 200ms,
  `-slow` 360ms.
- **Reduced motion needs both layers where relevant.** `globals.css` carries a
  global `@media (prefers-reduced-motion: reduce)` that flattens durations —
  that covers decoration. Anything *structural* (slide-in sheet, fly-in,
  cross-fade, autoplaying loop) must also branch via `usePrefersReducedMotion()`
  or `motion-safe:`, and the fallback must be a **static state, never a shorter
  animation**. `Dialog` and `Skeleton` are the reference implementations.
- Animate `transform`/`opacity` only — never `box-shadow`, `filter` or layout
  properties per frame.
- Glass uses the **blur-layer sibling pattern** — never add `backdrop-filter` to
  an element whose children also need it. **`backdrop-filter` flattens a 3D
  transform context**: a rotating element and a glass surface can't share a host
  (the trading card ships opaque + real rotation on profile/directory, glass +
  cross-fade on the hovercard).

### Empty / loading / error

Every list, feed and grid defines all three. Reuse these shapes:

- **Empty** — the canonical centered sheet:
  `bcc-paper mx-auto max-w-2xl p-8 text-center` → `bcc-mono text-safety` eyebrow
  → `bcc-stencil text-3xl text-ink` heading → `font-serif italic text-ink-soft`
  body → a recovery action. Guidance copy plus a way out; never a blank panel,
  never a bare "0 results".
- **Loading** — [`SKELETON_CLASS` / `Skeleton`](src/components/ui/Skeleton.tsx),
  shaped by the caller so nothing shifts on arrival. Skeletons, not a spinner on
  a blank page; [`Spinner`](src/components/ui/Spinner.tsx) is inline/in-button only.
- **Error** — [`LoadFailure`](src/components/ui/LoadFailure.tsx): glyph,
  plain-language `role="alert"` message, real Retry. Inline field errors are
  `bcc-mono text-[11px] text-safety` with `role="alert"`.

### Display contexts are not app chrome

`bcc-ldg-*` (landing), `bcc-onb-*` (onboarding wizard) and `bcc-tour-*`
(coachmarks) are full-bleed display surfaces with their own grammar — and they
are where the `--bcc-font-size-*` / `--bcc-space-*` / `--bcc-display-btn-*`
scales are actually consumed. Don't import that grammar into app chrome, or
app-chrome density rules into them. Extend each on its own terms.

### Reuse before invention

1. **Open the nearest existing screen/component and match it** — structure, type
   roles, surface family, spacing, states. Required step, not a courtesy.
2. Check the shared primitives and extend rather than fork:
   [`Dialog`](src/components/ui/Dialog.tsx) (focus trap, ESC, focus return,
   scroll lock, body portal, bottom-sheet on phones / centered `md+`),
   `Skeleton` / `Spinner` / `LoadFailure`, `FilterChipRow`, `PagerNav`,
   `Lightbox`, `VerifiedBadge`, `PageHero`; and the classes `.bcc-panel`,
   `.bcc-paper` / `.bcc-paper-head`, `.bcc-widget`, `.bcc-btn` (+ `-primary` /
   `-outline` / `-ghost` / `-icon` / `-sm` / `-lg`), `.bcc-tab`, `.bcc-nav-item`,
   `.bcc-mono`, `.bcc-stencil`, `.bcc-avatar-*`, `.bcc-rank-chip`,
   `.bcc-header-modal`.
3. Introduce a new variant only when none fits — and say so in your summary:
   what you looked at, why it didn't fit.

### Restraint

No new design system, component library, CSS framework or icon set
(`lucide-react` + local SVG is what ships). No invented colors, faces, radii,
shadows, gradients or interaction patterns. No redesigning shipped surfaces to
match the docs. Visual guidance never outranks functional requirements, the REST
contract, accessibility, or established product terminology — if matching a
pattern would break one of those, the other side wins; raise it.

### Other mechanics

- Font variables: `--font-stencil`, `--font-serif`, `--font-mono`, `--font-script`
- Theme: light/dark via `[data-theme]` on `<html>`, accent via
  `[data-accent="primary"|"secondary"]`. **localStorage (`bcc-theme` /
  `bcc-accent`) is the source of truth** — mount-time sync reads
  `getStoredTheme()`/`getStoredAccent()`, never the current DOM attribute.
- Verify visual work in **both themes × both accents** (four combinations).

## Responsiveness (hard rule)

A component that reads fine at 1440px but breaks or misleads at 375px **is not
done.** Desktop and mobile must stay visually consistent — same type roles, same
surface families, same vocabulary, not a separate mobile style.

- **Breakpoints:** Tailwind defaults. Primary target **375px**; hard floor **360px**.
- **`sm:` and `md:` are the working prefixes** in components (`lg:` occasionally
  for grid splits). The shell's desktop collapse lives in `globals.css` media
  queries, not in utilities: ≤1279px left sidebar → 64px icon rail + right
  sidebar hidden; ≤767px (and ≤900px landscape) both sidebars hidden and the
  center column pads for the mobile nav; ≤599px the header drops its search
  track. Don't duplicate that logic in a component.
- **Never fix a small-screen layout with a breakpoint when structure will do it.**
  The card's action bar stacked three buttons to 132px inside a fixed 440px card
  under 640px, clipping the card — the fix was flex pills, not another breakpoint.
  Wrapping, flex pills, and `min-w-0` + `truncate` are the established tools.
- **Flag, don't silently ship.** If a layout decision has a real small-screen
  tradeoff, either resolve it with a genuinely responsive default, or surface it —
  an `AskUserQuestion` mid-build, or called out explicitly in the summary. Never
  ship a desktop-only choice quietly.
- **Playwright is sanctioned for this, by exception.** The standing rule is not to
  use the Playwright MCP (it burns tokens and leaves artifacts) — but checking a
  real mobile viewport is a legitimate reason to ask for it via
  `AskUserQuestion`, using the local test-account login.

**Mobile check-list** — run against anything you touch:
1. Horizontal overflow, especially inside fixed-size or `overflow: hidden` containers
2. App-shell collapse (sidebar → offcanvas) still reaches every destination
3. Type/element scale — does it shrink, or just clip?
4. Touch targets are actually tappable per the contextual rule above
5. `next/image` `sizes` matches the real rendered width
6. Narrow-width states: long names, long handles, big numbers, empty states

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
