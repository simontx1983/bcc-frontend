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
 * ⚠ **Publish is gated by the route, not by this control.** The publish
 * endpoint re-resolves operator authority on every request rather than
 * trusting the token — proven here by revoking authority mid-session and
 * watching the same bearer get `403 not_claimer` with the draft
 * unchanged, then restored and succeeding. A client ignoring the
 * capability is refused by the route, not admitted by it.
 *
 * What was missing was only the response FIELD for deciding whether to
 * DRAW the control, which bcc-trust PR 343 adds as `can_publish`. Until
 * that is deployed the control falls back to an inference; see
 * {@link ManagementRow}. The capability is not the authorization.
 */

import { useState } from "react";

import { AnnouncementComposer } from "@/components/announcements/AnnouncementComposer";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/Skeleton";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";
import { isAllowed, reasonCode } from "@/lib/permissions";
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

/**
 * Why a publish control is inert, in the operator's words.
 *
 * The two codes below are new with `can_publish` (contract v1.81). The
 * reason inventory is closed and the control falls back to generic copy
 * on anything unrecognised, so a new code arriving without a string here
 * would render a disabled button that says nothing.
 */
function publishDeniedCopy(reason: string | null): string {
  switch (reason) {
    case "announcement_already_published":
      return "This is already published.";
    case "announcement_archived":
      return "Archived announcements can't be published.";
    case "not_claimer":
      return "You're not the verified operator of this validator.";
    default:
      return "This announcement can't be published right now.";
  }
}

type RowKind = "draft" | "scheduled" | "blocked";

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
  /*
    Blocked rows are requested too, and they are the easiest to miss.

    When arm C vetoes a scheduled announcement at its due time — because
    the operator's claim had lapsed at that moment — the row LEAVES
    `?status=scheduled` and does NOT arrive under `?status=draft`. It is
    stored `post_status=draft` carrying arm C's marker, and the owner
    list's per-status predicates keep the two apart deliberately.

    So a surface asking only for draft+scheduled loses the row entirely,
    silently: the operator scheduled something, it never went out, and it
    is nowhere. That is the same disappearance this whole surface exists
    to remove, reached through a third door. Measured on a real backend,
    not inferred.
  */
  const blocked = useOwnerAnnouncements(pageId, {
    status: "blocked",
    enabled: canManage,
  });

  if (!canManage) return null;

  const draftRows = (drafts.data?.pages ?? []).flatMap((p) => p.items);
  const scheduledRows = (scheduled.data?.pages ?? []).flatMap((p) => p.items);
  const blockedRows = (blocked.data?.pages ?? []).flatMap((p) => p.items);

  const loading = drafts.isPending || scheduled.isPending || blocked.isPending;
  // Either bucket failing on FIRST load is worth surfacing; a failure
  // here means the operator cannot reach their own unpublished work, and
  // silently showing "nothing" would be the stranding again.
  const firstLoadError = drafts.isLoadingError
    ? drafts.error
    : scheduled.isLoadingError
      ? scheduled.error
      : blocked.isLoadingError
        ? blocked.error
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
                    void blocked.refetch();
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
  const empty =
    draftRows.length === 0 && scheduledRows.length === 0 && blockedRows.length === 0;

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
          {blockedRows.map((row) => (
            <li key={row.id}>
              <ManagementRow pageId={pageId} row={row} kind="blocked" />
            </li>
          ))}
        </ul>
      )}

      {/* A refresh that failed after rows were already on screen keeps the
          rows and localises the recovery, same rule as the panels. */}
      {(drafts.isRefetchError || scheduled.isRefetchError || blocked.isRefetchError) && (
        <div className="px-5 sm:px-8">
          <LoadFailure
            surface="paper"
            message={managementFailureCopy(
              drafts.error ?? scheduled.error ?? blocked.error,
            )}
            onRetry={() => {
              void drafts.refetch();
              void scheduled.refetch();
              void blocked.refetch();
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
  kind: RowKind;
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

  /**
   * Publish permission, preferring the server's own answer.
   *
   * `can_publish` is being added by bcc-trust PR 343 and is not on every
   * deployed backend yet. `isAllowed` fails closed on a missing key, so
   * reading it unconditionally would hide Publish entirely against a
   * backend that has not shipped it. So: use the key when the server
   * SENT one — including when it denies — and fall back to the older
   * inference only when the key is absent.
   *
   * ⚠ The fallback is wrong in a way that does not bite here and would
   * elsewhere: `can_edit` and `can_publish` diverge on exactly the two
   * states that matter — a published row is editable and NOT
   * publishable, an archived row is neither. This surface lists only
   * drafts and scheduled rows, where both are allowed, which is the only
   * reason inferring was ever safe. Delete the fallback once PR 343 is
   * deployed; do not copy it to a surface that shows published rows.
   */
  const publishEntry = (row.capabilities as unknown as Record<string, unknown>)[
    "can_publish"
  ];
  const serverSentCanPublish =
    typeof publishEntry === "object" && publishEntry !== null;
  const canPublish = serverSentCanPublish
    ? isAllowed(row.capabilities, "can_publish")
    : canEdit;
  const publishDeniedReason = serverSentCanPublish
    ? reasonCode(row.capabilities, "can_publish")
    : null;

  const actionError = update.error ?? publish.error;

  return (
    <div className="flex flex-col gap-2 border-b border-cardstock-edge px-5 py-4 last:border-b-0 sm:px-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="bcc-mono text-safety"
          style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          data-testid={`announcement-status-${row.id}`}
        >
          {kind === "draft" ? "DRAFT" : kind === "scheduled" ? "SCHEDULED" : "WITHHELD"}
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

      {kind === "blocked" && (
        /*
          What is said here is bounded by what the server sends. The
          owner view-model carries `status: "blocked"` and nothing else
          about the block: no reason, no timestamp. The meta holds
          `_bcc_announcement_blocked_reason = authority_lost`, and it
          does not reach the wire — verified against the payload, which
          has no such key.

          So this says WHAT happened and what to do, and does not
          invent WHY. Naming a cause the server never sent would be
          guessing at the operator's own history, and the plausible
          guesses differ in blame: a lapsed claim is not the operator's
          doing, and implying otherwise would be worse than silence.
        */
        <p
          className="font-serif italic text-ink-soft"
          style={{ fontSize: "13px" }}
          data-testid={`announcement-blocked-note-${row.id}`}
        >
          This wasn’t published at its scheduled time and was held back.
          You can publish it now.
        </p>
      )}

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
          title={canPublish ? undefined : publishDeniedCopy(publishDeniedReason)}
          data-testid={`announcement-publish-${row.id}`}
        >
          {publish.isPending
            ? "PUBLISHING…"
            : kind === "scheduled"
              ? "PUBLISH NOW"
              : "PUBLISH"}
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
