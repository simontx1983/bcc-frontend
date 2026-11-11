/**
 * vercel — the `beforeSend` filter for Vercel Web Analytics.
 *
 * Vercel Web Analytics is cookieless and aggregate (page-view counts, no
 * identity, nothing stored on the device), so it runs without the PostHog
 * consent gate. It still sees a URL per page view, and that URL gets the
 * same treatment as PostHog's:
 *
 *   - events raised on `ANALYTICS_DENIED_ROUTES` are dropped (`null`);
 *   - the query string and fragment are stripped;
 *   - person-identifying paths are generalised (`/u/alice` → `/u/[handle]`).
 *
 * Pure and SDK-free (the event shape is structural), so it is testable
 * without the script.
 */

import {
  generaliseUrlPath,
  isDeniedAnalyticsPath,
  stripQueryAndHash,
} from "@/lib/analytics/sanitize";

/** Structurally the SDK's `BeforeSendEvent`: only `url` is read or rewritten. */
interface VercelAnalyticsEvent {
  url: string;
}

/** The pathname of an absolute or root-relative URL, or null if unparseable. */
function pathnameOf(url: string): string | null {
  try {
    return new URL(url, "http://placeholder.invalid").pathname;
  } catch {
    return null;
  }
}

export function vercelAnalyticsBeforeSend<T extends VercelAnalyticsEvent>(
  event: T,
): T | null {
  const path = pathnameOf(event.url);
  // Unparseable means we cannot prove the page is allowed: drop it.
  if (path === null || isDeniedAnalyticsPath(path)) return null;
  return { ...event, url: generaliseUrlPath(stripQueryAndHash(event.url)) };
}
