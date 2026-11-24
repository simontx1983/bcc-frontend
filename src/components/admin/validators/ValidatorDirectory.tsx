"use client";

/**
 * ValidatorDirectory — every validator page, its ownership state, and who
 * owns it. Read-only: each row's title links to the page view
 * (/admin/validators/<page_id>), where owners are linked and revoked.
 * A row whose owner the server has locked for staff
 * (`owner.locked_for_staff === true`) carries a Locked marker.
 *
 * Filters (all server-side, via useAdminValidatorDirectory):
 *   - chain tabs, one per entry in the response's `chains` facet, plus
 *     "All chains"; each shows its page total;
 *   - state chips (All / Unclaimed / Wallet Verified / Verified by BCC /
 *     Conflict) with counts from the selected chain's facet entry;
 *   - a search box, debounced 200ms (the ModerationQueue beat).
 *
 * The facet is remembered from the last answer, so the tabs and counts
 * stay on screen while a new filter set loads; the rows below show
 * skeletons until it lands.
 *
 * No business logic: the state, the owner's verification and "wallet
 * claim possible" are all server-decided. The only arithmetic here is
 * adding up the facet's counts for the tab totals and the All chip.
 */

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

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
  STATE_LABEL,
  STATE_ORDER,
  verificationLabel,
} from "@/components/admin/validators/labels";
import { LockedMarker, lockedForStaff, StatePill } from "@/components/admin/validators/StatePill";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { TabRail } from "@/components/ui/TabRail";
import {
  useAdminValidatorDirectory,
  type AdminValidatorDirectoryFilters,
} from "@/hooks/useAdminValidators";
import { useRovingTabs } from "@/hooks/useRovingTabs";
import { isAdminDenial, isAdminToolUnavailable } from "@/lib/api/admin-errors";
import type {
  AdminValidatorDirectoryChain,
  AdminValidatorDirectoryItem,
  AdminValidatorPageState,
  AdminValidatorStateCounts,
} from "@/lib/api/types";

const SUBJECT = "The validator directory";

/** Tab key for "no chain filter". `*` is never a chain slug. */
const ALL_CHAINS = "*";

const DEFAULT_FILTERS: AdminValidatorDirectoryFilters = { chain: null, state: null, q: "" };

const ZERO_COUNTS: AdminValidatorStateCounts = {
  unclaimed: 0,
  wallet_verified: 0,
  staff_verified: 0,
  conflict: 0,
};

function totalOf(counts: AdminValidatorStateCounts): number {
  return STATE_ORDER.reduce((sum, state) => sum + counts[state], 0);
}

/** The selected chain's counts, or every chain's added up for "All chains". */
function countsFor(
  chains: ReadonlyArray<AdminValidatorDirectoryChain>,
  chain: string | null,
): AdminValidatorStateCounts {
  if (chain !== null) {
    return chains.find((c) => c.slug === chain)?.counts ?? ZERO_COUNTS;
  }
  const sum = { ...ZERO_COUNTS };
  for (const c of chains) {
    for (const state of STATE_ORDER) sum[state] += c.counts[state];
  }
  return sum;
}

