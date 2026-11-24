"use client";

/**
 * HistoryList — the body of a validator ownership history: loading,
 * failed reads, the empty sheet, the rows, "Load more", and the one copy
 * announcement. Shared by the global Audit History and a page's own
 * history; each caller owns its query, its heading and its empty copy.
 *
 * Copy feedback is owned by the LIST, not each row, so one status region
 * speaks for the most recent copy. It names the entry, never the
 * reference itself.
 *
 * Cursor safety: while the NEXT page is failed, Load more is withdrawn so
 * it cannot skip the page that failed. Retry re-requests that same page.
 */

import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";

import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadMore,
  type AdminEmptyStateProps,
} from "@/components/admin/validators/AdminListStates";
import {
  AdminReadFailure,
  adminReadFailureCopy,
} from "@/components/admin/validators/AdminReadFailure";
import { useEvidenceRefCopy } from "@/components/admin/validators/Evidence";
import { HistoryRow } from "@/components/admin/validators/HistoryRow";
import { LoadFailure } from "@/components/ui/LoadFailure";
import type { BccApiError, ValidatorRelationshipHistoryResponse } from "@/lib/api/types";

export interface HistoryListProps {
  query: UseInfiniteQueryResult<InfiniteData<ValidatorRelationshipHistoryResponse>, BccApiError>;
  /** Sentence subject for failure copy, e.g. "The validator audit history". */
  subject: string;
  /** Shown when the server answers with no entries. */
  empty: AdminEmptyStateProps;
}

export function HistoryList({ query, subject, empty }: HistoryListProps) {
  const { outcome, copyRef } = useEvidenceRefCopy<number>();

  let results: React.ReactNode;
  if (query.isPending) {
    results = <AdminListSkeleton label="Loading history…" rowClassName="h-52" />;
  } else if (query.isLoadingError) {
    results = (
      <AdminReadFailure error={query.error} subject={subject} onRetry={() => void query.refetch()} />
    );
  } else {
    const items = query.data.pages.flatMap((page) => page.items);
    results = (
      <>
        {query.isRefetchError && (
          <div className="bcc-panel">
            <LoadFailure
              message={adminReadFailureCopy(query.error, subject)}
              onRetry={() => void query.refetch()}
            />
          </div>
        )}

        {/* "Nothing here" is a claim about the server; a failed read doesn't support it. */}
        {items.length === 0 ? (
          query.isError ? null : <AdminEmptyState {...empty} />
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <HistoryRow key={item.id} item={item} onCopyRef={(ref) => copyRef(item.id, ref)} />
            ))}
          </ul>
        )}

        {query.isFetchNextPageError ? (
          <AdminReadFailure
            error={query.error}
            subject={subject}
            onRetry={() => void query.fetchNextPage()}
          />
        ) : (
          query.hasNextPage && (
            <AdminLoadMore
              loading={query.isFetchingNextPage}
              onLoadMore={() => void query.fetchNextPage()}
            />
          )
        )}
      </>
    );
  }

  return (
    <>
      {results}
      <p role="status" className="bcc-mono min-h-[1rem] text-[10px] text-bcc-text-secondary">
        {outcome === null
          ? ""
          : outcome.ok
            ? `Evidence reference for entry #${outcome.key} copied.`
            : `Couldn't copy the evidence reference for entry #${outcome.key}.`}
      </p>
    </>
  );
}
