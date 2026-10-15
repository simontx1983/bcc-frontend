"use client";

/**
 * The Announcements tab on a validator profile.
 *
 * Two sections: **Active** and **Archived**. Archived announcements are
 * public records — they keep their permalink and their discussion — so
 * they are listed, not hidden; they are simply out of the active flow.
 *
 * Two capability scopes meet here, and conflating them is the bug this
 * component is shaped to avoid:
 *
 *   • `capabilities` (validator-page scope) decides whether the compose
 *     button exists and whether the management surface opens at all.
 *   • each row's OWN `announcement.capabilities` decides whether that
 *     announcement may be pinned, edited or archived.
 *
 * A page-level `can_manage: true` therefore opens the surface but
 * authorizes nothing on any particular row — an archived, draft or
 * scheduled announcement does not inherit permission from the page.
 * Per-row gating lives in {@link AnnouncementOwnerActions}.
 *
 * This component never infers authority from page authorship,
 * membership, session presence or any client state, and it has no
 * environment flag. If the server did not grant it, the control does
 * not exist.
 *
 * ## Why this file is three components rather than one
 *
 * Both lists are `useInfiniteQuery`, so they have THREE failure modes,
 * not one, and the shipped house pattern splits them:
 * `isLoadingError` may replace a list, `isRefetchError` and
 * `isFetchNextPageError` may only annotate one. A blanket `isError`
 * return above the `data.pages` read — which is what this panel had —
 * throws away rows that loaded fine under their own authorised 200
 * because a later page failed.
 *
 * On top of that, a same-resource read denial has to WITHDRAW what is
 * already rendered and drop that resource's cached payload. Removing a
 * cache entry while an observer is still mounted makes the observer
 * re-create it and refetch — denied again, removed again — so the only
 * safe order is unmount-the-owner-then-remove. That forces the gate to
 * be the PARENT of the component holding the hook, which is why each
 * section is split in two.
 *
 * And the composer stays up here in the shell, above both gates, for a
 * concrete reason: a withdrawal unmounts the list, and an operator may
 * be part-way through typing an announcement when an unrelated refresh
 * of the list is refused. The draft is the operator's own unsent work
 * and no server refusal is a reason to destroy it.
 */

import { useState } from "react";

import { AnnouncementComposer } from "@/components/announcements/AnnouncementComposer";
import { AnnouncementListItem } from "@/components/announcements/AnnouncementListItem";
import { AnnouncementOwnerActions } from "@/components/announcements/AnnouncementOwnerActions";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/Skeleton";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";
import {
  shouldWithdrawOnDenial,
  useDenialGate,
  useReportDenial,
} from "@/lib/api/resource-denial";
import { isAllowed } from "@/lib/permissions";
import { useViewerScope } from "@/hooks/useViewerScope";
import {
  announcementsListQueryKey,
  useAnnouncements,
  useSetAnnouncementPin,
  useCreateAnnouncement,
} from "@/hooks/useAnnouncements";
import type { Announcement, AnnouncementFeatureCapabilities } from "@/lib/api/types";

interface AnnouncementsPanelProps {
  pageId: number;
  validatorName: string;
  capabilities: AnnouncementFeatureCapabilities;
}

/**
 * Copy keyed on `err.code`, never on `err.message`.
 *
 * All three denial codes are listed, not just `bcc_forbidden`: without
 * them the copy falls through to a default ending in "Try again in a
 * moment", which is advice we withhold at the same time as the control.
 *
 * `bcc_unavailable` (503) is here on purpose. The backend answers a
 * repository fault with 503 rather than a 200 carrying an empty list,
 * precisely because an empty announcements panel looks normal and the
 * failure would otherwise be invisible. It is retryable, so it keeps
 * the retry.
 */
function announcementFailureCopy(error: unknown): string {
  return humanizeCode(
    error,
    {
      bcc_unauthorized: "Sign in to see these announcements.",
      bcc_rate_limited: "Loading too fast — give it a moment and try again.",
      bcc_unavailable:
        "Announcements are temporarily unavailable. Try again shortly.",
      bcc_forbidden: "These announcements aren’t visible to you.",
      bcc_permission_denied: "These announcements aren’t visible to you.",
      bcc_blocked: "These announcements aren’t visible to you.",
    },
    "Couldn’t load announcements. Try again in a moment.",
  );
}

