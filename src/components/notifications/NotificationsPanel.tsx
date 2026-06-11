"use client";

/**
 * NotificationsPanel — the shared §I1 notification list panel.
 *
 * Extracted from NotificationBell.tsx (§11 reuse) so the desktop
 * SiteHeader notifications modal and the mobile bell dropdown render
 * the SAME rows and states instead of forking. The panel owns:
 *   - the list query (useNotifications — only fetches while `open`),
 *   - mark-read on row click + the "Mark all read" bulk action,
 *   - loading / error / empty / load-more states,
 *   - navigation to the server-built `link` (calls `onNavigate` first
 *     so the host surface can close itself).
 *
 * Hosts:
 *   - NotificationBell wraps it in its dropdown chrome (mobile sheet).
 *   - SiteHeader's NotifModal wraps it in the header-modal chrome and
 *     passes showTitle={false} — the modal head already renders a
 *     "Notifications" title + "See all" link, so the panel's own
 *     strip collapses to just the Mark-all action when present.
 *
 * Row rendering, copy, and the unread-count gating for "Mark all
 * read" are verbatim from NotificationBell — do not let the two
 * surfaces drift apart again.
 */

import type { Route } from "next";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/identity/Avatar";
import {
  useMarkReadMutation,
  useNotifications,
  useUnreadCount,
} from "@/hooks/useNotifications";
import type { NotificationItem } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

interface NotificationsPanelProps {
  /** False for anon — the hooks short-circuit without firing. */
  enabled: boolean;
  /** The list only fetches while the host surface is open. */
  open: boolean;
  /**
   * Render the "NOTIFICATIONS" strip label. Default true (bell
   * dropdown). SiteHeader's modal passes false — its chrome already
   * carries the title.
   */
  showTitle?: boolean;
  /** Called before navigating so the host can close its surface. */
  onNavigate: () => void;
}

export function NotificationsPanel({
  enabled,
  open,
  showTitle = true,
  onNavigate,
}: NotificationsPanelProps) {
  const router = useRouter();

  const unread = useUnreadCount({ enabled });
  const list = useNotifications({ enabled: enabled && open });
  const markRead = useMarkReadMutation();

  const unreadCount = unread.data?.unread_count ?? 0;
  const items: NotificationItem[] = (list.data?.pages ?? []).flatMap((p) => p.items);

  const handleItemClick = (item: NotificationItem) => {
    if (!item.read) {
      markRead.mutate(item.id);
    }
    onNavigate();
    router.push(item.link as Route);
  };

  const handleMarkAll = () => {
    if (unreadCount === 0) return;
    markRead.mutate(undefined);
  };

  const showMarkAll = unreadCount >= 3;

  return (
    <div
      role="menu"
      className="flex flex-col gap-px overflow-hidden"
      style={{ background: "rgba(15,13,9,0.06)" }}
    >
      {(showTitle || showMarkAll) && (
        <div
          className={
            "flex items-center bg-cardstock px-4 py-2.5 " +
            (showTitle ? "justify-between" : "justify-end")
          }
        >
          {showTitle && (
            <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
              NOTIFICATIONS
            </span>
          )}
          {showMarkAll && (
            <button
              type="button"
              onClick={handleMarkAll}
              disabled={markRead.isPending}
              className="bcc-mono text-[10px] tracking-[0.16em] normal-case text-blueprint hover:underline disabled:cursor-not-allowed disabled:text-ink-soft/40"
            >
              {markRead.isPending ? "Marking…" : "Mark all read"}
            </button>
          )}
        </div>
      )}

      {list.isError ? (
        <div className="bcc-mono bg-cardstock px-4 py-3 text-[11px] text-ink-soft">
          Couldn’t load notifications. Try again in a moment.
        </div>
      ) : list.isLoading ? (
        <div className="bcc-mono bg-cardstock px-4 py-3 text-[11px] text-ink-soft">
          Loading…
        </div>
      ) : items.length === 0 ? (
        // Sprint 5 empty-state hygiene: "No notifications yet. We'll
        // let you know when something happens." was the SaaS-dashboard
        // inbox-notify framing ("we'll notify you"). Replaced with
        // "Nothing on file." — the workshop/ledger vocabulary the
        // rest of the product uses (FILE 01-07 frames on profile,
        // "on the books" on locals empty). Observational; no
        // promise; no system-speaking-at-you.
        <div className="bcc-mono bg-cardstock px-4 py-6 text-center text-[11px] text-ink-soft">
          Nothing on file.
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

        {/*
          Sprint 1 Identity Grammar — actor Avatar gives the bell social
          presence. NotificationActor ships handle / display_name /
          avatar_url (types.ts:848-854); rank+tier are NOT on the actor
          view-model so we render the plain Avatar (no tier ring,
          gracefully degrades to initials when avatar_url is empty).
        */}
        <span aria-hidden className="mt-0.5 shrink-0">
          <Avatar
            avatarUrl={item.actor.avatar_url === "" ? null : item.actor.avatar_url}
            handle={item.actor.handle}
            displayName={item.actor.display_name}
            size="sm"
            variant="rounded"
          />
        </span>

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
