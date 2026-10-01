"use client";

/**
 * EntityTabs — the bottom-of-entity-profile tab strip.
 *
 * Sibling to ProfileTabs (member profile) — same dashed border + safety-
 * orange active underline (the `.bcc-tab` class is the shared CSS oracle)
 * so /v, /p, /c and /u read as one product.
 *
 * Tab roster:
 *   Backing   — AttestationRoster (§J.6 reputation-first roster)
 *   Reviews   — CardReviewsPanel (per-card votes)
 *   Activity  — operator stream (LockedStreamPanel / §N10 empty)
 *   Watchers  — CardWatchersPanel (PeepSo follower graph anchored on
 *               the page's post_author; empty for unclaimed cards)
 *   On-chain  — OnchainSignalsBlock (validator-only; tab hidden when
 *               indexer hasn't produced data)
 *   Chains    — ChainTabs (multi-chain operators only)
 *
 * Default active tab: `backing` — matches the visitor default on
 * /u/[handle] per §J.6 (trust headline is the first thing answered).
 *
 * Order mirrors /u/[handle]'s ProfileTabs: Backing first (trust
 * headline), Reviews/Activity in the middle (read-then-act), Watchers,
 * entity-only tabs at the end. (A Disputes tab was retired 2026-07-08 —
 * active-dispute context now lives in the §J negative-signals summary.)
 */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { ATTESTATION_COPY } from "@/lib/copy/trust-layer";
import { useRovingTabs } from "@/hooks/useRovingTabs";
import { TabRail } from "@/components/ui/TabRail";

type EntityTabKey =
  | "backing"
  | "reviews"
  | "activity"
  | "watchers"
  | "onchain"
  | "chains";

interface EntityTabDef {
  key: EntityTabKey;
  label: string;
}

export interface EntityTabsProps {
  /** Always-on Backing panel content. */
  backingPanel: ReactNode;
  /** Always-on Reviews panel content. */
  reviewsPanel: ReactNode;
  /** Always-on Activity (stream) panel content. */
  activityPanel: ReactNode;
  /** Always-on Watchers panel content. */
  watchersPanel: ReactNode;
  /** Optional On-chain panel — when null, the tab is hidden. */
  onchainPanel?: ReactNode | null;
  /** Optional Chains panel — when null, the tab is hidden. */
  chainsPanel?: ReactNode | null;
}

export function EntityTabs({
  backingPanel,
  reviewsPanel,
  activityPanel,
  watchersPanel,
  onchainPanel,
  chainsPanel,
}: EntityTabsProps) {
  const hasOnchain = onchainPanel !== undefined && onchainPanel !== null;
  const hasChains  = chainsPanel  !== undefined && chainsPanel  !== null;

  // Memoized because `tabKeys` below feeds useRovingTabs, whose onKeyDown is
  // itself memoized on the key list — rebuilding the array every render would
  // rebuild the handler every render for no reason.
  const tabs: EntityTabDef[] = useMemo(() => {
    const list: EntityTabDef[] = [
      // See ProfileTabs — genus term, key stays `backing` for deep links.
      { key: "backing",  label: ATTESTATION_COPY.supporters_tab },
      { key: "reviews",  label: "Reviews"  },
      { key: "activity", label: "Activity" },
      { key: "watchers", label: "Watchers" },
    ];
    if (hasOnchain) list.push({ key: "onchain", label: "On-chain" });
    if (hasChains)  list.push({ key: "chains",  label: "Chains"  });
    return list;
  }, [hasOnchain, hasChains]);

  const [active, setActive] = useState<EntityTabKey>("backing");

  const tabKeys = useMemo(() => tabs.map((tab) => tab.key), [tabs]);

  /**
   * MANUAL activation, matching both profile strips: Arrow/Home/End move
   * focus, Enter/Space selects. Automatic activation would be wrong here for
   * the same reason it is wrong on ProfileTabs — Reviews, Watchers and
   * Backing each fetch on mount, so selection-following-focus would fire a
   * request for every tab the operator merely arrows past.
   */
  const { setRef, onKeyDown } = useRovingTabs<EntityTabKey>(tabKeys, setActive);

  return (
    <section className="bcc-stage-reveal" style={{ ["--stagger" as string]: "560ms" }}>
      {/* Strip — mirrors ProfileTabs exactly (same .bcc-tab class).
          Horizontal scroll on phones so the row never compresses below
          a readable width. */}
      {/* Six tabs that scroll below `sm`. The active tab cannot ARRIVE
          off-screen here — `active` is seeded to the first key and there is no
          initialTab prop or URL read — but the rail still hides three of six
          on a phone with nothing to say so. The fade is the point; the reveal
          costs nothing and keeps the behaviour uniform across strips. */}
      <TabRail activeKey={active}>
      <div
        role="tablist"
        aria-label="Entity sections"
        className="-mx-4 flex items-center gap-x-1 overflow-x-auto border-b border-bcc-border px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            ref={setRef(tab.key)}
            type="button"
            role="tab"
            id={`entity-tab-${tab.key}`}
            aria-selected={active === tab.key}
            // Only the selected tab's panel is in the DOM. Every tab used to
            // carry `aria-controls`, so five of six pointed at an id that did
            // not exist — a dangling reference. Same resolution ProfileTabs
            // uses: the attribute is present only where its target is.
            {...(active === tab.key
              ? { "aria-controls": `entity-tabpanel-${tab.key}` }
              : {})}
            tabIndex={active === tab.key ? 0 : -1}
            onClick={() => setActive(tab.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className="bcc-tab shrink-0"
          >
            {tab.label}
          </button>
        ))}
      </div>
      </TabRail>

      <div
        role="tabpanel"
        id={`entity-tabpanel-${active}`}
        aria-labelledby={`entity-tab-${active}`}
        aria-live="polite"
        className="mt-6"
      >
        {active === "backing"  && backingPanel}
        {active === "reviews"  && reviewsPanel}
        {active === "activity" && activityPanel}
        {active === "watchers" && watchersPanel}
        {active === "onchain"  && onchainPanel !== undefined && onchainPanel !== null && onchainPanel}
        {active === "chains"   && chainsPanel  !== undefined && chainsPanel  !== null && chainsPanel}
      </div>
    </section>
  );
}
