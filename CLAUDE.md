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
- Use `--bcc-*` CSS tokens from `src/app/globals.css` — never hardcode hex/colors
- Tailwind utility classes only, no inline styles
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
