"use client";

/**
 * NotificationBell — §I1 bell button + dropdown for the SiteHeader.
 *
 * Behaviour:
 *   - Closed state: bell icon + unread-count badge (max "9+").
 *   - Open state: dropdown of recent notifications (newest first),
 *     each linking to the server-built `link`. Click marks the row
 *     read; "Mark all read" header button bulk-clears.
 *   - Polls unread count every 60s + on window focus (via
 *     useUnreadCount). The list itself only fetches when the
 *     dropdown opens.
 *
 * Auth gating: parent passes `enabled` (= viewerHandle !== null).
 * The component renders nothing for anon viewers.
 *
 * Accessibility:
 *   - Trigger has aria-haspopup + aria-expanded
 *   - Dropdown is a list with role="menu" and items as menuitems
 *   - Esc + outside-click close the dropdown (mirrors ViewerMenu)
 *   - The unread badge is hidden from screen readers when count is 0
 */

import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useMarkReadMutation,
  useNotifications,
  useUnreadCount,
} from "@/hooks/useNotifications";
import type { NotificationItem } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

interface NotificationBellProps {
  /** False for anon — the component renders null in that case. */
  enabled: boolean;
}

export function NotificationBell({ enabled }: NotificationBellProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);

  const unread = useUnreadCount({ enabled });
  const list = useNotifications({ enabled: enabled && open });
  const markRead = useMarkReadMutation();

  // Close on outside click + Escape — same primitive pattern used by
  // GlobalSearch and ViewerMenu.
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

  const unreadCount = unread.data?.unread_count ?? 0;
  const items: NotificationItem[] = (list.data?.pages ?? []).flatMap((p) => p.items);

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) {
      markRead.mutate(item.id);
    }
    setOpen(false);
    router.push(item.link as Route);
  };

  const handleMarkAll = () => {
    if (unreadCount === 0) return;
    markRead.mutate(undefined);
  };

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
        <BellIcon />
        {unreadCount > 0 && (
          <span
            aria-hidden
            className="bcc-mono absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] tracking-tight"
            style={{
              background: "var(--safety)",
              color: "var(--cardstock)",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="bcc-panel absolute right-0 top-full z-30 mt-1 flex w-[min(24rem,90vw)] flex-col gap-px overflow-hidden"
          style={{ background: "rgba(15,13,9,0.06)" }}
        >
          <div className="flex items-center justify-between bg-cardstock px-4 py-2.5">
            <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
              NOTIFICATIONS
            </span>
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={unreadCount === 0 || markRead.isPending}
              className="bcc-mono text-[10px] tracking-[0.16em] text-blueprint hover:underline disabled:cursor-not-allowed disabled:text-ink-soft/40"
            >
              {markRead.isPending ? "MARKING…" : "MARK ALL READ"}
            </button>
          </div>

          {list.isError ? (
            <div className="bcc-mono bg-cardstock px-4 py-3 text-[11px] text-ink-soft">
              Couldn’t load notifications. Try again in a moment.
            </div>
          ) : list.isLoading ? (
            <div className="bcc-mono bg-cardstock px-4 py-3 text-[11px] text-ink-soft">
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="bcc-mono bg-cardstock px-4 py-6 text-center text-[11px] text-ink-soft">
              No notifications yet. We’ll let you know when something happens.
            </div>
          ) : (
            <ul role="presentation" className="flex max-h-[60vh] flex-col gap-px overflow-y-auto">
              {items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  onActivate={() => handleItemClick(item)}
                />
              ))}
              {list.hasNextPage && (
                <li>
                  <button
                    type="button"
                    onClick={() => void list.fetchNextPage()}
                    disabled={list.isFetchingNextPage}
                    className="bcc-mono w-full bg-cardstock px-4 py-2.5 text-center text-[10px] tracking-[0.18em] text-blueprint hover:bg-cardstock-deep disabled:cursor-wait"
                  >
                    {list.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

interface NotificationRowProps {
  item: NotificationItem;
  onActivate: () => void;
}

function NotificationRow({ item, onActivate }: NotificationRowProps) {
  return (
    <li role="menuitem">
      <button
        type="button"
        onClick={onActivate}
        className={
          "flex w-full items-start gap-3 px-4 py-3 text-left transition " +
          (item.read ? "bg-cardstock hover:bg-cardstock-deep" : "bg-cardstock-deep/50 hover:bg-cardstock-deep")
        }
      >
        {!item.read && (
          <span
            aria-hidden
            className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: "var(--blueprint)" }}
          />
        )}
        {item.read && <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0" />}

        <span className="flex flex-1 flex-col gap-1 overflow-hidden">
          <span className="bcc-stencil text-sm text-ink">
            {item.message}
          </span>
          {item.created_at !== "" && (
            <span className="bcc-mono text-[10px] tracking-[0.12em] text-ink-soft/70">
              {formatRelativeTime(item.created_at)}
            </span>
          )}
        </span>
      </button>
    </li>
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

