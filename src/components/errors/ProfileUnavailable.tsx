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
 * `"denied"` refuses the recovery control even when a caller passes one
 * — enforced here rather than left to each call site, because the whole
 * point is that no future caller can offer a recovery that cannot work.
 *
 * ⚠ The recovery is a RELOAD, not a retry, and is labelled as one. It
 * may cost unsaved in-memory work; see the comment on the control.
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

/** Ties the warning to the button for assistive technology. */
const WARNING_ID = "profile-reload-warning";

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
  isBusy = false,
}: {
  reason: ProfileUnavailableReason;
  /**
   * Only honoured for `reason="temporary"`. Passing it with `"denied"`
   * is ignored on purpose — see the docblock.
   */
  onRetry?: (() => void) | undefined;
  /**
   * A retry already in flight. Reported through `aria-busy` on the
   * wrapper rather than by disabling the control: the browser blurs a
   * disabled element, so disabling the button the viewer just pressed
   * would drop focus to `<body>`. The caller keeps the control inert.
   */
  isBusy?: boolean;
}) {
  const canReload = reason === "temporary" && onRetry !== undefined;

  return (
    <section
      className="mx-auto max-w-xl px-4 py-10 text-center"
      aria-busy={isBusy || undefined}
    >
      {/*
        `LoadFailure` carries the MESSAGE only. The action is rendered
        here instead of through its `onRetry`, for two reasons: the
        recovery is a reload rather than a retry, and it needs a warning
        attached to it — neither of which that component's closed
        `retryLabel` inventory is meant to carry.
      */}
      <LoadFailure message={COPY[reason]} />
      {/*
        The recovery action, named for what it may actually do.

        It was labelled "Retry", which implied a soft refresh that keeps
        the page as it is. Measured against a recording API stub with the
        RSC transport aborted, pressing it produced ONE HARD DOCUMENT LOAD:
        a `window`-scoped sentinel — same lifetime as React state — was
        destroyed, while `localStorage` (including `bcc.blog.draft.*`) and
        `sessionStorage` survived. `router.refresh()` is a soft refresh
        when the transport is healthy and is NOT one when it is not, and
        the control cannot tell which it will be before it runs.

        So it says "reload", and it says what a reload can cost BEFORE it
        is pressed rather than after. The warning is wired with
        `aria-describedby`, so it is read as part of the button rather
        than being a line of text a screen-reader user may never reach.
      */}
      {canReload && (
        <div className="mt-1">
          <p
            id={WARNING_ID}
            className="bcc-mono mb-3 text-[12px] leading-relaxed text-[var(--bcc-text-secondary)]"
            data-testid="profile-reload-warning"
          >
            Reloading may discard anything you haven&rsquo;t saved on this page.
          </p>
          <button
            type="button"
            onClick={onRetry}
            aria-describedby={WARNING_ID}
            aria-busy={isBusy || undefined}
            data-testid="profile-reload-action"
            className="bcc-btn bcc-btn-sm bcc-btn-outline"
          >
            Reload this page
          </button>
        </div>
      )}

      {/* The "real exit" the LoadFailure docblock asks for, and the way
          out that costs nothing: leaving the page cannot discard work the
          reload might. Present in BOTH states. */}
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
