/**
 * /login's wallet-signup modal — where a brand-new wallet account goes
 * next (F-332).
 *
 * A wallet that has no account opens WalletSignupPrompt in place. A
 * successful signup from there used to follow the RETURNING-sign-in
 * target ("/" or callbackUrl), so a new member skipped onboarding — and
 * with it the step that helps a wallet-only member add a recovery email.
 * It now goes to /onboarding, like /signup's wallet path, and the optional
 * email (to which the server mailed a code at signup) is handed to that
 * step through sessionStorage.
 *
 * WalletAuthButton is stubbed: the wallet popup + signature cycle is
 * covered elsewhere; here we only drive its callbacks. The modal itself
 * is the real component.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const h = vi.hoisted(() => ({
  replace: vi.fn(),
  note: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: h.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => h.searchParams,
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/analytics/posthog", () => ({
  captureAnalyticsEvent: vi.fn(),
  noteSignupCompleted: (...a: unknown[]) => h.note(...a),
}));
vi.mock("@/components/auth/WalletAuthButton", () => ({
  WalletAuthButton: (props: {
    mode: "login" | "signup";
    onSuccess: () => void;
    onWalletNotLinked?: () => void;
    disabled?: boolean;
  }) =>
    props.mode === "login" ? (
      <button type="button" onClick={() => props.onWalletNotLinked?.()}>
        Stub wallet sign-in (not linked)
      </button>
    ) : (
      <button type="button" disabled={props.disabled} onClick={() => props.onSuccess()}>
        Stub wallet signup succeeds
      </button>
    ),
}));

const { LoginPageClient } = await import("@/app/(auth)/login/LoginPageClient");
const { PENDING_RECOVERY_EMAIL_KEY } = await import("@/lib/onboarding/pending-recovery-email");

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
});

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  for (const k of [...h.searchParams.keys()]) h.searchParams.delete(k);
});

afterEach(cleanup);

function openModal() {
  render(<LoginPageClient />);
  fireEvent.click(screen.getByRole("button", { name: /stub wallet sign-in/i }));
  const dialog = screen.getByRole("dialog");
  const [handleInput] = dialog.querySelectorAll<HTMLInputElement>('input[type="text"]');
  if (handleInput === undefined) throw new Error("no handle input");
  fireEvent.change(handleInput, { target: { value: "newbie" } });
  return dialog;
}

describe("a wallet signup from the /login modal", () => {
  it("routes to /onboarding, not the returning-user target, even with a callbackUrl", async () => {
    h.searchParams.set("callbackUrl", "/v/some-validator");
    openModal();
    fireEvent.click(screen.getByRole("button", { name: /stub wallet signup succeeds/i }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(h.replace).toHaveBeenCalledTimes(1);
    // #288 review: the deep link is kept for when onboarding finishes.
    expect(window.sessionStorage.getItem("bcc:onboarding-return-to")).toBe("/v/some-validator");
    // The signup marker fires once, from the modal — not again here.
    expect(h.note).toHaveBeenCalledTimes(1);
    expect(h.note).toHaveBeenCalledWith("wallet");
  });

  it("hands the entered email to onboarding", async () => {
    const dialog = openModal();
    const email = dialog.querySelector<HTMLInputElement>('input[type="email"]');
    if (email === null) throw new Error("no email input");
    fireEvent.change(email, { target: { value: "  me@example.com " } });
    fireEvent.click(screen.getByRole("button", { name: /stub wallet signup succeeds/i }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(window.sessionStorage.getItem(PENDING_RECOVERY_EMAIL_KEY)).toBe("me@example.com");
  });

  it("stores nothing when no email was entered", async () => {
    openModal();
    fireEvent.click(screen.getByRole("button", { name: /stub wallet signup succeeds/i }));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/onboarding"));
    expect(window.sessionStorage.getItem(PENDING_RECOVERY_EMAIL_KEY)).toBeNull();
  });

  it("stores nothing when the modal is dismissed", () => {
    const dialog = openModal();
    const email = dialog.querySelector<HTMLInputElement>('input[type="email"]');
    if (email === null) throw new Error("no email input");
    fireEvent.change(email, { target: { value: "me@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(window.sessionStorage.getItem(PENDING_RECOVERY_EMAIL_KEY)).toBeNull();
    expect(h.replace).not.toHaveBeenCalled();
  });
});
