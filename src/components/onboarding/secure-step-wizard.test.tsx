/**
 * OnboardingWizard — the conditional "secure" step (F-332).
 *
 * The step exists only for an account GET /wallets reports without a
 * recovery email. Everyone else walks the original lineup and count; a
 * deep link to the step for them moves on instead of showing a blank
 * screen. Mocks mirror onboarding-wizard-flow.test.tsx.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
// The knob this file turns: what GET /wallets says about recovery.
const walletsState: { data: unknown; isPending: boolean } = { data: undefined, isPending: false };
vi.mock("@/hooks/useWallets", () => ({
  MY_WALLETS_QUERY_KEY: ["me", "wallets"],
  useMyWallets: () => walletsState,
}));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

const { OnboardingWizard, isValidStep, TOTAL_SCREENS, totalScreens } = await import(
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

function setHasRecovery(has: boolean) {
  walletsState.data = {
    items: [],
    recovery: { has_recovery_email: has, verified_wallet_count: 1 },
  };
}

function wizard(initialStep?: string) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <OnboardingWizard
        handle="tester"
        profile={PROFILE}
        {...(initialStep !== undefined ? { initialStep: initialStep as never } : {})}
      />
    </QueryClientProvider>
  );
}

const readout = () => document.querySelector(".bcc-onb-rail")?.textContent ?? "";
const heading = () => document.querySelector("h1")?.textContent ?? "";
const btn = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

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
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/onboarding");
  walletsState.isPending = false;
  setHasRecovery(true);
});

afterEach(cleanup);

describe("an account that already has a recovery email", () => {
  it("never sees the step: welcome goes straight to identity, seven screens", () => {
    render(wizard());
    expect(readout()).toContain("Step 1 of 7");
    fireEvent.click(btn(/let.s go/i));
    expect(heading()).toContain("Put a face to it");
    expect(readout()).toContain("Step 2 of 7");
    fireEvent.click(btn(/back/i));
    expect(heading()).toContain("You’re in");
  });

  it("moves a ?step=secure deep link on to identity instead of a blank screen", () => {
    window.history.replaceState(null, "", "/onboarding?step=secure");
    render(wizard("secure"));
    expect(heading()).toContain("Put a face to it");
    expect(window.location.search).toBe("?step=identity");
    expect(readout()).toContain("Step 2 of 7");
  });

  it("keeps the base count while /wallets is still loading", () => {
    walletsState.data = undefined;
    walletsState.isPending = true;
    render(wizard());
    expect(readout()).toContain("Step 1 of 7");
  });

  it("also omits the step when the /wallets read failed", () => {
    walletsState.data = undefined;
    render(wizard());
    fireEvent.click(btn(/let.s go/i));
    expect(heading()).toContain("Put a face to it");
  });
});

describe("a wallet-only account without a recovery email", () => {
  beforeEach(() => setHasRecovery(false));

  it("gets the step right after welcome, counted in the progress", () => {
    render(wizard());
    expect(readout()).toContain("Step 1 of 8");
    fireEvent.click(btn(/let.s go/i));
    expect(heading()).toBe("Secure your account");
    expect(readout()).toContain("Step 2 of 8");
    expect(window.location.search).toBe("?step=secure");

    fireEvent.click(btn(/skip for now/i));
    expect(heading()).toContain("Put a face to it");
    expect(readout()).toContain("Step 3 of 8");

    // Back from identity returns to the step, not past it.
    fireEvent.click(btn(/back/i));
    expect(heading()).toBe("Secure your account");
    fireEvent.click(btn(/back/i));
    expect(heading()).toContain("You’re in");
  });

  it("keeps the step in place once /wallets flips to true underneath it", () => {
    const view = render(wizard("secure"));
    expect(heading()).toBe("Secure your account");
    // Verifying invalidates /wallets, which then says true. The step must
    // not vanish from under the visitor, nor the count jump backwards.
    setHasRecovery(true);
    view.rerender(wizard("secure"));
    expect(heading()).toBe("Secure your account");
    expect(readout()).toContain("Step 2 of 8");
  });
});

describe("the step machine knows the new step", () => {
  it("accepts secure as a deep-link step", () => {
    expect(isValidStep("secure")).toBe(true);
  });

  it("counts eight screens only when the step applies", () => {
    expect(TOTAL_SCREENS).toBe(7);
    expect(totalScreens(false)).toBe(7);
    expect(totalScreens(true)).toBe(8);
  });
});
