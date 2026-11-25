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
 * True when this specific member profile may be indexed: the server's own
 * answer, `indexable` (contract v1.228, F-518). It is the anonymous answer
 * whoever asks, by the same rule `GET /sitemap/members` lists members with,
 * so a profile is indexable exactly when it is in the sitemap. Exactly
 * `true` indexes; absent or anything else does not (fail closed).
 *
 * ⛔ Never derived from `flags`. Since trust #902 (F-582) the moderation
 * flags are the member's and administrators' to see: every other viewer,
 * a crawler included, receives `[]`. Reading that empty list as "no flags,
 * index it" would index exactly the accounts the flags exist to keep out.
 * (`is_in_good_standing` was never an input either: it is reputation tier
 * alone and would de-index members for being new.)
 */
export function profileIsIndexable(profile: { indexable?: unknown }): boolean {
  return profile.indexable === true;
}
