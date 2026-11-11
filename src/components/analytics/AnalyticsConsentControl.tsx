"use client";

/**
 * AnalyticsConsentControl — view and change this device's analytics
 * choice. Rendered inside the Privacy and Cookie policies, which is how a
 * visitor withdraws (or gives) consent after the banner is gone.
 */

import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import {
  isAnalyticsConfigured,
  setAnalyticsConsent,
} from "@/lib/analytics/posthog";

const STATUS: Record<"granted" | "denied" | "none", string> = {
  granted: "Analytics is on for this browser.",
  denied: "Analytics is off for this browser.",
  none: "You have not made a choice on this browser, so analytics is off.",
};

export function AnalyticsConsentControl() {
  const consent = useAnalyticsConsent();

  if (!isAnalyticsConfigured) {
    return (
      <p className="bcc-mono text-[11px] text-bcc-text-secondary">
        Product analytics is not enabled on this site, so nothing is recorded.
      </p>
    );
  }

  // Storage is unreadable until hydration; reserve the space meanwhile.
  if (consent === "unknown") {
    return <div className="min-h-[76px]" aria-hidden />;
  }

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Analytics choice">
      <p role="status" className="bcc-mono text-[11px] text-bcc-text-secondary">
        {STATUS[consent ?? "none"]}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={consent === "granted"}
          onClick={() => setAnalyticsConsent("granted")}
          className={`bcc-btn bcc-btn-sm min-h-[44px] ${
            consent === "granted"
              ? "bcc-btn-primary"
              : "bcc-btn-outline text-bcc-text"
          }`}
        >
          Allow analytics
        </button>
        <button
          type="button"
          aria-pressed={consent === "denied"}
          onClick={() => setAnalyticsConsent("denied")}
          className={`bcc-btn bcc-btn-sm min-h-[44px] ${
            consent === "denied"
              ? "bcc-btn-primary"
              : "bcc-btn-outline text-bcc-text"
          }`}
        >
          Turn off analytics
        </button>
      </div>
    </div>
  );
}
