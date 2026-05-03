"use client";

/**
 * §V1.5 — fires the device-fingerprint POST exactly once per session
 * for every authenticated viewer.
 *
 * Design choices:
 *   - **Once per session per user.** Keyed by `bcc:fp_reported:<userId>`
 *     in sessionStorage. A fresh tab → new sessionStorage → re-report.
 *     Logging out + back in as a different user re-reports under the
 *     new id. This matches the legacy WP-side behavior (post-on-load).
 *   - **Fail silently.** Fraud signal collection must never block UX or
 *     surface errors. A failed post just means the server doesn't get
 *     this round of data — next page load tries again.
 *   - **Idle-deferred.** Runs through `requestIdleCallback` (or a 2s
 *     setTimeout fallback) so it competes with nothing on the critical
 *     render path. The signal value isn't time-sensitive.
 *   - **Renders nothing.** Mount in providers.tsx and forget.
 *
 * Not gated on any particular page — it runs on every authenticated
 * surface so we capture sessions that come in via /signup, /login,
 * deep links, etc.
 */

import { useEffect } from "react";
import { useSession } from "next-auth/react";

import { postFingerprint } from "@/lib/api/fingerprint-endpoints";
import { collectFingerprint } from "@/lib/fingerprint/collect";

export function FingerprintReporter() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (typeof window === "undefined") return;

    const userId = session?.user?.id;
    if (typeof userId !== "string" && typeof userId !== "number") return;

    const key = `bcc:fp_reported:${userId}`;
    let reported: string | null = null;
    try {
      reported = window.sessionStorage.getItem(key);
    } catch {
      // sessionStorage unavailable (private mode w/ blocked storage).
      // Treat as "already reported" — better to skip than to spam.
      return;
    }
    if (reported === "1") return;

    let cancelled = false;
    const run = async () => {
      try {
        const payload = await collectFingerprint();
        if (cancelled) return;
        await postFingerprint(payload);
        if (cancelled) return;
        try {
          window.sessionStorage.setItem(key, "1");
        } catch {
          // No-op — we'll just retry next page load.
        }
      } catch {
        // Silent — fraud signal collection never blocks UX.
      }
    };

    // Defer to idle. Falls back to setTimeout(2s) where rIC isn't
    // available (Safari < 16.4).
    const ric = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        cancelIdleCallback?: (handle: number) => void;
      }
    ).requestIdleCallback;

    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    if (typeof ric === "function") {
      idleHandle = ric(() => {
        void run();
      }, { timeout: 5_000 });
    } else {
      timeoutHandle = window.setTimeout(() => {
        void run();
      }, 2_000);
    }

    return () => {
      cancelled = true;
      const cancelRic = (window as Window & {
        cancelIdleCallback?: (handle: number) => void;
      }).cancelIdleCallback;
      if (idleHandle !== null && typeof cancelRic === "function") {
        cancelRic(idleHandle);
      }
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [status, session?.user?.id]);

  return null;
}
