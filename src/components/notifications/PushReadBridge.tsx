"use client";

/**
 * F-516: when a push is opened, mark the bell rows it stood for as read.
 *
 * The service worker cannot call the API (the bearer lives in the page),
 * so it hands the push's `notification_ids` over in one of two ways:
 *   - a tab it OPENS gets them as `?bcc_read=` on the URL. Read once, then
 *     dropped from the address bar, so a reload or a shared link never
 *     carries them;
 *   - a tab already on the push's URL (which the worker focuses, never
 *     navigates) gets them as a `bcc:mark-read` message.
 *
 * Signed-in viewers only, and only a parsed 1–50 id list: anything else
 * marks nothing. Renders nothing.
 */

import { useEffect } from "react";
import { useSession } from "next-auth/react";

import { useMarkPushedReadMutation } from "@/hooks/useNotifications";
import {
  PUSH_READ_MESSAGE,
  PUSH_READ_PARAM,
  parsePushReadIds,
} from "@/lib/push/push-read-ids";

function isPushReadMessage(data: unknown): data is { type: string; ids: unknown } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === PUSH_READ_MESSAGE
  );
}

export function PushReadBridge() {
  const { status } = useSession();
  const { mutate } = useMarkPushedReadMutation();

  // A tab the push opened: the ids ride on the URL.
  useEffect(() => {
    if (status === "loading") return;
    const url = new URL(window.location.href);
    const raw = url.searchParams.get(PUSH_READ_PARAM);
    if (raw === null) return;

    url.searchParams.delete(PUSH_READ_PARAM);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    if (status !== "authenticated") return;
    const ids = parsePushReadIds(raw);
    if (ids !== null) mutate(ids);
  }, [status, mutate]);

  // A tab already open on the push's URL: the worker posts the ids.
  useEffect(() => {
    if (status !== "authenticated") return;
    const worker = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
    if (worker === undefined) return;

    const onMessage = (event: MessageEvent<unknown>) => {
      if (!isPushReadMessage(event.data)) return;
      const ids = parsePushReadIds(event.data.ids);
      if (ids !== null) mutate(ids);
    };
    worker.addEventListener("message", onMessage);
    return () => worker.removeEventListener("message", onMessage);
  }, [status, mutate]);

  return null;
}
