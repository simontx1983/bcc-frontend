# bcc-frontend

Headless Next.js frontend for the Blue Collar Crypto trust + identity stack.
Consumes the `bcc-trust` WordPress REST API at `/wp-json/bcc/v1/*`.

## Stack

- Next.js 15 (App Router)
- React 19
- TypeScript 5.7+ (strict)
- Tailwind v3.4
- TanStack Query v5
- NextAuth v4 (Credentials + Wallet providers — wired in Phase 2)

## Architectural rule (locked)

**No business logic in this codebase.** Trust scores, reputation tiers,
card tiers, ranks, permissions, and feature-access flags all come
pre-computed from the API per §A2 / §L5 of the BCC plan. The frontend
renders what it's told. Any temptation to write `if (tier === 'elite')
return 'Legendary'` means the mapping should land on the server in the
view-model builder, not here.

## Local setup

```bash
cp .env.local.example .env.local
# fill in NEXT_PUBLIC_BCC_API_URL + NEXTAUTH_SECRET
npm install
npm run dev
```

Open http://localhost:3000.

### Backend prerequisites (WordPress side)

The bcc-trust plugin needs three things set before this frontend can
authenticate against it:

1. `wp-config.php` — define `BCC_FRONTEND_ORIGIN` to this app's origin
   (`http://localhost:3000` for local dev) so CORS + JWT `aud` allow it.
2. Apache/Nginx — forward the `Authorization` header to PHP. The exact
   rewrite is pinned in
   `wp-content/plugins/bcc-trust/app/Domain/Core/Support/BearerAuth.php`.
3. Seed data — at least one validator + builder + creator PeepSo page
   so `/onboarding/suggestions` returns something during the wizard.

## Layout

```
src/
├─ app/
│  ├─ layout.tsx       Root layout — fonts, providers, body chrome
│  ├─ page.tsx         Floor (zero-state placeholder for now)
│  ├─ globals.css      Tailwind + CSS custom properties + utility primitives
│  ├─ providers.tsx    React Query + NextAuth SessionProvider
│  └─ api/auth/[...nextauth]/route.ts   NextAuth handler (Phase 2 wave)
├─ lib/
│  ├─ env.ts           Typed env-var loader
│  └─ api/
│     ├─ types.ts      Envelope + endpoint TypeScript types
│     └─ client.ts     fetch wrapper (Bearer auth, envelope unwrap, error map)
└─ styles/             Reserved for future component-scoped styles
```

## What's NOT in this scaffold yet

These land in subsequent waves alongside their parent endpoints:

- NextAuth Credentials + Wallet providers
- `/login`, `/signup`, `/onboarding/*` route handlers
- Card components (`<ValidatorCard>`, `<CardFactory>`)
- Floor feed (`<FeedTabs>`, `<HighlightStrip>`)
- Binder UI
- Profile pages (`/u/[handle]`, `/v/[slug]`, `/c/[slug]`)
