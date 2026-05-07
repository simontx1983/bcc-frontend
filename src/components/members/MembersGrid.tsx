"use client";

/**
 * MembersGrid — card grid for the /members directory.
 *
 * One card per MemberSummary. Layout:
 *   - Header row: avatar + handle kicker + display_name + trust score
 *   - Context row: primary Local pill + builder badge (when ownded_pages_count > 0)
 *   - Footer row: standing pip + RankChip + watchers count + relative join age
 *
 * The card density was a deliberate v2 expansion: the original card
 * surfaced only chips, which made every member look interchangeable and
 * gave a viewer no way to tell a 2-day-old account from a 2-year
 * operator. The new fields (`trust_score`, `followers_count`,
 * `primary_local`, `owned_pages_count`) come from the §4.4 `/members`
 * contract amendment and let the directory carry social-proof weight.
 *
 * Cold-start consideration: a brand-new account with `trust_score: 0`,
 * `followers_count: 0`, `owned_pages_count: 0`, joined-2d-ago should
 * read as starkly empty by design — that's the spam-tell. We do NOT
 * pad missing values with placeholders or "Just joined!" copy; absence
 * is the signal.
 *
 * Click anywhere on the card → /u/:handle for the full profile.
 * Visually mirrors the entity DirectoryGrid rhythm so the two
 * directories feel like the same product — same paper-card treatment,
 * same column count breakpoints.
 */

import Link from "next/link";

import { RankChip } from "@/components/profile/RankChip";
import { formatRelativeTime } from "@/lib/format";
import type { MemberSummary } from "@/lib/api/types";

interface MembersGridProps {
  items: readonly MemberSummary[];
}

export function MembersGrid({ items }: MembersGridProps) {
  if (items.length === 0) {
    return null; // page-level empty state handles this
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((member) => (
        <li key={member.id}>
          <MemberCard member={member} />
        </li>
      ))}
    </ul>
  );
}

