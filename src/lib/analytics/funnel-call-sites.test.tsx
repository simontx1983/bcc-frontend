/**
 * Funnel analytics — the call sites.
 *
 * The wrapper itself (consent, the one-shot marker, member_status) is
 * covered in posthog.test.ts. This file pins WHERE the funnel events are
 * raised and what they carry: `signup_started` per method on /signup, the
 * `signup_completed` marker at each real account-creation point and
 * nowhere else.
 *
 * The analytics wrapper is mocked at its module boundary; the pure
 * `signupMethodForProvider` is kept real.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AnalyticsModule from "@/lib/analytics/posthog";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const h = vi.hoisted(() => ({
  capture: vi.fn(),
  note: vi.fn(),
  signIn: vi.fn(),
  replace: vi.fn(),
  signup: vi.fn(),
  verifyEmail: vi.fn(),
  oauthComplete: vi.fn(),
  walletSignup: vi.fn(),
  getPublicWalletNonce: vi.fn(),
  connectWallet: vi.fn(),
  signWalletChallenge: vi.fn(),
}));

vi.mock("@/lib/analytics/posthog", async (importActual) => {
  const actual = await importActual<typeof AnalyticsModule>();
  return {
    ...actual,
    captureAnalyticsEvent: (...a: unknown[]) => h.capture(...a),
    noteSignupCompleted: (...a: unknown[]) => h.note(...a),
  };
});

vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => h.signIn(...a) }));
const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));
vi.mock("@/lib/api/auth-endpoints", () => ({
  signup: (b: unknown) => h.signup(b),
  verifyEmail: (b: unknown) => h.verifyEmail(b),
  resendVerification: vi.fn(),
  oauthComplete: (b: unknown) => h.oauthComplete(b),
  walletSignup: (b: unknown) => h.walletSignup(b),
  getPublicWalletNonce: (b: unknown) => h.getPublicWalletNonce(b),
}));
vi.mock("@/lib/wallet/dispatch", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    connectWallet: (...a: unknown[]) => h.connectWallet(...a),
    signWalletChallenge: (...a: unknown[]) => h.signWalletChallenge(...a),
  };
});

const { SignupPageClient } = await import("@/app/(auth)/signup/SignupPageClient");
const { WalletSignupPrompt } = await import("@/components/auth/WalletSignupPrompt");
const { SSOButton } = await import("@/components/auth/AuthCard");
const VerifyEmailPage = (await import("@/app/(auth)/verify-email/page")).default;
const CompleteProfilePage = (await import("@/app/(auth)/signup/complete-profile/page")).default;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

const JWT = {
  user_id: 7, handle: "tester", token: "t", expires_in: 60,
  token_type: "Bearer", in_good_standing: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of [...searchParams.keys()]) searchParams.delete(k);
  h.signIn.mockResolvedValue({ ok: true, error: null });
  h.signup.mockResolvedValue({ ok: true, email: "a@b.co" });
  h.verifyEmail.mockResolvedValue({ ...JWT, linked_wallet_count: 0 });
  h.oauthComplete.mockResolvedValue(JWT);
  h.walletSignup.mockResolvedValue({ ok: true });
  h.getPublicWalletNonce.mockResolvedValue({ message: "sign me", nonce: "n", expires_at: "" });
  h.connectWallet.mockResolvedValue({ address: "0xabc", chainSlug: "ethereum" });
  h.signWalletChallenge.mockResolvedValue({ signature: "sig", extra: {} });
});
afterEach(() => cleanup());

/** Every property bag sent with `name`. */
const propsOf = (name: string) =>
  h.capture.mock.calls.filter((c) => c[0] === name).map((c) => c[1] as unknown);

function typeHandle(value: string) {
  const input = document.getElementById("handle") ?? screen.getAllByRole("textbox")[0];
  if (input === null || input === undefined) throw new Error("no handle input");
  fireEvent.change(input, { target: { value } });
}

// ─────────────────────────────────────────────────────────────────────
// signup_started
// ─────────────────────────────────────────────────────────────────────

