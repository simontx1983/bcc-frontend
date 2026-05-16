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

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useUploadAvatar } from "@/hooks/useUpdateProfile";
import type { Card, CardKind, CardStat, CardTier, OnchainSignals } from "@/lib/api/types";
import { FOLLOW_COPY } from "@/lib/copy";
import { isAllowed, unlockHint } from "@/lib/permissions";

/**
 * Per-kind card chrome color. Drives the `--bcc-chain-color` CSS var
 * on the card root, which the ChainBand + Portrait gradient both
 * consume. So every validator card reads as the same hue regardless
 * of tier; every project as another; every creator as a third. Tier
 * info still surfaces on the bottom TierStrip — kind is the headline,
 * tier is the secondary qualifier.
 *
 * Member cards intentionally inherit the original crest-driven color
 * — a "member" card represents a person, not a category, so a single
 * member-wide color would erase the per-person identity the crest
 * carries today.
 *
 * Values are CSS variables defined in globals.css so the palette can
 * be tweaked centrally without touching this file. The choice:
 *   - validator → blueprint (deep navy — verified blockchain operator)
 *   - project   → safety    (orange — building / action)
 *   - creator   → kujira    (red — creative output / drop energy)
 */
const KIND_TO_COLOR_VAR: Partial<Record<CardKind, string>> = {
  validator: "var(--blueprint)",
  project:   "var(--safety)",
  creator:   "var(--chain-kujira)",
};

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
   * already in the viewer's watchlist OR (during onboarding) selected for
   * batch-add on completion. The action is still clickable; clicking
   * again should call `onPull` to toggle back to idle. Server
   * permissions are still respected.
   */
  isPulled?: boolean | undefined;
  /**
   * When true, the "View profile" link in the action bar is hidden.
   * Used on the profile page itself — the link would just route to the
   * same URL, so it's dead clickbait. Other surfaces (feed cards, etc.)
   * leave it visible. */
  hideOpenAction?: boolean | undefined;
  /**
   * When true, the avatar inside the crest renders with an upload
   * overlay (hover hint "UPDATE AVATAR" + click opens file picker).
   * Only the profile owner should pass true. Default off so feed
   * cards, directory cards, etc. don't accidentally surface the
   * upload affordance. */
  canEditAvatar?: boolean | undefined;
}

