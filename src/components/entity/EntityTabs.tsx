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
 *   Disputes  — CardDisputesPanel (open disputes filed against this card)
 *   On-chain  — OnchainSignalsBlock (validator-only; tab hidden when
 *               indexer hasn't produced data)
 *   Chains    — ChainTabs (multi-chain operators only)
 *
 * Default active tab: `backing` — matches the visitor default on
 * /u/[handle] per §J.6 (trust headline is the first thing answered).
 *
 * Order mirrors /u/[handle]'s ProfileTabs: Backing first (trust
 * headline), Reviews/Activity in the middle (read-then-act), Watchers,
 * Disputes after (adversarial signal), entity-only tabs at the end.
 */

import { useState } from "react";
import type { ReactNode } from "react";

type EntityTabKey =
  | "backing"
  | "reviews"
  | "activity"
  | "watchers"
  | "disputes"
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
  /** Always-on Disputes panel content. */
  disputesPanel: ReactNode;
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
  disputesPanel,
  onchainPanel,
  chainsPanel,
}: EntityTabsProps) {
  const tabs: EntityTabDef[] = [
    { key: "backing",  label: "Backing"  },
    { key: "reviews",  label: "Reviews"  },
    { key: "activity", label: "Activity" },
    { key: "watchers", label: "Watchers" },
    { key: "disputes", label: "Disputes" },
  ];
  if (onchainPanel !== undefined && onchainPanel !== null) {
    tabs.push({ key: "onchain", label: "On-chain" });
  }
  if (chainsPanel !== undefined && chainsPanel !== null) {
    tabs.push({ key: "chains", label: "Chains" });
  }

  const [active, setActive] = useState<EntityTabKey>("backing");

  return (
    <section className="bcc-stage-reveal" style={{ ["--stagger" as string]: "560ms" }}>
      {/* Strip — mirrors ProfileTabs exactly (same .bcc-tab class).
          Horizontal scroll on phones so the row never compresses below
          a readable width. */}
      <div
        role="tablist"
        aria-label="Entity sections"
        className="-mx-4 flex items-center gap-x-1 overflow-x-auto border-b border-cardstock/15 px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`entity-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`entity-tabpanel-${tab.key}`}
            onClick={() => setActive(tab.key)}
            className="bcc-tab shrink-0"
          >
            {tab.label}
          </button>
        ))}
      </div>

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
        {active === "disputes" && disputesPanel}
        {active === "onchain"  && onchainPanel !== undefined && onchainPanel !== null && onchainPanel}
        {active === "chains"   && chainsPanel  !== undefined && chainsPanel  !== null && chainsPanel}
      </div>
    </section>
  );
}
