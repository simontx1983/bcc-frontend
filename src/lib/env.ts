/**
 * env.ts — typed env-var loader.
 *
 * Reads the runtime env once and exposes a frozen object so that
 * mistyped accesses fail at compile time and the same value is read
 * everywhere. Server vs. client variables are separated explicitly.
 *
 * NEXT_PUBLIC_* values are inlined into the client bundle by Next.js;
 * everything else is server-only and we throw if the client tries to
 * read them.
 */

function required(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(
      `[bcc-frontend] Missing required env var: ${name}. ` +
        `See .env.local.example for the canonical list.`
    );
  }
  return value;
}

/** Strip a single trailing slash, leave others alone. */
function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

/**
 * The API base must point at the WordPress host — never the Vercel apex, and
 * never staging from a production build.
 *
 * Three hosts, and only one of them serves WordPress:
 *
 *   bluecollarcrypto.io        this frontend (Vercel)     403 on /wp-json
 *   cms.bluecollarcrypto.io    WordPress                  <- the correct base
 *   stage.bluecollarcrypto.io  staging WordPress
 *
 * The apex case is the subtle one. The apex answers 200 for pages, so a
 * misconfigured deploy builds, ships and looks alive — and fails only at
 * request time, on every data fetch at once. Pointing production at staging is
 * louder but worse: it serves staging data to real users under the real domain.
 *
 * Neither mistake is expressible as a type, and both have exactly one moment
 * where they are cheap to catch: here, where the value is read, once.
 *
 * localhost and *.local are deliberately untouched — Local-by-Flywheel dev
 * points this at a .local host and must keep working.
 *
 * @see docs/hosting.md in the umbrella repo
 */
function assertWordPressHost(url: string): string {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    throw new Error(`[bcc-frontend] NEXT_PUBLIC_BCC_API_URL is not a valid URL: ${url}`);
  }

  if (host === "bluecollarcrypto.io" || host === "www.bluecollarcrypto.io") {
    throw new Error(
      `[bcc-frontend] NEXT_PUBLIC_BCC_API_URL points at the apex (${host}), ` +
        "which is this frontend, not WordPress — it returns 403 on /wp-json. " +
        "Use https://cms.bluecollarcrypto.io."
    );
  }

  if (process.env["VERCEL_ENV"] === "production" && host.startsWith("stage.")) {
    throw new Error(
      `[bcc-frontend] production build points NEXT_PUBLIC_BCC_API_URL at staging (${host}). ` +
        "Use https://cms.bluecollarcrypto.io."
    );
  }

  return url;
}

export const clientEnv = Object.freeze({
  /** Backend base URL (no trailing slash). REST namespace lives at /wp-json/bcc/v1/*. */
  BCC_API_URL: stripTrailingSlash(
    assertWordPressHost(
      required("NEXT_PUBLIC_BCC_API_URL", process.env["NEXT_PUBLIC_BCC_API_URL"])
    )
  ),
});

/**
 * Server-only env. Throws when accessed in the browser bundle —
 * Next.js can usually catch this at build time, but the runtime
 * guard catches the rest.
 *
 * NextAuth's own variables — NEXTAUTH_URL and NEXTAUTH_SECRET — are
 * deliberately NOT exposed here. Both had `required()` getters that
 * nothing ever called, so they read as guarantees while enforcing
 * nothing. NextAuth v4 reads both from `process.env` itself and fails on
 * its own terms; and the only other consumer, `appOrigin()` in
 * lib/app-origin.ts, must NOT throw when NEXTAUTH_URL is absent — it
 * falls through to the Vercel system variables. A throwing accessor was
 * the wrong shape for every caller, so there is no accessor.
 *
 * What remains below is the set of secrets THIS app forwards or verifies
 * itself, where a missing value is our bug to surface rather than a
 * dependency's.
 */
export const serverEnv = Object.freeze({
  /**
   * Shared secret forwarded as `X-Bcc-Internal` to the WP
   * /bcc/v1/internal/* endpoints. Must match `BCC_INTERNAL_CRON_SECRET`
   * in the WordPress wp-config.php.
   */
  get BCC_INTERNAL_CRON_SECRET(): string {
    if (typeof window !== "undefined") {
      throw new Error("[bcc-frontend] serverEnv accessed in client code");
    }
    return required("BCC_INTERNAL_CRON_SECRET", process.env["BCC_INTERNAL_CRON_SECRET"]);
  },
  /**
   * Vercel-issued cron secret. When set in the project's env, Vercel
   * Cron attaches `Authorization: Bearer <CRON_SECRET>` to every
   * invocation; the cron routes verify it before forwarding to WP.
   */
  get CRON_SECRET(): string {
    if (typeof window !== "undefined") {
      throw new Error("[bcc-frontend] serverEnv accessed in client code");
    }
    return required("CRON_SECRET", process.env["CRON_SECRET"]);
  },
  /**
   * Shared secret accepted on the `X-Bcc-Internal` header by the
   * /api/internal/verify-wallet-signature route. Must match
   * `BCC_INTERNAL_VERIFY_SECRET` in the WordPress wp-config.php.
   * Separate from BCC_INTERNAL_CRON_SECRET so leaking one doesn't
   * widen access to the other.
   */
  get BCC_INTERNAL_VERIFY_SECRET(): string {
    if (typeof window !== "undefined") {
      throw new Error("[bcc-frontend] serverEnv accessed in client code");
    }
    return required("BCC_INTERNAL_VERIFY_SECRET", process.env["BCC_INTERNAL_VERIFY_SECRET"]);
  },
  /**
   * Shared secret sent as the `X-Bcc-Oauth-Secret` header on every call to
   * /wp-json/bcc/v1/auth/oauth. Must match `BCC_OAUTH_BRIDGE_SECRET` in the
   * WordPress wp-config.php — that endpoint fails closed (500/401) without
   * a matching header, so OAuth sign-in is down until both sides are set.
   */
  get BCC_OAUTH_BRIDGE_SECRET(): string {
    if (typeof window !== "undefined") {
      throw new Error("[bcc-frontend] serverEnv accessed in client code");
    }
    return required("BCC_OAUTH_BRIDGE_SECRET", process.env["BCC_OAUTH_BRIDGE_SECRET"]);
  },
});
