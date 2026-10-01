"use client";

/**
 * SessionBoundaryBridge — wires `lib/auth/session-boundary` to the
 * things only the provider tree can reach.
 *
 * This component exists so the low-level API client never has to import
 * the application providers. `lib/api/client` imports `endSession` from a
 * dependency-free module; this bridge supplies that module with the
 * `QueryClient`, browser storage and NextAuth `signOut` at mount. The
 * alternative — `client.ts` importing `app/providers` — would be an
 * import cycle (providers → hooks → client → providers) and would pull
 * React into every fetching module.
 *
 * It also owns the CROSS-TAB half of the problem. NextAuth broadcasts
 * session changes between tabs, so `useSession` here observes a sign-out
 * or an account switch that happened in a different tab. When it does,
 * this tab purges its own view of the previous viewer — but deliberately
 * does NOT call `signOut` again: the other tab already did, and a second
 * call would race it.
 *
 * Renders nothing.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef } from "react";

import {
  isEndingSession,
  purgeViewerState,
  registerSessionTeardown,
} from "@/lib/auth/session-boundary";
import { clearViewerStorage } from "@/lib/auth/viewer-storage";
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
        void queryClient.cancelQueries();
        queryClient.clear();
      },
      purgeViewerStorage: clearViewerStorage,
      revokePush: revokePushForSessionEnd,
      // `redirect: true` is the point: the document load re-runs the RSC
      // tree, so server-computed owner gating (`isOwner` on /u/[handle])
      // is recomputed instead of lingering from the authed render.
      signOut: async () => {
        await signOut({ redirect: true, callbackUrl: "/" });
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

    // The viewer changed under us. Either another tab signed out (viewer
    // → null) or a different account took over (viewer → other id).
    // A teardown already in progress in THIS tab is doing the same work,
    // so don't double-purge mid-flight.
    shownViewer.current = viewer;
    if (!isEndingSession()) {
      purgeViewerState();
    }
  }, [session?.user?.id, status]);

  return null;
}
