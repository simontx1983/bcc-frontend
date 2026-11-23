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
 * Evidence (security D5): `evidence_note` and `evidence_ref` are rendered
 * as React TEXT children only — never HTML, never an <a>, never linkified,
 * whatever they contain. `evidence_ref` gets a Copy button instead of a
 * link. Copy feedback is owned by the LIST, not each row, so one status
 * region speaks for the most recent copy (the WalletsSection pattern).
 *
 * Uses `useSearchParams`, so the page must render it inside <Suspense>.
 */

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";

import { AdminField } from "@/components/admin/validators/AdminField";
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadMore,
} from "@/components/admin/validators/AdminListStates";
import {
  AdminReadFailure,
  adminReadFailureCopy,
} from "@/components/admin/validators/AdminReadFailure";
import { AdminUserChip } from "@/components/admin/validators/AdminUserChip";
import {
  ACTION_LABEL,
  METHOD_LABEL,
  STEP_UP_LABEL,
  labelFor,
} from "@/components/admin/validators/labels";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { useValidatorRelationshipHistory } from "@/hooks/useAdminValidators";
import { useCopyConfirm } from "@/hooks/useCopyConfirm";
import { isAdminDenial, isAdminToolUnavailable } from "@/lib/api/admin-errors";
import type {
  ValidatorRelationshipHistoryItem,
  ValidatorRelationshipSnapshot,
} from "@/lib/api/types";
import { formatAbsoluteDateTime } from "@/lib/format";

const SUBJECT = "The validator audit history";

/** The subject's account no longer exists (e.g. after `account_deleted`). */
export const DELETED_ACCOUNT_COPY = "Deleted account";
/** No person acted: the re-verify sweep, an expired step-up or invite, a wallet-proof supersede. */
export const SYSTEM_ACTOR_COPY = "System";

/** A positive whole number from a URL param or an input, else null. */
function parseId(raw: string | null): number | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const INPUT_CLASS =
  "bcc-mono min-h-[44px] w-full bg-bcc-input-bg px-3 py-2 text-sm text-bcc-text placeholder:text-bcc-text-placeholder focus:outline-none ring-1 ring-bcc-input-border focus:ring-2 focus:ring-bcc-accent";

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

  // One copy outcome for the whole list (see the header note).
  const { copied, copy } = useCopyConfirm();
  const [copyOutcome, setCopyOutcome] = useState<{ id: number; ok: boolean } | null>(null);
  useEffect(() => {
    if (!copied && copyOutcome?.ok === true) setCopyOutcome(null);
  }, [copied, copyOutcome]);
  async function copyEvidenceRef(id: number, ref: string) {
    const ok = await copy(ref);
    setCopyOutcome({ id, ok });
  }

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

  let results: React.ReactNode;
  if (query.isPending) {
    results = <AdminListSkeleton label="Loading history…" rowClassName="h-52" />;
  } else if (query.isLoadingError) {
    results = (
      <AdminReadFailure error={query.error} subject={SUBJECT} onRetry={() => void query.refetch()} />
    );
  } else {
    const items = query.data.pages.flatMap((page) => page.items);
    results = (
      <>
        {query.isRefetchError && (
          <div className="bcc-panel">
            <LoadFailure
              message={adminReadFailureCopy(query.error, SUBJECT)}
              onRetry={() => void query.refetch()}
            />
          </div>
        )}

        {items.length === 0 ? (
          query.isError ? null : filtersActive ? (
            <AdminEmptyState
              eyebrow="NO MATCHES"
              heading="No history for these filters."
              body="Check the page id and user id, or clear the filters."
              action={{ label: "CLEAR FILTERS", onClick: clearFilters }}
            />
          ) : (
            <AdminEmptyState
              eyebrow="NO HISTORY YET"
              heading="No ownership changes recorded."
              body="Links, revokes and cancellations show up here, newest first."
            />
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <HistoryRow
                key={item.id}
                item={item}
                onCopyRef={(ref) => void copyEvidenceRef(item.id, ref)}
              />
            ))}
          </ul>
        )}

        {query.isFetchNextPageError ? (
          <AdminReadFailure
            error={query.error}
            subject={SUBJECT}
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
            className={INPUT_CLASS}
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
            className={INPUT_CLASS}
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

      {results}

      {/* THE one copy announcement for the list. Names the entry, never the
          reference itself. */}
      <p role="status" className="bcc-mono min-h-[1rem] text-[10px] text-bcc-text-secondary">
        {copyOutcome === null
          ? ""
          : copyOutcome.ok
            ? `Evidence reference for entry #${copyOutcome.id} copied.`
            : `Couldn't copy the evidence reference for entry #${copyOutcome.id}.`}
      </p>
    </div>
  );
}