describe("signup_started on /signup", () => {
  it("fires { method: 'password' } on submit, before the request", async () => {
    let capturedBeforeRequest = false;
    h.signup.mockImplementation(() => {
      capturedBeforeRequest = propsOf("signup_started").length === 1;
      return Promise.resolve({ ok: true });
    });
    render(<SignupPageClient />);
    fireEvent.change(document.getElementById("email") as HTMLElement, { target: { value: "a@b.co" } });
    fireEvent.change(document.getElementById("password") as HTMLElement, { target: { value: "longpassword" } });
    typeHandle("tester");
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(h.signup).toHaveBeenCalled());
    expect(capturedBeforeRequest).toBe(true);
    expect(propsOf("signup_started")).toEqual([{ method: "password" }]);
  });

  it.each([
    [/Sign up with Google/, "google"],
    [/Sign up with X/, "x"],
  ])("fires { method } on the SSO button %s", (name, method) => {
    render(<SignupPageClient />);
    fireEvent.click(screen.getByRole("button", { name }));
    expect(propsOf("signup_started")).toEqual([{ method }]);
    expect(h.signIn).toHaveBeenCalled();
  });

  it("fires { method: 'wallet' } when the wallet signup starts", async () => {
    render(<SignupPageClient />);
    typeHandle("tester");
    fireEvent.click(screen.getByRole("button", { name: "Sign up with wallet" }));
    await waitFor(() => expect(h.connectWallet).toHaveBeenCalled());
    expect(propsOf("signup_started")).toEqual([{ method: "wallet" }]);
  });

  it("is not raised by a login-mode SSO button with no callback", () => {
    render(<SSOButton provider="google" mode="login" />);
    fireEvent.click(screen.getByRole("button", { name: /Continue with Google/ }));
    expect(h.capture).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// signup_completed marker — the creation points
// ─────────────────────────────────────────────────────────────────────

describe("signup_completed marker at each account-creation point", () => {
  it("password: verify-email's automatic sign-in success", async () => {
    searchParams.set("email", "a@b.co");
    searchParams.set("token", "link-token");
    render(<VerifyEmailPage />);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(h.note).toHaveBeenCalledTimes(1);
    expect(h.note).toHaveBeenCalledWith("password");
  });

  it("password: no marker when the automatic sign-in fails", async () => {
    h.signIn.mockResolvedValue({ ok: false, error: "x" });
    searchParams.set("email", "a@b.co");
    searchParams.set("token", "link-token");
    render(<VerifyEmailPage />);
    await waitFor(() => expect(h.signIn).toHaveBeenCalled());
    expect(h.note).not.toHaveBeenCalled();
  });

  it.each([
    ["google", "google"],
    ["twitter", "x"],
  ])("oauth: complete-profile success with ?provider=%s marks %s", async (provider, method) => {
    searchParams.set("pt", "provider-token");
    searchParams.set("email", "a@b.co");
    searchParams.set("provider", provider);
    render(<CompleteProfilePage />);
    typeHandle("tester");
    fireEvent.submit(screen.getByRole("button", { name: "Join the floor" }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(h.note).toHaveBeenCalledWith(method);
  });

  it("oauth: no marker when ?provider= is missing or unknown", async () => {
    searchParams.set("pt", "provider-token");
    searchParams.set("email", "a@b.co");
    searchParams.set("provider", "github");
    render(<CompleteProfilePage />);
    typeHandle("tester");
    fireEvent.submit(screen.getByRole("button", { name: "Join the floor" }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(h.note).not.toHaveBeenCalled();
  });

  it("wallet: the /signup wallet signup's onSuccess", async () => {
    render(<SignupPageClient />);
    typeHandle("tester");
    fireEvent.click(screen.getByRole("button", { name: "Sign up with wallet" }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(h.walletSignup).toHaveBeenCalled();
    expect(h.note).toHaveBeenCalledWith("wallet");
  });

  it("wallet: the /login wallet-signup modal's onSuccess", async () => {
    const onSuccess = vi.fn();
    render(<WalletSignupPrompt onSuccess={onSuccess} onDismiss={() => {}} />);
    typeHandle("tester");
    fireEvent.click(screen.getByRole("button", { name: "Sign up with wallet" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(h.note).toHaveBeenCalledWith("wallet");
  });

  it("wallet: no marker when the wallet signup fails", async () => {
    h.walletSignup.mockRejectedValue(new Error("nope"));
    render(<SignupPageClient />);
    typeHandle("tester");
    fireEvent.click(screen.getByRole("button", { name: "Sign up with wallet" }));
    await waitFor(() => expect(h.walletSignup).toHaveBeenCalled());
    await screen.findByRole("alert");
    expect(h.note).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Not on a plain sign-in: the marker is written only at creation points
// ─────────────────────────────────────────────────────────────────────

// Source scans walk the whole src/ tree; on a busy machine or CI runner that
// can exceed vitest's 5s default and flake. 30s is a ceiling, not a budget.
describe("signup_completed is never marked on a plain sign-in", { timeout: 30_000 }, () => {
  /**
   * Source scan: `noteSignupCompleted(` is called only from the four
   * creation points. Sign-in surfaces (/login, the 2FA page, the OAuth
   * callback, an existing Google user landing on /onboarding) must not
   * appear. Like every source scan this sees untracked files too, since it
   * walks the tree rather than `git grep`.
   */
  it("is called only at the account-creation points", () => {
    const root = resolve(process.cwd(), "src");
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
          walk(p);
        } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          if (/noteSignupCompleted\(/.test(readFileSync(p, "utf-8"))) {
            hits.push(relative(root, p).replace(/\\/g, "/"));
          }
        }
      }
    };
    walk(root);
    expect(hits.sort()).toEqual([
      "app/(auth)/signup/SignupPageClient.tsx",
      "app/(auth)/signup/complete-profile/page.tsx",
      "app/(auth)/verify-email/page.tsx",
      "components/auth/WalletSignupPrompt.tsx",
      "lib/analytics/posthog.ts",
    ]);
  });
});
