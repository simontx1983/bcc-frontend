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

/** Deeper than any real event; guards against a pathological payload. */
const MAX_DEPTH = 24;

function scrub(value: unknown, depth: number): unknown {
  if (typeof value === "string") return stripEmbeddedQueryStrings(value);
  if (depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      if (QUERY_ONLY_KEYS.has(key)) continue;
      out[key] = scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

/**
 * The event with every URL's query string and fragment removed. Returns a
 * new object; the input is not changed. Typed loosely on purpose so the
 * same function fits `beforeSend` (error events) and
 * `beforeSendTransaction` (transaction events).
 */
export function scrubSentryEvent<T>(event: T): T {
  return scrub(event, 0) as T;
}
