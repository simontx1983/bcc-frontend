/**
 * SecureAccountStep — onboarding's "Secure your account" (F-332).
 *
 * Pins the three shapes the step can take and the one promise that holds
 * across all of them: "Skip for now" writes nothing.
 *
 *   Case 1 — the wallet-signup modal left an email in sessionStorage; the
 *            server already mailed a code to it. Verify / resend / switch.
 *   Case 2 — no pending email: the settings recovery-email form, gated on
 *            the server's recovery.available_at / available_reason.
 *
 * Leaf modules are mocked at their boundary (the house idiom). The
 * settings form is stubbed — it has its own coverage in settings/; here
 * we only need to see that the step hands it the verified wallets.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));

const h = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
  updateSessionBearer: vi.fn(),
  walletsState: {
    data: undefined as unknown,
    isPending: false,
  },
  // Who is signed in, and the session-boundary epoch (F-332 review H1/M2).
  sessionUserId: "7" as string | null,
  scope: "7" as string | null,
  epoch: 1,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: h.sessionUserId === null ? null : { user: { id: h.sessionUserId } },
    status: h.sessionUserId === null ? "unauthenticated" : "authenticated",
  }),
}));
vi.mock("@/hooks/useViewerScope", () => ({
  useViewerScope: () => h.scope,
}));
vi.mock("@/lib/auth/session-boundary", () => ({
  currentViewerEpoch: () => h.epoch,
  isStaleEpoch: (e: number) => e !== h.epoch,
}));

vi.mock("@/lib/api/auth-endpoints", () => ({
  verifyEmail: (b: unknown) => h.verifyEmail(b),
  resendVerification: (e: unknown) => h.resendVerification(e),
}));
vi.mock("@/lib/auth/session-update", () => ({
  updateSessionBearer: (u: unknown) => h.updateSessionBearer(u),
}));
vi.mock("@/hooks/useWallets", () => ({
  MY_WALLETS_QUERY_KEY: ["me", "wallets"],
  useMyWallets: () => h.walletsState,
}));
vi.mock("@/components/settings/RecoveryEmail", () => ({
  RecoveryEmailForm: ({
    verifiedWallets,
    onClose,
  }: {
    verifiedWallets: Array<{ id: number }>;
    onClose: () => void;
  }) => (
    <div data-testid="recovery-form">
      wallets:{verifiedWallets.map((w) => w.id).join(",")}
      <button type="button" onClick={onClose}>
        Stub cancel
      </button>
    </div>
  ),
}));

const { SecureAccountStep } = await import("@/components/onboarding/SecureAccountStep");
const { BccApiError } = await import("@/lib/api/types");
const { PENDING_RECOVERY_EMAIL_KEY: BASE_KEY } = await import(
  "@/lib/onboarding/pending-recovery-email"
);
/** The signed-in member's (id 7) scoped key. */
const PENDING_RECOVERY_EMAIL_KEY = `${BASE_KEY}::7`;

/** A verify response naming user `id`, with a fresh bearer. */
function verifiedAs(id: number) {
  return {
    user_id: id,
    handle: "tester",
    token: "fresh-jwt",
    expires_in: 3600,
    token_type: "Bearer",
    in_good_standing: false,
  };
}

function wallet(id: number, verified: boolean) {
  return {
    id,
    wallet_address: `0x${String(id).padStart(40, "0")}`,
    chain_slug: "ethereum",
    chain_name: "Ethereum",
    chain_type: "evm",
    explorer_url: "",
    wallet_type: "user",
    label: "",
    is_primary: id === 1,
    verified,
    created_at: null,
  };
}

function setRecovery(recovery: Record<string, unknown>) {
  h.walletsState.data = {
    items: [wallet(1, true), wallet(2, false), wallet(3, true)],
    recovery: { has_recovery_email: false, verified_wallet_count: 2, ...recovery },
  };
}

let queryClient: QueryClient;
let invalidateSpy: ReturnType<typeof vi.spyOn>;
const onDone = vi.fn();
const onBack = vi.fn();

function renderStep() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SecureAccountStep handle="tester" onBack={onBack} onDone={onDone} />
    </QueryClientProvider>,
  );
}

const btn = (name: RegExp) => screen.getByRole("button", { name }) as HTMLButtonElement;

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
  h.walletsState.isPending = false;
  h.sessionUserId = "7";
  h.scope = "7";
  h.epoch = 1;
  setRecovery({});
  h.updateSessionBearer.mockResolvedValue(true);
  h.resendVerification.mockResolvedValue(undefined);
  queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("chrome", () => {
  it("names the step and the account, with no handle editor", () => {
    renderStep();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Secure your account");
    expect(screen.getByText(/You.re @tester/)).toBeTruthy();
    expect(screen.queryByLabelText(/handle/i)).toBeNull();
  });
});