function present(value: string | null): string {
  return value === null || value === "" ? "—" : value;
}

function ChangeLine({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2">
      <span className="bcc-mono w-16 shrink-0 text-[10px] tracking-[0.16em] text-bcc-text-secondary">
        {label}
      </span>
      <span className="bcc-mono break-all text-[11px] text-bcc-text">
        {before} → {after}
      </span>
    </li>
  );
}

function methodText(snapshot: ValidatorRelationshipSnapshot): string {
  return snapshot.method === null ? "—" : labelFor(METHOD_LABEL, snapshot.method);
}

interface HistoryRowProps {
  item: ValidatorRelationshipHistoryItem;
  onCopyRef: (ref: string) => void;
}

function HistoryRow({ item, onCopyRef }: HistoryRowProps) {
  const when = formatAbsoluteDateTime(item.created_at);
  const note = item.evidence_note ?? "";
  const ref = item.evidence_ref ?? "";
  // The server's label; the raw key only if an older server sent no label.
  const reason = item.reason_label ?? item.reason ?? "";

  return (
    <li className="bcc-panel flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="bcc-mono inline-flex shrink-0 items-center rounded-sm border border-bcc-border px-2 py-0.5 text-[10px] tracking-[0.18em] text-bcc-text">
            {labelFor(ACTION_LABEL, item.action).toUpperCase()}
          </span>
          <span className="bcc-stencil min-w-0 break-words text-lg text-bcc-text">
            {item.page.title}
          </span>
          <span className="bcc-mono text-[10px] text-bcc-text-secondary">
            page #{item.page.page_id}
          </span>
        </div>
        <time
          dateTime={item.created_at}
          className="bcc-mono text-[10px] text-bcc-text-secondary"
        >
          {when !== "" ? when : item.created_at}
        </time>
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <AdminField label="Subject">
          {item.subject === null ? (
            <span className="text-bcc-text-secondary">{DELETED_ACCOUNT_COPY}</span>
          ) : (
            <AdminUserChip user={item.subject} size="xs" />
          )}
        </AdminField>
        <AdminField label="Actor">
          {item.actor === null ? (
            <span className="text-bcc-text-secondary">{SYSTEM_ACTOR_COPY}</span>
          ) : (
            <AdminUserChip user={item.actor} size="xs" />
          )}
        </AdminField>
        <AdminField label="Before → after">
          <ul className="flex flex-col gap-0.5">
            <ChangeLine label="ROLE" before={present(item.prev.role)} after={present(item.new.role)} />
            <ChangeLine
              label="STATUS"
              before={present(item.prev.status)}
              after={present(item.new.status)}
            />
            <ChangeLine label="METHOD" before={methodText(item.prev)} after={methodText(item.new)} />
          </ul>
        </AdminField>
        <AdminField label="Step-up">
          {item.step_up === null ? "None" : labelFor(STEP_UP_LABEL, item.step_up)}
        </AdminField>
        {reason !== "" && (
          <AdminField label="Reason" wide>
            <span className="break-words">{reason}</span>
          </AdminField>
        )}
        {note !== "" && (
          <AdminField label="Evidence note" wide>
            {/* Text node only — never HTML, never linkified (D5). */}
            <p className="whitespace-pre-wrap break-words font-serif text-bcc-text">{note}</p>
          </AdminField>
        )}
        {ref !== "" && (
          <AdminField label="Evidence reference" wide>
            <span className="flex flex-wrap items-start gap-2">
              {/* Text node only — a URL here is NOT a link (D5). */}
              <code className="bcc-mono min-w-0 flex-1 break-all text-[11px] text-bcc-text">
                {ref}
              </code>
              <button
                type="button"
                onClick={() => onCopyRef(ref)}
                aria-label={`Copy evidence reference for entry #${item.id}`}
                className="bcc-mono min-h-[44px] shrink-0 border-2 border-bcc-border px-3 py-1.5 text-[11px] tracking-[0.18em] text-bcc-text-secondary transition hover:border-bcc-border-strong hover:text-bcc-text"
              >
                Copy
              </button>
            </span>
          </AdminField>
        )}
      </dl>
    </li>
  );
}
