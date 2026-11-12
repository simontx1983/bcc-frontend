/**
 * H4 — an update to the server copy never wipes a settings edit the member
 * hasn't saved yet.
 *
 * Both forms keep a draft seeded from a React Query cache entry and used
 * to REPLACE it whenever that entry changed. Something else on the same
 * page writes to that entry instantly — the Mentor toggle on the Privacy
 * tab, "Enable push" on the Notifications tab — so an unsaved radio or
 * toggle snapped back and Save went inactive with no warning. The draft
 * is now rebased: untouched fields take the new server value, edited
 * ones keep the member's choice.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProfilePrefs } from "@/lib/api/profile-prefs-endpoints";
import type { NotificationPrefs } from "@/lib/api/types";
import { rebaseDraft } from "@/lib/forms/rebaseDraft";

const state = vi.hoisted(() => ({
  profile: null as unknown,
  notif: null as unknown,
}));
const profileMutate = vi.hoisted(() => vi.fn());
const notifMutate = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useProfilePrefs", () => ({
  useProfilePrefs: () => ({ isLoading: false, isError: false, data: state.profile, error: null }),
  useUpdateProfilePrefs: () => ({
    mutate: profileMutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    error: null,
  }),
}));
vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => ({
    data: state.notif,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateNotificationPrefs: () => ({ mutate: notifMutate, isPending: false }),
}));
vi.mock("@/hooks/usePushSubscription", () => ({
  usePushSubscription: () => ({
    isSupported: true,
    isReady: true,
    browserSubscribed: true,
    enable: { isPending: false, isError: false, error: null, mutate: vi.fn() },
    disable: { isPending: false, isError: false, error: null, mutate: vi.fn() },
  }),
}));
vi.mock("@/hooks/useDirtyRegistration", () => ({ useDirtyRegistration: () => {} }));

const { ProfilePrefsSection } = await import("@/components/settings/profile/ProfilePrefsSection");
const { NotificationPrefsForm } = await import("@/components/settings/NotificationPrefsForm");

const PROFILE: ProfilePrefs = {
  profile_visibility: "public",
  post_visibility: "members",
  hide_birthday_year: false,
  hide_online: false,
  hide_from_search: false,
  default_post_audience: "public",
};

const NOTIF: NotificationPrefs = {
  email_digest: false,
  bell: { bcc_claim_badge_removed: true } as NotificationPrefs["bell"],
  push: { enabled: false, events: {} as NotificationPrefs["push"]["events"] },
  push_available: true,
};

beforeEach(() => {
  profileMutate.mockReset();
  notifMutate.mockReset();
});
afterEach(cleanup);

function radios(name: string): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
}

describe("rebaseDraft", () => {
  it("keeps edited fields, takes new server values for untouched ones, recursing into objects", () => {
    const prev = { a: 1, b: 1, nested: { x: true, y: true } };
    const next = { a: 2, b: 2, nested: { x: false, y: false } };
    const draft = { a: 9, b: 1, nested: { x: true, y: false } };
    expect(rebaseDraft(prev, next, draft)).toEqual({ a: 9, b: 2, nested: { x: false, y: false } });
  });

  it("follows the new base's shape", () => {
    const prev = { a: 1, gone: 1 } as Record<string, number>;
    const next = { a: 1, added: 3 } as Record<string, number>;
    expect(rebaseDraft(prev, next, { a: 1, gone: 5 })).toEqual({ a: 1, added: 3 });
  });

  it("compares arrays by value", () => {
    expect(rebaseDraft({ l: [1] }, { l: [2] }, { l: [1] })).toEqual({ l: [2] });
    expect(rebaseDraft({ l: [1] }, { l: [2] }, { l: [3] })).toEqual({ l: [3] });
  });
});

describe("Privacy: profile prefs", () => {
  it("an unsaved radio survives a cache update from elsewhere (the Mentor toggle)", () => {
    state.profile = PROFILE;
    const view = render(<ProfilePrefsSection />);

    fireEvent.click(radios("profile_visibility").find((i) => i.value === "members") as HTMLInputElement);

    // Mentor saves instantly into the same cache entry: a new object with
    // another field changed.
    state.profile = { ...PROFILE, mentor_opt_in: true } as ProfilePrefs;
    view.rerender(<ProfilePrefsSection />);

    expect(radios("profile_visibility").find((i) => i.checked)?.value).toBe("members");
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(profileMutate).toHaveBeenCalledWith({ profile_visibility: "members" });
  });

  it("an untouched field still takes another tab's saved value", () => {
    state.profile = PROFILE;
    const view = render(<ProfilePrefsSection />);
    state.profile = { ...PROFILE, default_post_audience: "members" };
    view.rerender(<ProfilePrefsSection />);
    expect(radios("default_post_audience").find((i) => i.checked)?.value).toBe("members");
  });
});

describe("Notifications", () => {
  it("an unsaved bell toggle survives 'Enable push' writing push.enabled into the cache", () => {
    state.notif = NOTIF;
    const view = render(<NotificationPrefsForm />);

    const toggle = screen.getByRole("checkbox", { name: /Claim badge removed/ });
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();

    // usePushSubscription's enable onSuccess: setQueryData with push.enabled.
    state.notif = { ...NOTIF, push: { ...NOTIF.push, enabled: true } };
    view.rerender(<NotificationPrefsForm />);

    expect(screen.getByRole("checkbox", { name: /Claim badge removed/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    expect(notifMutate).toHaveBeenCalledWith({ bell: { bcc_claim_badge_removed: false } });
  });
});