describe("Case 1 — a code was mailed at signup", () => {
  beforeEach(() => {
    window.sessionStorage.setItem(PENDING_RECOVERY_EMAIL_KEY, "me@example.com");
  });

  it("says where the code went and keeps Continue locked until it verifies", async () => {
    renderStep();
    await screen.findByText(/We sent a 6-digit code to/);
    expect(screen.getByText("me@example.com")).toBeTruthy();
    expect(btn(/^continue$/i).disabled).toBe(true);
  });

  it("verifies the code, swaps the bearer, clears the hand-off and refreshes /wallets", async () => {
    h.verifyEmail.mockResolvedValue(verifiedAs(7));
    renderStep();
    const input = await screen.findByLabelText("Verification code");
    fireEvent.change(input, { target: { value: "12a3456" } });
    expect((input as HTMLInputElement).value).toBe("123456");
    fireEvent.click(btn(/^verify$/i));

    await screen.findByText(/Recovery email confirmed/);
    expect(h.verifyEmail).toHaveBeenCalledWith({ email: "me@example.com", code: "123456" });
    expect(h.updateSessionBearer).toHaveBeenCalledWith({ token: "fresh-jwt", expiresIn: 3600 });
    expect(window.sessionStorage.getItem(PENDING_RECOVERY_EMAIL_KEY)).toBeNull();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["me", "wallets"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["user"] });
    expect(btn(/^continue$/i).disabled).toBe(false);

    fireEvent.click(btn(/^continue$/i));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("does not fail the step when the session write does not land", async () => {
    h.verifyEmail.mockResolvedValue(verifiedAs(7));
    h.updateSessionBearer.mockResolvedValue(false);
    renderStep();
    fireEvent.change(await screen.findByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(btn(/^verify$/i));
    await screen.findByText(/Recovery email confirmed/);
    expect(btn(/^continue$/i).disabled).toBe(false);
    // #288 review: the old bearer retires soon (#662), so say so.
    expect(screen.getByText(/couldn't keep this device signed in/i)).toBeInTheDocument();
  });

  it("a stored session write shows no sign-in-again notice", async () => {
    h.verifyEmail.mockResolvedValue(verifiedAs(7));
    h.updateSessionBearer.mockResolvedValue(true);
    renderStep();
    fireEvent.change(await screen.findByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(btn(/^verify$/i));
    await screen.findByText(/Recovery email confirmed/);
    expect(screen.queryByText(/couldn't keep this device signed in/i)).toBeNull();
  });

  it("drops a bearer that names a different account: no session write, still verified", async () => {
    // A signed out and B signed in (another tab) while the verify was out:
    // the response names A, the session is now B.
    h.verifyEmail.mockResolvedValue(verifiedAs(99));
    renderStep();
    fireEvent.change(await screen.findByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(btn(/^verify$/i));
    await screen.findByText(/Recovery email confirmed/);
    expect(h.updateSessionBearer).not.toHaveBeenCalled();
    // Not this member's session, so no "sign in again" notice either.
    expect(screen.queryByText(/couldn't keep this device signed in/i)).toBeNull();
    expect(btn(/^continue$/i).disabled).toBe(false);
  });

  it("drops the bearer when the session boundary moved after Verify was pressed", async () => {
    let resolveVerify: (v: unknown) => void = () => {};
    h.verifyEmail.mockReturnValue(
      new Promise((res) => {
        resolveVerify = res;
      }),
    );
    renderStep();
    fireEvent.change(await screen.findByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(btn(/^verify$/i));
    // A sign-out / sign-in cycle while the request is out moves the epoch,
    // even when the id happens to match again.
    h.epoch = 2;
    await act(async () => {
      resolveVerify(verifiedAs(7));
      await Promise.resolve();
    });
    await screen.findByText(/Recovery email confirmed/);
    expect(h.updateSessionBearer).not.toHaveBeenCalled();
    expect(screen.queryByText(/couldn't keep this device signed in/i)).toBeNull();
  });

  it("reads the session at response time, not at render time", async () => {
    let resolveVerify: (v: unknown) => void = () => {};
    h.verifyEmail.mockReturnValue(
      new Promise((res) => {
        resolveVerify = res;
      }),
    );
    const view = renderStep();
    fireEvent.change(await screen.findByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(btn(/^verify$/i));
    // The session now reports someone else; the scope stays put so the
    // step keeps rendering the same case.
    h.sessionUserId = "8";
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <SecureAccountStep handle="tester" onBack={onBack} onDone={onDone} />
      </QueryClientProvider>,
    );
    await act(async () => {
      resolveVerify(verifiedAs(7));
      await Promise.resolve();
    });
    await screen.findByText(/Recovery email confirmed/);
    expect(h.updateSessionBearer).not.toHaveBeenCalled();
  });

  it("shows code-keyed copy for a wrong code, never the server message", async () => {
    h.verifyEmail.mockRejectedValue(
      new BccApiError("bcc_invalid_otp", "RAW SERVER TEXT", 400, null),
    );
    renderStep();
    fireEvent.change(await screen.findByLabelText("Verification code"), {
      target: { value: "000000" },
    });
    fireEvent.click(btn(/^verify$/i));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe(
      "That code didn't match or has expired. Check the email or resend.",
    );
    expect(screen.queryByText(/RAW SERVER TEXT/)).toBeNull();
    expect(btn(/^continue$/i).disabled).toBe(true);
    expect(window.sessionStorage.getItem(PENDING_RECOVERY_EMAIL_KEY)).toBe("me@example.com");
  });

  it("treats bcc_already_verified as success", async () => {
    h.verifyEmail.mockRejectedValue(
      new BccApiError("bcc_already_verified", "x", 409, null),
    );
    renderStep();
    fireEvent.change(await screen.findByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(btn(/^verify$/i));
    await screen.findByText(/Recovery email confirmed/);
    expect(h.updateSessionBearer).not.toHaveBeenCalled();
    expect(btn(/^continue$/i).disabled).toBe(false);
  });

  it("resends to the same address and starts a 60s cooldown", async () => {
    renderStep();
    await screen.findByText(/We sent a 6-digit code to/);
    vi.useFakeTimers();
    fireEvent.click(btn(/resend code/i));
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.resendVerification).toHaveBeenCalledWith("me@example.com");
    const cooling = btn(/resend in 60s/i);
    expect(cooling.disabled).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(btn(/resend in 59s/i)).toBeTruthy();
    // A second press during the cooldown sends nothing.
    fireEvent.click(btn(/resend in 59s/i));
    expect(h.resendVerification).toHaveBeenCalledTimes(1);
  });

  it("'Use a different email' drops the hand-off and shows the add-an-email path", async () => {
    renderStep();
    fireEvent.click(await screen.findByRole("button", { name: /use a different email/i }));
    expect(window.sessionStorage.getItem(PENDING_RECOVERY_EMAIL_KEY)).toBeNull();
    expect(screen.queryByLabelText("Verification code")).toBeNull();
    expect(btn(/add a recovery email/i)).toBeTruthy();
  });
});

describe("Case 2 — no pending email", () => {
  it("opens the settings recovery-email form with only the verified wallets", async () => {
    renderStep();
    fireEvent.click(await screen.findByRole("button", { name: /add a recovery email/i }));
    expect(screen.getByTestId("recovery-form").textContent).toContain("wallets:1,3");
    // The form's own close returns to the step's resting state.
    fireEvent.click(btn(/stub cancel/i));
    expect(screen.queryByTestId("recovery-form")).toBeNull();
    expect(btn(/add a recovery email/i)).toBeTruthy();
  });

  it("signup_wallet opening now, or a few seconds ahead of this clock, shows the form", async () => {
    setRecovery({ available_at: new Date().toISOString(), available_reason: "signup_wallet" });
    renderStep();
    expect(await screen.findByRole("button", { name: /add a recovery email/i })).toBeTruthy();
    cleanup();
    setRecovery({
      available_at: new Date(Date.now() + 5_000).toISOString(),
      available_reason: "signup_wallet",
    });
    renderStep();
    expect(await screen.findByRole("button", { name: /add a recovery email/i })).toBeTruthy();
    expect(screen.queryByText(/You can add a recovery email from/)).toBeNull();
  });

  it("wallet_age within the 2-minute tolerance shows the form", async () => {
    setRecovery({
      available_at: new Date(Date.now() + 60_000).toISOString(),
      available_reason: "wallet_age",
    });
    renderStep();
    expect(await screen.findByRole("button", { name: /add a recovery email/i })).toBeTruthy();
  });

  it("wallet_age 10 minutes ahead says when it opens", async () => {
    setRecovery({
      available_at: new Date(Date.now() + 600_000).toISOString(),
      available_reason: "wallet_age",
    });
    renderStep();
    await screen.findByText(/You can add a recovery email from/);
    expect(screen.queryByRole("button", { name: /add a recovery email/i })).toBeNull();
  });

  it("keeps an open form mounted when a refetch flips availability to 'later'", async () => {
    const view = renderStep();
    fireEvent.click(await screen.findByRole("button", { name: /add a recovery email/i }));
    expect(screen.getByTestId("recovery-form")).toBeTruthy();
    setRecovery({ available_at: "2999-01-01T12:00:00Z", available_reason: "wallet_age" });
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <SecureAccountStep handle="tester" onBack={onBack} onDone={onDone} />
      </QueryClientProvider>,
    );
    expect(screen.getByTestId("recovery-form")).toBeTruthy();
    expect(screen.queryByText(/You can add a recovery email from/)).toBeNull();
    // Closing it is what lets the availability line take over.
    fireEvent.click(btn(/stub cancel/i));
    expect(screen.getByText(/You can add a recovery email from/)).toBeTruthy();
  });

  it("says when the path opens instead of showing the form while available_at is ahead", async () => {
    setRecovery({ available_at: "2999-01-01T12:00:00Z", available_reason: "wallet_age" });
    renderStep();
    await screen.findByText(/You can add a recovery email from/);
    expect(screen.getByText(/Settings → Account/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /add a recovery email/i })).toBeNull();
  });

  it("shows the form once available_at has passed", async () => {
    setRecovery({ available_at: "2000-01-01T00:00:00Z", available_reason: "signup_wallet" });
    renderStep();
    expect(await screen.findByRole("button", { name: /add a recovery email/i })).toBeTruthy();
  });

  it("asks for a fresh wallet sign-in when both availability fields are null", async () => {
    setRecovery({ available_at: null, available_reason: null });
    renderStep();
    await screen.findByText(/needs a recently signed-in wallet/);
    expect(screen.queryByRole("button", { name: /add a recovery email/i })).toBeNull();
  });

  it("shows the form when an older backend omits both fields", async () => {
    renderStep();
    expect(await screen.findByRole("button", { name: /add a recovery email/i })).toBeTruthy();
  });

  it("unlocks Continue once the server reports a recovery email", () => {
    setRecovery({ has_recovery_email: true });
    renderStep();
    expect(btn(/^continue$/i).disabled).toBe(false);
  });
});

describe("the hand-off is the signed-in member's only (F-332 review M2)", () => {
  it("ignores an email stored under another member's id", async () => {
    window.sessionStorage.setItem(`${BASE_KEY}::8`, "someone-else@example.com");
    renderStep();
    expect(await screen.findByRole("button", { name: /add a recovery email/i })).toBeTruthy();
    expect(screen.queryByText(/someone-else@example.com/)).toBeNull();
    expect(screen.queryByRole("button", { name: /resend code/i })).toBeNull();
  });

  it("ignores an unscoped bare key", async () => {
    window.sessionStorage.setItem(BASE_KEY, "legacy@example.com");
    renderStep();
    expect(await screen.findByRole("button", { name: /add a recovery email/i })).toBeTruthy();
    expect(screen.queryByText(/legacy@example.com/)).toBeNull();
  });

  it("reads nothing while the viewer is unknown", () => {
    h.scope = null;
    window.sessionStorage.setItem(PENDING_RECOVERY_EMAIL_KEY, "me@example.com");
    renderStep();
    expect(screen.queryByText(/We sent a 6-digit code to/)).toBeNull();
  });
});

describe("Skip for now", () => {
  it("advances without calling any API", async () => {
    window.sessionStorage.setItem(PENDING_RECOVERY_EMAIL_KEY, "me@example.com");
    renderStep();
    await screen.findByText(/We sent a 6-digit code to/);
    fireEvent.click(btn(/skip for now/i));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(h.verifyEmail).not.toHaveBeenCalled();
    expect(h.resendVerification).not.toHaveBeenCalled();
    expect(h.updateSessionBearer).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
    // Skipping drops the hand-off (F-332 review): the address does not
    // stay in storage for the rest of the tab.
    expect(window.sessionStorage.getItem(PENDING_RECOVERY_EMAIL_KEY)).toBeNull();
  });

  it("Back goes back", () => {
    renderStep();
    fireEvent.click(btn(/back/i));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
