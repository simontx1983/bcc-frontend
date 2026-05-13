/**
 * /u/[handle] — member profile route.
 *
 * Server component. Fetches GET /bcc/v1/users/:handle (§3.1) on every
 * navigation and renders the available fields. The contract today
 * returns the FLAT shape: identity (handle, display_name, avatar,
 * joined_at, tier_label, rank_label, is_in_good_standing, flags), bio
 * as plain string, locals/wallets, counts, plus the own-only blocks
 * (living, progression, feature_access, ux_helpers) when is_self.
 *
 * Auth: a null token is fine — the server returns a public view-model
 * for anonymous reads. When a session exists we forward the bearer so
 * own-only blocks resolve (§3.1).
 *
 * 404: backend returns `bcc_not_found` (status 404) when the handle is
 * unknown; we map that to Next's `notFound()`. Other failures bubble
 * as a 500 — let the framework show its error UI.
 *
 * Layout: a top "FILE 0001" rail + a 2-column hero (identity left,
 * live shift right), then numbered section frames (FILE 02 BIO, 03
 * THE NUMBERS, 04 LOCALS, 05 WALLETS, 06 ON FILE) for vertical rhythm
 * matching the SiteHeader rail vocabulary.
 *
 * Phase-4 surfaces — the rich profile (hero card, stats strip, shift-
 * log grid, reviews/disputes tabs with counts) is scaffolded under
 * @/components/profile but not wired here. Those components depend
 * on a richer view-model (Phase4MemberProfile) that no endpoint
 * returns yet. Wire them when the contract amends per §9; today this
 * page renders only what §3.1 actually ships.
 */

import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AttestationActionCluster } from "@/components/profile/AttestationActionCluster";
import { AttestationRoster } from "@/components/profile/AttestationRoster";
import { LivingHeader } from "@/components/profile/LivingHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { ReputationSummaryPanel } from "@/components/profile/ReputationSummaryPanel";
import { authOptions } from "@/lib/auth";
import { getUser } from "@/lib/api/user-endpoints";
import { FOLLOW_COPY } from "@/lib/copy";
import { formatJoinDate } from "@/lib/format";
import {
  BccApiError,
  type MemberCounts,
  type MemberLocal,
  type MemberProfile,
  type MemberWallet,
} from "@/lib/api/types";

interface PageProps {
  params: Promise<{ handle: string }>;
}

