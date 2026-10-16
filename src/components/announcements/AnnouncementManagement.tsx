"use client";

/**
 * The operator's drafts and scheduled notices.
 *
 * ## Why this exists
 *
 * The composer offered "Save as draft" and nothing listed drafts, so a
 * saved draft had no route back: the server stored it, the product could
 * not show it, and the composer closed without saying either way. This
 * is the surface that asks for them — `GET /me/validators/:pageId/announcements`
 * with `?status=draft` and `?status=scheduled`.
 *
 * ## Strictly operator-only
 *
 * Mounted only when the page-scope `can_manage` is allowed, and the
 * queries are additionally gated on it. The route answers `403
 * not_claimer` to anyone who is not the resolved operator — including
 * anonymous viewers — so asking speculatively would mean a guaranteed
 * 403 on every ordinary visitor's validator page. Rows here are
 * unpublished: they must never reach a viewer who is not the operator,
 * and the viewer-scoped cache key is what stops one operator's drafts
 * being served to the next viewer in the same browser.
 *
 * ## What is NOT offered, deliberately
 *
 * ⛔ **No discard or delete.** There is no DELETE route for an
 * announcement. Archive is the only adjacent verb and it is NOT a safe
 * discard: `POST …/archive` on a never-published draft returns 200 and
 * the row then appears on NO list surface — not the owner's four
 * statuses, not either public state — and archive is one-way. Wiring a
 * "Discard" to it would destroy the draft silently and irreversibly,
 * which is the exact failure this surface exists to remove. Drafts are
 * undeletable today and the UI says so rather than offering an action
 * that loses them.
 *
 * ⚠ **Publish has no server capability to gate on.** There is no
 * `can_publish` entry anywhere in the backend, so the control is
 * inferred from the row's `status` plus `can_edit`. The consequence is
 * recorded rather than hidden: the server cannot withhold publish
 * without a client change, which is the property the capability model
 * exists to give.
 */

import { useState } from "react";

import { AnnouncementComposer } from "@/components/announcements/AnnouncementComposer";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/Skeleton";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";
import { isAllowed } from "@/lib/permissions";
import { formatAbsoluteDateTime } from "@/lib/format";
import {
  useAnnouncement,
  useOwnerAnnouncements,
  usePublishAnnouncement,
  useUpdateAnnouncement,
} from "@/hooks/useAnnouncements";
import type {
  OwnerAnnouncementListItem,
  UpdateAnnouncementRequest,
} from "@/lib/api/types";

/** Copy keyed on `err.code`, never on `err.message`. */
function managementFailureCopy(error: unknown): string {
  return humanizeCode(
    error,
    {
      bcc_unauthorized: "Sign in again to manage these.",
      bcc_forbidden: "You're not the verified operator of this validator any more.",
      bcc_permission_denied: "You can't manage this validator's announcements.",
      bcc_blocked: "You can't manage this validator's announcements.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable: "Your drafts are temporarily unavailable. Try again shortly.",
      bcc_conflict: "That announcement has already moved on — reload to see where it is.",
    },
    "Couldn't load your drafts. Try again in a moment.",
  );
}

