# bcc-frontend

Headless Next.js frontend for the Blue Collar Crypto trust + identity stack.
Consumes the `bcc-trust` WordPress REST API at `/wp-json/bcc/v1/*`.

## Stack

- Next.js 15 (App Router)
- React 19
- TypeScript 5.9 (strict + `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, …)
- Tailwind v3.4
- TanStack Query v5
- NextAuth v4 (Credentials + Wallet providers)

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
│  ├─ globals.css      Tailwind + --bcc-* design tokens + utility primitives
│  ├─ providers.tsx    React Query + NextAuth SessionProvider (the only one)
│  ├─ (main)/          Authed/anon app shell — feed, profiles, entities,
│  │                   groups, locals, messages, disputes, admin, search…
│  ├─ (auth)/          Login / signup / verify flows
│  ├─ (legal)/         Terms / privacy / cookies
│  └─ api/             NextAuth handler, OG image routes, internal cron proxy
├─ components/         By domain: cards/, feed/, profile/, blog/, groups/,
│                      composer/, disputes/, onboarding/, settings/, …
├─ hooks/              ~70 React Query hooks (use*.ts), one per capability
└─ lib/
   ├─ api/             types.ts (contract mirror), client.ts (bcc/v1),
   │                   bcc-trust-client.ts (bcc-trust/v1), per-domain
   │                   *-endpoints.ts modules, cache-policy.ts
   ├─ permissions.ts   Defensive accessors for server capability blocks
   ├─ theme.ts         Theme/accent persistence (localStorage is truth)
   └─ auth.ts          NextAuth config (Credentials + wallet, JWT refresh)
```

Conventions, rationale, and the definition-of-done live in
[docs/frontend-doctrine.md](docs/frontend-doctrine.md) and [CLAUDE.md](CLAUDE.md).
