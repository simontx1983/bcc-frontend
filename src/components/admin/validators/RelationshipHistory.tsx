"use client";

/**
 * RelationshipHistory — the global validator ownership audit log, newest
 * first, with "Load more" over the server cursor.
 *
 * Filters: page id and user id, held in the URL (`?page_id=&user_id=`) so
 * a filtered view can be shared and survives a reload. The URL is the only
 * source of truth for the query; the inputs are drafts until Apply. The
 * default (no filter) deletes the params rather than writing them out.
 *
 * The list itself is the shared HistoryList (rows as HistoryRow: evidence
 * as text only, Copy for the ref — security D5; one copy announcement).
 *
 * Uses `useSearchParams`, so the page must render it inside <Suspense>.
 */

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";

import { AdminReadFailure } from "@/components/admin/validators/AdminReadFailure";
import { ADMIN_INPUT_CLASS } from "@/components/admin/validators/form-classes";
import { HistoryList } from "@/components/admin/validators/HistoryList";
import { useValidatorRelationshipHistory } from "@/hooks/useAdminValidators";
import { isAdminDenial, isAdminToolUnavailable } from "@/lib/api/admin-errors";

const SUBJECT = "The validator audit history";

/** A positive whole number from a URL param or an input, else null. */
function parseId(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function RelationshipHistory() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageId = parseId(searchParams.get("page_id"));
  const userId = parseId(searchParams.get("user_id"));

  // Drafts follow the URL whenever it changes (Apply, Clear, Back/Forward).
  const [pageDraft, setPageDraft] = useState(pageId === null ? "" : String(pageId));
  const [userDraft, setUserDraft] = useState(userId === null ? "" : String(userId));
  useEffect(() => {
    setPageDraft(pageId === null ? "" : String(pageId));
  }, [pageId]);
  useEffect(() => {
    setUserDraft(userId === null ? "" : String(userId));
  }, [userId]);

  const writeUrl = (nextPageId: number | null, nextUserId: number | null): void => {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPageId === null) params.delete("page_id");
    else params.set("page_id", String(nextPageId));
    if (nextUserId === null) params.delete("user_id");
    else params.set("user_id", String(nextUserId));
    const qs = params.toString();
    router.replace((qs !== "" ? `${pathname}?${qs}` : pathname) as Route, { scroll: false });
  };

  const onApply = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    writeUrl(parseId(pageDraft), parseId(userDraft));
  };
  const clearFilters = () => {
    setPageDraft("");
    setUserDraft("");
    writeUrl(null, null);
  };

  const query = useValidatorRelationshipHistory({ pageId, userId });

  const idPrefix = useId();
  const filtersActive = pageId !== null || userId !== null;

  if (
    (query.isLoadingError || query.isRefetchError) &&
    (isAdminDenial(query.error) || isAdminToolUnavailable(query.error))
  ) {
    return (
      <AdminReadFailure error={query.error} subject={SUBJECT} onRetry={() => void query.refetch()} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form
        aria-label="History filters"
        onSubmit={onApply}
        className="bcc-panel flex flex-col gap-4 p-5 sm:flex-row sm:flex-wrap sm:items-end"
      >
        <div className="flex flex-col gap-2 sm:w-40">
          <label
            htmlFor={`${idPrefix}-page`}
            className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary"
          >
            PAGE ID
          </label>
          <input
            id={`${idPrefix}-page`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={pageDraft}
            onChange={(e) => setPageDraft(e.target.value)}
            placeholder="Any"
            className={ADMIN_INPUT_CLASS}
          />
        </div>
        <div className="flex flex-col gap-2 sm:w-40">
          <label
            htmlFor={`${idPrefix}-user`}
            className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary"
          >
            USER ID
          </label>
          <input
            id={`${idPrefix}-user`}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={userDraft}
            onChange={(e) => setUserDraft(e.target.value)}
            placeholder="Any"
            className={ADMIN_INPUT_CLASS}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="bcc-btn bcc-btn-outline min-h-[44px]">
            Apply
          </button>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="bcc-btn bcc-btn-ghost min-h-[44px]"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      <HistoryList
        query={query}
        subject={SUBJECT}
        empty={
          filtersActive
            ? {
                eyebrow: "NO MATCHES",
                heading: "No history for these filters.",
                body: "Check the page id and user id, or clear the filters.",
                action: { label: "CLEAR FILTERS", onClick: clearFilters },
              }
            : {
                eyebrow: "NO HISTORY YET",
                heading: "No ownership changes recorded.",
                body: "Links, revokes and cancellations show up here, newest first.",
              }
        }
      />
    </div>
  );
}
