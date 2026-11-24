/**
 * /me/team-invites (validator admin V1, PR B2).
 *
 * Real components, hooks and QueryClient; only the endpoint module,
 * next/navigation and lib/env are stand-ins. Pinned: each invite's page
 * link, role, inviter (or "BCC staff") and expiry; accept → "Go to the
 * team"; decline; the invite_expired copy; empty and failed reads.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
import type { MyTeamInvite } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/me/team-invites",
  useSearchParams: () => new URLSearchParams(),
}));

const api = vi.hoisted(() => ({
  list: vi.fn(),
  accept: vi.fn(),
  decline: vi.fn(),
}));
vi.mock("@/lib/api/validator-team-endpoints", () => ({
  getMyTeamInvites: (...a: unknown[]) => api.list(...a),
  acceptTeamInvite: (...a: unknown[]) => api.accept(...a),
  declineTeamInvite: (...a: unknown[]) => api.decline(...a),
  getValidatorTeam: vi.fn(),
  inviteValidatorTeamMember: vi.fn(),
  removeValidatorTeamMember: vi.fn(),
  reconfirmValidatorTeamMember: vi.fn(),
  leaveValidatorTeam: vi.fn(),
  setValidatorTeamVisibility: vi.fn(),
  revertValidatorTeamEvent: vi.fn(),
  getValidatorTeamPermissions: vi.fn(),
  updateValidatorTeamPermissions: vi.fn(),
}));

import { INVITES_COPY, MyTeamInvites } from "@/components/validator-team/MyTeamInvites";

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
  for (const fn of Object.values(api)) {
    fn.mockReset();
  }
});

afterEach(cleanup);

const RAW = "raw server text that must never render";

const FROM_ADA: MyTeamInvite = {
  membership_id: 301,
  page: { page_id: 40, title: "Figment", slug: "figment" },
  role: "representative",
  invited_by: { user_id: 9, handle: "ada", display_name: "Ada Lovelace", avatar_url: null },
  added_by_staff: false,
  invited_at: "2026-11-20T00:00:00Z",
  expires_at: "2026-11-27T00:00:00Z",
};
const FROM_STAFF: MyTeamInvite = {
  membership_id: 302,
  page: { page_id: 41, title: "Chorus One", slug: "chorus-one" },
  role: "administrator",
  invited_by: null,
  added_by_staff: true,
  invited_at: "2026-11-21T00:00:00Z",
  expires_at: "2026-11-28T00:00:00Z",
};

function apiError(code: string, status: number, data?: Record<string, unknown>) {
  return new BccApiError(code, RAW, status, {
    error: { code, message: RAW, status, ...(data !== undefined ? { data } : {}) },
    _meta: { version: "v1" },
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MyTeamInvites />
    </QueryClientProvider>,
  );
}

const rowFor = async (title: string) =>
  (await screen.findByRole("link", { name: title })).closest("li") as HTMLElement;

describe("My team invites", () => {
  it("each invite shows the page link, role, who invited and the expiry", async () => {
    api.list.mockResolvedValue({ items: [FROM_ADA, FROM_STAFF] });
    renderPage();

    const ada = await rowFor("Figment");
    expect(within(ada).getByRole("link", { name: "Figment" })).toHaveAttribute("href", "/v/figment");
    expect(ada.textContent).toContain("REPRESENTATIVE · EXPIRES");
    expect(ada.querySelector("time")).toHaveAttribute("datetime", FROM_ADA.expires_at);
    expect(within(ada).getByText("Ada Lovelace")).toBeInTheDocument();

    const staff = await rowFor("Chorus One");
    expect(staff.textContent).toContain("ADMINISTRATOR · EXPIRES");
    expect(within(staff).getByText(INVITES_COPY.invitedByStaff)).toBeInTheDocument();
  });

  it("Accept POSTs, then offers (and focuses) Go to the team", async () => {
    api.list.mockResolvedValueOnce({ items: [FROM_ADA] });
    api.list.mockResolvedValue({ items: [] });
    api.accept.mockResolvedValue({ membership: {} });
    renderPage();
    const row = await rowFor("Figment");
    fireEvent.click(within(row).getByRole("button", { name: "Accept the invite to Figment" }));

    await waitFor(() => expect(api.accept).toHaveBeenCalledWith(301));
    const go = await screen.findByRole("link", { name: /GO TO THE TEAM/ });
    expect(go).toHaveAttribute("href", "/me/validator-pages/40/team");
    await waitFor(() => expect(go).toHaveFocus());
    expect(screen.getByText("You're on the team for Figment.")).toBeInTheDocument();
    // The list was re-read and the invite is gone; the outcome stays.
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: /Accept/ })).toBeNull();
    expect(screen.getByRole("link", { name: /GO TO THE TEAM/ })).toBeInTheDocument();
  });

  it("Decline POSTs and says so", async () => {
    api.list.mockResolvedValue({ items: [FROM_ADA, FROM_STAFF] });
    api.decline.mockResolvedValue({ declined: true });
    renderPage();
    const row = await rowFor("Figment");
    fireEvent.click(within(row).getByRole("button", { name: "Decline the invite to Figment" }));
    await waitFor(() => expect(api.decline).toHaveBeenCalledWith(301));
    expect(await screen.findByText(INVITES_COPY.declined)).toBeInTheDocument();
    expect(api.accept).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Accept the invite to Chorus One" })).toHaveFocus();
  });

  it("an expired invite says so (and the list is re-read)", async () => {
    api.list.mockResolvedValue({ items: [FROM_ADA] });
    api.accept.mockRejectedValue(apiError("bcc_conflict", 409, { reason: "invite_expired" }));
    renderPage();
    const row = await rowFor("Figment");
    fireEvent.click(within(row).getByRole("button", { name: "Accept the invite to Figment" }));
    const line = await screen.findByText("Figment: This invite has expired.");
    expect(line).toHaveAttribute("role", "alert");
    expect(screen.queryByText(RAW)).toBeNull();
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  });

  it("a repeat press while the answer is out is ignored", async () => {
    api.list.mockResolvedValue({ items: [FROM_ADA] });
    api.accept.mockReturnValue(new Promise(() => {}));
    renderPage();
    const row = await rowFor("Figment");
    const accept = within(row).getByRole("button", { name: "Accept the invite to Figment" });
    fireEvent.click(accept);
    fireEvent.click(accept);
    fireEvent.click(within(row).getByRole("button", { name: "Decline the invite to Figment" }));
    await waitFor(() => expect(accept).toHaveAttribute("aria-busy", "true"));
    expect(api.accept).toHaveBeenCalledTimes(1);
    expect(api.decline).not.toHaveBeenCalled();
  });

  it("no invites: the empty sheet", async () => {
    api.list.mockResolvedValue({ items: [] });
    renderPage();
    expect(await screen.findByText(INVITES_COPY.emptyHeading)).toBeInTheDocument();
  });

  it("a 503 offers a real Retry", async () => {
    api.list.mockRejectedValue(apiError("bcc_unavailable", 503));
    renderPage();
    const retry = await screen.findByRole("button", { name: /retry/i }, { timeout: 4000 });
    api.list.mockResolvedValue({ items: [FROM_ADA] });
    fireEvent.click(retry);
    expect(await rowFor("Figment")).toBeInTheDocument();
  });

  it("a rest_no_route says it isn't on the server yet, with no Retry", async () => {
    api.list.mockRejectedValue(apiError("rest_no_route", 404));
    renderPage();
    expect(await screen.findByText("This isn't available on the server yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });
});
