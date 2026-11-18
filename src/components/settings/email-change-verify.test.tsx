/**
 * Email change — verify-before-apply (lockstep with bcc-trust PR B).
 *
 * PATCH /me/account/email no longer changes anything: it holds the new
 * address pending and mails a code to it. Only POST /me/account/email/verify
 * applies the change — and revokes every earlier bearer, so the replacement
 * it returns must be swapped into the session exactly the way the password
 * change does it (updateSessionBearer).
 *
 * The one thing the UI must never do: say the email changed, or show the
 * new address as current, before the verify call has succeeded.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as WalletsModule from "@/hooks/useWallets";

// F-253: the account forms read GET /wallets (recovery.has_password) to
// pick their confirmation. These suites test the password path; keep that
// read off the network (it raised unhandled ERR_INVALID_URL rejections).
vi.mock("@/hooks/useWallets", async (importOriginal) => ({
  ...(await importOriginal<typeof WalletsModule>()),
  useMyWallets: () => ({ data: undefined, isLoading: false }),
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const patchAccountEmail = vi.fn();
const verifyAccountEmailChange = vi.fn();
vi.mock("@/lib/api/account-endpoints", async (importOriginal) => ({
  ...(await importOriginal<typeof AccountEndpointsModule>()),
  patchAccountEmail: (body: unknown) => patchAccountEmail(body),
  verifyAccountEmailChange: (body: unknown) => verifyAccountEmailChange(body),
}));

const updateSessionBearer = vi.fn<
  (u: { token: string; expiresIn: number }) => Promise<boolean>
>();
vi.mock("@/lib/auth/session-update", () => ({
  updateSessionBearer: (u: { token: string; expiresIn: number }) =>
    updateSessionBearer(u),
}));

const endSession = vi.fn<(reason: string, opts?: unknown) => Promise<unknown>>();
vi.mock("@/lib/auth/session-boundary", async (importOriginal) => ({
  ...(await importOriginal<typeof SessionBoundaryModule>()),
  endSession: (reason: string, opts?: unknown) => endSession(reason, opts),
}));

import type * as AccountEndpointsModule from "@/lib/api/account-endpoints";
import type * as SessionBoundaryModule from "@/lib/auth/session-boundary";
import { AccountSection } from "@/components/settings/profile/AccountSection";
import { MY_WALLETS_QUERY_KEY } from "@/hooks/useWallets";
import { BccApiError } from "@/lib/api/types";

const OLD = "old@example.test";
const NEW = "new@example.test";
const PASSWORD = "hunter2-current-password";

const PENDING = {
  ok: true as const,
  pending: true as const,
  email_masked: "n*****@example.test",
  expires_in: 900,
};

const VERIFIED = {
  ok: true as const,
  email: NEW,
  token: "replacement-bearer-jwt",
  expires_in: 604800,
  token_type: "Bearer" as const,
};

const apiError = (code: string, status: number) =>
  new BccApiError(code, "RAW SERVER DETAIL", status, null);

function mount() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <AccountSection currentEmail={OLD} />
    </QueryClientProvider>,
  );
  return { qc, invalidate };
}

/** The email card, scoped by heading — the password card shares field labels. */
function emailCard(): HTMLElement {
  const heading = screen.getAllByRole("heading").find((h) =>
    /change email|email changed/i.test(h.textContent ?? ""),
  );
  const card = heading?.closest("section");
  if (card === null || card === undefined) throw new Error("email card not found");
  return card;
}

function submitStepOne(email = NEW) {
  const card = emailCard();
  const emailInput = card.querySelector('input[type="email"]');
  const pw = card.querySelector('input[type="password"]');
  if (emailInput === null || pw === null) throw new Error("step-1 fields not found");
  fireEvent.change(emailInput, { target: { value: email } });
  fireEvent.change(pw, { target: { value: PASSWORD } });
  fireEvent.click(buttonIn(card, /send code/i));
}

function buttonIn(card: HTMLElement, name: RegExp): HTMLElement {
  const b = [...card.querySelectorAll("button")].find((x) => name.test(x.textContent ?? ""));
  if (b === undefined) throw new Error(`button ${String(name)} not found`);
  return b;
}

async function reachCodeStep() {
  patchAccountEmail.mockResolvedValueOnce(PENDING);
  submitStepOne();
  await screen.findByText(/We sent a code to n\*\*\*\*\*@example\.test/);
}

