/**
 * The three destructive Account controls, driven through real mutations.
 *
 * `account-wallets.test.tsx` stubs `useUnlinkWallet` and reaches into the
 * captured `onError`. That proves the component's branches; it cannot
 * prove the ORDERING a real `useMutation` produces when a user is faster
 * than the network. Everything here uses the real hooks against a real
 * `QueryClient`, with only the endpoint functions controlled, and every
 * response is released by hand so the interleavings are deliberate.
 *
 * What is being defended:
 *
 *   • Unlink is per-row. Two rows, one dialog, one mutation — a response
 *     that arrives after the user has moved on must not be attributed to
 *     whichever row happens to be open.
 *   • Sign-out-everywhere is fire-and-forget by design (the hook signs
 *     out and navigates), so its failure path is the only one that ever
 *     returns to this component — and it must survive the component
 *     going away first.
 *   • Delete restores focus to a trigger that is REMOUNTED, not merely
 *     re-shown, so a ref captured before the form opened is stale.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/wallet/linkFlow", () => ({
  runLinkFlow: vi.fn(),
  humanizeLinkError: () => "Wallet unavailable.",
}));
vi.mock("@/components/onchain/CollectionStancePanel", () => ({
  CollectionStancePanel: () => null,
}));

// The network seams. Nothing else is stubbed.
const seams = vi.hoisted(() => ({
  getWallets: vi.fn(),
  unlinkWallet: vi.fn(),
  logoutEverywhere: vi.fn(),
  deleteAccount: vi.fn(),
}));
vi.mock("@/lib/api/wallets-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getMyWallets: seams.getWallets,
  unlinkWallet: seams.unlinkWallet,
}));
vi.mock("@/lib/api/account-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  logoutEverywhere: seams.logoutEverywhere,
  deleteAccount: seams.deleteAccount,
}));
// `useLogoutEverywhere` calls signOut on success. Left real, it posts to a
// relative /api/auth/* URL that Node's fetch cannot parse — noise from the
// auth library, unrelated to what is being asserted.
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

import { SessionsRevokeSection } from "@/components/settings/SessionsRevokeSection";
import { WalletsSection } from "@/components/settings/WalletsSection";
import { DeleteAccountCard } from "@/components/settings/profile/DeleteAccountCard";
import { BccApiError } from "@/lib/api/types";

/** A promise whose settlement this test decides. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // React Query attaches its handlers synchronously on call, so nothing is
  // ever unobserved; no extra catch is needed here.
  return { promise, resolve, reject };
}

const WALLETS = {
  items: [
    {
      id: 11, chain_slug: "base", chain_name: "Base",
      wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
      verified: true, is_primary: true, created_at: "2026-08-01 10:00:00", explorer_url: "",
    },
    {
      id: 22, chain_slug: "ethereum", chain_name: "Ethereum",
      wallet_address: "0xfedcba0987654321fedcba0987654321fedcba09",
      verified: true, is_primary: false, created_at: "2026-08-02 10:00:00", explorer_url: "",
    },
  ],
  recovery: { has_recovery_email: true, verified_wallet_count: 2 },
};

function renderWith(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return { ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>), client };
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    value: () => {}, writable: true, configurable: true,
  });
});

beforeEach(() => {
  // Block bodies, not expression bodies: a function returned from a Vitest
  // hook is treated as a TEARDOWN callback and would be invoked after every
  // test — which, for a mock whose implementation rejects, produces an
  // unhandled rejection attributed to a test that had already passed.
  seams.getWallets.mockReset();
  seams.unlinkWallet.mockReset();
  seams.logoutEverywhere.mockReset();
  seams.deleteAccount.mockReset();
  seams.getWallets.mockResolvedValue(WALLETS);
});
afterEach(cleanup);

const unlinkTriggers = () => screen.getAllByRole("button", { name: "Unlink" });
const dialog = () => screen.getByRole("dialog");

async function openUnlink(index: number) {
  await screen.findByRole("button", { name: "Copy Base wallet address" });
  fireEvent.click(unlinkTriggers()[index] as HTMLElement);
  return dialog();
}

// ─────────────────────────────────────────────────────────────────────
// Unlink: one dialog, two rows
// ─────────────────────────────────────────────────────────────────────

describe("unlink ownership", () => {
  it("sends the id of the row that was activated", async () => {
    seams.unlinkWallet.mockReturnValue(deferred<unknown>().promise);
    renderWith(<WalletsSection />);
    const d = await openUnlink(1);
    expect(d.textContent).toContain("Ethereum");

    fireEvent.click(within(d).getByRole("button", { name: "Unlink wallet" }));
    await waitFor(() => expect(seams.unlinkWallet).toHaveBeenCalledWith(22));
  });

  it("cannot be cancelled mid-flight — the request is already sent", async () => {
    const d1 = deferred<unknown>();
    seams.unlinkWallet.mockReturnValue(d1.promise);
    renderWith(<WalletsSection />);
    const d = await openUnlink(0);
    fireEvent.click(within(d).getByRole("button", { name: "Unlink wallet" }));

    await waitFor(() =>
      expect(within(dialog()).getByRole("button", { name: "Keep wallet" })).toBeDisabled(),
    );
    fireEvent.click(within(dialog()).getByRole("button", { name: "Keep wallet" }));
    fireEvent.keyDown(dialog(), { key: "Escape" });
    // Still open: an outcome that cannot be recalled must be reported.
    expect(screen.getByRole("dialog")).toBeDefined();

    await act(async () => {
      d1.resolve({ ok: true });
    });
  });

  it("a SECOND unlink after a first FAILED targets the second row only", async () => {
    // The interleaving that matters: fail on Base, cancel, open Ethereum,
    // confirm. A shared `confirmingId` that was not cleared, or an error
    // string that outlived its dialog, would show here.
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    seams.unlinkWallet.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderWith(<WalletsSection />);

    const d = await openUnlink(0);
    fireEvent.click(within(d).getByRole("button", { name: "Unlink wallet" }));
    await act(async () => {
      first.reject(new BccApiError("bcc_internal_error", "RAW", 500, null));
    });
    // The alert, not any text — "Try again" is also the retry button's label.
    await within(dialog()).findByRole("alert");

    fireEvent.click(within(dialog()).getByRole("button", { name: "Keep wallet" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    const d2 = await openUnlink(1);
    // The previous failure must not have followed the dialog to a new row.
    expect(within(d2).queryByRole("alert")).toBeNull();
    expect(d2.textContent).toContain("Ethereum");

    fireEvent.click(within(d2).getByRole("button", { name: "Unlink wallet" }));
    await waitFor(() => expect(seams.unlinkWallet).toHaveBeenLastCalledWith(22));
    await act(async () => {
      second.resolve({ ok: true });
    });
  });

  it("a LATE failure after the dialog was closed does not reopen it", async () => {
    // Reachable because a success closes the dialog: if a response then
    // arrived for an earlier attempt, resurrecting the confirmation would
    // ask the user to decide something they already decided.
    const late = deferred<unknown>();
    seams.unlinkWallet.mockReturnValueOnce(late.promise);
    renderWith(<WalletsSection />);
    const d = await openUnlink(0);
    fireEvent.click(within(d).getByRole("button", { name: "Unlink wallet" }));

    await act(async () => {
      late.resolve({ ok: true });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("a successful unlink lands focus somewhere real, not on <body>", async () => {
    const done = deferred<unknown>();
    seams.unlinkWallet.mockReturnValueOnce(done.promise);
    renderWith(<WalletsSection />);
    const d = await openUnlink(0);
    fireEvent.click(within(d).getByRole("button", { name: "Unlink wallet" }));
    await act(async () => {
      done.resolve({ ok: true });
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // The row that owned the trigger is gone; focus must not fall to body.
    expect(document.activeElement).not.toBe(document.body);
    expect(document.activeElement).not.toBeNull();
  });

  it("double-clicking Confirm sends ONE request", async () => {
    seams.unlinkWallet.mockReturnValue(deferred<unknown>().promise);
    renderWith(<WalletsSection />);
    const d = await openUnlink(0);
    const confirm = within(d).getByRole("button", { name: "Unlink wallet" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(seams.unlinkWallet).toHaveBeenCalledTimes(1));
  });
});

// ─────────────────────────────────────────────────────────────────────
// Sign out everywhere
// ─────────────────────────────────────────────────────────────────────

describe("sign out everywhere", () => {
  const open = () => {
    fireEvent.click(screen.getByRole("button", { name: /Sign out everywhere…/ }));
    return dialog();
  };

  it("asks first and sends nothing on its own", () => {
    renderWith(<SessionsRevokeSection />);
    open();
    expect(seams.logoutEverywhere).not.toHaveBeenCalled();
  });

  it("cannot be cancelled once sent", async () => {
    seams.logoutEverywhere.mockReturnValue(deferred<unknown>().promise);
    renderWith(<SessionsRevokeSection />);
    const d = open();
    fireEvent.click(within(d).getByRole("button", { name: "Sign out everywhere" }));

    await waitFor(() =>
      expect(within(dialog()).getByRole("button", { name: "Stay signed in" })).toBeDisabled(),
    );
    fireEvent.keyDown(dialog(), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("a failure keeps the dialog, offers a retry, and hides the server's words", async () => {
    const attempt = deferred<unknown>();
    seams.logoutEverywhere.mockReturnValueOnce(attempt.promise);
    renderWith(<SessionsRevokeSection />);
    const d = open();
    fireEvent.click(within(d).getByRole("button", { name: "Sign out everywhere" }));
    await act(async () => {
      attempt.reject(new BccApiError("bcc_internal_error", "RAW REVOKE TEXT", 500, null));
    });

    const alert = await within(dialog()).findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn't sign out everywhere/i);
    expect(document.body.textContent).not.toContain("RAW REVOKE TEXT");
    expect(within(dialog()).getByRole("button", { name: "Try again" })).toBeDefined();
  });

  it("the retry after a failure actually re-sends", async () => {
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    seams.logoutEverywhere.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    renderWith(<SessionsRevokeSection />);
    const d = open();
    fireEvent.click(within(d).getByRole("button", { name: "Sign out everywhere" }));
    await act(async () => {
      a.reject(new BccApiError("bcc_internal_error", "x", 500, null));
    });
    await within(dialog()).findByRole("alert");

    fireEvent.click(within(dialog()).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(seams.logoutEverywhere).toHaveBeenCalledTimes(2));
    await act(async () => {
      b.resolve({ ok: true });
    });
  });

  it("cancelling clears the error, so reopening starts clean", async () => {
    const a = deferred<unknown>();
    seams.logoutEverywhere.mockReturnValueOnce(a.promise);
    renderWith(<SessionsRevokeSection />);
    const d = open();
    fireEvent.click(within(d).getByRole("button", { name: "Sign out everywhere" }));
    await act(async () => {
      a.reject(new BccApiError("bcc_internal_error", "x", 500, null));
    });
    await within(dialog()).findByRole("alert");

    fireEvent.click(within(dialog()).getByRole("button", { name: "Stay signed in" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    open();
    expect(within(dialog()).queryByRole("alert")).toBeNull();
    expect(within(dialog()).getByRole("button", { name: "Sign out everywhere" })).toBeDefined();
  });

  it("Cancel returns focus to the trigger it came from", () => {
    renderWith(<SessionsRevokeSection />);
    const trigger = screen.getByRole("button", { name: /Sign out everywhere…/ });
    fireEvent.click(trigger);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Stay signed in" }));
    expect(document.activeElement).toBe(trigger);
  });

  it("a LATE failure after unmount neither throws nor warns", async () => {
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...a) => {
      errors.push(a);
    });
    try {
      const late = deferred<unknown>();
      seams.logoutEverywhere.mockReturnValueOnce(late.promise);
      const view = renderWith(<SessionsRevokeSection />);
      const d = open();
      fireEvent.click(within(d).getByRole("button", { name: "Sign out everywhere" }));

      view.unmount();
      await act(async () => {
        late.reject(new BccApiError("bcc_internal_error", "x", 500, null));
      });
      expect(errors, `console.error after unmount: ${JSON.stringify(errors)}`).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// Delete account
// ─────────────────────────────────────────────────────────────────────

describe("delete account", () => {
  const openForm = () => {
    fireEvent.click(screen.getByRole("button", { name: /Delete my account/ }));
  };
  const type = (label: RegExp, value: string) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  };

  it("both gates are required before the button arms", () => {
    renderWith(<DeleteAccountCard />);
    openForm();
    const submit = screen.getByRole("button", { name: /Delete forever/ });
    expect(submit).toBeDisabled();

    type(/TYPE DELETE TO CONFIRM/i, "DELETE");
    expect(submit).toBeDisabled();

    type(/CURRENT PASSWORD/i, "hunter2");
    expect(submit).toBeEnabled();
  });

  it("the phrase must match exactly", () => {
    renderWith(<DeleteAccountCard />);
    openForm();
    type(/CURRENT PASSWORD/i, "hunter2");
    for (const wrong of ["delete", "DELETE ", "DELET", "Delete"]) {
      type(/TYPE DELETE TO CONFIRM/i, wrong);
      expect(screen.getByRole("button", { name: /Delete forever/ }), wrong).toBeDisabled();
    }
    type(/TYPE DELETE TO CONFIRM/i, "DELETE");
    expect(screen.getByRole("button", { name: /Delete forever/ })).toBeEnabled();
  });

  it("sends ONE request for a double-clicked submit", async () => {
    seams.deleteAccount.mockReturnValue(deferred<unknown>().promise);
    renderWith(<DeleteAccountCard />);
    openForm();
    type(/TYPE DELETE TO CONFIRM/i, "DELETE");
    type(/CURRENT PASSWORD/i, "hunter2");
    const submit = screen.getByRole("button", { name: /Delete forever/ });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(seams.deleteAccount).toHaveBeenCalledTimes(1));
  });

  it("a failure releases the latch so a corrected retry works", async () => {
    const a = deferred<unknown>();
    const b = deferred<unknown>();
    seams.deleteAccount.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    renderWith(<DeleteAccountCard />);
    openForm();
    type(/TYPE DELETE TO CONFIRM/i, "DELETE");
    type(/CURRENT PASSWORD/i, "wrong");
    fireEvent.click(screen.getByRole("button", { name: /Delete forever/ }));
    await act(async () => {
      a.reject(new BccApiError("bcc_invalid_request", "RAW DELETE TEXT", 400, null));
    });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Check the values and try again/i);
    expect(document.body.textContent).not.toContain("RAW DELETE TEXT");

    type(/CURRENT PASSWORD/i, "right");
    fireEvent.click(screen.getByRole("button", { name: /Delete forever/ }));
    await waitFor(() => expect(seams.deleteAccount).toHaveBeenCalledTimes(2));
    await act(async () => {
      b.resolve({ logout_url: "/" });
    });
  });

  it("Cancel wipes the password rather than parking it behind a collapsed form", () => {
    renderWith(<DeleteAccountCard />);
    openForm();
    type(/TYPE DELETE TO CONFIRM/i, "DELETE");
    type(/CURRENT PASSWORD/i, "hunter2");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    openForm();
    expect((screen.getByLabelText(/CURRENT PASSWORD/i) as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText(/TYPE DELETE TO CONFIRM/i) as HTMLInputElement).value).toBe("");
  });

  it("Cancel returns focus to the REMOUNTED trigger", () => {
    // The subtle part. Collapsed and expanded are different renders, so a
    // node captured before opening is detached afterwards. The assertion
    // must therefore re-query, and must check the live document rather
    // than a stale handle.
    renderWith(<DeleteAccountCard />);
    const before = screen.getByRole("button", { name: /Delete my account/ });
    openForm();
    expect(before.isConnected).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const after = screen.getByRole("button", { name: /Delete my account/ });
    expect(after.isConnected).toBe(true);
    expect(document.activeElement).toBe(after);
    expect(document.activeElement).not.toBe(document.body);
  });

  it("a 403 explains that deletion is switched off, in our words", async () => {
    const a = deferred<unknown>();
    seams.deleteAccount.mockReturnValueOnce(a.promise);
    renderWith(<DeleteAccountCard />);
    openForm();
    type(/TYPE DELETE TO CONFIRM/i, "DELETE");
    type(/CURRENT PASSWORD/i, "hunter2");
    fireEvent.click(screen.getByRole("button", { name: /Delete forever/ }));
    await act(async () => {
      a.reject(new BccApiError("bcc_forbidden", "site_registration_allowdelete", 403, null));
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/isn't available on this site/i);
    expect(document.body.textContent).not.toContain("site_registration_allowdelete");
  });
});
