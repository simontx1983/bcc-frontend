/**
 * sanitize — the privacy filter every analytics event passes through.
 *
 * Wired as PostHog's `before_send` by `lib/analytics/posthog`, so it sees
 * every event the SDK would send: manual captures, the manual $pageview,
 * $identify, and exceptions.
 *
 * Two jobs:
 *
 *   1. DROP every event raised on a sensitive route. Those pages carry
 *      emails, single-use verification and reset tokens, the provider
 *      token `?pt=`, OAuth `?code=` / `?state=`, or private conversations.
 *   2. STRIP the query string and fragment from every URL-valued property,
 *      including the person properties in `$set` / `$set_once` and any URL
 *      embedded in exception text or stack frames.
 *
 * Pure and dependency-free so it can be tested without the SDK.
 */

/**
 * Route prefixes whose events are dropped entirely. Each matches the path
 * itself and anything below it (`/login` also covers `/login/two-factor`).
 */
export const ANALYTICS_DENIED_ROUTES: readonly string[] = [
  "/login",
  "/signup/complete-profile",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/auth-error",
  "/signout",
  "/api/auth",
  "/messages",
];

/** Properties PostHog fills with a URL or a path. Always stripped. */
const URL_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  "$current_url",
  "$referrer",
  "$pathname",
  "$initial_current_url",
  "$initial_referrer",
  "$initial_pathname",
  "$prev_pageview_pathname",
  "$prev_pageview_url",
  "$session_entry_url",
  "$session_entry_pathname",
  "$session_entry_referrer",
  "$entry_current_url",
  "$entry_pathname",
  "$entry_referrer",
  "$exception_source",
  "$exception_sources",
  "url",
  "href",
]);

/**
 * Event shape this module needs. Structurally compatible with posthog-js's
 * `CaptureResult`, which keeps the sanitiser free of the SDK import.
 */
export interface SanitizableEvent {
  event: string;
  properties: Record<string, unknown>;
  $set?: Record<string, unknown>;
  $set_once?: Record<string, unknown>;
}

/** Normalise a pathname: no query/hash, no trailing slash (except root). */
function normalisePath(path: string): string {
  const bare = stripQueryAndHash(path);
  return bare.length > 1 && bare.endsWith("/") ? bare.slice(0, -1) : bare;
}

/** True when `pathname` is, or is below, one of the denied routes. */
export function isDeniedAnalyticsPath(pathname: string): boolean {
  const path = normalisePath(pathname);
  return ANALYTICS_DENIED_ROUTES.some(
    (route) => path === route || path.startsWith(`${route}/`),
  );
}

/** Cut a single URL or path at the first `?` or `#`. */
export function stripQueryAndHash(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

/** An absolute URL (any scheme followed by `//`), under any property name. */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * URLs embedded in free text (exception messages, stack frames): an
 * absolute URL, or a root-relative path preceded by start/whitespace/quote/
 * paren. Only the `?…` / `#…` tail is removed.
 */
const EMBEDDED_ABSOLUTE = /([a-z][a-z0-9+.-]*:\/\/[^\s?#"'<>()]*)[?#][^\s"'<>()]*/gi;
const EMBEDDED_RELATIVE = /(^|[\s"'(=])(\/[^\s?#"'<>()]*)[?#][^\s"'<>()]*/g;

function scrubEmbeddedUrls(text: string): string {
  return text
    .replace(EMBEDDED_ABSOLUTE, "$1")
    .replace(EMBEDDED_RELATIVE, "$1$2");
}

/** Recursively scrub every string inside an exception payload. */
function scrubDeep(value: unknown): unknown {
  if (typeof value === "string") return scrubEmbeddedUrls(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v);
    return out;
  }
  return value;
}

function sanitiseProperties(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("$exception")) {
      // Messages, stack frames and source URLs can quote a URL verbatim.
      out[key] = scrubDeep(value);
    } else if (typeof value !== "string") {
      out[key] = value;
    } else if (URL_PROPERTY_KEYS.has(key) || ABSOLUTE_URL.test(value)) {
      out[key] = stripQueryAndHash(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** The page an event was raised on, as a pathname, or null if unknown. */
function eventPathname(props: Record<string, unknown>): string | null {
  const pathname = props["$pathname"];
  if (typeof pathname === "string" && pathname !== "") return pathname;
  const url = props["$current_url"];
  if (typeof url !== "string" || url === "") return null;
  try {
    return new URL(url, "http://placeholder.invalid").pathname;
  } catch {
    return null;
  }
}

/**
 * `before_send` body: `null` drops the event, otherwise a copy with every
 * URL stripped of its query string and fragment.
 */
export function sanitizeAnalyticsEvent<T extends SanitizableEvent>(
  event: T | null,
): T | null {
  if (event === null) return null;

  const path = eventPathname(event.properties);
  if (path !== null && isDeniedAnalyticsPath(path)) return null;

  const next: T = { ...event, properties: sanitiseProperties(event.properties) };
  if (event.$set !== undefined) next.$set = sanitiseProperties(event.$set);
  if (event.$set_once !== undefined) {
    next.$set_once = sanitiseProperties(event.$set_once);
  }
  return next;
}
