/**
 * runtime-env.ts — "is this the production deployment?", for behaviour gates.
 *
 * Deliberately NOT the same question as `lib/seo/indexing.ts`. That module
 * answers "may a crawler index this?" and requires production env AND the
 * canonical host, because a staging domain attached to a production build
 * reports `VERCEL_ENV=production` and must not opt itself into the index.
 *
 * This module answers the narrower "is this production?", used to withdraw
 * developer affordances (the /onboarding `?preview=1` gate bypass). The two
 * differ in which direction they must fail:
 *
 *   indexing        fails CLOSED — unsure ⇒ not indexable
 *   this module     fails CLOSED — unsure ⇒ treated as production, so a
 *                   developer affordance stays OFF
 *
 * So `isProductionRuntime()` returns true for `VERCEL_ENV === "production"`
 * and false otherwise (preview, development, local, unset). The bypass reads
 * the negation, which means an environment we cannot identify never gets the
 * bypass — the safe direction for a control that skips a correctness gate.
 *
 * Host is deliberately not consulted. Staging-on-a-production-build reports
 * production here, which withdraws the bypass there too. That is the correct
 * bias: losing a debug affordance on staging costs nothing, while leaking it
 * into production is the defect being fixed.
 */

/** True only when this is running as a Vercel production deployment. */
export function isProductionRuntime(): boolean {
  return process.env["VERCEL_ENV"] === "production";
}

/**
 * True when developer-only affordances (the onboarding preview bypass) may
 * be honoured.
 *
 * POSITIVE identification, not `!isProductionRuntime()`. The negation fails
 * OPEN: a self-hosted or non-Vercel production deployment sets no
 * VERCEL_ENV at all, so "not production" would have been true there and the
 * bypass would have shipped enabled — the exact defect this module exists
 * to close, reintroduced by a different route.
 *
 * So an environment only qualifies if it says so:
 *   - VERCEL_ENV=preview or development   (Vercel's own non-prod values)
 *   - NODE_ENV=development                (`next dev`, and vitest)
 *
 * Anything else — VERCEL_ENV unset on a production build, a typo, a value
 * added by a future Vercel release, an empty string — is refused. Losing a
 * debug affordance in an environment we cannot identify costs nothing;
 * leaking it into one that turns out to be production is the whole risk.
 *
 * Deliberately reads no hostname. A host is user-controllable via proxies
 * and Host headers, and `lib/seo/indexing.ts` already documents why host is
 * not sufficient evidence of environment on its own.
 */
export function allowsDeveloperAffordances(): boolean {
  const vercelEnv = process.env["VERCEL_ENV"];
  if (vercelEnv === "preview" || vercelEnv === "development") return true;
  if (vercelEnv === "production") return false;
  // No VERCEL_ENV: only a declared development build qualifies.
  return vercelEnv === undefined && process.env["NODE_ENV"] === "development";
}
