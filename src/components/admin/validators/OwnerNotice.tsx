/**
 * OwnerNotice — the page view's outcome line after an ownership write:
 * a success (status) or a refused write (alert, e.g. a 409). It lives on
 * the page, not in the form, because a successful write changes the
 * owner panel's state and unmounts the form that asked.
 *
 * The status region is always mounted so a screen reader hears the line
 * when it arrives.
 */

import { AdminUserChip } from "@/components/admin/validators/AdminUserChip";
import type { AdminUserRef } from "@/lib/api/types";

export type OwnerPanelNotice =
  | { tone: "status"; text: string; restoredOwner?: AdminUserRef | null }
  | { tone: "alert"; text: string };

/** Shown after a cancel that put the previous owner back. */
export const RESTORED_OWNER_COPY = "Previous owner restored:";

export function OwnerNotice({ notice }: { notice: OwnerPanelNotice | null }) {
  return (
    <>
      <div role="status" className="empty:hidden">
        {notice?.tone === "status" && (
          <div className="bcc-panel flex flex-col gap-2 p-4">
            <p className="font-serif text-bcc-text">{notice.text}</p>
            {notice.restoredOwner !== undefined && notice.restoredOwner !== null && (
              <div className="flex flex-wrap items-center gap-2 font-serif text-bcc-text-secondary">
                <span>{RESTORED_OWNER_COPY}</span>
                <AdminUserChip user={notice.restoredOwner} />
              </div>
            )}
          </div>
        )}
      </div>
      {notice?.tone === "alert" && (
        <p role="alert" className="bcc-panel p-4 font-serif text-bcc-text-error">
          {notice.text}
        </p>
      )}
    </>
  );
}
