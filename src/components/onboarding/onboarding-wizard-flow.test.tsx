/**
 * OnboardingWizard — the step machine, its URL, and its announcements.
 *
 * This file exists because the wizard had NO behavioural coverage at all:
 * 83 test files, 46 of them rendering, and not one exercised a step
 * transition, a Back press, or the completion call. A full rewrite of the
 * flow broke nothing in CI. Everything asserted here is behaviour a visitor
 * can observe, driven through the real components.
 *
 * Leaf hooks are mocked at the module boundary (the house idiom — see
 * card-message-action.test.tsx). `@/lib/env` is mocked in every file that
 * can reach it: `lib/env.ts` throws at module load without
 * NEXT_PUBLIC_BCC_API_URL, and CI runs `vitest` with no .env.local, so an
 * unmocked test passes locally and fails only on the runner.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const replaceSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn(), refresh: vi.fn() }),
}));

// ── Mutation spies. The "navigating writes nothing" assertions read THESE,
//    not the absence of a button — a control can be removed while the write
//    survives somewhere else.
const watchMutate = vi.fn();
const unwatchMutate = vi.fn();
const updatePrefsMutate = vi.fn();
const pushEnableMutate = vi.fn();
const completeAsync = vi.fn(() => new Promise(() => {})); // never settles
const updateBioMutate = vi.fn();

vi.mock("@/hooks/useWatching", () => ({
  useWatching: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useWatch", () => ({
  useWatchMutation: () => ({ mutate: watchMutate, isPending: false }),
  useUnwatchMutation: () => ({ mutate: unwatchMutate, isPending: false }),
}));
vi.mock("@/hooks/useOnboardingSuggestions", () => ({
  ONBOARDING_SUGGESTIONS_KEY: ["onboarding", "suggestions"],
  useOnboardingSuggestions: () => ({
    data: { validators: [], projects: [], creators: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => ({
    data: { email_digest: false, bell: { a: true }, push: { enabled: false } },
    isLoading: false,
  }),
  useUpdateNotificationPrefs: () => ({ mutate: updatePrefsMutate, isPending: false }),
}));
vi.mock("@/hooks/usePushSubscription", () => ({
  usePushSubscription: () => ({
    isSupported: true,
    isReady: true,
    enable: { mutate: pushEnableMutate, isPending: false, isError: false, error: null },
    disable: { mutate: vi.fn(), isPending: false, isError: false, error: null },
  }),
}));
vi.mock("@/hooks/useCompleteOnboarding", () => ({
  useCompleteOnboarding: () => ({ mutateAsync: completeAsync }),
}));
vi.mock("@/hooks/useUpdateProfile", () => ({
  useUploadAvatar: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAvatar: () => ({ mutate: vi.fn(), isPending: false }),
  useUploadCover: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateBio: () => ({ mutate: updateBioMutate, isPending: false }),
}));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

const { OnboardingWizard, isValidStep, screenNumber, TOTAL_SCREENS } = await import(
  "@/components/onboarding/OnboardingWizard"
);

const PROFILE = {
  handle: "tester",
  display_name: "Tester",
  avatar_url: "",
  cover_photo_url: null,
  cover_photo_position: { x: 50, y: 50 },
  bio: "",
} as never;

function renderWizard(initialStep?: string) {
  return render(
    <OnboardingWizard
      handle="tester"
      profile={PROFILE}
      {...(initialStep !== undefined ? { initialStep: initialStep as never } : {})}
    />,
  );
}

/** The rail's readout — the thing a visitor actually reads. */
const readout = () => document.querySelector(".bcc-onb-rail")?.textContent ?? "";
const heading = () => document.querySelector("h1")?.textContent ?? "";
/** Buttons by accessible name. Text matching alone picks up ancestors and
 *  prose ("Skip and set it later." on the identity lede), so every control
 *  is addressed by role. */
const btn = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const queryText = (t: string) =>
  screen.queryByText((c) => c.replace(/\s+/g, " ").includes(t));

const GO = /let.s go/i;
const CONTINUE = /^continue/i;
const BACK = /back/i;
const SKIP_ONLY = /^skip$/i;
const SKIP_SETUP = /skip setup/i;

