/**
 * OnboardingWizard — `onboarding_step_viewed` / `onboarding_step_completed`.
 *
 * Both carry exactly `{ step }`, the STEP_ORDER slug. Viewed fires once per
 * step per mount; completed fires when the visitor advances PAST a step
 * (not on Back, not on trust's inner screen change). Module mocks copied
 * from onboarding-wizard-flow.test.tsx, plus the analytics wrapper.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const replaceSpy = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceSpy, push: vi.fn(), refresh: vi.fn() }),
}));

// Step progress is viewer-scoped, so the wizard needs a session. This suite is
// about the step machine, not about who is signed in.
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "4242" } }, status: "authenticated" }),
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
// F-332: the wizard reads GET /wallets to decide whether the conditional
// "secure" step applies. An account WITH a recovery email keeps the
// original six-step lineup this suite pins.
vi.mock("@/hooks/useWallets", () => ({
  MY_WALLETS_QUERY_KEY: ["me", "wallets"],
  useMyWallets: () => ({
    data: { items: [], recovery: { has_recovery_email: true, verified_wallet_count: 1 } },
    isPending: false,
  }),
}));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

const capture = vi.fn();
vi.mock("@/lib/analytics/posthog", async (importActual) => ({
  ...(await importActual<Record<string, unknown>>()),
  captureAnalyticsEvent: (...a: unknown[]) => capture(...a),
}));

const { OnboardingWizard } = await import(
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

const btn = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const GO = /let.s go/i;
const CONTINUE = /^continue/i;
const BACK = /back/i;
const SKIP_SETUP = /skip setup/i;

/** The `step` values sent with `name`, in order. */
const stepsFor = (name: string) =>
  capture.mock.calls.filter((c) => c[0] === name).map((c) => c[1] as { step: string });

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  if (!("IntersectionObserver" in window)) {
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

describe("onboarding step analytics", () => {
  it("sends viewed and completed with exactly { step } as the visitor walks forward", () => {
    render(<OnboardingWizard handle="tester" profile={PROFILE} />);
    expect(stepsFor("onboarding_step_viewed")).toEqual([{ step: "welcome" }]);

    fireEvent.click(btn(GO));
    fireEvent.click(btn(CONTINUE)); // identity -> trust
    fireEvent.click(btn(CONTINUE)); // trust screen 1 -> 2: same step
    fireEvent.click(btn(CONTINUE)); // trust -> watching
    fireEvent.click(btn(CONTINUE)); // watching -> notifications

    expect(stepsFor("onboarding_step_viewed")).toEqual([
      { step: "welcome" },
      { step: "identity" },
      { step: "trust" },
      { step: "watching" },
      { step: "notifications" },
    ]);
    expect(stepsFor("onboarding_step_completed")).toEqual([
      { step: "welcome" },
      { step: "identity" },
      { step: "trust" },
      { step: "watching" },
    ]);
    for (const [, props] of capture.mock.calls.filter((c) => String(c[0]).startsWith("onboarding_step_"))) {
      expect(Object.keys(props as object)).toEqual(["step"]);
    }
  });

  it("views each step once per mount, and Back completes nothing", () => {
    render(<OnboardingWizard handle="tester" profile={PROFILE} initialStep="watching" />);
    fireEvent.click(btn(BACK)); // -> trust
    fireEvent.click(btn(BACK)); // -> identity
    fireEvent.click(btn(CONTINUE)); // -> trust again

    expect(stepsFor("onboarding_step_viewed")).toEqual([
      { step: "watching" },
      { step: "trust" },
      { step: "identity" },
    ]);
    expect(stepsFor("onboarding_step_completed")).toEqual([{ step: "identity" }]);
  });

  it("Skip setup completes welcome only, not the steps it jumps over", () => {
    render(<OnboardingWizard handle="tester" profile={PROFILE} />);
    fireEvent.click(btn(SKIP_SETUP));
    expect(stepsFor("onboarding_step_completed")).toEqual([{ step: "welcome" }]);
    expect(stepsFor("onboarding_step_viewed")).toEqual([{ step: "welcome" }, { step: "dopamine" }]);
  });
});