export function ValidatorDirectory() {
  const [filters, setFilters] = useState<AdminValidatorDirectoryFilters>(DEFAULT_FILTERS);

  const [qDraft, setQDraft] = useState("");
  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = qDraft.trim();
      setFilters((prev) => (prev.q === next ? prev : { ...prev, q: next }));
    }, 200);
    return () => window.clearTimeout(id);
  }, [qDraft]);

  const query = useAdminValidatorDirectory(filters);

  const freshChains = query.data?.pages[0]?.chains;
  const [lastChains, setLastChains] = useState<AdminValidatorDirectoryChain[] | null>(null);
  useEffect(() => {
    if (freshChains !== undefined) setLastChains(freshChains);
  }, [freshChains]);
  const chains = freshChains ?? lastChains;

  const selectChain = useCallback((key: string) => {
    setFilters((prev) => ({ ...prev, chain: key === ALL_CHAINS ? null : key }));
  }, []);
  const selectState = useCallback((state: AdminValidatorPageState | null) => {
    setFilters((prev) => ({ ...prev, state }));
  }, []);
  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setQDraft("");
  }, []);

  const tabs = useMemo(
    () =>
      chains === null
        ? []
        : [
            { key: ALL_CHAINS, label: "All chains", total: totalOf(countsFor(chains, null)) },
            ...chains.map((c) => ({ key: c.slug, label: c.name, total: totalOf(c.counts) })),
          ],
    [chains],
  );
  const tabKeys = useMemo(() => tabs.map((t) => t.key), [tabs]);
  const { setRef, onKeyDown } = useRovingTabs<string>(tabKeys, selectChain);

  const idPrefix = useId();
  const searchId = `${idPrefix}-search`;
  const panelId = `${idPrefix}-panel`;
  const activeKey = filters.chain ?? ALL_CHAINS;
  const activeIndex = tabKeys.indexOf(activeKey);

  // An admin denial or a missing route is the server's answer for every
  // filter, so nothing else on this screen is usable.
  if (
    (query.isLoadingError || query.isRefetchError) &&
    (isAdminDenial(query.error) || isAdminToolUnavailable(query.error))
  ) {
    return (
      <AdminReadFailure error={query.error} subject={SUBJECT} onRetry={() => void query.refetch()} />
    );
  }

  const stateCounts = chains === null ? null : countsFor(chains, filters.chain);
  const stateOptions =
    stateCounts === null
      ? []
      : [
          { value: null, label: `All · ${totalOf(stateCounts)}` },
          ...STATE_ORDER.map((state) => ({
            value: state,
            label: `${STATE_LABEL[state]} · ${stateCounts[state]}`,
          })),
        ];

  const filtersActive = filters.chain !== null || filters.state !== null || filters.q !== "";

  let results: React.ReactNode;
  if (query.isPending) {
    results = <AdminListSkeleton label="Loading validator pages…" rowClassName="h-44" />;
  } else if (query.isLoadingError) {
    results = (
      <AdminReadFailure error={query.error} subject={SUBJECT} onRetry={() => void query.refetch()} />
    );
  } else {
    const items = query.data.pages.flatMap((page) => page.items);
    results = (
      <>
        {/* A failed REFRESH keeps the rows and offers the recovery beside them. */}
        {query.isRefetchError && (
          <div className="bcc-panel">
            <LoadFailure
              message={adminReadFailureCopy(query.error, SUBJECT)}
              onRetry={() => void query.refetch()}
            />
          </div>
        )}

        {/* "Nothing here" is a claim about the server; a failed read doesn't support it. */}
        {items.length === 0 ? (
          query.isError ? null : filtersActive ? (
            <AdminEmptyState
              eyebrow="NO MATCHES"
              heading="No validator pages match."
              body="Try another chain or state, or clear the search."
              action={{ label: "CLEAR FILTERS", onClick: clearFilters }}
            />
          ) : (
            <AdminEmptyState
              eyebrow="EMPTY DIRECTORY"
              heading="No validator pages yet."
              body="Validator pages show up here once they are indexed."
            />
          )
        ) : (
          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <DirectoryRow key={item.page_id} item={item} />
            ))}
          </ul>
        )}

        {/* Cursor safety: while the NEXT page is failed, Load more is
            withdrawn so it cannot skip the page that failed. Retry
            re-requests that same page. */}
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
      {tabs.length > 0 && (
        <TabRail activeKey={activeKey}>
          <div
            role="tablist"
            aria-label="Chains"
            // Scrolls below `sm` (bleeding to the page container's px-6
            // edge), wraps from `sm` up so no chain hides past the edge.
            className="-mx-6 flex items-center gap-x-1 overflow-x-auto border-b border-bcc-border px-6 sm:mx-0 sm:flex-wrap sm:px-0"
          >
            {tabs.map((tab, index) => {
              const active = tab.key === activeKey;
              return (
                <button
                  key={tab.key}
                  ref={setRef(tab.key)}
                  type="button"
                  role="tab"
                  id={`${idPrefix}-tab-${index}`}
                  aria-selected={active}
                  {...(active ? { "aria-controls": panelId } : {})}
                  tabIndex={active ? 0 : -1}
                  onClick={() => selectChain(tab.key)}
                  onKeyDown={(e) => onKeyDown(e, index)}
                  className="bcc-tab shrink-0"
                >
                  {tab.label}
                  <span className="bcc-tab-count">{tab.total}</span>
                </button>
              );
            })}
          </div>
        </TabRail>
      )}

      <div
        className="flex flex-col gap-4"
        {...(tabs.length > 0
          ? {
              role: "tabpanel",
              id: panelId,
              ...(activeIndex >= 0 ? { "aria-labelledby": `${idPrefix}-tab-${activeIndex}` } : {}),
            }
          : {})}
      >
        <section aria-label="Directory filters" className="bcc-panel flex flex-col gap-5 p-5">
          {stateOptions.length > 0 && (
            <FilterChipRow
              label="STATE"
              options={stateOptions}
              selected={filters.state}
              onSelect={selectState}
            />
          )}
          <div className="flex flex-col gap-2">
            <label
              htmlFor={searchId}
              className="bcc-mono text-[10px] tracking-[0.2em] text-bcc-text-secondary"
            >
              SEARCH
            </label>
            <input
              id={searchId}
              type="search"
              value={qDraft}
              onChange={(e) => setQDraft(e.target.value)}
              placeholder="Search validator pages…"
              className="bcc-mono min-h-[44px] w-full bg-bcc-input-bg px-3 py-2 text-sm text-bcc-text placeholder:text-bcc-text-placeholder focus:outline-none ring-1 ring-bcc-input-border focus:ring-2 focus:ring-bcc-accent"
            />
          </div>
        </section>

        {results}
      </div>
    </div>
  );
}

