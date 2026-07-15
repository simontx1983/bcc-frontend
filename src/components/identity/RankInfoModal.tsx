"use client";

/**
 * RankInfoModal — the glassy explainer opened by clicking a RankChip.
 * Two axes, honestly named (see HANDOVER-frontend-card-redesign §4B):
 *   - RANK = capability (Apprentice → Journeyman → Master; Foreman is a
 *     conferred role, not a rung). The member's own rank is the focus.
 *   - TRUST = a risk/quality band shown as the chip's colored dot
 *     (Risky → Elite). The dot is a safety signal, NOT a rarity palette.
 *
 * The trust legend is a horizontal carousel of equal cards, scrolled so
 * the member's CURRENT band sits in the middle (scroll both ways to see
 * better/worse). ~3 cards show on desktop, ~2 on mobile.
 *
 * Viewing someone else → header + ladder + legend. Viewing yourself →
 * plus your live progression, rendered verbatim from
 * `feature_access.next_level_thresholds` (§A2 — never templated from
 * slugs). The profile is fetched lazily (only while open) via the cached
 * `useUser`; if it 404s (legacy handle) the legend still renders from the
 * chip's own tier/rank.
 */

import { useEffect, useRef } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { useUser } from "@/hooks/useUser";
import type { CardTier, ReputationTier } from "@/lib/api/types";

interface RankInfoModalProps {
  handle: string;
  cardTier: CardTier;
  tierLabel: string | null;
  rankLabel: string;
  onClose: () => void;
}

interface TierRow {
  key: ReputationTier;
  label: string;
  color: string;
  /** Static soft glow (box-shadow). */
  glow: boolean;
  /** Continuous breathing glow — reserved for the extremes (risky/elite). */
  pulse: boolean;
  blurb: string;
}

// Best → worst, left → right (elite/trusted lead, risky/caution trail).
const TIER_ROWS: TierRow[] = [
  { key: "elite",   label: "Elite",   color: "var(--bcc-trust-elite)",   glow: true,  pulse: true,  blurb: "Top-tier trust — long track record, heavily vouched." },
  { key: "trusted", label: "Trusted", color: "var(--bcc-trust-trusted)", glow: true,  pulse: false, blurb: "Consistent good standing, backed by the community." },
  { key: "neutral", label: "Neutral", color: "var(--bcc-trust-neutral)", glow: false, pulse: false, blurb: "New or quiet — not enough signal yet." },
  { key: "caution", label: "Caution", color: "var(--bcc-trust-caution)", glow: true,  pulse: false, blurb: "Some unresolved signals — verify before you trust." },
  { key: "risky",   label: "Risky",   color: "var(--bcc-trust-risky)",   glow: true,  pulse: true,  blurb: "Disputes or red flags — proceed carefully." },
];

const RANK_RUNGS = ["Apprentice", "Journeyman", "Master"];

function cardTierToBand(tier: CardTier): ReputationTier | null {
  switch (tier) {
    case "legendary": return "elite";
    case "rare":      return "trusted";
    case "uncommon":  return "neutral";
    case "common":    return "caution";
    default:          return null;
  }
}

