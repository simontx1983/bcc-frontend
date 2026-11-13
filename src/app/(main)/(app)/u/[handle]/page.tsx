/**
 * /u/[handle] — member profile route.
 *
 * Server component. Fetches GET /bcc/v1/users/:handle (§3.1) on every
 * navigation and renders the available fields. The contract today
 * returns the FLAT shape: identity (handle, display_name, avatar,
 * joined_at, reputation_tier_label, rank_label, is_in_good_standing, flags), bio
 * as plain string, halls/wallets, counts, plus the own-only blocks
 * (living, progression, capabilities, ux_helpers) when is_self.
 *
 * Auth: a null token is fine — the server returns a public view-model
 * for anonymous reads. When a session exists we forward the bearer so
 * own-only blocks resolve (§3.1).
 *
 * Read failures are split three ways, because they are three different
 * things to the viewer:
 *
 *   404 `bcc_not_found`         -> Next's `notFound()` (unchanged)
 *   403 `bcc_forbidden` + reason `profile_private`
 *                               -> the calm private state, NO retry (v1.91)
 *   any other 403               -> the denied state, rendered here, NO retry
 *   anything else               -> rethrow to `error.tsx` in this segment,
 *                                  which offers a retry
 *
 * The split lives here and not in the boundary because Next replaces a
 * server error's message and status before `error.tsx` receives it, so
 * this is the last point at which the three are distinguishable.
 *
 * Layout: a top "FILE 0001" rail + a 2-column hero (identity left,
 * live shift right), then numbered section frames (FILE 02 BIO, 03
 * THE NUMBERS, 04 HALLS, 05 WALLETS, 06 ON FILE) for vertical rhythm
 * matching the SiteHeader rail vocabulary.
 *
 * Phase-4 surfaces — the rich profile (hero card, stats strip, shift-
 * log grid, reviews/disputes tabs with counts) is scaffolded under
 * @/components/profile but not wired here. Those components depend
 * on a richer view-model (Phase4MemberProfile) that no endpoint
 * returns yet. Wire them when the contract amends per §9; today this
 * page renders only what §3.1 actually ships.
 */

import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import type { Route } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { ProfileUnavailable } from "@/components/errors/ProfileUnavailable";

import { FileRail } from "@/components/layout/FileRail";
import { AttestationActionCluster } from "@/components/profile/AttestationActionCluster";
import { BlockToggle } from "@/components/profile/BlockToggle";
import { ProfileMessageButton } from "@/components/profile/ProfileMessageButton";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { TrustHeader } from "@/components/profile/TrustHeader";
import { ReviewCallout } from "@/components/review/ReviewCallout";
import { TourAutoStart } from "@/components/tour/TourAutoStart";
import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { isProfilePrivate } from "@/lib/api/errors";
import { getMeReliability } from "@/lib/api/me-reliability-endpoints";
import { getUser } from "@/lib/api/user-endpoints";
import {
  getAttestationRosterAnon,
  PROFILE_ROSTER_PARAMS,
} from "@/lib/api/attestations-endpoints";
import type { RosterSeed } from "@/hooks/useAttestationRoster";
import { appOrigin } from "@/lib/app-origin";
import { canonicalProfilePath, type ProfileSearchParams } from "@/lib/seo/canonical-profile-path";
import { isIndexableEnvironment, isIndexableProfile } from "@/lib/seo/indexing";
import { buildPersonGraph, serializeJsonLd } from "@/lib/seo/person-jsonld";
import { ANON_SSR_REVALIDATE_SECONDS } from "@/lib/api/cache-policy";
import { formatJoinDate, presentationName } from "@/lib/format";
import { isAllowed, unlockHint } from "@/lib/permissions";
import {
  BccApiError,
  type MemberProfile,
  type MeReliabilityResponse,
} from "@/lib/api/types";

interface PageProps {
  params: Promise<{ handle: string }>;
  searchParams?: Promise<ProfileSearchParams>;
}

