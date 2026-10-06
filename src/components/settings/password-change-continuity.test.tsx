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

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
const endSession = vi.fn<(reason: string, opts?: unknown) => Promise<unknown>>();
const setPendingAuthNotice = vi.fn<(slug: string | null, ttlMs?: number) => void>();
vi.mock("@/lib/auth/session-boundary", async (importOriginal) => ({
  ...(await importOriginal<typeof SessionBoundaryModule>()),
  endSession: (reason: string, opts?: unknown) => endSession(reason, opts),
  setPendingAuthNotice: (slug: string | null, ttlMs?: number) =>
    setPendingAuthNotice(slug, ttlMs),
  PENDING_NOTICE_TTL_MS: 120_000,
}));
vi.mock("@/lib/auth/session-update", () => ({
  updateSessionBearer: (u: { token: string; expiresIn: number }) =>
    updateSessionBearer(u),
}));

import type * as AccountEndpointsModule from "@/lib/api/account-endpoints";
import type * as SessionBoundaryModule from "@/lib/auth/session-boundary";
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
  render(
    <QueryClientProvider client={qc}>
      <AccountSection currentEmail="a@example.test" />
    </QueryClientProvider>,
  );
  return qc;
}

/** Same, but hands back the client so the mutation cache can be inspected. */
function mountWithClient() {
  return mount();
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
  endSession.mockReset();
  endSession.mockResolvedValue({});
  setPendingAuthNotice.mockReset();
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

  it("offers sign-in recovery that actually reaches the login form", async () => {
    // A plain <a href="/login"> was a DEAD END: login/page.tsx redirects any
    // visitor holding a NextAuth session to /?authNotice=login, and in this
    // state the cookie is still present — only the bearer is dead — so the
    // link bounced straight back to the feed. Going through the session
    // boundary ends the session first, which both reaches /login and clears
    // this device's cached private data after a credential rotation.
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(false);
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /sign in again/i }),
      ).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in again/i }));
    expect(endSession).toHaveBeenCalledWith("user", { callbackUrl: "/login" });
  });

  it("the recovery is NOT a bare link to /login", async () => {
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(false);
    mount();
    submitPasswordChange();
    await waitFor(() => {
      expect(screen.getByText(/password changed/i)).toBeInTheDocument();
    });
    const link = screen
      .queryAllByRole("link")
      .find((a) => /sign in again/i.test(a.textContent ?? ""));
    expect(link, "a plain link here would bounce off the /login guard").toBeUndefined();
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

// ─────────────────────────────────────────────────────────────────────
// The explanation must survive a teardown this component did not start
// ─────────────────────────────────────────────────────────────────────

describe("parking the accurate notice", () => {
  it("parks password-changed as soon as the session is known to be lost", async () => {
    // The session still holds the REVOKED bearer, so the next authed poll
    // 401s and ends it — the badges query alone polls every 30-60s while
    // visible. That path passes notice "signed-out", which says nothing
    // about the password having changed; a viewer who then tries their OLD
    // password concludes the change failed. Teardown is single-flight, so
    // parking is what makes the accurate copy independent of the race.
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(false);
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /password changed/i }),
      ).toBeInTheDocument();
    });
    expect(setPendingAuthNotice).toHaveBeenCalledWith(
      "password-changed",
      expect.any(Number),
    );
  });

  it("parks it with a DEADLINE and does not withdraw it on success", async () => {
    // ⚠ Changed deliberately 2026-10-06. This test previously asserted the
    // park was withdrawn when the session came back restored. That was
    // wrong for the case that matters: "restored" includes the outcome
    // where a DIFFERENT bearer was found and only the echo licensed
    // accepting it — which can be a dead pre-revocation token. Withdrawing
    // there threw the explanation away seconds before that bearer tore the
    // session down, leaving a generic "your session ended" after a
    // password change, and a viewer with every reason to try their OLD
    // password.
    //
    // The deadline retires it instead, so nothing has to guess whether the
    // write landed. A parked slug outranks only the GENERIC one, so a
    // suspension in that window still reads as a suspension.
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(true);
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(updateSessionBearer).toHaveBeenCalled();
    });
    expect(setPendingAuthNotice).toHaveBeenCalledWith(
      "password-changed",
      expect.any(Number),
    );
    // ⚠ Not `toHaveBeenCalledWith(null)`: the mock records TWO arguments
    // (slug, ttlMs), so an exact-arguments matcher never matches a
    // `setPendingAuthNotice(null)` call and the assertion passed either
    // way. A mutation control that re-added the withdrawal survived on
    // precisely that. Check the recorded slugs instead.
    expect(
      setPendingAuthNotice.mock.calls.some(([slug]) => slug === null),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// A throw FROM the PATCH may still be post-commit
// ─────────────────────────────────────────────────────────────────────

describe("an indeterminate outcome is not called a failure", () => {
  it("does not say 'try again' when the request itself threw", async () => {
    // The server commits the rotation and sends the notification email
    // before the response is written, so a dropped connection reaches us
    // as an error with the credential ALREADY changed. "Try again" invites
    // a resubmission whose current_password is now the old one.
    patchAccountPassword.mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    const copy = screen.getByRole("alert").textContent ?? "";
    expect(copy).toMatch(/couldn't confirm whether the change went through/i);
    // The actionable instruction must LEAD. The email cannot be the
    // tiebreaker: the mailer runs after the post-commit steps this branch
    // exists to cover, so a fatal there rotates the password and sends
    // nothing, and "check your email" would then read as "it failed".
    expect(copy).toMatch(/try signing in with your new password/i);
    const emailAt = copy.search(/email/i);
    const signInAt = copy.search(/try signing in/i);
    expect(signInAt).toBeGreaterThanOrEqual(0);
    expect(emailAt).toBeGreaterThan(signInAt);
    expect(copy).toMatch(/may also receive/i);
    expect(copy).not.toMatch(/^Something went wrong\. Try again\.$/);
  });

  it("treats an unparseable 200 body the same way", async () => {
    const { BccApiError } = await import("@/lib/api/types");
    patchAccountPassword.mockRejectedValue(
      new BccApiError("bcc_invalid_response", "bad body", 200, null),
    );
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(
        screen.getByText(/couldn't confirm whether the change went through/i),
      ).toBeInTheDocument();
    });
  });

  it("still reports a DEFINITE rejection plainly", async () => {
    // A wrong current_password is unambiguous: nothing was committed, and
    // retrying is exactly the right advice.
    const { BccApiError } = await import("@/lib/api/types");
    patchAccountPassword.mockRejectedValue(
      new BccApiError("bcc_invalid_request", "nope", 400, null),
    );
    mount();
    submitPasswordChange();

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    const copy = screen.getByRole("alert").textContent ?? "";
    expect(copy).not.toMatch(/couldn't confirm/i);
    // And it must not claim the password changed.
    expect(copy).not.toMatch(/was changed/i);
  });
});

describe("definite-ness, not a list of codes", () => {
  it("treats a post-commit 500 as indeterminate", async () => {
    // wp_set_password commits first and the controller has no catch, so a
    // fatal in token revocation / the audit write / the mailer returns
    // WordPress's own fatal response. For a JSON request that is VALID
    // JSON of the wrong shape, so the client throws bcc_unexpected_status
    // — which is unmapped, so the old copy was "Something went wrong. Try
    // again." for a password that had already changed.
    const { BccApiError } = await import("@/lib/api/types");
    patchAccountPassword.mockRejectedValue(
      new BccApiError("bcc_unexpected_status", "Unexpected 500", 500, null),
    );
    mount();
    submitPasswordChange();
    await waitFor(() => {
      expect(
        screen.getByText(/couldn't confirm whether the change went through/i),
      ).toBeInTheDocument();
    });
  });

  it("treats a MAPPED 500 as indeterminate too", async () => {
    // bcc_internal_error is mapped, to the equally definite "Server
    // error. Try again." — a 5xx on this route is never definite.
    const { BccApiError } = await import("@/lib/api/types");
    patchAccountPassword.mockRejectedValue(
      new BccApiError("bcc_internal_error", "boom", 500, null),
    );
    mount();
    submitPasswordChange();
    await waitFor(() => {
      expect(
        screen.getByText(/couldn't confirm whether the change went through/i),
      ).toBeInTheDocument();
    });
  });

  it("still treats a mapped 4xx as a DEFINITE failure", async () => {
    // Pre-commit: the rate limiter runs before the password is verified.
    const { BccApiError } = await import("@/lib/api/types");
    patchAccountPassword.mockRejectedValue(
      new BccApiError("bcc_rate_limited", "slow down", 429, null),
    );
    mount();
    submitPasswordChange();
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    const copy = screen.getByRole("alert").textContent ?? "";
    expect(copy).not.toMatch(/couldn't confirm/i);
    expect(copy).not.toMatch(/was changed/i);
  });
});

describe("parking happens on the FACT, not on the recovery attempt", () => {
  it("parks as soon as the PATCH resolves, before the session write finishes", async () => {
    // The password — and the revocation of every outstanding bearer — is
    // committed the instant patchAccountPassword resolves. Parking in
    // onSuccess means the notice is not set until all three session-write
    // round trips have completed, and that window is actively occupied:
    // the badges query polls and refetches on focus, its 401 refreshes a
    // revoked token, gets "rejected", and ends the session with the
    // GENERIC slug — so a definitely-changed password is announced as
    // "your session ended".
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    let releaseUpdate: ((v: boolean) => void) | undefined;
    updateSessionBearer.mockImplementation(
      () =>
        new Promise<boolean>((r) => {
          releaseUpdate = r;
        }),
    );

    mount();
    submitPasswordChange();

    // The session write has not finished yet.
    await waitFor(() => {
      expect(updateSessionBearer).toHaveBeenCalled();
    });
    expect(setPendingAuthNotice).toHaveBeenCalledWith(
      "password-changed",
      expect.any(Number),
    );

    releaseUpdate?.(true);
  });

  it("keeps it parked after a reported restoration, bounded by its deadline", async () => {
    // Same deliberate change as above: the notice is no longer withdrawn
    // on a reported success, because that report can be wrong. What is
    // asserted instead is that it was parked WITH a bound, so it cannot
    // outlive its usefulness.
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(true);
    mount();
    submitPasswordChange();
    await waitFor(() => {
      expect(updateSessionBearer).toHaveBeenCalled();
    });
    const parked = setPendingAuthNotice.mock.calls.find(
      ([slug]) => slug === "password-changed",
    );
    expect(parked?.[1]).toBeGreaterThan(0);
    // ⚠ Not `toHaveBeenCalledWith(null)`: the mock records TWO arguments
    // (slug, ttlMs), so an exact-arguments matcher never matches a
    // `setPendingAuthNotice(null)` call and the assertion passed either
    // way. A mutation control that re-added the withdrawal survived on
    // precisely that. Check the recorded slugs instead.
    expect(
      setPendingAuthNotice.mock.calls.some(([slug]) => slug === null),
    ).toBe(false);
  });
});

describe("a double submit cannot relabel a committed change", () => {
  it("sends the PATCH once, so the second cannot report a validation failure", async () => {
    // `canSubmit` guards on `!mutation.isPending`, which is a
    // render-derived value: two submits in the same commit interval both
    // pass. Fields clear only in onSuccess, so #2 sends the identical
    // body — #1 commits, #2 hits the now-old current_password and gets a
    // mapped 422, which is `definite` and renders "Check the values and
    // try again." for a password that has already rotated.
    // Both events must arrive BEFORE React re-renders the disabled
    // button — that is the real-world shape (two Enter presses in one
    // frame) and the only thing `canSubmit` cannot see, since it is
    // derived during render. RTL's fireEvent wraps each call in its own
    // act(), which flushes in between, so the two native clicks go
    // inside ONE act() block instead.
    let releasePatch: ((v: unknown) => void) | undefined;
    patchAccountPassword.mockImplementationOnce(
      () =>
        new Promise((r) => {
          releasePatch = r;
        }),
    );
    updateSessionBearer.mockResolvedValue(true);

    mount();
    const card = screen
      .getByRole("heading", { name: /change password/i })
      .closest("section");
    if (card === null) {
      throw new Error("password card not found");
    }
    const inputs = [...card.querySelectorAll('input[type="password"]')];
    fireEvent.change(inputs[0] as Element, { target: { value: "old-password" } });
    fireEvent.change(inputs[1] as Element, { target: { value: "a-new-password-10" } });
    fireEvent.change(inputs[2] as Element, { target: { value: "a-new-password-10" } });
    const button = [...card.querySelectorAll("button")].find((b) =>
      /save password/i.test(b.textContent ?? ""),
    );
    if (button === undefined) {
      throw new Error("save button not found");
    }

    await act(async () => {
      button.click();
      button.click();
    });

    expect(patchAccountPassword).toHaveBeenCalledTimes(1);

    releasePatch?.(SERVER_OK);
    await waitFor(() => {
      expect(updateSessionBearer).toHaveBeenCalled();
    });
    expect(screen.queryByText(/check the values and try again/i)).toBeNull();
  });

  it("does not retain the plaintext passwords after the change", async () => {
    // mutate() stores `variables` on the Mutation in the MutationCache,
    // and on the success path nothing reset it, so both plaintext
    // credentials stayed reachable for as long as the page was mounted.
    patchAccountPassword.mockResolvedValue(SERVER_OK);
    updateSessionBearer.mockResolvedValue(true);
    const qc = mountWithClient();
    submitPasswordChange();

    await waitFor(() => {
      expect(updateSessionBearer).toHaveBeenCalled();
    });
    await waitFor(() => {
      const held = JSON.stringify(
        qc.getMutationCache().getAll().map((m) => m.state.variables ?? null),
      );
      expect(held).not.toContain("old-password");
      expect(held).not.toContain("a-new-password-10");
    });
  });
});
