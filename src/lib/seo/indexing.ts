/**
 * indexing.ts — the single answer to "may a crawler index this deployment?"
 *
 * Two signals are required, and neither is sufficient alone.
 *
 * `VERCEL_ENV === "production"` is not enough. A staging Vercel project, or a
 * staging custom domain attached to a production deployment, builds AS
 * production — so `stage.bluecollarcrypto.io` reports `VERCEL_ENV=production`
 * and would advertise itself to Google on that signal alone.
 *
 * The origin is not enough either. `appOrigin()` resolves NEXTAUTH_URL first
 * (see lib/app-origin.ts), so it reports whatever the deploy was configured
 * with. It answers "what URL does this app call itself?", never "which
 * environment is this?". Treating the two as one thing is the mistake this
 * module exists to prevent.
 *
 * So: production environment AND the exact canonical host. Everything else —
 * staging, previews, `*.vercel.app` project URLs, local, a missing
 * VERCEL_ENV, a malformed origin, any future host — fails closed.
 *
 * The host is a hardcoded constant, deliberately NOT an env var. An env var
 * is one more thing that can be set wrong on staging, and setting it wrong
 * opts staging INTO the index — the exact failure this guards. A constant
 * means a non-production host cannot opt itself in, whatever its env says.
 *
 * Mirrors the host-comparison idiom in lib/env.ts (`assertWordPressHost`),
 * which rejects the apex as an API base for the same three-host topology:
 *
 *   bluecollarcrypto.io        this frontend (Vercel)  <- the only indexable host
 *   cms.bluecollarcrypto.io    WordPress
 *   stage.bluecollarcrypto.io  staging
 *
 * `www.` is NOT included. It is not canonical today, and adding it here
 * would silently make two hostnames indexable for the same content.
 */

import { appOrigin } from "@/lib/app-origin";

/** The one hostname whose pages may enter a search index. */
export const CANONICAL_PRODUCTION_HOST = "bluecollarcrypto.io";

/**
 * True only for the real production deployment on the canonical host.
 *
 * Callers: robots.ts, the root layout's metadata, /u/[handle] metadata, and
 * the JSON-LD emitter. All four must agree, so all four read this.
 */
export function isIndexableEnvironment(): boolean {
  if (process.env["VERCEL_ENV"] !== "production") {
    return false;
  }

  let hostname: string;
  try {
    // appOrigin() THROWS on a production build it cannot resolve. That is a
    // misconfiguration, and a misconfigured deploy must not be indexable.
    hostname = new URL(appOrigin()).hostname.toLowerCase();
  } catch {
    return false;
  }

  return hostname === CANONICAL_PRODUCTION_HOST;
}

/**
 * Moderation / privacy flags that take a profile out of the index.
 *
 * Sourced from `UserViewService::resolveFlags`, which composes four slugs
 * from four separate places: `suspended` from the Permissions suspension
 * check, and `hidden` / `shadow_limited` / `under_review` from their own
 * usermeta keys. They are NOT interchangeable, so each was ruled on its own:
 *
 *   suspended       account is suspended — proven account state
 *   hidden          explicitly hidden — the name is the semantics
 *   under_review    outcome undetermined; indexing now and de-indexing later
 *                   is worse than waiting. Fails closed.
 *   shadow_limited  shadow-limiting reduces amplification, and a search index
 *                   is amplification. It MAY be intended to limit content
 *                   reach while leaving the profile reachable — the usermeta
 *                   key carries no documented intent either way, so this
 *                   fails closed pending confirmation.
 *
 * Deliberately absent: `is_in_good_standing`. It is
 * `in_array($tier, ['neutral','trusted','elite'])` — reputation tier alone,
 * with its own source comment stating that moderation is carried separately
 * by `flags`. A legitimate new member on the risky or caution tier is
 * `false`. Using it here would de-index people for being new.
 */
const NON_INDEXABLE_PROFILE_FLAGS: ReadonlySet<string> = new Set([
  "suspended",
  "hidden",
  "under_review",
  "shadow_limited",
]);

/**
 * True when this specific profile may be indexed.
 *
 * Takes the raw `flags` array off the member view-model. Tolerates a missing
 * or malformed array the way lib/permissions.ts tolerates a missing
 * permission block — an unreadable answer is treated as "do not index".
 */
export function isIndexableProfile(flags: readonly string[] | undefined): boolean {
  if (!Array.isArray(flags)) {
    return false;
  }
  return !flags.some((flag) => NON_INDEXABLE_PROFILE_FLAGS.has(flag));
}