/**
 * generateMetadata — Open Graph / Twitter-card tags so a pasted
 * /u/[handle] link renders a rich preview on social platforms.
 *
 * Profiles are PUBLIC (anon-viewable), so we fetch with a null token —
 * the §3.1 endpoint returns the public view-model for anonymous reads.
 * Metadata generation runs without a session, so there is no token to
 * forward anyway; the anon path is exactly what a social crawler sees.
 *
 * Unknown handle → minimal "Profile not found" metadata rather than a
 * throw (a throw here would surface as a 500 in the <head> render path).
 *
 * og:image / twitter:image are NOT set here. The sibling
 * `opengraph-image.tsx` (+ `twitter-image.tsx`) file-convention route
 * generates a branded operator-file card and Next auto-emits the image
 * tags pointing at it. Setting `openGraph.images` here too would emit a
 * duplicate (and worse: the old avatar SVG, which crawlers can't render
 * as a card). We keep only title/description/canonical/card-type.
 *
 * URLs are emitted relative ("/u/handle") and resolved to absolute by the
 * root layout's `metadataBase`, which OG requires.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { handle } = await params;

  let profile: MemberProfile;
  try {
    // Always anon here (metadata has no session) → safe to Data-Cache.
    profile = await getUser(handle, null, {
      revalidate: ANON_SSR_REVALIDATE_SECONDS,
    });
  } catch (err) {
    // 404 or any transient failure → safe minimal head. Don't throw.
    // A private profile says so rather than claiming it was not found.
    return {
      title: isProfilePrivate(err)
        ? "Private profile · Blue Collar Crypto"
        : "Profile not found · Blue Collar Crypto",
    };
  }

  const name = presentationName(profile);
  const handleSuffix = profile.handle.includes("@")
    ? ""
    : ` (@${profile.handle})`;
  const title = `${name}${handleSuffix}`;

  const bio = profile.bio.trim();
  const description =
    bio !== ""
      ? bio
      : `${name} on the Floor — trust, identity, and reputation for crypto operators.`;

  const canonical = `/u/${encodeURIComponent(profile.handle)}`;

  // No image entries — the opengraph-image.tsx / twitter-image.tsx
  // convention routes generate the branded card and Next emits the
  // og:image / twitter:image tags automatically. The generated card is a
  // wide 1200×630 PNG, so the twitter card type is summary_large_image.

  // Two independent reasons to stay out of the index, both fail-closed.
  //
  // The environment gate keeps staging, previews and local out. The profile
  // gate keeps moderated accounts out, and reads ONLY the explicit moderation
  // flags — never is_in_good_standing, which is derived from reputation tier
  // and would de-index legitimate new members for being new.
  //
  // The reason is never stated in the markup: that a profile is under review
  // is not public information.
  const indexable =
    isIndexableEnvironment() && isIndexableProfile(profile.flags);

  return {
    title,
    description,
    alternates: { canonical },
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
    openGraph: {
      title,
      description,
      url: canonical,
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function MemberProfilePage({ params, searchParams }: PageProps) {
  const { handle } = await params;

  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  let profile: MemberProfile;
  try {
    // Anon visitors (token === null) share a 60s Data-Cache entry for the
    // public view-model; authed reads stay uncached (personalized).
    profile = await getUser(
      handle,
      token,
      token === null ? { revalidate: ANON_SSR_REVALIDATE_SECONDS } : undefined,
    );
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    // A 403 is a DECISION, not an outage, and it is the only other status
    // this route documents (`bcc_permission_denied`, contract §4.4). It is
    // classified here rather than in `error.tsx` because Next strips a
    // server error's message and status before the client boundary sees
    // it — so this is the last place the difference is still knowable.
    //
    // Rendering instead of throwing is what keeps the distinction alive in
    // production: the denied state gets no retry control, because a 403
    // cannot be retried into a 200.
    //
    // The owner's privacy is checked FIRST, server-side and here: both are
    // 403s, but `bcc_forbidden` + `profile_private` is the owner's choice
    // and reads as a calm "this profile is private", while
    // `bcc_permission_denied` (the viewer's own standing) stays "denied".
    if (isProfilePrivate(err)) {
      return <ProfileUnavailable reason="private" />;
    }
    if (err instanceof BccApiError && err.status === 403) {
      return <ProfileUnavailable reason="denied" />;
    }
    // Anything else — 5xx, a transport failure, a status we have no
    // reading of — goes to the segment boundary, which offers a retry.
    throw err;
  }

  // A retired handle (or member-{id}) resolved to this member: 308 to the
  // current handle, query kept. Outside the try — permanentRedirect throws
  // by design, and that throw must not be read as a fetch failure.
  const canonicalPath = canonicalProfilePath(
    handle,
    profile.handle,
    searchParams !== undefined ? await searchParams : {},
  );
  if (canonicalPath !== null) {
    permanentRedirect(canonicalPath as Route);
  }

  const isOwner =
    session !== null && session.user.handle === profile.handle;

  // Owner "edit" affordances open the profile-editor TAB on this same
  // page. Built from the viewed handle rather than /u/me so the owner
  // doesn't take a redirect hop back to the profile they're already on.
  const profileEditHref = `/u/${encodeURIComponent(profile.handle)}?tab=profile` as Route;
  const aboutHref = `/u/${encodeURIComponent(profile.handle)}/about` as Route;

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

  // Crawlable default public tab.
  //
  // Visitors used to land on Supporters; since dev note 31 every viewer
  // lands on Activity, but `?tab=backing` deep links still open it, so the
  // first page is read here and seeds React Query.
  //
  // ANONYMOUS ONLY, two reasons. The read itself is token-less so the shared
  // 60s Data-Cache entry can be served to everyone without leaking one
  // viewer response to another; and we only hand it to viewers who are
  // themselves anonymous, so nobody is shown a cache-shared payload in place
  // of their own. Authed viewers keep the existing client fetch.
  //
  // Failure is non-fatal by design: the roster is decoration on a page whose
  // subject is the operator. A roster outage must not 500 the profile, so the
  // seed simply stays undefined and the panel fetches as it always did.
  let rosterSeed: RosterSeed | undefined;
  if (session === null) {
    try {
      const fetchedAt = Date.now();
      const data = await getAttestationRosterAnon(
        "user_profile",
        profile.user_id,
        PROFILE_ROSTER_PARAMS,
        ANON_SSR_REVALIDATE_SECONDS,
      );
      // The real read time, not now: initialData alone would restart the
      // hook 30s staleTime on the client and let a cached-60s payload look
      // permanently fresh.
      rosterSeed = { data, updatedAt: fetchedAt };
    } catch {
      rosterSeed = undefined;
    }
  }

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
    profile.halls.length === 0 &&
    profile.wallets.length === 0 &&
    profile.bio.trim() === "";

  // Structured data, gated by the SAME two conditions as the robots tag —
  // emitting a Person graph for a hidden or suspended profile would hand a
  // crawler exactly what the noindex is there to withhold.
  const canonicalUrl = new URL(
    `/u/${encodeURIComponent(profile.handle)}`,
    appOrigin(),
  ).toString();
  const jsonLd =
    isIndexableEnvironment() && isIndexableProfile(profile.flags)
      ? serializeJsonLd(
          buildPersonGraph({
            name: title,
            handle: profile.handle,
            bio: profile.bio,
            canonicalUrl,
            ...(profile.avatar_url !== null && profile.avatar_url !== undefined
              ? { imageUrl: new URL(profile.avatar_url, appOrigin()).toString() }
              : {}),
          }),
        )
      : null;

  return (
    <main className="pb-24">
      {jsonLd !== null && (
        // Pre-escaped by serializeJsonLd: every <, >, & and line separator
        // is already a \uXXXX sequence, so no literal closing script tag
        // can survive from a display name or bio.
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      )}
      {/* JOINED rides the rail as reference data, not as a neighbour to
          a column-exit CTA — per the 2026-05-14 UX review. */}
      <FileRail
        kind="OPERATOR"
        subject={`@${profile.handle.toUpperCase()}`}
        isOwner={isOwner}
        joinedLabel={formatJoinDate(profile.joined_at)}
      />

      {/* First-visit tour of your own profile (owner only). */}
      {isOwner && <TourAutoStart tourId="profile" />}
      {/* Figma Handoff v1 (dev notes 22–35): the trust header replaces the
          old stencil title + trading-card hero. It is trust-only — no
          follower counts (note 22), so CountsStrip and CardFactory are gone
          from this page. A viewer who already watches this member gets the
          compact variant (note 28); the server says so, it is never derived. */}
      <header
        className="mx-auto mt-8 max-w-[640px] px-4 sm:px-7"
        data-bcc-tour="profile.header"
      >
        <TrustHeader
          profile={profile}
          isOwner={isOwner}
          viewerAuthed={session !== null}
          variant={profile.viewer_is_watching === true ? "compact" : "full"}
        />
        {titleFallbackUsed && profile.display_name.trim() !== "" && (
          <p
            className="bcc-mono mt-2 text-bcc-text-secondary"
            style={{ fontSize: "10px", letterSpacing: "0.18em" }}
          >
            LISTED AS {profile.display_name}
          </p>
        )}
        {/* Note 36 (supersedes note 26): no expand-in-place bio here — the
            bio lives on the About page. */}
        <Link
          href={aboutHref}
          className="bcc-mono mt-3 inline-flex min-h-[44px] items-center text-[11px] uppercase tracking-[0.18em] text-bcc-text underline decoration-[var(--bcc-accent-indicator)] underline-offset-4"
        >
          More about {title} →
        </Link>
        {/* Slot: public-cb RecoveryEmailNudge (owner only) — the component
            is not on main yet. Note 23's vouched-by line is TrustHeader's
            concern and waits on the F-340 fields. */}
        {isOwner ? (
          <div className="mt-2">
            <Link
              href={profileEditHref}
              className="bcc-mono inline-flex min-h-[44px] items-center text-[11px] uppercase tracking-[0.18em] text-bcc-text underline decoration-[var(--bcc-accent-indicator)] underline-offset-4"
            >
              Edit profile
            </Link>
          </div>
        ) : (
          // Secondary actions the trust header does not cover. TrustHeader
          // already renders Watch + Vouch, so the cluster gets only the
          // stand-behind and report permissions here.
          <div className="mt-3 flex flex-col gap-3 border-t border-dashed border-bcc-border pt-3">
            <AttestationActionCluster
              targetKind="user_profile"
              targetId={profile.user_id}
              canStandBehind={profile.permissions.can_stand_behind}
              canReport={profile.permissions.can_report}
              viewerAttestation={profile.viewer_attestation}
            />
            {/* v1.49 — direct person-review via the shared ReviewCallout,
                fed from the member card's server-resolved gates. */}
            {session !== null && (
              <ReviewCallout
                target={{
                  kind: "member",
                  userId: profile.user_id,
                  removePageId: profile.card.review_target_id,
                }}
                pageName={title}
                canReview={isAllowed(profile.card.permissions, "can_review")}
                unlockHint={unlockHint(profile.card.permissions, "can_review")}
                hasReviewed={profile.card.viewer_has_reviewed}
                viewerAuthed
              />
            )}
            {/* Message — moved off the retired member card. Signed-in
                visitors only (as before); server can_message gates it. */}
            {session !== null && (
              <ProfileMessageButton
                permissions={profile.permissions}
                // card.id, exactly what the card's MessagePill received.
                recipientId={profile.card.id}
                recipientName={title}
              />
            )}
            {/* §K1 block control — self-hides via permissions.can_block. */}
            <BlockToggle profile={profile} />
          </div>
        )}
      </header>

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
              className="bcc-mono text-bcc-text-secondary"
              style={{ fontSize: "10px", letterSpacing: "0.24em" }}
            >
              JOINED {formatJoinDate(profile.joined_at)} · {joinedAgeDays}D AGO
            </p>
            <h2 className="bcc-stencil mt-3 text-2xl text-bcc-text">
              Early days for this operator.
            </h2>
            <p
              className="font-serif italic text-bcc-text-secondary mt-2"
              style={{ fontSize: "15px", lineHeight: 1.55, maxWidth: "60ch" }}
            >
              No supporters, no Halls linked, no wallets on file yet — the
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
              receivedCount={profile.counts.reviews_received}
              writtenCount={profile.counts.reviews_written}
              {...(rosterSeed !== undefined ? { rosterSeed } : {})}
              // Owner-only Account tab needs the signed-in address for the
              // change-email form. Forwarded only to the owner.
              viewerEmail={
                isOwner && typeof session?.user.email === "string"
                  ? session.user.email
                  : ""
              }
            />
          </section>

          {/* FILE 05 // HALLS removed per the 2026-05-14
              reorganization — halls already render inside the
              GroupsPanel (type === "hall" rows), so a separate
              section was redundant.

              FILE 06 // WALLETS moved into the "My Profile" tab, which is
              now the owner's real profile EDITOR (ProfileEditPanel) and is
              owner-only — so wallets are no longer surfaced to visitors
              here. Linked-wallet management lives on the owner's Account
              tab (?tab=account). If verified wallets should be a PUBLIC
              trust signal they need a real public surface; the old
              read-only panel was never one. */}
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
        <span className="bcc-mono text-bcc-text-secondary">FILE {fileNumber}</span>
        <span className="bcc-mono text-bcc-text-safety">{"//"} {label}</span>
        <span aria-hidden className="h-px flex-1 bg-bcc-border" />
        {action !== undefined && action !== null && (
          <span className="shrink-0">{action}</span>
        )}
      </div>
      {children}
    </section>
  );
}


// HallsStrip removed — halls now render inside GroupsPanel
// (rows with type === "hall"), so the standalone strip was redundant
// after the FILE 05 SectionFrame deletion.
//
// WalletsStrip + WalletRow moved to the "My Profile" tab and were
// removed along with the read-only ProfilePanel shadow UI. That tab is
// now ProfileEditPanel (the owner's real editor); linked-wallet
// management lives on /settings/account until it migrates to an owner
// tab of its own.
