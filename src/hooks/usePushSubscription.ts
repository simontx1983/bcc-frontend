"use client";

/**
 * §V2 Phase 1 — React Query hook for the web-push master toggle.
 *
 * Drives only the master toggle (enable/disable + supported/ready
 * state). Per-event toggles ride on the existing useNotificationPrefs
 * draft+save flow — they're pure prefs writes and don't need a
 * separate hook.
 *
 * Why master is immediate (not deferred to Save like the bell rows):
 * the browser permission prompt MUST fire under a user gesture, and
 * deferring it to a Save click that runs *after* a series of state
 * mutations is fragile across browsers. Immediate enable/disable on
 * the toggle's onChange keeps the gesture chain tight.
 *
 * Cache strategy: enable() optimistically updates the cache with
 * push.enabled = true (no refetch — preserves any pending bell/event
 * draft edits). disable() sets the full prefs response from the
 * cascade-PATCH so the cache is authoritative.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  getVapidPublicKey,
  registerPushSubscription,
  type RegisterPushSubscriptionResponse,
} from "@/lib/api/push-endpoints";
import { patchNotificationPrefs } from "@/lib/api/notification-prefs-endpoints";
import {
  getCurrentBrowserSubscription,
  isPushSupported,
  registerBrowserPush,
  subscriptionToPayload,
  unregisterBrowserPush,
} from "@/lib/push/register";
import type { BccApiError, NotificationPrefs } from "@/lib/api/types";

import { NOTIFICATION_PREFS_QUERY_KEY } from "@/hooks/useNotificationPrefs";

interface UsePushSubscriptionResult {
  /** false on browsers without ServiceWorker / PushManager / Notification. */
  isSupported: boolean;
  /** false until the initial browser-side subscription check finishes. */
  isReady: boolean;
  /** true when the BROWSER has an active subscription for this origin. */
  browserSubscribed: boolean;
  enable: UseMutationResult<RegisterPushSubscriptionResponse, BccApiError | Error, void>;
  disable: UseMutationResult<NotificationPrefs, BccApiError | Error, void>;
}

export function usePushSubscription(): UsePushSubscriptionResult {
  const queryClient = useQueryClient();
  const [isSupported] = useState<boolean>(() => isPushSupported());
  const [isReady, setIsReady] = useState<boolean>(false);
  const [browserSubscribed, setBrowserSubscribed] = useState<boolean>(false);

  // Hydrate the local "browser has a subscription?" flag once on mount.
  // After that, enable/disable mutations update it directly so we don't
  // need the SW to push events to React.
  useEffect(() => {
    if (!isSupported) {
      setIsReady(true);
      return;
    }
    let cancelled = false;
    getCurrentBrowserSubscription()
      .then((sub) => {
        if (cancelled) return;
        setBrowserSubscribed(sub !== null);
        setIsReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setIsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  const enable = useMutation<
    RegisterPushSubscriptionResponse,
    BccApiError | Error,
    void
  >({
    mutationFn: async () => {
      const { public_key } = await getVapidPublicKey();
      const sub = await registerBrowserPush(public_key);
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
      const payload = subscriptionToPayload(sub, userAgent);
      return registerPushSubscription(payload);
    },
    onSuccess: () => {
      setBrowserSubscribed(true);
      // Optimistic local update — server flipped push_master = true as
      // a side effect. Avoid invalidate-then-refetch because the prefs
      // form re-seeds its draft on every query.data change, which would
      // discard any in-flight bell/per-event edits.
      queryClient.setQueryData<NotificationPrefs>(
        NOTIFICATION_PREFS_QUERY_KEY,
        (old) => {
          if (old === undefined) return old;
          return {
            ...old,
            push: {
              ...old.push,
              enabled: true,
            },
          };
        },
      );
    },
  });

  const disable = useMutation<NotificationPrefs, BccApiError | Error, void>({
    mutationFn: async () => {
      // Best-effort browser-side unsubscribe. Even if it throws (e.g.
      // permission revoked, no SW registered, browser quirk) we still
      // need to land the server-side cascade so the dispatcher stops
      // dispatching to dead endpoints.
      try {
        await unregisterBrowserPush();
      } catch (err) {
        console.warn("[bcc-push] unregisterBrowserPush failed", err);
      }
      return patchNotificationPrefs({ push: { enabled: false } });
    },
    onSuccess: (data) => {
      setBrowserSubscribed(false);
      // Cascade-PATCH returns the full prefs tree — prime the cache so
      // the form picks up push.enabled = false on next render.
      queryClient.setQueryData<NotificationPrefs>(
        NOTIFICATION_PREFS_QUERY_KEY,
        data,
      );
    },
  });

  return {
    isSupported,
    isReady,
    browserSubscribed,
    enable,
    disable,
  };
}
