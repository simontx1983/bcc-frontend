"use client";

/**
 * Profile-segment error boundary.
 *
 * Scoped to `/u/[handle]` rather than added higher up: a segment boundary
 * replaces only its own subtree, so the `(main)` chrome — nav, search,
 * sidebars — stays mounted and the viewer keeps every exit the app
 * normally gives them. `app/global-error.tsx`, which is where these
 * errors landed before, replaces the entire document.
 *
 * ## Why this boundary does not classify the error itself
 *
 * It cannot. For an error thrown during a server render, Next hands the
 * client boundary a generic Error with the message replaced and only
 * `digest` preserved — by design, so server internals do not reach the
 * browser. `err.status` is gone by the time this component runs.
 *
 * So classification happens where the status still exists: in
 * `page.tsx`, which owns the `BccApiError`. It maps 404 to `notFound()`,
 * renders the denied state directly for a 403, and rethrows the rest.
 * Everything that reaches HERE is therefore indeterminate by
 * construction, which is exactly the state where offering a retry is
 * honest.
 *
 * `notFound()` is unaffected: Next routes it to the nearest
 * `not-found.tsx` boundary, never to `error.tsx`.
 *
 * ## Why Retry is `router.refresh()` AND `reset()`, not `reset()` alone
 *
 * `reset()` re-renders this boundary's subtree from what the client
 * already has. The failure here happened during the SERVER render, so
 * there is no new server payload for that re-render to use and nothing
 * re-requests. Measured against a recording API stub, with `reset()`
 * alone: pressing Retry produced 0 new upstream reads and the error
 * state stayed on screen.
 *
 * `router.refresh()` is what re-runs the server render. Both are needed
 * and both go in one transition: refresh fetches, reset clears the error
 * so the fresh tree can mount. A Retry that cannot re-attempt is the
 * same lie as a Retry on a 403 — see `LoadFailure`'s docblock.
 */

import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/navigation";
import { startTransition, useCallback, useEffect } from "react";

import { ProfileUnavailable } from "@/components/errors/ProfileUnavailable";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    // Same reporting posture as app/global-error.tsx — the detail goes to
    // Sentry, never to the page.
    Sentry.captureException(error);
  }, [error]);

  const retry = useCallback(() => {
    startTransition(() => {
      router.refresh();
      reset();
    });
  }, [router, reset]);

  return <ProfileUnavailable reason="temporary" onRetry={retry} />;
}
