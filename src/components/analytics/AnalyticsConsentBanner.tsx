"use client";

/**
 * AnalyticsConsentBanner — the one-time product-analytics choice.
 *
 * Shown only when PostHog is configured for this build and the device has
 * not chosen yet. The page stays usable and PostHog stays off until
 * consent. Both answers carry equal visual weight. The
 * choice can be changed later from the Privacy and Cookie pages
 * (`AnalyticsConsentControl`).
 *
 * Static — no entrance animation, so there is nothing for reduced motion
 * to flatten. Shape follows AuthRedirectNotice; it sits above the mobile
 * bottom nav instead of over it, in the shared BottomSlot (F-514), so it
 * stacks with the other bottom-centre notices instead of covering them.
 */

import Link from "next/link";
import { useId } from "react";

import { BottomSlot } from "@/components/ui/BottomSlot";
import { useAnalyticsConsent } from "@/hooks/useAnalyticsConsent";
import {
  isAnalyticsConfigured,
  setAnalyticsConsent,
} from "@/lib/analytics/posthog";

export function AnalyticsConsentBanner() {
  const consent = useAnalyticsConsent();
  const headingId = useId();

  if (!isAnalyticsConfigured || consent !== null) return null;

  return (
    <BottomSlot>
      <section
        aria-labelledby={headingId}
        className="bcc-panel pointer-events-auto flex w-[min(460px,calc(100vw-2rem))] flex-col gap-3 p-4 shadow-2xl"
      >
        <h2
          id={headingId}
          className="bcc-mono text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary"
        >
          Optional product analytics
        </h2>
        <p className="font-serif text-sm text-bcc-text-secondary">
          Allow PostHog to measure the pages you open and selected actions,
          such as publishing a post? PostHog stays off until you allow it.
          This choice applies only to PostHog. Vercel site measurement and
          Sentry diagnostics, when enabled, are separate. Change your choice on the{" "}
          <Link href="/privacy" className="text-[var(--bcc-accent)] underline">
            Privacy page
          </Link>
          .
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAnalyticsConsent("granted")}
            className="bcc-btn bcc-btn-outline bcc-btn-sm min-h-[44px] flex-1 justify-center text-bcc-text"
          >
            Allow
          </button>
          <button
            type="button"
            onClick={() => setAnalyticsConsent("denied")}
            className="bcc-btn bcc-btn-outline bcc-btn-sm min-h-[44px] flex-1 justify-center text-bcc-text"
          >
            Decline
          </button>
        </div>
      </section>
    </BottomSlot>
  );
}
