# Frontend Doctrine — bcc-frontend

**What this is:** the reasoning layer behind the rules in [CLAUDE.md](../CLAUDE.md)
and [README.md](../README.md). CLAUDE.md tells you *what* the rules are; this doc
tells you *why*, so that when you hit a case the rules don't cover, you can extend
the pattern instead of guessing. Written 2026-07-08 from a full audit of the
codebase, its git history, and the umbrella-repo docs.

**Rule of precedence:** where this doc and the code disagree, the code is right
and this doc has drifted — fix the doc in the same PR. Where this doc and a
file-header comment disagree, the file header wins (it's closer to the code).

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

## 5. Design system

- **`--bcc-*` tokens in [src/app/globals.css](../src/app/globals.css) are the
  only color source.** They cover accents, tier/trust/type colors, semantic
  states, the named worksite colors (`--bcc-safety`, `--bcc-weld`,
  `--bcc-verified`, `--bcc-blueprint`), layout dimensions, radii, transitions,
  blur, and shadows. A new color means a new token, never a hex literal.
- **The cardstock palette is quarantined.** `--cardstock`/`--ink`/`--concrete`
  survive only for the trading-card faces (`.bcc-card-face`, the hex crest) —
  a deliberate skeuomorphic island. Everything else was rethemed onto
  `--bcc-*` (see globals.css §"bcc-* variables instead of the old
  cardstock/concrete tokens"). Do not let cardstock leak back into general UI;
  the umbrella glossary §9 still describes the pre-retheme state.
- **Theme/accent:** `[data-theme="light"|"dark"]` and
  `[data-accent="primary"|"secondary"]` on `<html>`, applied via
  `applyTheme()` in [src/lib/theme.ts](../src/lib/theme.ts).
  **localStorage (`bcc-theme`/`bcc-accent`) is the source of truth** — any
  mount-time sync must read `getStoredTheme()/getStoredAccent()`, never the
  current DOM attribute. Reading the attribute drifts on standalone-mounting
  pages (hard refresh on `/privacy`, `/login`) because it only reflects the
  server-rendered default — the exact bug fixed on 2026-07-08 (`355db5f`).
- **Glass:** the blur-layer sibling pattern. `backdrop-filter` on a parent
  breaks `backdrop-filter` on its descendants, so the blur lives on a
  dedicated absolutely-positioned sibling layer, never on the content wrapper.
- Tailwind utilities only; no inline styles. Fonts via `--font-stencil`,
  `--font-serif`, `--font-mono`, `--font-script`.
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

**New component?**
1. Grep for a twin first (the umbrella's §11 reuse rule) — extend before create.
2. Server component unless it provably needs state/effects/browser APIs.
3. Renders in a feed? → `memo()` + stable props. Animates? → reduced-motion
   static fallback. Gated action? → `isAllowed()`.

**Where does an admin surface go?** (locked 2026-05-27, bcc-trust CLAUDE.md §8)
- Configuration / repair / low-frequency infrastructure operation → **wp-admin**.
- Daily operational workflow (moderation, trust review, disputes, monitoring)
  → **Next.js `/admin/*`**. Do not invent a third surface.

**New color / spacing / effect?** → new `--bcc-*` token in globals.css, then
use it. If it's card-face-internal, the cardstock island is the one exception.

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
- [ ] Mobile layout checked (the shell has distinct mobile nav; `--bcc-mobile-nav-h`)

## 8. Collaboration norms

- Never push to `main` in any bcc repo — branch, open a PR for review.
- Commits: `type(scope): description`, imperative, no trailing period, no
  `Co-Authored-By`.
- Patch existing files with targeted diffs; full rewrites need a stated reason.
- When you find frontend/backend drift (a rendered control the backend
  retired, a contract mismatch), don't silently "fix" either side — record it
  (the glossary documents drift explicitly) and raise it; the two sides are
  owned by different people day-to-day.
