"use client";

/**
 * useUnreadMessageCount — thin shim over `useBadges`.
 *
 * Before the polling-coalesce work this owned its own adaptive
 * polling against /me/messages/unread-count. The polling now lives
 * in {@link BadgesProvider} which fires one /me/badges request and
 * serves both this hook and the bell-badge hook from the same query.
 * The cadence + auth gating moved with it (see useBadges.ts); this
 * hook just selects its slice of the payload and returns the same
 * shape callers used before so MessagesBadge.tsx stays unchanged.
 *
 * Returns `{ count: 0 }` while the first /me/badges fetch is in
 * flight (or for anonymous viewers — the Provider never fires the
 * query then). That matches the previous "no data yet" UX where the
 * badge was simply hidden until the first response landed.
 */

import { useBadges } from "@/hooks/useBadges";
import type { BccApiError, UnreadMessageCountResponse } from "@/lib/api/types";

export const UNREAD_MESSAGE_COUNT_QUERY_KEY = ["messages", "unread-count"] as const;

export interface UseUnreadMessageCountOptions {
  /**
   * Retained for source-compat with the previous hook signature.
   * Auth gating is now centralised in `BadgesProvider` (it reads
   * `useSession()`), so this flag is ignored at runtime — callers
   * can drop it on their next pass through the file.
   */
  enabled?: boolean;
}

export interface UseUnreadMessageCountResult {
  data: UnreadMessageCountResponse | undefined;
  isLoading: boolean;
  error: BccApiError | null;
}

export function useUnreadMessageCount(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for source-compat with the legacy hook signature; auth gating moved into BadgesProvider
  _options: UseUnreadMessageCountOptions = {},
): UseUnreadMessageCountResult {
  const { data, isLoading, error } = useBadges();

  return {
    data: data === undefined ? undefined : { count: data.messages_unread },
    isLoading,
    error,
  };
}
