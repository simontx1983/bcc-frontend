"use client";

/**
 * OnboardingWizard — the post-signup setup surface.
 *
 * Redesigned onto the page-chrome token system (`bcc-onb-*`, matching the
 * landing "LEDGER" direction) — the old workshop/cardstock palette is gone.
 * Streamlined lineup (6 top-level steps, 7 screens — see STEP_SCREENS):
 *
 *   1. "welcome"       — one-line framing + a 3-card preview of setup.
 *                        Primary "Let's go"; "Skip setup" jumps straight to
 *                        the send-off (which still fires /complete).
 *   2. "identity"      — avatar · cover · bio. Skippable. Seeded from the
 *                        server-fetched MemberProfile; media commits
 *                        immediately, bio saves on Continue.
 *   3. "trust"         — the constitutionally-locked "How the graph works"
 *                        teaching (§J.7), restyled into 2 screens. Copy is
 *                        verbatim; only the presentation changed.
 *   4. "watching"      — first-watch suggestions. Each Watch commits to the
 *                        watchlist immediately. The home-chain pick is folded
 *                        in here as a "bias toward" chip row (persisted on
 *                        the final /complete call).
 *   5. "notifications" — bell / email digest / push opt-ins.
 *   6. "dopamine"      — the §O1 send-off. Cards fly to a watchlist dock,
 *                        the /complete mutation fires in parallel, then routes
 *                        to /. Reduced-motion sees a still tile.
 *
 * The home-chain choice lives in wizard state (`homeChain`) and threads to
 * the watching step's bias chips + the dopamine step's /complete call.
 *
 * ## Three things this component owns beyond the step machine
 *
 * 1. **The URL is the step.** `?step=` is pushed with `window.history`
 *    (Next 14+ supports this for same-path query updates without re-running
 *    the server component — important here, because a router.push would
 *    re-fetch /me/onboarding/status on every Continue). `popstate` maps
 *    Back/Forward onto the machine, and a refresh is restored server-side.
 *
 * 2. **Progress is announced, not just drawn.** The bar carries real
 *    progressbar semantics and a single polite live region announces each
 *    screen. It stands down on the send-off, which owns its own live region
 *    for save status — two live regions racing is worse than none.
 *
 * 3. **Progress persistence is not cleared here on reaching the send-off.**
 *    It used to be, which meant a failed /complete left the visitor with no
 *    resume point at all. DopamineStep now clears it on SUCCESS.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { DopamineStep } from "@/components/onboarding/DopamineStep";
import { FirstPullsStep } from "@/components/onboarding/FirstPullsStep";
import { IdentityStep } from "@/components/onboarding/IdentityStep";
import { NotificationsStep } from "@/components/onboarding/NotificationsStep";
import { OnboardingTrustLayerSteps } from "@/components/onboarding/OnboardingTrustLayerSteps";
import { WelcomeStep } from "@/components/onboarding/WelcomeStep";
import { useWizardPulls } from "@/components/onboarding/useWizardPulls";
import { setOnboardingProgress } from "@/lib/onboarding/storage";
import type { HomeChain, MemberProfile } from "@/lib/api/types";

// ─────────────────────────────────────────────────────────────────────
// Step machine
// ─────────────────────────────────────────────────────────────────────

export type Step =
  | "welcome"
  | "identity"
  | "trust"
  | "watching"
  | "notifications"
  | "dopamine";

// Ordered for the progress bar. `dopamine` is the send-off — it reads as
// "done", so the bar sits at 100% there.
const STEP_ORDER: readonly Step[] = [
  "welcome",
  "identity",
  "trust",
  "watching",
  "notifications",
  "dopamine",
];

/**
 * How many SCREENS each step actually renders. Only `trust` differs: it is
 * one step in the machine but two screens on the visitor's side (§J.7's
 * locked copy is laid out as "What this is." then "How reputation works.").
 *
 * The rail used to say "Step 3 of 6" on both of those screens, so pressing
 * Continue appeared to do nothing to the count and the bar stalled. Counting
 * screens rather than steps is what makes the readout honest.
 */
const STEP_SCREENS: Record<Step, number> = {
  welcome: 1,
  identity: 1,
  trust: 2,
  watching: 1,
  notifications: 1,
  dopamine: 1,
};

/** 7 — six steps, with `trust` contributing two screens. */
export const TOTAL_SCREENS = STEP_ORDER.reduce((sum, s) => sum + STEP_SCREENS[s], 0);

/** Type guard for a resume deep link's `?step=` query param — untrusted input. */
export function isValidStep(value: string): value is Step {
  return (STEP_ORDER as readonly string[]).includes(value);
}

/**
 * 1-based index of the screen a visitor is looking at, counting the trust
 * step's two inner screens separately. Exported for the test that pins the
 * readout — the honesty of this number is the whole point.
 */