function enterCode(value = "123456") {
  fireEvent.change(screen.getByLabelText(/verification code/i), { target: { value } });
  fireEvent.click(buttonIn(emailCard(), /^confirm$/i));
}

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
  patchAccountEmail.mockReset();
  verifyAccountEmailChange.mockReset();
  updateSessionBearer.mockReset();
  endSession.mockReset();
  endSession.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────

describe("step 1 — the PATCH changes nothing", () => {
  it("a new address moves to the code step with the masked address, and never says 'changed'", async () => {
    mount();
    await reachCodeStep();

    expect(patchAccountEmail).toHaveBeenCalledWith({ current_password: PASSWORD, email: NEW });
    expect(screen.getByText(/Enter it to confirm the change/)).toBeInTheDocument();
    expect(screen.getByText(/valid for 15 minutes/)).toBeInTheDocument();
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    expect(screen.queryByText(/email changed/i)).toBeNull();
    expect(screen.queryByText(/saved/i)).toBeNull();
    // The full new address is not shown as if current.
    expect(screen.queryByText(NEW)).toBeNull();
    expect(verifyAccountEmailChange).not.toHaveBeenCalled();
    expect(updateSessionBearer).not.toHaveBeenCalled();
  });

  it("the account's own address gets the neutral message and no code step", async () => {
    patchAccountEmail.mockResolvedValueOnce({ ok: true, pending: false });
    mount();
    submitStepOne(NEW);

    await screen.findByText("That's already your email.");
    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
    expect(screen.queryByText(/email changed/i)).toBeNull();
    // The password is not kept once the request is done with.
    const pw = emailCard().querySelector('input[type="password"]') as HTMLInputElement;
    expect(pw.value).toBe("");
  });
});

describe("step 2 — verify", () => {
  it("success: stores the token via the password-change seam, invalidates, THEN shows the change", async () => {
    const order: string[] = [];
    updateSessionBearer.mockImplementation(async () => {
      order.push("session");
      return true;
    });
    verifyAccountEmailChange.mockResolvedValueOnce(VERIFIED);
    const { invalidate } = mount();
    invalidate.mockImplementation(async () => {
      order.push("invalidate");
    });

    await reachCodeStep();
    expect(screen.queryByText(/email changed/i)).toBeNull();
    enterCode("123456");

    await screen.findByText(`Email changed to ${NEW}.`);
    expect(verifyAccountEmailChange).toHaveBeenCalledWith({ code: "123456" });
    expect(updateSessionBearer).toHaveBeenCalledWith({
      token: VERIFIED.token,
      expiresIn: VERIFIED.expires_in,
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MY_WALLETS_QUERY_KEY });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["user"] });
    // Session write first, so the refetches carry the replacement bearer.
    expect(order[0]).toBe("session");
    expect(order.filter((o) => o === "invalidate")).toHaveLength(3);
    // Back on step 1, showing the confirmed address, password cleared.
    const card = emailCard();
    expect((card.querySelector('input[type="email"]') as HTMLInputElement).value).toBe(NEW);
    expect((card.querySelector('input[type="password"]') as HTMLInputElement).value).toBe("");
  });

  it("success with a failed session write says the email changed AND that a sign-in is needed", async () => {
    updateSessionBearer.mockResolvedValue(false);
    verifyAccountEmailChange.mockResolvedValueOnce(VERIFIED);
    mount();
    await reachCodeStep();
    enterCode();

    await screen.findByText(/couldn.t keep this\s+device signed in/i);
    expect(screen.getByText(/Your email was changed to new@example\.test/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sign in again/i }));
    expect(endSession).toHaveBeenCalledWith("user", { callbackUrl: "/login" });
  });

  it("422 bcc_invalid_otp (wrong code): the error shows, the code form stays, and a retry goes through", async () => {
    updateSessionBearer.mockResolvedValue(true);
    verifyAccountEmailChange
      .mockRejectedValueOnce(apiError("bcc_invalid_otp", 422))
      .mockResolvedValueOnce(VERIFIED);
    mount();
    await reachCodeStep();
    enterCode("111111");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("That code didn't match. Check the latest email and try again.");
    expect(alert.className).toContain("text-bcc-text-error");
    expect(alert.textContent).not.toContain("RAW SERVER DETAIL");
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    expect(screen.queryByText(/email changed/i)).toBeNull();

    enterCode("123456");
    await screen.findByText(`Email changed to ${NEW}.`);
    expect(verifyAccountEmailChange).toHaveBeenCalledTimes(2);
    expect(verifyAccountEmailChange).toHaveBeenLastCalledWith({ code: "123456" });
  });

  it("422 bcc_invalid_request (empty code): stays on the code form", async () => {
    verifyAccountEmailChange.mockRejectedValueOnce(apiError("bcc_invalid_request", 422));
    mount();
    await reachCodeStep();
    enterCode();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Enter the 6-digit code from the email.");
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
    expect(updateSessionBearer).not.toHaveBeenCalled();
  });

  it("400 bcc_invalid_request (no pending change): back to step 1 with the message", async () => {
    verifyAccountEmailChange.mockRejectedValueOnce(apiError("bcc_invalid_request", 400));
    mount();
    await reachCodeStep();
    enterCode();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no email change waiting to be confirmed/i);
    expect(alert.textContent).not.toContain("RAW SERVER DETAIL");
    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
    expect(emailCard().querySelector('input[type="email"]')).not.toBeNull();
    expect(updateSessionBearer).not.toHaveBeenCalled();
  });

  it("409 (address taken meanwhile): back to step 1 with the taken-address message", async () => {
    verifyAccountEmailChange.mockRejectedValueOnce(apiError("bcc_conflict", 409));
    mount();
    await reachCodeStep();
    enterCode();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/taken by another account/i);
    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
    expect(updateSessionBearer).not.toHaveBeenCalled();
  });

  it("429: the rate-limit message, code form kept", async () => {
    verifyAccountEmailChange.mockRejectedValueOnce(apiError("bcc_rate_limited", 429));
    mount();
    await reachCodeStep();
    enterCode();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Too many code attempts. Try again later.");
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
  });

  it("an indeterminate failure does not claim it is safe to retry", async () => {
    verifyAccountEmailChange.mockRejectedValueOnce(new Error("network"));
    mount();
    await reachCodeStep();
    enterCode();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/couldn't confirm whether the change went through/i);
    expect(screen.queryByText(/email changed/i)).toBeNull();
  });
});

