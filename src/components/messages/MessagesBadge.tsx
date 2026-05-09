"use client";

/**
 * MessagesBadge — header chip linking to /messages with an unread
 * count. Mirrors NotificationBell's enabled-only behaviour: anonymous
 * viewers render null so we don't fire 401-spam.
 *
 * Adaptive polling lives inside `useUnreadMessageCount` (5s active /
 * 30s idle, with backoff). The badge itself is just a presentational
 * link.
 */

import type { Route } from "next";
import Link from "next/link";

import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";

interface MessagesBadgeProps {
  enabled: boolean;
}

export function MessagesBadge({ enabled }: MessagesBadgeProps) {
  const query = useUnreadMessageCount({ enabled });

  if (!enabled) return null;

  const count = query.data?.count ?? 0;
  const showBadge = count > 0;

  return (
    <Link
      href={"/messages" as Route}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-cardstock transition hover:bg-cardstock-deep/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cardstock"
      aria-label={
        showBadge
          ? `Messages — ${count} unread`
          : "Messages"
      }
    >
      <Icon />
      {showBadge && (
        <span
          aria-hidden
          className="bcc-mono absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-safety px-1 text-[9px] font-semibold leading-none text-cardstock"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

function Icon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M3 5h18v12H7l-4 4z" />
    </svg>
  );
}
