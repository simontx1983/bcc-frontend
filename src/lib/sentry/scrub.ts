/**
 * scrubSentryEvent — strips the query string and fragment from every URL
 * in a Sentry event before it leaves the process. Wired as `beforeSend`
 * and `beforeSendTransaction` in all three Sentry configs (browser,
 * server, edge).
 *
 * Why: Sentry records page and request URLs whole. Several BCC links
 * carry secrets in the query string: `?pt=` on /signup/complete-profile
 * (the provider token), `?key=&login=` on the password-reset link, and
 * OAuth `?code=` / `?state=`. Sentry's server-side scrubber matches field
 * NAMES like "password" and "token", not these keys, so they would be
 * stored as sent. `sendDefaultPii: false` does not cover URLs.
 *
 * How: one recursive pass over the event, the same cut the analytics
 * filter uses (stripEmbeddedQueryStrings in lib/analytics/sanitize):
 *   - every string has the `?…` / `#…` tail of any URL inside it removed:
 *     request.url, the Referer header, the transaction name, breadcrumb
 *     from/to/url, span descriptions, exception text;
 *   - fields that hold ONLY a query or fragment are dropped:
 *     `query_string`, and the `http.query` / `http.fragment` /
 *     `url.query` / `url.fragment` span attributes.
 *
 * Paths are kept (they are what makes an error findable); only what
 * follows `?` or `#` goes. Non-URL text is left alone.
 *
 * Also drops what identifies or authenticates the request (#322 review):
 * `request.cookies`, `request.data` (the body), and the `cookie`,
 * `authorization` and `proxy-authorization` headers in any case. With
 * @sentry/nextjs 10, `sendDefaultPii: false` does NOT stop the server's
 * requestData integration collecting those (its defaults include cookies,
 * data and headers), so the next-auth session cookie could ride along.
 * The server and edge configs also switch that collection off; this is
 * the second layer.
 *
 * Bounded (#322 review): only PLAIN objects and arrays are walked. A class
 * instance, above all the live Sentry Scopes in `sdkProcessingMetadata`
 * (which reach the whole client: options, integrations, transport), is
 * passed through by reference, never copied: walking one measured ~18.8M
 * nodes and ~5.8 s. `sdkProcessingMetadata` itself is internal and never
 * sent, so it is passed through untouched. Past MAX_DEPTH, or on a
 * cycle, a subtree is replaced by a marker: the walk fails closed.
 *
 * Pure and dependency-free so it can be tested without the SDK.
 */

import { stripEmbeddedQueryStrings } from "@/lib/analytics/sanitize";

/** Keys whose whole value is a query string or a fragment. */
const QUERY_ONLY_KEYS: ReadonlySet<string> = new Set([
  "query_string",
  "http.query",
  "http.fragment",
  "url.query",
  "url.fragment",
]);

/** Request headers that carry credentials. Compared lower-cased. */
const CREDENTIAL_HEADERS: ReadonlySet<string> = new Set([
  "cookie",
  "authorization",
  "proxy-authorization",
]);

/** Deeper than any real event. Anything below is replaced, not passed on. */
const MAX_DEPTH = 24;
export const SCRUB_TRUNCATED = "[truncated]";
export const SCRUB_CIRCULAR = "[circular]";

function isPlainObject(value: object): boolean {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scrub(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return stripEmbeddedQueryStrings(value);
  if (value === null || typeof value !== "object") return value;
  const isArray = Array.isArray(value);
  // A class instance (Scope, Date, Error, …) is never walked or copied.
  if (!isArray && !isPlainObject(value)) return value;
  if (depth >= MAX_DEPTH) return SCRUB_TRUNCATED;
  if (seen.has(value)) return SCRUB_CIRCULAR;
  seen.add(value);
  let out: unknown;
  if (isArray) {
    out = (value as unknown[]).map((v) => scrub(v, depth + 1, seen));
  } else {
    const copy: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (QUERY_ONLY_KEYS.has(key)) continue;
      copy[key] = scrub(v, depth + 1, seen);
    }
    out = copy;
  }
  seen.delete(value);
  return out;
}

/** Drop the request's credentials and body from an already-copied event. */
function dropRequestSecrets(event: Record<string, unknown>): void {
  const request = event["request"];
  if (request === null || typeof request !== "object" || Array.isArray(request)) return;
  const req = request as Record<string, unknown>;
  delete req["cookies"];
  delete req["data"];
  const headers = req["headers"];
  if (headers !== null && typeof headers === "object" && !Array.isArray(headers)) {
    const h = headers as Record<string, unknown>;
    for (const name of Object.keys(h)) {
      if (CREDENTIAL_HEADERS.has(name.toLowerCase())) delete h[name];
    }
  }
}

/**
 * The event with every URL's query string and fragment removed and the
 * request's credentials and body dropped. Returns a new object; the input
 * is not changed (class instances inside it are shared, not copied).
 * Typed loosely on purpose so the same function fits `beforeSend` (error
 * events) and `beforeSendTransaction` (transaction events).
 */
export function scrubSentryEvent<T>(event: T): T {
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    return scrub(event, 0, new WeakSet()) as T;
  }
  const { sdkProcessingMetadata, ...rest } = event as Record<string, unknown>;
  const out = scrub(rest, 0, new WeakSet()) as Record<string, unknown>;
  dropRequestSecrets(out);
  if (sdkProcessingMetadata !== undefined) out["sdkProcessingMetadata"] = sdkProcessingMetadata;
  return out as T;
}
