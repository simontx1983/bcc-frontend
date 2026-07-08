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

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCompleteOnboarding } from "@/hooks/useCompleteOnboarding";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { humanizeCode } from "@/lib/api/errors";
import type {
  CardTier,
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
  pulledCards: ReadonlyArray<{ id: number; tier: CardTier }>;
}) {
  const router = useRouter();
  const { mutateAsync: completeAsync } = useCompleteOnboarding();
  const reducedMotion = usePrefersReducedMotion();
  const [save, setSave] = useState<SaveState>({ status: "saving" });
  const [holdElapsed, setHoldElapsed] = useState(false);

  const runComplete = useCallback(() => {
    setSave({ status: "saving" });
    completeAsync({
      ...(homeChain !== null ? { home_chain: homeChain } : {}),
    })
      .then((data) => setSave({ status: "saved", data }))
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
      });
  }, [completeAsync, homeChain]);

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
      <section className="mx-auto mt-16 max-w-xl px-6 sm:px-8">
        <div className="bcc-panel p-6">
          <h2 className="bcc-stencil text-2xl text-bcc-text">
            Couldn&apos;t finish onboarding
          </h2>
          <p className="mt-2 font-serif text-bcc-text-secondary">
            {save.copy}
          </p>
          <button
            type="button"
            onClick={runComplete}
            className="bcc-mono mt-4 text-blueprint underline"
          >
            Try again
          </button>
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
        <div className="bcc-panel flex h-14 w-14 items-center justify-center text-2xl">
          📒
        </div>
        <span className="bcc-mono text-[10px] text-cardstock-deep">Watchlist</span>
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
        <div className="bcc-panel px-8 py-6 text-center">
          <p className="bcc-stencil text-3xl text-bcc-text md:text-4xl">
            You&apos;re on the Floor.
          </p>
          {/* Rank label is server-rendered (§A2) — completion response
              echoes the user's current rank. Empty string = suppress
              the segment (server didn't have one to send). */}
          <p className="bcc-mono mt-3 text-bcc-text-secondary">
            +{pulledCards.length} card{pulledCards.length === 1 ? "" : "s"}
            {save.status === "saved" && save.data.rank_label !== "" && (
              <>
                {" · "}{save.data.rank_label} rank
              </>
            )}
            {homeChain !== null && (
              <>
                {" · "}home: <span className="text-bcc-text">{homeChain}</span>
              </>
            )}
          </p>
          {save.status === "saving" && (
            <p className="bcc-mono mt-3 text-[10px] text-bcc-text-secondary/70">
              Saving…
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function tierClassName(tier: CardTier): string {
  // Tailwind/JIT can't see dynamic class joins, so the receiving
  // .bcc-onboarding-chip-{name} CSS rules must be statically present in
  // globals.css. Same name set as §C1 (legendary/rare/uncommon/common,
  // plus a "neutral" fallback for risky/null which the chip still
  // renders since it represents *a pull happened*).
  switch (tier) {
    case "legendary": return "legendary";
    case "rare":      return "rare";
    case "uncommon":  return "uncommon";
    case "common":    return "common";
    case null:        return "neutral";
  }
}
