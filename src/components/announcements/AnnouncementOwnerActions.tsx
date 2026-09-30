"use client";

/**
 * Per-announcement owner controls on a list row.
 *
 * The validator-page `can_manage` decides whether this component is
 * mounted at all — whether the management surface is open. It decides
 * **nothing** about whether any particular announcement may be mutated.
 * Each control here consumes the capability belonging to ITS OWN row.
 *
 * Why that distinction is load-bearing: an operator plainly "manages"
 * the validator, but an individual announcement may be archived (pinning
 * is meaningless), scheduled or draft (not yet pinnable), or already
 * pinned. A page-level yes applied to every row would offer actions the
 * server will refuse — and would offer them on rows the operator can see
 * but must not change.
 *
 * Two layers, deliberately not one:
 *   1. the control is disabled when the row's own capability denies it;
 *   2. the handler re-checks that same capability before mutating.
 *
 * (2) is not redundant. Button state is a rendering concern — it can be
 * stale after a refetch, and it is trivially bypassed from a console. The
 * check at the call site is what actually holds.
 */

import { isAllowed, reasonCode } from "@/lib/permissions";
import type { Announcement } from "@/lib/api/types";

/** Why a pin control is inert, in the operator's words. */
export function pinDeniedCopy(reason: string | null): string {
  switch (reason) {
    case "announcement_archived":
      return "Archived announcements can't be pinned.";
    case "announcement_not_published":
      return "Only published announcements can be pinned.";
    case "not_claimer":
      return "You're not the verified operator of this validator.";
    default:
      return "This announcement can't be pinned right now.";
  }
}

interface AnnouncementOwnerActionsProps {
  announcement: Announcement;
  onPin: (announcementId: string, pinned: boolean) => void;
  pending: boolean;
}

export function AnnouncementOwnerActions({
  announcement,
  onPin,
  pending,
}: AnnouncementOwnerActionsProps) {
  // The row's OWN capability. Missing or malformed → false.
  const canPin = isAllowed(announcement.capabilities, "can_pin");
  const deniedReason = reasonCode(announcement.capabilities, "can_pin");

  function handlePin() {
    // Re-check at the call site. The disabled attribute is presentation;
    // this is the gate. A stale render or a devtools click lands here.
    if (!isAllowed(announcement.capabilities, "can_pin")) return;
    onPin(announcement.id, !announcement.is_pinned);
  }

  return (
    <button
      type="button"
      onClick={handlePin}
      disabled={!canPin || pending}
      title={canPin ? undefined : pinDeniedCopy(deniedReason)}
      aria-describedby={canPin ? undefined : `pin-denied-${announcement.id}`}
      className="bcc-mono rounded-sm border border-cardstock-edge px-3 py-2 text-ink disabled:cursor-not-allowed disabled:opacity-50"
      style={{ minHeight: "44px", fontSize: "11px" }}
      data-testid={`announcement-pin-${announcement.id}`}
    >
      {announcement.is_pinned ? "UNPIN" : "PIN"}
      {!canPin && (
        <span id={`pin-denied-${announcement.id}`} className="sr-only">
          {pinDeniedCopy(deniedReason)}
        </span>
      )}
    </button>
  );
}
