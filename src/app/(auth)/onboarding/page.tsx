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
 * Failure mode: if the status check itself errors, we render the
 * wizard anyway — repeated `complete` is idempotent, so an over-show
 * is the safe failure direction (vs. swallowing real errors and
 * trapping the user out of onboarding).
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { isValidStep, OnboardingWizard, type Step } from "@/components/onboarding/OnboardingWizard";
import { getOnboardingStatusServerSide } from "@/lib/api/onboarding-endpoints";
import type { MemberProfile } from "@/lib/api/types";
import { getUser } from "@/lib/api/user-endpoints";
import { authOptions } from "@/lib/auth";

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
  // resetting the backend flag. Completing again is idempotent, so this
  // is harmless to leave enabled.
  const { preview, step: stepParam } = await searchParams;
  const previewMode = preview === "1";

  // Resume deep link (task 7) — `?step=<step>` from the home feed's
  // "resume setup?" prompt. Untrusted input, validated against the real
  // step union; anything else falls through to the normal "welcome" start.
  const initialStep: Step | undefined =
    stepParam !== undefined && isValidStep(stepParam) ? stepParam : undefined;

  // Fresh-read the onboarding flag. Failure is non-fatal — render the
  // wizard so the user isn't stranded; completing again is idempotent.
  let isOnboarded = false;
  try {
    const status = await getOnboardingStatusServerSide(session.bccToken);
    isOnboarded = status.onboarded;
  } catch {
    // Swallow; wizard renders.
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
