/**
 * The notifications list's React Query key, in its own module so both the
 * list hook (useNotifications) and the badge poller (useBadges, which
 * invalidates the list when the unread count rises) can import it without
 * an import cycle (useNotifications already imports useBadges).
 */
export const NOTIFICATIONS_QUERY_KEY = ["me", "notifications"] as const;
