/**
 * CardFrontFace — the front face of the §N2 trading card plus its
 * chrome sub-components (ChainBand, Portrait, Nameplate, StatsPanel,
 * TierStrip, WantedCornerStamp). Extracted from CardFactory.tsx
 * (Phase 3.3 god-component split); markup and behavior unchanged.
 * The flip/tilt wrapper (and the chainStyle derivation) stays in
 * CardFactory.tsx — this face is pure render over the §L5 view-model.
 */

import { ActionBar } from "@/components/cards/CardActionBar";
import { OnchainSignalsStrip } from "@/components/cards/CardOnchainSignals";
import { Crest } from "@/components/cards/Crest";
import type { Card, CardStat, CardTier } from "@/lib/api/types";

export function CardFrontFace({
  card,
  flipped,
  onPull,
  onReview,
  isPulled,
  hideOpenAction,
  canEditAvatar,
}: {
  card: Card;
  /** Drives the ↻ FLIP affordance visibility (hidden once flipped). */
  flipped: boolean;
  onPull?: ((card: Card) => void) | undefined;
  onReview?: ((card: Card) => void) | undefined;
  isPulled: boolean;
  hideOpenAction: boolean;
  canEditAvatar: boolean;
}) {
  return (
    <div className="bcc-card-face">
      <ChainBand card={card} />
      <Portrait card={card} canEditAvatar={canEditAvatar} />
      <Nameplate card={card} />
      {/* On-chain validator signals strip — surfaces what the operator
          actually does on-chain (uptime, commission, voting rank). Shown
          for every validator card that has resolvable signals, claimed
          or unclaimed, so the card communicates real-world data even
          before a human owns the page. Null for non-validator kinds. */}
      {card.onchain_signals != null && (
        <OnchainSignalsStrip signals={card.onchain_signals} />
      )}
      <StatsPanel stats={card.stats} />
      <ActionBar
        card={card}
        onPull={onPull}
        onReview={onReview}
        isPulled={isPulled}
        hideOpenAction={hideOpenAction}
      />

      {/* Tier strip — own row at the very bottom of the card. Earlier
          this was absolute-positioned over the action bar and would
          overlap the OPEN link. Now it's a flow element so the tier
          label sits cleanly under the actions, never overlapping. */}
      {card.card_tier !== null && card.tier_label !== null && (
        <TierStrip cardTier={card.card_tier} tierLabel={card.tier_label} />
      )}

      {/* WANTED corner stamp — surfaces on validator cards whose
          operator hasn't claimed the profile yet. Lightweight visual
          affordance only; the full claim CTA + Keplr flow lives on
          /v/[slug] via the existing ClaimCallout. */}
      {!card.is_claimed && card.claim_target !== null && (
        <WantedCornerStamp />
      )}

      {/* Card-flip affordance — without this micro-label viewers
          don't realize the card flips. Per the 2026-05-14 UX review:
          the back face carries bio + on-chain stats + social proof
          and it was previously undiscoverable. Always-visible mono
          label in the bottom-right corner; click anywhere on the
          card still flips (this label is decorative). */}
      {!flipped && (
        <span
          aria-hidden
          className="bcc-mono pointer-events-none absolute bottom-1 right-2 z-20 select-none text-ink-soft"
          style={{ fontSize: "9px", letterSpacing: "0.18em" }}
        >
          ↻ FLIP
        </span>
      )}

      {/* Foil shimmer — legendary only. Sits above face content,
          below the cards interactive layer (z-index 9). */}
      {card.card_tier === "legendary" && (
        <span aria-hidden className="bcc-foil-band pointer-events-none absolute inset-0 z-[9]" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Front-face sub-components — kept inline; they share enough
// type-context that splitting into separate files would just add
// import noise. Promote later if any one grows past ~80 lines.
// ─────────────────────────────────────────────────────────────────────

function ChainBand({ card }: { card: Card }) {
  // §2.9: only `chain`-kind crests yield a chain band label. `tier`
  // and `solid` fall back to the BCC mark — the entity's chain isn't
  // expressed by those crest types.
  const chainName =
    card.crest.background_kind === "chain" && card.crest.background_value !== ""
      ? card.crest.background_value.toUpperCase()
      : "BCC";

  return (
    <div
      className="bcc-stencil relative z-10 flex h-14 items-center justify-between border-b-[3px] border-ink px-4 text-white"
      style={{ background: "var(--bcc-chain-color, var(--chain-cosmos))" }}
    >
      <span className="text-2xl tracking-[0.06em]">{chainName}</span>
      <span className="bcc-mono border border-white/60 px-2 py-0.5 text-[9px] tracking-[0.2em]">
        {card.card_kind.toUpperCase()}
      </span>
    </div>
  );
}

function Portrait({
  card,
  canEditAvatar,
}: {
  card: Card;
  canEditAvatar: boolean;
}) {
  return (
    <div
      className="relative z-10 flex items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.15) 0%, transparent 60%), " +
          "linear-gradient(180deg, var(--bcc-chain-color, var(--chain-cosmos)) 0%, color-mix(in srgb, var(--bcc-chain-color, var(--chain-cosmos)) 60%, #000) 100%)",
      }}
    >
      <Crest card={card} canEditAvatar={canEditAvatar} />
      {/* Halftone overlay — purely decorative. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1.5px)",
          backgroundSize: "6px 6px",
          mixBlendMode: "overlay",
        }}
      />
      <span aria-hidden className="pointer-events-none absolute inset-3 border border-white/10" />
    </div>
  );
}

/**
 * WantedCornerStamp — small diagonal stamp anchored to the top-right
 * corner of the card face. Surfaces only when the operator hasn't
 * claimed the validator yet. The full claim CTA + Keplr ADR-036 flow
 * lives on /v/[slug] via the existing ClaimCallout; this stamp is
 * purely a directory-listing affordance pointing the viewer there.
 *
 * Decorative — non-interactive (the surrounding "Open" link handles
 * navigation). aria-hidden so screen readers don't read it as a CTA.
 */
function WantedCornerStamp() {
  return (
    <span
      aria-hidden
      className="bcc-mono pointer-events-none absolute left-1/2 top-1/2 z-20 select-none px-2 py-0.5 text-[9px] tracking-[0.2em] text-white"
      style={{
        background: "var(--safety, #ff6b35)",
        transform: "translate(-50%, -50%) rotate(6deg)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
      }}
    >
      WANTED
    </span>
  );
}

/**
 * TierStrip — colored tier label at the very bottom of the card face.
 *
 * Replaces an earlier absolute-positioned ribbon that floated over the
 * action bar's OPEN link. As a flow element it gets its own ~28px row
 * below the actions so the label is always readable and never overlaps
 * other content. The tier color drives both the text and a 3px
 * left-edge accent — same vocabulary as the §C1 tier palette.
 *
 * Skipped at the call site when `card_tier` is null (risky tier; §C1
 * hides those from the card UI entirely).
 */
function TierStrip({
  cardTier,
  tierLabel,
}: {
  cardTier: Exclude<CardTier, null>;
  tierLabel: string;
}) {
  return (
    <div
      className="relative z-10 flex items-center justify-center border-t border-cardstock-edge/40 px-3 py-2"
      style={{
        background: "rgba(15,13,9,0.05)",
        borderLeft: `4px solid var(--tier-${cardTier})`,
      }}
    >
      <span
        className="bcc-mono text-[10px] tracking-[0.24em]"
        style={{ color: `var(--tier-${cardTier})` }}
      >
        {tierLabel.toUpperCase()}
      </span>
    </div>
  );
}

/**
 * Nameplate — front-face name + handle strip.
 *
 * Sits between the portrait and the stats panel. Without this, the
 * front of a card showed the hex monogram + chain only — you had to
 * flip the card to see whose card it was. The strip uses the same
 * cardstock-deep wash as the stats panel below it, which visually
 * reads them as one info module.
 *
 * Truncation: long display_name values (e.g. "Blue Collar Crypto
 * test 2222") wrap to 2 lines max, then ellipsize. Handle stays a
 * single line.
 */
function Nameplate({ card }: { card: Card }) {
  // §3.1 + /members convention — handles that contain `@` are
  // PeepSo-default email-shaped (operator hasn't claimed a real
  // handle yet). Rendering "@user@domain.com" reads as broken UI;
  // we suppress the kicker entirely until they pick a handle.
  const showHandleKicker = !card.handle.includes("@");
  return (
    <div className="relative z-10 flex flex-col items-center border-t border-cardstock-edge/40 bg-cardstock-deep/30 px-3 py-2.5 text-center">
      <h3
        className="bcc-stencil text-base leading-[1.1] text-ink"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {card.name}
      </h3>
      {showHandleKicker && (
        <p className="bcc-mono mt-1 text-[10px] text-ink-soft">
          @{card.handle}
        </p>
      )}
    </div>
  );
}

function StatsPanel({ stats }: { stats: CardStat[] }) {
  // Front-face stats panel shows up to three rows. The full list is
  // on the back face. The server may return more than three; we slice
  // for layout, never re-derive the values.
  const visible = stats.slice(0, 3);
  return (
    <div className="relative z-10 grid grid-cols-3 gap-2 border-t border-cardstock-edge/40 bg-cardstock-deep/30 px-4 py-3">
      {visible.map((stat) => (
        <div key={stat.key} className="flex flex-col items-center text-center">
          <span className="bcc-mono text-[10px] text-ink-soft">{stat.label}</span>
          <span className="bcc-stencil mt-1 text-2xl text-ink">{stat.value}</span>
        </div>
      ))}
    </div>
  );
}
