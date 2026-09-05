/**
 * /onboarding — server-component shell wrapping the wizard.
 *
 * Two server-side gates run before any HTML reaches the client:
 *
 *   1. Auth — `getServerSession()` redirects unauthenticated visitors
 *      to /login with a callbackUrl, no flash + bounce.
 *
 *   2. Onboarding-complete — fresh fetch of /me/onboarding/status with
 *      the session's BCC token. If the user has already finished the
 *      wizard, send them to the Floor (`/`). Always-fresh on purpose:
 *      a JWT-cached `onboarded` claim could go stale across tabs after
 *      completion, and the cost of one cheap GET per /onboarding visit
 *      is well worth the correctness.
 *
 * The wizard itself is a client component (state, mutations, React
 * Query hooks) — only serializable props (`handle`) cross the RSC
 * boundary.
 *
 * Failure mode: if the status check itself errors we no longer silently
 * render the whole wizard. Doing that told an already-onboarded visitor
 * their setup was incomplete — a claim the app could not support, since
 * the one source of truth had just failed to answer. We now render a
 * truthful, recoverable state instead (retry + a way to the Floor), and
 * touch no backend flag. See OnboardingStatusUnavailable below.
 */

import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isValidStep, OnboardingWizard, type Step } from "@/components/onboarding/OnboardingWizard";
import { getOnboardingStatusServerSide } from "@/lib/api/onboarding-endpoints";
import type { MemberProfile } from "@/lib/api/types";
import { getUser } from "@/lib/api/user-endpoints";
import { authOptions } from "@/lib/auth";
import { allowsDeveloperAffordances } from "@/lib/runtime-env";

export default async function OnboardingPage({
  searchParams,
}: {
  // Next 15: searchParams is async.
  searchParams: Promise<{ preview?: string; step?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/onboarding");
  }

  // Testing/preview escape hatch: `/onboarding?preview=1` skips the
  // "already onboarded → /" gate so the wizard can be viewed without
  // resetting the backend flag.
  //
  // It is NOT available in production. It shipped unrestricted, which meant
  // any real member could send themselves back through setup with a query
  // param — a correctness gate anyone could switch off from the URL bar.
  // `allowsDeveloperAffordances()` fails closed: an environment we cannot
  // positively identify as non-production does not get the bypass.
  const { preview, step: stepParam } = await searchParams;
  const previewMode = preview === "1" && allowsDeveloperAffordances();

  // Resume deep link (task 7) — `?step=<step>` from the home feed's
  // "resume setup?" prompt. Untrusted input, validated against the real
  // step union; anything else falls through to the normal "welcome" start.
  const initialStep: Step | undefined =
    stepParam !== undefined && isValidStep(stepParam) ? stepParam : undefined;

  // Fresh-read the onboarding flag.
  //
  // A failure here is NOT the same as "not onboarded". Treating it that way
  // showed a completed member the entire six-step wizard as though they were
  // brand new — the app asserting something it had just failed to check.
  // Preview mode is the one exception: it exists precisely to see the wizard
  // regardless of flag state, so an unreadable flag doesn't block it.
  let isOnboarded = false;
  let statusUnavailable = false;
  try {
    const status = await getOnboardingStatusServerSide(session.bccToken);
    isOnboarded = status.onboarded;
  } catch {
    statusUnavailable = true;
  }

  if (statusUnavailable && !previewMode) {
    return <OnboardingStatusUnavailable />;
  }

  if (isOnboarded && !previewMode) {
    redirect("/");
  }

  // Seed the identity step's avatar/cover/bio from the own-profile
  // view-model (same reader settings/layout.tsx uses). Non-fatal: on
  // failure fall back to a minimal shell so the wizard still renders.
  let profile;
  try {
    profile = await getUser(session.user.handle, session.bccToken);
  } catch {
    profile = null;
  }

  return (
    <OnboardingWizard
      handle={session.user.handle}
      profile={profile ?? placeholderProfile(session.user.handle)}
      {...(initialStep !== undefined ? { initialStep } : {})}
    />
  );
}

/**
 * Shown when `/me/onboarding/status` could not be read.
 *
 * Deliberately says only what is true: we could not check, not "your setup
 * is incomplete". It offers a retry (a plain link back to this route — a
 * server component has no client state to reset, so a re-request IS the
 * retry) and an unconditional way to the Floor, because the visitor may
 * well be fully onboarded and must not be held here.
 *
 * No backend flag is touched, and nothing is assumed about completion.
 */
function OnboardingStatusUnavailable() {
  return (
    <div className="bcc-onb-root">
      <main className="bcc-onb-wrap">
        <section className="bcc-onb-step" style={{ maxWidth: "36rem" }}>
          <div className="bcc-onb-panel">
            <h1 className="bcc-onb-disp" style={{ fontSize: "1.8rem" }}>
              Couldn&apos;t check your setup
            </h1>
            <p role="alert" className="bcc-onb-lede" style={{ marginTop: "10px", fontSize: "1rem" }}>
              We couldn&rsquo;t reach your account just now, so we don&rsquo;t know
              whether setup is finished. Nothing has changed on your account.
            </p>
            <div className="bcc-onb-foot" style={{ marginTop: "20px" }}>
              <Link href="/onboarding" className="bcc-onb-btn bcc-onb-btn-primary">
                Try again
              </Link>
              <Link href="/" className="bcc-onb-link">
                Go to the Floor →
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/**
 * Minimal MemberProfile shell used only when the seed fetch fails — the
 * identity step reads just handle / display_name / avatar_url /
 * cover_photo_url / cover_photo_position / bio, so those are the fields
 * that matter; the rest are typed placeholders never rendered in the
 * wizard. The cast is deliberate (a full MemberProfile literal here would
 * be dozens of never-read fields); the identity step's field access is
 * the only contract that matters and is covered above.
 */
function placeholderProfile(handle: string): MemberProfile {
  return {
    handle,
    display_name: handle,
    avatar_url: "",
    cover_photo_url: null,
    cover_photo_position: { x: 50, y: 50 },
    bio: "",
  } as MemberProfile;
}
