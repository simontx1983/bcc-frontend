/**
 * TrustHeader — the trust-first identity header for a member (Figma
 * "Handoff v1", Public Profile / About).
 *
 * Server component composed of the same server fields the /u/[handle]
 * hero reads — nothing here is derived on the client:
 *   - score: `reputation_score ?? trust_score` (the hero's own fallback)
 *   - tier: `reputation_tier` + `reputation_tier_label` via TrustChip
 *   - rank: the C8 rule — "ranked" + rank_label → RankChip, "new_member"
 *     → NewMemberChip, member_state absent → nothing
 *   - standing: `is_in_good_standing` → the hero's GOOD STANDING pill
 *   - the line: attestation_summary counts + verifications booleans
 *
 * Deliberately absent: follower/watcher counts, views, prices, and wallet
 * addresses (only the non-identifying `wallets_verified` count is read).
 * The "Vouched for by N people you watch" line (dev note 23) is not here
 * yet: its contract (bcc-trust #674) is still changing.
 *
 * `variant="compact"` drops the verification line; everything else is
 * identical.
 */

import { Avatar } from "@/components/identity/Avatar";
import { MemberFollowButton } from "@/components/identity/MemberFollowButton";
import { NewMemberChip } from "@/components/identity/NewMemberChip";
import { ShareButton } from "@/components/common/ShareButton";
import { AttestationActionCluster } from "@/components/profile/AttestationActionCluster";
import { RankChip, TrustChip } from "@/components/profile/RankChip";
import { presentationName } from "@/lib/format";
import type { MemberProfile } from "@/lib/api/types";

export interface TrustHeaderProps {
  profile: MemberProfile;
  isOwner: boolean;
  viewerAuthed: boolean;
  variant?: "full" | "compact";
}

export function TrustHeader({
  profile,
  isOwner,
  viewerAuthed,
  variant = "full",
}: TrustHeaderProps) {
  const name = presentationName(profile);
  const profilePath = `/u/${encodeURIComponent(profile.handle)}`;
  // Same rule as the profile page: an email-shaped handle (PeepSo's default
  // before a real one is picked) reads as broken UI behind an `@`.
  const showHandle = !profile.handle.includes("@");
  const score = profile.reputation_score ?? profile.trust_score;

  return (
    <section className="bcc-panel" aria-label={`${name} — trust summary`}>
      <div className="flex items-start gap-3">
        <Avatar
          avatarUrl={profile.avatar_url}
          handle={profile.handle}
          displayName={profile.display_name}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <p
            className="bcc-stencil uppercase leading-[0.95] text-bcc-text"
            style={{ fontSize: "24px", wordBreak: "break-word" }}
          >
            {name}
          </p>
          {showHandle && (
            <p
              className="bcc-mono mt-1 truncate text-bcc-text-safety"
              style={{ fontSize: "11px", letterSpacing: "0.18em" }}
            >
              @{profile.handle}
            </p>
          )}
          <RankLine profile={profile} />
        </div>
        <div className="shrink-0">
          <ShareButton
            path={profilePath}
            title={name}
            ariaLabel={`Share ${name}'s profile`}
          />
        </div>
      </div>

      <div className="mt-4 border-t border-dashed border-bcc-border pt-4">
        <p className="bcc-mono text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary">
          Trust score
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="bcc-stencil text-5xl leading-none text-bcc-text tabular-nums">
            {score}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {/* The number sits right beside it, so the chip carries the tier
                only — the score is not repeated. */}
            <TrustChip
              reputationTier={profile.reputation_tier}
              tierLabel={profile.reputation_tier_label}
              handle={profile.handle}
            />
            {profile.is_in_good_standing && (
              <span
                className="bcc-mono border border-verified/60 px-2 py-1 text-verified"
                style={{ fontSize: "10px", letterSpacing: "0.18em" }}
              >
                GOOD STANDING
              </span>
            )}
          </div>
        </div>
        {variant === "full" && <VerificationLine profile={profile} />}
      </div>

      {/* Owner view: no Watch/Vouch on your own header. The owner action
          (EDIT ABOUT) lands in a later PR. */}
      {/* Rendered only when there is something to put in it: the cluster
          returns null when the server omitted can_vouch (it is optional),
          and Watch needs a signed-in viewer — otherwise this would be an
          empty bordered block. */}
      {!isOwner && (viewerAuthed || profile.permissions.can_vouch !== undefined) && (
        // Watch + Vouch side by side (Handoff v1). Stand-behind and Report
        // stay on the full profile hero, so the cluster gets only the vouch
        // permission and renders the Vouch control alone.
        <div className="mt-4 grid grid-cols-2 items-start gap-3 border-t border-dashed border-bcc-border pt-4">
          {/* MemberFollowButton self-hides for anonymous viewers; gating here
              too keeps the slot out of the SSR markup, and Vouch then spans
              the row. The arbitrary variant lifts its button to the 44px
              action-target floor without editing the shared component. */}
          {viewerAuthed && (
            <MemberFollowButton
              userId={profile.user_id}
              className="[&>button]:min-h-[44px] [&>button]:w-full"
            />
          )}
          <div className={viewerAuthed ? "" : "col-span-2"}>
            <AttestationActionCluster
              targetKind="user_profile"
              targetId={profile.user_id}
              canVouch={profile.permissions.can_vouch}
              viewerAttestation={profile.viewer_attestation}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function RankLine({ profile }: { profile: MemberProfile }) {
  // C8 chip rule (Rank redesign Phase 5) — absence is never fabricated
  // into a state.
  if (
    profile.member_state === "ranked" &&
    typeof profile.rank_label === "string" &&
    profile.rank_label !== ""
  ) {
    return (
      <div className="mt-2">
        <RankChip
          reputationTier={profile.reputation_tier}
          tierLabel={profile.reputation_tier_label}
          rankLabel={profile.rank_label}
          size="compact"
          handle={profile.handle}
        />
      </div>
    );
  }
  if (profile.member_state === "new_member") {
    return (
      <div className="mt-2">
        <NewMemberChip size="compact" />
      </div>
    );
  }
  return null;
}

/**
 * "N VOUCH · N BACKS · ✓ X · ✓ GITHUB · ✓ WALLET". Each item is omitted
 * when its field is false/absent. Only booleans and the non-identifying
 * wallet count are read — never a wallet address or username.
 */
function VerificationLine({ profile }: { profile: MemberProfile }) {
  const items: Array<{ key: string; label: string; verified: boolean }> = [];
  const summary = profile.attestation_summary;
  if (summary !== undefined) {
    items.push({ key: "vouch", label: `${summary.vouch_count} VOUCH`, verified: false });
    items.push({ key: "backs", label: `${summary.stand_behind_count} BACKS`, verified: false });
  }
  const v = profile.verifications;
  if (v.x_verified) items.push({ key: "x", label: "X", verified: true });
  if (v.github_verified) items.push({ key: "github", label: "GITHUB", verified: true });
  if (v.wallets_verified > 0) items.push({ key: "wallet", label: "WALLET", verified: true });

  if (items.length === 0) return null;

  return (
    <ul
      className="bcc-mono mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary"
      data-testid="trust-header-verifications"
    >
      {items.map((item, idx) => (
        <li key={item.key} className="inline-flex items-center gap-2">
          {idx > 0 && <span aria-hidden>·</span>}
          <span>
            {item.verified && (
              <span className="text-verified">
                <span aria-hidden>✓ </span>
                <span className="sr-only">Verified </span>
              </span>
            )}
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}
