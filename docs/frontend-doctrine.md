# Frontend Doctrine — bcc-frontend

**What this is:** the reasoning layer behind the rules in [CLAUDE.md](../CLAUDE.md)
and [README.md](../README.md). CLAUDE.md tells you *what* the rules are; this doc
tells you *why*, so that when you hit a case the rules don't cover, you can extend
the pattern instead of guessing. Written 2026-07-08 from a full audit of the
codebase, its git history, and the umbrella-repo docs.

**Rule of precedence:** the approved doctrine in this document, the shared design
tokens in `globals.css`, and the established reusable components are authoritative
for future work. The current implemented frontend supplied the evidence used to
establish this doctrine. When this document does not cover a new situation,
inspect nearby representative screens and repeated shared patterns before
introducing anything new. **An isolated implementation does not override the
doctrine or establish a new design convention.**

Two corollaries:

- A *repeated, deliberate* pattern the doctrine has not yet described is a gap in
  the doctrine — raise it and extend the doc. A *single* divergent file is a
  one-off, and copying it propagates a defect.
- For non-visual mechanics (transport, hooks, Next.js constraints), a file-header
  comment that contradicts this doc usually wins — it sits next to the code and
  documents a specific incident. Visual rules are the exception: they are settled
  here, not per-file.

---

## 0. The repo family — where truth lives

bcc-frontend is one of five sibling repos under `github.com/simontx1983/`:

| Repo | What it is |
|---|---|
| `Blue-collar-crypto` (umbrella) | Docs + guard scripts + Claude tooling. **No app code.** |
| `bcc-core` | WP infra plugin — ServiceLocator, Contracts, DB/log/crypto helpers. |
| `bcc-trust` | The backend — trust engine, disputes, on-chain (`app/Domain/{Core,Disputes,Onchain}/`), REST API. |
| `bcc-search` | Search plugin (vertical search endpoints). |
| `bcc-frontend` | This repo. **The only user-facing renderer.** |

Two on-disk layouts exist and both are legitimate:

- **Phillip's (umbrella) layout** — plugins nested inside a Local-by-Flywheel
  WordPress install, umbrella repo at the root. The umbrella's `.claude/` hooks
  and skills assume this layout.
- **Tia's (flat) layout** — the repos checked out side by side in one folder,
  with the umbrella cloned as a plain sibling (`Blue-collar-crypto/`).

The umbrella **docs** are layout-agnostic and canonical. Before inventing or
re-deriving anything cross-repo, read them:

| Question | Canonical doc (in the umbrella repo) |
|---|---|
| What does this term mean? (Rank, Vouch, Stoke, Watch, tier…) | `docs/glossary.md` — code-truth dictionary, includes known FE/BE drift |
| What does an endpoint return? | `docs/api-contract-v1.md` — the REST contract; a break is P0 |
| Which backend Domain owns a behavior? | `docs/domain-seams.md` |
| Is there a canonical implementation of X? | `docs/pattern-registry.md` |
| How do I verify a subsystem end-to-end? | `docs/GOLDEN_PATHS.md` |
| wp-config constants / env vars | `docs/environment.md` |
| Cron jobs | `docs/cron-registry.md` |

Do not duplicate their content here — link it. (That's the umbrella's own §11
rule and it applies to docs as much as code.)

---

## 1. The one architectural law

**No business logic on the client.** Trust scores, tiers, ranks, labels,
permissions, and feature-access flags arrive pre-computed in the server
view-model; the frontend renders what it's told.

*Why:* the trust engine is the product. If tier math or permission logic exists
in two codebases, they drift, and a drifted trust display is a trust-destroying
bug. It also keeps the contract honest: anything a mobile client will ever need
must already be server-computed.

The nuance a naive reading misses:

- **Allowed:** branching presentation on a server-provided enum —
  `card.card_tier === "legendary"` to mount the foil shimmer, or
  `var(--tier-${tier})` to pick a token. The server decided the value; the
  client decides pixels.
- **Forbidden:** deriving the value — mapping scores to tiers, computing
  labels, deciding permissions client-side.
- **Permissions** are read exclusively through the defensive accessors in
  [src/lib/permissions.ts](../src/lib/permissions.ts) (`isAllowed`, `unlockHint`,
  `reasonCode`) — never raw `obj.permissions.can_x.allowed` chains. The
  accessors degrade to "action hidden" instead of crashing when a field is
  missing (older mobile clients vs newer backends).

---

## 2. Data layer

### 2.1 Two namespaces, two envelopes, two clients

The backend exposes two REST namespaces whose envelopes evolved separately and
were never reconciled:

