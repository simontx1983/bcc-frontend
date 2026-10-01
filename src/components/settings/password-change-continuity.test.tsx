/**
 * Password change — session continuity, and the one thing the UI must
 * never do: report a restored session that was not restored.
 *
 * The backend revokes every outstanding bearer and mints a replacement
 * for the calling session (MyAccountEndpoint.php:241-258;
 * docs/api-contract-v1.md:4439 "bearer clients must swap to it"). The
 * frontend typed the response as `{ ok: true }` and dropped the token, so
 * the next authed call 401'd and the viewer was signed out moments after
 * the panel said "Saved" — under copy promising the opposite.
 */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const patchAccountPassword = vi.fn();
vi.mock("@/lib/api/account-endpoints", async (importOriginal) => ({
  ...(await importOriginal<typeof AccountEndpointsModule>()),
  patchAccountPassword: (body: unknown) => patchAccountPassword(body),
}));

const updateSessionBearer = vi.fn<
  (u: { token: string; expiresIn: number }) => Promise<boolean>
>();
vi.mock("@/lib/auth/session-update", () => ({
  updateSessionBearer: (u: { token: string; expiresIn: number }) =>
    updateSessionBearer(u),
}));

import type * as AccountEndpointsModule from "@/lib/api/account-endpoints";
import { AccountSection } from "@/components/settings/profile/AccountSection";

/** What the server really returns. */
const SERVER_OK = {
  ok: true as const,
  token: "replacement-bearer-jwt",
  expires_in: 604800,
  token_type: "Bearer" as const,
};

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AccountSection currentEmail="a@example.test" />
    </QueryClientProvider>,
  );
}

/**
 * Fills the three password fields and submits.
 *
 * AccountSection renders TWO credential sub-cards (change email, change
 * password), both with a "Current password" field — so this scopes to the
 * password card by its heading rather than picking positionally across
 * the whole panel, which hit the EMAIL mutation instead.
 */
function submitPasswordChange() {
  const heading = screen.getByRole("heading", { name: /change password/i });
  const card = heading.closest("section");
  if (card === null) {
    throw new Error("password card not found");
  }
  const inputs = [...card.querySelectorAll('input[type="password"]')];
  if (inputs.length < 3) {
    throw new Error(`expected 3 password inputs, found ${inputs.length}`);
  }
  fireEvent.change(inputs[0] as Element, { target: { value: "old-password" } });
  fireEvent.change(inputs[1] as Element, { target: { value: "a-new-password-10" } });
  fireEvent.change(inputs[2] as Element, { target: { value: "a-new-password-10" } });
  const submit = [...card.querySelectorAll("button")].find((b) =>
    /save password/i.test(b.textContent ?? ""),
  );
  if (submit === undefined) {
    throw new Error("save button not found");
  }
  fireEvent.click(submit);
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
  patchAccountPassword.mockReset();
  updateSessionBearer.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────

describe("the replacement bearer is consumed", () => {
  it("swaps the token through the shared session-update seam", async () => {
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(true);

    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(updateSessionBearer).toHaveBeenCalledWith({
        token: SERVER_OK.token,
        expiresIn: SERVER_OK.expires_in,
      });
    });
  });

  it("does not swap a token when the change itself failed", async () => {
    patchAccountPassword.mockRejectedValue(new Error("wrong password"));
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(updateSessionBearer).not.toHaveBeenCalled();
  });
});

describe("a FAILED session update is not reported as success", () => {
  it("says the password changed AND that a new sign-in is needed", async () => {
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(false);

    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    });
    const alert = screen.getByRole("alert").textContent ?? "";
    // Both facts, explicitly.
    expect(alert).toMatch(/changed successfully/i);
    expect(alert).toMatch(/sign in again/i);
  });

  it("offers sign-in recovery", async () => {
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(false);
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /sign in again/i })).toHaveAttribute(
        "href",
        "/login",
      );
    });
  });

  it("does NOT re-offer the password form — a second submit would use the dead old password", async () => {
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(false);
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /save password/i })).toBeNull();
    expect(
      screen.queryByText(/password must be at least/i),
    ).toBeNull();
  });

  it("does not show the ordinary Saved affordance", async () => {
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(false);
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    });
    // "Saved" would imply the viewer can carry on; their next authed read
    // will 401.
    expect(screen.queryByText(/^saved$/i)).toBeNull();
  });

  it("does not present it as a failure either", async () => {
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(false);
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    });
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/couldn't change your password/i);
    expect(body).not.toMatch(/try again/i);
  });
});

describe("a SUCCESSFUL session update keeps the viewer working", () => {
  it("shows the ordinary saved state and keeps the form available", async () => {
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(true);
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(updateSessionBearer).toHaveBeenCalled();
    });
    expect(screen.queryByText(/you'll need to sign in again/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /save password/i }),
    ).toBeInTheDocument();
  });
});

describe("the bearer is not leaked", () => {
  it("never reaches the DOM", async () => {
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(false);
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    });
    expect(document.body.innerHTML).not.toContain(SERVER_OK.token);
  });

  it("never reaches browser storage", async () => {
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(true);
    mount();
    submitPasswordChange();
    await waitFor(() => {
      expect(updateSessionBearer).toHaveBeenCalled();
    });
    const dump = JSON.stringify({
      ...window.localStorage,
      ...window.sessionStorage,
    });
    expect(dump).not.toContain(SERVER_OK.token);
  });

  it("is never passed to console", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(true);
    mount();
    submitPasswordChange();
    await waitFor(() => {
      expect(updateSessionBearer).toHaveBeenCalled();
    });
    for (const s of [spy, errSpy, warnSpy]) {
      for (const call of s.mock.calls) {
        expect(JSON.stringify(call)).not.toContain(SERVER_OK.token);
      }
    }
  });
});
