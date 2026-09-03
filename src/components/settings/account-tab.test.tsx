/**
 * The Account sub-tab: honest failures, isolated danger, reachable controls.
 *
 * The behaviour this file exists to pin, in order of how much it would
 * cost to get wrong again:
 *
 *   1. A FAILED security-activity load must never render "No security
 *      events recorded yet." That sentence was reachable on any error,
 *      because the component had no error branch at all — `data` came
 *      back undefined, `items` fell to `[]`, and the empty state
 *      rendered. On the one surface built for checking a security-alert
 *      email against the record, a false "nothing happened" is the worst
 *      available answer.
 *   2. Deletion lives alone in the Danger Zone, and sign-out-everywhere
 *      does NOT (it is reversible by signing in again).
 *   3. Destructive actions confirm, trap focus, restore it, and cannot
 *      double-fire.
 *   4. No raw server message ever reaches the DOM.
 *
 * Wallet-specific behaviour lives in `account-wallets.test.tsx`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

// ── account activity ──────────────────────────────────────────────────
const activityState = {
  data: undefined as unknown,
  isPending: false,
  isError: false,
};
const activityRefetch = vi.fn();

// ── logout everywhere ─────────────────────────────────────────────────
const logoutMutate = vi.fn();
const logoutState = { isPending: false };

vi.mock("@/hooks/useAccount", () => ({
  useAccountActivity: () => ({ ...activityState, refetch: activityRefetch }),
  useLogoutEverywhere: () => ({
    mutate: logoutMutate,
    isPending: logoutState.isPending,
  }),
  useChangeAccountEmail: (o: Record<string, unknown> = {}) => ({
    mutate: vi.fn(),
    isPending: false,
    ...o,
  }),
  useChangeAccountPassword: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteAccount: (o: { onError?: (e: unknown) => void } = {}) => ({
    mutate: (...a: unknown[]) => deleteMutate(...a),
    isPending: deleteState.isPending,
    __onError: (deleteHandlers.onError = o.onError),
  }),
}));

const deleteMutate = vi.fn();
const deleteState = { isPending: false };
// `| undefined` explicitly: exactOptionalPropertyTypes forbids assigning
// a possibly-undefined callback into a plain optional property.
const deleteHandlers: { onError?: ((e: unknown) => void) | undefined } = {};

// Keep the other sections inert so this file tests the panel + the three
// surfaces it is about, not the whole account subtree.
vi.mock("@/components/settings/ConnectionsSection", () => ({
  ConnectionsSection: () => <div data-testid="connections" />,
}));
vi.mock("@/components/settings/WalletsSection", () => ({
  WalletsSection: () => <div data-testid="wallets" />,
}));

import { AccountSettingsPanel } from "@/components/profile/panels/settings/AccountSettingsPanel";
import { AccountActivitySection } from "@/components/settings/AccountActivitySection";
import { SessionsRevokeSection } from "@/components/settings/SessionsRevokeSection";
import { DeleteAccountCard } from "@/components/settings/profile/DeleteAccountCard";
import { BccApiError } from "@/lib/api/types";

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
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
  activityState.data = undefined;
  activityState.isPending = false;
  activityState.isError = false;
  activityRefetch.mockReset();
  logoutMutate.mockReset();
  logoutState.isPending = false;
  deleteMutate.mockReset();
  deleteState.isPending = false;
});
afterEach(cleanup);

const EMPTY_COPY = /No security events recorded yet/i;

// ─────────────────────────────────────────────────────────────────────
// 1. Information architecture
// ─────────────────────────────────────────────────────────────────────

describe("panel structure", () => {
  it("shows the six sections in the approved order", () => {
    activityState.data = { items: [], total: 0, total_pages: 0 };
    renderWithClient(<AccountSettingsPanel currentEmail="owner@example.com" />);
    const order = [
      "SIGN-IN",
      "VERIFIED ACCOUNTS",
      "WALLETS",
      "SECURITY ACTIVITY",
      "SECURITY ACTIONS",
      "DANGER ZONE",
    ];
    const body = document.body.textContent ?? "";
    let cursor = -1;
    for (const label of order) {
      const at = body.indexOf(label);
      expect(at, `${label} missing`).toBeGreaterThan(-1);
      expect(at, `${label} out of order`).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it("carries the private-settings introduction", () => {
    activityState.data = { items: [], total: 0, total_pages: 0 };
    renderWithClient(<AccountSettingsPanel currentEmail="owner@example.com" />);
    expect(
      screen.getByText(
        /Manage how you sign in and secure your account\. These settings are private\./,
      ),
    ).toBeDefined();
  });

  it("puts deletion in DANGER ZONE and sign-out-everywhere outside it", () => {
    activityState.data = { items: [], total: 0, total_pages: 0 };
    renderWithClient(<AccountSettingsPanel currentEmail="owner@example.com" />);
    const body = document.body.textContent ?? "";
    const danger = body.indexOf("DANGER ZONE");
    const signOut = body.indexOf("SECURITY ACTIONS");
    expect(body.indexOf("Delete my account")).toBeGreaterThan(danger);
    // Reversible-by-re-login, so it must sit in its own section BEFORE
    // the danger zone rather than being lumped in with a permanent delete.
    expect(signOut).toBeLessThan(danger);
    expect(body.indexOf("Sign out everywhere…")).toBeLessThan(danger);
  });

  it("renders no duplicate heading for the wallets section", () => {
    activityState.data = { items: [], total: 0, total_pages: 0 };
    renderWithClient(<AccountSettingsPanel currentEmail="owner@example.com" />);
    const body = document.body.textContent ?? "";
    expect(body.split("Linked wallets").length - 1).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Security activity — the critical correction
// ─────────────────────────────────────────────────────────────────────

describe("security activity", () => {
  it("a FAILED load never renders the empty state", () => {
    activityState.isError = true;
    activityState.data = undefined;
    renderWithClient(<AccountActivitySection />);
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
    expect(
      screen.getByText(/This does not mean nothing happened/i),
    ).toBeDefined();
  });

  it("the failure offers a real retry wired to refetch", () => {
    activityState.isError = true;
    renderWithClient(<AccountActivitySection />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(activityRefetch).toHaveBeenCalledTimes(1);
  });

  it("a CONFIRMED empty response may still show the empty state", () => {
    activityState.data = { items: [], total: 0, total_pages: 0 };
    renderWithClient(<AccountActivitySection />);
    expect(screen.getByText(EMPTY_COPY)).toBeDefined();
  });

  it("keeps existing rows when a background refetch fails", () => {
    activityState.isError = true;
    activityState.data = {
      items: [
        { id: 1, action: "account_password_changed", created_at: "2026-09-01 10:00:00", ip_masked: "203.0.113.x" },
      ],
      total: 1,
      total_pages: 1,
    };
    renderWithClient(<AccountActivitySection />);
    // Known history survives...
    expect(screen.getByText("Password changed")).toBeDefined();
    // ...and is never replaced by the empty claim or a blocking screen.
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(activityRefetch).toHaveBeenCalledTimes(1);
  });

  it("still renders nothing during the very first fetch (no spinner)", () => {
    activityState.isPending = true;
    const { container } = renderWithClient(<AccountActivitySection />);
    expect(container.textContent).toBe("");
  });

  it("never populates two live regions at once", () => {
    activityState.isError = true;
    activityState.data = {
      items: [{ id: 1, action: "wallet_linked", created_at: "2026-09-01 10:00:00", ip_masked: "" }],
      total: 1,
      total_pages: 1,
    };
    renderWithClient(<AccountActivitySection />);
    const populated = [
      ...document.querySelectorAll('[role="status"],[role="alert"]'),
    ].filter((n) => (n.textContent ?? "").trim() !== "");
    expect(populated).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Sign out everywhere
// ─────────────────────────────────────────────────────────────────────

describe("sign out everywhere", () => {
  const open = () =>
    fireEvent.click(screen.getByRole("button", { name: /sign out everywhere…/i }));

  it("requires confirmation before mutating", () => {
    renderWithClient(<SessionsRevokeSection />);
    open();
    expect(screen.getByRole("dialog")).toBeDefined();
    expect(logoutMutate).not.toHaveBeenCalled();
  });

  it("cannot fire twice from a double click", () => {
    renderWithClient(<SessionsRevokeSection />);
    open();
    const confirm = within(screen.getByRole("dialog")).getByRole("button", {
      name: "Sign out everywhere",
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(logoutMutate).toHaveBeenCalledTimes(1);
  });

  it("Escape closes and restores focus to the trigger", () => {
    renderWithClient(<SessionsRevokeSection />);
    const trigger = screen.getByRole("button", { name: /sign out everywhere…/i });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("Cancel restores focus to the trigger", () => {
    renderWithClient(<SessionsRevokeSection />);
    const trigger = screen.getByRole("button", { name: /sign out everywhere…/i });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: /stay signed in/i }));
    expect(document.activeElement).toBe(trigger);
  });

  it("a failure is recoverable and shows code-mapped copy, not err.message", () => {
    logoutMutate.mockImplementation((_v: unknown, opts: { onError?: (e: unknown) => void }) => {
      opts.onError?.(
        new BccApiError("bcc_rate_limited", "RAW SERVER TEXT MUST NOT APPEAR", 429, null),
      );
    });
    renderWithClient(<SessionsRevokeSection />);
    open();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Sign out everywhere" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Cooling off");
    expect(document.body.textContent).not.toContain("RAW SERVER TEXT MUST NOT APPEAR");
    // Still open, still retryable.
    expect(within(dialog).getByRole("button", { name: /try again/i })).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Delete account
// ─────────────────────────────────────────────────────────────────────

describe("delete account", () => {
  const openForm = () =>
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));

  it("requires BOTH the exact DELETE phrase and a password", () => {
    renderWithClient(<DeleteAccountCard />);
    openForm();
    const submit = screen.getByRole("button", { name: /delete forever/i });
    const phrase = screen.getByLabelText(/type delete to confirm/i);
    const pw = screen.getByLabelText(/current password/i);

    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.change(phrase, { target: { value: "delete" } }); // wrong case
    fireEvent.change(pw, { target: { value: "hunter2hunter2" } });
    expect(submit.hasAttribute("disabled")).toBe(true);

    fireEvent.change(phrase, { target: { value: "DELETE" } });
    expect(submit.hasAttribute("disabled")).toBe(false);

    fireEvent.change(pw, { target: { value: "" } });
    expect(submit.hasAttribute("disabled")).toBe(true);
  });

  it("is NOT wrapped in a second generic confirmation dialog", () => {
    renderWithClient(<DeleteAccountCard />);
    openForm();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cancel clears the password and restores focus to the trigger", () => {
    renderWithClient(<DeleteAccountCard />);
    const trigger = screen.getByRole("button", { name: /delete my account/i });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "hunter2hunter2" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    // The collapsed and expanded states render different button nodes, so
    // the trigger is re-queried rather than compared to the stale one.
    const restored = screen.getByRole("button", { name: /delete my account/i });
    expect(document.activeElement).toBe(restored);
    expect(restored).not.toBe(trigger);
    // Re-open: the password field must be empty again.
    fireEvent.click(restored);
    expect((screen.getByLabelText(/current password/i) as HTMLInputElement).value).toBe("");
  });

  it("cannot double-submit", () => {
    renderWithClient(<DeleteAccountCard />);
    openForm();
    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "DELETE" },
    });
    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "hunter2hunter2" },
    });
    const submit = screen.getByRole("button", { name: /delete forever/i });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(deleteMutate).toHaveBeenCalledTimes(1);
  });

  it("a server failure shows code-mapped copy and never err.message", async () => {
    deleteMutate.mockImplementation(() => {
      deleteHandlers.onError?.(
        new BccApiError("bcc_forbidden", "RAW DELETE ERROR TEXT", 403, null),
      );
    });
    renderWithClient(<DeleteAccountCard />);
    openForm();
    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), {
      target: { value: "DELETE" },
    });
    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "hunter2hunter2" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /delete forever/i }));
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.getByRole("alert").textContent).toMatch(/isn't available on this site/i);
    expect(document.body.textContent).not.toContain("RAW DELETE ERROR TEXT");
  });

  it("the DELETE field and password are described by the confirmation guidance", () => {
    renderWithClient(<DeleteAccountCard />);
    openForm();
    for (const el of [
      screen.getByLabelText(/type delete to confirm/i),
      screen.getByLabelText(/current password/i),
    ]) {
      const id = el.getAttribute("aria-describedby");
      expect(id).not.toBeNull();
      expect(document.getElementById(id ?? "")?.textContent).toMatch(/permanent/i);
    }
  });
});
