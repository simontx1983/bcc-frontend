"use client";

/**
 * EntityWatchButton — Watch / Watching for a validator, project or creator
 * page, in the detail header (Site Structure A §12, option B: the trading
 * card no longer sits in the header, so its Watch pill doesn't either).
 *
 * The state and the toggle are the card pill's: the shared
 * `useViewerWatch` hook over the card's own `viewer_is_watching` /
 * `viewer_watch` (F-255). So are the rules, from the server's `can_watch`:
 *   - denied because the viewer is signed out → a sign-in link that comes
 *     back here (F-321), not a dead button;
 *   - denied for another reason → the server's hint, on the page (a tooltip
 *     never shows on a phone);
 *   - permitted but the state unknown → WATCH_UNKNOWN_COPY, and no toggle;
 *   - a failed toggle → its message under the button.
 */

import Link from "next/link";
import { useId } from "react";

import { useViewerWatch, WATCH_UNKNOWN_COPY } from "@/hooks/useViewerWatch";
import { useSignInLink } from "@/lib/auth/sign-in-link";
import { FOLLOW_COPY } from "@/lib/copy";
import { isAllowed, isSignInGate, unlockHint } from "@/lib/permissions";
import type { Card } from "@/lib/api/types";

const BUTTON = "bcc-btn min-h-[44px]";

export function EntityWatchButton({ card }: { card: Card }) {
  const watch = useViewerWatch(card);
  const signIn = useSignInLink();
  const reasonId = useId();

  if (isSignInGate(card.permissions, "can_watch")) {
    return (
      <Link
        href={signIn.href}
        onClick={signIn.onClick}
        aria-label={`Sign in to watch ${card.name}`}
        className={`${BUTTON} bcc-btn-outline`}
      >
        {FOLLOW_COPY.cta}
      </Link>
    );
  }

  const permitted = isAllowed(card.permissions, "can_watch");
  const reason = !permitted
    ? (unlockHint(card.permissions, "can_watch") ?? `${FOLLOW_COPY.cta} is unavailable for this page.`)
    : watch.unknown
      ? WATCH_UNKNOWN_COPY
      : null;
  const locked = reason !== null;

  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        onClick={locked ? undefined : watch.toggle}
        disabled={watch.pending}
        // Locked stays focusable so the reason can be reached (F-264).
        aria-disabled={locked || undefined}
        aria-describedby={locked ? reasonId : undefined}
        aria-label={watch.watching ? `Stop watching ${card.name}` : `Watch ${card.name}`}
        className={`${BUTTON} aria-disabled:cursor-not-allowed aria-disabled:opacity-[0.45] ${watch.watching ? "bcc-btn-ghost" : "bcc-btn-outline"}`}
      >
        {watch.watching ? FOLLOW_COPY.state : FOLLOW_COPY.cta}
      </button>
      {locked && (
        <span id={reasonId} className="bcc-mono max-w-[28ch] text-[10px] leading-snug text-bcc-text-secondary">
          {reason}
        </span>
      )}
      {watch.error !== null && (
        <span role="status" className="bcc-mono max-w-[28ch] text-[10px] leading-snug text-bcc-text-secondary">
          {watch.error}
        </span>
      )}
    </span>
  );
}
