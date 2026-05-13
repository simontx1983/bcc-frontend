"use client";

/**
 * BlocksList — paginated list of blocked users on /settings/blocks.
 *
 * Reads from useMyBlocks (single-page query); each row carries an
 * Unblock button that fires the unblock mutation and invalidates the
 * blocks query for re-fetch. No optimistic removal — the round trip
 * is fast and a fresh re-fetch keeps the count accurate.
 */

import { useState } from "react";

import { Avatar } from "@/components/identity/Avatar";
import { useMyBlocks, useUnblockUser } from "@/hooks/useBlocks";

export function BlocksList() {
  const [page, setPage] = useState(1);
  const query = useMyBlocks(page);
  const unblockMutation = useUnblockUser();
  const [pendingId, setPendingId] = useState<number | null>(null);

  if (query.isPending) {
    return (
      <div className="bcc-panel p-6">
        <p className="bcc-mono text-ink-soft">Loading blocks…</p>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="bcc-panel p-6">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load blocks: {query.error.message}
        </p>
      </div>
    );
  }

  const { items, pagination } = query.data;

  if (items.length === 0) {
    return (
      <div className="bcc-panel p-6">
        <p
          className="bcc-mono mb-3 text-safety"
          style={{ fontSize: "10px", letterSpacing: "0.24em" }}
        >
          NONE ON FILE
        </p>
        <p className="font-serif italic text-ink-soft">
          You haven&apos;t blocked anyone. The Block button lives on a
          member&apos;s profile page when you need it.
        </p>
      </div>
    );
  }

  const handleUnblock = (userId: number) => {
    setPendingId(userId);
    unblockMutation.mutate(userId, {
      onSettled: () => setPendingId(null),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ul className="bcc-panel divide-y divide-cardstock-edge/60">
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
                <p className="bcc-stencil truncate text-ink">
                  {entry.display_name !== "" ? entry.display_name : `@${entry.handle}`}
                </p>
                {entry.handle !== "" && (
                  <p className="bcc-mono truncate text-[11px] text-ink-soft">
                    @{entry.handle}
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleUnblock(entry.user_id)}
              disabled={pendingId === entry.user_id}
              className="bcc-mono inline-flex items-center border-2 border-cardstock-edge px-3 py-1.5 text-[11px] tracking-[0.18em] text-ink-soft transition hover:border-ink/50 hover:text-ink disabled:opacity-60"
            >
              {pendingId === entry.user_id ? "WORKING…" : "UNBLOCK"}
            </button>
          </li>
        ))}
      </ul>

      {pagination.total_pages > 1 && (
        <nav
          className="bcc-mono flex items-center justify-between gap-3 text-[11px] tracking-[0.16em] text-ink-soft"
          aria-label="Pagination"
        >
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="border-2 border-cardstock-edge px-3 py-1 transition hover:border-ink/50 hover:text-ink disabled:opacity-50"
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
            className="border-2 border-cardstock-edge px-3 py-1 transition hover:border-ink/50 hover:text-ink disabled:opacity-50"
          >
            NEXT →
          </button>
        </nav>
      )}
    </div>
  );
}