/**
 * Clamp an untrusted `?screen=` / history value to what the step actually
 * has. Only `trust` renders more than one screen, so everything else is
 * pinned to 1 no matter what the URL claims.
 */
export function normaliseScreen(step: Step, raw: unknown): number {
  if (step !== "trust") return 1;
  if (typeof raw === "number") return raw === 2 ? 2 : 1;
  // Exact-match, not parseInt: `parseInt("2.5")` is 2, and `parseInt("2abc")`
  // is 2, so a lenient parse would honour input that is not the value it
  // claims to be. This is untrusted query input; only "2" means screen two.
  return raw === "2" ? 2 : 1;
}

/**
 * 1-based index of the screen a visitor is looking at, counting the trust
 * step's two inner screens separately. Exported for the test that pins the
 * readout — the honesty of this number is the whole point.
 */
export function screenNumber(step: Step, trustScreenIndex: number): number {
  let count = 0;
  for (const s of STEP_ORDER) {
    if (s === step) break;
    count += STEP_SCREENS[s];
  }
  const within = step === "trust" ? Math.min(Math.max(trustScreenIndex, 1), 2) : 1;
  return count + within;
}

// Exported so step components can reuse the exact same label for their
// own in-step eyebrow instead of hardcoding a second literal that can
// drift out of sync (see OnboardingTrustLayerSteps.tsx) — "Learn the
// graph" (was "How the graph works") is also now clearly distinct from
// that step's own "How reputation works." headline.
export const STEP_LABEL: Record<Step, string> = {
  welcome:       "Welcome",
  identity:      "Your identity",
  trust:         "Learn the graph",
  watching:      "Start watching",
  notifications: "Stay posted",
  dopamine:      "You're on the floor",
};

export interface OnboardingWizardProps {
  handle: string;
  /** Server-fetched own profile — seeds the identity step's avatar/cover/bio. */
  profile: MemberProfile;
  /**
   * Deep-link entry point for the "resume setup?" prompt (task 7) — start
   * the machine here instead of "welcome". Omitted → normal fresh start.
   */
  initialStep?: Step;
}