export function RankInfoModal({
  handle,
  cardTier,
  tierLabel,
  rankLabel,
  onClose,
}: RankInfoModalProps) {
  const { data: profile } = useUser(handle, { enabled: true });

  const currentTier: ReputationTier | null =
    profile?.reputation_tier ?? cardTierToBand(cardTier);
  const isSelf = profile?.is_self ?? false;
  const featureAccess = profile?.feature_access;

  const currentRank =
    profile?.rank_label !== undefined && profile.rank_label !== ""
      ? profile.rank_label
      : rankLabel;

  // Center the current-tier card on open (scroll both directions from it).
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    const card = currentCardRef.current;
    if (scroller === null || card === null) return;
    scroller.scrollLeft =
      card.offsetLeft - (scroller.clientWidth - card.clientWidth) / 2;
    // Re-run once the profile lands (currentTier may shift from card_tier
    // to the authoritative reputation_tier).
  }, [currentTier]);

  return (
    <Dialog
      title="Rank & trust"
      onClose={onClose}
      center
      animateIn
      glass
      panelClassName="max-w-[440px] flex flex-col gap-4"
    >
      {/* Header — the member's rank is the focus. */}
      <div className="flex flex-col gap-0.5 pr-8">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-[var(--bcc-text-muted)]">
          {isSelf ? "YOUR STANDING" : "THIS MEMBER"}
        </span>
        <span className="bcc-stencil text-[22px] leading-none text-[var(--bcc-text)]">
          {currentRank !== "" ? currentRank : "Member"}
        </span>
        {tierLabel !== null && (
          <span className="bcc-mono text-[11px] text-[var(--bcc-text-secondary)]">
            {tierLabel} trust tier
          </span>
        )}
      </div>

      {/* Rank ladder — capability + the Foreman callout. */}
      <section className="flex flex-col gap-2">
        <h3 className="bcc-stencil text-[11px] tracking-[0.14em] text-[var(--bcc-text-secondary)]">
          RANK — WHAT THEY CAN DO
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {RANK_RUNGS.map((rung, i) => {
            const active = rung.toLowerCase() === currentRank.toLowerCase();
            return (
              <div key={rung} className="flex items-center gap-1.5">
                <span
                  className="bcc-mono rounded-full px-2.5 py-1 text-[10px] tracking-[0.12em]"
                  style={{
                    color: active ? "var(--bcc-accent)" : "var(--bcc-text-secondary)",
                    background: active ? "var(--bcc-accent-subtle)" : "var(--bcc-surface-active)",
                    border: active ? "1px solid var(--bcc-accent)" : "1px solid transparent",
                  }}
                >
                  {rung.toUpperCase()}
                </span>
                {i < RANK_RUNGS.length - 1 && (
                  <span className="text-[var(--bcc-text-muted)]">→</span>
                )}
              </div>
            );
          })}
        </div>
        {/* Foreman — highlighted so it doesn't read as a casual aside. */}
        <div
          className="flex items-start gap-2 rounded-lg px-2.5 py-2"
          style={{
            background: "var(--bcc-accent-subtle)",
            border: "1px solid var(--bcc-accent)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="var(--bcc-accent)"
            className="mt-0.5 shrink-0"
            aria-hidden
          >
            <path d="M12 2l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 21l-5.3 2.8 1-5.8-4.2-4.1 5.9-.9L12 2z" />
          </svg>
          <p className="text-[11px] leading-snug text-[var(--bcc-text)]">
            <span className="bcc-stencil tracking-wide text-[var(--bcc-accent)]">
              FOREMAN
            </span>{" "}
            is a conferred role — panel &amp; adjudication leadership — not a rung
            on this ladder.
          </p>
        </div>
      </section>

      {/* Trust legend — horizontal carousel, current band centered. */}
      <section className="flex flex-col gap-2">
        <h3 className="bcc-stencil text-[11px] tracking-[0.14em] text-[var(--bcc-text-secondary)]">
          TRUST — HOW FAR TO TRUST THEM
        </h3>
        <div className="-mx-6 md:-mx-8">
          <div
            ref={scrollerRef}
            className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-6 pb-1 md:px-8 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TIER_ROWS.map((row) => {
              const active = row.key === currentTier;
              return (
                <div
                  key={row.key}
                  ref={active ? currentCardRef : undefined}
                  className="flex h-[104px] w-[144px] shrink-0 snap-center flex-col gap-1.5 rounded-xl p-2.5"
                  style={{
                    border: active
                      ? "1.5px solid var(--bcc-accent)"
                      : "1px solid var(--bcc-border)",
                    background: active
                      ? "var(--bcc-surface-active)"
                      : "var(--bcc-surface)",
                  }}
                >
                  {/* Top row — dot + label + YOU together. */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className="relative inline-block shrink-0"
                      style={{ width: 11, height: 11 }}
                    >
                      {row.pulse && (
                        <span
                          aria-hidden
                          className="bcc-dot-glow bcc-dot-glow--pulse"
                          style={{
                            width: 11,
                            height: 11,
                            background: `radial-gradient(circle, ${row.color} 0%, transparent 70%)`,
                          }}
                        />
                      )}
                      <span
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          borderRadius: "9999px",
                          background: row.color,
                          boxShadow:
                            row.glow && !row.pulse ? `0 0 6px ${row.color}` : undefined,
                        }}
                      />
                    </span>
                    <span className="bcc-mono text-[11px] tracking-[0.1em] text-[var(--bcc-text)]">
                      {row.label.toUpperCase()}
                    </span>
                    {active && (
                      <span className="bcc-mono ml-auto text-[9px] tracking-[0.2em] text-[var(--bcc-accent)]">
                        YOU
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] leading-snug text-[var(--bcc-text-secondary)]">
                    {row.blurb}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Self progression — own profile only, verbatim from the contract. */}
      {isSelf && featureAccess !== undefined && featureAccess.next_level_thresholds.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-[var(--bcc-border)] pt-4">
          <h3 className="bcc-stencil text-[11px] tracking-[0.14em] text-[var(--bcc-text-secondary)]">
            {featureAccess.next_level_label !== null
              ? `TO REACH ${featureAccess.next_level_label.toUpperCase()}`
              : "YOUR PROGRESS"}
          </h3>
          <ul className="flex flex-col gap-2.5">
            {featureAccess.next_level_thresholds.map((t) => {
              const pct =
                t.required > 0
                  ? Math.min(100, Math.round((t.current / t.required) * 100))
                  : 100;
              return (
                <li key={t.metric} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-[var(--bcc-text)]">{t.label}</span>
                    <span className="bcc-mono text-[11px] text-[var(--bcc-text-secondary)]">
                      {t.current}/{t.required}
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bcc-surface-active)]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: "var(--bcc-accent)" }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Dialog>
  );
}
