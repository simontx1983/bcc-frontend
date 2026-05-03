/**
 * /binder — server-component shell wrapping the client BinderGrid.
 *
 * Same auth-probe pattern as /onboarding: server-side `getServerSession`
 * with a 307 to /login on unauth. Avoids the loading-flash + bounce
 * a client-only check would produce.
 *
 * Only the user's `handle` crosses the RSC boundary — every other
 * concern (paginated query, mutations, optimistic state) lives in
 * the client component. Same boundary discipline as <OnboardingWizard>
 * on /onboarding.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { BinderGrid } from "@/components/binder/BinderGrid";
import { authOptions } from "@/lib/auth";

export default async function BinderPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/binder");
  }

  return <BinderGrid handle={session.user.handle} />;
}
