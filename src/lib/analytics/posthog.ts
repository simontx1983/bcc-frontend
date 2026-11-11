/**
 * posthog — the ONLY module that talks to posthog-js.
 *
 * Owns configuration, consent, identity and capture. Components import the
 * functions below; nothing else imports `posthog-js` or re-reads the
 * PostHog env vars.
 *
 * ## Consent model
 *
 * Product analytics is opt-in and per DEVICE. The choice lives under
 * `CONSENT_STORAGE_KEY` in localStorage (a device-scoped key in
 * `lib/auth/viewer-storage`, so sign-out keeps it). Until the choice is
 * "granted":
 *
 *   - the SDK is not initialised at all, so no request reaches PostHog;
 *   - every capture / identify call here is a no-op.
 *
 * Init itself still sets `opt_out_capturing_by_default` and memory-only
 * persistence unless consent is granted, so the SDK's own defaults agree
 * with ours if it is ever started some other way.
 *
 * `posthog.reset()` clears the SDK's consent state along with identity, so
 * every reset here is followed by re-applying the stored choice — otherwise
 * signing out would silently stop analytics a visitor agreed to.
 *
 * ## What is never sent
 *
 * Autocapture, automatic pageview/pageleave, session recording, heatmaps,
 * dead clicks, rage clicks, web vitals, surveys and campaign params are all
 * off. Page views are sent manually by `AnalyticsPageview` with a bare
 * pathname, and every event passes `sanitizeAnalyticsEvent` (no query
 * strings or fragments; sensitive routes dropped).
 */

import posthog, {
  type CaptureResult,
  type PostHogConfig,
  type Properties,
} from "posthog-js";

import {
  isDeniedAnalyticsPath,
  pickCampaignParams,
  sanitizeAnalyticsEvent,
} from "@/lib/analytics/sanitize";

const TOKEN = process.env["NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"];
const HOST = process.env["NEXT_PUBLIC_POSTHOG_HOST"];

/** True when both PostHog env vars are set for this build. */
export const isAnalyticsConfigured = Boolean(TOKEN && HOST);

/** Per-device consent choice. Device-scoped: survives sign-out. */
export const CONSENT_STORAGE_KEY = "bcc-analytics-consent";

export type AnalyticsConsent = "granted" | "denied";

/** The product events this app sends. Adding one means disclosing it. */
export type AnalyticsEventName =
  | "comment_published"
  | "community_joined"
  | "member_followed"
  | "member_unfollowed"
  | "message_sent"
  | "onboarding_completed"
  | "post_published"
  | "wallet_linked"
  | "wallet_unlinked";

let initialised = false;
/** The viewer id the app last reported, signed in or not. */
let currentViewer: string | null = null;
/** The viewer id actually sent to PostHog via identify(). */
let identifiedViewer: string | null = null;
const listeners = new Set<() => void>();
/** This document's choice, for when localStorage is unavailable. */
let memoryConsent: AnalyticsConsent | null = null;

// ---------------------------------------------------------------- consent

/** The stored choice, or null when none has been made (or storage fails). */
export function getAnalyticsConsent(): AnalyticsConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return stored === "granted" || stored === "denied" ? stored : memoryConsent;
  } catch {
    return memoryConsent;
  }
}

/** For `useSyncExternalStore`: notified whenever the choice changes. */
export function subscribeAnalyticsConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function isGranted(): boolean {
  return isAnalyticsConfigured && getAnalyticsConsent() === "granted";
}

/** Record the visitor's choice and apply it to the SDK immediately. */
export function setAnalyticsConsent(choice: AnalyticsConsent): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
    memoryConsent = null;
  } catch {
    // Storage blocked: the choice still applies for this document.
    memoryConsent = choice;
  }

  if (choice === "granted") {
    initAnalytics(choice);
    if (initialised) {
      posthog.opt_in_capturing({ captureEventName: false });
      void syncIdentity();
    }
  } else if (initialised) {
    // Drop the identity, then opt out. With `opt_out_persistence_by_default`
    // the opt-out also removes the SDK's cookie and localStorage entry;
    // only its own small opt-out marker remains.
    posthog.reset();
    posthog.opt_out_capturing();
    identifiedViewer = null;
  }

  for (const listener of listeners) listener();
}

