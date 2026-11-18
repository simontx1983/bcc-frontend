/**
 * Security response headers for every route (security finding S5:
 * bluecollarcrypto.io sent only HSTS — no anti-framing, no nosniff, no
 * referrer policy, no CSP).
 *
 * Consumed by next.config.ts `headers()`. Kept free of `@/` path aliases
 * because next.config.ts imports it before the app's TS paths exist.
 *
 * Two CSP headers, on purpose:
 *   - ENFORCED `Content-Security-Policy: frame-ancestors 'none'` — browsers
 *     IGNORE frame-ancestors inside a Report-Only policy, so anti-framing
 *     must be enforced to mean anything. It is the only directive enforced,
 *     and it cannot break page loads (nothing legitimately frames the app).
 *     X-Frame-Options: DENY covers older browsers.
 *   - `Content-Security-Policy-Report-Only` with the full allow-list of what
 *     the app actually loads. REPORT-ONLY until it has been watched in
 *     production; flipping it to enforcing is a separate, deliberate change.
 *
 * Allow-list sources (keep in sync when adding a third party):
 *   - self: the app, NextAuth (/api/auth/*), Vercel Analytics + Speed
 *     Insights (served from /_vercel/* on Vercel), local fonts
 *   - the WP/CMS origin (NEXT_PUBLIC_BCC_API_URL) + cms./stage. hosts:
 *     REST calls (connect-src) and media (img-src)
 *   - PostHog (NEXT_PUBLIC_POSTHOG_HOST + *.posthog.com assets)
 *   - Sentry ingest (from NEXT_PUBLIC_SENTRY_DSN)
 *   - Giphy API (connect-src); GIF media and NFT/creator images render
 *     through plain <img> from arbitrary HTTPS hosts → img-src https:
 *   - Vercel's preview toolbar (vercel.live) — previews only, harmless in prod
 * Wallet signing happens inside the browser extensions; no RPC host is
 * called from page code today.
 *
 * `Permissions-Policy` turns off powerful browser features the app never
 * uses, for the page and every frame in it (see PERMISSIONS_POLICY).
 */

/**
 * Features denied to every origin. Each one was checked as unused
 * (2026-11-18): no camera/mic/QR capture, no geolocation, no Payment
 * Request, no WebUSB/WebHID/serial/Bluetooth (wallets are browser
 * extensions, which this header does not govern, and no hardware-wallet SDK
 * is a dependency), no MIDI, no motion sensors, no screen capture, no
 * WebAuthn. `browsing-topics=()` opts the site out of the Topics ad API.
 *
 * Deliberately NOT listed because the app uses them: `web-share`
 * (ShareButton), `clipboard-write` (useCopyConfirm, ShareButton),
 * `fullscreen` (native video controls). Before using a feature listed here,
 * remove it first; the browser blocks it silently otherwise.
 */
const PERMISSIONS_POLICY = [
  "camera",
  "microphone",
  "geolocation",
  "payment",
  "usb",
  "hid",
  "serial",
  "bluetooth",
  "midi",
  "accelerometer",
  "gyroscope",
  "magnetometer",
  "display-capture",
  "publickey-credentials-get",
  "browsing-topics",
]
  .map((feature) => `${feature}=()`)
  .join(", ");

export interface SecurityHeader {
  key: string;
  value: string;
}

export interface SecurityHeaderEnv {
  /** `NODE_ENV !== "production"` — dev needs 'unsafe-eval' for React Refresh. */
  dev: boolean;
  /** NEXT_PUBLIC_BCC_API_URL — the WP/CMS origin this build talks to. */
  apiUrl?: string | undefined;
  /** NEXT_PUBLIC_POSTHOG_HOST. */
  posthogHost?: string | undefined;
  /** NEXT_PUBLIC_SENTRY_DSN. */
  sentryDsn?: string | undefined;
}

/** Fixed CMS hosts: prod WP (pre- and post-cutover) and staging. */
const CMS_ORIGINS = [
  "https://cms.bluecollarcrypto.io",
  "https://bluecollarcrypto.io",
  "https://stage.bluecollarcrypto.io",
];

function originOf(url: string | undefined): string | null {
  if (url === undefined || url.trim() === "") return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

interface SentryEndpoints {
  origin: string;
  reportUri: string;
}

/**
 * Sentry DSN `https://<key>@<host>/<project>` → its ingest origin and the
 * CSP security-report endpoint `https://<host>/api/<project>/security/?sentry_key=<key>`.
 * The public key is public by design (it ships in the client bundle).
 */
function sentryEndpoints(dsn: string | undefined): SentryEndpoints | null {
  if (dsn === undefined || dsn.trim() === "") return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+/, "");
    if (u.username === "" || project === "") return null;
    return {
      origin: u.origin,
      reportUri: `${u.origin}/api/${project}/security/?sentry_key=${u.username}`,
    };
  } catch {
    return null;
  }
}

const unique = (xs: ReadonlyArray<string | null>): string[] =>
  [...new Set(xs.filter((x): x is string => x !== null))];

export function buildReportOnlyCsp(env: SecurityHeaderEnv): string {
  const api = originOf(env.apiUrl);
  const posthog = originOf(env.posthogHost);
  const sentry = sentryEndpoints(env.sentryDsn);
  const cms = unique([api, ...CMS_ORIGINS]);

  const directives: Array<[string, string[]]> = [
    ["default-src", ["'self'"]],
    [
      "script-src",
      unique([
        "'self'",
        // Next's inline bootstrap/hydration scripts carry no nonce yet.
        "'unsafe-inline'",
        env.dev ? "'unsafe-eval'" : null,
        "https://*.posthog.com",
        posthog,
        "https://va.vercel-scripts.com",
        "https://vercel.live",
      ]),
    ],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", unique(["'self'", "data:", "blob:", "https:", ...cms])],
    ["font-src", ["'self'", "data:"]],
    [
      "connect-src",
      unique([
        "'self'",
        ...cms,
        "https://*.posthog.com",
        posthog,
        sentry?.origin ?? null,
        "https://api.giphy.com",
        "https://vitals.vercel-insights.com",
        "https://vercel.live",
      ]),
    ],
    ["frame-src", ["'self'", "https://vercel.live"]],
    ["worker-src", ["'self'", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  if (sentry !== null) directives.push(["report-uri", [sentry.reportUri]]);

  return directives.map(([name, values]) => `${name} ${values.join(" ")}`).join("; ");
}

export function buildSecurityHeaders(env: SecurityHeaderEnv): SecurityHeader[] {
  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
    { key: "Content-Security-Policy-Report-Only", value: buildReportOnlyCsp(env) },
  ];
}
