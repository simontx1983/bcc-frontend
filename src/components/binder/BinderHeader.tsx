"use client";

/**
 * BinderHeader — §N9 identity-snapshot header.
 *
 * Renders the three slots that make the binder a portrait, not a
 * list:
 *   - Collection size
 *   - Tier distribution (stacked bar + legend)
 *   - Monthly activity (rolling 30 days)
 *
 * Data comes pre-shaped from `GET /me/binder/summary` per §A2/§L5 —
 * counts and percentages are server-computed, the component only
 * renders. When the summary is still loading or errored, the metric
 * slots collapse to a "—" placeholder so the layout doesn't shift
 * once data arrives.
 */

import { type ReactNode } from "react";

import type {
  BinderMonthlyActivity,
  BinderSummaryResponse,
  BinderTierDistribution,
} from "@/lib/api/types";

export interface BinderHeaderProps {
  handle: string;
  /** Total binder size (from BinderResponse.pagination.total). */
  total: number;
  /**
   * §N9 summary view-model. When undefined the slots fall back to
   * placeholders; pagination total still drives the collection-size
   * slot so the header isn't fully blank during the summary fetch.
   */
  summary?: BinderSummaryResponse | undefined;
}

export function BinderHeader({ handle, total, summary }: BinderHeaderProps) {
  return (
    <section className="mx-auto max-w-6xl px-6 pt-16 sm:px-8">
      <p className="bcc-mono text-cardstock-deep/70">
        @{handle} · binder
      </p>

      <h1 className="bcc-stencil mt-2 text-cardstock text-5xl md:text-6xl">
        Your binder
      </h1>

      <p className="mt-4 max-w-2xl font-serif text-xl text-cardstock-deep">
        Every card in your binder. Click through to view details, hover
        to remove.
      </p>

      <div className="mt-10 grid gap-6 border-y border-cardstock-edge/30 py-6 md:grid-cols-3">
        <Metric
          label="Collection size"
          value={total.toString()}
          hint={total === 1 ? "card" : "cards"}
        />

        <TierDistribution distribution={summary?.tier_distribution} />

        <MonthlyActivity activity={summary?.monthly_activity} />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Tier distribution — stacked bar + legend
// ─────────────────────────────────────────────────────────────────────

const TIER_ORDER = [
  "legendary",
  "rare",
  "uncommon",
  "common",
  "unknown",
] as const;

const TIER_LABELS: Record<(typeof TIER_ORDER)[number], string> = {
  legendary: "Legendary",
  rare:      "Rare",
  uncommon:  "Uncommon",
  common:    "Common",
  unknown:   "Other",
};

// Inline tier accents — distinct enough at a glance, deliberately
// understated to fit the cardstock palette. If/when the design
// system grows formal tier tokens, swap to CSS vars.
const TIER_COLORS: Record<(typeof TIER_ORDER)[number], string> = {
  legendary: "#d4af37",
  rare:      "#5a7fb5",
  uncommon:  "#5b9c66",
  common:    "#9a8f78",
  unknown:   "#3d3a35",
};

function TierDistribution({
  distribution,
}: {
  distribution: BinderTierDistribution | undefined;
}) {
  if (distribution === undefined) {
    return (
      <Metric
        label="Tier distribution"
        value="—"
        hint="loading…"
        stubbed
      />
    );
  }

  const visibleSlots = TIER_ORDER.filter((t) => distribution[t].percent > 0);

  if (visibleSlots.length === 0) {
    return (
      <Metric
        label="Tier distribution"
        value="—"
        hint="no cards yet"
        stubbed
      />
    );
  }

  return (
    <div>
      <p className="bcc-mono text-xs text-cardstock-deep/70">
        Tier distribution
      </p>

      <div
        className="mt-3 flex h-2 overflow-hidden rounded-sm bg-cardstock-deep/20"
        role="img"
        aria-label={visibleSlots
          .map(
            (t) =>
              `${TIER_LABELS[t]}: ${distribution[t].count} (${distribution[t].percent}%)`
          )
          .join(", ")}
      >
        {visibleSlots.map((tier) => (
          <div
            key={tier}
            style={{
              width: `${distribution[tier].percent}%`,
              background: TIER_COLORS[tier],
            }}
            title={`${TIER_LABELS[tier]}: ${distribution[tier].count} (${distribution[tier].percent}%)`}
          />
        ))}
      </div>

      <ul className="bcc-mono mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-cardstock-deep/80">
        {visibleSlots.map((tier) => (
          <li key={tier} className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: TIER_COLORS[tier] }}
              aria-hidden
            />
            {TIER_LABELS[tier]} {distribution[tier].count}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Monthly activity — rolling 30 days
// ─────────────────────────────────────────────────────────────────────

function MonthlyActivity({
  activity,
}: {
  activity: BinderMonthlyActivity | undefined;
}) {
  if (activity === undefined) {
    return (
      <Metric label="This month" value="—" hint="loading…" stubbed />
    );
  }

  const total =
    activity.reviews + activity.solids_received + activity.disputes_signed;

  if (total === 0) {
    return (
      <Metric
        label="This month"
        value="Quiet shift"
        hint="no recorded activity"
        stubbed
      />
    );
  }

  return (
    <div>
      <p className="bcc-mono text-xs text-cardstock-deep/70">This month</p>

      <ul className="mt-1 space-y-0.5 font-serif text-cardstock">
        {activity.reviews > 0 && (
          <li className="bcc-stencil text-2xl">
            {activity.reviews}{" "}
            <span className="bcc-mono text-xs text-cardstock-deep/70">
              review{activity.reviews === 1 ? "" : "s"}
            </span>
          </li>
        )}
        {activity.solids_received > 0 && (
          <li className="bcc-stencil text-2xl">
            {activity.solids_received}{" "}
            <span className="bcc-mono text-xs text-cardstock-deep/70">
              solid{activity.solids_received === 1 ? "" : "s"} received
            </span>
          </li>
        )}
        {activity.disputes_signed > 0 && (
          <li className="bcc-stencil text-2xl">
            {activity.disputes_signed}{" "}
            <span className="bcc-mono text-xs text-cardstock-deep/70">
              dispute{activity.disputes_signed === 1 ? "" : "s"} signed
            </span>
          </li>
        )}
      </ul>
      <p className="bcc-mono mt-1 text-[10px] text-cardstock-deep/60">
        rolling 30d
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Metric — shared placeholder slot used by collection-size + stubs
// ─────────────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  hint,
  stubbed = false,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  stubbed?: boolean;
}) {
  return (
    <div>
      <p className="bcc-mono text-xs text-cardstock-deep/70">{label}</p>
      <p
        className={
          stubbed
            ? "bcc-stencil mt-1 text-2xl text-cardstock-deep/60"
            : "bcc-stencil mt-1 text-3xl text-cardstock"
        }
      >
        {value}
      </p>
      <p className="bcc-mono mt-1 text-[10px] text-cardstock-deep/60">{hint}</p>
    </div>
  );
}