| Namespace | Envelope | Client function | File |
|---|---|---|---|
| `/wp-json/bcc/v1/*` (default) | `{ data, _meta }` | `bccFetch` / `bccFetchAsClient` | [src/lib/api/client.ts](../src/lib/api/client.ts) |
| `/wp-json/bcc-trust/v1/*` | `{ success: true, data }` | `bccTrustFetch` | [src/lib/api/bcc-trust-client.ts](../src/lib/api/bcc-trust-client.ts) |

New endpoints default to `bcc/v1`. Use `bccTrustFetch` only when the backend
route actually lives in `bcc-trust/v1` (OAuth, device fingerprint, some
controllers). Never hand-parse an envelope in a hook or component.

### 2.2 The `fetch()` allowlist

Raw `fetch()` is confined to boundary files. The complete list (update it here
when it genuinely grows):

- `src/lib/api/client.ts` — the bcc/v1 wrapper
- `src/lib/api/bcc-trust-client.ts` — the bcc-trust/v1 wrapper
- `src/lib/api/giphy-client.ts` — third-party Giphy API
- `src/lib/auth.ts` — NextAuth authorize/refresh (server-side)
- `src/lib/og/card-image.tsx` — satori OG-image asset fetches (server-side)
- `src/app/api/internal/cron/indexer-tick/route.ts` — cron proxy route

Everything else goes through the typed wrappers. The wrappers are deliberately
narrow: NextAuth owns token storage/refresh, React Query owns retry and cache,
the wrapper owns URL + bearer + envelope + typed errors. Don't let those
responsibilities leak across.

### 2.3 Hard-won transport rules

- **`credentials: "omit"` is load-bearing** in both clients. Sending cookies
  re-opened three empirically observed production failures on the
  Vercel→Hostinger/LiteSpeed chain (2026-05-21): a stale wp-admin cookie fires
  WP cookie-auth before BearerAuth → silent 401; the cookie splits the cache
  bucket; header weight can blow LiteSpeed's HTTP/2 header budget. Bearer JWT
  is the only credential this API uses.
- **401 on a previously-valid bearer clears the NextAuth session**
  (`signOut({ redirect: false })`) so calls go anonymous instead of looping on
  a dead token. Both clients implement this; keep them mirrored.
