/**
 * The /auth/login captcha step-up (contract v1.161; bcc-trust #715).
 *
 * While it is on, a sign-in without a valid Turnstile token answers
 * `429 bcc_captcha_required` with `error.data.captcha = {provider, site_key}`.
 * The page renders Turnstile with that site key and `action: "login"` (the
 * backend rejects any other action), and re-submits the same body plus
 * `captcha_token`. A token is single-use: any answer spends it, so the
 * widget is reset. Nothing about this runs on a normal sign-in.
 *
 * This PR is the gate for installing the Turnstile keys: with keys set and
 * no widget, anyone could trip the site-wide step-up and lock password
 * sign-ins out.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TurnstileApi } from "@/components/auth/TurnstileWidget";
import type { ApiErrorBody } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const h = vi.hoisted(() => ({
  login: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/components/auth/WalletAuthButton", () => ({ WalletAuthButton: () => null }));
vi.mock("@/components/auth/WalletSignupPrompt", () => ({ WalletSignupPrompt: () => null }));

const { BccApiError } = await import("@/lib/api/types");
const { loginCaptchaChallenge, TURNSTILE_LOGIN_ACTION, TURNSTILE_SCRIPT_SRC } = await import(
  "@/lib/auth/login-captcha"
);

const SITE_KEY = "0x4AAAAAAA-test-site-key";

/** The error body /auth/login sends while the step-up is on. */
function captchaRequired(captcha: unknown = { provider: "turnstile", site_key: SITE_KEY }) {
  return new BccApiError("bcc_captcha_required", "RAW SERVER TEXT", 429, {
    error: { code: "bcc_captcha_required", message: "RAW SERVER TEXT", status: 429, data: { captcha } },
    _meta: {} as ApiErrorBody["_meta"],
  });
}

// ─────────────────────────────────────────────────────────────────────
// The helper
// ─────────────────────────────────────────────────────────────────────

describe("loginCaptchaChallenge", () => {
  it("reads provider and site key from error.data.captcha", () => {
    expect(loginCaptchaChallenge(captchaRequired())).toEqual({ provider: "turnstile", siteKey: SITE_KEY });
  });

  it.each([
    ["another code", new BccApiError("bcc_rate_limited", "x", 429, null)],
    ["no data", new BccApiError("bcc_captcha_required", "x", 429, null)],
    ["an unknown provider", captchaRequired({ provider: "hcaptcha", site_key: SITE_KEY })],
    ["no site key", captchaRequired({ provider: "turnstile" })],
    ["an empty site key", captchaRequired({ provider: "turnstile", site_key: "  " })],
    ["a non-object captcha", captchaRequired("turnstile")],
    ["a plain Error", new Error("bcc_captcha_required")],
  ])("is null for %s", (_label, err) => {
    expect(loginCaptchaChallenge(err)).toBeNull();
  });

  it("the widget action is exactly 'login' (the backend checks it)", () => {
    expect(TURNSTILE_LOGIN_ACTION).toBe("login");
    expect(TURNSTILE_SCRIPT_SRC).toBe("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
  });
});

// ─────────────────────────────────────────────────────────────────────
// The login page
// ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api/auth-endpoints", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loginWithIdentifier: (...a: unknown[]) => h.login(...a),
}));

const { LoginPageClient } = await import("@/app/(auth)/login/LoginPageClient");

const ts = {
  render: vi.fn<TurnstileApi["render"]>(),
  reset: vi.fn<TurnstileApi["reset"]>(),
  remove: vi.fn<TurnstileApi["remove"]>(),
};
/** The options the page rendered the widget with (to pin them, and to fire callbacks). */
const lastOptions = () => ts.render.mock.calls.at(-1)?.[1];

function installTurnstile() {
  ts.render.mockReturnValue("widget-1");
  window.turnstile = { render: ts.render, reset: ts.reset, remove: ts.remove };
}

