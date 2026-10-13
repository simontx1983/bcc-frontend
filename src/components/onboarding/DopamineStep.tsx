"use client";

/**
 * DopamineStep — §O1 send-off animation. Extracted from
 * OnboardingWizard.tsx (Phase 3.3 god-component split).
 *
 * On entry: fire the /complete mutation (with home_chain) AND start a
 * minimum-display timer (~2.4s reduced to ~0.6s on prefers-reduced-
 * motion). Once BOTH have settled, route the user to /. If the
 * mutation errors, show a retry tile and skip the redirect.
 *
 * COMPLETION-TRACKING GOTCHA (do not regress): the save outcome is
 * tracked in LOCAL state driven by the `mutateAsync` promise, NOT by
 * the useMutation hook's `isPending`/`isSuccess`/`isError` fields.
 * With reactStrictMode (dev), React simulates an unmount/remount right
 * after mount; React Query v5's MutationObserver detaches from the
 * in-flight mutation on unsubscribe (`onUnsubscribe` →
 * `currentMutation.removeObserver(this)`) and never re-attaches on
 * resubscribe. Because we fire the mutation inside a mount effect, the
 * hook's render state froze at `isPending: true` forever — "Saving…"
 * never cleared and the redirect never fired. The mutateAsync promise
 * settles regardless of observer attachment, so local state is the
 * reliable channel. Same reasoning applies to the hold timer: it lives
 * in its own effect (cleanup re-arms on StrictMode's second pass)
 * instead of the ref-guarded fire-once effect, whose second pass
 * early-returns and would leave the timer permanently cleared.
 *
 * The animation itself is pure CSS — N abstract card chips with
 * rarity-tinted glow trails fly toward a watchlist icon (the visual
 * still uses the 3-ring binder iconography per pattern-registry) docked
 * top-right; a stat-pop holds in the centre; the cardstock backdrop
 * fades to a concrete-floor tone over the same window. No
 * per-card DOM measurement; this is a *stylized* moment, not a
 * physically-accurate flight from each rendered card.
 */

import { BookMarked } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCompleteOnboarding } from "@/hooks/useCompleteOnboarding";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useViewerScope } from "@/hooks/useViewerScope";
import { humanizeCode } from "@/lib/api/errors";
import { clearOnboardingProgress } from "@/lib/onboarding/storage";
import type {
  ReputationTier,
  HomeChain,
  OnboardingCompleteResponse,
} from "@/lib/api/types";

const MIN_HOLD_MS_FULL    = 2400;
const MIN_HOLD_MS_REDUCED = 600;

/**
 * Local save-state machine — see COMPLETION-TRACKING GOTCHA above for
 * why this exists instead of reading the useMutation result fields.
 */
type SaveState =
  | { status: "saving" }
  | { status: "saved"; data: OnboardingCompleteResponse }
  | { status: "error"; copy: string };

