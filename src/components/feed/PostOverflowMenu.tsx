"use client";

/**
 * PostOverflowMenu — zone-2 "⋯" affordance shared by FeedItemCard and
 * PostDetail. Copy link, plus Report when `item` is passed and the
 * viewer is allowed to report it (folded in here rather than living as
 * its own footer link, so Report never appears in two places).
 *
 * Delete (H8 + M1): asks in the shared ConfirmDialog — the same pattern as
 * deleting a comment — and a failure shows there with TRY AGAIN instead of
 * the menu silently closing. On success the post leaves every cached feed;
 * a host that keeps rendering it (PostDetail, which reads its own cache
 * entry seeded from the server render) passes `onDeleted` so it can say
 * "Post deleted" instead of leaving the post on screen.
 *
 * Keyboard (F-264): the shared menu-button contract from `useMenuButton`
 * (the same one ActionMenu uses): Enter / Space / ArrowDown open at the
 * first item, ArrowUp at the last, arrows move and wrap, Home / End,
 * Escape closes and returns focus to "⋯", Tab closes. Copy link keeps the
 * menu open so "Copied" can show; Report and Delete close it, put focus
 * back on "⋯", and then open their dialog, which returns focus there when
 * it closes.
 */

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { canReportFeedItem, ReportModal, resolveTargetId } from "@/components/feed/ReportButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useCopyConfirm } from "@/hooks/useCopyConfirm";
import { useDeletePostMutation } from "@/hooks/useDeletePost";
import { useMenuButton } from "@/hooks/useMenuButton";
import { humanizeCode } from "@/lib/api/errors";
import type { FeedItem } from "@/lib/api/types";

/** §γ — keyed on err.code, never err.message. */
function humanizeDeletePostError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in again to delete this post.",
      bcc_forbidden: "You can only delete your own posts.",
      bcc_not_found: "This post was already deleted.",
      bcc_rate_limited: "Too fast — wait a moment and try again.",
    },
    "Couldn't delete this post. Try again.",
  );
}

export function PostOverflowMenu({
  selfHref,
  item,
  onDeleted,
}: {
  selfHref: string;
  item?: FeedItem;
  /** Called after a successful delete, for hosts that still show the post. */
  onDeleted?: () => void;
}) {
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { copied, copy } = useCopyConfirm();
  const canReport = item !== undefined && canReportFeedItem(item);
  const canDelete = item !== undefined && item.permissions["can_delete"]?.allowed === true;
  const deleteMutation = useDeletePostMutation();
  // Items in DOM order: Copy link, then Report and Delete when shown.
  const reportIndex = 1;
  const deleteIndex = canReport ? 2 : 1;
  const menu = useMenuButton({ itemCount: 1 + (canReport ? 1 : 0) + (canDelete ? 1 : 0) });

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        ref={menu.triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          menu.toggle();
        }}
        onKeyDown={menu.onTriggerKeyDown}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-controls={menu.open ? menu.menuId : undefined}
        className="bcc-mono -my-3 -mr-3 inline-flex min-h-11 min-w-11 items-center justify-center text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]"
      >
        <MoreHorizontal size={15} strokeWidth={2} aria-hidden />
      </button>
      {menu.open && (
        <div
          id={menu.menuId}
          ref={menu.menuRef}
          role="menu"
          aria-label="More actions"
          onKeyDown={menu.onMenuKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="bcc-panel absolute right-0 top-full z-20 mt-1 min-w-[140px] p-1"
        >
          <button
            type="button"
            role="menuitem"
            ref={menu.itemRef(0)}
            tabIndex={menu.activeIndex === 0 ? 0 : -1}
            onMouseEnter={() => menu.hover(0)}
            onClick={() => {
              void copy(`${window.location.origin}${selfHref}`);
            }}
            className="bcc-mono flex min-h-[44px] w-full items-center rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--bcc-text-secondary)] hover:bg-[var(--bcc-surface-active)] hover:text-[var(--bcc-text)]"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          {canReport && (
            <button
              type="button"
              role="menuitem"
              ref={menu.itemRef(reportIndex)}
              tabIndex={menu.activeIndex === reportIndex ? 0 : -1}
              onMouseEnter={() => menu.hover(reportIndex)}
              onClick={() => menu.closeThen(() => setReportOpen(true), { returnFocus: true })}
              className="bcc-mono flex min-h-[44px] w-full items-center rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--bcc-text-secondary)] hover:bg-[var(--bcc-surface-active)] hover:text-bcc-text-safety"
            >
              Report
            </button>
          )}
          {canDelete && item !== undefined && (
            <button
              type="button"
              role="menuitem"
              ref={menu.itemRef(deleteIndex)}
              tabIndex={menu.activeIndex === deleteIndex ? 0 : -1}
              onMouseEnter={() => menu.hover(deleteIndex)}
              onClick={() =>
                menu.closeThen(
                  () => {
                    deleteMutation.reset();
                    setConfirmingDelete(true);
                  },
                  { returnFocus: true },
                )
              }
              className="bcc-mono flex min-h-[44px] w-full items-center rounded-lg px-2 py-1.5 text-left text-[11px] text-bcc-text-safety hover:bg-[var(--bcc-surface-active)]"
            >
              Delete
            </button>
          )}
        </div>
      )}
      {confirmingDelete && item !== undefined && (
        <ConfirmDialog
          title="Delete this post?"
          body="It will be removed everywhere it appears."
          confirmLabel="DELETE"
          cancelLabel="CANCEL"
          retryLabel="TRY AGAIN"
          errorMessage={deleteMutation.error ? humanizeDeletePostError(deleteMutation.error) : null}
          pending={deleteMutation.isPending}
          onConfirm={() => {
            deleteMutation.reset();
            deleteMutation.mutate(item.id, {
              onSuccess: () => {
                setConfirmingDelete(false);
                onDeleted?.();
              },
            });
          }}
          onCancel={() => {
            deleteMutation.reset();
            setConfirmingDelete(false);
          }}
        />
      )}
      {reportOpen && item !== undefined && (
        <ReportModal
          targetKind="feed_item"
          targetId={resolveTargetId(item)}
          onClose={() => setReportOpen(false)}
        />
      )}
    </div>
  );
}
