"use client";

/**
 * ProfileUnavailable — the two in-chrome states a profile read can land
 * in once it is NOT a 404.
 *
 * ## Why this exists
 *
 * `/u/[handle]/page.tsx` maps a 404 to `notFound()` and rethrows
 * everything else. With no `error.tsx` anywhere in the `(main)` tree, a
 * rethrow fell through to `app/global-error.tsx`, which renders Next's
 * bare `NextError` page. Measured against a recording API stub, injecting
 * a failure on `GET /users/member1` and loading `/u/member1`:
 *
 *   injected 404  ->  the branded 404 page              (correct)
 *   injected 403  ->  "Application error: a client-side exception
 *                      has occurred"  — no chrome, no retry, no exit
 *   injected 500  ->  same
 *   injected 429  ->  same
 *
 * So three different failures all produced one dead end, outside the app
 * shell, with no way forward.
 *
 * ## The two states are NOT the same state
 *
 * A confirmed denial and a temporary outage need opposite affordances,
 * and `LoadFailure`'s own docblock already says why:
 *
 *   "A retry control that cannot succeed (403, 404) is a lie; those
 *    states belong in purpose-built UI with a real exit, not a Retry the
 *    user will press twice."
 *
 * This component is that purpose-built UI. `reason` decides, and
 * `"denied"` refuses a retry control even when a caller passes one —
 * enforced here rather than left to each call site, because the whole
 * point is that no future caller can offer a retry that cannot work.
 *
 * ## What it must never say, and never show
 *
 * - Not "this member doesn't exist". A read that failed tells us nothing
 *   about whether the subject exists; only a 404 does, and that goes to
 *   `notFound()` instead of here.
 * - Not WHY access was denied. The backend's 403 message for this route
 *   is about a moderation state on someone else's account ("Account
 *   suspended."), which is not the viewer's business. No server message
 *   is rendered in either state — the copy is fixed and local.
 */

import Link from "next/link";
import type { Route } from "next";

import { LoadFailure } from "@/components/ui/LoadFailure";

/**
 * `denied` — the server answered, and the answer was "no". Terminal.
 * `temporary` — the read did not complete, or completed with a status we
 * cannot interpret as a decision. Retrying may work.
 */
export type ProfileUnavailableReason = "denied" | "temporary";

const COPY: Record<ProfileUnavailableReason, string> = {
  // Deliberately without "right now" / "shortly": those words promise a
  // later success this state cannot deliver. Says nothing about whether
  // the profile exists.
  denied: "This profile isn't available to you.",
  // The house phrasing for a recoverable read, matching the watchlist,
  // inbox and notifications panels verbatim in shape.
  temporary: "This profile is temporarily unavailable. Try again shortly.",
};

export function ProfileUnavailable({
  reason,
  onRetry,
}: {
  reason: ProfileUnavailableReason;
  /**
   * Only honoured for `reason="temporary"`. Passing it with `"denied"`
   * is ignored on purpose — see the docblock.
   */
  onRetry?: (() => void) | undefined;
}) {
  const canRetry = reason === "temporary" && onRetry !== undefined;

  return (
    <section className="mx-auto max-w-xl px-4 py-10 text-center">
      <LoadFailure
        message={COPY[reason]}
        {...(canRetry ? { onRetry } : {})}
      />
      {/* The "real exit" the LoadFailure docblock asks for. Present in
          BOTH states: a viewer who cannot retry still needs somewhere to
          go, and a viewer whose retry keeps failing does too. */}
      <nav
        className="mt-2 flex flex-wrap items-center justify-center gap-3"
        aria-label="Where to go instead"
      >
        <Link href={"/" as Route} className="bcc-btn bcc-btn-sm bcc-btn-primary">
          Back to the Floor
        </Link>
        <Link href={"/members" as Route} className="bcc-btn bcc-btn-sm bcc-btn-ghost">
          Browse members
        </Link>
      </nav>
    </section>
  );
}
