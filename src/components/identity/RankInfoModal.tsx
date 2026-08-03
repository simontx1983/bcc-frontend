"use client";

/**
 * RankInfoModal — the glassy explainer opened by clicking a RankChip.
 * Two axes, honestly named (see HANDOVER-frontend-card-redesign §4B):
 *   - RANK = the earned ladder (Apprentice → Journeyman → Veteran,
 *     served by the §4.8 rank catalog). Since the Rank redesign Phase 5
 *     it is earned through contribution — but it is still NOT the trust
 *     axis, and a New Member simply holds no rung yet. ("Master" stays
 *     RESERVED per contract v1.58.)
 *   - TRUST = a risk/quality band shown as the chip's colored dot
 *     (Risky → Elite). The dot is a safety signal, NOT a rarity palette.
 *
 * The trust legend is a horizontal carousel of equal cards, scrolled so
 * the member's CURRENT band sits in the middle (scroll both ways to see
 * better/worse). ~3 cards show on desktop, ~2 on mobile.
 *
 * Rank redesign Phase 5: the ladder section renders from the server
 * catalog (GET /bcc/v1/ranks via useRankCatalog) — the ONLY rung source
 * (plan invariant 33). Loading → skeleton pills; error → the ladder
 * section hides entirely. The modal is a public "what ranks mean"
 * explainer; requirement detail lives on the owner's /me/progression
 * surface only (the old feature-access threshold section is retired
 * with the block itself).
 *
 * The profile is fetched lazily (only while open) via the cached
 * `useUser`; if it 404s (legacy handle) the legend still renders from
 * the chip's own tier/rank.
 */

import { useEffect, useRef } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { useRankCatalog } from "@/hooks/useRankCatalog";
import { useUser } from "@/hooks/useUser";
import type { ReputationTier } from "@/lib/api/types";

interface RankInfoModalProps {
  handle: string;
  reputationTier: ReputationTier;
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
  // "Elite" — matches ReputationTierMap::TIER_LABEL (owner decision 2026-07-28).
  // The client previously hardcoded a label that drifted from the server's.
  { key: "elite",   label: "Elite",   color: "var(--bcc-trust-elite)",   glow: true,  pulse: true,  blurb: "Top-tier trust — long track record, heavily vouched." },
  { key: "trusted", label: "Trusted", color: "var(--bcc-trust-trusted)", glow: true,  pulse: false, blurb: "Consistent good standing, backed by the community." },
  { key: "neutral", label: "Neutral", color: "var(--bcc-trust-neutral)", glow: false, pulse: false, blurb: "New or quiet — not enough signal yet." },
  { key: "caution", label: "Caution", color: "var(--bcc-trust-caution)", glow: true,  pulse: false, blurb: "Some unresolved signals — verify before you trust." },
  { key: "risky",   label: "Risky",   color: "var(--bcc-trust-risky)",   glow: true,  pulse: true,  blurb: "Disputes or red flags — proceed carefully." },
];


// cardTierToBand REMOVED (v1.57) — the modal receives a real reputation
// tier now, so there is nothing to translate. It existed only to recover a
// trust band from the retired rarity slug, and it could never recover
// `risky`, because that slug did not exist.

