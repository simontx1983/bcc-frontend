"use client";

/**
 * FlippableMemberCard — flippable directory card per §4.4.
 *
 * Front face: cover photo (or tier-tinted gradient fallback) + cream
 * info panel. Avatar floats centered at the seam between the two
 * panels (magazine-cover treatment); cardstock-colored shadow lifts it
 * off both backgrounds without a competing border.
 *
 * Back face: trust dossier — VERIFIED row (X / GitHub / wallets) +
 * ON THE FLOOR row (endorsements / solids / reviews / disputes) +
 * any non-zero typed-role badges + primary-Local pill, plus an
 * explicit "OPEN PROFILE →" link at the bottom (visual parity with
 * the community card's "OPEN COMMUNITY →"). The link calls
 * `e.stopPropagation()` so navigation runs instead of toggling the
 * flip back.
 *
 * Cold-start: when every back-of-card signal is empty (no
 * verifications, no engagement, no roles, no primary local), the back
 * shows "Nothing on file yet — fresh account" instead of a wall of
 * zeros.
 *
 * Visual parity with `FlippableNftCard`: both consume the shared
 * `<FlipCard>` primitive; both use the cover-on-top + cream-on-bottom
 * layout; both pin a navigation link to the bottom of the back face.
 */

import Link from "next/link";

import { Avatar } from "@/components/identity/Avatar";
import { FlipCard } from "@/components/ui/FlipCard";
import { RankChip } from "@/components/profile/RankChip";
import { formatJoinedAge } from "@/lib/format";
import type { CardTier, MemberSummary } from "@/lib/api/types";

interface FlippableMemberCardProps {
  member: MemberSummary;
}

