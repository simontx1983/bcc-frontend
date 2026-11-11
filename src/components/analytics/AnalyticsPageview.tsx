"use client";

/**
 * AnalyticsPageview — sends one sanitised $pageview per route change.
 *
 * Uses the pathname only (no search params), and the analytics wrapper
 * skips the denied routes and anything without consent. Re-sends for the
 * current page when consent is granted on it. Renders nothing.
 */

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import { captureAnalyticsPageview } from "@/lib/analytics/posthog";

export function AnalyticsPageview() {
  const pathname = usePathname();
  const consent = useAnalyticsConsent();

  useEffect(() => {
    if (pathname === null || consent !== "granted") return;
    captureAnalyticsPageview(pathname);
  }, [pathname, consent]);

  return null;
}
