/**
 * The owner's team permissions page (validator admin V1, PR B2).
 *
 * Real components, hooks and QueryClient; only the endpoint module,
 * next/navigation and lib/env are stand-ins. Pinned:
 *   - rows in the server's `powers` order, with label and description;
 *     locked rows disabled with their reason and a lock;
 *   - Reset to defaults fills the grid locally and saves nothing;
 *   - Save PUTs the FULL grid (every power, both roles) with the
 *     password, and never a locked key;
 *   - 422 `data.field` points at its row; 403 credential_invalid stays in
 *     the dialog; success says so and re-reads;
 *   - a 503 on GET is an error with Retry, NEVER the defaults;
 *   - "Last changed … by @x".
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
import type { ValidatorTeamPermissions } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/me/validator-pages/40/team/permissions",
  useSearchParams: () => new URLSearchParams(),
}));

const api = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  getTeam: vi.fn(),
}));
vi.mock("@/lib/api/validator-team-endpoints", () => ({
  getValidatorTeamPermissions: (...a: unknown[]) => api.get(...a),
  updateValidatorTeamPermissions: (...a: unknown[]) => api.put(...a),
  getValidatorTeam: (...a: unknown[]) => api.getTeam(...a),
  inviteValidatorTeamMember: vi.fn(),
  removeValidatorTeamMember: vi.fn(),
  reconfirmValidatorTeamMember: vi.fn(),
  leaveValidatorTeam: vi.fn(),
  setValidatorTeamVisibility: vi.fn(),
  revertValidatorTeamEvent: vi.fn(),
  getMyTeamInvites: vi.fn(),
  acceptTeamInvite: vi.fn(),
  declineTeamInvite: vi.fn(),
}));

import { PERMISSIONS_COPY, TeamPermissions } from "@/components/validator-team/TeamPermissions";
import { TEAM_ERROR_COPY } from "@/components/validator-team/team-copy";

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
const PAGE_ID = 40;
const PASSWORD = "owner-password-123";

/** Deliberately NOT alphabetical: the server's order is the order. */
const POWERS = [
  { key: "reply_reviews", label: "Reply to reviews", description: "Answer reviews as the validator." },
  { key: "publish_announcements", label: "Publish announcements", description: "Post announcements to delegators." },
  { key: "edit_profile", label: "Edit the profile", description: "Change the page's profile." },
  { key: "links_unrestricted", label: "Post any link", description: "Links skip the interstitial." },
];

const LOCKED = [
  { key: "manage_administrators", label: "Manage administrators", reason: "Only the owner adds or removes administrators." },
  { key: "transfer_ownership", label: "Transfer ownership", reason: "Ownership never moves through the team." },
];

function perms(over: Partial<ValidatorTeamPermissions> = {}): ValidatorTeamPermissions {
  return {
    powers: POWERS,
    roles: {
      administrator: {
        reply_reviews: true,
        publish_announcements: true,
        edit_profile: false,
        links_unrestricted: false,
        // A locked key the server echoed back: it must never be sent.
        manage_administrators: false,
      },
      representative: { reply_reviews: false, publish_announcements: true },
    },
    defaults: {
      administrator: { reply_reviews: true, publish_announcements: true, edit_profile: true, links_unrestricted: false },
      representative: { reply_reviews: true, publish_announcements: true, edit_profile: false, links_unrestricted: false },
    },
    locked: LOCKED,
    updated_at: "2026-11-22T09:30:00Z",
    updated_by: { user_id: 1, handle: "olu", display_name: "Olu Owner", avatar_url: null },
    ...over,
  };
}

function apiError(code: string, status: number, data?: Record<string, unknown>) {
  return new BccApiError(code, RAW, status, {
    error: { code, message: RAW, status, ...(data !== undefined ? { data } : {}) },
    _meta: { version: "v1" },
  });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <TeamPermissions pageId={PAGE_ID} />
    </QueryClientProvider>,
  );
  return { ...view, qc };
}

const box = (power: string, role: "Administrator" | "Representative") =>
  screen.getByRole("checkbox", { name: `${power} ${role}` });

