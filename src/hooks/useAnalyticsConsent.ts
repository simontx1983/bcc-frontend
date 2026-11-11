"use client";

/**
 * useAnalyticsConsent — the device's analytics choice, live.
 *
 * `"unknown"` on the server and during hydration (storage is unreadable
 * there), then the stored choice or `null` when none has been made. Also
 * follows changes made in another tab.
 */

import { useSyncExternalStore } from "react";

import {
  CONSENT_STORAGE_KEY,
  getAnalyticsConsent,
  subscribeAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics/posthog";

function subscribe(onChange: () => void): () => void {
  const unsubscribe = subscribeAnalyticsConsent(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONSENT_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    unsubscribe();
    window.removeEventListener("storage", onStorage);
  };
}

export function useAnalyticsConsent(): AnalyticsConsent | null | "unknown" {
  return useSyncExternalStore(
    subscribe,
    getAnalyticsConsent,
    () => "unknown" as const,
  );
}
