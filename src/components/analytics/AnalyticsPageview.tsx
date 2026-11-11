"use client";

/**
 * AnalyticsPageview — sends one sanitised $pageview per route change.
 *
 * Uses the pathname only (no search params), and the analytics wrapper
 * skips the denied routes and anything without consent. Re-sends for the
 * current page when consent is granted on it. Renders nothing.
 *
 * It calls the wrapper whatever the choice, once the choice is readable
 * (not during hydration, where it reads "unknown"): the wrapper is also
 * what settles the one-shot `signup_completed` marker, and without
 * consent it has to DELETE that marker on the first allowed page rather
 * than leave it to be sent after a later opt-in.
 */

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { captureAnalyticsPageview } from "@/lib/analytics/posthog";

export function AnalyticsPageview() {
  const pathname = usePathname();
  const consent = useAnalyticsConsent();

  useEffect(() => {
    if (pathname === null || consent === "unknown") return;
    captureAnalyticsPageview(pathname);
  }, [pathname, consent]);

  return null;
}
