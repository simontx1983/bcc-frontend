"use client";

/**
 * What a Stoke or Helpful pill shows when it can't do what was tapped
 * (F-258, audit M5). Shared by the four pills: the post rail's Stoke
 * (ReactionRail) and Helpful (PostHelpfulButton), and the comment row's
 * Stoke and Helpful (CommentDrawer).
 *
 * Before, a signed-out visitor's tap showed the spark burst and then the
 * 401 rolled it back without a word, and a signed-in viewer's failed toggle
 * did the same. Now:
 *  - signed out, the pill is a sign-in link (ReactionSignInLink, F-321's
 *    useSignInLink), so nothing is sent;
 *  - a toggle that fails says so in one line (ReactionFailureNotice). The
 *    hooks still roll the optimistic state back; this only adds the words.
 *
 * The notice follows #328: its live region is mounted empty with the pill
 * and each failure's text is a fresh <span key={seq}>, so a repeat failure
 * is read again. Empty, the region is `sr-only` (out of the layout, so a
 * feed card's row is unchanged); with a line in it, it takes the caller's
 * visible class. It is a polite `aria-live`, not role="status" or "alert":
 * a feed renders one per pill, and a role would add a match to every
 * host page's getByRole("status") / ("alert").
 */

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useRef, useState } from "react";

import { humanizeCode } from "@/lib/api/errors";
import { useSignInLink } from "@/lib/auth/sign-in-link";

export type ReactionKind = "stoke" | "helpful";

export interface ReactionFailure {
  seq: number;
  text: string;
}

export const REACTION_COPY = {
  stoke: {
    signIn: "Sign in to stoke",
    add: "Couldn't stoke this. Try again.",
    remove: "Couldn't remove your stoke. Try again.",
    unauthorized: "Sign in to stoke.",
  },
  helpful: {
    signIn: "Sign in to mark this helpful",
    add: "Couldn't mark this helpful. Try again.",
    remove: "Couldn't remove your helpful mark. Try again.",
    unauthorized: "Sign in to mark this helpful.",
  },
  rateLimited: "Too many taps. Wait a moment, then try again.",
  denied: "You can't react here.",
  suspended: "Your account is suspended, so you can't react right now.",
  gone: "This is no longer available.",
} as const;

/**
 * The line for a failed toggle. `removing` is the direction that was
 * tapped (unstoke / unmark), so the line says which way it failed. Codes
 * from the four routes' contract (§4: /feed/:id/stoke, /comments/:id/stoke,
 * /feed/:id/helpful, /comments/:id/helpful).
 */
export function reactionFailureCopy(err: unknown, kind: ReactionKind, removing: boolean): string {
  const copy = REACTION_COPY[kind];
  return humanizeCode(
    err,
    {
      bcc_unauthorized: copy.unauthorized,
      bcc_rate_limited: REACTION_COPY.rateLimited,
      bcc_permission_denied: REACTION_COPY.denied,
      // The routes' only 403 bcc_forbidden is the reactor's own suspension
      // (StokeEndpoint, CommentStokeEndpoint, HelpfulMarkEndpoint: "Your
      // account is suspended."). Without this a suspended member read
      // "Couldn't stoke this. Try again." and retried forever. Same
      // wording as ReportButton's suspended line.
      bcc_forbidden: REACTION_COPY.suspended,
      bcc_not_found: REACTION_COPY.gone,
    },
    removing ? copy.remove : copy.add,
  );
}

/** What a pill needs to report into a line it doesn't own (a comment row's). */
export interface ReactionFeedback {
  report: (err: unknown, kind: ReactionKind, removing: boolean) => void;
  /** A new press clears the last failure's line. */
  clear: () => void;
}

/**
 * One pill's (or one comment row's) failure line. `report` and `clear` are
 * stable, so a memoized pill's toggle callback stays stable too.
 */
export function useReactionFailure(): ReactionFeedback & { failure: ReactionFailure | null } {
  const [failure, setFailure] = useState<ReactionFailure | null>(null);
  const seq = useRef(0);
  const report = useCallback((err: unknown, kind: ReactionKind, removing: boolean) => {
    seq.current += 1;
    setFailure({ seq: seq.current, text: reactionFailureCopy(err, kind, removing) });
  }, []);
  const clear = useCallback(() => setFailure(null), []);
  return { failure, report, clear };
}

/** The visible look shared by every caller; `className` adds placement. */
const LINE_CLASS = "bcc-mono min-w-0 break-words text-[10px] text-[var(--bcc-danger)]";

export function ReactionFailureNotice({
  failure,
  className = "",
}: {
  failure: ReactionFailure | null;
  /** Placement for the visible line, e.g. "order-last basis-full" in a wrapping row. */
  className?: string;
}) {
  return (
    <p
      aria-live="polite"
      aria-atomic="true"
      className={failure === null ? "sr-only" : `${LINE_CLASS} ${className}`.trim()}
    >
      {failure !== null && <span key={failure.seq}>{failure.text}</span>}
    </p>
  );
}

/**
 * A signed-out viewer's pill: the same look, as a link to sign in and come
 * back to this page. useSignInLink stops the click from reaching a card's
 * click-to-open body, and keeps a modified click (new tab) a plain link.
 */
export function ReactionSignInLink({
  label,
  className,
  style,
  children,
}: {
  /** The accessible name and tooltip, e.g. "Sign in to stoke". */
  label: string;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const signIn = useSignInLink();
  return (
    <Link
      href={signIn.href}
      onClick={signIn.onClick}
      aria-label={label}
      title={label}
      className={className}
      style={style}
    >
      {children}
    </Link>
  );
}
