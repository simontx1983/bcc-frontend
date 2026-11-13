/**
 * F-257 (H11) — one "hide me from search" control.
 *
 * The Privacy tab had two near-identical switches that saved differently:
 * "Don't list me in member search" (profile prefs `hide_from_search`, Save
 * button) and "Don't list me in user search" (`discovery_optout`, saved on
 * tap). Since bcc-trust #648 they are one server flag, so only the
 * profile-prefs switch remains, saved like the rest of its section.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProfilePrefs } from "@/lib/api/profile-prefs-endpoints";

const prefsMutate = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useProfilePrefs", () => ({
  useProfilePrefs: () => ({ isLoading: false, isError: false, data: PREFS, error: null }),
  useUpdateProfilePrefs: () => ({
    mutate: prefsMutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    error: null,
  }),
}));
vi.mock("@/hooks/useMyPrivacy", () => ({
  useMyPrivacy: () => ({
    data: {
      watching_hidden: false,
      reviews_hidden: false,
      disputes_hidden: false,
      delegations_hidden: false,
      follower_count_hidden: false,
      real_name_hidden: false,
      email_hidden: false,
      discovery_optout: true,
    },
    isPending: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateMyPrivacy: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useDirtyRegistration", () => ({ useDirtyRegistration: () => {} }));

const PREFS: ProfilePrefs = {
  profile_visibility: "public",
  post_visibility: "members",
  hide_birthday_year: false,
  hide_online: false,
  hide_from_search: false,
  default_post_audience: "public",
};

const { ProfilePrefsSection } = await import("@/components/settings/profile/ProfilePrefsSection");
const { PrivacySettingsForm } = await import("@/components/settings/PrivacySettingsForm");

afterEach(cleanup);

describe("one search opt-out", () => {
  it("the Privacy toggles no longer include a user-search opt-out", () => {
    render(<PrivacySettingsForm />);
    expect(screen.queryByText(/list me in user search/i)).toBeNull();
    expect(screen.queryByText(/^Discovery$/)).toBeNull();
    expect(screen.queryByText(/search index/i)).toBeNull();
  });

  it("the profile-prefs switch is the one control, with the agreed copy, saved with its section", () => {
    render(<ProfilePrefsSection />);
    const box = screen.getByRole("checkbox", { name: /Hide me from member search and the directory/ });
    expect(screen.getByText("Direct profile links still work.")).toBeInTheDocument();
    fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(prefsMutate).toHaveBeenCalledWith({ hide_from_search: true });
  });
});
