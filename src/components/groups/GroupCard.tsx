/**
 * GroupCard — 316px-wide presentation card for the PageHero `card` slot.
 *
 * Sibling to FlippableMemberCard / FlippableNftCard / CardFactory: same
 * slot, same width, same visual scale. Groups don't have a flip / back-
 * face dossier (no view-model for it), so this is a single-face card —
 * cover image at the top, name + kicker + meta below.
 *
 * Mounted by /groups/[slug], /communities/[slug] (+ /about, /members),
 * /locals/[slug] inside the unified FileRail + PageHero + tabs shell.
 *
 * Server component. No interactive state — the Join/Leave / Membership
 * controls live in PageHero's `actions` slot.
 */

import { CommunityCover } from "@/components/communities/CommunityCover";
import { HeatBadge } from "@/components/groups/HeatBadge";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import type { GroupDetailResponse } from "@/lib/api/types";

const KICKER_BY_TYPE: Record<GroupDetailResponse["type"], string> = {
  nft:    "HOLDERS GROUP",
  local:  "LOCAL CHAPTER",
  system: "SYSTEM GROUP",
  user:   "COMMUNITY",
};

const PRIVACY_KICKER: Record<GroupDetailResponse["privacy"], string | null> = {
  open:   null,
  closed: "PRIVATE",
  secret: "INVITE-ONLY",
};

export function GroupCard({ group }: { group: GroupDetailResponse }) {
  const kicker = KICKER_BY_TYPE[group.type];
  // Trust gate overrides the privacy kicker because trust groups store
  // privacy as "open" — without this branch the card would silently
  // show no gate label on a reputation-gated room.
  const privacyKicker =
    group.trust_min !== null
      ? `TRUST ${group.trust_min}+`
      : PRIVACY_KICKER[group.privacy];

  return (
    <article className="border-2 border-cardstock-edge/60 bg-cardstock">
      {/* Cover — square aspect, same 316×316 footprint the trading
          card uses for its photo slot. CommunityCover handles the NFT
          image / deterministic-initials-block fallback. */}
      <div
        className="relative w-full overflow-hidden bg-concrete"
        style={{ aspectRatio: "1 / 1" }}
      >
        <CommunityCover
          imageUrl={group.image_url}
          name={group.name}
          groupId={group.id}
        />
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(15,13,9,0.0) 0%, rgba(15,13,9,0.0) 55%, rgba(15,13,9,0.5) 100%)",
          }}
        />
      </div>

      {/* Identity block — kicker → name → meta row. Compacted for the
          narrower 316px column. */}
      <div className="px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span
            className="bcc-mono uppercase text-ink-soft"
            style={{ fontSize: "9px", letterSpacing: "0.24em" }}
          >
            {kicker}
          </span>
          {privacyKicker !== null && (
            <span
              className="bcc-mono uppercase text-safety"
              style={{ fontSize: "9px", letterSpacing: "0.24em" }}
            >
              · {privacyKicker}
            </span>
          )}
        </div>

        <h2
          className="bcc-stencil mt-1 text-ink"
          style={{
            fontSize: "22px",
            letterSpacing: "0.02em",
            lineHeight: 1.05,
            wordBreak: "break-word",
          }}
        >
          {group.name}
        </h2>

        <p
          className="bcc-mono mt-2 text-ink-soft"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          {group.member_count.toLocaleString()} MEMBER
          {group.member_count === 1 ? "" : "S"}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {group.verification !== null && (
            <VerificationBadge label={group.verification.label} />
          )}
          <HeatBadge activity={group.activity} />
        </div>
      </div>
    </article>
  );
}
