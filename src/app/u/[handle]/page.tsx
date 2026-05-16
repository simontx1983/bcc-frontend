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
import type { Route } from "next";
import { notFound } from "next/navigation";

import { CardFactory } from "@/components/cards/CardFactory";
import { BioBox } from "@/components/layout/BioBox";
import { PageHero } from "@/components/layout/PageHero";
import { AttestationActionCluster } from "@/components/profile/AttestationActionCluster";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { authOptions } from "@/lib/auth";
import { getMeReliability } from "@/lib/api/me-reliability-endpoints";
import { getUser } from "@/lib/api/user-endpoints";
import { FOLLOW_COPY } from "@/lib/copy";
import { formatJoinDate, presentationName } from "@/lib/format";
import {
  BccApiError,
  type MemberCounts,
  type MemberProfile,
  type MeReliabilityResponse,
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

  // PR-11b — Setup tab RELIABILITY sub-tab embeds the §J.5 self-mirror.
  // Fetch is owner-only (the endpoint is Bearer-authed and refuses
  // third-party reads). Fire-and-forget on failure: a partial outage
  // shouldn't break the profile page — the sub-tab falls back to a
  // soft "unavailable" state with a link to the standalone route.
  let reliability: MeReliabilityResponse | undefined;
  if (isOwner && session !== null) {
    try {
      reliability = await getMeReliability(session.bccToken);
    } catch {
      reliability = undefined;
    }
  }

  // Email-shaped handles (PeepSo default before the operator picks a
  // real one) read as broken UI when rendered with the `@` kicker —
  // suppress until they pick a handle. Same rule the card uses now.
  const showHandleKicker = !profile.handle.includes("@");

  // §J page title — centralized in presentationName() so email-shaped
  // display_name fields fall through to handle uppercased rather than
  // rendering "BLUECOLLARCRYPTOLEARNING@GMAIL.COM" at 5.5rem stencil.
  const title = presentationName(profile);
  // When display_name was rejected by presentationName (email-shaped /
  // too long), surface the literal field as a small audit caption so a
  // viewer can still see what the server returned.
  const titleFallbackUsed = title !== profile.display_name.trim();

  // Cold-operator detection — visitors landing on a fresh-account
  // profile see five empty SectionFrames stacked. We collapse them
  // into a single "JUST CLOCKED IN" frame for low-reputation accounts
  // joined within 14 days. The visible UI honestly says "this operator
  // is new" rather than reading as five abandoned filing cabinets.
  // Owners never see the collapsed view (their own surfaces stay
  // expandable so they can pick the action next).
  const repScore = profile.reputation_score ?? profile.trust_score;
  const joinedMs = Date.parse(profile.joined_at);
  const joinedAgeDays = Number.isFinite(joinedMs)
    ? Math.floor((Date.now() - joinedMs) / 86_400_000)
    : 999;
  const isColdOperator =
    !isOwner &&
    repScore < 10 &&
    joinedAgeDays < 14 &&
    profile.locals.length === 0 &&
    profile.wallets.length === 0 &&
    profile.bio.trim() === "";

  return (
    <main className="pb-24">
      <FileRail
        handle={profile.handle}
        isOwner={isOwner}
        joinedLabel={formatJoinDate(profile.joined_at)}
      />

      {/* §J page title — large stencil display name above the hero.
          The trading card carries identity inside its nameplate strip,
          but a 12px line inside a 316px tile is not a page title. The
          big name here answers "whose page am I on?" without making
          the viewer parse the card. Suppress the handle line when the
          handle is email-shaped (default PeepSo before claim). */}
      <header className="mx-auto mt-12 max-w-[1440px] px-4 sm:px-7">
        <h1
          className="bcc-stencil text-cardstock leading-[0.92]"
          style={{ fontSize: "clamp(1.75rem, 5.5vw, 4.5rem)", wordBreak: "break-word" }}
        >
          {title}
        </h1>
        {showHandleKicker && (
          <p
            className="bcc-mono mt-3 text-safety"
            style={{ fontSize: "11px", letterSpacing: "0.18em" }}
          >
            @{profile.handle}
          </p>
        )}
        {titleFallbackUsed && profile.display_name.trim() !== "" && (
          <p
            className="bcc-mono mt-2 text-cardstock-deep/60"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            LISTED AS {profile.display_name}
          </p>
        )}
      </header>

      {/* HERO — unified PageHero shape: directory-style card on the left,
          attestation action cluster on the right (both in the dotted box).
          Mirrored on /v, /c, /p, /communities/[slug] so the same shape
          reads as one product. */}
      <section className="mt-8">
        <PageHero
          card={
            <CardFactory
              card={profile.card}
              hideOpenAction
              canEditAvatar={isOwner}
            />
          }
          belowHero={
            <div>
              {/* FILE 04 // THE NUMBERS — full-width row inside the
                  dotted box, below the card+actions split. CountsStrip
                  grid-cols-6 spreads across the whole hero width. */}
              <div className="mb-3 flex items-center gap-3">
                <span className="bcc-mono text-cardstock-deep">FILE 04</span>
                <span className="bcc-mono text-safety">{"//"} THE NUMBERS</span>
              </div>
              <CountsStrip counts={profile.counts} />
            </div>
          }
          actions={
            <>
              {/* Reputation panel — framed cell making the score the
                  visual headline of the right column (per the 2026-05-13
                  UX review). REPUTATION kicker + stencil 4xl value +
                  standing/rank chips stacked under. Left-aligned on
                  mobile (where the eye lands), right-aligned at sm+
                  where it pairs visually with the card on the left. */}
              {/* Reputation panel — framed cell anchoring the score as
                  the right column's headline. Center-aligned per the
                  2026-05-14 layout request: REPUTATION kicker + stencil
                  score + standing/rank chips all centered horizontally
                  inside the cell at every breakpoint. */}
              <div className="border border-cardstock-edge/60 bg-cardstock-deep/30 p-4">
                <div className="flex flex-col items-center gap-3 sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-center sm:gap-x-4 sm:gap-y-2">
                  <div className="flex flex-col items-center">
                    <span
                      className="bcc-mono text-cardstock-deep"
                      style={{ fontSize: "10px", letterSpacing: "0.24em" }}
                    >
                      REPUTATION
                    </span>
                    <span className="bcc-stencil mt-1 text-4xl leading-none text-cardstock">
                      {profile.reputation_score ?? profile.trust_score}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {profile.is_in_good_standing && (
                      <span
                        className="bcc-mono border border-verified/60 bg-verified/10 px-2 py-1 text-verified"
                        style={{ fontSize: "10px", letterSpacing: "0.18em" }}
                      >
                        GOOD STANDING
                      </span>
                    )}
                    {profile.rank_label !== "" && (
                      <span
                        className="bcc-mono border border-cardstock-edge/60 px-2 py-1 text-cardstock"
                        style={{ fontSize: "10px", letterSpacing: "0.18em" }}
                      >
                        {profile.rank_label.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <AttestationActionCluster
                targetKind="user_profile"
                targetId={profile.user_id}
                canVouch={profile.permissions.can_vouch}
                canStandBehind={profile.permissions.can_stand_behind}
                canDispute={profile.permissions.can_dispute}
                canReport={profile.permissions.can_report}
                viewerAttestation={profile.viewer_attestation}
              />
              <BioBox
                text={profile.bio}
                label="BIO"
                {...(isOwner
                  ? { ownerEditHref: "/settings/identity" as Route }
                  : {})}
              />
              {/* Edit Profile — owner-only column exit. JOINED metadata
                  moved up to FileRail per the 2026-05-14 UX review so
                  the column exits cleanly at BIO with just the CTA
                  for owners. */}
              {isOwner && (
                <div className="flex justify-end border-t border-dashed border-cardstock/15 pt-4">
                  <Link
                    href="/settings/identity"
                    className="bcc-btn bcc-btn-primary"
                  >
                    Edit Profile
                  </Link>
                </div>
              )}
            </>
          }
        />
      </section>

      {/* Sections previously sitting above the tab strip have moved
          INSIDE tabs per the 2026-05-14 reorganization:
            - FILE 00 // GETTING STARTED → owner-only "Setup" tab
              (SetupPanel)
            - FILE 0A // LIVE SHIFT → top of the "Activity" panel for
              own-profile (ActivityPanel renders LivingHeader when
              passed living + progression)
            - FILE 02 // BACKING → "Backing" tab (BackingPanel wraps
              the same AttestationRoster)
          The above-tabs region is now hero-only — identity, card,
          reputation chips. */}

      {/* FILE NEW // JUST CLOCKED IN — cold-operator collapsed frame.
          For visitors viewing a brand-new operator (low rep, joined
          recently, no data anywhere) we replace FILE 02 / 05 / 06
          with a single honest "this operator is new" stamp. Owners
          never see this collapse — their fresh-account view still
          renders all sections so they can pick what to fill in next. */}
      {isColdOperator && (
        <SectionFrame fileNumber="NEW" label="JUST CLOCKED IN">
          <div className="bcc-panel px-5 py-6">
            <p
              className="bcc-mono text-cardstock-deep"
              style={{ fontSize: "10px", letterSpacing: "0.24em" }}
            >
              JOINED {formatJoinDate(profile.joined_at)} · {joinedAgeDays}D AGO
            </p>
            <h2 className="bcc-stencil mt-3 text-2xl text-ink">
              Early days for this operator.
            </h2>
            <p
              className="font-serif italic text-ink-soft mt-2"
              style={{ fontSize: "15px", lineHeight: 1.55, maxWidth: "60ch" }}
            >
              No backing, no Locals linked, no wallets on file yet — the
              floor will fill in as they participate. Check back when
              they&apos;ve clocked a few shifts.
            </p>
          </div>
        </SectionFrame>
      )}

      {!isColdOperator && (
        <>
          {/* Tab strip — Backing / Reviews / Activity / Watching /
              Photos / Disputes / Groups / (Setup for owner) + Blog
              link. The previously-above-tabs FILE sections (BACKING,
              GETTING STARTED, LIVE SHIFT) now live inside the
              corresponding tabs per the 2026-05-14 reorganization. */}
          <section className="mx-auto mt-16 max-w-[1440px] px-4 sm:px-7">
            <ProfileTabs
              handle={profile.handle}
              displayName={profile.display_name}
              isOwner={isOwner}
              targetUserId={profile.user_id}
              reputationScore={
                profile.reputation_score ?? profile.trust_score
              }
              {...(profile.living !== undefined
                ? { living: profile.living }
                : {})}
              {...(profile.progression !== undefined
                ? { progression: profile.progression }
                : {})}
              profile={profile}
              {...(reliability !== undefined ? { reliability } : {})}
              isSignedIn={session !== null}
              viewerHandle={session?.user.handle ?? null}
            />
          </section>

          {/* FILE 05 // LOCALS removed per the 2026-05-14
              reorganization — local groups already render inside the
              GroupsPanel (type === "local" rows), so a separate
              section was redundant.

              FILE 06 // WALLETS moved into the new "My Profile" tab
              (ProfilePanel) — first tab in the strip. The owner's
              "+ ADD WALLET" affordance lives inside the panel header. */}
        </>
      )}
    </main>
  );
}

// GettingStartedChecklist moved to
// `@/components/profile/panels/SetupPanel` per the 2026-05-14
// reorganization — it now backs the owner-only "Setup" tab instead of
// the FILE 00 SectionFrame above the strip.

// ──────────────────────────────────────────────────────────────────────
// FileRail — top status strip, mirrors the SiteHeader rail vocabulary.
// Anchors the page in the "operator file" metaphor; everything below
// reads as numbered sections of that file.
// ──────────────────────────────────────────────────────────────────────

function FileRail({
  handle,
  isOwner,
  joinedLabel,
}: {
  handle: string;
  isOwner: boolean;
  /** Pre-formatted joined-date label (e.g. "MAY 2026"). Surfaced as
   *  rail metadata per the 2026-05-14 UX review — JOINED is reference
   *  data, not a column-exit CTA neighbor. */
  joinedLabel: string;
}) {
  return (
    <div className="border-b border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-7">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; OPERATOR</span>
          <span className="text-cardstock">@{handle.toUpperCase()}</span>
          {/* Owner viewpoint tag — quietly confirms "this is your public
              view." Cheap insurance against the "did this save?" anxiety
              when an owner lands on their own profile. */}
          {isOwner && (
            <span className="text-phosphor">&nbsp;·&nbsp;YOU</span>
          )}
        </span>
        <span className="bcc-mono inline-flex flex-wrap items-center gap-x-4 gap-y-1 text-cardstock/50">
          <span>JOINED&nbsp;{joinedLabel}</span>
          <span>FILE 0001&nbsp;//&nbsp;OPEN</span>
        </span>
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
  action,
  children,
}: {
  fileNumber: string;
  label: string;
  /** Optional owner-only affordance rendered at the right end of the
   *  kicker row ("+ ADD WALLET", "+ JOIN LOCAL"). Per the 2026-05-13
   *  UX review — section frames read as read-only without an entry
   *  point, so the kicker row is the natural slot for "add here." */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mx-auto mt-16 max-w-[1440px] px-4 sm:px-7">
      <div className="mb-7 flex items-center gap-4">
        <span className="bcc-mono text-cardstock-deep">FILE {fileNumber}</span>
        <span className="bcc-mono text-safety">{"//"} {label}</span>
        <span aria-hidden className="h-px flex-1 bg-cardstock/15" />
        {action !== undefined && action !== null && (
          <span className="shrink-0">{action}</span>
        )}
      </div>
      {children}
    </section>
  );
}


// ──────────────────────────────────────────────────────────────────────
// CountsStrip — six big stencil numbers from §3.1 counts. Watchers /
// watching / reviews / disputes signed / solids received. The
// `followers` / `following` API field names are part of the §9
// contract — only the display labels changed (see lib/copy.ts).
// ──────────────────────────────────────────────────────────────────────

function CountsStrip({ counts }: { counts: MemberCounts }) {
  // Grouped per the 2026-05-13 UX review: SOCIAL (reach) · LIBRARY
  // (watchlist) · TRUST OUTPUT (what they've done on the floor). Each
  // group gets a kicker label so the six numbers read as three
  // concepts rather than a flat row of equal stats.
  const groups: Array<{
    label: string;
    cells: Array<{ label: string; value: number }>;
  }> = [
    {
      label: "SOCIAL",
      cells: [
        { label: FOLLOW_COPY.nounUpper,     value: counts.followers },
        { label: FOLLOW_COPY.watchingUpper, value: counts.following },
      ],
    },
    {
      label: "LIBRARY",
      cells: [
        { label: "BLOG POSTS", value: counts.blog_posts_written },
      ],
    },
    {
      label: "TRUST OUTPUT",
      cells: [
        { label: "REVIEWS WRITTEN", value: counts.reviews_written },
        { label: "DISPUTES SIGNED", value: counts.disputes_signed },
        { label: "SOLIDS RECEIVED", value: counts.solids_received },
      ],
    },
  ];
  // 2/1/3 column proportions per the 2026-05-13 UX review — without
  // these the single LIBRARY cell would render 2-3× wider than peer
  // cells inside SOCIAL / TRUST OUTPUT, making BINDER read as
  // anomalously loud.
  return (
    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[2fr_1fr_3fr] lg:items-stretch lg:gap-6">
      {groups.map((group, idx) => (
        <div
          key={group.label}
          className={
            idx > 0
              ? "lg:border-l lg:border-dashed lg:border-cardstock/15 lg:pl-6"
              : ""
          }
        >
          <p
            className="bcc-mono mb-2 text-cardstock-deep"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            {group.label}
          </p>
          <div
            className="grid gap-2 sm:gap-3"
            style={{
              gridTemplateColumns: `repeat(${group.cells.length}, minmax(0, 1fr))`,
            }}
          >
            {group.cells.map((cell) => (
              <div
                key={cell.label}
                className="bcc-panel px-2 py-3 text-center sm:px-4 sm:py-5"
              >
                <p className="bcc-stencil text-3xl text-ink sm:text-4xl">
                  {cell.value}
                </p>
                <p className="bcc-mono mt-1 text-[10px] text-ink-soft sm:text-[11px]">
                  {cell.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// LocalsStrip removed — local groups now render inside GroupsPanel
// (rows with type === "local"), so the standalone strip was redundant
// after the FILE 05 SectionFrame deletion.
//
// WalletsStrip + WalletRow moved to
// `@/components/profile/panels/ProfilePanel` — they back the new "My
// Profile" tab (first in the strip) instead of the FILE 06
// SectionFrame.
