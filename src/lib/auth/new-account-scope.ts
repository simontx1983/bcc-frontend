"use client";

/**
 * The storage scope of the account a sign-up just signed in (F-332).
 *
 * Read from the session itself, not from a hook value captured before the
 * sign-in, so a hand-off written for onboarding (the pending recovery
 * email) is keyed to the NEW member. Any failure is "unknown" (null), and
 * unknown scopes store nothing.
 *
 * Shared by the two wallet sign-ups that hand an email to onboarding:
 * /login's WalletSignupPrompt and /signup (F-263 M23). Moved here from the
 * prompt so both use one reading.
 */

import { getSession } from "next-auth/react";

import { resolveViewerScope, type ViewerScope } from "@/lib/auth/viewer-scope";

export async function newAccountScope(): Promise<ViewerScope> {
  try {
    const session = await getSession();
    return resolveViewerScope(
      session !== null ? "authenticated" : "unauthenticated",
      session?.user?.id,
    );
  } catch {
    return null;
  }
}
