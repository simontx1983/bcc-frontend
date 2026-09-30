"use client";

/**
 * The Announcements tab on a validator profile.
 *
 * Two sections: **Active** and **Archived**. Archived announcements are
 * public records — they keep their permalink and their discussion — so
 * they are listed, not hidden; they are simply out of the active flow.
 *
 * Owner controls (compose, pin, archive) render **only** from the
 * server-supplied capability block passed in as `capabilities`. This
 * component never infers authority from page authorship, membership,
 * session presence or any client state, and it has no environment flag.
 * If the server did not grant it, the control does not exist.
 */

import { useState } from "react";

import { AnnouncementComposer } from "@/components/announcements/AnnouncementComposer";
import { AnnouncementListItem } from "@/components/announcements/AnnouncementListItem";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/Skeleton";
import { humanizeCode } from "@/lib/api/errors";
import { isAllowed } from "@/lib/permissions";
import {
  useAnnouncements,
  useCreateAnnouncement,
  useSetAnnouncementPin,
} from "@/hooks/useAnnouncements";
import type { Announcement, AnnouncementFeatureCapabilities } from "@/lib/api/types";

interface AnnouncementsPanelProps {
  pageId: number;
  validatorName: string;
  capabilities: AnnouncementFeatureCapabilities;
}

export function AnnouncementsPanel({
  pageId,
  validatorName,
  capabilities,
}: AnnouncementsPanelProps) {
  const [composerOpen, setComposerOpen] = useState(false);

  const active = useAnnouncements(pageId, { state: "active" });
  const archived = useAnnouncements(pageId, { state: "archived" });
  const create = useCreateAnnouncement(pageId);
  const pin = useSetAnnouncementPin(pageId);

  const canCreate = isAllowed(capabilities, "can_create");
  // Page-scope operator affordance. The per-announcement pin gate lives
  // on the detail response; this only decides whether the control exists.
  const canManage = isAllowed(capabilities, "can_manage");

  const failureCopy = humanizeCode(
    active.error,
    {
      bcc_forbidden: "These announcements aren't visible to you.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
    },
    "Couldn't load announcements. Try again in a moment.",
  );

  const activeItems: Announcement[] =
    active.data?.pages.flatMap((page) => page.items) ?? [];
  const archivedItems: Announcement[] =
    archived.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <article className="bcc-paper">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cardstock-edge px-5 py-4 sm:px-8">
          <h3 className="bcc-stencil text-ink" style={{ fontSize: "18px" }}>
            Announcements
          </h3>
          {canCreate && (
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="bcc-mono rounded-sm border border-cardstock-edge px-4 py-2 text-ink"
              style={{ minHeight: "44px", fontSize: "12px" }}
              data-testid="announcement-compose"
            >
              NEW ANNOUNCEMENT
            </button>
          )}
        </header>

        {active.isError ? (
          <LoadFailure
            surface="paper"
            message={failureCopy}
            onRetry={() => void active.refetch()}
          />
        ) : active.isPending ? (
          <div className="flex flex-col gap-2 px-5 py-6 sm:px-8">
            <Skeleton className="h-20" count={3} />
          </div>
        ) : activeItems.length === 0 ? (
          <div className="px-5 py-12 sm:px-8">
            <p
              className="bcc-mono mb-3 text-safety"
              style={{ fontSize: "10px", letterSpacing: "0.24em" }}
            >
              NOTHING POSTED YET
            </p>
            <h4 className="bcc-stencil text-ink" style={{ fontSize: "26px", lineHeight: 1.05 }}>
              No announcements from {validatorName} yet.
            </h4>
            <p
              className="font-serif italic text-ink-soft"
              style={{ fontSize: "16px", lineHeight: 1.5, marginTop: "10px", maxWidth: "560px" }}
            >
              {canCreate
                ? "Post your first announcement — it appears here and once in the feed."
                : "When the operator posts an update, it will show up here."}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col">
            {activeItems.map((item) => (
              <li key={item.id}>
                <AnnouncementListItem
                  announcement={item}
                  actions={
                    canManage ? (
                      <button
                        type="button"
                        onClick={() =>
                          pin.mutate({ announcementId: item.id, pinned: !item.is_pinned })
                        }
                        disabled={pin.isPending}
                        className="bcc-mono rounded-sm border border-cardstock-edge px-3 py-2 text-ink disabled:opacity-50"
                        style={{ minHeight: "44px", fontSize: "11px" }}
                      >
                        {item.is_pinned ? "UNPIN" : "PIN"}
                      </button>
                    ) : null
                  }
                />
              </li>
            ))}
          </ul>
        )}

        {active.hasNextPage && (
          <div className="px-5 py-4 sm:px-8">
            <button
              type="button"
              onClick={() => void active.fetchNextPage()}
              disabled={active.isFetchingNextPage}
              className="bcc-mono text-safety hover:underline disabled:opacity-50"
              style={{ fontSize: "11px", letterSpacing: "0.12em", minHeight: "44px" }}
            >
              {active.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
            </button>
          </div>
        )}
      </article>

      {/* Archived is its own section, and only appears once there is
          something in it — an empty Archived heading is noise. */}
      {archivedItems.length > 0 && (
        <article className="bcc-paper" data-testid="announcement-archived-section">
          <header className="border-b border-cardstock-edge px-5 py-4 sm:px-8">
            <h3 className="bcc-stencil text-ink" style={{ fontSize: "18px" }}>
              Archived
            </h3>
            <p
              className="font-serif italic text-ink-ghost"
              style={{ fontSize: "14px", marginTop: "4px" }}
            >
              Kept as a record. Still readable, no longer active.
            </p>
          </header>
          <ul className="flex flex-col">
            {archivedItems.map((item) => (
              <li key={item.id}>
                <AnnouncementListItem announcement={item} />
              </li>
            ))}
          </ul>
          {archived.hasNextPage && (
            <div className="px-5 py-4 sm:px-8">
              <button
                type="button"
                onClick={() => void archived.fetchNextPage()}
                disabled={archived.isFetchingNextPage}
                className="bcc-mono text-safety hover:underline disabled:opacity-50"
                style={{ fontSize: "11px", letterSpacing: "0.12em", minHeight: "44px" }}
              >
                {archived.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
              </button>
            </div>
          )}
        </article>
      )}

      {composerOpen && (
        <AnnouncementComposer
          onClose={() => setComposerOpen(false)}
          pending={create.isPending}
          error={create.error}
          onSubmit={async (request) => {
            await create.mutateAsync(request);
            setComposerOpen(false);
          }}
        />
      )}
    </div>
  );
}
