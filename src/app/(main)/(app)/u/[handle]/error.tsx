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
 * so the fresh tree can mount. A recovery that cannot re-attempt is the
 * same lie as a Retry on a 403 — see `LoadFailure`'s docblock.
 *
 * ## ⚠ This is NOT guaranteed to be a soft refresh
 *
 * `router.refresh()` is soft when the RSC transport is healthy. It is not
 * when it is not. Measured against a recording API stub with the RSC
 * transport aborted, pressing the control produced ONE HARD DOCUMENT
 * LOAD: a `window`-scoped sentinel, which has the same lifetime as React
 * state, was destroyed. `localStorage` (including `bcc.blog.draft.*`) and
 * `sessionStorage` survived, and no storage sweep ran.
 *
 * The realistic production trigger is build-id skew from a redeploy
 * mid-session, which on this repo happens on every merge to main.
 *
 * Nothing here may claim the refresh preserves drafts or in-memory work.
 * The control is therefore labelled a RELOAD and carries a warning the
 * viewer reads BEFORE pressing it, with the exit links beside it as the
 * option that costs nothing.
 *
 * ## Why re-entry is latched rather than the button disabled
 *
 * `useTransition`'s `isPending` marks the refresh in flight, but it does
 * not prevent a second press on its own: measured against a recording API
 * stub, three rapid presses of Retry produced FOUR upstream reads where
 * one press produces two. `isPending` only reads true once the transition
 * has been committed, so presses inside that window are still accepted —
 * the same propagation window `PagerNav` latches around. A ref, read and
 * written inside the one event, has no window.
 *
 * Disabling the button would fix that and introduce a worse bug — the
 * browser blurs a disabled element, so disabling the control the viewer
 * just pressed drops focus to `<body>`. That is the same defect
 * `PagerNav`'s chips had. So the button stays focusable and the handler
 * is inert while a refresh is already running.
 */

import * as Sentry from "@sentry/nextjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useTransition } from "react";

import { ProfileUnavailable } from "@/components/errors/ProfileUnavailable";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [isRetrying, startRetry] = useTransition();

  // One attempt per failure. Cleared when a NEW error arrives, which is
  // what makes a second attempt possible after a retry that also failed —
  // the clear is load-bearing, not hygiene.
  const attempted = useRef(false);
  useEffect(() => {
    attempted.current = false;
  }, [error]);

  useEffect(() => {
    // Same reporting posture as app/global-error.tsx — the detail goes to
    // Sentry, never to the page.
    Sentry.captureException(error);
  }, [error]);

  const retry = useCallback(() => {
    if (attempted.current) return;
    attempted.current = true;
    startRetry(() => {
      router.refresh();
      reset();
    });
  }, [startRetry, router, reset]);

  return (
    <ProfileUnavailable reason="temporary" onRetry={retry} isBusy={isRetrying} />
  );
}
