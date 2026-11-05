"use client";

/**
 * The top of a validator page: official notices, above everything else in
 * the page content, and the way to post one.
 *
 * The bar renders nothing when there is nothing posted, so the button is
 * deliberately its own row and not part of the bar. An operator with no
 * announcements yet is exactly the person who needs to reach it.
 *
 * The button exists only on the server's `can_create`, the same capability
 * the Announcements tab reads. That tab stays where it was and still holds
 * the history, the archive and the drafts. `can_manage` is passed through so
 * "Save as draft" is offered only to someone the tab can show the draft to.
 */

import { useState } from "react";

import { AnnouncementBar } from "@/components/announcements/AnnouncementBar";
import { AnnouncementComposer } from "@/components/announcements/AnnouncementComposer";
import { useCreateAnnouncement } from "@/hooks/useAnnouncements";
import type {
  AnnouncementFeatureCapabilities,
  CreateAnnouncementRequest,
} from "@/lib/api/types";
import { isAllowed } from "@/lib/permissions";

interface AnnouncementsTopSectionProps {
  pageId: number;
  capabilities: AnnouncementFeatureCapabilities;
}

export function AnnouncementsTopSection({
  pageId,
  capabilities,
}: AnnouncementsTopSectionProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const create = useCreateAnnouncement(pageId);

  const canCreate = isAllowed(capabilities, "can_create");
  const canManage = isAllowed(capabilities, "can_manage");

  function closeComposer() {
    setComposerOpen(false);
    // A refusal from the last attempt must not greet the next one.
    create.reset();
  }

  return (
    <>
      {canCreate && (
        <div className="mx-auto -mb-4 mt-4 flex max-w-[1440px] justify-end px-4 sm:px-7">
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="bcc-mono rounded-sm border border-bcc-border px-4 py-2 text-bcc-text hover:border-bcc-border-strong"
            style={{ minHeight: "44px", fontSize: "12px" }}
            data-testid="announcement-compose-top"
          >
            NEW ANNOUNCEMENT
          </button>
        </div>
      )}

      <AnnouncementBar pageId={pageId} featureEnabled skeletonWhileLoading={false} />

      {composerOpen && (
        <AnnouncementComposer
          onClose={closeComposer}
          pending={create.isPending}
          error={create.error}
          canReopenDrafts={canManage}
          onSubmit={async (request) => {
            try {
              // Mounted in `create` variant, so the payload is always a create
              // request; the prop is widened for the form's edit variants.
              await create.mutateAsync(request as CreateAnnouncementRequest);
              closeComposer();
            } catch {
              // `create.error` carries it into the open dialog. The draft
              // stays in the form.
            }
          }}
        />
      )}
    </>
  );
}