export function RankInfoModal({
  handle,
  reputationTier,
  tierLabel,
  rankLabel,
  onClose,
}: RankInfoModalProps) {
  const { data: profile } = useUser(handle, { enabled: true });
  const catalog = useRankCatalog();

  const currentTier: ReputationTier | null =
    profile?.reputation_tier ?? reputationTier;
  const isSelf = profile?.is_self ?? false;

  // Prefer the authoritative profile label once it lands; fall back to
  // the chip's own label. Nullable since Phase 5 (New Members carry no
  // rank) — normalized to "" for the comparisons below.
  const currentRank =
    typeof profile?.rank_label === "string" && profile.rank_label !== ""
      ? profile.rank_label
      : rankLabel;
  // The wire slug, when the profile has landed — a slug match beats a
  // label comparison (labels are display strings the server may retune).
  const currentRankKey =
    typeof profile?.rank === "string" && profile.rank !== ""
      ? profile.rank
      : null;
  // C8: "New member" only when the server SAYS new_member — an absent
  // member_state (old backend / failed fetch) falls back to the neutral
  // "Member", never to a fabricated state.
  const headerLabel =
    currentRank !== ""
      ? currentRank
      : profile?.member_state === "new_member"
        ? "New member"
        : "Member";

  // Center the current-tier card on open (scroll both directions from it).
  const scrollerRef = useRef<HTMLDivElement>(null);
  const currentCardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = scrollerRef.current;
    const card = currentCardRef.current;
    if (scroller === null || card === null) return;
    scroller.scrollLeft =
      card.offsetLeft - (scroller.clientWidth - card.clientWidth) / 2;
    // Re-run once the profile lands (currentTier may shift from reputation_tier
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
          {headerLabel}
        </span>
        {tierLabel !== null && (
          <span className="bcc-mono text-[11px] text-[var(--bcc-text-secondary)]">
            {tierLabel} trust tier
          </span>
        )}
      </div>

      {/* Rank ladder — served by the rank catalog (§4.8), the only rung
          source. Loading → skeleton pills; error → the whole section
          hides (an explainer with no honest data explains nothing). */}
      {(catalog.isLoading || catalog.data !== undefined) && (
        <section className="flex flex-col gap-2">
          <h3 className="bcc-stencil text-[11px] tracking-[0.14em] text-[var(--bcc-text-secondary)]">
            RANK — EARNED ON THE FLOOR
          </h3>
          {catalog.isLoading && (
            <div className="flex flex-wrap items-center gap-1.5" aria-hidden>
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-[26px] w-[92px] animate-pulse rounded-full bg-[var(--bcc-surface-active)]"
                />
              ))}
            </div>
          )}
          {catalog.data !== undefined && (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {catalog.data.ranks.map((rung, i) => {
                  const active =
                    currentRankKey !== null
                      ? rung.key === currentRankKey
                      : currentRank !== "" &&
                        rung.label.toLowerCase() === currentRank.toLowerCase();
                  return (
                    <div key={rung.key} className="flex items-center gap-1.5">
                      <span
                        className="bcc-mono rounded-full px-2.5 py-1 text-[10px] tracking-[0.12em]"
                        style={{
                          color: active ? "var(--bcc-accent)" : "var(--bcc-text-secondary)",
                          background: active ? "var(--bcc-accent-subtle)" : "var(--bcc-surface-active)",
                          border: active ? "1px solid var(--bcc-accent)" : "1px solid transparent",
                        }}
                      >
                        {rung.label.toUpperCase()}
                      </span>
                      {i < catalog.data.ranks.length - 1 && (
                        <span className="text-[var(--bcc-text-muted)]">→</span>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Server-owned descriptions, verbatim per §A2 — the modal
                  explains the ladder; it never invents requirement copy. */}
              <ul className="flex flex-col gap-1">
                {catalog.data.ranks.map((rung) => (
                  <li
                    key={rung.key}
                    className="text-[11px] leading-snug text-[var(--bcc-text-secondary)]"
                  >
                    <span className="bcc-mono tracking-[0.1em] text-[var(--bcc-text)]">
                      {rung.label.toUpperCase()}
                    </span>{" "}
                    — {rung.description}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] leading-snug text-[var(--bcc-text-secondary)]">
                Ranks are earned on the floor — not a measure of how far to
                trust someone. That&rsquo;s the trust tier below.
              </p>
            </>
          )}
        </section>
      )}

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

      {/* The old feature-access "TO REACH <LEVEL>" threshold section is
          retired with the block itself (Phase 5). Requirement detail is
          an owner-only concern and lives on /me/progression — this
          modal stays a public explainer. */}
    </Dialog>
  );
}
