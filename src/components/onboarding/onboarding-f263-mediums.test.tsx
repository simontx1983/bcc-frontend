/**
 * F-263 — UX Mediums in the onboarding wizard (2026-11-12 audit).
 *
 * M24  Leaving the identity step and coming Back showed a just-uploaded
 *      avatar and cover, and a just-saved bio, as gone, and threw away a
 *      typed bio: the step's state was local, seeded from the page's
 *      server-fetched profile. The WIZARD holds it now. Driven through the
 *      real OnboardingWizard, so the state has to survive a real unmount.
 * M26  The notifications step said nothing when the prefs could not be
 *      read: the toggles came back usable and Continue saved nothing.
 * M27  A failed push toggle showed the error's own text.
 *
 * Leaf hooks are mocked at the module boundary, as in
 * onboarding-wizard-flow.test.tsx.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "4242" } }, status: "authenticated" }),
}));

type MutateOpts<T> = { onSuccess?: (v: T) => void; onError?: (e: unknown) => void };
const h = vi.hoisted(() => ({
  uploadAvatar: vi.fn(),
  uploadCover: vi.fn(),
  deleteAvatar: vi.fn(),
  updateBio: vi.fn(),
  avatarOpts: null as null | { onSuccess?: (p: unknown) => void },
  coverOpts: null as null | { onSuccess?: (p: unknown) => void },
  prefs: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    error: null as unknown,
    refetch: vi.fn(),
  },
  push: {
    enableError: null as unknown,
  },
}));

vi.mock("@/hooks/useWatching", () => ({
  useWatching: () => ({ data: { items: [] }, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useWatch", () => ({
  useWatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUnwatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useOnboardingSuggestions", () => ({
  ONBOARDING_SUGGESTIONS_KEY: ["onboarding", "suggestions"],
  useOnboardingSuggestions: () => ({
    data: { validators: [], projects: [], creators: [] },
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => h.prefs,
  useUpdateNotificationPrefs: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/usePushSubscription", () => ({
  usePushSubscription: () => ({
    isSupported: true,
    isReady: true,
    enable: {
      mutate: vi.fn(), isPending: false,
      isError: h.push.enableError !== null, error: h.push.enableError,
    },
    disable: { mutate: vi.fn(), isPending: false, isError: false, error: null },
  }),
}));
vi.mock("@/hooks/useCompleteOnboarding", () => ({
  useCompleteOnboarding: () => ({ mutateAsync: () => new Promise(() => {}) }),
}));
vi.mock("@/hooks/useUpdateProfile", () => ({
  useUploadAvatar: (opts: { onSuccess?: (p: unknown) => void }) => {
    h.avatarOpts = opts;
    return { mutate: h.uploadAvatar, isPending: false };
  },
  useDeleteAvatar: () => ({ mutate: h.deleteAvatar, isPending: false }),
  useUploadCover: (opts: { onSuccess?: (p: unknown) => void }) => {
    h.coverOpts = opts;
    return { mutate: h.uploadCover, isPending: false };
  },
  useUpdateBio: () => ({ mutate: h.updateBio, isPending: false }),
}));
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

const { OnboardingWizard } = await import("@/components/onboarding/OnboardingWizard");
const { NotificationsStep } = await import("@/components/onboarding/NotificationsStep");
const { BccApiError } = await import("@/lib/api/types");
const { PushPermissionDeniedError, PushUnsupportedError } = await import("@/lib/push/register");

const PROFILE = {
  handle: "tester",
  display_name: "Tester",
  avatar_url: "",
  cover_photo_url: null,
  cover_photo_position: { x: 50, y: 50 },
  bio: "",
};
const AVATAR = "https://cdn.example/me.png";
const COVER = "https://cdn.example/cover.png";

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/onboarding");
  // Uploads answer with the updated profile, as the real mutations do.
  h.uploadAvatar.mockImplementation(() => h.avatarOpts?.onSuccess?.({ ...PROFILE, avatar_url: AVATAR }));
  h.uploadCover.mockImplementation(() => h.coverOpts?.onSuccess?.({ ...PROFILE, cover_photo_url: COVER }));
  h.updateBio.mockImplementation((_body: unknown, o?: MutateOpts<unknown>) => o?.onSuccess?.({}));
  h.prefs = {
    data: { email_digest: false, bell: { a: true }, push: { enabled: false } },
    isLoading: false, isError: false, error: null, refetch: vi.fn(),
  };
  h.push.enableError = null;
});
afterEach(cleanup);

const heading = () => document.querySelector("h1")?.textContent ?? "";
const btn = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;
const bioBox = () => screen.getByLabelText(/About you/) as HTMLTextAreaElement;
const fileInputs = () => document.querySelectorAll<HTMLInputElement>('input[type="file"]');
const png = () => new File(["x"], "me.png", { type: "image/png" });

function renderIdentity() {
  render(<OnboardingWizard handle="tester" profile={PROFILE as never} initialStep={"identity" as never} />);
  expect(heading()).toContain("Put a face to it");
}
/** identity → welcome → identity: the step unmounts and mounts again. */
function backAndForth() {
  fireEvent.click(btn(/back/i));
  expect(heading()).toContain("You’re in");
  fireEvent.click(btn(/let.s go/i));
  expect(heading()).toContain("Put a face to it");
}

