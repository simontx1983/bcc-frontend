/**
 * F-02 (contract v1.91): `profile_visibility` has a `friends` level (30),
 * but BCC has no friends screen, so nobody can have PeepSo friends.
 * User decision: the picker offers Public, Members only and Only me; the
 * "Friends only" option is hidden until a friends screen exists. A member
 * already stored at `friends` is SHOWN as Only me (an empty friends list
 * admits only the owner and admins, which is what Only me means), and the
 * stored value is never rewritten by saving other fields.
 * `default_post_audience` keeps its three tokens.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProfilePrefs } from "@/lib/api/profile-prefs-endpoints";

const mutate = vi.fn();
const state = vi.hoisted(() => ({ prefs: null as unknown }));
const BASE: ProfilePrefs = {
  profile_visibility: "public",
  post_visibility: "members",
  hide_birthday_year: false,
  hide_online: false,
  hide_from_search: false,
  default_post_audience: "public",
};

vi.mock("@/hooks/useProfilePrefs", () => ({
  useProfilePrefs: () => ({ isLoading: false, isError: false, data: state.prefs, error: null }),
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
  it("offers Public, Members only and Only me; Friends only is absent", () => {
    state.prefs = BASE;
    render(<ProfilePrefsSection />);
    expect(group("profile_visibility").map((i) => i.value)).toEqual(["public", "members", "private"]);
    expect(screen.queryByText("Friends only")).toBeNull();
    expect(screen.getAllByText("Only me").length).toBeGreaterThan(0);
  });

  it("a member stored at friends (30) is shown as Only me", () => {
    state.prefs = { ...BASE, profile_visibility: "friends" };
    render(<ProfilePrefsSection />);
    const checked = group("profile_visibility").find((i) => i.checked);
    expect(checked?.value).toBe("private");
  });

  it("saving another field never rewrites a stored friends value", () => {
    state.prefs = { ...BASE, profile_visibility: "friends" };
    render(<ProfilePrefsSection />);
    const search = document.querySelector<HTMLInputElement>('input[type="checkbox"]');
    fireEvent.click(search as HTMLInputElement);
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    const patch = mutate.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("profile_visibility");
  });

  it("an untouched save never sends profile_visibility for a stored friends (30)", () => {
    state.prefs = { ...BASE, profile_visibility: "friends" };
    render(<ProfilePrefsSection />);
    const save = screen.getByRole("button", { name: /save preferences/i }) as HTMLButtonElement;
    // Nothing edited: either the save is inert or it sends no visibility.
    fireEvent.click(save);
    for (const call of mutate.mock.calls) {
      expect(call[0] as Record<string, unknown>).not.toHaveProperty("profile_visibility");
    }
    // And re-clicking the already-shown "Only me" is not a change either.
    fireEvent.click(group("profile_visibility").find((i) => i.value === "private") as HTMLInputElement);
    fireEvent.click(save);
    for (const call of mutate.mock.calls) {
      expect(call[0] as Record<string, unknown>).not.toHaveProperty("profile_visibility");
    }
  });

  it("choosing Only me from public PATCHes private", () => {
    state.prefs = BASE;
    render(<ProfilePrefsSection />);
    fireEvent.click(group("profile_visibility").find((i) => i.value === "private") as HTMLInputElement);
    fireEvent.click(screen.getByRole("button", { name: /save preferences/i }));
    expect(mutate).toHaveBeenCalledWith({ profile_visibility: "private" });
  });
});

describe("DEFAULT AUDIENCE FOR MY POSTS", () => {
  it("still has exactly three tokens, no friends", () => {
    state.prefs = BASE;
    render(<ProfilePrefsSection />);
    expect(group("default_post_audience").map((i) => i.value)).toEqual(["public", "members", "private"]);
  });
});
