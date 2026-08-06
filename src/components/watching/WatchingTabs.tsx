"use client";

/**
 * WatchingTabs — the /watching surface shell.
 *
 * Two tabs over the viewer's own follow graph:
 *
 *   WATCHING — who you watch (GET /me/watching?include=cards)
 *   WATCHERS — who watches you (GET /users/{handle}/followers)
 *
 * Both render the canonical CardFactory trading card, so the surface
 * reads as two slices of the same directory rather than two bespoke
 * lists.
 *
 * URL state: `?tab=` + `?page=`, canonicalised — the default tab and
 * page 1 delete their params, so the bare `/watching` is always the
 * canonical URL. Switching tabs drops `?page=` (page 3 of Watching
 * means nothing on Watchers). One `router.replace` helper owns both
 * params so a tab switch can never race a page change into a
 * half-written query string. Same pattern as SearchResultsPage.
 *
 * Tab counts: two subscriptions, and they are NOT free. Earlier copy
 * here claimed they were; that was only ever true of the active tab
 * sitting on page 1.
 *
 *   WATCHING — `useWatching` at page 1, params object kept byte-identical
 *     to <WatchingCardsPanel>'s so React Query dedupes against the
 *     panel's own read. That covers the common case (Watching tab, page
 *     1) at zero cost; on page ≥ 2, or while the Watchers tab is active,
 *     it is a second hydrated page-1 payload.
 *
 *     That cost buys a count that agrees with the header underneath it.
 *     §N9's `/me/watching/summary.total` is NOT the same quantity: it
 *     counts PeepSo follows only (WatchingRepository::countItemsForUser),
 *     while the list's `pagination.total` — which <WatchingHeader> renders
 *     as "Collection size" — is PeepSo follows PLUS bcc_page_follows
 *     (WatchingService::listForUser, `$peepsoTotal + $pageFollowCount`).
 *     Sourcing the chip from the summary would print a smaller number
 *     directly above a larger one on the same screen for any operator who
 *     watches an unclaimed validator/project/creator page.
 *
 *   WATCHERS — `useUserFollowers(handle, 0)`. The only source for the
 *     inbound count, so it is always a real read. It doubles as a
 *     warm-up: the Watchers tab has its first page cached before it is
 *     ever clicked.
 */

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

import { WatchersPanel } from "@/components/watching/WatchersPanel";
import {
  WATCHING_PAGE_SIZE,
  WatchingCardsPanel,
} from "@/components/watching/WatchingCardsPanel";
import { useUserFollowers } from "@/hooks/useUserActivity";
import { useWatching } from "@/hooks/useWatching";
import { FOLLOW_COPY } from "@/lib/copy";

const VALID_TABS = ["watching", "watchers"] as const;
type TabKey = (typeof VALID_TABS)[number];
const DEFAULT_TAB: TabKey = "watching";

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "watching", label: FOLLOW_COPY.state },
  { key: "watchers", label: FOLLOW_COPY.noun },
];

export interface WatchingTabsProps {
  handle: string;
}

export function WatchingTabs({ handle }: WatchingTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab: TabKey = useMemo(() => {
    const raw = searchParams.get("tab");
    return VALID_TABS.includes(raw as TabKey) ? (raw as TabKey) : DEFAULT_TAB;
  }, [searchParams]);

  const page = useMemo(() => {
    const raw = searchParams.get("page");
    const parsed = raw === null ? 1 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [searchParams]);

  // Single writer for both params — keeps `?tab=` and `?page=` atomic
  // and keeps the canonical form (defaults deleted, not written out).
  const applyUrl = useCallback(
    (nextTab: TabKey, nextPage: number): void => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextTab === DEFAULT_TAB) params.delete("tab");
      else params.set("tab", nextTab);
      if (nextPage <= 1) params.delete("page");
      else params.set("page", String(nextPage));

      const qs = params.toString();
      router.replace((qs !== "" ? `${pathname}?${qs}` : pathname) as Route, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  // A tab switch always resets to page 1 (the param is dropped).
  const setTab = useCallback(
    (next: TabKey): void => applyUrl(next, 1),
    [applyUrl],
  );
  const setPage = useCallback(
    (next: number): void => applyUrl(tab, next),
    [applyUrl, tab],
  );

  // Count subscriptions — see the header note for what each one costs and
  // why the Watching count is not read off the §N9 summary. The params
  // object must stay byte-identical to WatchingCardsPanel's page-1 read or
  // React Query mints a second key and the dedupe is lost.
  const watchingCount = useWatching({
    page: 1,
    page_size: WATCHING_PAGE_SIZE,
    include: "cards",
  });
  const watchersCount = useUserFollowers(handle, 0);

  const counts: Record<TabKey, number | undefined> = {
    watching: watchingCount.data?.pagination.total,
    watchers: watchersCount.data?.pagination.total,
  };

  return (
    // bcc-page-wide opts out of .bcc-col-center's 680px reading-width cap
    // (globals.css). Without it the card grid is squeezed to a single 316px
    // column, since 680 minus this container's padding falls just short of
    // two. Same opt-out /members, /directory and /validators use.
    <main className="bcc-page-wide min-h-screen pb-24">
      <header className="bcc-rail">
        <span>
          <span className="bcc-rail-dot" />
          BCC // {FOLLOW_COPY.state}
        </span>
        <span className="bcc-mono text-bcc-text-secondary">@{handle}</span>
      </header>

      {/* Width and padding match /members so both roster surfaces lay out
          on the same track and fit the same number of cards per row. */}
      <div className="mx-auto max-w-[1560px] px-4 sm:px-7">
        <header className="pt-16">
          <p className="bcc-mono text-bcc-text-secondary">
            @{handle} · {FOLLOW_COPY.stateLower}
          </p>
          <h1 className="bcc-stencil mt-2 text-bcc-text text-5xl md:text-6xl">
            {FOLLOW_COPY.state}
          </h1>
          <p className="mt-4 max-w-2xl font-serif text-xl text-bcc-text-secondary">
            Who you watch, and who watches you.
          </p>
        </header>

        {/* Mobile overflow armor from ProfileTabs: bleed to the viewport
            edge and scroll horizontally under sm rather than shrinking
            the tabs below readable width. The bleed must cancel THIS
            container's padding exactly (-mx-4/px-4 against px-4), or the
            rule sits inset from the edge. */}
        <div
          role="tablist"
          aria-label="Watching sections"
          className="-mx-4 mt-10 flex items-center gap-x-1 overflow-x-auto border-b border-bcc-border px-4 sm:mx-0 sm:px-0"
        >
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              id={`tab-${entry.key}`}
              aria-selected={tab === entry.key}
              aria-controls={`tabpanel-${entry.key}`}
              onClick={() => setTab(entry.key)}
              className="bcc-tab shrink-0"
            >
              {entry.label}
              {counts[entry.key] !== undefined && (
                <span className="bcc-tab-count">{counts[entry.key]}</span>
              )}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`tabpanel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          aria-live="polite"
        >
          {tab === "watching" ? (
            <WatchingCardsPanel page={page} onPageChange={setPage} />
          ) : (
            <WatchersPanel handle={handle} page={page} onPageChange={setPage} />
          )}
        </div>
      </div>
    </main>
  );
}