export default async function MemberProfilePage({ params }: PageProps) {
  const { handle } = await params;

  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  let profile: MemberProfile;
  try {
    profile = await getUser(handle, token);
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  const isOwner =
    session !== null && session.user.handle === profile.handle;

  return (
    <main className="pb-24">
      <FileRail handle={profile.handle} />

      {/* HERO — identity left, live shift right. The dashed left-border
          on the right column lands only at lg breakpoint so mobile
          stacks cleanly without a vertical rule cutting across content. */}
      <section className="mx-auto max-w-[1560px] px-4 pt-12 sm:px-7">
        <div className="grid gap-10 lg:grid-cols-[1fr_minmax(340px,420px)] lg:gap-14">
          <IdentityHeader profile={profile} isOwner={isOwner} />

          {profile.living !== undefined && (
            <div className="lg:border-l lg:border-dashed lg:border-cardstock/20 lg:pl-12">
              <p className="bcc-mono mb-5 inline-flex items-center gap-2 text-safety">
                <span className="bcc-rail-dot" aria-hidden />
                <span>SHIFT &nbsp;//&nbsp; LIVE</span>
              </p>
              <LivingHeader
                living={profile.living}
                progression={profile.progression}
              />
            </div>
          )}
        </div>
      </section>

      {/* §J.6 attestation roster — THE primary content of an
          operator passport per the constitution. Renumbered to FILE
          02 to reflect the new content hierarchy (reputation-first).
          Bio + Numbers + Locals + Wallets + On File shift to 03–07.
          Phase 1 status: backend endpoint not yet shipped; roster
          renders empty-state copy per risk-assessment §2.9. */}
      <SectionFrame fileNumber="02" label="BACKING">
        <AttestationRoster
          items={undefined}
          emptyState={{
            body: "This operator hasn't been backed yet. Their reputation will form as they participate.",
          }}
        />
      </SectionFrame>

      {profile.bio.trim() !== "" && (
        <SectionFrame fileNumber="03" label="BIO">
          <BioBlock bio={profile.bio} signature={profile.display_name} />
        </SectionFrame>
      )}

      <SectionFrame fileNumber="04" label="THE NUMBERS">
        <CountsStrip counts={profile.counts} />
      </SectionFrame>

      {profile.locals.length > 0 && (
        <SectionFrame fileNumber="05" label="LOCALS">
          <LocalsStrip locals={profile.locals} />
        </SectionFrame>
      )}

      {profile.wallets.length > 0 && (
        <SectionFrame fileNumber="06" label="WALLETS">
          <WalletsStrip wallets={profile.wallets} />
        </SectionFrame>
      )}

      {/* Tab strip — Reviews / Disputes lazy-fetch via handle on
          activation. The §3.1 contract doesn't ship `tabs` metadata
          (count badges + PRIVATE chips); each panel resolves its own
          hidden state on fetch. When backend phases up to ship
          MemberTabCount[], pass it through as a `tabs` prop. */}
      <SectionFrame fileNumber="07" label="ON FILE">
        <ProfileTabs
          handle={profile.handle}
          displayName={profile.display_name}
          isOwner={isOwner}
        />
      </SectionFrame>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// FileRail — top status strip, mirrors the SiteHeader rail vocabulary.
// Anchors the page in the "operator file" metaphor; everything below
// reads as numbered sections of that file.
// ──────────────────────────────────────────────────────────────────────

function FileRail({ handle }: { handle: string }) {
  return (
    <div className="border-b border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; OPERATOR</span>
          <span className="text-cardstock">@{handle.toUpperCase()}</span>
        </span>
        <span className="bcc-mono text-cardstock/50">FILE 0001 &nbsp;//&nbsp; OPEN</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SectionFrame — numbered section wrapper. Section title kicker on a
// dashed safety-orange rule; pulls each block into the "FILE NN" rhythm.
// ──────────────────────────────────────────────────────────────────────

function SectionFrame({
  fileNumber,
  label,
  children,
}: {
  fileNumber: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto mt-16 max-w-[1560px] px-7">
      <div className="mb-7 flex items-center gap-4">
        <span className="bcc-mono text-cardstock-deep">FILE {fileNumber}</span>
        <span className="bcc-mono text-safety">{"//"} {label}</span>
        <span aria-hidden className="h-px flex-1 bg-cardstock/15" />
      </div>
      {children}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// IdentityHeader — hero left column. Avatar + handle kicker + huge
// stencil display name, then the chips strip, then a dashed-rule
// meta row carrying the join date and (for the owner) the Edit btn.
// ──────────────────────────────────────────────────────────────────────

function IdentityHeader({
  profile,
  isOwner,
}: {
  profile: MemberProfile;
  isOwner: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-5">
        <Avatar
          src={profile.avatar_url}
          initial={profile.handle.charAt(0).toUpperCase()}
        />
        <div className="min-w-0 flex-1">
          <p className="bcc-mono text-safety">@{profile.handle}</p>
          <h1
            className="bcc-stencil mt-2 text-cardstock leading-[0.92]"
            style={{ fontSize: "clamp(2.25rem, 5.5vw, 4.5rem)" }}
          >
            {profile.display_name}
          </h1>
        </div>
      </div>

      {/* §J.6 reputation-first panel. Identity (avatar + handle +
          display name) sits above; this panel carries the trust
          headline. Empty-state copy renders when the §4.20
          attestation-layer fields haven't shipped from the backend
          yet — profile remains coherent during the Phase 1 rollout. */}
      <ReputationSummaryPanel
        reputationScore={profile.reputation_score ?? profile.trust_score}
        reliabilityStanding={profile.reliability_standing}
        cardTier={profile.card_tier}
        tierLabel={profile.tier_label}
        rankLabel={profile.rank_label}
        isInGoodStanding={profile.is_in_good_standing}
        flags={profile.flags}
        divergenceState={profile.negative_signals?.divergence_state}
        underReview={profile.negative_signals?.under_review}
        reputationVolatile={profile.negative_signals?.volatile}
        unresolvedClaimsCount={profile.negative_signals?.unresolved_claims_count}
      />

      {/* §J.6 trust-attestation action cluster — read-only scaffold.
          Cluster self-hides when no permission entries are shipped
          (Phase 1 backend rollout). Appears as backend lands the
          can_vouch / can_stand_behind / can_dispute / can_report
          gates in Phase 1 Week 2. Profile surfaces have no legacy
          equivalents to these primitives, so the cluster is purely
          additive here. */}
      <AttestationActionCluster
        targetKind="user_profile"
        targetId={profile.user_id}
        canVouch={profile.permissions.can_vouch}
        canStandBehind={profile.permissions.can_stand_behind}
        canDispute={profile.permissions.can_dispute}
        canReport={profile.permissions.can_report}
        viewerAttestation={profile.viewer_attestation}
      />

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-dashed border-cardstock/15 pt-4">
        <p className="bcc-mono text-cardstock-deep">
          JOINED {formatJoinDate(profile.joined_at)}
        </p>
        {isOwner && (
          <Link href="/settings/identity" className="bcc-btn bcc-btn-primary">
            Edit Profile
          </Link>
        )}
      </div>
    </div>
  );
}


function Avatar({ src, initial }: { src: string; initial: string }) {
  // Avatar shrinks on phones so the kicker + handle still fit beside
  // it on a 320–375px viewport. Desktop unchanged.
  const sizeClasses = "h-20 w-20 sm:h-28 sm:w-28";

  if (src === "") {
    return (
      <div
        aria-hidden
        className={`bcc-stencil flex ${sizeClasses} items-center justify-center border-2 border-cardstock/30 bg-cardstock-deep/30 text-5xl text-cardstock sm:text-6xl`}
      >
        {initial}
      </div>
    );
  }
  // Plain <img> — Next.js <Image> wants width/height + remotePatterns
  // config that's adjacent to the auth flow; staying with <img> until
  // we add remote-pattern entries for the WP avatar host.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={112}
      height={112}
      className={`${sizeClasses} border-2 border-cardstock/30 object-cover`}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// BioBlock — plain string bio. The §3.1 contract returns bio as a
// single sanitized string, so we render it once. The Phase-4 paper-
// sheet treatment with paragraphs + handwritten signature stays in
// MemberBio.tsx, ready for the rich endpoint.
// ──────────────────────────────────────────────────────────────────────

function BioBlock({ bio, signature }: { bio: string; signature: string }) {
  return (
    <article className="bcc-paper p-6 sm:p-8">
      <p
        className="max-w-full font-serif text-ink sm:max-w-[780px]"
        style={{ fontSize: "clamp(15px, 4vw, 17px)", lineHeight: 1.58 }}
      >
        {bio}
      </p>
      <footer className="mt-6 border-t border-dashed border-ink/25 pt-4">
        <span
          className="bcc-script text-ink"
          style={{ fontSize: "26px", lineHeight: 1 }}
        >
          ~ {signature}
        </span>
      </footer>
    </article>
  );
}

// ──────────────────────────────────────────────────────────────────────
// CountsStrip — six big stencil numbers from §3.1 counts. Watchers /
// watching / binder / reviews / disputes signed / solids received. The
// `followers` / `following` API field names are part of the §9
// contract — only the display labels changed (see lib/copy.ts).
// ──────────────────────────────────────────────────────────────────────

function CountsStrip({ counts }: { counts: MemberCounts }) {
  const cells: Array<{ label: string; value: number }> = [
    { label: FOLLOW_COPY.nounUpper,     value: counts.followers },
    { label: FOLLOW_COPY.watchingUpper, value: counts.following },
    { label: "BINDER",          value: counts.binder_size },
    { label: "REVIEWS WRITTEN", value: counts.reviews_written },
    { label: "DISPUTES SIGNED", value: counts.disputes_signed },
    { label: "SOLIDS RECEIVED", value: counts.solids_received },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
      {cells.map((cell) => (
        <div key={cell.label} className="bcc-panel px-2 py-3 text-center sm:px-4 sm:py-5">
          <p className="bcc-stencil text-3xl text-ink sm:text-4xl">{cell.value}</p>
          <p className="bcc-mono mt-1 text-[10px] text-ink-soft sm:text-[11px]">{cell.label}</p>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// LocalsStrip — pill list of the user's Local memberships. Primary
// Local gets a safety-orange ring so it stands out.
// ──────────────────────────────────────────────────────────────────────

function LocalsStrip({ locals }: { locals: MemberLocal[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {locals.map((local) => (
        <li key={local.id}>
          <Link
            href={`/locals/${local.slug}`}
            className={
              "bcc-mono inline-flex items-center gap-2 border px-3 py-2 text-cardstock transition hover:bg-cardstock-deep/20 " +
              (local.is_primary ? "border-safety" : "border-cardstock/25")
            }
          >
            {local.number !== null && (
              <span className="text-safety">№{local.number}</span>
            )}
            <span>{local.name.toUpperCase()}</span>
            {local.is_primary && (
              <span className="text-safety">· PRIMARY</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ──────────────────────────────────────────────────────────────────────
// WalletsStrip — verified wallet links. Own profile sees full address;
// others see address_short only (server enforces this — we just render
// whichever form arrived).
// ──────────────────────────────────────────────────────────────────────

function WalletsStrip({ wallets }: { wallets: MemberWallet[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {wallets.map((wallet) => (
        <li
          key={wallet.id}
          className="bcc-panel flex flex-wrap items-center justify-between gap-3 px-4 py-3"
        >
          <span className="bcc-mono text-ink">
            <span className="text-ink-soft">{wallet.chain_name.toUpperCase()}</span>
            <span className="ml-3 font-mono text-ink">
              {wallet.address ?? wallet.address_short}
            </span>
          </span>
          <span className="bcc-mono text-verified">
            ✓ VERIFIED
            {wallet.is_primary && (
              <span className="ml-2 text-weld">· PRIMARY</span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
