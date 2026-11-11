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
  | "claim_completed"
  | "claim_started"
  | "comment_published"
  | "community_joined"
  | "member_followed"
  | "member_unfollowed"
  | "message_sent"
  | "onboarding_completed"
  | "onboarding_step_completed"
  | "onboarding_step_viewed"
  | "post_published"
  | "signup_completed"
  | "signup_started"
  | "wallet_linked"
  | "wallet_unlinked";

/**
 * How an account was created. The ONLY property `signup_started` and
 * `signup_completed` carry. `"x"` is the Twitter provider.
 */
export type SignupMethod = "password" | "google" | "x" | "wallet";

const SIGNUP_METHODS: readonly SignupMethod[] = ["password", "google", "x", "wallet"];

/**
 * One-shot marker: an account was just created in this tab, and the
 * `signup_completed` event is still owed.
 *
 * Account creation finishes on routes whose events are DROPPED
 * (`ANALYTICS_DENIED_ROUTES`: /verify-email, /signup/complete-profile,
 * and /login for the wallet-signup modal), so the event cannot be sent
 * where it happens. The creation point writes this key instead, and the
 * first ALLOWED pageview reads it, sends the event and deletes it.
 *
 * Holds the method token only. sessionStorage, so it is per tab and gone
 * with the tab, and viewer-scoped in `lib/auth/viewer-storage`, so a
 * sign-out clears it.
 */
export const SIGNUP_COMPLETED_STORAGE_KEY = "bcc.analytics.signup_completed";

/** Super-property on every event: signed in or not, nothing more. */
type MemberStatus = "member" | "anonymous";

let initialised = false;
/** The viewer id the app last reported, signed in or not. */
let currentViewer: string | null = null;
/** The viewer id actually sent to PostHog via identify(). */
let identifiedViewer: string | null = null;
/** The `member_status` the app last reported; re-applied after a reset. */
let memberStatus: MemberStatus = "anonymous";
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
      applyMemberStatus();
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
  applyMemberStatus();
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
 *
 * Also settles the one-shot signup marker (see
 * `SIGNUP_COMPLETED_STORAGE_KEY`): on the first allowed pageview after an
 * account was created, `signup_completed` follows the pageview and the
 * marker is deleted. Without consent the marker is deleted unsent; it is
 * never queued for later.
 */
export function captureAnalyticsPageview(pathname: string): void {
  if (isDeniedAnalyticsPath(pathname)) return;
  if (!initialised || !isGranted()) {
    // No consent (or no SDK): the owed event is dropped, not deferred.
    takeSignupMarker();
    return;
  }
  const campaign =
    typeof window === "undefined" ? {} : pickCampaignParams(window.location.search);
  if (Object.keys(campaign).length > 0) {
    const firstTouch: Record<string, string> = {};
    for (const [k, v] of Object.entries(campaign)) firstTouch[`$initial_${k}`] = v;
    posthog.register_once(firstTouch);
  }
  posthog.capture("$pageview", { $pathname: pathname, ...campaign });

  const method = takeSignupMarker();
  if (method !== null) posthog.capture("signup_completed", { method });
}

// ----------------------------------------------------------- signup marker

/**
 * Record that an account was just created by `method`. Call it ONLY at a
 * real account-creation point, never on an ordinary sign-in. Writes the
 * method token and nothing else; sending waits for the next allowed
 * pageview (`captureAnalyticsPageview`).
 *
 * Written only when this device has already allowed analytics: without
 * consent the event could never be sent, so nothing analytics-related is
 * stored at all. (If consent is withdrawn before the next page, the
 * pageview deletes the marker unsent.)
 */
export function noteSignupCompleted(method: SignupMethod): void {
  if (typeof window === "undefined" || !isGranted()) return;
  try {
    window.sessionStorage.setItem(SIGNUP_COMPLETED_STORAGE_KEY, method);
  } catch {
    // Storage blocked: the event is lost, which is the honest outcome.
  }
}

/**
 * The signup method for an OAuth provider name (`?provider=` on
 * /signup/complete-profile, appended by the OAuth callback in lib/auth.ts).
 * Twitter is reported as "x". Anything else — missing or tampered — is
 * null, and the caller writes no marker.
 */
export function signupMethodForProvider(provider: string | null): SignupMethod | null {
  if (provider === "google") return "google";
  if (provider === "twitter") return "x";
  return null;
}

function isSignupMethod(value: string | null): value is SignupMethod {
  return value !== null && (SIGNUP_METHODS as readonly string[]).includes(value);
}

/** Read and delete the marker. Anything outside the union reads as none. */
function takeSignupMarker(): SignupMethod | null {
  if (typeof window === "undefined") return null;
  let stored: string | null;
  try {
    stored = window.sessionStorage.getItem(SIGNUP_COMPLETED_STORAGE_KEY);
    if (stored === null) return null;
    window.sessionStorage.removeItem(SIGNUP_COMPLETED_STORAGE_KEY);
  } catch {
    return null;
  }
  return isSignupMethod(stored) ? stored : null;
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
  memberStatus = "member";
  applyMemberStatus();
  return syncIdentity();
}

/**
 * Forget the current identity (sign-out / viewer switch). Re-applies the
 * stored consent, because `posthog.reset()` clears it.
 */
export function resetAnalyticsIdentity(): void {
  currentViewer = null;
  identifiedViewer = null;
  memberStatus = "anonymous";
  resetSdkIdentity();
}

function resetSdkIdentity(): void {
  if (!initialised) return;
  posthog.reset();
  if (isGranted()) {
    posthog.opt_in_capturing({ captureEventName: false });
    // reset() clears super-properties too.
    applyMemberStatus();
  } else {
    posthog.opt_out_capturing();
  }
}

/**
 * Register `member_status` ("member" / "anonymous") as a super-property.
 * Only once the SDK is running with consent; `posthog.reset()` clears it,
 * so every reset path calls this again.
 */
function applyMemberStatus(): void {
  if (!initialised || !isGranted()) return;
  posthog.register({ member_status: memberStatus });
}
