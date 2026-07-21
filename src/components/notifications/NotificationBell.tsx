"use client";

/**
 * NotificationBell — §I1 bell button + dropdown.
 *
 * Behaviour:
 *   - Closed state: bell icon + unread-count badge (max "9+").
 *   - Open state: dropdown of recent notifications (newest first) —
 *     rendered by the shared NotificationsPanel (also used by the
 *     desktop SiteHeader's notifications modal; do not fork the row
 *     rendering here).
 *   - Polls unread count every 60s + on window focus (via
 *     useUnreadCount). The list itself only fetches when the
 *     dropdown opens (NotificationsPanel gates on `open`).
 *
 * Auth gating: parent passes `enabled` (= viewerHandle !== null).
 * The component renders nothing for anon viewers.
 *
 * Accessibility:
 *   - Trigger has aria-haspopup + aria-expanded
 *   - Dropdown content is a list with role="menu" (inside the panel)
 *   - Esc + outside-click close the dropdown (mirrors the
 *     SiteHeader avatar menu)
 *   - The unread badge is hidden from screen readers when count is 0
 */

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { useUnreadCount } from "@/hooks/useNotifications";

interface NotificationBellProps {
  /** False for anon — the component renders null in that case. */
  enabled: boolean;
}

export function NotificationBell({ enabled }: NotificationBellProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const unread = useUnreadCount({ enabled });

  // Sprint 2 — "the room acknowledged the operator." When unread count
  // transitions n → n+m (m > 0), trigger a one-shot phosphor wash on
  // the bell SVG via the `bcc-bell-acknowledge` keyframe. ONE channel:
  // the bell warms; the badge count changes value silently (no count-
  // bump). The acknowledgment is the bell; the count is the fact.
  //
  // Implementation notes:
  //   - prevUnreadRef holds the last-seen count. On mount it's seeded
  //     with the current count so a cold-load with 3 unread doesn't
  //     fire the wash (the user just arrived; that's not an arrival
  //     event, it's a state).
  //   - acknowledgeKey is bumped on each detected delta-up; passing
  //     it as the React `key` on the bell wrapper re-mounts the SVG
  //     and re-fires the one-shot animation reliably.
  //   - The hook does NOT decrement-detect (marking all read → 0 is
  //     a user-initiated state change, not the room noticing
  //     something for you).
  const prevUnreadRef = useRef<number | null>(null);
  const [acknowledgeKey, setAcknowledgeKey] = useState(0);
  const unreadCount = unread.data?.unread_count ?? 0;
  useEffect(() => {
    if (prevUnreadRef.current === null) {
      prevUnreadRef.current = unreadCount;
      return;
    }
    if (unreadCount > prevUnreadRef.current) {
      setAcknowledgeKey((k) => k + 1);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  // Close on outside click + Escape — same primitive pattern used by
  // GlobalSearch and the SiteHeader avatar menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current === null) return;
      if (!(event.target instanceof Node)) return;
      if (containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!enabled) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        className="bcc-btn bcc-btn-ghost relative"
      >
        <span
          key={acknowledgeKey}
          aria-hidden
          className={
            acknowledgeKey > 0
              ? "inline-block motion-safe:animate-[bcc-bell-acknowledge_320ms_ease-out]"
              : "inline-block"
          }
        >
          <BellIcon />
        </span>
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="bcc-mono absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] tracking-tight"
            style={{
              background: "var(--safety)",
              color: "var(--cardstock)",
              opacity: 0.88,
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="bcc-panel absolute right-0 top-full z-30 mt-1 w-[min(24rem,90vw)] overflow-hidden">
          <NotificationsPanel
            enabled={enabled}
            open={open}
            onNavigate={() => setOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