function DirectoryRow({ item }: { item: AdminValidatorDirectoryItem }) {
  return (
    <li className="bcc-panel flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="bcc-stencil min-w-0 break-words text-xl text-bcc-text">
          <Link href={`/admin/validators/${item.page_id}` as Route} className="hover:underline">
            {item.title}
          </Link>
        </h2>
        <span className="flex flex-wrap items-center gap-2">
          {lockedForStaff(item.owner) && <LockedMarker />}
          <StatePill state={item.state} />
        </span>
      </div>

      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <AdminField label="Chain">{item.chain.name}</AdminField>
        <AdminField label="Wallet claim possible">
          {item.wallet_claim_possible ? "Yes" : "No"}
        </AdminField>
        <AdminField
          label={item.operator_addresses.length > 1 ? "Operator addresses" : "Operator address"}
          wide
        >
          {item.operator_addresses.length === 0 ? (
            <span className="font-serif italic text-bcc-text-secondary">None on record</span>
          ) : (
            <ul className="flex flex-col gap-1">
              {item.operator_addresses.map((address) => (
                <li key={address}>
                  <code className="bcc-mono block break-all text-[11px] text-bcc-text">
                    {address}
                  </code>
                </li>
              ))}
            </ul>
          )}
        </AdminField>
        <AdminField label="Owner" wide>
          {item.owner === null ? (
            <span className="font-serif italic text-bcc-text-secondary">No owner</span>
          ) : (
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <AdminUserChip user={item.owner.user} />
              <span className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-secondary">
                VIA {verificationLabel(item.owner.verification).toUpperCase()}
              </span>
            </span>
          )}
        </AdminField>
      </dl>

      {item.uncovered_validator_count > 0 && (
        <p className="bcc-mono text-[11px] tracking-[0.12em] text-bcc-text-secondary">
          Uncovered validators: {item.uncovered_validator_count}
        </p>
      )}
    </li>
  );
}