function submit() {
  fireEvent.change(screen.getByLabelText("Email or handle"), { target: { value: "jo" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-horse" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

const alertText = () => screen.getByRole("alert").textContent;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
  installTurnstile();
});

afterEach(() => {
  cleanup();
  delete window.turnstile;
  document.head.querySelectorAll("script[src*='challenges.cloudflare.com']").forEach((s) => s.remove());
});

describe("a normal sign-in never sees it", () => {
  it("no widget and no script on a wrong password", async () => {
    delete window.turnstile;
    h.login.mockRejectedValue(new BccApiError("bcc_invalid_credentials", "x", 401, null));
    render(<LoginPageClient />);
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email/handle or password.");
    expect(screen.queryByRole("group", { name: "Verification check" })).toBeNull();
    expect(document.head.querySelector("script[src*='challenges.cloudflare.com']")).toBeNull();
    expect(h.login).toHaveBeenCalledWith("jo", "correct-horse", undefined);
  });

  it("the ordinary 429 keeps its copy and shows no widget", async () => {
    h.login.mockRejectedValue(new BccApiError("bcc_rate_limited", "x", 429, null));
    render(<LoginPageClient />);
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many login attempts. Try again in a minute.");
    expect(ts.render).not.toHaveBeenCalled();
  });
});

describe("the step-up", () => {
  it("renders Turnstile with the server's site key and action 'login'", async () => {
    h.login.mockRejectedValueOnce(captchaRequired());
    render(<LoginPageClient />);
    submit();

    await waitFor(() => expect(ts.render).toHaveBeenCalledTimes(1));
    expect(lastOptions()).toMatchObject({ sitekey: SITE_KEY, action: "login" });
    expect(screen.getByRole("group", { name: "Verification check" })).toBeInTheDocument();
    expect(alertText()).toBe("Complete the check below, then press Sign in again.");
    expect(screen.queryByText("RAW SERVER TEXT")).toBeNull();
  });

  it("holds the submit until the widget gives a token", async () => {
    h.login.mockRejectedValueOnce(captchaRequired());
    render(<LoginPageClient />);
    submit();
    await waitFor(() => expect(ts.render).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(alertText()).toBe("Complete the check below first.");
    expect(h.login).toHaveBeenCalledTimes(1);
  });

  it("re-submits the same body plus captcha_token, and goes on to 2FA", async () => {
    h.login
      .mockRejectedValueOnce(captchaRequired())
      .mockResolvedValueOnce({ status: "2fa_required", challenge_token: "ct-1" });
    render(<LoginPageClient />);
    submit();
    await waitFor(() => expect(ts.render).toHaveBeenCalled());

    act(() => lastOptions()?.callback("tok-1"));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(h.login).toHaveBeenCalledTimes(2));
    expect(h.login).toHaveBeenLastCalledWith("jo", "correct-horse", "tok-1");
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/login/two-factor"));
  });

  it("a rejected token resets the widget, and the next submit waits for a new one", async () => {
    h.login.mockRejectedValueOnce(captchaRequired()).mockRejectedValueOnce(captchaRequired());
    render(<LoginPageClient />);
    submit();
    await waitFor(() => expect(ts.render).toHaveBeenCalled());

    act(() => lastOptions()?.callback("tok-1"));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(ts.reset).toHaveBeenCalledWith("widget-1"));
    expect(alertText()).toBe("That check expired or didn't go through. Complete it again, then press Sign in.");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(alertText()).toBe("Complete the check below first.");
    expect(h.login).toHaveBeenCalledTimes(2);
    // One widget for the page: a new challenge does not render a second.
    expect(ts.render).toHaveBeenCalledTimes(1);
  });

  it("any answer spends the token: a wrong password resets the widget too", async () => {
    h.login
      .mockRejectedValueOnce(captchaRequired())
      .mockRejectedValueOnce(new BccApiError("bcc_invalid_credentials", "x", 401, null));
    render(<LoginPageClient />);
    submit();
    await waitFor(() => expect(ts.render).toHaveBeenCalled());

    act(() => lastOptions()?.callback("tok-1"));
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(alertText()).toBe("Invalid email/handle or password."));
    expect(ts.reset).toHaveBeenCalledWith("widget-1");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(alertText()).toBe("Complete the check below first.");
    expect(h.login).toHaveBeenCalledTimes(2);
  });

  it("an expired token is dropped: the submit waits again", async () => {
    h.login.mockRejectedValueOnce(captchaRequired());
    render(<LoginPageClient />);
    submit();
    await waitFor(() => expect(ts.render).toHaveBeenCalled());

    act(() => lastOptions()?.callback("tok-1"));
    act(() => lastOptions()?.["expired-callback"]());
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(alertText()).toBe("Complete the check below first.");
    expect(h.login).toHaveBeenCalledTimes(1);
  });

  it("a step-up this client can't render shows plain copy, no widget", async () => {
    h.login.mockRejectedValueOnce(captchaRequired({ provider: "hcaptcha", site_key: SITE_KEY }));
    render(<LoginPageClient />);
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Sign-in needs an extra check we can't show right now. Wait a few minutes, then try again.",
    );
    expect(ts.render).not.toHaveBeenCalled();
  });

  it("follows the site theme, re-rendering on a toggle (Turnstile can't restyle in place)", async () => {
    h.login.mockRejectedValueOnce(captchaRequired());
    render(<LoginPageClient />);
    submit();
    await waitFor(() => expect(ts.render).toHaveBeenCalledTimes(1));
    const first = lastOptions()?.theme;
    const next = first === "light" ? "dark" : "light";

    act(() => document.documentElement.setAttribute("data-theme", next));
    await waitFor(() => expect(ts.render).toHaveBeenCalledTimes(2));
    expect(lastOptions()).toMatchObject({ theme: next, sitekey: SITE_KEY, action: "login" });
    expect(ts.remove).toHaveBeenCalledWith("widget-1");
  });

  it("removes the widget when the page unmounts", async () => {
    h.login.mockRejectedValueOnce(captchaRequired());
    const { unmount } = render(<LoginPageClient />);
    submit();
    await waitFor(() => expect(ts.render).toHaveBeenCalled());

    unmount();
    expect(ts.remove).toHaveBeenCalledWith("widget-1");
  });
});

describe("loading the script", () => {
  const injected = () =>
    [...document.head.querySelectorAll<HTMLScriptElement>("script")].filter((s) =>
      s.src.startsWith("https://challenges.cloudflare.com/"),
    );

  it("loads api.js only when asked, says so if it fails, and retries", async () => {
    delete window.turnstile;
    h.login.mockRejectedValueOnce(captchaRequired());
    render(<LoginPageClient />);
    submit();

    await waitFor(() => expect(injected()).toHaveLength(1));
    expect(injected()[0]?.src).toBe(TURNSTILE_SCRIPT_SRC);
    injected()[0]?.dispatchEvent(new Event("error"));

    expect(await screen.findByText(/The verification check didn.t load/)).toBeInTheDocument();
    expect(injected()).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(injected()).toHaveLength(1));
    installTurnstile();
    injected()[0]?.dispatchEvent(new Event("load"));

    await waitFor(() => expect(ts.render).toHaveBeenCalledTimes(1));
    expect(lastOptions()).toMatchObject({ sitekey: SITE_KEY, action: "login" });
  });
});