export function OnboardingWizard({ handle, profile, initialStep }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>(initialStep ?? "welcome");
  const [trustScreen, setTrustScreen] = useState(1);
  const [homeChain, setHomeChain] = useState<HomeChain | null>(null);
  const pulls = useWizardPulls();

  const mainRef = useRef<HTMLElement | null>(null);
  // Skip the focus/announce effect on first mount — landing on a fresh
  // wizard should not steal focus or announce anything the visitor did not
  // cause. Only real transitions move focus.
  const mountedRef = useRef(false);

  /**
   * Mirrors the rendered position so `goTo` can compare against it without
   * re-creating the callback on every move. A ref, not the state value,
   * because the push below MUST NOT live inside a setState updater — React
   * may invoke an updater more than once (StrictMode does exactly that in
   * dev), and a side effect in there pushed a duplicate history entry per
   * Continue. Updaters stay pure; the navigation happens once, here.
   */
  const posRef = useRef<{ step: Step; screen: number }>({
    step: initialStep ?? "welcome",
    screen: 1,
  });

  /**
   * Move to a screen, pushing exactly one history entry so browser Back
   * returns to the previous SCREEN rather than leaving onboarding.
   *
   * `window.history.pushState` (not router.push) is deliberate: the path is
   * unchanged and only the query moves, so Next leaves the server component
   * alone. router.push would re-run `/onboarding`'s page — re-fetching
   * /me/onboarding/status on every Continue.
   *
   * `screen` carries the trust step's inner position. Without it in the URL,
   * browser Back from "How reputation works." skipped straight past "What
   * this is." to the identity step — the one place the rendered count says
   * there are two screens but history knew about one.
   */
  const goTo = useCallback((next: Step, screen = 1) => {
    const cur = posRef.current;
    if (cur.step === next && cur.screen === screen) return;
    posRef.current = { step: next, screen };
    if (typeof window !== "undefined") {
      const q = screen > 1 ? `?step=${next}&screen=${String(screen)}` : `?step=${next}`;
      window.history.pushState(
        { bccOnboardingStep: next, bccOnboardingScreen: screen },
        "",
        `${window.location.pathname}${q}`,
      );
    }
    setStep(next);
    setTrustScreen(screen);
  }, []);

  /** Apply a position that came from history/URL — never pushes. */
  const applyPosition = useCallback((next: Step, screen: number) => {
    posRef.current = { step: next, screen };
    setStep(next);
    setTrustScreen(screen);
  }, []);

  // Back/Forward. The state we pushed is authoritative; fall back to parsing
  // the query so an entry pushed by something else (or a restored session)
  // still resolves, and anything unrecognised lands on "welcome".
  useEffect(() => {
    const onPop = (event: PopStateEvent) => {
      const s = event.state as
        | { bccOnboardingStep?: unknown; bccOnboardingScreen?: unknown }
        | null;
      const fromState = s?.bccOnboardingStep;
      if (typeof fromState === "string" && isValidStep(fromState)) {
        applyPosition(fromState, normaliseScreen(fromState, s?.bccOnboardingScreen));
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("step");
      const nextStep = raw !== null && isValidStep(raw) ? raw : "welcome";
      applyPosition(nextStep, normaliseScreen(nextStep, params.get("screen")));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [applyPosition]);

  // Seed history with the entry the visitor arrived on, so the FIRST Back
  // press has somewhere to land instead of leaving the wizard, and honour a
  // `?screen=` deep link (a refresh on trust's second screen).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("step");
    const entryStep: Step = raw !== null && isValidStep(raw) ? raw : initialStep ?? "welcome";
    const entryScreen = normaliseScreen(entryStep, params.get("screen"));
    posRef.current = { step: entryStep, screen: entryScreen };
    if (entryScreen > 1) setTrustScreen(entryScreen);
    // replaceState, never push: normalising the entry URL must not add a
    // history entry of its own.
    const q = entryScreen > 1
      ? `?step=${entryStep}&screen=${String(entryScreen)}`
      : `?step=${entryStep}`;
    window.history.replaceState(
      { bccOnboardingStep: entryStep, bccOnboardingScreen: entryScreen },
      "",
      `${window.location.pathname}${q}`,
    );
    // Intentionally mount-only: this normalises the entry URL once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step-progress persistence (task 7) — the local half of "resume setup?".
  //
  // NOTE: reaching the send-off deliberately does NOT clear this any more.
  // It used to, which meant a /complete failure stranded the visitor with a
  // cleared resume point AND an un-onboarded account. DopamineStep clears it
  // once the server has actually confirmed completion.
  useEffect(() => {
    if (step !== "dopamine") {
      setOnboardingProgress(step);
    }
  }, [step]);

  // Move focus to the new screen's heading so keyboard and screen-reader
  // users are taken to the content they just asked for. The <h1> is made
  // programmatically focusable by the step components' own markup; falling
  // back to the <main> keeps focus inside the wizard either way.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    const root = mainRef.current;
    if (root === null) return;
    const heading = root.querySelector<HTMLElement>("h1");
    const target = heading ?? root;
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: false });
  }, [step, trustScreen]);

  const currentScreen = screenNumber(step, trustScreen);
  const progressPct = Math.round(((currentScreen - 1) / (TOTAL_SCREENS - 1)) * 100);
  const readout = `Step ${currentScreen} of ${TOTAL_SCREENS} · ${STEP_LABEL[step]}`;

  return (
    <div className="bcc-onb-root">
      {/* Ambient field — reused from the landing background treatment. */}
      <div className="bcc-ldg-field" aria-hidden>
        <div className="bcc-ldg-field-grid" />
        <div className="bcc-ldg-field-glow bcc-ldg-field-g1" />
        <div className="bcc-ldg-field-glow bcc-ldg-field-g2" />
      </div>

      <header className="bcc-onb-rail">
        <span>
          <span className="bcc-onb-rail-dot" />
          BCC // Onboarding · {readout}
        </span>
        <span className="who">@{handle}</span>
      </header>

      <div className="bcc-onb-progress">
        <div
          className="bcc-onb-progress-track"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_SCREENS}
          aria-valuenow={currentScreen}
          aria-valuetext={readout}
          aria-label="Setup progress"
        >
          <div className="bcc-onb-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/*
        ONE polite announcer for screen changes. It stands down on the
        send-off, which carries its own aria-live for save status — two live
        regions announcing over each other is worse than a silent one.
      */}
      {step !== "dopamine" && (
        <div className="sr-only" role="status" aria-live="polite">
          {readout}
        </div>
      )}

      <main className="bcc-onb-wrap" ref={mainRef}>
        {step === "welcome" && (
          <WelcomeStep
            handle={handle}
            onStart={() => goTo("identity")}
            onSkipAll={() => goTo("dopamine")}
          />
        )}

        {step === "identity" && (
          <IdentityStep
            profile={profile}
            onBack={() => goTo("welcome")}
            onDone={() => goTo("trust")}
          />
        )}

        {step === "trust" && (
          <OnboardingTrustLayerSteps
            onBack={() => goTo("identity")}
            onDone={() => goTo("watching")}
            screen={trustScreen}
            onScreenChange={(n) => goTo("trust", n)}
          />
        )}

        {step === "watching" && (
          <FirstPullsStep
            pulls={pulls}
            homeChain={homeChain}
            onSelectChain={setHomeChain}
            onBack={() => goTo("trust")}
            onDone={() => goTo("notifications")}
          />
        )}

        {step === "notifications" && (
          <NotificationsStep
            onBack={() => goTo("watching")}
            onDone={() => goTo("dopamine")}
          />
        )}

        {step === "dopamine" && (
          <DopamineStep homeChain={homeChain} pulledCards={pulls.snapshot()} />
        )}
      </main>
    </div>
  );
}