export function CardFactory({
  card,
  onPull,
  onReview,
  onCardClick,
  isPulled = false,
  hideOpenAction = false,
  canEditAvatar = false,
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

  // Per-kind card chrome color. Drives `--bcc-chain-color` which the
  // ChainBand + Portrait gradient both consume, so every validator
  // reads as the same color regardless of tier; tier information
  // surfaces on the TierStrip at the bottom of the card. Falls back
  // to the §2.9 crest background when the kind isn't in the map.
  //
  // Member cards inherit the original crest-driven color because
  // they don't have a single per-kind identity in the same way
  // (a "member" card is the person, not a category).
  const chainStyle = useMemo<CSSProperties>(() => {
    const kindColor = KIND_TO_COLOR_VAR[card.card_kind];
    if (kindColor !== undefined) {
      return { ["--bcc-chain-color" as string]: kindColor };
    }

    // Fallback: §2.9 crest background — chain | tier | solid.
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
  }, [card.card_kind, card.crest.background_kind, card.crest.background_value]);

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

            {/* On-chain stats — surfaces under the BCC reputation stats so
                the back-face reads top-down: who they are (bio), what BCC
                knows (trust/followers/etc.), then what the chain itself
                says (commission, self stake, rank, delegators). Only
                renders for validator cards with resolvable signals. */}
            {card.onchain_signals != null && (
              <OnchainStatsList signals={card.onchain_signals} />
            )}

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
      <Crest
        initials={card.crest.initials}
        monogramColor={card.crest.monogram_color}
        imageUrl={card.crest.image_url}
        canEditAvatar={canEditAvatar}
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
  canEditAvatar,
}: {
  initials: string;
  monogramColor: string;
  imageUrl: string | null;
  canEditAvatar: boolean;
}) {
  const hexClip = "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

  // Owner-only upload affordance: hover shows an "UPDATE AVATAR" hint,
  // click opens a file picker, selection fires the PeepSo avatar
  // upload mutation. `stopPropagation` prevents the card's
  // click-to-flip handler from triggering when the user clicks the
  // avatar. Cache invalidation (`user-by-handle`) refreshes the
  // crest's image_url after upload; router.refresh() rehydrates the
  // server-rendered profile so adjacent surfaces (site header avatar,
  // composer chip) reflect the change without a hard reload.
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const uploadAvatar = useUploadAvatar({
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user-by-handle"] });
      router.refresh();
    },
  });

  const handleOpenPicker = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file === undefined) {
      return;
    }
    uploadAvatar.mutate(file);
    // Reset so picking the same file twice re-triggers onChange.
    event.target.value = "";
  };

  const hasImage = imageUrl !== null && imageUrl !== "";

  return (
    <div className="bcc-hex h-[160px] w-[140px] drop-shadow-[0_6px_8px_rgba(0,0,0,0.5)]">
      <span aria-hidden className="bcc-hex-outer" />
      <span aria-hidden className="bcc-hex-mid" />
      <span aria-hidden className="bcc-hex-inner" />

      {hasImage ? (
        <>
          {/* Avatar wrapper — Tailwind's preflight sets
              `img { max-width: 100%; height: auto }` which overrides
              CSS's absolute-position sizing for replaced elements
              (image rendered at 140×140 instead of 112×132 from a
              500×500 source). Putting the `<img>` inside an absolutely-
              positioned div lets the div take the inset-derived size
              and the img fill it via `w-full h-full`. */}
          <div
            className="absolute"
            style={{
              top: "14px",
              right: "14px",
              bottom: "14px",
              left: "14px",
              clipPath: hexClip,
              zIndex: 2,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt=""
              className="h-full w-full object-cover"
              style={{
                filter: "saturate(0.92) contrast(1.02)",
              }}
            />
          </div>
          {/* Chain-color multiply overlay — subtle brand tie-in only.
              Matches the avatar's hex shape so the tint stays inside
              the photo and doesn't bleed onto the chain ring. */}
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={{
              top: "14px",
              right: "14px",
              bottom: "14px",
              left: "14px",
              clipPath: hexClip,
              background: "var(--bcc-chain-color, var(--chain-cosmos))",
              mixBlendMode: "multiply",
              opacity: 0.08,
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

      {/* Owner upload affordance — sits in the same hex-clipped region
          as the avatar. Default state is invisible (pointer events
          enabled so the click target is still active); hover/focus
          reveals an ink-deep scrim + UPDATE AVATAR label. The hidden
          file input is anchored next to the button so the picker
          opens from inside the card without a separate modal. */}
      {canEditAvatar && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
            aria-label="Upload new avatar"
          />
          <button
            type="button"
            onClick={handleOpenPicker}
            aria-label="Update avatar"
            disabled={uploadAvatar.isPending}
            className="group absolute z-[4] cursor-pointer border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-safety disabled:cursor-wait"
            style={{
              top: "14px",
              right: "14px",
              bottom: "14px",
              left: "14px",
              clipPath: hexClip,
            }}
          >
            {/* Hover/focus label — solid grey strip pinned to the
                BOTTOM of the hex region so the text always reads
                cleanly regardless of what the avatar photo looks like.
                Default state is invisible; pointer-events on the
                button stay active so the click target is the whole
                hex, not just the strip. */}
            <span
              aria-hidden
              className="absolute inset-x-0 flex items-center justify-center bg-cardstock-edge text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 group-disabled:opacity-100"
              style={{
                bottom: "16px",
                paddingTop: "6px",
                paddingBottom: "6px",
                fontFamily: "var(--font-mono), ui-monospace, monospace",
                fontSize: "10px",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              {uploadAvatar.isPending ? "UPLOADING…" : "UPDATE AVATAR"}
            </span>
          </button>
        </>
      )}

      {/* Inline error surface — sits below the hex when the upload
          mutation fails. Quiet mono, doesn't break the card layout. */}
      {canEditAvatar && uploadAvatar.isError && (
        <span
          role="alert"
          className="bcc-mono absolute left-1/2 z-[5] -translate-x-1/2 whitespace-nowrap text-safety"
          style={{
            bottom: "-18px",
            fontSize: "10px",
            letterSpacing: "0.18em",
          }}
        >
          UPLOAD FAILED
        </span>
      )}
    </div>
  );
}

/**
 * OnchainSignalsStrip — front-face status indicator for a validator
 * card. Surfaces only the two signals a viewer needs to size up the
 * operator at a glance: chain status (active / jailed / inactive)
 * and 30-day uptime.
 *
 * The richer data (self stake, commission, voting rank, delegators,
 * total stake, jailed events) lives on the BACK face of the card —
 * a flip surfaces it inline, and the full breakdown also renders on
 * /v/[slug] in EntityProfile. This strip is the "should I keep
 * reading?" prompt; the back is the "ok, tell me more."
 *
 * Hides itself entirely when both status and uptime are missing
 * (transient indexer state). Renders status alone when uptime is
 * still null — partial data is still useful.
 */
function OnchainSignalsStrip({ signals }: { signals: OnchainSignals }) {
  const segments: string[] = [];

  const statusLabel =
    signals.status === "active"
      ? "ACTIVE"
      : signals.status === "inactive"
      ? "INACTIVE"
      : signals.status === "jailed"
      ? "JAILED"
      : null;
  if (statusLabel !== null) {
    segments.push(statusLabel);
  }

  if (signals.uptime_30d !== null) {
    segments.push(`${(signals.uptime_30d * 100).toFixed(1)}% UPTIME`);
  }

  if (segments.length === 0) {
    return null;
  }

  return (
    <div
      className="relative z-10 flex items-center gap-2 overflow-hidden border-t border-cardstock-edge/40 px-3 py-1.5"
      style={{ background: "rgba(15,13,9,0.03)" }}
    >
      <span
        aria-hidden
        className="bcc-rail-dot"
        style={
          signals.status === "jailed"
            ? { background: "var(--safety, #ff6b35)" }
            : undefined
        }
      />
      <span className="bcc-mono whitespace-nowrap overflow-hidden text-ellipsis text-[9px] tracking-[0.18em] text-ink-soft">
        {segments.join(" · ")}
      </span>
    </div>
  );
}

/**
 * OnchainStatsList — back-face list of the validator's deeper on-chain
 * data, formatted in the same dl-pair vocabulary as the BCC reputation
 * stats above it. Renders only the fields the indexer has populated so
 * a partially-enriched validator doesn't show "—%" placeholders.
 *
 * Sits beneath card.stats on the back face. The front-face strip
 * carries status + uptime; this list carries commission, self stake,
 * voting rank, total stake, delegators, and jailed-events count.
 */
function OnchainStatsList({ signals }: { signals: OnchainSignals }) {
  const rows: Array<{ key: string; label: string; value: string }> = [];

  if (signals.commission_rate !== null) {
    rows.push({
      key: "commission",
      label: "Commission",
      value: `${(signals.commission_rate * 100).toFixed(2)}%`,
    });
  }
  if (signals.self_stake !== null) {
    rows.push({
      key: "self_stake",
      label: "Self Delegation",
      value: formatStakeCompact(signals.self_stake),
    });
  }
  if (signals.voting_power_rank !== null) {
    rows.push({
      key: "rank",
      label: "Voting Rank",
      value: `#${signals.voting_power_rank}`,
    });
  }
  if (signals.total_stake !== null) {
    rows.push({
      key: "total_stake",
      label: "Total Stake",
      value: formatStakeCompact(signals.total_stake),
    });
  }
  if (signals.delegator_count !== null) {
    rows.push({
      key: "delegators",
      label: "Delegators",
      value: signals.delegator_count.toLocaleString(),
    });
  }
  if (signals.jailed_count !== null && signals.jailed_count > 0) {
    rows.push({
      key: "jailed",
      label: "Jailed Events",
      value: signals.jailed_count.toLocaleString(),
    });
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bcc-mono mt-4 flex items-center gap-2 text-[9px] tracking-[0.24em] text-ink-soft">
        <span className="inline-block h-px w-6 bg-cardstock-edge/50" />
        <span>ON-CHAIN</span>
        <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
      </div>
      <dl className="mt-2 space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between gap-4">
            <dt className="bcc-mono text-ink-soft">{row.label}</dt>
            <dd className="font-serif text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

// Compact stake formatter for back-face dl pairs — same vocabulary as
// EntityProfile's formatStake (K / M suffix) but with no decimal places
// on the K branch so the column reads cleanly. Falls back to the raw
// string when the value can't be parsed (preserves Cosmos precision).
function formatStakeCompact(raw: string): string {
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return raw;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}M`;
  }
  if (num >= 1_000) {
    return `${Math.round(num / 1_000).toLocaleString()}K`;
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
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

function ActionBar({
  card,
  onPull,
  onReview,
  isPulled,
  hideOpenAction,
}: {
  card: Card;
  onPull?: ((card: Card) => void) | undefined;
  onReview?: ((card: Card) => void) | undefined;
  isPulled: boolean;
  /** When true, the "View profile" cell is dropped from the action bar.
   *  Used on the profile page itself — the link would loop back to the
   *  same URL. Grid switches to 2-col when this is true. */
  hideOpenAction?: boolean;
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

  // Default Review navigation — server-supplied `card.links.review`
  // (`{entity-profile}?compose=review`) when present, otherwise the
  // card's profile URL. Used when no `onReview` override is wired
  // (most CardFactory call sites). The entity profile's
  // ReviewCallout reads the query param on mount and auto-opens
  // the composer. Without this fallback the Review button was a
  // no-op on every surface except DirectoryGrid.
  const router = useRouter();
  const handleReviewClick = () => {
    if (onReview !== undefined) {
      onReview(card);
      return;
    }
    const href = (card.links.review ?? card.links.self) as Route;
    router.push(href);
  };

  const cols = hideOpenAction === true ? "sm:grid-cols-2" : "sm:grid-cols-3";

  return (
    <div className={`relative z-10 grid grid-cols-1 border-t border-cardstock-edge/40 bg-cardstock ${cols}`}>
      <button
        type="button"
        disabled={!isAllowed(card.permissions, "can_pull")}
        title={
          isAllowed(card.permissions, "can_pull")
            ? isPulled
              ? FOLLOW_COPY.tooltipActive
              : FOLLOW_COPY.tooltipIdle
            : unlockHint(card.permissions, "can_pull") ??
              "Keep Tabs is unavailable for this card."
        }
        onClick={(e) => {
          stop(e);
          if (onPull !== undefined) onPull(card);
        }}
        className="bcc-stencil flex h-11 items-center justify-center bg-ink text-cardstock transition-colors disabled:cursor-not-allowed"
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
        disabled={!isAllowed(card.permissions, "can_review")}
        title={
          isAllowed(card.permissions, "can_review")
            ? "Write a review"
            : unlockHint(card.permissions, "can_review") ??
              "Reviews unlock at neutral reputation."
        }
        onClick={(e) => {
          stop(e);
          handleReviewClick();
        }}
        className="bcc-stencil flex h-11 items-center justify-center border-l border-cardstock-edge/40 bg-cardstock text-ink transition-colors hover:bg-ink hover:text-cardstock disabled:opacity-40"
      >
        Review
      </button>

      {/* The primary navigation affordance on the card — promoted to
          safety-orange so it reads as the "do this next" action rather
          than just one of three same-weight buttons. Hidden on the
          profile page itself (hideOpenAction=true) since the link
          would loop back to the same URL. */}
      {hideOpenAction !== true && (
        <Link
          href={openHref}
          onClick={stop}
          title="View this profile"
          aria-label={`View ${card.name}'s profile`}
          className="bcc-stencil flex h-11 items-center justify-center border-l border-cardstock-edge/40 bg-safety text-center text-cardstock transition hover:bg-ink"
        >
          View profile
        </Link>
      )}
    </div>
  );
}

