/**
 * F-02 (contract v1.91) — `profile_visibility` gains `friends` (level 30).
 *
 * The ladder order is public, members, friends, private (10/20/30/40).
 * `default_post_audience` deliberately keeps its three tokens.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProfilePrefs } from "@/lib/api/profile-prefs-endpoints";

const mutate = vi.fn();
const PREFS: ProfilePrefs = {
  profile_visibility: "public",
  post_visibility: "members",
  hide_birthday_year: false,
  hide_online: false,
  hide_from_search: false,
  default_post_audience: "public",
};

vi.mock("@/hooks/useProfilePrefs", () => ({
  useProfilePrefs: () => ({ isLoading: false, isError: false, data: PREFS, error: null }),
  useUpdateProfilePrefs: () => ({
    mutate,
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    error: null,
  }),
}));
vi.mock("@/hooks/useDirtyRegistration", () => ({ useDirtyRegistration: () => {} }));

import { ProfilePrefsSection } from "@/components/settings/profile/ProfilePrefsSection";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function group(name: string): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));
}

describe("WHO CAN SEE MY PROFILE", () => {
  it("offers four levels, in ladder order", () => {
    render(<ProfilePrefsSection />);
    expect(group("profile_visibility").map((i) => i.value)).toEqual([
      "public",
      "members",
      "friends",
      "private",
    ]);
  });

  it("labels the new level 'Friends only' and says friends are not followers", () => {
    render(<ProfilePrefsSection />);
    const friends = group("profile_visibility").find((i) => i.value === "friends");
    expect(friends).toBeDefined();
    const label = friends?.closest("label");
    expect(label).not.toBeNull();
    const ui = within(label as HTMLElement);
    expect(ui.getByText("Friends only")).toBeInTheDocument();
    expect(
      ui.getByText(
        "Only your PeepSo friends (people you've accepted as friends), not followers.",
      ),
    ).toBeInTheDocument();
  });

  it("selecting it PATCHes profile_visibility: 'friends' and nothing else", () => {
    render(<ProfilePrefsSection />);
    const friends = group("profile_visibility").find((i) => i.value === "friends");
    fireEvent.click(friends as HTMLInputElement);
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ profile_visibility: "friends" });
  });
});

describe("DEFAULT AUDIENCE FOR MY POSTS", () => {
  it("still has exactly three tokens — no 'friends'", () => {
    render(<ProfilePrefsSection />);
    expect(group("default_post_audience").map((i) => i.value)).toEqual([
      "public",
      "members",
      "private",
    ]);
  });
});
