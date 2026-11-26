import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  signIn: vi.fn(),
  checkAge: vi.fn(),
  replace: vi.fn(),
  search: new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({ signIn: h.signIn }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace }),
  useSearchParams: () => h.search,
}));
vi.mock("@/components/auth/WalletAuthButton", () => ({
  WalletAuthButton: () => <button type="button">Sign up with wallet</button>,
}));
vi.mock("@/lib/api/auth-endpoints", () => ({
  checkSignupAge: h.checkAge,
  signup: vi.fn(),
  oauthComplete: vi.fn(),
}));

import { SignupPageClient } from "@/app/(auth)/signup/SignupPageClient";
import CompleteProfilePage from "@/app/(auth)/signup/complete-profile/page";
import { stashOAuthEligibility } from "@/lib/auth/signup-age-handoff";

async function passAgeCheck() {
  fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2000-01-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() => expect(screen.queryByLabelText("Date of birth")).toBeNull());
}

beforeEach(() => {
  h.checkAge.mockResolvedValue({ eligibility_token: "test-opaque-proof" });
  h.signIn.mockResolvedValue(undefined);
  h.search = new URLSearchParams();
  window.localStorage.setItem("bcc-theme", "dark");
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.sessionStorage.clear();
  window.localStorage.removeItem("bcc-theme");
});

describe("age check before choosing a signup method", () => {
  it.each(["google", "twitter"])("keeps email, %s, and wallet signup hidden before eligibility", async (provider) => {
    render(<SignupPageClient />);
    expect(screen.queryByLabelText(/^email/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /google|\bx\b|sign up with wallet/i })).toBeNull();

    await passAgeCheck();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign up with wallet" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: provider === "google" ? /google/i : /\bx\b/i }));
    expect(h.signIn).toHaveBeenCalledWith(provider, expect.objectContaining({ callbackUrl: "/onboarding" }));
    expect(JSON.stringify(h.signIn.mock.calls)).not.toContain("test-opaque-proof");
    expect(Object.values(window.sessionStorage)).not.toContain("2000-01-01");
  });

  it("checks eligibility before asking for an email after first-time X sign-in", async () => {
    h.search = new URLSearchParams({ pt: "pending-provider", provider: "twitter" });
    render(<CompleteProfilePage />);
    expect(screen.getByLabelText("Date of birth")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^email/i)).toBeNull();
    await passAgeCheck();
    expect(screen.getByLabelText(/^email/i)).toBeInTheDocument();
  });

  it("uses and clears the opaque proof carried from the signup page", async () => {
    stashOAuthEligibility("test-opaque-proof");
    h.search = new URLSearchParams({ pt: "pending-provider", provider: "google" });
    render(<CompleteProfilePage />);
    expect(await screen.findByLabelText("Handle")).toBeInTheDocument();
    expect(window.sessionStorage).toHaveLength(0);
    expect(h.checkAge).not.toHaveBeenCalled();
  });
});
