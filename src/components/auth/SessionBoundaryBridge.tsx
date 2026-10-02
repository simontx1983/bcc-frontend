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

/** Bound for the confirming read that decides whether a null session is real. */
const SESSION_CONFIRM_TIMEOUT_MS = 3_000;

/** How many times to ask before giving up on an unreadable answer. */
const SESSION_CONFIRM_ATTEMPTS = 3;

/** Gap between attempts. */
const SESSION_CONFIRM_RETRY_MS = 5_000;

export function SessionBoundaryBridge() {
  const queryClient = useQueryClient();
  const { data: session, status } = useSession();

  // The viewer this tab currently believes it is showing. `undefined`
  // means "not established yet" so the first resolution is not mistaken
  // for a viewer change.
  const shownViewer = useRef<string | null | undefined>(undefined);
  /** True while a null session is being confirmed. */
  const confirming = useRef(false);
  /** The most recent viewer the effect saw, readable from the confirm loop. */
  const latestViewer = useRef<string | null>(null);

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
      invalidateQueryCache: () => {
        // Drop what nothing is observing: those entries hold only
        // anonymous reads, and keeping them lets the pre-login payload
        // render for a round trip on remount — or indefinitely if the
        // refetch then errors, since query-core keeps `data` on error.
        // Three conditions, each load-bearing:
        //
        //  - nothing observing. `getObserversCount() === 0`, not
        //    `!isActive()`: the latter is `observers.some(o => enabled !==
        //    false)`, so it also matches a MOUNTED query whose observers
        //    are all disabled, which does not need dropping.
        //  - idle. A query can have no observers and still be fetching —
        //    a prefetch — and removing it cancels that read.
        //  - no `initialData`. Removing one of those is WORSE than
        //    invalidating it: query-core's getDefaultState stamps
        //    `dataUpdatedAt` with Date.now() when initialData is present
        //    and no initialDataUpdatedAt is given, so the REBUILT entry is
        //    fresh for its whole staleTime and will not refetch on mount.
        //    `useFeedItem` seeds from an SSR read carrying the ANONYMOUS
        //    view-model, with a 60s staleTime. Invalidation sticks to the
        //    surviving entry and forces the refetch instead.
        queryClient.removeQueries({
          predicate: (q) =>
            q.getObserversCount() === 0 &&
            q.state.fetchStatus === "idle" &&
            q.options.initialData === undefined,
        });
        // Mark the rest stale. This cancels only an active query that
        // ALREADY has data (a stale anonymous refetch); the arriving
        // viewer's first read has `data === undefined` and is continued.
        // See purgeArrivingViewerState for why that distinction matters.
        void queryClient.invalidateQueries().catch(() => {
          // Refetch failures are the queries' own business.
        });
      },
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
    latestViewer.current = viewer;

    if (shownViewer.current === undefined) {
      shownViewer.current = viewer;
      return;
    }
    if (shownViewer.current === viewer) {
      return;
    }

    // Read, but do NOT commit yet. An unconfirmed null used to be written
    // here, which meant any session change arriving during the confirm
    // window was compared against `null` and so looked like an ARRIVAL:
    // A -> null -> B took the arrival path, leaving A's server-rendered
    // email and owner controls on screen for B with no gate close and no
    // reload, and A -> null -> A ran the arrival sweep on a viewer who
    // never left, destroying their local-only onboarding progress. The
    // cross-tab broadcast makes both a few-hundred-ms event.
    //
    // So the recorded viewer advances only on a VERDICT.
    const previous = shownViewer.current;

    // A teardown already running in THIS tab is doing the same work.
    if (isEndingSession()) {
      shownViewer.current = viewer;
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
      shownViewer.current = viewer;
      purgeArrivingViewerState();
      return;
    }

    // Hide private content, drop this tab's cached copy, and reload.
    //
    // Clearing a cache does not touch what the SERVER already rendered.
    // `/u/[handle]` computes `isOwner` from `getServerSession` and passes
    // the owner's email into the change-email form, so viewer A's email
    // and owner controls are still in this tab's RSC output. Only a
    // document load re-runs that tree for whoever is here now.
    //
    // Deliberately NOT calling signOut: the other tab already did, and a
    // second call would race it. A reload is both sufficient and honest —
    // it re-derives everything from whatever cookie now exists.
    const depart = () => {
      purgeViewerState();
      window.location.reload();
    };

    // A viewer id that READ as a different person is a verdict, so act on
    // it. `null` is not: next-auth's `fetchData` returns null on ANY
    // error — transport failure, a 502, a rate-limited edge, a non-JSON
    // body — and SessionProvider then stores null, so `status` becomes
    // "unauthenticated" for an ordinary network blip. SessionProvider
    // also keeps next-auth's default refetch-on-focus (the `false` in
    // providers.tsx is on the QueryClient), so a tab refocus during a
    // blip lands here.
    //
    // Acting on that destroyed the viewer's unpublished blog draft
    // irrecoverably, orphaned a live server push row, and reloaded a
    // session whose cookie was never touched — so they came back signed
    // in, minus the draft. Everywhere else this codebase refuses to end a
    // session on an unreadable answer; this was the one place that did.
    if (viewer !== null) {
      shownViewer.current = viewer;
      depart();
      return;
    }

    // One confirm at a time. Without this an effect re-run could launch a
    // second while the first is still open.
    if (confirming.current) {
      return;
    }
    confirming.current = true;

    void (async () => {
      /** One attempt. True only for a readable, empty session body. */
      const askOnce = async (): Promise<boolean> => {
        try {
          const r = await fetch("/api/auth/session", {
            credentials: "include",
            cache: "no-store",
            signal: AbortSignal.timeout(SESSION_CONFIRM_TIMEOUT_MS),
          });
          if (!r.ok) {
            return false;
          }
          const body: unknown = await r.json().catch(() => undefined);
          // next-auth answers a READABLE `{}` when there is no session
          // cookie. That is the only shape that proves departure.
          return (
            typeof body === "object" &&
            body !== null &&
            Object.keys(body).length === 0
          );
        } catch {
          // Indeterminate. Not a verdict.
          return false;
        }
      };

      // Retry a bounded number of times. One inconclusive answer used to
      // end the matter for the life of the document: next-auth never sets
      // `loading` back to true on a refetch, so neither effect dep changes
      // again while the session keeps reading null, and nothing else will
      // tear the session down — after a real sign-out `getSession()` is
      // null, so reads go out anonymously and the client deliberately
      // refuses to end a session on an anonymous 401. A single blip could
      // therefore leave the previous viewer's server-rendered content on
      // screen indefinitely.
      //
      // Bounded rather than endless because the cost of giving up is
      // contained: the next navigation is a document load, which
      // re-derives everything from whatever cookie now exists.
      for (let attempt = 0; attempt < SESSION_CONFIRM_ATTEMPTS; attempt += 1) {
        if (attempt > 0) {
          await new Promise((r) => {
            window.setTimeout(r, SESSION_CONFIRM_RETRY_MS);
          });
        }
        // Stop if the session came back, or if a newer verdict has already
        // been acted on. Either way this question is no longer live.
        if (latestViewer.current !== null || shownViewer.current !== previous) {
          break;
        }
        if (await askOnce()) {
          confirming.current = false;
          if (shownViewer.current !== previous) {
            return;
          }
          shownViewer.current = null;
          depart();
          return;
        }
      }
      confirming.current = false;
    })();
  }, [session?.user?.id, status]);

  return null;
}
