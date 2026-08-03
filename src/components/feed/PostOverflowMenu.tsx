"use client";

/**
 * PostOverflowMenu — zone-2 "⋯" affordance shared by FeedItemCard and
 * PostDetail. Copy link, plus Report when `item` is passed and the
 * viewer is allowed to report it (folded in here rather than living as
 * its own footer link, so Report never appears in two places).
 */

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { canReportFeedItem, ReportModal, resolveTargetId } from "@/components/feed/ReportButton";
import { useCopyConfirm } from "@/hooks/useCopyConfirm";
import { useDeletePostMutation } from "@/hooks/useDeletePost";
import type { FeedItem } from "@/lib/api/types";

export function PostOverflowMenu({ selfHref, item }: { selfHref: string; item?: FeedItem }) {
  const [open, setOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const { copied, copy } = useCopyConfirm();
  const containerRef = useRef<HTMLDivElement>(null);
  const canReport = item !== undefined && canReportFeedItem(item);
  const canDelete = item !== undefined && item.permissions["can_delete"]?.allowed === true;
  const deleteMutation = useDeletePostMutation();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirmingDelete(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setConfirmingDelete(false);
      }
    };
    window.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => {
            const next = !o;
            if (!next) setConfirmingDelete(false);
            return next;
          });
        }}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="bcc-mono inline-flex min-h-[20px] items-center px-1 text-[var(--bcc-text-secondary)] hover:text-[var(--bcc-text)]"
      >
        <MoreHorizontal size={15} strokeWidth={2} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className="bcc-panel absolute right-0 top-full z-20 mt-1 min-w-[140px] p-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void copy(`${window.location.origin}${selfHref}`);
            }}
            className="bcc-mono block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--bcc-text-secondary)] hover:bg-[var(--bcc-surface-active)] hover:text-[var(--bcc-text)]"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          {canReport && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setReportOpen(true);
              }}
              className="bcc-mono block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-[var(--bcc-text-secondary)] hover:bg-[var(--bcc-surface-active)] hover:text-safety"
            >
              Report
            </button>
          )}
          {canDelete && item !== undefined && (
            <button
              type="button"
              role="menuitem"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!confirmingDelete) {
                  setConfirmingDelete(true);
                  return;
                }
                deleteMutation.mutate(item.id, {
                  onSettled: () => {
                    setOpen(false);
                    setConfirmingDelete(false);
                  },
                });
              }}
              className="bcc-mono block w-full rounded-lg px-2 py-1.5 text-left text-[11px] text-safety hover:bg-[var(--bcc-surface-active)] disabled:opacity-50"
            >
              {deleteMutation.isPending
                ? "Deleting…"
                : confirmingDelete
                ? "Confirm delete?"
                : "Delete"}
            </button>
          )}
        </div>
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
