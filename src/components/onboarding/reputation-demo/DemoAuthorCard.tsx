"use client";

/**
 * DemoAuthorCard — a view-only stand-in for the real post-detail author
 * card (mirrors `AuthorCard`'s markup so it stays visually identical),
 * driven by the active `ReputationDemoCombo`. Fake data only — never
 * imports `AuthorCard`/`AuthorVouchButton`/`MemberFollowButton` directly,
 * since those wire real attestation mutations against a real user id.
 *
 * On mount, plays a one-time "Follow collapses, Vouch expands" intro,
 * then reveals a tooltip inviting a click. Vouch IS a real toggle here
 * (unlike the post card side) — vouched/unvouched swaps the button's
 * look exactly like the real `.bcc-btn-vouch`/`-vouch-on` states, and a
 * sparkle burst fires on the OFF→ON transition only (same "burst only
 * on the way in" convention as Stoke — unvouching is silent). None of it
 * is a real mutation, so it's safe to toggle freely.
 */

import { useEffect, useState, type CSSProperties } from "react";
import Image from "next/image";
import { Sparkle } from "lucide-react";

import { RankChip } from "@/components/profile/RankChip";
import type { ReputationDemoCombo } from "@/components/onboarding/reputation-demo/combos";

const INTRO_COLLAPSE_MS = 700;
const TOOLTIP_DELAY_MS = 900;
const SPARKLE_COUNT = 8;
const SPARKLE_RADIUS = 34;

/** Evenly-fanned burst offsets — mirrors StokeFlame's particleOffsets. */
function sparkleOffsets(radius: number, count: number): ReadonlyArray<{ x: number; y: number; rotate: number }> {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    return {
      x: Math.round(Math.cos(angle) * radius),
      y: Math.round(Math.sin(angle) * radius),
      rotate: (i * 47) % 360,
    };
  });
}

const SPARKLE_OFFSETS = sparkleOffsets(SPARKLE_RADIUS, SPARKLE_COUNT);