export function AnnouncementsPanel({
  pageId,
  validatorName,
  capabilities,
}: AnnouncementsPanelProps) {
  const [composerOpen, setComposerOpen] = useState(false);
  const create = useCreateAnnouncement(pageId);

  const canCreate = isAllowed(capabilities, "can_create");
  // Page scope: opens the management surface. Says nothing about whether
  // any given announcement may be mutated — each row carries its own
  // capability, and AnnouncementOwnerActions reads that one.
  const canManage = isAllowed(capabilities, "can_manage");

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

        <ActiveSection
          pageId={pageId}
          validatorName={validatorName}
          canCreate={canCreate}
          canManage={canManage}
        />
      </article>

      <ArchivedSection pageId={pageId} />

      {/* Outside both gates. A withdrawal takes the list down; it must not
          take a half-typed announcement with it. */}
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

// ──────────────────────────────────────────────────────────────────────
// Active
// ──────────────────────────────────────────────────────────────────────

/** Shown once the server has withdrawn permission to read this list. */
const ACTIVE_WITHDRAWN_COPY = "You can’t see these announcements.";
const ARCHIVED_WITHDRAWN_COPY = "You can’t see this validator’s archive.";

interface ActiveSectionProps {
  pageId: number;
  validatorName: string;
  canCreate: boolean;
  canManage: boolean;
}

/**
 * The active list's denial gate. Owns no query, so latching it unmounts
 * the body below — which is what makes removing the cache entry safe.
 */
function ActiveSection(props: ActiveSectionProps) {
  // Keyed exactly as the hook is, SCOPE INCLUDED. A hand-written key
  // missing the viewer scope would remove nothing while this component
  // believed it had withdrawn the payload.
  const scope = useViewerScope();
  const gate = useDenialGate(
    announcementsListQueryKey(props.pageId, "active", scope),
  );

  if (gate.withdrawn) {
    return (
      <div className="px-5 py-6 sm:px-8">
        <LoadFailure surface="paper" message={ACTIVE_WITHDRAWN_COPY} />
      </div>
    );
  }

  return <ActiveSectionData {...props} onDenied={gate.withdraw} />;
}

function ActiveSectionData({
  pageId,
  validatorName,
  canCreate,
  canManage,
  onDenied,
}: ActiveSectionProps & { onDenied: () => void }) {
  const query = useAnnouncements(pageId, { state: "active" });
  const pin = useSetAnnouncementPin(pageId);

  // A denied REFRESH of the list already on screen withdraws it. A denied
  // next page does not — it says nothing about the rows already served
  // under their own authorised 200.
  useReportDenial(
    shouldWithdrawOnDenial(
      query.error,
      query.isRefetchError,
      query.data !== undefined,
    ),
    onDenied,
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2 px-5 py-6 sm:px-8">
        <Skeleton className="h-20" count={3} />
      </div>
    );
  }

  const failureCopy = announcementFailureCopy(query.error);

  // A permission boundary does not move because the page asked twice, so
  // a Retry against one can only fail the same way: omit `onRetry` and no
  // button renders at all, rather than an inert one.
  const denied = isPermissionDenial(query.error);
  const refetchProps = denied ? {} : { onRetry: () => void query.refetch() };
  const nextPageProps = denied
    ? {}
    : { onRetry: () => void query.fetchNextPage() };

  // ONLY a first-load failure may replace the list. The blanket `isError`
  // this replaced was true for all three failure modes and returned here
  // BEFORE reading `data.pages`, so one failed LOAD MORE discarded every
  // announcement that had loaded fine.
  if (query.isLoadingError) {
    return (
      <div className="px-5 py-6 sm:px-8">
        <LoadFailure surface="paper" message={failureCopy} {...refetchProps} />
      </div>
    );
  }

  const items: Announcement[] =
    query.data?.pages.flatMap((page) => page.items) ?? [];

  // "Nothing posted yet" is a claim about what the SERVER holds. A failed
  // read does not support it, so the claim is withheld while in error —
  // the same rule the released panels follow.
  if (items.length === 0 && !query.isError) {
    return (
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
    );
  }

  return (
    <>
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id}>
            <AnnouncementListItem
              announcement={item}
              actions={
                /* `can_manage` opens the management surface and
                   nothing more. Whether THIS row may be pinned is
                   decided inside, from the row's own capability. */
                canManage ? (
                  <AnnouncementOwnerActions
                    announcement={item}
                    pending={pin.isPending}
                    onPin={(announcementId, pinned) =>
                      pin.mutate({ announcementId, pinned })
                    }
                  />
                ) : null
              }
            />
          </li>
        ))}
      </ul>

      {/* A failed REFRESH keeps the list and localises the recovery
          beneath it; the cursor is still coherent so paging stays open. */}
      {query.isRefetchError && (
        <div className="px-5 sm:px-8">
          <LoadFailure surface="paper" message={failureCopy} {...refetchProps} />
        </div>
      )}

      {/* Cursor safety: while the NEXT page is failed, LOAD MORE is
          withdrawn so it cannot advance past — and so skip — the page that
          failed. Retry re-requests that same page. */}
      {query.isFetchNextPageError ? (
        <div className="px-5 sm:px-8">
          <LoadFailure surface="paper" message={failureCopy} {...nextPageProps} />
        </div>
      ) : (
        query.hasNextPage &&
        !denied && (
          <div className="px-5 py-4 sm:px-8">
            <button
              type="button"
              onClick={() => {
                if (!query.isFetchingNextPage) {
                  void query.fetchNextPage();
                }
              }}
              disabled={query.isFetchingNextPage}
              className="bcc-mono text-safety hover:underline disabled:opacity-50"
              style={{ fontSize: "11px", letterSpacing: "0.12em", minHeight: "44px" }}
            >
              {query.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
            </button>
          </div>
        )
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Archived
// ──────────────────────────────────────────────────────────────────────

/** Archived's denial gate — same parent/child split as Active's. */
function ArchivedSection({ pageId }: { pageId: number }) {
  const scope = useViewerScope();
  const gate = useDenialGate(
    announcementsListQueryKey(pageId, "archived", scope),
  );

  if (gate.withdrawn) {
    return (
      <article className="bcc-paper" data-testid="announcement-archived-section">
        <div className="px-5 py-6 sm:px-8">
          <LoadFailure surface="paper" message={ARCHIVED_WITHDRAWN_COPY} />
        </div>
      </article>
    );
  }

  return <ArchivedSectionData pageId={pageId} onDenied={gate.withdraw} />;
}

function ArchivedSectionData({
  pageId,
  onDenied,
}: {
  pageId: number;
  onDenied: () => void;
}) {
  const query = useAnnouncements(pageId, { state: "archived" });

  useReportDenial(
    shouldWithdrawOnDenial(
      query.error,
      query.isRefetchError,
      query.data !== undefined,
    ),
    onDenied,
  );

  const items: Announcement[] =
    query.data?.pages.flatMap((page) => page.items) ?? [];
  const failureCopy = announcementFailureCopy(query.error);
  const denied = isPermissionDenial(query.error);
  const refetchProps = denied ? {} : { onRetry: () => void query.refetch() };
  const nextPageProps = denied
    ? {}
    : { onRetry: () => void query.fetchNextPage() };

  // Archived renders nothing at all when there is nothing archived — an
  // empty "Archived" heading is noise, and that was the original intent.
  //
  // But "nothing archived" and "we could not find out" are different
  // claims, and the old `archivedItems.length > 0` test collapsed them:
  // a failed archived read vanished without a trace. That is exactly the
  // shape the backend answers 503 to avoid. So silence is kept ONLY while
  // there is no error.
  if (items.length === 0 && !query.isError) {
    return null;
  }

  return (
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

      {query.isLoadingError ? (
        <div className="px-5 py-6 sm:px-8">
          <LoadFailure surface="paper" message={failureCopy} {...refetchProps} />
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id}>
              <AnnouncementListItem announcement={item} />
            </li>
          ))}
        </ul>
      )}

      {query.isRefetchError && (
        <div className="px-5 sm:px-8">
          <LoadFailure surface="paper" message={failureCopy} {...refetchProps} />
        </div>
      )}

      {query.isFetchNextPageError ? (
        <div className="px-5 sm:px-8">
          <LoadFailure surface="paper" message={failureCopy} {...nextPageProps} />
        </div>
      ) : (
        query.hasNextPage &&
        !denied && (
          <div className="px-5 py-4 sm:px-8">
            <button
              type="button"
              onClick={() => {
                if (!query.isFetchingNextPage) {
                  void query.fetchNextPage();
                }
              }}
              disabled={query.isFetchingNextPage}
              className="bcc-mono text-safety hover:underline disabled:opacity-50"
              style={{ fontSize: "11px", letterSpacing: "0.12em", minHeight: "44px" }}
            >
              {query.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
            </button>
          </div>
        )
      )}
    </article>
  );
}
