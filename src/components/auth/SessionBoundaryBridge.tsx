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
  registerSessionRecheck,
  setSessionUnknown,
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
  /** Removes the re-arm listeners, if any are registered. */
  const rearmCleanup = useRef<(() => void) | null>(null);
  /** Set on unmount: an in-flight confirm cannot be aborted, so it checks this. */
  const disposed = useRef(false);
  /** The current effect run's confirm, for the gate's Retry control. */
  const recheckRef = useRef<(() => void) | null>(null);

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
      // The first value is committed unconditionally, `null` included,
      // WITHOUT the confirm the departure path insists on. That is sound
      // only because `providers.tsx` passes `session={…}` from
      // `getServerSession`: next-auth then treats the session as already
      // present and its mount-time `_getSession()` short-circuits without
      // a client fetch, so this value comes from the same server read that
      // produced the SSR output and a mount-time blip cannot desynchronise
      // them.
      //
      // ⚠ If that prop is ever dropped so SessionProvider fetches its own
      // session, a failed first fetch would record `null` here and the
      // next arrival would take the no-gate-close branch below while the
      // previous owner's email and controls are still server-rendered on
      // the page. Confirm before committing if that changes.
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

    // Re-ask once the conditions that broke the confirm may have changed.
    // One-shot per signal, and self-removing, so a flapping connection
    // cannot stack listeners. `confirming` still guards overlap, and the
    // guards inside the loop stop it acting on a question that is no
    // longer live.
    const rearm = (): void => {
      const retry = (): void => {
        cleanup();
        if (
          latestViewer.current !== null ||
          shownViewer.current !== previous ||
          // Defensive: a teardown owns the navigation, and re-confirming
          // underneath it could race the sign-out. Not covered by a
          // mutation control — see the test note.
          isEndingSession()
        ) {
          return;
        }
        runConfirm();
      };
      const cleanup = (): void => {
        window.removeEventListener("online", retry);
        window.removeEventListener("focus", retry);
        document.removeEventListener("visibilitychange", onVisible);
        rearmCleanup.current = null;
      };
      const onVisible = (): void => {
        if (document.visibilityState === "visible") {
          retry();
        }
      };
      // Replace any previous registration rather than adding to it.
      rearmCleanup.current?.();
      window.addEventListener("online", retry);
      window.addEventListener("focus", retry);
      document.addEventListener("visibilitychange", onVisible);
      rearmCleanup.current = cleanup;
    };

    const runConfirm = (): void => {
      if (confirming.current) {
        return;
      }
      confirming.current = true;
      void (async () => {
        /** One attempt. True only for a readable, empty session body. */
        /**
         * One attempt, THREE outcomes. Collapsing these into a boolean was a
         * defect: a readable body proving the session is ALIVE went into the
         * same bucket as an unreadable answer, so nothing consumed it and
         * the loop re-armed forever. That mattered because next-auth's
         * `_getSession` early-returns while its cached session is null, so
         * `useSession` can never recover by itself and neither effect dep
         * can change again — leaving a permanent, focus-keyed poll against a
         * session this code had already read and knew was fine.
         */
        const askOnce = async (): Promise<
          | { kind: "gone" }
          | { kind: "present"; viewer: string | null }
          | { kind: "unreadable" }
        > => {
          try {
            const r = await fetch("/api/auth/session", {
              credentials: "include",
              cache: "no-store",
              signal: AbortSignal.timeout(SESSION_CONFIRM_TIMEOUT_MS),
            });
            if (!r.ok) {
              return { kind: "unreadable" };
            }
            const body: unknown = await r.json().catch(() => undefined);
            if (typeof body !== "object" || body === null) {
              return { kind: "unreadable" };
            }
            // next-auth answers a READABLE `{}` when there is no session
            // cookie. That is the only shape that proves departure.
            if (Object.keys(body).length === 0) {
              return { kind: "gone" };
            }
            const id = (body as { user?: { id?: unknown } }).user?.id;
            return {
              kind: "present",
              viewer: typeof id === "string" ? id : null,
            };
          } catch {
            return { kind: "unreadable" };
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
        // contained, though less neatly than it first looks:
        //
        // Bounded rather than endless, with an honest residual: until a
        // verdict arrives, a departed viewer's server-rendered content can
        // still be shown. A forward navigation usually re-reads the cookie,
        // but not for an href that was `router.prefetch`ed — reused for
        // `staleTimes.static`, 300s by default, with no server request, and
        // `FeedItemCard` FULL-prefetches the permalink on hover then pushes
        // that same href on click. Back/forward does not re-read either:
        // Next restores those segments from the client Router Cache.
        //
        // That residual is accepted rather than closed, because the only
        // tool that would close it is the one described at the give-up
        // branch below, and its failure mode is worse than the exposure.

        for (let attempt = 0; attempt < SESSION_CONFIRM_ATTEMPTS; attempt += 1) {
          if (attempt > 0) {
            await new Promise((r) => {
              window.setTimeout(r, SESSION_CONFIRM_RETRY_MS);
            });
          }
          // Stop if the session came back, or if a newer verdict has already
          // been acted on. Either way this question is no longer live.
          if (
            latestViewer.current !== null ||
            shownViewer.current !== previous ||
            // Nothing may act after unmount: the in-flight loop cannot be
            // aborted, so it checks here and stops before it can re-arm.
            disposed.current
          ) {
            break;
          }
          const answer = await askOnce();

          if (answer.kind === "gone") {
            confirming.current = false;
            // `isEndingSession()` is re-checked HERE rather than in the
            // loop condition, because this is the line that acts. A
            // user-initiated focus can start this loop at any moment and it
            // runs for up to ~16s; departing underneath a teardown reloads
            // the current URL and discards the callbackUrl and notice slug
            // it was carrying.
            if (shownViewer.current !== previous || isEndingSession()) {
              return;
            }
            shownViewer.current = null;
            depart();
            return;
          }

          if (answer.kind === "present") {
            // The endpoint answered and there IS a session. That settles the
            // question either way, so do NOT re-arm.
            confirming.current = false;
            if (shownViewer.current !== previous || isEndingSession()) {
              return;
            }
            if (answer.viewer !== null && answer.viewer !== previous) {
              // A verdict we read ourselves: someone else is here now. The
              // cross-tab broadcast usually delivers this first, but acting
              // on our own evidence does not depend on that.
              shownViewer.current = answer.viewer;
              depart();
            }
            // Same viewer, or no id to compare: the session is alive, so
            // reopen. `useSession` being stuck at null is its own business
            // — this module has read the truth directly.
            setSessionUnknown(false);
            return;
          }
        }
        confirming.current = false;

        // Attempts exhausted without a verdict. Deliberately INERT: we never
        // proved the session is gone, and this module's rule is that an
        // unreadable answer is never a reason to destroy anything.
        //
        // `router.refresh()` was tried here and reverted. It would have
        // closed the stale-render residuals below, but Next falls back to a
        // HARD `location.replace` whenever the RSC response is not a 200
        // flight response (fetch-server-response.js: "If the fetch was not
        // 200, we also handle it like a mpa navigation"). This path is
        // reached precisely when the same Next origin failed three session
        // reads — /api/auth/session is served by Next and in steady state
        // touches no backend — so the refresh would have been safe only when
        // it was unnecessary, and a full document load, destroying the
        // unpublished draft this loop exists to protect, exactly when it was
        // not.
        //
        // So instead of acting on no evidence, wait for the conditions to
        // change and ask again. `rearm` below listens for `online` and a
        // refocus; a readable answer then settles it either way.
        //
        // ⚠ Recovery is NOT assured, and this is the residual to be honest
        // about. All three signals are TRANSITIONS, so a viewer who leaves
        // one tab open, focused, foregrounded and already online gets no
        // re-check at all. Nothing else carries it: next-auth's focus
        // refetch early-returns while its cached session is null, its poll
        // is off and gated on a truthy session, and the API client
        // deliberately ignores an anonymous 401. Until a signal fires, a
        // departed viewer's already-rendered content stays on screen —
        // see the residual note above. Closing that needs a decision
        // (timed re-checks, a `pageshow` listener, or an explicit accept),
        // not another mechanism bolted on here.
        // Hide the private subtree, WITHOUT unmounting it, until a
        // readable answer settles this. The subtree keeps rendering, so a
        // half-written post, a selected photo and its alt text all
        // survive — none of which storage could return.
        setSessionUnknown(true);
        rearm();
      })();
    };

    // Publish for the gate's Retry control. Re-published on every effect
    // run so the closure always carries the current `previous`.
    recheckRef.current = runConfirm;

    runConfirm();
  }, [session?.user?.id, status]);

  // The gate's Retry control asks through here. `runConfirm` closes over
  // the effect run's `previous`, so the effect publishes it on a ref and
  // this registration forwards to whatever is current.
  useEffect(
    () =>
      registerSessionRecheck(() => {
        recheckRef.current?.();
      }),
    [],
  );

  // Never leave listeners behind on unmount.
  useEffect(
    () => () => {
      disposed.current = true;
      rearmCleanup.current?.();
    },
    [],
  );

  return null;
}