const grid = async () => screen.findByRole("region", { name: "Team permissions" });

async function save(password = PASSWORD) {
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  const dialog = await screen.findByRole("dialog", { name: "Save team permissions" });
  fireEvent.change(within(dialog).getByLabelText("CURRENT PASSWORD"), { target: { value: password } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  return dialog;
}

// ─────────────────────────────────────────────────────────────────────

describe("Permissions — the validator's name from the server", () => {
  it("shows the page title when the GET sends one", async () => {
    api.get.mockResolvedValue(perms({ page: { page_id: PAGE_ID, title: "Atlas Validator", slug: "atlas" } }));
    renderPage();
    expect(await screen.findByText("Atlas Validator")).toBeInTheDocument();
  });
});

describe("Permissions — render", () => {
  it("rows follow the server's order, with label, description and the current grants", async () => {
    api.get.mockResolvedValue(perms());
    renderPage();
    await grid();
    expect(api.get).toHaveBeenCalledWith(PAGE_ID, expect.anything());

    const groupNames = screen
      .getAllByRole("group")
      .map((g) => document.getElementById(g.getAttribute("aria-labelledby") ?? "")?.textContent);
    expect(groupNames).toEqual(POWERS.map((p) => p.label));
    expect(screen.getByText("Answer reviews as the validator.")).toBeInTheDocument();

    expect(box("Reply to reviews", "Administrator")).toBeChecked();
    expect(box("Reply to reviews", "Representative")).not.toBeChecked();
    expect(box("Publish announcements", "Representative")).toBeChecked();
    expect(box("Edit the profile", "Administrator")).not.toBeChecked();
  });

  it("locked rows come last: disabled, with the server's reason and a lock", async () => {
    api.get.mockResolvedValue(perms());
    const { container } = renderPage();
    await grid();
    for (const power of LOCKED) {
      const row = container.querySelector(`[data-locked-key="${power.key}"]`) as HTMLElement;
      expect(row).not.toBeNull();
      expect(within(row).getByText(power.label)).toBeInTheDocument();
      expect(within(row).getByText(power.reason)).toBeInTheDocument();
      expect(row.querySelector("svg")).not.toBeNull();
      const boxes = within(row).getAllByRole("checkbox");
      expect(boxes).toHaveLength(2);
      for (const b of boxes) {
        expect(b).toBeDisabled();
        expect(b).not.toBeChecked();
      }
    }
    // After every power row.
    const lastPower = box("Post any link", "Representative");
    const firstLocked = container.querySelector('[data-locked-key="manage_administrators"]') as HTMLElement;
    expect(lastPower.compareDocumentPosition(firstLocked) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows when and by whom it last changed", async () => {
    api.get.mockResolvedValue(perms());
    renderPage();
    const section = await grid();
    expect(within(section).getByText("LAST CHANGED")).toBeInTheDocument();
    expect(section.querySelector("time")).toHaveAttribute("datetime", "2026-11-22T09:30:00Z");
    expect(within(section).getByText("@olu")).toBeInTheDocument();
  });

  it("never changed: says so", async () => {
    api.get.mockResolvedValue(perms({ updated_at: null, updated_by: null }));
    renderPage();
    const section = await grid();
    expect(within(section).getByText(PERMISSIONS_COPY.neverChanged.toUpperCase())).toBeInTheDocument();
  });
});

describe("Permissions — edit, reset and save", () => {
  it("Reset to defaults fills the grid from `defaults` and saves nothing", async () => {
    api.get.mockResolvedValue(perms());
    renderPage();
    await grid();
    expect(box("Edit the profile", "Administrator")).not.toBeChecked();
    expect(box("Reply to reviews", "Representative")).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(box("Edit the profile", "Administrator")).toBeChecked();
    expect(box("Reply to reviews", "Representative")).toBeChecked();
    expect(screen.getByText(PERMISSIONS_COPY.reset)).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });

  it("Save PUTs the full grid with the password, and never a locked key", async () => {
    api.get.mockResolvedValue(perms());
    api.put.mockResolvedValue(perms({ updated_at: "2026-11-24T10:00:00Z" }));
    renderPage();
    await grid();
    fireEvent.click(box("Edit the profile", "Representative"));
    expect(box("Edit the profile", "Representative")).toBeChecked();
    await save();

    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const [pageId, body] = api.put.mock.calls[0] as [number, { roles: Record<string, Record<string, boolean>>; current_password: string }];
    expect(pageId).toBe(PAGE_ID);
    expect(body).toEqual({
      roles: {
        administrator: {
          reply_reviews: true,
          publish_announcements: true,
          edit_profile: false,
          links_unrestricted: false,
        },
        representative: {
          reply_reviews: false,
          publish_announcements: true,
          edit_profile: true,
          links_unrestricted: false,
        },
      },
      current_password: PASSWORD,
    });
    const sent = JSON.stringify(body);
    for (const power of LOCKED) expect(sent).not.toContain(power.key);
  });

  it("success closes the dialog, says so, and re-reads the settings and the team", async () => {
    api.get.mockResolvedValue(perms());
    api.put.mockResolvedValue(perms());
    renderPage();
    await grid();
    await save();
    expect(await screen.findByText(PERMISSIONS_COPY.saved)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  });

  it("a Reset then Save sends the defaults (still never a locked key)", async () => {
    api.get.mockResolvedValue(perms());
    api.put.mockResolvedValue(perms());
    renderPage();
    await grid();
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    await save();
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const body = api.put.mock.calls[0]?.[1] as { roles: unknown };
    expect(body.roles).toEqual(perms().defaults);
  });

  it("a 422 naming a power points at that row and closes the dialog", async () => {
    api.get.mockResolvedValue(perms());
    api.put.mockRejectedValue(apiError("bcc_invalid_request", 422, { field: "roles.representative.edit_profile" }));
    renderPage();
    await grid();
    await save();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const line = await screen.findByText(PERMISSIONS_COPY.rowRejected);
    const row = line.closest("[role='group']") as HTMLElement;
    expect(within(row).getByText("Edit the profile")).toBeInTheDocument();
    expect(box("Edit the profile", "Administrator")).toHaveAttribute("aria-invalid", "true");
    expect(box("Reply to reviews", "Administrator")).not.toHaveAttribute("aria-invalid");
    await waitFor(() => expect(box("Edit the profile", "Administrator")).toHaveFocus());
    expect(screen.queryByText(RAW)).toBeNull();
  });

  it("403 credential_invalid stays in the dialog, says so, empties the field, keeps no password in the cache", async () => {
    api.get.mockResolvedValue(perms());
    api.put.mockRejectedValue(apiError("bcc_forbidden", 403, { reason: "credential_invalid" }));
    const { qc } = renderPage();
    await grid();
    const dialog = await save();

    expect(await within(dialog).findByText(TEAM_ERROR_COPY.credentialInvalid)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("CURRENT PASSWORD")).toHaveValue("");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        qc.getMutationCache().getAll().some((m) => JSON.stringify(m.state.variables ?? null).includes(PASSWORD)),
      ).toBe(false),
    );
  });
});

describe("Permissions — failed reads never show the defaults", () => {
  it("a 503 on GET shows an error with Retry and no grid at all", async () => {
    api.get.mockRejectedValue(apiError("bcc_unavailable", 503));
    renderPage();
    const retry = await screen.findByRole("button", { name: /retry/i }, { timeout: 4000 });
    expect(screen.getByText(`${PERMISSIONS_COPY.unavailable} Try again shortly.`)).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Reset to defaults" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    api.get.mockResolvedValue(perms());
    fireEvent.click(retry);
    expect(await grid()).toBeInTheDocument();
  });

  it("a 403 says only the owner can change team permissions, with no Retry", async () => {
    api.get.mockRejectedValue(apiError("bcc_forbidden", 403));
    renderPage();
    expect(await screen.findByText(PERMISSIONS_COPY.forbidden)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("a rest_no_route says it isn't on the server yet", async () => {
    api.get.mockRejectedValue(apiError("rest_no_route", 404));
    renderPage();
    expect(await screen.findByText(TEAM_ERROR_COPY.notOnServer)).toBeInTheDocument();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
