/**
 * F-333 — the handle can be changed again.
 *
 * Covers the editor (shape check, confirm, every error by code, success
 * copy) and the hook's follow-through (session handle refresh, query
 * invalidation, route refresh). The server's error message is a decoy
 * that must never render (§γ).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const DECOY = "SERVER MESSAGE THAT MUST NEVER RENDER";

const updateHandle = vi.hoisted(() => vi.fn());
const sessionUpdate = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const prefsState = vi.hoisted(() => ({ handle_next_change_at: null as string | null }));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/lib/api/onboarding-endpoints", () => ({
  updateHandle: (...a: unknown[]) => updateHandle(...a),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { handle: "old-name" } }, status: "authenticated", update: sessionUpdate }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/hooks/useProfilePrefs", () => ({
  PROFILE_PREFS_QUERY_KEY: ["bcc", "me", "profile-prefs"],
  useProfilePrefs: () => ({ data: { handle_next_change_at: prefsState.handle_next_change_at } }),
}));

const { HandleSection } = await import("@/components/settings/HandleSection");

let qc: QueryClient;
const wrap = (n: ReactNode) => <QueryClientProvider client={qc}>{n}</QueryClientProvider>;

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
  updateHandle.mockReset();
  sessionUpdate.mockReset();
  refresh.mockReset();
  prefsState.handle_next_change_at = null;
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => {
  cleanup();
  qc.clear();
});

const input = () => screen.getByRole("textbox", { name: /your handle/i });
const submit = () => screen.getByRole("button", { name: "Change handle" });

function typeAndConfirm(value: string) {
  fireEvent.change(input(), { target: { value } });
  fireEvent.click(submit());
  const dialog = screen.getByRole("dialog", { name: `Change your handle to @${value}?` });
  fireEvent.click(within(dialog).getByRole("button", { name: "CHANGE HANDLE" }));
}

describe("HandleSection — cooldown known before submitting (#653)", () => {
  it("while the cooldown runs, says when and offers no change", () => {
    prefsState.handle_next_change_at = "2099-01-01T00:00:00Z";
    render(wrap(<HandleSection handle="old-name" />));
    expect(screen.getByText(/You can change your handle again on/)).toBeInTheDocument();
    expect(input()).toBeDisabled();
    expect(submit()).toBeDisabled();
  });

  it("a past date is not a lock", () => {
    prefsState.handle_next_change_at = "2000-01-01T00:00:00Z";
    render(wrap(<HandleSection handle="old-name" />));
    expect(screen.queryByText(/You can change your handle again on/)).toBeNull();
    fireEvent.change(input(), { target: { value: "new-name" } });
    expect(submit()).toBeEnabled();
  });
});

describe("HandleSection — editing", () => {
  it("shows the current handle; Save is off until it changes to a valid shape", () => {
    render(wrap(<HandleSection handle="old-name" />));
    expect(input()).toHaveValue("old-name");
    expect(submit()).toBeDisabled();

    fireEvent.change(input(), { target: { value: "ab" } });
    expect(submit()).toBeDisabled();
    expect(screen.getByText(/need at least 3 characters/i)).toBeInTheDocument();

    fireEvent.change(input(), { target: { value: "admin" } });
    expect(submit()).toBeDisabled();

    fireEvent.change(input(), { target: { value: "new-name" } });
    expect(submit()).toBeEnabled();
  });

  it("asks first; CANCEL sends nothing", () => {
    render(wrap(<HandleSection handle="old-name" />));
    fireEvent.change(input(), { target: { value: "new-name" } });
    fireEvent.click(submit());
    const dialog = screen.getByRole("dialog", { name: "Change your handle to @new-name?" });
    expect(dialog).toHaveTextContent("nobody else can take @old-name");
    fireEvent.click(within(dialog).getByRole("button", { name: "CANCEL" }));
    expect(updateHandle).not.toHaveBeenCalled();
  });

  it("on success: says so, refreshes the session handle, invalidates profiles, refreshes the route", async () => {
    updateHandle.mockResolvedValue({ handle: "new-name", next_change_at: "2026-11-19T12:00:00Z" });
    sessionUpdate.mockResolvedValue({ user: { handle: "new-name" } });
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    render(wrap(<HandleSection handle="old-name" />));

    typeAndConfirm("new-name");

    expect(await screen.findByRole("status")).toHaveTextContent("Your handle is now @new-name. Old links still work.");
    expect(updateHandle).toHaveBeenCalledWith("new-name");
    expect(sessionUpdate).toHaveBeenCalledWith({ refreshHandle: true });
    expect(screen.getByRole("status")).not.toHaveTextContent(/sign in again/i);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["user"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["user-profile"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["bcc", "me", "profile-prefs"] });
    expect(refresh).toHaveBeenCalled();
  });

  it("is honest when the session could not be refreshed", async () => {
    updateHandle.mockResolvedValue({ handle: "new-name", next_change_at: "2026-11-19T12:00:00Z" });
    sessionUpdate.mockResolvedValue({ user: { handle: "old-name" } });
    render(wrap(<HandleSection handle="old-name" />));
    typeAndConfirm("new-name");
    expect(await screen.findByRole("status")).toHaveTextContent(/until you sign in again/i);
  });

  it.each([
    ["bcc_conflict", 409, "That handle is already taken."],
    ["bcc_handle_reserved", 422, "That handle is reserved. Pick something else."],
    ["bcc_invalid_handle", 422, "That handle isn't allowed."],
    ["bcc_forbidden", 403, "Your account can't change its handle right now."],
    ["bcc_internal_error", 500, "Nothing changed — try again."],
    ["bcc_rate_limited", 429, "You changed your handle recently"],
  ])("%s shows its own line, never the server's message", async (code, status, line) => {
    updateHandle.mockRejectedValue(new BccApiError(code, DECOY, status, null));
    render(wrap(<HandleSection handle="old-name" />));
    typeAndConfirm("new-name");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(line));
    expect(document.body.textContent ?? "").not.toContain(DECOY);
    expect(sessionUpdate).not.toHaveBeenCalled();
  });

  it("the cooldown names the date when the server sends it", async () => {
    updateHandle.mockRejectedValue(
      new BccApiError("bcc_rate_limited", DECOY, 429, {
        error: { code: "bcc_rate_limited", message: DECOY, data: { next_change_at: "2026-11-19T12:00:00Z" } },
      } as never),
    );
    render(wrap(<HandleSection handle="old-name" />));
    typeAndConfirm("new-name");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/You can change it again on/));
  });
});