/** The local wall-clock form `datetime-local` wants, from a UTC instant. */
function isoToLocalInput(iso: string | null): string | undefined {
  if (iso === null || iso === "") return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}`
  );
}

interface AnnouncementManagementProps {
  pageId: number;
  /** The page-scope capability. Mount only when this is allowed. */
  canManage: boolean;
}

export function AnnouncementManagement({
  pageId,
  canManage,
}: AnnouncementManagementProps) {
  const drafts = useOwnerAnnouncements(pageId, { status: "draft", enabled: canManage });
  const scheduled = useOwnerAnnouncements(pageId, {
    status: "scheduled",
    enabled: canManage,
  });

  if (!canManage) return null;

  const draftRows = (drafts.data?.pages ?? []).flatMap((p) => p.items);
  const scheduledRows = (scheduled.data?.pages ?? []).flatMap((p) => p.items);

  const loading = drafts.isPending || scheduled.isPending;
  // Either bucket failing on FIRST load is worth surfacing; a failure
  // here means the operator cannot reach their own unpublished work, and
  // silently showing "nothing" would be the stranding again.
  const firstLoadError = drafts.isLoadingError
    ? drafts.error
    : scheduled.isLoadingError
      ? scheduled.error
      : null;

  if (loading) {
    return (
      <article className="bcc-paper" data-testid="announcement-management">
        <ManagementHeader />
        <div className="flex flex-col gap-2 px-5 py-6 sm:px-8">
          <Skeleton className="h-16" count={2} />
        </div>
      </article>
    );
  }

  if (firstLoadError !== null) {
    const denied = isPermissionDenial(firstLoadError);
    return (
      <article className="bcc-paper" data-testid="announcement-management">
        <ManagementHeader />
        <div className="px-5 py-6 sm:px-8">
          <LoadFailure
            surface="paper"
            message={managementFailureCopy(firstLoadError)}
            {...(denied
              ? {}
              : {
                  onRetry: () => {
                    void drafts.refetch();
                    void scheduled.refetch();
                  },
                })}
          />
        </div>
      </article>
    );
  }

  // Nothing unpublished and nothing failed — say so rather than render an
  // empty frame. The claim is safe here precisely because neither read
  // errored.
  const empty = draftRows.length === 0 && scheduledRows.length === 0;

  return (
    <article className="bcc-paper" data-testid="announcement-management">
      <ManagementHeader />

      {empty ? (
        <p
          className="font-serif italic text-ink-soft px-5 py-6 sm:px-8"
          style={{ fontSize: "15px" }}
        >
          Nothing unpublished. Drafts and scheduled announcements appear here.
        </p>
      ) : (
        <ul className="flex flex-col">
          {draftRows.map((row) => (
            <li key={row.id}>
              <ManagementRow pageId={pageId} row={row} kind="draft" />
            </li>
          ))}
          {scheduledRows.map((row) => (
            <li key={row.id}>
              <ManagementRow pageId={pageId} row={row} kind="scheduled" />
            </li>
          ))}
        </ul>
      )}

      {/* A refresh that failed after rows were already on screen keeps the
          rows and localises the recovery, same rule as the panels. */}
      {(drafts.isRefetchError || scheduled.isRefetchError) && (
        <div className="px-5 sm:px-8">
          <LoadFailure
            surface="paper"
            message={managementFailureCopy(drafts.error ?? scheduled.error)}
            onRetry={() => {
              void drafts.refetch();
              void scheduled.refetch();
            }}
          />
        </div>
      )}
    </article>
  );
}

function ManagementHeader() {
  return (
    <header className="border-b border-cardstock-edge px-5 py-4 sm:px-8">
      <h3 className="bcc-stencil text-ink" style={{ fontSize: "18px" }}>
        Drafts &amp; scheduled
      </h3>
      <p
        className="font-serif italic text-ink-ghost"
        style={{ fontSize: "14px", marginTop: "4px" }}
      >
        Only you can see these. They can’t be deleted yet — publishing or
        editing is all this does.
      </p>
    </header>
  );
}

function ManagementRow({
  pageId,
  row,
  kind,
}: {
  pageId: number;
  row: OwnerAnnouncementListItem;
  kind: "draft" | "scheduled";
}) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateAnnouncement(pageId, row.id);
  const publish = usePublishAnnouncement(pageId);

  /*
    The owner list does NOT carry `body` — measured: its row keys are
    id, title, summary, status, capabilities, dates and counts, and that
    is all. Only the detail view-model has the Markdown source.

    So "reopen the draft" has to fetch detail, and only once the operator
    asks to edit: prefetching every row's body would pull the full text
    of every unpublished announcement on a page the operator may only be
    glancing at. Until it arrives there is nothing honest to put in the
    body field, so the form waits rather than opening empty — opening
    empty would invite the operator to save over their own words.
  */
  const detail = useAnnouncement(row.id, pageId, { enabled: editing });

  // The row's OWN capability, as the server reported it. A page-level yes
  // authorises nothing here.
  const canEdit = isAllowed(row.capabilities, "can_edit");
  // ⚠ No `can_publish` exists server-side; inferred from status + can_edit.
  const canPublish = canEdit;

  const actionError = update.error ?? publish.error;

  return (
    <div className="flex flex-col gap-2 border-b border-cardstock-edge px-5 py-4 last:border-b-0 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="bcc-mono text-safety"
          style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          data-testid={`announcement-status-${row.id}`}
        >
          {kind === "draft" ? "DRAFT" : "SCHEDULED"}
        </span>
        {kind === "scheduled" && row.published_at !== null && (
          <time
            dateTime={row.published_at}
            className="bcc-mono text-ink-soft"
            style={{ fontSize: "11px" }}
            data-testid={`announcement-scheduled-for-${row.id}`}
          >
            {formatAbsoluteDateTime(row.published_at)}
          </time>
        )}
      </div>

      <h4 className="bcc-stencil text-ink" style={{ fontSize: "17px", lineHeight: 1.15 }}>
        {row.title}
      </h4>
      <p className="font-serif text-ink-soft" style={{ fontSize: "14px", lineHeight: 1.5 }}>
        {row.summary}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          disabled={!canEdit || update.isPending || publish.isPending}
          className="bcc-mono rounded-sm border border-cardstock-edge px-3 py-2 text-ink disabled:cursor-not-allowed disabled:opacity-50"
          style={{ minHeight: "44px", fontSize: "11px" }}
          data-testid={`announcement-edit-${row.id}`}
        >
          {kind === "scheduled" ? "EDIT / RESCHEDULE" : "EDIT"}
        </button>

        <button
          type="button"
          onClick={() => {
            // Re-check at the call site: the disabled attribute is
            // presentation, this is the gate.
            if (!canPublish) return;
            publish.mutate({ announcementId: row.id });
          }}
          disabled={!canPublish || publish.isPending || update.isPending}
          className="bcc-mono rounded-sm border border-cardstock-edge px-3 py-2 text-ink disabled:cursor-not-allowed disabled:opacity-50"
          style={{ minHeight: "44px", fontSize: "11px" }}
          data-testid={`announcement-publish-${row.id}`}
        >
          {publish.isPending ? "PUBLISHING…" : kind === "scheduled" ? "PUBLISH NOW" : "PUBLISH"}
        </button>
      </div>

      {/* Typed failure, keyed on the code. The operator keeps the row and
          is told what happened — never a silent no-op. */}
      {actionError !== null && actionError !== undefined && (
        <p
          role="alert"
          className="text-ink-soft"
          style={{ fontSize: "13px" }}
          data-testid={`announcement-action-error-${row.id}`}
        >
          {managementFailureCopy(actionError)}
        </p>
      )}

      {editing && detail.isPending && (
        <p className="text-ink-soft" style={{ fontSize: "13px" }}>
          Opening…
        </p>
      )}

      {editing && detail.isError && (
        <p
          role="alert"
          className="text-ink-soft"
          style={{ fontSize: "13px" }}
          data-testid={`announcement-open-error-${row.id}`}
        >
          {managementFailureCopy(detail.error)}
        </p>
      )}

      {editing && detail.data !== undefined && (
        <AnnouncementComposer
          variant={kind === "scheduled" ? "edit-scheduled" : "edit-draft"}
          initial={{
            title: row.title,
            summary: row.summary,
            body: detail.data.body,
            commentsEnabled: row.comments_enabled,
            ...(kind === "scheduled" && isoToLocalInput(row.published_at) !== undefined
              ? { publishAtLocal: isoToLocalInput(row.published_at) as string }
              : {}),
          }}
          canReopenDrafts
          pending={update.isPending}
          error={update.error}
          onClose={() => setEditing(false)}
          onSubmit={async (request) => {
            await update.mutateAsync(request as UpdateAnnouncementRequest);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