- **Silent refresh** exchanges a near/just-expired JWT via
  `POST /bcc/v1/auth/refresh` (Phase β.3 — see `client.ts` and the
  umbrella's `pattern-registry.md` "NextAuth token-refresh path").
- **Error contract:** every non-2xx throws `BccApiError`. UI branches on
  `err.code` (stable), never `err.message` (humanizable, may localize).

### 2.4 Caching posture

- **Authed/personalized fetches are never cached.** A viewer-specific response
  served to anyone else is the worst failure available; correctness beats speed.
- **Anonymous SSR reads** may pass `revalidate` =
  `ANON_SSR_REVALIDATE_SECONDS` (60s, [src/lib/api/cache-policy.ts](../src/lib/api/cache-policy.ts))
  — mirrors the backend's ~30s view-model cache.
- **OG image routes** use a 1h inline `export const revalidate` literal
  (route-segment config must be static, so it can't import the const). Social
  cards are cosmetic and expensive (satori); slow drift is harmless there.
- Client-side, **React Query is the only cache**. `staleTime` is tuned per
  data cadence — defaults are wrong for read-model data that regenerates on a
  known schedule.

### 2.5 Contract sync is a manual duty

[src/lib/api/types.ts](../src/lib/api/types.ts) is the consumer mirror of the
umbrella's `api-contract-v1.md`. The automated guards (`contract-parity-guard`,
`/api-contract-guard`) check the contract doc against the **PHP** routes —
**nothing automated checks the TypeScript side.** Any change touching a
view-model or endpoint must land as one logical changeset across: PHP builder →
`api-contract-v1.md` → `types.ts` (+ the hook). If you can only do the frontend
half, say so loudly in the PR body.

---

## 3. Hooks & state

- One hook per user-facing capability under `src/hooks/use*.ts`; the endpoint
  call itself lives in a per-domain module under `src/lib/api/*-endpoints.ts`.
  Hooks compose those modules; components consume hooks; components never call
  endpoint modules directly.
- Hooks return the React Query shape (`{ data, isLoading, error, … }`) — never
  invent a parallel loading state.
- `queryKey` covers **every** input that changes the response. `enabled` gates
  queries whose inputs aren't ready (avoid wasted anon requests on mount).
- **Server state lives in React Query; never mirror it into `useState`.**
  Local state is for ephemeral UI only (open/closed, draft text, hover).

---

## 4. Components

- **Server components by default.** `'use client'` only for state, effects, or
  browser APIs.
- Everything under `src/components/cards/` and `src/components/feed/` renders
  inside scrolling feeds: wrap in `memo()`, pass stable callbacks
  (`useCallback` upstream), no expensive inline derivations.
- **Every animation checks `usePrefersReducedMotion()`** and falls back to a
  **static** state — not a shorter animation.
- Next.js 15 tripwires (each has caused a Vercel build failure or runtime
  crash — the point of listing the incident is that "it compiles locally"
  proves nothing):
  - `useSearchParams()` needs a page-level `<Suspense>` boundary.
  - `next-auth/react` must never be imported from a server component file.
  - `SessionProvider` lives in `src/app/providers.tsx` only.

---

## 5. Visual language

This is the canonical description of how the product looks and how to extend it.
It was reconstructed in August 2026 from a full audit of the shipped frontend —
every rule below is backed by a repeated pattern, not a single example. Other
guidance files (`CLAUDE.md`, the frontend agent/skill definitions) carry
condensed operational versions and defer here.

The goal is **preservation and consistent extension**, not a fresh style. Do not
redesign shipped surfaces to match this document, and do not treat this document
as permission to change behavior, routes, contracts, copy, or terminology.

### 5.1 Typography — three faces, three jobs

Type carries most of the design. Three faces do nearly all the work, and mixing
up their roles is the fastest way to make a new screen look foreign.

| Face | Class / var | Role |
|---|---|---|
| **Mono** — JetBrains Mono | `bcc-mono` / `--font-mono` | Every label, eyebrow, meta line, count, timestamp, handle, status readout, chip. Uppercase, letterspaced. **The single most-used class in the app.** |
| **Stencil** — Big Shoulders Stencil | `bcc-stencil` / `--font-stencil` | Display and interface headings: page/section headings, `h1`–`h3`, button labels, nav rows, tabs, widget headers, avatar initials. 800 weight, uppercase, tight leading. |
| **Serif** — Fraunces | `font-serif` / `--font-serif` | Reading matter: post bodies, bios, descriptions, prose paragraphs, form inputs. This is the `<body>` default. Frequently `italic` for secondary/explanatory prose. |

Rules:

- `h1`–`h3` already get stencil and `h4`–`h6` already get serif from the base
  layer in `globals.css`. Don't restate it; don't fight it.
- Never introduce a sans-serif system stack. There is effectively no
  `font-sans` in this codebase, and adding one reads instantly as foreign.
- `--font-script` (Homemade Apple) is a rare signature accent. It has one
  consumer. Don't reach for it.
- A screen that is all-mono or all-serif is wrong. The rhythm is:
  mono eyebrow → stencil heading → serif body.

### 5.2 The micro-label idiom

The signature element of this UI is a tiny, wide-tracked, uppercase mono label.
It appears hundreds of times and is the thing to reproduce when a new surface
needs to feel native.

```
bcc-mono text-[10px] tracking-[0.18em]     ← the default
bcc-mono text-[11px] tracking-[0.16em]     ← slightly larger / denser contexts
bcc-mono text-[10px] tracking-[0.2em]      ← section labels above a control group
bcc-mono text-[10px] tracking-[0.24em]     ← the widest, for standalone captions
```

Canonical implementations:
[`FilterChipRow`](../src/components/ui/FilterChipRow.tsx) (label + chip),
[`members/page.tsx`](<../src/app/(main)/(app)/members/page.tsx>) (eyebrow + empty state).

- Label text is uppercase. Either write it uppercase or `.toUpperCase()` it —
  both are established.
- The tracking scale in use is `0.16 / 0.18 / 0.2 / 0.24em`. Pick from those.
  Values outside that set exist in two or three files and are not a standard.
- `bcc-mono` already sets family, 12px and `0.08em`; the utility classes above
  intentionally override size and tracking. That layering is normal here.

### 5.3 Two surface families (binding)

This is the most important structural rule in the visual system, and the one
most often broken by someone new to the codebase.

**Both families are intentional and current. Neither is legacy.**

**A. Theme-aware application surfaces** — the app chrome. Header, sidebars,
offcanvas, feed, panels, modals, inputs, widgets, most page backgrounds.

- Surface: `.bcc-panel`, `bg-bcc-surface`, `bg-bcc-surface-raised`,
  `bg-bcc-surface-hover`, `bg-bcc-input-bg`, or the page background.
- Text: **the theme scale only** — `text-bcc-text`, `text-bcc-text-secondary`,
  `text-bcc-text-muted`, `text-bcc-text-placeholder`.
- Borders: `border-bcc-border`, `-border-light`, `-border-strong`.
- These flip with `[data-theme]`.

**B. Fixed cream/ink paper surfaces** — the "worksite paper" object. Empty
states, record sheets, bio blocks, stream boxes, cover/avatar editors, and other
surfaces meant to read as a printed artifact sitting on the app rather than as
part of it.

- Surface: `.bcc-paper` (warm sheet with noise + vignette + its own shadow),
  `bg-cardstock`, `bg-cardstock-deep`, `bg-paper`, or a solid `bg-ink` block.
- Text: **the fixed ink scale only** — `text-ink`, `text-ink-soft`,
  `text-ink-ghost`; `text-cardstock` when the surface is dark ink.
- Borders: `border-cardstock-edge`, `border-cardstock`, `border-ink/…`.
- These do **not** flip with theme, and that is correct: the type is fixed
  *because the surface under it is fixed*.

> **The binding rule: the text palette must match its surface family.**
> Fixed ink on a fixed cream/ink surface is safe and correct. Fixed ink on a
> theme surface is the single most repeated bug in this repo's history — it
> reads fine in one theme and is invisible in the other. Theme text on a fixed
> cream surface is the same bug in reverse.
>
> Before choosing a text color, name the surface you are painting on.

Colors that are legitimately fixed on *either* family: `--safety` (see §5.4),
`--verified`, the trust ramp, the kind/type hues, and `--phosphor`. They were
picked to hold on both.

`.bcc-paper` is a real primitive with a `.bcc-paper-head` companion (ink bar,
safety-orange rule beneath). Use them together rather than rebuilding a sheet.

### 5.4 Color

- **Every color resolves to a token in [globals.css](../src/app/globals.css).**
  Never a raw hex, `rgb()`/`hsl()` literal, or a named Tailwind palette class
  (`text-red-500`, `bg-white`). A literal never flips with theme. Referencing a
  token inline — `style={{ color: "var(--bcc-accent)" }}` or
  `text-[var(--bcc-accent)]` — is normal and expected (§5.14).
- **Accent follows the user.** `--bcc-accent` / `-light` / `-dark` / `-subtle` /
  `-glow` resolve to whichever brand color the viewer selected via
  `[data-accent]`. Use the accent for anything that tracks that choice: active
  tab, current nav row, selected chip, primary CTA, focus ring, link color.
  Never hardcode `--bcc-primary` / `--bcc-secondary` for those.
- **Safety orange is the eyebrow and the inline alert.** `text-safety` on a
  `bcc-mono` label is the established micro-heading above a section or empty
  state, and the established color for inline validation/error text. It is part
  of the current vocabulary on both surface families — not a card-only color.
- **Blueprint / weld / cardstock** are likewise part of the shipped vocabulary
  (`bg-blueprint` for dark inset blocks, `--weld` for caution tape and the
  hi-vis labels on ink-backed paper chrome). Use them where a nearby screen
  already does; don't scatter them into surfaces that read as plain app chrome.
- **`--weld` is fixed-dark only — it is not a warning colour.** It is chosen
  *because* its backdrop is black: **11.84:1** on `--ink`, but **1.64:1** on
  white. Its home is caution tape, stencil stamps, grade badges and the
  kickers on `.bcc-paper-head`. Warning states use `--bcc-warning`, which is
  theme-scoped (5.02 light / 8.81 dark).

  Theme-scoping weld is not an option, and the arithmetic is worth keeping:
  any value dark enough for light theme lands **on** the black bar and breaks
  the consumers that currently pass — `--bcc-warning` light (`#b45309`), the
  nearest darkened amber, reads **3.87:1 on `--ink`** where weld reads 11.84.
  Both directions lose, so the token stays theme-blind and confined instead.
- **Semantic ramps are data, not decoration** — don't invent parallels:
  - `--bcc-trust-{risky,caution,neutral,trusted,proven}` — the trust band. The
    *only* tier palette. (`-elite` is a legacy alias for `proven`.)
  - `--kind-{member,validator,project,creator,community}` — card frame color.
  - `--bcc-type-{validator,project,nft,dao}` — operator type badges.
  - `--bcc-{success,warning,danger,info}` — status.
  - `--bcc-stoke-ash` — the cold Stoke ember.
- **Color the mark, not the word.** Where a chip or row carries a semantic hue,
  the dot / border / fill take the hue and the **text stays neutral**. Tinting
  the text makes each element's legibility depend on where its own hue lands
  against the surface. Applies to `RankChip` and `CardStandingStrip`.
- **Tier color is never the only signal.** A text label or class prefix must
  carry the same meaning for colorblind viewers.
- The rarity palette (`--bcc-tier-{common,uncommon,rare,legendary}`) was retired
  in v1.57 with the vocabulary it served. Everything tier-colored uses the trust
  ramp.
- Need a color that isn't a token? Add a `--bcc-*` token in `globals.css` and
  reference it. Genuine exceptions (Satori OG code in `src/lib/og/`, which can't
  read CSS vars) carry an inline `color-token-guard:allow — <reason>` marker.

### 5.5 Structure over decoration

Separation in this UI comes from **lines**, not from elevation.

- **1px borders are the primary divider.** `border` + `border-bcc-border` is the
  most common structural pairing in the codebase.
- **Dashed rules are a real motif** — `border-dashed` on a `-t` / `-b` edge, or
  a full dashed box for a hero region. See
  [`PageHero`](../src/components/layout/PageHero.tsx), whose entire hero frame is
  `border border-dashed border-cardstock-edge`.
- **Radii are tight.** `rounded-sm` (2px) and `rounded-full` are the working
  scale. `rounded-lg`/`xl`/`2xl` appear on a small number of deliberately
  soft objects (hovercards, glass modal panels, offcanvas identity card) — not
  as a default. Squared corners are part of the look; don't round things to
  "modernize" them.
- **Shadows are close to absent.** There are ~16 `shadow-*` utilities in the
  whole app. `.bcc-paper` and the trading card carry their own shadow because
  they are physical objects; almost nothing else should. If you are reaching for
  a shadow to separate two elements, use a border instead.
- No gradients, glows, or decorative effects beyond what already ships (the
  header's two brand-tinted radial washes, the center-column cursor glow, the
  card's kind wash, the landing/onboarding embers). Do not add new ones.

### 5.6 Spacing and density

The UI is dense. Use the rhythm already in place rather than the unused
`--bcc-space-*` aliases (those are consumed by the display contexts in §5.12).

- Flex/grid gaps: `gap-2` and `gap-3` dominate; `gap-1` / `gap-1.5` for tight
  clusters, `gap-4` / `gap-6` between blocks.
- Control padding: `px-3 py-1.5` (chips, compact buttons), `px-4 py-2`
  (standard), `px-3 py-2`.
- Panel padding: `p-5` / `p-6`, `p-8` for centered empty states.
- Vertical rhythm: `mt-1` / `mt-2` / `mt-3` between related lines, `mt-4` /
  `mt-6` between blocks.
- Page bottoms clear the mobile nav with `pb-24` on wide pages.

### 5.7 Layout and shells

- **Three-column app shell** (`AppShell` → `.bcc-app-shell` / `.bcc-body` /
  `.bcc-col-*`): fixed viewport height, `body` scroll locked, each column
  scrolls independently. The header is fixed; columns pad down by
  `--bcc-header-h` (60px).
- **The center column caps reading width at 680px** (`--bcc-content-max-w`)
  automatically.
- **`.bcc-page-wide` is the sanctioned escape hatch** for grid pages
  (`/members`, `/directory`, `/communities`, `/validators`, `/mentors`,
  `/watching`). The page then owns its own cap — `max-w-[1560px]` for full-bleed
  grids, `max-w-[1440px]` for hero pages — with `px-4 sm:px-7`.
- **`PageHero` is the hero grammar** for every profile-style and group-style
  page: dashed box containing card + action cluster, optional full-width
  `belowHero` slot, then trust panel, then tabs. Compose it; don't hand-roll a
  parallel hero.
- Content-width helpers in use: `max-w-2xl` (centered empty states, dialogs),
  `max-w-3xl`, `max-w-md` (auth cards), `max-w-prose`.
- **Layering** (established, don't invent new bands): MobileNav 200 · header 200
  in CSS / 300 in `SiteHeader` · offcanvas scrim 390 / panel 400 · hovercard 500
  · `Dialog` 550 · tour overlay 4000. `Dialog` portals to `document.body` on
  purpose — an ancestor with `backdrop-filter` would otherwise contain its fixed
  backdrop.

### 5.8 Responsive behavior

**A component that reads fine at 1440px but breaks or misleads at 375px is not
done.** Desktop and mobile must stay visually consistent — same type roles, same
surface families, same vocabulary, not a separate mobile style.

- **Primary target 375px; hard floor 360px.** Breakpoints are Tailwind defaults.
- **`sm:` and `md:` are the working prefixes** in components (`lg:` occasionally
  for grid splits). The shell's desktop collapse is owned by media queries in
  `globals.css`, not by utilities: ≤1279px left sidebar → 64px icon rail and
  right sidebar hidden; ≤767px (and ≤900px landscape) both sidebars hidden and
  the center column pads for the mobile nav; ≤599px the header drops its search
  track. Don't duplicate that logic in a component.
- **Fix small screens with structure, not another breakpoint.** Wrapping,
  flex pills, and `min-w-0` + `truncate` are the established tools. A stacked
  fixed-width layout that clips is a structure bug.
- Mobile checklist for anything you touch:
  1. Horizontal overflow, especially inside fixed-size or `overflow: hidden`
     containers
  2. App-shell collapse (sidebar → offcanvas) still reaches every destination
  3. Type/element scale shrinks rather than clipping
  4. Touch targets are genuinely tappable (§5.9)
  5. `next/image` `sizes` matches the real rendered width
  6. Narrow-width states: long names, long handles, big numbers, empty states
- Checking a real mobile viewport is a legitimate reason to ask for the
  Playwright MCP via `AskUserQuestion`, by exception to the standing
  don't-use-Playwright rule.

### 5.9 Interaction states

- **Hover** is a small, cheap change: background steps to `bcc-surface-hover` /
  `-active`, text steps from `-secondary` to `text-bcc-text`, border steps to
  `border-bcc-border-strong`, or `hover:underline` on text links. Not a
  transform, not a shadow bloom.
- **Active/selected** uses the accent: `bg-bcc-accent` + `text-bcc-text-inverse`
  for a selected chip, accent text + accent bottom-border for the current tab,
  `bcc-accent-subtle` background + accent text + a 3px accent bar for the
  current nav row. Pair every visual selected state with the matching ARIA
  (`aria-current="page"`, `aria-selected`, `aria-pressed`).
- **Disabled** is `disabled:opacity-50` (or `.bcc-btn`'s `0.45`) plus
  `cursor: not-allowed`. The established product pattern is
  **visible-but-disabled with an explanatory tooltip**, never a hidden control.
- **Focus is global.** `globals.css` sets
  `:focus-visible { outline: 2px solid var(--bcc-accent); outline-offset: 2px }`
  in the base layer, so every interactive element gets a keyboard ring for free.
  **Do not add per-component `focus-visible:` ring utilities as a matter of
  course** — only when an element genuinely needs a different treatment (e.g.
  the ring is clipped by an `overflow: hidden` ancestor), and say why.
- **Touch targets — contextual rule.** Approximately **44×44px** for primary
  navigation, dialog controls, form controls, important actions, and standalone
  icon buttons. **36px is the sanctioned compact exception** for established
  dense repeated controls: filter chips, tag chips, pager chips, and similar
  (`min-h-[36px]`, canonically `FilterChipRow`). Do not generalize 36px to
  ordinary buttons or primary controls.

### 5.10 Motion

- Transitions are short and mostly color/background:
  `--bcc-transition-fast` 120ms, `-base` 200ms, `-slow` 360ms; utilities
  `transition`, `transition-colors`, `transition-opacity`.
- **Reduced motion is enforced two ways and you need both where relevant.**
  `globals.css` carries a global
  `@media (prefers-reduced-motion: reduce)` that flattens animation and
  transition durations. That handles decoration. Anything *structural* —
  a slide-in sheet, a fly-in, a cross-fade, an autoplaying loop — must also
  branch in code via [`usePrefersReducedMotion()`](../src/hooks/usePrefersReducedMotion.ts)
  or a `motion-safe:` prefix, and the fallback must be a **static state, never a
  shorter animation**. `Dialog` and `Skeleton` are the reference implementations.
- Animate `transform` / `opacity` only. Never animate `box-shadow`, `filter`, or
  layout properties per frame.
- **`backdrop-filter` flattens a 3D transform context**, and a parent's
  `backdrop-filter` breaks its descendants'. Glass therefore uses the
  **blur-layer sibling pattern**: an absolutely-positioned sibling carries the
  blur, never the content wrapper. A rotating element and a glass surface cannot
  share a host — pick one.

### 5.11 Empty, loading and error states

Every list, feed and grid defines all three. These shapes already exist — reuse
them instead of inventing a fourth.

- **Empty — the canonical centered sheet:**
  ```
  bcc-paper mx-auto max-w-2xl p-8 text-center
    → bcc-mono text-safety            eyebrow  ("QUIET FLOOR", "NO MATCHES")
    → bcc-stencil text-3xl text-ink   heading
    → font-serif italic text-ink-soft body
    → a recovery action (reset filter / broaden / go somewhere useful)
  ```
  Guidance copy plus a way out, never a blank panel and never a bare "0 results".
- **Loading —** [`SKELETON_CLASS` / `Skeleton`](../src/components/ui/Skeleton.tsx)
  (`bcc-panel opacity-40 motion-safe:animate-pulse`), shaped by the caller so it
  matches the real content box and nothing shifts on arrival. Skeletons, not a
  spinner on a blank page. [`Spinner`](../src/components/ui/Spinner.tsx) is for
  inline/in-button "working…" only.
- **Error —** [`LoadFailure`](../src/components/ui/LoadFailure.tsx): muted glyph,
  plain-language `role="alert"` message, real Retry button. Inline field errors
  are `bcc-mono text-[11px] text-safety` with `role="alert"`.

### 5.12 Display contexts are not app chrome

Three namespaces are full-bleed display surfaces with their own internal
grammar, deliberately separate from the app shell:

- `bcc-ldg-*` — the guest landing page (`(marketing)/welcome`)
- `bcc-onb-*` — the onboarding wizard
- `bcc-tour-*` — the coachmark/tour overlay

They are where the `--bcc-font-size-*`, `--bcc-space-*` and
`--bcc-display-btn-*` scales are actually consumed, and where fluid `clamp()`
display type lives. **Do not import that grammar into app chrome, and do not
apply app-chrome density rules to them.** When extending one of them, follow its
own established pattern.

### 5.13 Reuse before invention

Before building a new screen or component:

1. **Inspect the nearest existing UI.** Open the sibling screen or the closest
   component in the same domain folder and match its structure, type roles,
   surface family, spacing and states. This is a required step, not a courtesy.
2. **Check the shared primitives** and extend one rather than forking it:
   - [`Dialog`](../src/components/ui/Dialog.tsx) — every modal. Focus trap, ESC,
     focus return, scroll lock, body portal, bottom-sheet on phones / centered on
     `md+`, optional `glass` / `bare` / `center` / `mobileSheet` variants.
   - [`Skeleton` / `SKELETON_CLASS`](../src/components/ui/Skeleton.tsx),
     [`Spinner`](../src/components/ui/Spinner.tsx),
     [`LoadFailure`](../src/components/ui/LoadFailure.tsx)
   - [`FilterChipRow`](../src/components/ui/FilterChipRow.tsx) — labelled
     single-select chip rows
   - [`PagerNav`](../src/components/ui/PagerNav.tsx) — PREV / PAGE x / y / NEXT
   - [`Lightbox`](../src/components/ui/Lightbox.tsx),
     [`VerifiedBadge`](../src/components/ui/VerifiedBadge.tsx)
   - [`PageHero`](../src/components/layout/PageHero.tsx) — profile/group hero
   - `.bcc-panel`, `.bcc-paper` / `.bcc-paper-head`, `.bcc-widget`,
     `.bcc-btn` + `-primary` / `-outline` / `-ghost` / `-icon` / `-sm` / `-lg`,
     `.bcc-tab`, `.bcc-nav-item`, `.bcc-mono`, `.bcc-stencil`, `.bcc-avatar-*`,
     `.bcc-rank-chip`, `.bcc-header-modal`
3. **Introduce a new variant only when no existing one fits**, and say so
   explicitly in the summary — what you looked at and why it didn't fit.
4. Several classes defined in `globals.css` have **zero consumers**
   (`.bcc-card-interactive`, `.bcc-glass`, `.bcc-post*`, `.bcc-input`,
   `.bcc-label`, `.bcc-field`, `.bcc-badge*`, `.bcc-tabs`, `.bcc-divider`), as do
   the `rounded-bcc-*` and `shadow-bcc-*` Tailwind aliases. They are dead CSS,
   not the standard — don't adopt them because they look official.

### 5.14 Tailwind, inline styles, and tokens

- Tailwind utilities are the default vehicle.
- **Inline `style` is permitted and normal when it carries a token or a dynamic
  value** — `style={{ background: "var(--bcc-glass-bg-solid)" }}`,
  a computed width, a mouse-tracked position. `Dialog`, `AppShell` and
  `MobileNav` all do this deliberately. What is banned is the **literal color
  standing in for a token**, not the `style` prop itself.
- Arbitrary values (`text-[10px]`, `tracking-[0.18em]`,
  `text-[var(--bcc-text-secondary)]`, `max-w-[1560px]`) are established practice
  here. Use the values the app already uses; don't mint new ones on a whim.
- Fonts are referenced via `--font-stencil` / `--font-serif` / `--font-mono` /
  `--font-script`, loaded by `next/font` in `layout.tsx`.

### 5.15 Restraint (hard limits)

- No new design system, component library, CSS framework, or icon set.
  `lucide-react` + local SVG is what ships.
- No invented colors, type faces, radii, shadows, gradients, or interaction
  patterns. Extend the tokens; don't add a parallel vocabulary.
- No redesigning shipped surfaces to match this document.
- No rewriting application components merely to make them conform.
- Visual guidance never outranks functional requirements, the REST contract,
  accessibility, or established product terminology. If matching the visual
  pattern would break one of those, the other side wins — raise it.

### 5.16 Known one-offs — not rules

Present in the tree, deliberately excluded from the doctrine. Don't copy them,
and don't cite them as precedent:

- [`IndexerStateChip`](../src/components/onchain/IndexerStateChip.tsx) — the only
  file that puts `text-ink-*` on an unspecified surface (and computes an unused
  `stateColor`). A latent §5.3 violation, not a pattern.
- Single-use oddities: `shadow-[3px_3px_0_0_var(--safety)]`, `rounded-[3px]`,
  `text-[8.5px]`, `text-[9.5px]`, `text-[44px]`, `border-4`, `border-0`.
- The tracking tail — `0.04em`, `0.1em`, `0.22em`, `0.25em`, `0.3em` — versus the
  `0.16 / 0.18 / 0.2 / 0.24em` core in §5.2.
- The zero-consumer classes and aliases listed in §5.13.4.

### 5.17 Theme, accent and copy mechanics

- **Theme/accent:** `[data-theme="light"|"dark"]` and
  `[data-accent="primary"|"secondary"]` on `<html>`, applied via
  `applyTheme()` in [src/lib/theme.ts](../src/lib/theme.ts).
  **localStorage (`bcc-theme`/`bcc-accent`) is the source of truth** — any
  mount-time sync must read `getStoredTheme()/getStoredAccent()`, never the
  current DOM attribute. Reading the attribute drifts on standalone-mounting
  pages (hard refresh on `/privacy`, `/login`) because it only reflects the
  server-rendered default — the exact bug fixed on 2026-07-08 (`355db5f`).
- Verify visual work in **both themes × both accents** (four combinations).
- Operator-facing copy is subject to the **cadence-pressure policy** (no
  nudge-shaped strings: "haven't", "streak", "days since you"…). The umbrella's
  `scripts/cadence-pressure-guard.sh` scans for violations; benign matches get
  an inline `cadence-pressure-guard:allow — <reason>` marker.

---

## 6. Decision trees

**Need data the UI doesn't have yet?**
1. Check `api-contract-v1.md` §4 and `types.ts` — does the endpoint exist?
2. Exists → add/extend the per-domain endpoint module + hook. Copy the shape of
   the nearest existing pair.
3. Doesn't exist → it's a backend change first (view-model builder → contract
   doc → types.ts → hook, one changeset). Never compute the missing field
   client-side "for now" — that's how business logic leaks in.

**New component or screen?**
1. Grep for a twin first (the umbrella's §11 reuse rule) — extend before create.
2. **Open the nearest existing screen/component and match it** (§5.13): type
   roles, surface family, spacing, states. Check the shared primitives before
   writing a new one.
3. Name the surface family you're painting on (§5.3), then pick the text scale
   that belongs to it. Never mix.
4. Server component unless it provably needs state/effects/browser APIs.
5. Renders in a feed? → `memo()` + stable props. Animates? → reduced-motion
   static fallback. Gated action? → `isAllowed()`.
6. Define empty / loading / error up front from the §5.11 shapes.
7. Check it at 375px before calling it done (§5.8).

**Where does an admin surface go?** (locked 2026-05-27, bcc-trust CLAUDE.md §8)
- Configuration / repair / low-frequency infrastructure operation → **wp-admin**.
- Daily operational workflow (moderation, trust review, disputes, monitoring)
  → **Next.js `/admin/*`**. Do not invent a third surface.

**New color / spacing / effect?** → first check whether an existing token or an
established value from §5.2/§5.5/§5.6 already covers it; reuse beats minting.
If it genuinely isn't covered, add a `--bcc-*` token in globals.css and
reference it — never a literal in a component. New visual *effects* (gradients,
glows, shadows) are out of scope by default under §5.15.

---

## 7. Definition of done

Before declaring frontend work finished:

- [ ] `npm run typecheck` passes (the strict flags catch what plain `tsc` misses)
- [ ] `npx eslint .` clean; any suppression carries an inline reason
- [ ] No new `fetch()` outside the §2.2 allowlist; no `as any` outside `types.ts`
- [ ] Verified in **both themes × both accents** (four combinations)
- [ ] Animations have a static reduced-motion fallback
- [ ] Feed/card components memoized with stable props
- [ ] `useSearchParams()` users wrapped in `<Suspense>`
- [ ] API touched? → contract doc + `types.ts` + hook moved together (§2.5)
- [ ] Operator-facing copy? → cadence-pressure clean or `allow`-marked
- [ ] Mobile layout checked at **375px** (the shell has distinct mobile nav;
      `--bcc-mobile-nav-h`), and it reads as the same design as desktop (§5.8)

Visual checks (§5):

- [ ] Text palette matches its surface family — theme scale on theme surfaces,
      ink scale on cream/ink paper surfaces (§5.3)
- [ ] Every color resolves to a token; no hex / `rgb()` / named-Tailwind-palette
      literals (§5.4)
- [ ] Type roles respected: mono for labels, stencil for headings/controls,
      serif for prose (§5.1–5.2)
- [ ] No new shadow, large radius, gradient or decorative effect that the
      surrounding UI doesn't already use (§5.5, §5.15)
- [ ] Reused an existing shared primitive, or stated why none fit (§5.13)
- [ ] Empty / loading / error states present and drawn from the §5.11 shapes
- [ ] Interaction states: hover, active/selected (with matching ARIA), disabled;
      touch targets sized per the §5.9 contextual rule; **no redundant
      per-component `focus-visible:` ring** — the global rule already covers it

## 8. Collaboration norms

- Never push to `main` in any bcc repo — branch, open a PR for review.
- Commits: `type(scope): description`, imperative, no trailing period, no
  `Co-Authored-By`.
- Patch existing files with targeted diffs; full rewrites need a stated reason.
- When you find frontend/backend drift (a rendered control the backend
  retired, a contract mismatch), don't silently "fix" either side — record it
  (the glossary documents drift explicitly) and raise it; the two sides are
  owned by different people day-to-day.
