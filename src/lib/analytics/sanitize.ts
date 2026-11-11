/**
 * sanitize — the privacy filter every analytics event passes through.
 *
 * Wired as PostHog's `before_send` by `lib/analytics/posthog`, so it sees
 * every event the SDK would send: manual captures, the manual $pageview,
 * $identify, and exceptions.
 *
 * Three jobs:
 *
 *   1. DROP every event raised on a sensitive route. Those pages carry
 *      emails, single-use verification and reset tokens, the provider
 *      token `?pt=`, OAuth `?code=` / `?state=`, or private conversations.
 *   2. STRIP the query string and fragment from every URL-valued property,
 *      including the person properties in `$set` / `$set_once` and any URL
 *      embedded in exception text or stack frames.
 *   3. ALLOWLIST campaign properties. posthog-js reads link tags from the
 *      location on its own (e.g. `$session_entry_utm_source`), even with
 *      `save_campaign_params: false`. Only `utm_source`, `utm_medium` and
 *      `utm_campaign` are kept, capped in length because they are free
 *      text anyone can put in a link; every other `utm_*` and every
 *      ad-click id is dropped, in every prefixed variant.
 *   4. GENERALISE person-identifying paths to their route pattern
 *      (`/u/alice` → `/u/[handle]`), so the pseudonymous id is never
 *      linked to a handle, post or dispute through a URL. `title` is
 *      dropped on those pages too, because it carries the person's name.
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

/** Link tags kept (user decision): source, medium and campaign only. */
export const KEPT_CAMPAIGN_KEYS: ReadonlySet<string> = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
]);

/** Ad-click ids and similar tracking params. Always dropped. */
const CLICK_ID_KEYS: ReadonlySet<string> = new Set([
  "gclid",
  "gclsrc",
  "gbraid",
  "wbraid",
  "dclid",
  "gad_source",
  "fbclid",
  "msclkid",
  "twclid",
  "ttclid",
  "li_fat_id",
  "igshid",
  "mc_cid",
  "mc_eid",
  "rdt_cid",
  "epik",
  "qclid",
  "sccid",
  "irclid",
  "_kx",
]);

/** Longest campaign value kept; they are free text. */
export const CAMPAIGN_VALUE_MAX = 100;

/** Prefixes PostHog puts in front of a campaign key. */
const CAMPAIGN_KEY_PREFIX = /^(?:\$session_entry_|\$initial_|\$entry_|\$)/;

/**
 * The campaign parameter a property key carries (`$initial_utm_term` →
 * `utm_term`), or null when the key is not a campaign property at all.
 */
export function campaignKeyOf(key: string): string | null {
  const base = key.replace(CAMPAIGN_KEY_PREFIX, "");
  return base.startsWith("utm_") || CLICK_ID_KEYS.has(base) ? base : null;
}

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

/**
 * Dynamic routes that name a person (or a post / dispute that points to
 * one), most specific first. Public entity pages (validators, projects,
 * creators, communities, halls, tags) are not person-identifying and keep
 * their slugs.
 */
const PERSON_ROUTE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/u\/[^/]+\/post\/[^/]+/, "/u/[handle]/post/[shortcode]"],
  [/^\/u\/[^/]+/, "/u/[handle]"],
  [/^\/post\/[^/]+/, "/post/[id]"],
  [/^\/disputes\/[^/]+/, "/disputes/[id]"],
];

/** A path with its person-identifying segments replaced, or null if none matched. */
function generalisedPath(path: string): string | null {
  for (const [re, pattern] of PERSON_ROUTE_PATTERNS) {
    if (re.test(path)) return path.replace(re, pattern);
  }
  return null;
}

const URL_WITH_ORIGIN = /^([a-z][a-z0-9+.-]*:\/\/[^/?#]*)(\/[^?#]*)?$/i;

/**
 * Generalise the path inside an already query-stripped URL or path. Only a
 * path starting with `/` is rewritten; anything else is returned as-is.
 */
export function generaliseUrlPath(value: string): string {
  const m = URL_WITH_ORIGIN.exec(value);
  if (m !== null) {
    const path = m[2] ?? "";
    const g = path === "" ? null : generalisedPath(path);
    return g === null ? value : (m[1] ?? "") + g;
  }
  if (value.startsWith("/")) return generalisedPath(value) ?? value;
  return value;
}

/** True when the event's page is a person-identifying route. */
function isPersonPath(path: string): boolean {
  return generalisedPath(stripQueryAndHash(path)) !== null;
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

/** Person-identifying path segments quoted inside free text. */
const EMBEDDED_PERSON_SEGMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\/u\/[^\s/?#"'<>()[\]]+/g, "/u/[handle]"],
  [/\/post\/[^\s/?#"'<>()[\]]+/g, "/post/[id]"],
  [/\/disputes\/[^\s/?#"'<>()[\]]+/g, "/disputes/[id]"],
];

function scrubEmbeddedUrls(text: string): string {
  let out = text
    .replace(EMBEDDED_ABSOLUTE, "$1")
    .replace(EMBEDDED_RELATIVE, "$1$2");
  for (const [re, pattern] of EMBEDDED_PERSON_SEGMENTS) out = out.replace(re, pattern);
  return out;
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
    const campaign = campaignKeyOf(key);
    if (campaign !== null) {
      // Allowlist: anything not kept is dropped. Kept values are capped.
      if (!KEPT_CAMPAIGN_KEYS.has(campaign)) continue;
      out[key] = typeof value === "string" ? value.slice(0, CAMPAIGN_VALUE_MAX) : value;
    } else if (key.startsWith("$exception")) {
      // Messages, stack frames and source URLs can quote a URL verbatim.
      out[key] = scrubDeep(value);
    } else if (typeof value !== "string") {
      out[key] = value;
    } else if (URL_PROPERTY_KEYS.has(key) || ABSOLUTE_URL.test(value)) {
      out[key] = generaliseUrlPath(stripQueryAndHash(value));
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

  const properties = sanitiseProperties(event.properties);
  // The page title on a person's page carries their name and handle.
  if (path !== null && isPersonPath(path)) delete properties["title"];
  const next: T = { ...event, properties };
  if (event.$set !== undefined) next.$set = sanitiseProperties(event.$set);
  if (event.$set_once !== undefined) {
    next.$set_once = sanitiseProperties(event.$set_once);
  }
  return next;
}
