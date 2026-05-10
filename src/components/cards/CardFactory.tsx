"use client";

/**
 * CardFactory — polymorphic trading-card component (§N2).
 *
 * Renders any §L5 Card view-model regardless of `card_kind`. The
 * server returns presentation-ready fields (`card_tier`,
 * `tier_label`, `crest`, `stats`, `permissions`, `social_proof`);
 * this component does ZERO derivation.
 *
 * Architectural rule (§A2): if a layout decision feels like it
 * needs to look at `trust_score` or `reputation_tier` directly,
 * it doesn't — read `card_tier` (the server already mapped it)
 * or `stats[]` (already formatted strings).
 *
 * What this component owns (presentation only):
 *   - 3D flip on click (front ↔ back face)
 *   - Hover-driven tilt, gated on prefers-reduced-motion
 *   - Foil shimmer overlay for `card_tier === 'legendary'` (§C1)
 *   - Disabled action states with title-tooltip when `permissions.can_X`
 *     is false (§N7 visible-but-dimmed)
 *   - Click-to-flip vs. click-on-action delegation (event.stopPropagation
 *     on action buttons so they don't flip the card)
 *
 * What it doesn't:
 *   - Mutations (Pull / Review / Dispute) — parent passes callbacks
 *     (typed below). Component is testable as pure render.
 *
 * @see validator-card-prototype.html for the source visual language.
 */

import type { Route } from "next";
import Link from "next/link";
import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  useMemo,
  useRef,
  useState,
} from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { Card, CardStat, CardTier } from "@/lib/api/types";
import { FOLLOW_COPY } from "@/lib/copy";

export interface CardFactoryProps {
  card: Card;
  /**
   * Toggle "Keep Tabs" on the card. Disabled when
   * permissions.can_pull.allowed is false. The `can_pull` /
   * `onPull` field names are part of the §9 API contract — the user-
   * facing label is centralized in lib/copy.ts (FOLLOW_COPY).
   */
  onPull?: ((card: Card) => void) | undefined;
  /** Open the review composer. Disabled when permissions.can_review.allowed is false. */
  onReview?: ((card: Card) => void) | undefined;
  /** Override the default click-to-flip behavior on the card body. */
  onCardClick?: ((card: Card) => void) | undefined;
  /**
   * When true, the CTA renders in muted state — indicates the card is
   * already in the viewer's binder OR (during onboarding) selected for
   * batch-add on completion. The action is still clickable; clicking
   * again should call `onPull` to toggle back to idle. Server
   * permissions are still respected.
   */
  isPulled?: boolean | undefined;
}

