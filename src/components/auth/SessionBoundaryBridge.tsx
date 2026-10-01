"use client";

/**
 * SessionBoundaryBridge — wires `lib/auth/session-boundary` to the things
 * only the provider tree can reach.
 *
 * This component exists so the low-level API client never has to import
 * the application providers. `lib/api/client` imports `endSession` from a
 * dependency-free module; this bridge supplies that module with the
 * `QueryClient`, browser storage and NextAuth `signOut` at mount. The
 * alternative — `client.ts` importing `app/providers` — would be an import
 * cycle (providers → hooks → client → providers) and would pull React into
 * every fetching module.
 *
 * It also owns the CROSS-TAB half of the problem. NextAuth broadcasts
 * session changes between tabs, so `useSession` here observes a sign-out or
 * an account switch that happened in a different tab.
 *
 * Renders nothing.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef } from "react";

import {
  isEndingSession,
  purgeArrivingViewerState,
  purgeViewerState,
  registerSessionTeardown,
} from "@/lib/auth/session-boundary";
import {
  clearCrossViewerStorage,
  clearViewerStorage,
} from "@/lib/auth/viewer-storage";
import { revokePushForSessionEnd } from "@/lib/push/revoke";

export function SessionBoundaryBridge() {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();

  // The viewer this tab currently believes it is showing. `undefined`
  // means "not established yet" so the first resolution is not mistaken
  // for a viewer change.
  const shownViewer = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    return registerSessionTeardown({
      purgeQueryCache: () => {
        // Cancel BEFORE clearing. `cancelQueries` aborts the in-flight
        // fetches via the AbortSignal every endpoint wrapper forwards, so
        // the responses never arrive to be written anywhere. Clearing
        // first would detach the queries and leave their fetches running.
        //
        // The abort itself is synchronous — cancelQueries calls
        // `query.cancel()` on each match inside a notify batch before it
        // returns — so the ordering holds even though we do not await the
        // promise it hands back.
        //
        // That promise MUST be caught: cancellation rejects every
        // in-flight query promise (TanStack's `{revert: true}` signal),
        // and an uncaught one surfaces as an unhandled rejection in the
        // browser during an ordinary sign-out.
        void queryClient.cancelQueries().catch(() => {
          // Cancellation rejections are the expected outcome here.
        });
        // By now the render gate has already unmounted every private
        // surface, so there is no observer left for this to notify — which
        // is exactly why `clear()` is sufficient here and was not before.
        queryClient.clear();
      },
      purgeViewerStorage: clearViewerStorage,
      purgeArrivalStorage: clearCrossViewerStorage,
      revokePush: revokePushForSessionEnd,
      // `redirect: true` is load-bearing: the document load re-runs the
      // RSC tree, so server-computed owner gating (`isOwner` and the
      // owner's email on /u/[handle]) is recomputed rather than lingering
      // from the authed render.
      signOut: async (callbackUrl: string) => {
        await signOut({ redirect: true, callbackUrl });
      },
    });
  }, [queryClient]);

  useEffect(() => {
    if (status === "loading") {
      return;
    }
    const viewer = session?.user?.id ?? null;

    if (shownViewer.current === undefined) {
      shownViewer.current = viewer;
      return;
    }
    if (shownViewer.current === viewer) {
      return;
    }

    const previous = shownViewer.current;
    shownViewer.current = viewer;

    // A teardown already running in THIS tab is doing the same work.
    if (isEndingSession()) {
      return;
    }

    // ANONYMOUS -> AUTHENTICATED is not a viewer change that needs hiding:
    // there is no previous viewer whose data could be on screen. It must
    // be skipped rather than merely tolerated, because `purgeViewerState`
    // closes the render gate and NOTHING reopens it — the gate is designed
    // to be terminal, since a successful teardown ends in a document load.
    //
    // Every CREDENTIALS sign-in in this app flips the session IN PLACE:
    // `signIn(..., { redirect: false })` at six call sites, each followed
    // by a client-side `router.replace`, so `status` goes unauthenticated
    // -> authenticated with no document load. (The OAuth buttons in
    // AuthCard use the default `redirect: true` and so do reload — but
    // they are the exception, not the rule.) Purging here would latch the
    // gate shut and leave the viewer on the "Signing out…" placeholder
    // immediately after a successful login, with only a manual browser
    // reload to escape. It would also wipe `bcc-onboarding-progress` and
    // the tour keys at the exact moment they start being written.
    if (previous === null) {
      // Not nothing, though: localStorage survives document loads, so a
      // previous viewer's keys can still be on this device even if this
      // tab never saw them. Purge the state, leave the gate open.
      purgeArrivingViewerState();
      return;
    }

    // A real viewer change, from another tab. Hide private content and
    // drop this tab's cached copy of it immediately.
    purgeViewerState();

    // Clearing a cache does not touch what the SERVER already rendered.
    // `/u/[handle]` computes `isOwner` from `getServerSession` and passes
    // the owner's email into the change-email form, so viewer A's email
    // and owner controls are still in this tab's RSC output. Only a
    // document load re-runs that tree for whoever is here now.
    //
    // Deliberately NOT calling signOut: the other tab already did, and a
    // second call would race it. A reload is both sufficient and honest —
    // it re-derives everything from whatever cookie now exists.
    window.location.reload();
  }, [session?.user?.id, status]);

  return null;
}