describe("M24 — the identity step keeps what was done in it", () => {
  it("an uploaded avatar is still there after Back, with Remove still offered", () => {
    renderIdentity();
    const [, avatarInput] = fileInputs();
    fireEvent.change(avatarInput!, { target: { files: [png()] } });
    expect(screen.getByAltText("Your avatar")).toHaveAttribute("src", AVATAR);
    expect(btn(/^remove$/i)).toBeInTheDocument();

    backAndForth();
    expect(screen.getByAltText("Your avatar")).toHaveAttribute("src", AVATAR);
    expect(btn(/^remove$/i)).toBeInTheDocument();
    expect(btn(/change avatar/i)).toBeInTheDocument();
  });

  it("an uploaded cover is still there after Back", () => {
    renderIdentity();
    const [coverInput] = fileInputs();
    fireEvent.change(coverInput!, { target: { files: [png()] } });
    expect(btn(/change cover/i)).toBeInTheDocument();
    backAndForth();
    expect(btn(/change cover/i)).toBeInTheDocument();
    expect(screen.queryByText("No cover yet")).toBeNull();
  });

  it("a typed bio is kept through Back", () => {
    renderIdentity();
    fireEvent.change(bioBox(), { target: { value: "I run a validator in Ohio." } });
    backAndForth();
    expect(bioBox().value).toBe("I run a validator in Ohio.");
  });

  it("a saved bio shows as saved after coming Back from the next step, and isn't written twice", () => {
    renderIdentity();
    fireEvent.change(bioBox(), { target: { value: "  Welder.  " } });
    fireEvent.click(btn(/^continue/i));
    expect(h.updateBio).toHaveBeenCalledTimes(1);
    expect(h.updateBio).toHaveBeenCalledWith({ bio: "Welder." }, expect.anything());
    expect(heading()).toContain("What this is");

    fireEvent.click(btn(/back/i));
    expect(heading()).toContain("Put a face to it");
    expect(bioBox().value).toBe("Welder.");
    fireEvent.click(btn(/^continue/i));
    expect(h.updateBio).toHaveBeenCalledTimes(1);
  });

  it("a typed bio kept through Back plus an upload landing later: both survive", () => {
    renderIdentity();
    fireEvent.change(bioBox(), { target: { value: "Draft line" } });
    const [, avatarInput] = fileInputs();
    fireEvent.change(avatarInput!, { target: { files: [png()] } });
    // The upload's profile (server bio "") must not overwrite the draft.
    expect(bioBox().value).toBe("Draft line");
    backAndForth();
    expect(bioBox().value).toBe("Draft line");
    expect(screen.getByAltText("Your avatar")).toBeInTheDocument();
  });

  it("Skip still drops only the unsaved bio: uploads stay", () => {
    renderIdentity();
    const [, avatarInput] = fileInputs();
    fireEvent.change(avatarInput!, { target: { files: [png()] } });
    fireEvent.change(bioBox(), { target: { value: "Not saving this" } });
    fireEvent.click(btn(/^skip$/i));
    expect(heading()).toContain("What this is");
    expect(h.updateBio).not.toHaveBeenCalled();

    fireEvent.click(btn(/back/i));
    expect(bioBox().value).toBe("");
    expect(screen.getByAltText("Your avatar")).toHaveAttribute("src", AVATAR);
  });
});

function renderNotifications() {
  return render(<NotificationsStep onBack={() => {}} onDone={() => {}} />);
}

describe("M26 — the notifications step says when it couldn't read your settings", () => {
  it("shows the failure with Try again, and the toggles can't be changed", () => {
    h.prefs = {
      data: undefined, isLoading: false, isError: true,
      error: new BccApiError("bcc_unavailable", "RAW SERVER TEXT", 503, null),
      refetch: vi.fn(),
    };
    renderNotifications();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load your notification settings, so they can't be changed here yet.",
    );
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();

    fireEvent.click(btn(/^try again$/i));
    expect(h.prefs.refetch).toHaveBeenCalledTimes(1);
  });

  it("a rate limit gets its own line", () => {
    h.prefs = {
      data: undefined, isLoading: false, isError: true,
      error: new BccApiError("bcc_rate_limited", "x", 429, null),
      refetch: vi.fn(),
    };
    renderNotifications();
    expect(screen.getByRole("alert")).toHaveTextContent("Loading too fast — give it a moment and try again.");
  });

  it("control: loaded settings show no failure, and the toggles work", () => {
    renderNotifications();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: /^try again$/i })).toBeNull();
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeEnabled();
  });

  it("a failed REFRESH keeps the loaded settings usable (no failure shown)", () => {
    h.prefs = { ...h.prefs, isError: true, error: new BccApiError("bcc_unavailable", "x", 503, null) };
    renderNotifications();
    expect(screen.queryByRole("alert")).toBeNull();
    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeEnabled();
  });
});

describe("M27 — a failed push toggle never shows the error's own text", () => {
  const CASES: ReadonlyArray<[string, () => unknown, string]> = [
    ["a server error", () => new BccApiError("bcc_internal_error", "RAW SERVER TEXT", 500, null), "Couldn't update push notifications. Try again."],
    ["push not configured", () => new BccApiError("bcc_push_not_configured", "RAW SERVER TEXT", 503, null), "Push isn't configured on this site yet."],
    ["a plain Error", () => new Error("RAW SERVER TEXT"), "Couldn't update push notifications. Try again."],
    ["the browser's permission denial", () => new PushPermissionDeniedError(), "Permission was blocked in your browser. Re-allow it in site settings to enable push."],
    ["a NotAllowedError from the browser", () => new DOMException("RAW SERVER TEXT", "NotAllowedError"), "Permission was blocked in your browser. Re-allow it in site settings to enable push."],
    ["an unsupported browser", () => new PushUnsupportedError(), "Push isn't supported in this browser."],
  ];

  it.each(CASES)("%s → its line", (_name, make, line) => {
    h.push.enableError = make();
    renderNotifications();
    expect(screen.getByRole("alert")).toHaveTextContent(line);
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT");
  });
});
