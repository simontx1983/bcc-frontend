/**
 * /watching — server-component shell wrapping the client <WatchingTabs>.
 *
 * Same auth-probe pattern as /onboarding: server-side `getServerSession`
 * with a 307 to /login on unauth. Avoids the loading-flash + bounce
 * a client-only check would produce.
 *
 * Only the user's `handle` crosses the RSC boundary — every other
 * concern (tab + page URL state, paginated queries, mutations) lives in
 * the client component. Same boundary discipline as <OnboardingWizard>
 * on /onboarding.
 *
 * The <Suspense> boundary is mandatory, not stylistic: <WatchingTabs>
 * reads `useSearchParams()`, which Next 15 refuses to prerender outside
 * one (build-time failure, not a runtime warning).
 *
 * Renamed from /binder 2026-05-13 per the §1.1.1 additive-deprecation
 * runway. /binder is now a 308-permanent redirect stub to this route.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { WatchingTabs } from "@/components/watching/WatchingTabs";
import { authOptions } from "@/lib/auth";

export default async function WatchingPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/watching");
  }

  return (
    <Suspense fallback={null}>
      <WatchingTabs handle={session.user.handle} />
    </Suspense>
  );
}
