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

import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { getOnboardingStatusServerSide } from "@/lib/api/onboarding-endpoints";
import { authOptions } from "@/lib/auth";

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/onboarding");
  }

  // Fresh-read the onboarding flag. Failure is non-fatal — render the
  // wizard so the user isn't stranded; completing again is idempotent.
  let isOnboarded = false;
  try {
    const status = await getOnboardingStatusServerSide(session.bccToken);
    isOnboarded = status.onboarded;
  } catch {
    // Swallow; wizard renders.
  }

  if (isOnboarded) {
    redirect("/");
  }

  return <OnboardingWizard handle={session.user.handle} />;
}
