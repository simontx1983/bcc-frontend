/**
 * /signup/complete-profile?pt=… — the OAuth provider token is a credential.
 *
 * NextAuth's callback hands it over in the query string. Left there, it
 * sat in the address bar and the browser history, so a later visitor to
 * that history entry (a shared computer) could replay it within the
 * token's window. The page now reads it once at mount and removes it from
 * the URL with history.replaceState; the token lives in component state.
 *
 * Next keeps `useSearchParams` in step with history.replaceState, so after
 * the scrub the hook no longer returns `pt`. The submit must still carry
 * the token captured at mount — the second test pins that.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/lib/analytics/posthog", () => ({
  noteSignupCompleted: vi.fn(),
  signupMethodForProvider: () => "google",
}));

const h = vi.hoisted(() => ({
  oauthComplete: vi.fn(),
  signIn: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/lib/api/auth-endpoints", () => ({
  oauthComplete: (...a: unknown[]) => h.oauthComplete(...a),
}));
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => h.signIn(...a) }));

const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const CompleteProfilePage = (await import("@/app/(auth)/signup/complete-profile/page")).default;

const TOKEN = "provider-token-abc";

/** Put the page at the URL NextAuth's callback builds, and mirror it in the hook. */
function arriveWith(query: string) {
  window.history.replaceState(null, "", `/signup/complete-profile${query}`);
  // Snapshot the keys: deleting inside forEach skips every other entry.
  for (const k of [...searchParams.keys()]) searchParams.delete(k);
  new URLSearchParams(query).forEach((v, k) => searchParams.set(k, v));
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("the provider token leaves the URL", () => {
  it("is gone from the address after mount, in place (no new history entry), other params kept", async () => {
    arriveWith(`?pt=${TOKEN}&email=jo%40example.com&provider=google`);
    const lengthBefore = window.history.length;
    render(<CompleteProfilePage />);

    await waitFor(() => expect(window.location.search).not.toContain("pt="));
    expect(window.location.href).not.toContain(TOKEN);
    expect(window.location.pathname).toBe("/signup/complete-profile");
    const left = new URLSearchParams(window.location.search);
    expect(left.get("email")).toBe("jo@example.com");
    expect(left.get("provider")).toBe("google");
    expect(window.history.length).toBe(lengthBefore);
    // The form is still the form, not the expired card.
    expect(screen.getByRole("button", { name: "Join the floor" })).toBeInTheDocument();
  });

  it("the submit still carries the token read at mount, once the URL (and the hook) have lost it", async () => {
    arriveWith(`?pt=${TOKEN}&email=jo%40example.com`);
    h.oauthComplete.mockRejectedValue(new Error("stop here"));
    const { rerender } = render(<CompleteProfilePage />);
    await waitFor(() => expect(window.location.search).not.toContain("pt="));

    // What Next does after history.replaceState: useSearchParams follows.
    searchParams.delete("pt");
    rerender(<CompleteProfilePage />);

    fireEvent.change(screen.getByLabelText("Handle"), { target: { value: "jo-welds" } });
    fireEvent.click(screen.getByRole("button", { name: "Join the floor" }));
    await waitFor(() => expect(h.oauthComplete).toHaveBeenCalledTimes(1));
    expect(h.oauthComplete.mock.calls[0]?.[0]).toMatchObject({ provider_token: TOKEN, handle: "jo-welds" });
  });

  it("touches nothing when there is no token, and shows the expired card", () => {
    arriveWith("?email=jo%40example.com");
    const spy = vi.spyOn(window.history, "replaceState");
    render(<CompleteProfilePage />);

    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByText("Session expired")).toBeInTheDocument();
  });
});