export function FlippableMemberCard({ member }: FlippableMemberCardProps) {
  return (
    <FlipCard
      ariaLabelFront={`${member.display_name}. Click to see trust dossier.`}
      ariaLabelBack={`${member.display_name} — trust dossier. Click to flip back.`}
      front={<FrontFace member={member} />}
      back={<BackFace member={member} />}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Front face — cover image + cream info panel + avatar at the seam.
// ─────────────────────────────────────────────────────────────────────

const TIER_COVER_GRADIENT: Record<
  NonNullable<CardTier>,
  { from: string; to: string }
> = {
  legendary: { from: "#d9a400", to: "#7a5e00" }, // gold → deep amber
  rare:      { from: "#1d4fbb", to: "#0a2467" }, // cobalt → midnight
  uncommon:  { from: "#247a3f", to: "#0e3a1c" }, // forest → deep forest
  common:    { from: "#6b6e72", to: "#3a3c40" }, // steel → graphite
};

function coverGradient(cardTier: CardTier): string {
  const palette =
    cardTier !== null ? TIER_COVER_GRADIENT[cardTier] : TIER_COVER_GRADIENT.common;
  return `linear-gradient(135deg, ${palette.from} 0%, ${palette.to} 100%)`;
}

function FrontFace({ member }: { member: MemberSummary }) {
  const showHandleKicker = !member.handle.includes("@");

  return (
    <div className="absolute inset-0 overflow-hidden border-2 border-cardstock-edge/40 bg-cardstock-deep/40">
      {/* Cover area — top half. Real cover_photo_url when set; tier-
          tinted gradient otherwise so cold-start accounts still get a
          presentable card. */}
      {member.cover_photo_url !== null ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={member.cover_photo_url}
          alt=""
          className="absolute inset-x-0 top-0 h-1/2 w-full object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1/2"
          style={{ background: coverGradient(member.card_tier) }}
        />
      )}

      {/* Trust score — circular medallion pinned top-right of the
          cover. Ink-deep fill + cardstock ring keeps the score legible
          regardless of the cover photo's tones (a cover that happens
          to be light, dark, or busy never washes out the digit). */}
      <div className="absolute right-3 top-3 z-10">
        <TrustScoreBadge score={member.trust_score} />
      </div>

      {/* Cream panel — bottom half. Top padding clears the avatar's
          lower half (avatar floats at the seam with -translate). */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-cardstock px-4 pb-3 pt-12">
        {/* Hide the @handle kicker when the handle is email-shaped
            (contains @). Until users force a real handle, the slot
            stays empty rather than rendering "@email@domain" garbage.
            14px reserved-height keeps the cream panel layout stable. */}
        {showHandleKicker ? (
          <p className="bcc-mono truncate text-center text-[10px] tracking-[0.18em] text-safety">
            @{member.handle}
          </p>
        ) : (
          <div aria-hidden className="h-[14px]" />
        )}
        <h3 className="bcc-stencil mt-1 line-clamp-2 text-center text-base text-ink leading-tight sm:text-lg">
          {member.display_name}
        </h3>

        {/* Bottom strip — standing pip · rank chip · joined age. */}
        <div className="absolute inset-x-4 bottom-3 flex items-center justify-between gap-1.5">
          {member.is_in_good_standing ? (
            <span
              className="bcc-mono bg-verified px-1.5 py-[2px] text-white"
              style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              title="In good standing"
            >
              ✓
            </span>
          ) : (
            <span
              className="bcc-mono border border-safety/60 px-1.5 py-[2px] text-safety"
              style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              title="Under review"
            >
              !
            </span>
          )}
          <RankChip
            cardTier={member.card_tier}
            tierLabel={member.tier_label}
            rankLabel={member.rank_label}
            size="compact"
          />
          <span
            className="bcc-mono shrink-0 text-ink-soft"
            style={{ fontSize: "10px", letterSpacing: "0.16em" }}
            title={`Joined ${member.joined_at}`}
          >
            {formatJoinedAge(member.joined_at)}
          </span>
        </div>
      </div>

      {/* Avatar — floats at the seam between cover and cream panel.
          Sprint 1 Identity Grammar: the inner avatar render is now the
          shared <Avatar> at lg (64px) with tier-tinted ring. The
          wrapping <div> still provides the cover-seam positioning +
          drop shadow (magazine-cover treatment, see header comment).
          Cosmetic shift: avatar is now circular (rounded), not square. */}
      <div
        className={
          "absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 " +
          "shadow-[0_4px_12px_rgba(15,13,9,0.35)] rounded-full"
        }
      >
        <Avatar
          avatarUrl={member.avatar_url === "" ? null : member.avatar_url}
          handle={member.handle}
          displayName={member.display_name}
          size="lg"
          variant="rounded"
          tier={member.card_tier}
        />
      </div>
    </div>
  );
}

function TrustScoreBadge({ score }: { score: number }) {
  // Score 0 = brand-new account that hasn't earned reputation yet, NOT
  // "scored zero." The badge fades + drops a "—" digit instead of "0"
  // so a fresh account doesn't look like it failed a check.
  const isUnscored = score === 0;

  return (
    <div
      className="flex flex-col items-center gap-1"
      title={
        isUnscored
          ? "No trust score yet — fresh account"
          : `Trust score: ${score}/100`
      }
    >
      {/* Medallion — solid ink circle, cardstock stroke, soft shadow.
          Always-visible against any cover photo. The cardstock ring is
          what does the heavy lifting: 2.5px of high-contrast cream pops
          the badge off whatever's behind it (gradient, photo, or future
          cover variant) without competing with the cover content. */}
      <div
        className={
          "relative flex h-14 w-14 items-center justify-center rounded-full " +
          "border-[2.5px] border-cardstock " +
          "shadow-[0_3px_12px_rgba(0,0,0,0.45)] " +
          (isUnscored ? "bg-ink-ghost" : "bg-ink")
        }
      >
        <span
          className={
            "bcc-stencil leading-none " +
            (isUnscored ? "text-cardstock/40" : "text-cardstock")
          }
          style={{ fontSize: "22px", letterSpacing: "-0.02em" }}
        >
          {isUnscored ? "—" : score}
        </span>
      </div>
      <span
        className="bcc-mono text-cardstock"
        style={{
          fontSize: "9px",
          letterSpacing: "0.22em",
          textShadow: "0 1px 3px rgba(15,13,9,0.6)",
        }}
      >
        TRUST
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Back face — trust dossier. Two stacked panels (VERIFIED / ON THE
// FLOOR) plus an OPEN PROFILE link pinned to the bottom.
// ─────────────────────────────────────────────────────────────────────

function BackFace({ member }: { member: MemberSummary }) {
  const v = member.verifications;
  const e = member.engagement;
  const typedRoles = collectTypedRoleBadges(member.owned_pages_by_type);

  // Cold-start signal: brand-new account with nothing on the wire yet.
  // Show a single muted line instead of a wall of "—" / 0 rows.
  const hasAnySignal =
    v.x_verified ||
    v.github_verified ||
    v.wallets_verified > 0 ||
    e.endorsements_received > 0 ||
    e.reviews_written > 0 ||
    e.disputes_signed > 0 ||
    typedRoles.length > 0 ||
    member.primary_local !== null;

  // Hide the @handle suffix when it's email-shaped (`@user@gmail.com`
  // is bad UI). Same rule the front face uses for the kicker.
  const showHandleSuffix = !member.handle.includes("@");

  return (
    <div className="absolute inset-0 overflow-hidden border-2 border-cardstock-edge/40 bg-cardstock px-4 pt-3 pb-12">
      <div className="flex items-baseline justify-between gap-2">
        <span className="bcc-mono text-[10px] tracking-[0.18em] text-safety">
          DOSSIER
        </span>
        {showHandleSuffix && (
          <span className="bcc-mono truncate text-[10px] tracking-[0.18em] text-ink-soft">
            @{member.handle}
          </span>
        )}
      </div>

      {/* Pills row — typed role badges + primary local pill. Compact;
          only renders the chips with content so a community member with
          no owned pages and no primary local doesn't get an empty band. */}
      {(typedRoles.length > 0 || member.primary_local !== null) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {typedRoles.map((role) => (
            <TypedRoleBadge
              key={role.type}
              type={role.type}
              count={role.count}
              label={role.label}
            />
          ))}
          {member.primary_local !== null && (
            <PrimaryLocalChip local={member.primary_local} />
          )}
        </div>
      )}

      {hasAnySignal ? (
        <>
          <DossierSection label="VERIFIED">
            <Row
              label="X"
              value={
                v.x_verified
                  ? v.x_username !== null
                    ? `✓ @${v.x_username}`
                    : "✓"
                  : "—"
              }
              dim={!v.x_verified}
            />
            <Row
              label="GITHUB"
              value={
                v.github_verified
                  ? v.github_username !== null
                    ? `✓ @${v.github_username}`
                    : "✓"
                  : "—"
              }
              dim={!v.github_verified}
            />
            <Row
              label="WALLETS"
              value={
                v.wallets_verified > 0 ? `✓ ${v.wallets_verified}` : "—"
              }
              dim={v.wallets_verified === 0}
            />
          </DossierSection>

          <DossierSection label="ON THE FLOOR" topGap>
            <Row
              label="ENDORSEMENTS"
              value={String(e.endorsements_received)}
              dim={e.endorsements_received === 0}
            />
            <Row
              label="REVIEWS"
              value={String(e.reviews_written)}
              dim={e.reviews_written === 0}
            />
            <Row
              label="DISPUTES"
              value={String(e.disputes_signed)}
              dim={e.disputes_signed === 0}
            />
          </DossierSection>
        </>
      ) : (
        <p className="bcc-mono mt-6 text-center text-[12px] italic leading-relaxed text-ink-soft">
          Nothing on file yet — fresh account.
        </p>
      )}

      {/* Open Profile — pinned bottom. Same treatment as the community
          card's "OPEN COMMUNITY →". stopPropagation so navigation runs
          instead of toggling the flip back. */}
      <Link
        href={`/u/${member.handle}`}
        onClick={(e) => e.stopPropagation()}
        className={
          "bcc-mono absolute inset-x-4 bottom-3 inline-flex items-center justify-center " +
          "border-2 border-ink bg-ink py-2 text-[11px] tracking-[0.18em] text-cardstock " +
          "hover:bg-ink/80 " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blueprint focus-visible:ring-offset-2 focus-visible:ring-offset-cardstock"
        }
      >
        OPEN PROFILE →
      </Link>
    </div>
  );
}

function DossierSection({
  label,
  topGap = false,
  children,
}: {
  label: string;
  topGap?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={topGap ? "mt-3" : "mt-2"}>
      {/* Section labels render in full ink, not the muted cardstock-
          deep tone — these are structural headers ("VERIFIED" / "ON
          THE FLOOR"), not supplementary chrome. They need to read as
          first-class sections against the cream panel. */}
      <p className="bcc-mono text-[10px] tracking-[0.18em] text-ink">
        {label}
      </p>
      <dl className="mt-1 space-y-0.5">{children}</dl>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Typed role badges + primary local pill — surfaced on the back face's
// pills row. Same canonical type slugs and color palette the chip strip
// uses on the directory filter (`--owned-type-*` CSS vars). Render order
// is fixed (validator → project → nft → dao) so a heavy operator looks
// the same on every visit.
// ─────────────────────────────────────────────────────────────────────

type OwnedPageType = keyof MemberSummary["owned_pages_by_type"];

const TYPE_LABELS: Record<
  OwnedPageType,
  { singular: string; plural: string }
> = {
  validator: { singular: "VALIDATOR",       plural: "VALIDATORS" },
  project:   { singular: "PROJECT",         plural: "PROJECTS" },
  nft:       { singular: "NFT COLLECTION",  plural: "NFT COLLECTIONS" },
  dao:       { singular: "DAO",             plural: "DAOS" },
};

const TYPE_RENDER_ORDER: OwnedPageType[] = ["validator", "project", "nft", "dao"];

const TYPE_CHIP_STYLE: Record<OwnedPageType, { bg: string; text: string }> = {
  validator: { bg: "var(--owned-type-validator)", text: "#fff" },
  project:   { bg: "var(--owned-type-project)",   text: "var(--ink, #0f0d09)" },
  nft:       { bg: "var(--owned-type-nft)",       text: "#fff" },
  dao:       { bg: "var(--owned-type-dao)",       text: "#fff" },
};

function collectTypedRoleBadges(
  byType: MemberSummary["owned_pages_by_type"],
): Array<{ type: OwnedPageType; count: number; label: string }> {
  return TYPE_RENDER_ORDER.flatMap((type) => {
    const count = byType[type];
    if (count <= 0) return [];
    const labels = TYPE_LABELS[type];
    return [
      {
        type,
        count,
        label: count === 1 ? labels.singular : labels.plural,
      },
    ];
  });
}

function TypedRoleBadge({
  type,
  count,
  label,
}: {
  type: OwnedPageType;
  count: number;
  label: string;
}) {
  const palette = TYPE_CHIP_STYLE[type];
  return (
    <span
      className="bcc-mono px-1.5 py-[2px]"
      style={{
        background: palette.bg,
        color: palette.text,
        fontSize: "9px",
        letterSpacing: "0.18em",
      }}
    >
      {count} {label}
    </span>
  );
}

function PrimaryLocalChip({
  local,
}: {
  local: NonNullable<MemberSummary["primary_local"]>;
}) {
  return (
    <span
      className="bcc-mono inline-flex items-center gap-1 border border-cardstock-edge/40 px-1.5 py-[2px] text-ink"
      style={{ fontSize: "9px", letterSpacing: "0.16em" }}
    >
      {local.number !== null && (
        <span className="text-safety">№{local.number}</span>
      )}
      <span className="truncate">{local.name.toUpperCase()}</span>
    </span>
  );
}

function Row({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt
        className={
          "bcc-mono text-[10px] tracking-[0.16em] " +
          (dim ? "text-ink-ghost" : "text-ink-soft")
        }
      >
        {label}
      </dt>
      <dd
        className={
          "bcc-mono text-[11px] " + (dim ? "text-ink-ghost" : "text-ink")
        }
      >
        {value}
      </dd>
    </div>
  );
}