export function CardFactory({
  card,
  onPull,
  onReview,
  onCardClick,
  isPulled = false,
}: CardFactoryProps) {
  const [flipped, setFlipped] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // Hover tilt — mouse-driven 3D rotation written to CSS custom
  // properties. Disabled under prefers-reduced-motion. The CSS uses
  // `transform: rotateX(var(--bcc-rx)) rotateY(var(--bcc-ry))`.
  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (reducedMotion || cardRef.current === null) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;  // 0 → 1
    const y = (event.clientY - rect.top) / rect.height;  // 0 → 1
    const ry = (x - 0.5) * 16; // ±8°
    const rx = (0.5 - y) * 14; // ±7°
    cardRef.current.style.setProperty("--bcc-rx", `${rx}deg`);
    cardRef.current.style.setProperty("--bcc-ry", `${ry}deg`);
  };

  const handleMouseLeave = () => {
    if (cardRef.current === null) return;
    cardRef.current.style.setProperty("--bcc-rx", "0deg");
    cardRef.current.style.setProperty("--bcc-ry", "0deg");
  };

  const handleCardClick = () => {
    if (onCardClick !== undefined) {
      onCardClick(card);
      return;
    }
    setFlipped((prev) => !prev);
  };

  const handleCardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleCardClick();
    }
  };

  // Map the §2.9 crest background to the matching CSS variable.
  //   chain → --bcc-chain-color: var(--chain-<slug>)
  //   tier  → --bcc-chain-color: var(--tier-<slug>)
  //   solid → --bcc-chain-color: <hex>
  // Unknown values fall back via the var()'s default in globals.css.
  const chainStyle = useMemo<CSSProperties>(() => {
    const { background_kind, background_value } = card.crest;
    if (background_value === "") return {};
    if (background_kind === "chain") {
      return { ["--bcc-chain-color" as string]: `var(--chain-${background_value})` };
    }
    if (background_kind === "tier") {
      return { ["--bcc-chain-color" as string]: `var(--tier-${background_value})` };
    }
    if (background_kind === "solid") {
      return { ["--bcc-chain-color" as string]: background_value };
    }
    return {};
  }, [card.crest.background_kind, card.crest.background_value]);

  return (
    <div className="bcc-card-stage">
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        aria-label={`${card.name} ${card.card_kind} card`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleCardClick}
        onKeyDown={handleCardKeyDown}
        className={`bcc-card ${flipped ? "is-flipped" : ""}`}
        style={chainStyle}
      >
        {/* ─── FRONT FACE ──────────────────────────────────────────── */}
        <div className="bcc-card-face">
          <ChainBand card={card} />
          <Portrait card={card} />
          <Nameplate card={card} />
          <StatsPanel stats={card.stats} />
          <ActionBar
            card={card}
            onPull={onPull}
            onReview={onReview}
            isPulled={isPulled}
          />

          {/* Tier strip — own row at the very bottom of the card. Earlier
              this was absolute-positioned over the action bar and would
              overlap the OPEN link. Now it's a flow element so the tier
              label sits cleanly under the actions, never overlapping. */}
          {card.card_tier !== null && card.tier_label !== null && (
            <TierStrip cardTier={card.card_tier} tierLabel={card.tier_label} />
          )}

          {/* Foil shimmer — legendary only. Sits above face content,
              below the cards interactive layer (z-index 9). */}
          {card.card_tier === "legendary" && (
            <span aria-hidden className="bcc-foil-band pointer-events-none absolute inset-0 z-[9]" />
          )}
        </div>

        {/* ─── BACK FACE ────────────────────────────────────────────
            Identity → bio → stats → social proof. The bio sits between
            the handle and the divider so a viewer reading top-down
            gets context (who) before data (numbers). Skipped when the
            entity hasn't set a bio. */}
        <div className="bcc-card-face bcc-card-back">
          <div className="relative z-10 flex h-full flex-col p-6">
            <h3 className="bcc-stencil text-2xl">{card.name}</h3>
            <p className="bcc-mono mt-1 text-ink-soft">@{card.handle}</p>

            {card.bio !== "" && (
              <p
                className="font-serif italic text-ink-soft"
                style={{
                  fontSize: "13px",
                  lineHeight: 1.5,
                  marginTop: "12px",
                  display: "-webkit-box",
                  WebkitLineClamp: 4,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                &ldquo;{card.bio}&rdquo;
              </p>
            )}

            <hr className="my-4 border-cardstock-edge/50" />

            <dl className="space-y-2 text-sm">
              {card.stats.map((stat) => (
                <div key={stat.key} className="flex justify-between gap-4">
                  <dt className="bcc-mono text-ink-soft">{stat.label}</dt>
                  <dd className="font-serif text-ink">{stat.value}</dd>
                </div>
              ))}
            </dl>

            {card.social_proof?.headline != null && (
              <p className="bcc-mono mt-auto text-ink-soft">
                {card.social_proof.headline}
              </p>
            )}
          </div>
        </div>
      </div>
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

function Portrait({ card }: { card: Card }) {
  return (
    <div
      className="relative z-10 flex items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.15) 0%, transparent 60%), " +
          "linear-gradient(180deg, var(--bcc-chain-color, var(--chain-cosmos)) 0%, color-mix(in srgb, var(--bcc-chain-color, var(--chain-cosmos)) 60%, #000) 100%)",
      }}
    >
      <Crest
        initials={card.crest.initials}
        monogramColor={card.crest.monogram_color}
        imageUrl={card.crest.image_url}
      />
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
 * Crest — three concentric hex layers (outer cardstock ring, mid
 * chain-color stroke, inner cardstock-deep fill) with either a
 * stencil monogram or the operator's avatar at the center.
 *
 * Avatar treatment: the photo is hex-clipped and inset slightly
 * inside the inner ring so the cardstock-deep layer stays visible as
 * a frame. A subtle saturation drop + chain-color multiply overlay
 * gives portraits a "factory ID" feel rather than an Instagram crop,
 * keeping photos cohesive with the warehouse-stencil aesthetic.
 *
 * Fallback: stencil initials in the monogram color when image_url is
 * null (server returns null for pages with no PeepSo photo and members
 * without a Gravatar / WP avatar).
 */
function Crest({
  initials,
  monogramColor,
  imageUrl,
}: {
  initials: string;
  monogramColor: string;
  imageUrl: string | null;
}) {
  const hexClip = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

  return (
    <div className="bcc-hex h-[160px] w-[140px] drop-shadow-[0_6px_8px_rgba(0,0,0,0.5)]">
      <span aria-hidden className="bcc-hex-outer" />
      <span aria-hidden className="bcc-hex-mid" />
      <span aria-hidden className="bcc-hex-inner" />

      {imageUrl !== null && imageUrl !== "" ? (
        <>
          {/* Avatar — hex-clipped, slightly inset from the inner ring. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt=""
            className="absolute object-cover"
            style={{
              inset: "18px",
              clipPath: hexClip,
              filter: "saturate(0.75) contrast(1.05)",
              zIndex: 2,
            }}
          />
          {/* Chain-color multiply overlay — ties the portrait to the
              card's brand hue without drowning the face. */}
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              inset: "18px",
              clipPath: hexClip,
              background: "var(--bcc-chain-color, var(--chain-cosmos))",
              mixBlendMode: "multiply",
              opacity: 0.18,
              zIndex: 3,
            }}
          />
        </>
      ) : (
        <span
          className="bcc-stencil relative z-[2] text-5xl"
          style={{ color: monogramColor }}
        >
          {initials}
        </span>
      )}
    </div>
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
      <p className="bcc-mono mt-1 text-[10px] text-ink-soft">
        @{card.handle}
      </p>
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

function ActionBar({
  card,
  onPull,
  onReview,
  isPulled,
}: {
  card: Card;
  onPull?: ((card: Card) => void) | undefined;
  onReview?: ((card: Card) => void) | undefined;
  isPulled: boolean;
}) {
  // Action buttons sit on a thin band along the bottom of the front
  // face. Per §N7 every gated action is ALWAYS visible — disabled
  // (with a tooltip) when permissions deny. Hidden actions teach the
  // user nothing.
  const stop = (event: MouseEvent) => event.stopPropagation();

  // The Open destination is a server-supplied path. With typedRoutes
  // enabled we can't statically prove it's a valid app route, so we
  // cast through `Route` — the WP backend is the authority on these
  // URLs (per §A4).
  const openHref = card.links.self as Route;

  return (
    <div className="relative z-10 grid grid-cols-1 border-t border-cardstock-edge/40 bg-cardstock sm:grid-cols-3">
      <button
        type="button"
        disabled={!card.permissions.can_pull.allowed}
        title={
          card.permissions.can_pull.allowed
            ? isPulled
              ? FOLLOW_COPY.tooltipActive
              : FOLLOW_COPY.tooltipIdle
            : card.permissions.can_pull.unlock_hint ??
              "Keep Tabs is unavailable for this card."
        }
        onClick={(e) => {
          stop(e);
          if (onPull !== undefined) onPull(card);
        }}
        className={
          isPulled
            ? "bcc-stencil flex h-11 items-center justify-center border border-ink/30 bg-cardstock-deep text-ink transition disabled:opacity-40"
            : "bcc-stencil flex h-11 items-center justify-center bg-ink text-cardstock transition disabled:opacity-40"
        }
      >
        {isPulled ? (
          <>
            {/* Active state — desktop variant; "Keeping Tabs ✓" overflows the
                grid-cols-3 cell on <375px viewports, so we swap to the state
                word "Watching ✓" below sm (matches the previous button width). */}
            <span className="hidden sm:inline">{FOLLOW_COPY.ctaActiveDesktop}</span>
            <span className="sm:hidden">{FOLLOW_COPY.ctaActiveMobile}</span>
          </>
        ) : (
          FOLLOW_COPY.cta
        )}
      </button>

      <button
        type="button"
        disabled={!card.permissions.can_review.allowed}
        title={
          card.permissions.can_review.allowed
            ? "Write a review"
            : card.permissions.can_review.unlock_hint ??
              "Reviews unlock at neutral reputation."
        }
        onClick={(e) => {
          stop(e);
          if (onReview !== undefined) onReview(card);
        }}
        className="bcc-stencil flex h-11 items-center justify-center border-l border-cardstock-edge/40 bg-cardstock text-ink transition disabled:opacity-40"
      >
        Review
      </button>

      <Link
        href={openHref}
        onClick={stop}
        className="bcc-stencil flex h-11 items-center justify-center border-l border-cardstock-edge/40 bg-cardstock text-ink"
      >
        Open
      </Link>
    </div>
  );
}

