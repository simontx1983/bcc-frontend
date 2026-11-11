"use client";

/**
 * VercelAnalytics — Vercel Web Analytics with the URL filter applied.
 *
 * A client wrapper because `beforeSend` is a function, and a function
 * cannot be passed as a prop from the server root layout to a client
 * component. Renders nothing itself.
 *
 * Needs no consent gate: it is cookieless and aggregate. It does nothing
 * unless Web Analytics is enabled for the Vercel project — the SDK loads
 * `/_vercel/insights/script.js`, which only exists when it is, and in
 * development it loads the debug script, which logs instead of sending.
 */

import { Analytics } from "@vercel/analytics/next";

import { vercelAnalyticsBeforeSend } from "@/lib/analytics/vercel";

export function VercelAnalytics() {
  return <Analytics beforeSend={vercelAnalyticsBeforeSend} />;
}
