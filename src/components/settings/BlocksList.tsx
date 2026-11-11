"use client";

/**
 * BlocksList — paginated list of blocked users on /settings/blocks.
 *
 * Reads from useMyBlocks (single-page query); each row carries an
 * Unblock button that fires the unblock mutation and invalidates the
 * blocks query for re-fetch. No optimistic removal — the round trip
 * is fast and a fresh re-fetch keeps the count accurate.
 */

import { useEffect, useState } from "react";

import { Avatar } from "@/components/identity/Avatar";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { Skeleton } from "@/components/ui/Skeleton";
import { useMyBlocks, useUnblockUser } from "@/hooks/useBlocks";
import { humanizeCode, isPermissionDenial } from "@/lib/api/errors";

export function BlocksList() {
  const [page, setPage] = useState(1);
  const query = useMyBlocks(page);
  const unblockMutation = useUnblockUser();
  const [pendingId, setPendingId] = useState<number | null>(null);
  // One failed unblock at a time, pinned to its row; cleared on retry.
  const [failure, setFailure] = useState<{ userId: number; message: string } | null>(null);

  // Page-overflow guard, same contract as <WatchersPanel>: unblocking the
  // last row of a trailing page refetches an empty page, which would
  // render the "NONE ON FILE" empty state with no pager — stranding the
  // user away from the earlier pages. Clamp back to the last real page;
  // the result is always < `page`, so it terminates at 1.
  const emptyOverflow =
    query.isSuccess && query.data.items.length === 0 && page > 1;
  const totalPages = query.data?.pagination.total_pages;
  useEffect(() => {
    if (emptyOverflow) {
      setPage(Math.max(1, Math.min(page - 1, totalPages ?? 1)));
    }
  }, [emptyOverflow, page, totalPages]);

  if (query.isPending || emptyOverflow) {
    return (
      <div aria-label="Loading blocks" className="flex flex-col gap-2">
        <Skeleton className="h-[68px]" count={3} />
      </div>
    );
  }

  const loadFailure = query.isError ? (
    <div className="bcc-panel p-6">
      <LoadFailure
        /* §γ — copy is keyed on err.code; never render err.message. */
        message={humanizeCode(
          query.error,
          {
            bcc_unauthorized: "Sign in to manage your blocks.",
            bcc_rate_limited: "Loading too fast — give it a moment and try again.",
            bcc_unavailable: "Blocks are temporarily unavailable. Try again shortly.",
          },
          "Couldn't load your blocks. Try again in a moment.",
        )}
        onRetry={() => void query.refetch()}
      />
    </div>
  ) : null;

  // Only a first-load failure, or a REFRESH the server refused, may
  // replace the list. Every unblock invalidates this query, so a blanket
  // `isError` meant one failed refetch erased the whole list. A refused
  // refresh keeps the old whole-panel state rather than the stale rows.
  if (query.isLoadingError || (query.isRefetchError && isPermissionDenial(query.error))) {
    return loadFailure;
  }

  const { items, pagination } = query.data;

  // "None on file" is a claim about the server; a failed refresh does not
  // support it, so only the failure renders.
  if (items.length === 0 && query.isRefetchError) {
    return loadFailure;
  }

  if (items.length === 0) {
    return (
      <div className="bcc-panel p-6">
        <p
          className="bcc-mono mb-3 text-bcc-text-safety"
          style={{ fontSize: "10px", letterSpacing: "0.24em" }}
        >
          NONE ON FILE
        </p>
        <p className="font-serif italic text-bcc-text-secondary">
          You haven&apos;t blocked anyone. The Block button lives on a
          member&apos;s profile page when you need it.
        </p>
      </div>
    );
  }

  const handleUnblock = (userId: number) => {
    setPendingId(userId);
    setFailure(null);
    unblockMutation.mutate(userId, {
      onError: (err) => setFailure({ userId, message: humanizeUnblockError(err) }),
      onSettled: () => setPendingId(null),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* A failed REFRESH keeps the rows and offers the recovery above them. */}
      {loadFailure}
      <ul className="bcc-panel divide-y divide-bcc-border">
        {items.map((entry) => (
          <li
            key={entry.user_id}
            className="flex items-center justify-between gap-4 px-5 py-4"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                avatarUrl={entry.avatar_url === "" ? null : entry.avatar_url}
                handle={entry.handle}
                displayName={entry.display_name}
                size="sm"
                variant="rounded"
              />
              <div className="min-w-0">
                <p className="bcc-stencil truncate text-bcc-text">
                  {entry.display_name !== "" ? entry.display_name : `@${entry.handle}`}
                </p>
                {entry.handle !== "" && (
                  <p className="bcc-mono truncate text-[11px] text-bcc-text-secondary">
                    @{entry.handle}
                  </p>
                )}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => handleUnblock(entry.user_id)}
                disabled={pendingId === entry.user_id}
                aria-describedby={
                  failure?.userId === entry.user_id ? `bcc-unblock-error-${entry.user_id}` : undefined
                }
                className="bcc-mono inline-flex items-center border-2 border-bcc-border px-3 py-1.5 text-[11px] tracking-[0.18em] text-bcc-text-secondary transition hover:border-bcc-border-strong hover:text-bcc-text disabled:opacity-60"
              >
                {pendingId === entry.user_id ? "WORKING…" : "UNBLOCK"}
              </button>
              {failure?.userId === entry.user_id && (
                <p
                  id={`bcc-unblock-error-${entry.user_id}`}
                  role="alert"
                  className="bcc-mono max-w-[14rem] text-right text-[10px] tracking-[0.12em] text-bcc-text-error"
                >
                  {failure.message}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {pagination.total_pages > 1 && (
        <nav
          className="bcc-mono flex items-center justify-between gap-3 text-[11px] tracking-[0.16em] text-bcc-text-secondary"
          aria-label="Pagination"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="border-2 border-bcc-border px-3 py-1 transition hover:border-bcc-border-strong hover:text-bcc-text disabled:opacity-50"
          >
            ← PREV
          </button>
          <span>
            PAGE {pagination.page} / {pagination.total_pages} · {pagination.total} TOTAL
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= pagination.total_pages}
            className="border-2 border-bcc-border px-3 py-1 transition hover:border-bcc-border-strong hover:text-bcc-text disabled:opacity-50"
          >
            NEXT →
          </button>
        </nav>
      )}
    </div>
  );
}

/** §γ — keyed on err.code (DELETE /me/blocks/:user_id), never err.message. */
function humanizeUnblockError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_rate_limited: "Slow down — too many unblock attempts. Wait a minute.",
      bcc_unauthorized: "Sign in to manage your blocks.",
    },
    "Couldn't unblock. Try again.",
  );
}