/** Dispatch a real PopStateEvent — `state` is a getter, so Object.assign
 *  onto a plain Event silently produces `state: undefined`. */
function popstate(state: unknown) {
  fireEvent(window, new PopStateEvent("popstate", { state }));
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  if (!("IntersectionObserver" in window)) {
    // LandingReveal observes; without this it takes its no-observer path,
    // which is itself the behaviour asserted in the progressive-rendering
    // test file. Here we just need it not to throw.
    (window as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/onboarding");
});

afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────
// Step order — the lineup a visitor walks, in order.
// ─────────────────────────────────────────────────────────────────────

describe("top-level step order", () => {
  it("starts on welcome and advances welcome → identity → trust → watching → notifications", () => {
    renderWizard();
    expect(heading()).toContain("You’re in");

    fireEvent.click(btn(GO));
    expect(heading()).toContain("Put a face to it");

    fireEvent.click(btn(CONTINUE));
    expect(heading()).toContain("What this is");

    // trust screen 2 — same top-level step, second screen
    fireEvent.click(btn(CONTINUE));
    expect(heading()).toContain("How reputation works");

    fireEvent.click(btn(CONTINUE));
    expect(heading()).toContain("Pick who to watch");

    fireEvent.click(btn(CONTINUE));
    expect(heading()).toContain("How should we reach you");
  });

  it("Back walks the same path in reverse, including through trust's two screens", () => {
    renderWizard("watching");
    fireEvent.click(btn(BACK));
    // Lands on trust — and specifically its SECOND screen is not required;
    // the wizard resets the sub-screen, so we arrive at the primer.
    expect(heading()).toContain("What this is");

    fireEvent.click(btn(BACK));
    expect(heading()).toContain("Put a face to it");

    fireEvent.click(btn(BACK));
    expect(heading()).toContain("You’re in");
  });

  it("Skip setup on welcome jumps straight to the send-off", () => {
    renderWizard();
    fireEvent.click(btn(SKIP_SETUP));
    expect(completeAsync).toHaveBeenCalledTimes(1);
  });

  it("Skip on the notifications step advances without writing preferences", () => {
    renderWizard("notifications");
    fireEvent.click(btn(SKIP_ONLY));
    expect(updatePrefsMutate).not.toHaveBeenCalled();
    expect(completeAsync).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The honest readout — this is the regression that shipped.
// ─────────────────────────────────────────────────────────────────────

describe("progress readout counts SCREENS, not steps", () => {
  it("totals seven screens because trust renders two", () => {
    expect(TOTAL_SCREENS).toBe(7);
  });

  it("advances the number when trust moves between its two inner screens", () => {
    renderWizard("trust");
    expect(readout()).toContain("Step 3 of 7");

    fireEvent.click(btn(CONTINUE));
    expect(heading()).toContain("How reputation works");
    // The bug: this used to still say "Step 3 of 6", so Continue looked
    // like it had done nothing and the bar stalled across two screens.
    expect(readout()).toContain("Step 4 of 7");
  });

  it("numbers every screen distinctly from first to last", () => {
    const seen = [
      screenNumber("welcome", 1),
      screenNumber("identity", 1),
      screenNumber("trust", 1),
      screenNumber("trust", 2),
      screenNumber("watching", 1),
      screenNumber("notifications", 1),
      screenNumber("dopamine", 1),
    ];
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("exposes real progressbar semantics instead of hiding the bar", () => {
    renderWizard("watching");
    const bar = document.querySelector('[role="progressbar"]');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute("aria-valuenow")).toBe("5");
    expect(bar?.getAttribute("aria-valuemax")).toBe("7");
    // It used to be aria-hidden with no role, so the count was drawn but
    // never exposed.
    expect(document.querySelector(".bcc-onb-progress")?.getAttribute("aria-hidden")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// The URL is the step.
// ─────────────────────────────────────────────────────────────────────

describe("browser navigation", () => {
  it("writes the step into the URL as the visitor advances", () => {
    renderWizard();
    fireEvent.click(btn(GO));
    expect(window.location.search).toContain("step=identity");
  });

  it("restores the previous screen on Back rather than leaving the wizard", () => {
    renderWizard();
    fireEvent.click(btn(GO));
    expect(heading()).toContain("Put a face to it");

    popstate({ bccOnboardingStep: "welcome" });
    expect(heading()).toContain("You’re in");
  });

  it("restores a forward entry the same way", () => {
    renderWizard();
    popstate({ bccOnboardingStep: "notifications" });
    expect(heading()).toContain("How should we reach you");
  });

  it("falls back to welcome when a history entry carries an unknown step", () => {
    renderWizard("watching");
    window.history.replaceState(null, "", "/onboarding?step=not-a-step");
    popstate(null);
    expect(heading()).toContain("You’re in");
  });

  it("seeds a history entry on arrival so the first Back has somewhere to land", () => {
    renderWizard();
    expect(window.location.search).toContain("step=welcome");
  });
});

describe("history hygiene", () => {
  /** Count pushState calls without breaking real history behaviour. */
  function countPushes(run: () => void): number {
    const original = window.history.pushState.bind(window.history);
    let pushes = 0;
    const spy = vi
      .spyOn(window.history, "pushState")
      .mockImplementation((...args: Parameters<History["pushState"]>) => {
        pushes += 1;
        original(...args);
      });
    try {
      run();
    } finally {
      spy.mockRestore();
    }
    return pushes;
  }

  it("pushes exactly ONE entry per screen change", () => {
    renderWizard();
    // The regression: pushState used to live inside the setState updater,
    // and React may invoke an updater more than once (StrictMode does, in
    // dev) — which produced a duplicate entry per Continue and made one
    // browser Back appear to do nothing.
    const pushes = countPushes(() => {
      fireEvent.click(btn(GO));
    });
    expect(pushes).toBe(1);
  });

  it("pushes nothing when a move lands on the screen already showing", () => {
    renderWizard("watching");
    const pushes = countPushes(() => {
      // popstate applies a position; it must never push one back.
      popstate({ bccOnboardingStep: "watching", bccOnboardingScreen: 1 });
    });
    expect(pushes).toBe(0);
  });

  it("normalises the entry URL with replaceState, never a push", () => {
    const pushes = countPushes(() => {
      renderWizard();
    });
    expect(pushes).toBe(0);
    expect(window.location.search).toContain("step=welcome");
  });
});

describe("the trust step's two screens are real history entries", () => {
  it("puts the inner screen in the URL", () => {
    renderWizard("trust");
    fireEvent.click(btn(CONTINUE));
    expect(heading()).toContain("How reputation works");
    expect(window.location.search).toContain("step=trust");
    expect(window.location.search).toContain("screen=2");
  });

  it("browser Back from screen 2 lands on screen 1, not the previous step", () => {
    renderWizard("trust");
    fireEvent.click(btn(CONTINUE));
    expect(heading()).toContain("How reputation works");

    // Before this was hoisted into the URL, history knew about one screen
    // where the visitor saw two, so Back skipped to the identity step.
    popstate({ bccOnboardingStep: "trust", bccOnboardingScreen: 1 });
    expect(heading()).toContain("What this is");
  });

  it("restores screen 2 from a ?screen= deep link on refresh", () => {
    window.history.replaceState(null, "", "/onboarding?step=trust&screen=2");
    renderWizard("trust");
    expect(heading()).toContain("How reputation works");
    expect(readout()).toContain("Step 4 of 7");
  });

  it("clamps a nonsense ?screen= to the first screen", () => {
    for (const bad of ["0", "9", "-1", "abc", "2.5", "2abc", "%202", "", "02", "+2"]) {
      cleanup();
      window.history.replaceState(null, "", `/onboarding?step=trust&screen=${bad}`);
      renderWizard("trust");
      expect(heading(), `screen=${bad}`).toContain("What this is");
    }
  });

  it("ignores ?screen= on a step that has only one screen", () => {
    window.history.replaceState(null, "", "/onboarding?step=watching&screen=2");
    renderWizard("watching");
    expect(readout()).toContain("Step 5 of 7");
  });
});

describe("resume deep-link validation", () => {
  it("accepts every real step", () => {
    for (const s of ["welcome", "identity", "trust", "watching", "notifications", "dopamine"]) {
      expect(isValidStep(s)).toBe(true);
    }
  });

  it("rejects anything else, including near-misses and injection-shaped input", () => {
    for (const s of ["", "Welcome", "wat", "dopamine ", "__proto__", "<script>"]) {
      expect(isValidStep(s)).toBe(false);
    }
  });

  it("starts at the requested step when the deep link is valid", () => {
    renderWizard("notifications");
    expect(heading()).toContain("How should we reach you");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Announcement + focus.
// ─────────────────────────────────────────────────────────────────────

describe("screen changes are announced and take focus", () => {
  it("moves focus to the new screen's heading", async () => {
    renderWizard();
    fireEvent.click(btn(GO));
    await waitFor(() => {
      expect(document.activeElement?.tagName).toBe("H1");
      expect(document.activeElement?.textContent).toContain("Put a face to it");
    });
  });

  it("does not steal focus on first mount", () => {
    renderWizard();
    expect(document.activeElement).toBe(document.body);
  });

  it("announces the current screen through exactly one polite live region", () => {
    renderWizard("watching");
    const live = document.querySelectorAll('[aria-live="polite"]');
    expect(live).toHaveLength(1);
    expect(live[0]?.textContent).toContain("Step 5 of 7");
  });

  it("stands its announcer down on the send-off, which owns its own live region", () => {
    renderWizard("dopamine");
    // Exactly one live region on screen — the send-off's — never two
    // announcing over each other.
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(document.querySelector(".sr-only")).toBeNull();
  });
});

describe("heading structure", () => {
  it("gives every screen exactly one h1 and never skips a level", () => {
    for (const step of ["welcome", "identity", "trust", "watching", "notifications"]) {
      cleanup();
      renderWizard(step);
      const levels = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].map((h) =>
        Number(h.tagName.slice(1)),
      );
      expect(levels.filter((l) => l === 1), `${step} h1 count`).toHaveLength(1);
      // No jump of more than one level between consecutive headings —
      // welcome and notifications both went h1 → h3 before this.
      for (let i = 1; i < levels.length; i += 1) {
        expect(
          (levels[i] ?? 0) - (levels[i - 1] ?? 0),
          `${step}: h${levels[i - 1]} → h${levels[i]}`,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Consent: navigating the wizard writes nothing about Halls or follows.
// ─────────────────────────────────────────────────────────────────────

describe("navigating the wizard performs no membership or follow write", () => {
  it("writes nothing while walking every screen forward", () => {
    renderWizard();
    fireEvent.click(btn(GO));
    fireEvent.click(btn(CONTINUE)); // identity → trust
    fireEvent.click(btn(CONTINUE)); // trust 1 → 2
    fireEvent.click(btn(CONTINUE)); // trust → watching
    fireEvent.click(btn(CONTINUE)); // watching → notifications

    expect(watchMutate).not.toHaveBeenCalled();
    expect(unwatchMutate).not.toHaveBeenCalled();
    expect(updatePrefsMutate).not.toHaveBeenCalled();
    expect(pushEnableMutate).not.toHaveBeenCalled();
    expect(updateBioMutate).not.toHaveBeenCalled();
  });

  it("renders no Hall join, leave or primary control anywhere in the wizard", () => {
    for (const step of ["welcome", "identity", "trust", "watching", "notifications"]) {
      cleanup();
      renderWizard(step);
      expect(queryText("JOIN HALL")).toBeNull();
      expect(queryText("SET AS PRIMARY")).toBeNull();
      expect(queryText("PRIMARY · CLEAR")).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Navigation must never be held hostage by an in-flight write.
// ─────────────────────────────────────────────────────────────────────

describe("a hung mutation never traps the visitor", () => {
  it("leaves Back enabled on the watching step", () => {
    renderWizard("watching");
    const back = btn(BACK);
    expect(back.disabled).toBe(false);
  });

  it("leaves Back and Skip enabled on the identity step", () => {
    renderWizard("identity");
    expect(btn(BACK).disabled).toBe(false);
    expect(btn(SKIP_ONLY).disabled).toBe(false);
  });
});
