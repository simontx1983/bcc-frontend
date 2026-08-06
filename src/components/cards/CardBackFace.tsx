/**
 * CardBackFace — the back of the trading card.
 *
 * Was an undesigned column (an h3, a handle, an italic quoted bio, an
 * <hr> and a <dl>). It now runs the same chassis as the front:
 *
 *   top rule + header   ← identical to the front, so the flip reads as
 *                         ONE OBJECT rather than two unrelated panels
 *   identity header     ← 36px avatar + name + @handle
 *   bio                 ← serif, 3-line clamp
 *   [dossier / stats]   ← per-kind body
 *   <spacer flex: 1>
 *   standing strip + flip chip
 *
 * The flex:1 spacer is what stops a short back face leaving the strip
 * stranded mid-card: short backs push it to the floor, tall ones don't
 * move it.
 */

import { OnchainStatsList } from "@/components/cards/CardOnchainSignals";
import { CardStandingStrip } from "@/components/cards/CardStandingStrip";
import { CommunityDossierBack } from "@/components/cards/CommunityDossier";
import { MemberDossierBack } from "@/components/cards/MemberDossier";
import type { Card } from "@/lib/api/types";

export function CardBackFace({
  card,
  kindColor,
  flipped,
  onFlip,
}: {
  card: Card;
  kindColor: string;
  flipped: boolean;
  onFlip: () => void;
}) {
  const showHandle = !card.handle.includes("@");

  return (
    <div className="bcc-card-face bcc-card-back">
      {/* Header row — mirrors the front's geometry exactly (46px, kind
          word left) so the two faces read as one object turning over. */}
      <div className="relative z-[1] flex h-[46px] shrink-0 items-center px-4">
        <span
          className="bcc-stencil"
          style={{
            fontSize: 20,
            lineHeight: 1,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: kindColor,
          }}
        >
          {card.card_kind}
        </span>
      </div>

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col px-5 pb-1">
        {/* Identity header — small avatar so the viewer keeps their place
            after the flip, without repeating the front's 108px portrait. */}
        <div className="flex shrink-0 items-center gap-2.5">
          <BackAvatar card={card} />
          <span className="flex min-w-0 flex-col">
            <span
              className="bcc-stencil truncate"
              style={{ fontSize: 14, lineHeight: 1.15, color: "var(--bcc-text)" }}
            >
              {card.name}
            </span>
            {showHandle && (
              <span
                className="bcc-mono truncate"
                style={{ fontSize: 9, color: "var(--bcc-text-muted)" }}
              >
                @{card.handle}
              </span>
            )}
          </span>
        </div>

        {card.bio !== "" && (
          <p
            className="font-serif"
            style={{
              fontSize: 12,
              lineHeight: 1.5,
              marginTop: 10,
              color: "var(--bcc-text-secondary)",
              display: "-webkit-box",
              WebkitLineClamp: 3,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {card.bio}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-hidden">
          {/* Member cards render the trust dossier (VERIFIED / ON THE
              FLOOR, typed-role pills, primary-hall chip, cold-start
              fallback). The front's stats panel already carries
              trust/reviews, so the generic <dl> is skipped for members
              and communities to avoid a duplicate number wall. */}
          {card.card_kind === "member" && card.member_dossier != null ? (
            <MemberDossierBack dossier={card.member_dossier} />
          ) : card.card_kind === "community" && card.community_dossier != null ? (
            <CommunityDossierBack dossier={card.community_dossier} />
          ) : (
            <>
              {/* Stake vocabulary is fixed and not up for debate:
                  Total Stake · Self Delegation · Delegators ·
                  Commission · Voting Rank. */}
              {card.onchain_signals != null && (
                <OnchainStatsList signals={card.onchain_signals} />
              )}

              {card.social_proof?.headline != null && (
                <p
                  className="bcc-mono mt-3"
                  style={{ fontSize: 9.5, letterSpacing: "0.14em", color: "var(--bcc-text-muted)" }}
                >
                  {card.social_proof.headline}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <CardStandingStrip
        card={card}
        kindColor={kindColor}
        flipped={flipped}
        onFlip={onFlip}
      />
    </div>
  );
}

/**
 * 36px identity avatar. Deliberately plain — the accent ring belongs to
 * the front's portrait, and repeating it here would make the back face
 * compete with the front rather than continue it.
 */
function BackAvatar({ card }: { card: Card }) {
  const { image_url: imageUrl, initials } = card.crest;
  const hasImage = imageUrl !== null && imageUrl !== "";

  return (
    <span
      className="relative flex items-center justify-center overflow-hidden rounded-full"
      style={{
        width: 36,
        height: 36,
        flex: "none",
        background: "var(--bcc-surface-hover)",
        border: "1px solid var(--bcc-glass-border)",
      }}
    >
      {hasImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- a plain img at 36px: page art can be NFT/IPFS (outside the next/image allowlist, see lib/media.ts), and the front face already paid for the optimized fetch of this same URL
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="bcc-stencil"
          style={{ fontSize: 14, lineHeight: 1, color: "var(--bcc-text)" }}
        >
          {initials}
        </span>
      )}
    </span>
  );
}