export function DopamineStep({
  homeChain,
  pulledCards,
}: {
  homeChain: HomeChain | null;
  pulledCards: ReadonlyArray<{ id: number; tier: ReputationTier }>;
}) {
  const router = useRouter();
  const { mutateAsync: completeAsync } = useCompleteOnboarding();
  const reducedMotion = usePrefersReducedMotion();
  const scope = useViewerScope();
  const [save, setSave] = useState<SaveState>({ status: "saving" });
  const [holdElapsed, setHoldElapsed] = useState(false);

  // Guards against a second /complete going out while one is still in
  // flight — a double-tap on "Try again", or a rapid Enter-repeat on the
  // focused button. The server is idempotent, but a duplicate still doubles
  // the audit-log noise and can land the two responses out of order.
  const inFlightRef = useRef(false);

  const runComplete = useCallback(() => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSave({ status: "saving" });
    completeAsync({
      ...(homeChain !== null ? { home_chain: homeChain } : {}),
    })
      .then((data) => {
        // Only NOW is the resume point safe to drop. Clearing it on entry
        // to this screen (as the wizard used to) meant a failed /complete
        // left the visitor un-onboarded AND unable to resume.
        //
        // This is a DEFERRED callback, so the scope may have gone
        // unavailable between submit and response (a session blip). The
        // clear is dropped then — we cannot name the key — so the effect
        // below retries it once identity is known, or the viewer would be
        // offered "finish setting up?" after finishing.
        clearOnboardingProgress(scope);
        setSave({ status: "saved", data });
      })
      .catch((err: unknown) => {
        // Phase γ: copy is owned here, keyed on err.code — never
        // err.message (humanizeCode refuses the fallback by design).
        setSave({
          status: "error",
          copy: humanizeCode(
            err,
            {
              bcc_unauthorized:
                "Your session expired — sign in again to finish setup.",
              bcc_rate_limited:
                "Too many attempts — wait a moment and try again.",
            },
            "Couldn't save your setup. Check your connection and try again."
          ),
        });
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [completeAsync, homeChain, scope]);

  // The deferred clear above can arrive while identity is unavailable, in
  // which case nothing was removed. Idempotent, and keyed on the scope, so
  // it lands as soon as the viewer is known again.
  useEffect(() => {
    if (save.status !== "saved" || scope === null) return;
    clearOnboardingProgress(scope);
  }, [save.status, scope]);

  /**
   * The escape hatch. Guarded so a double-tap cannot issue two navigations
   * — router.replace twice is harmless in Next today, but "harmless today"
   * is not a property to rely on for the one control a stuck visitor uses.
   *
   * It deliberately does NOT fire /complete and does NOT clear the resume
   * point: the account genuinely is not onboarded, and the "resume setup?"
   * prompt on the Floor is what brings them back.
   */
  const leftRef = useRef(false);
  const leaveForFloor = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    router.replace("/");
  }, [router]);

  // Fire the mutation once on mount. The ref-guarded call protects
  // against React 19 strict-mode double-invoke; the server's complete
  // handler is idempotent anyway, but firing twice would double the
  // audit-log noise. (`completeAsync` is referentially stable, so this
  // effect runs only on mount + strict-mode's simulated remount.)
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    runComplete();
  }, [runComplete]);

  // Minimum-display hold timer — deliberately its OWN effect so the
  // strict-mode cleanup/re-setup cycle re-arms it (a timer started in
  // the ref-guarded effect above would be cleared on the simulated
  // unmount and never restarted). Re-arming on a live reduced-motion
  // toggle is harmless: worst case the hold restarts once.
  useEffect(() => {
    const holdMs = reducedMotion ? MIN_HOLD_MS_REDUCED : MIN_HOLD_MS_FULL;
    const handle = window.setTimeout(() => setHoldElapsed(true), holdMs);
    return () => window.clearTimeout(handle);
  }, [reducedMotion]);

  // Route home only when BOTH the animation has held its minimum AND
  // the server has confirmed completion. Errors abort the redirect so
  // the user can see + retry.
  useEffect(() => {
    if (!holdElapsed) return;
    if (save.status === "saved") {
      router.replace("/");
    }
  }, [holdElapsed, save.status, router]);

  if (save.status === "error") {
    return (
      <section className="bcc-onb-step" style={{ maxWidth: "36rem" }}>
        <div className="bcc-onb-panel">
          {/*
            h1, not h2: this replaces the whole screen, and the wizard moves
            focus to the step's heading. An h2 here left the screen with no
            h1 at all and skipped a level.
          */}
          <h1 className="bcc-onb-disp" style={{ fontSize: "1.8rem" }}>
            Couldn&apos;t finish onboarding
          </h1>
          <p role="alert" className="bcc-onb-lede" style={{ marginTop: "10px", fontSize: "1rem" }}>
            {save.copy}
          </p>
          {/*
            The escape. Before this existed, a persistent /complete failure
            was a hard stop: one "Try again" button, no navigation anywhere
            in MinimalShell, and the resume point already cleared.

            It deliberately does NOT mark onboarding complete — the account
            is genuinely not onboarded, so claiming otherwise would be a
            lie the server would contradict. The resume point survives (see
            the success handler above), so the "resume setup?" prompt on the
            Floor can bring them back.
          */}
          <div className="bcc-onb-foot" style={{ marginTop: "20px" }}>
            <button type="button" onClick={runComplete} className="bcc-onb-btn bcc-onb-btn-primary">
              Try again
            </button>
            <button
              type="button"
              onClick={leaveForFloor}
              className="bcc-onb-link"
            >
              Continue to the Floor →
            </button>
          </div>
          <p className="bcc-onb-note" style={{ marginTop: "12px" }}>
            Your setup isn&rsquo;t saved yet. You can finish it any time from the Floor.
          </p>
        </div>
      </section>
    );
  }

  // Cap the visible flying chips so the animation doesn't get crowded
  // when a user pulled a dozen cards. The stat-pop's "+ N" still
  // reflects the true count.
  //
  // Sprint 4: cap reduced 6 → 3. The arrive moment is the loudest
  // motion in the product; six chips flying simultaneously over-
  // shadows the rest of the motion vocabulary the user will encounter.
  // Three chips communicates "you pulled cards" without the spectacle.
  const visibleChips = pulledCards.slice(0, 3);

  return (
    <section
      className={
        "relative mx-auto mt-12 flex min-h-[60vh] max-h-[80vh] max-w-6xl items-center justify-center px-6 sm:px-8 " +
        (reducedMotion ? "" : "bcc-onboarding-backdrop")
      }
      aria-live="polite"
      aria-label="Welcome to the Floor"
    >
      {/* Watchlist dock — the destination for the chips. */}
      <div className="absolute right-8 top-6 flex flex-col items-end gap-1">
        <div className="bcc-onb-panel flex h-14 w-14 items-center justify-center p-0 text-[var(--bcc-text)]">
          <BookMarked size={24} strokeWidth={1.7} aria-hidden />
        </div>
        <span className="bcc-onb-note">Watchlist</span>
      </div>

      {/* Flying chips — only when motion is allowed. */}
      {!reducedMotion &&
        visibleChips.map((card, i) => (
          <span
            key={card.id}
            className={`bcc-onboarding-chip bcc-onboarding-chip-${tierClassName(card.tier)}`}
            style={{
              ["--bcc-onboarding-delay" as string]: `${i * 120}ms`,
            }}
            aria-hidden="true"
          />
        ))}

      <div className={reducedMotion ? "" : "bcc-onboarding-arrive"}>
        <div className="bcc-onb-panel px-8 py-6 text-center">
          <p className="bcc-onb-disp" style={{ fontSize: "clamp(2rem, 5vw, 2.6rem)" }}>
            You&apos;re on the Floor.
          </p>
          {/* Rank label is server-rendered (§A2) — completion response
              echoes the user's current rank. Null (Phase 5: a fresh
              signup is a New Member with no rank yet) or empty →
              suppress the segment; never fabricate a rank word. */}
          <p className="bcc-onb-note" style={{ marginTop: "12px" }}>
            +{pulledCards.length} card{pulledCards.length === 1 ? "" : "s"}
            {save.status === "saved" &&
              typeof save.data.rank_label === "string" &&
              save.data.rank_label !== "" && (
              <>
                {" · "}{save.data.rank_label} rank
              </>
            )}
            {homeChain !== null && (
              <>
                {" · "}home: <span style={{ color: "var(--bcc-text)" }}>{homeChain}</span>
              </>
            )}
          </p>
          {save.status === "saving" && (
            <p className="bcc-onb-note" style={{ marginTop: "12px", opacity: 0.7 }}>
              Saving…
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function tierClassName(tier: ReputationTier): string {
  // Tailwind/JIT can't see dynamic class joins, so the receiving
  // .bcc-onboarding-chip-{name} CSS rules must be statically present in
  // globals.css. Same name set as the five trust bands — every one has a
  // chip class now, including risky, which the retired rarity set could
  // not express at all.
  switch (tier) {
    // `elite` is the legacy wire name for the same band — both map to the
    // one chip class so either value renders identically during the
    // bcc-trust rename window.
    case "proven":
    case "elite":   return "proven";
    case "trusted": return "trusted";
    case "neutral": return "neutral";
    case "caution": return "caution";
    case "risky":   return "risky";
  }
}