export function DemoAuthorCard({
  combo,
  reducedMotion,
}: {
  combo: ReputationDemoCombo;
  reducedMotion: boolean;
}) {
  const [introDone, setIntroDone] = useState(reducedMotion);
  const [showTooltip, setShowTooltip] = useState(reducedMotion);
  const [vouched, setVouched] = useState(false);
  const [bloomKey, setBloomKey] = useState(0);

  const handleVouchClick = () => {
    setVouched((was) => {
      // Burst only fires going OFF → ON — same convention as Stoke;
      // un-vouching just drains back to the resting look, silently.
      if (!was) setBloomKey((k) => k + 1);
      return !was;
    });
  };

  useEffect(() => {
    if (reducedMotion) return;
    const collapseTimer = setTimeout(() => setIntroDone(true), INTRO_COLLAPSE_MS);
    const tooltipTimer = setTimeout(() => setShowTooltip(true), TOOLTIP_DELAY_MS);
    return () => {
      clearTimeout(collapseTimer);
      clearTimeout(tooltipTimer);
    };
  }, [reducedMotion]);

  return (
    <div className="bcc-panel relative flex flex-col overflow-hidden p-0">
      {/* Fake "cover photo" — a real demo account has no actual upload, so
          the real BCC wordmark stands in instead (same classes as
          SiteHeader's own logo lockup), on a theme-aware white/dark plate
          rather than the flat neutral band the real AuthorCard falls back
          to. Purely decorative brand flavor; not a signal like the
          RankChip below. */}
      <div
        className="flex h-14 w-full items-center justify-center border-b border-[var(--bcc-border)]"
        style={{ background: "var(--bcc-bg)" }}
        aria-hidden
      >
        <span className="bcc-brand-wordmark">
          <span className="bcc-brand-top">Blue Collar</span>
          <span className="bcc-brand-bottom">Crypto</span>
        </span>
      </div>

      <div className="flex flex-col gap-2.5 px-4 pb-4">
        {/* Same reasoning as the cover — the real logo mark on a
            theme-aware white/dark plate, instead of Avatar's usual
            initials-on-neutral fallback. */}
        <span
          className="-mt-7 inline-flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "var(--bcc-bg)", boxShadow: "0 0 0 4px var(--bcc-surface)" }}
        >
          <Image
            src="/images/Blue_Collar_Crypto_Logo.png"
            alt="Blue Collar Crypto"
            width={40}
            height={40}
          />
        </span>

        <div className="flex min-w-0 flex-col">
          <span className="bcc-stencil truncate text-[15px] leading-tight text-[var(--bcc-text)]">
            Demo Operator
          </span>
          <span className="bcc-mono truncate text-[12px] leading-tight text-[var(--bcc-text-secondary)]">
            @demo-operator
          </span>
          <span
            key={reducedMotion ? "static" : combo.id}
            className={"mt-1.5 " + (reducedMotion ? "" : "bcc-rep-demo-swap")}
          >
            <RankChip
              reputationTier={combo.reputationTier}
              tierLabel={combo.tierLabel}
              rankLabel={combo.rankLabel}
              
              size="compact"
            />
          </span>
        </div>

        <p className="font-serif text-[13px] italic leading-snug text-[var(--bcc-text-muted)]">
          On-chain infrastructure, three years running. What you see below is earned, not bought.
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
          <span className="text-[var(--bcc-text-secondary)]">
            <span className="font-semibold text-[var(--bcc-text)]">1.2K</span> Watching
          </span>
          <span className="text-[var(--bcc-text-secondary)]">
            <span className="font-semibold text-[var(--bcc-text)]">340</span> Watchers
          </span>
        </div>

        <div className="relative flex flex-col gap-1.5 pt-0.5">
          <div
            className={
              "flex items-stretch transition-all duration-500 ease-out " +
              (introDone ? "gap-0" : "gap-2")
            }
          >
            <div
              className="overflow-hidden transition-all duration-500 ease-out"
              style={{
                flexBasis: introDone ? "0%" : "50%",
                flexGrow: 0,
                opacity: introDone ? 0 : 1,
              }}
            >
              <button
                type="button"
                disabled
                aria-hidden={introDone}
                tabIndex={-1}
                className="bcc-btn bcc-btn-sm bcc-btn-outline w-full whitespace-nowrap"
              >
                Follow
              </button>
            </div>
            <span className="relative flex-1">
              <button
                type="button"
                onClick={handleVouchClick}
                aria-pressed={vouched}
                className={"bcc-btn bcc-btn-sm w-full " + (vouched ? "bcc-btn-vouch-on" : "bcc-btn-vouch")}
              >
                {vouched ? "Vouched" : "Vouch"}
              </button>

              {bloomKey > 0 && (
                <span
                  key={`bloom-${bloomKey}`}
                  aria-hidden
                  className={reducedMotion ? "" : "bcc-rep-demo-bloom"}
                />
              )}

              {!reducedMotion &&
                bloomKey > 0 &&
                SPARKLE_OFFSETS.map((offset, i) => (
                  <span
                    key={`sparkle-${bloomKey}-${i}`}
                    aria-hidden
                    className="bcc-rep-demo-vouch-sparkle"
                    style={
                      {
                        "--bcc-vouch-particle-x": `${offset.x}px`,
                        "--bcc-vouch-particle-y": `${offset.y}px`,
                        "--bcc-vouch-particle-rotate": `${offset.rotate}deg`,
                        color: "var(--verified)",
                      } as CSSProperties
                    }
                  >
                    <Sparkle size={12} fill="currentColor" strokeWidth={0} />
                  </span>
                ))}
            </span>
          </div>

          <span
            role="tooltip"
            className={
              "bcc-mono text-center text-[10px] tracking-[0.08em] text-[var(--bcc-text-secondary)] transition-all duration-500 " +
              (showTooltip ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-1 opacity-0")
            }
          >
            try it — see how it feels
          </span>
        </div>
      </div>
    </div>
  );
}