function MemberCard({ member }: { member: MemberSummary }) {
  const href = `/u/${member.handle}` as const;
  const typedRoles = collectTypedRoleBadges(member.owned_pages_by_type);
  const hasContextRow =
    member.primary_local !== null || typedRoles.length > 0;

  return (
    <Link
      href={href}
      className="bcc-paper group flex h-full flex-col gap-3 p-4 transition hover:bg-cardstock-deep/30"
    >
      <header className="flex items-start gap-3">
        <Avatar src={member.avatar_url} initial={member.handle.charAt(0).toUpperCase()} />
        <div className="min-w-0 flex-1">
          <p className="bcc-mono truncate text-safety">@{member.handle}</p>
          <h3 className="bcc-stencil truncate text-lg text-ink leading-tight">
            {member.display_name}
          </h3>
        </div>
        <TrustScoreBadge score={member.trust_score} />
      </header>

      {/* Context row — only renders when there's something to show.
          Empty by design for blank-slate accounts (cold-start tell). */}
      {hasContextRow && (
        <div className="flex flex-wrap items-center gap-1.5">
          {member.primary_local !== null && (
            <PrimaryLocalChip local={member.primary_local} />
          )}
          {typedRoles.map((role) => (
            <TypedRoleBadge
              key={role.type}
              type={role.type}
              count={role.count}
              label={role.label}
            />
          ))}
        </div>
      )}

      {/* Footer row. Standing-then-rank ordering matches /u/[handle] —
          keeps the tier-tinted left rail of the rank chip from sitting
          against the green "good standing" check (green-on-green
          collision for Uncommon users). Watchers + joined relative
          balance the right side as faint meta. */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-dashed border-cardstock-edge/40 pt-3">
        {member.is_in_good_standing ? (
          <span
            className="bcc-mono bg-verified px-2 py-[3px] text-white"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
            title="In good standing"
          >
            ✓
          </span>
        ) : (
          <span
            className="bcc-mono border border-safety/60 px-2 py-[3px] text-safety"
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
        {member.followers_count > 0 && (
          <span
            className="bcc-mono text-ink-soft"
            style={{ fontSize: "10px", letterSpacing: "0.16em" }}
          >
            · {member.followers_count.toLocaleString()}{" "}
            {member.followers_count === 1 ? "WATCHER" : "WATCHERS"}
          </span>
        )}
        <span
          className="bcc-mono ml-auto text-ink-soft"
          style={{ fontSize: "10px", letterSpacing: "0.16em" }}
          title={`Joined ${member.joined_at}`}
        >
          {formatRelativeTime(member.joined_at)}
        </span>
      </div>
    </Link>
  );
}

// ──────────────────────────────────────────────────────────────────────
// TrustScoreBadge — anchors the card's right side. Stencil number,
// "TRUST" kicker beneath. Score is server-derived per §D5; we render
// the integer and don't decorate it.
// ──────────────────────────────────────────────────────────────────────

function TrustScoreBadge({ score }: { score: number }) {
  return (
    <div
      className="flex shrink-0 flex-col items-end gap-0.5"
      title={`Trust score: ${score}/100`}
    >
      <span
        className="bcc-stencil text-ink leading-none"
        style={{ fontSize: "26px", letterSpacing: "-0.01em" }}
      >
        {score}
      </span>
      <span
        className="bcc-mono text-ink-soft"
        style={{ fontSize: "9px", letterSpacing: "0.20em" }}
      >
        TRUST
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// PrimaryLocalChip — community-geography pill. Renders inside the card
// link, so it can't be its own <Link> (nested anchors are invalid HTML);
// click-through to /locals/{slug} happens via the profile page.
// ──────────────────────────────────────────────────────────────────────

function PrimaryLocalChip({
  local,
}: {
  local: NonNullable<MemberSummary["primary_local"]>;
}) {
  return (
    <span
      className="bcc-mono inline-flex items-center gap-1 border border-cardstock-edge/40 px-2 py-[3px] text-ink"
      style={{ fontSize: "10px", letterSpacing: "0.16em" }}
    >
      {local.number !== null && (
        <span className="text-safety">№{local.number}</span>
      )}
      <span className="truncate">{local.name.toUpperCase()}</span>
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Typed role badges — one per non-zero entry in `owned_pages_by_type`.
// Replaces the single `BUILDER · N` chip with a per-type breakdown
// (`6 PROJECTS`, `5 NFT COLLECTIONS`, `1 VALIDATOR`).
//
// Plural inflection lives on the frontend per the same precedent as
// `WATCHER` / `WATCHERS` — server ships the integer counts, presentation
// owns the language. Adding a new canonical type means a new entry in
// `TYPE_LABELS`, a new key on the contract, and a new badge will
// auto-render when the count is non-zero.
//
// Render order is canonical-fixed (validator → project → nft → dao) so
// the same user looks the same on every visit; we don't sort by count.
// Cards display all non-zero buckets — there's a hard cap of 4 types
// today (the wire schema only has four), so worst-case is four badges,
// which fits the current card width without overflow.
// ──────────────────────────────────────────────────────────────────────

type OwnedPageType = keyof MemberSummary["owned_pages_by_type"];

const TYPE_LABELS: Record<OwnedPageType, { singular: string; plural: string }> = {
  validator: { singular: "VALIDATOR",       plural: "VALIDATORS" },
  project:   { singular: "PROJECT",         plural: "PROJECTS" },
  nft:       { singular: "NFT COLLECTION",  plural: "NFT COLLECTIONS" },
  dao:       { singular: "DAO",             plural: "DAOS" },
};

const TYPE_RENDER_ORDER: OwnedPageType[] = ["validator", "project", "nft", "dao"];

// Per-type chip palette. Background pulls from `--owned-type-*` CSS
// vars (defined in globals.css §C1-adjacent palette block). Text color
// is paired with each bg for ≥4.5:1 contrast: ink on the gold project
// chip, white on the saturated validator/nft/dao chips.
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
    return [{
      type,
      count,
      label: count === 1 ? labels.singular : labels.plural,
    }];
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
      className="bcc-mono px-2 py-[3px]"
      style={{
        background: palette.bg,
        color: palette.text,
        fontSize: "10px",
        letterSpacing: "0.18em",
      }}
    >
      {count} {label}
    </span>
  );
}

function Avatar({ src, initial }: { src: string; initial: string }) {
  if (src === "") {
    return (
      <div
        aria-hidden
        className="bcc-stencil flex h-12 w-12 shrink-0 items-center justify-center border-2 border-cardstock-edge/40 bg-cardstock-deep/40 text-2xl text-ink"
      >
        {initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={48}
      height={48}
      className="h-12 w-12 shrink-0 border-2 border-cardstock-edge/40 object-cover"
    />
  );
}
