/**
 * PageHero — the single hero grammar used by every profile-style and
 * group-style page. Renders the directory-style card on the left, the
 * entity-specific action cluster on the right (both wrapped in a
 * dotted-border box), the bio in a peer box beside it, and an optional
 * trust panel + tabs below.
 *
 * Visual rhythm (top → bottom):
 *
 *   ┌─── DOTTED BORDER ────────────┐   ┌── BIO ──┐
 *   │ ┌────────┐                   │   │         │
 *   │ │ CARD   │  [page-specific   │   │ first   │
 *   │ │        │   action cluster] │   │ 25 wds  │
 *   │ │        │                   │   │ …more   │
 *   │ └────────┘                   │   └─────────┘
 *   └──────────────────────────────┘
 *
 *   ┌── TRUST PANEL (cream) ──────────────────────┐
 *   │  ReputationSummaryPanel etc.                │
 *   └─────────────────────────────────────────────┘
 *
 *   [ tabs slot ]
 *
 * Composition rules:
 *   - `card` is anything the caller wants — typically a directory-style
 *     card (FlippableMemberCard / FlippableNftCard / CardFactory). Caller
 *     constrains the width via the wrapping div.
 *   - `actions` is the page-specific cluster — AttestationActionCluster
 *     + ClaimCallout + ReviewCallout + EndorseButton + DisputeCallout on
 *     trust-target pages; GroupActionButton on group pages; null on
 *     pages with no actions.
 *   - `bio` accepts either a BioBox (or anything renderable). When the
 *     subject has no bio/description, caller can omit it.
 *   - `trustPanel` is optional — only trust-target pages (users, entity
 *     cards) carry a ReputationSummaryPanel. Group pages omit it.
 *   - `tabs` is the sub-navigation (ProfileTabs, GroupTabs, etc.) —
 *     rendered as the last block; sibling page content goes below it
 *     via the page's own JSX.
 *
 * Server component. Memoized at the export per the project rule for
 * shared primitives.
 */

import { memo, type ReactNode } from "react";

export interface PageHeroProps {
  /** Directory-style card on the left of the dotted box. */
  card: ReactNode;
  /** Action cluster to the right of the card, inside the dotted box. */
  actions?: ReactNode;
  /** Full-width slot INSIDE the dotted box, below the card+actions row.
   *  Use for content that needs to span the full hero width — counts
   *  strips, on-chain stat tables, etc. */
  belowHero?: ReactNode;
  /** Cream-panel trust block rendered below the dotted box. */
  trustPanel?: ReactNode;
  /** Sub-navigation rendered as the last block in the hero region. */
  tabs?: ReactNode;
}

function PageHeroImpl({
  card,
  actions,
  belowHero,
  trustPanel,
  tabs,
}: PageHeroProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-4 sm:px-7">
      <div className="flex flex-col gap-6 border border-dashed border-cardstock-edge p-5 sm:p-6">
        <div className="flex flex-col items-start gap-6 sm:flex-row">
          {/* Card slot — sized to the .bcc-card intrinsic 316px width
              so the trading-card primitive doesn't overflow into the
              actions column. Stays full-width on mobile (the card
              shrinks via its own CSS at narrow viewports). */}
          <div className="w-full shrink-0 sm:w-[316px]">{card}</div>
          {actions !== undefined && actions !== null && (
            <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
              {actions}
            </div>
          )}
        </div>

        {belowHero !== undefined && belowHero !== null && (
          <div className="w-full">{belowHero}</div>
        )}
      </div>

      {trustPanel !== undefined && trustPanel !== null && (
        <div>{trustPanel}</div>
      )}

      {tabs !== undefined && tabs !== null && <div>{tabs}</div>}
    </div>
  );
}

export const PageHero = memo(PageHeroImpl);
PageHero.displayName = "PageHero";