describe("resend and cancel", () => {
  it("Resend re-sends the PATCH with the same body", async () => {
    mount();
    await reachCodeStep();

    patchAccountEmail.mockResolvedValueOnce(PENDING);
    fireEvent.click(buttonIn(emailCard(), /resend code/i));

    await screen.findByText("A new code was sent.");
    expect(patchAccountEmail).toHaveBeenCalledTimes(2);
    expect(patchAccountEmail.mock.calls[1]?.[0]).toEqual({
      current_password: PASSWORD,
      email: NEW,
    });
    expect(screen.getByLabelText(/verification code/i)).toBeInTheDocument();
  });

  it("Cancel returns to step 1 and drops the held password", async () => {
    mount();
    await reachCodeStep();

    fireEvent.click(buttonIn(emailCard(), /^cancel$/i));

    expect(screen.queryByLabelText(/verification code/i)).toBeNull();
    const card = emailCard();
    expect((card.querySelector('input[type="password"]') as HTMLInputElement).value).toBe("");
    expect(screen.queryByText(/email changed/i)).toBeNull();
    expect(verifyAccountEmailChange).not.toHaveBeenCalled();
  });
});

describe("the current password never reaches storage", () => {
  it("not via localStorage or sessionStorage, across submit, resend, verify", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    updateSessionBearer.mockResolvedValue(true);
    verifyAccountEmailChange.mockResolvedValueOnce(VERIFIED);
    mount();
    await reachCodeStep();

    patchAccountEmail.mockResolvedValueOnce(PENDING);
    fireEvent.click(buttonIn(emailCard(), /resend code/i));
    await screen.findByText("A new code was sent.");

    enterCode();
    await screen.findByText(`Email changed to ${NEW}.`);
    await act(async () => {});

    for (const call of setItem.mock.calls) {
      expect(String(call[1])).not.toContain(PASSWORD);
    }
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < store.length; i += 1) {
        const key = store.key(i) ?? "";
        expect(store.getItem(key) ?? "").not.toContain(PASSWORD);
      }
    }
  });
});

describe("the PATCH's variables do not linger in the mutation cache", () => {
  it("the plaintext password is gone once the request settles", async () => {
    const { qc } = mount();
    await reachCodeStep();
    await waitFor(() => {
      const held = qc
        .getMutationCache()
        .getAll()
        .some((m) => JSON.stringify(m.state.variables ?? null).includes(PASSWORD));
      expect(held).toBe(false);
    });
  });
});