// ------------------------------------------------------------------- init

/** posthog-js options. Explicit values win over the `defaults` bundle. */
export function buildPostHogOptions(
  consent: AnalyticsConsent | null,
): Partial<PostHogConfig> {
  return {
    api_host: HOST ?? "",
    defaults: "2026-08-30",
    // Consent
    opt_out_capturing_by_default: true,
    opt_out_persistence_by_default: true,
    persistence: consent === "granted" ? "localStorage+cookie" : "memory",
    // Nothing captured automatically
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_performance: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    save_campaign_params: false,
    mask_personal_data_properties: true,
    // Unhandled errors, sanitised like everything else.
    capture_exceptions: true,
    before_send: (event: CaptureResult | null) => sanitizeAnalyticsEvent(event),
  };
}

/**
 * Start the SDK if this build is configured and the device has consented.
 * Safe to call repeatedly; a no-op otherwise.
 */
export function initAnalytics(
  consent: AnalyticsConsent | null = getAnalyticsConsent(),
): void {
  if (initialised || !isAnalyticsConfigured || TOKEN === undefined) return;
  if (typeof window === "undefined" || consent !== "granted") return;

  posthog.init(TOKEN, buildPostHogOptions(consent));
  posthog.opt_in_capturing({ captureEventName: false });
  initialised = true;
}

// ---------------------------------------------------------------- capture

/** Send a named product event. No-op without consent. */
export function captureAnalyticsEvent(
  event: AnalyticsEventName,
  properties?: Properties,
): void {
  if (!initialised || !isGranted()) return;
  posthog.capture(event, properties);
}

/**
 * Send a page view for a bare pathname. Denied routes are skipped.
 *
 * The allowlisted link tags (utm_source / utm_medium / utm_campaign) are
 * read from the location BEFORE the sanitiser strips the URL, attached to
 * this pageview, and registered once as `$initial_utm_*` so the first
 * consented visit's tags travel with later events (signup_completed
 * included). Nothing else from the query string is ever read.
 */
export function captureAnalyticsPageview(pathname: string): void {
  if (!initialised || !isGranted() || isDeniedAnalyticsPath(pathname)) return;
  const campaign =
    typeof window === "undefined" ? {} : pickCampaignParams(window.location.search);
  if (Object.keys(campaign).length > 0) {
    const firstTouch: Record<string, string> = {};
    for (const [k, v] of Object.entries(campaign)) firstTouch[`$initial_${k}`] = v;
    posthog.register_once(firstTouch);
  }
  posthog.capture("$pageview", { $pathname: pathname, ...campaign });
}

/** Report an error. Sanitised by `before_send`. No-op without consent. */
export function captureAnalyticsException(error: unknown): void {
  if (!initialised || !isGranted()) return;
  posthog.captureException(error);
}

// --------------------------------------------------------------- identity

async function syncIdentity(): Promise<void> {
  const viewer = currentViewer;
  if (!initialised || !isGranted() || viewer === null) return;
  if (identifiedViewer === viewer) return;

  if (identifiedViewer !== null) {
    identifiedViewer = null;
    resetSdkIdentity();
  }

  // `viewer` is already the server's keyed pseudonym; it is sent as-is.
  // No person properties: it is the only identifier sent.
  posthog.identify(viewer);
  identifiedViewer = viewer;
}

/**
 * Tell analytics who is signed in. `analyticsId` MUST be the server's
 * keyed pseudonym (session.user.analyticsId), never the raw user id or
 * handle. Identifies only after consent.
 */
export function setAnalyticsViewer(analyticsId: string): Promise<void> {
  currentViewer = analyticsId;
  return syncIdentity();
}

/**
 * Forget the current identity (sign-out / viewer switch). Re-applies the
 * stored consent, because `posthog.reset()` clears it.
 */
export function resetAnalyticsIdentity(): void {
  currentViewer = null;
  identifiedViewer = null;
  resetSdkIdentity();
}

function resetSdkIdentity(): void {
  if (!initialised) return;
  posthog.reset();
  if (isGranted()) {
    posthog.opt_in_capturing({ captureEventName: false });
  } else {
    posthog.opt_out_capturing();
  }
}
