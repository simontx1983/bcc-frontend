/**
 * The validator team screen (validator admin V1, PR B2).
 *
 * Real components, real hooks, real QueryClient; only the endpoint
 * modules, next/navigation and lib/env are stand-ins. Pinned:
 *   - every action renders ONLY from route 5's `can`, for an owner, an
 *     administrator and a representative viewer;
 *   - the invite password field appears (and is sent) only when
 *     `requires_password_to_invite[role]` is true;
 *   - removing an administrator sends current_password, a representative
 *     never does; focus moves to the next row after a removal;
 *   - each 409 reason's copy, the one generic invite_not_possible line,
 *     the 429 wait, and the read failures;
 *   - leave asks first; the visibility switch shows the server's value;
 *   - needs_reconfirm's badge and Re-confirm;
 *   - the revert list is the owner's; Undo POSTs; revert_stale and
 *     not_revertable copy; `?revert=` never POSTs on load;
 *   - no password survives in the mutation cache after a failure;
 *   - (security) no evidence, history or wallet data renders, and no
 *     history endpoint is called.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
import type {
  AdminUserRef,
  ValidatorTeamCan,
  ValidatorTeamMembership,
  ValidatorTeamResponse,
  ValidatorTeamRevertable,
} from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/me/validator-pages/40/team",
  useSearchParams: () => new URLSearchParams(),
}));

const api = vi.hoisted(() => ({
  getTeam: vi.fn(),
  invite: vi.fn(),
  remove: vi.fn(),
  reconfirm: vi.fn(),
  leave: vi.fn(),
  visibility: vi.fn(),
  revert: vi.fn(),
  searchMentions: vi.fn(),
}));
vi.mock("@/lib/api/validator-team-endpoints", () => ({
  getValidatorTeam: (...a: unknown[]) => api.getTeam(...a),
  inviteValidatorTeamMember: (...a: unknown[]) => api.invite(...a),
  removeValidatorTeamMember: (...a: unknown[]) => api.remove(...a),
  reconfirmValidatorTeamMember: (...a: unknown[]) => api.reconfirm(...a),
  leaveValidatorTeam: (...a: unknown[]) => api.leave(...a),
  setValidatorTeamVisibility: (...a: unknown[]) => api.visibility(...a),
  revertValidatorTeamEvent: (...a: unknown[]) => api.revert(...a),
  getValidatorTeamPermissions: vi.fn(),
  updateValidatorTeamPermissions: vi.fn(),
  getMyTeamInvites: vi.fn(),
  acceptTeamInvite: vi.fn(),
  declineTeamInvite: vi.fn(),
}));
vi.mock("@/lib/api/mentions-endpoints", () => ({
  searchMentions: (...a: unknown[]) => api.searchMentions(...a),
}));

// Staff-only reads. The team screen must never reach any of them.
const staffOnly = vi.hoisted(() => ({
  pageHistory: vi.fn(),
  globalHistory: vi.fn(),
  relationships: vi.fn(),
}));
vi.mock("@/lib/api/admin-validator-endpoints", () => ({
  getAdminValidatorPageHistory: (...a: unknown[]) => staffOnly.pageHistory(...a),
  getValidatorRelationshipHistory: (...a: unknown[]) => staffOnly.globalHistory(...a),
  getAdminValidatorPageRelationships: (...a: unknown[]) => staffOnly.relationships(...a),
  getAdminValidatorDirectory: vi.fn(),
  getValidatorRelationshipHealth: vi.fn(),
  searchAdminUsers: vi.fn(),
  startValidatorStepUp: vi.fn(),
  resendValidatorStepUp: vi.fn(),
  linkValidatorOwner: vi.fn(),
  revokeValidatorOwner: vi.fn(),
  cancelValidatorOwnerLink: vi.fn(),
}));

import { MEMBER_COPY } from "@/components/validator-team/TeamMembers";
import { REVERT_COPY } from "@/components/validator-team/TeamRevert";
import { TEAM_CONFLICT_COPY, TEAM_ERROR_COPY } from "@/components/validator-team/team-copy";
import { TEAM_SCREEN_COPY, ValidatorTeamScreen } from "@/components/validator-team/ValidatorTeamScreen";

const fetchSpy = vi.fn();

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
  for (const fn of [...Object.values(api), ...Object.values(staffOnly), fetchSpy]) {
    fn.mockReset();
  }
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const RAW = "raw server text that must never render";
const PAGE_ID = 40;
const PASSWORD = "correct-horse-battery";

const ADA: AdminUserRef = { user_id: 9, handle: "ada", display_name: "Ada Lovelace", avatar_url: null };
const LIN: AdminUserRef = { user_id: 12, handle: "lin", display_name: "Lin Shu", avatar_url: null };
const GRACE: AdminUserRef = { user_id: 3, handle: "grace", display_name: "Grace Hopper", avatar_url: null };
const KAI: AdminUserRef = { user_id: 21, handle: "kai", display_name: "Kai Moss", avatar_url: null };
const OWNER: AdminUserRef = { user_id: 1, handle: "olu", display_name: "Olu Owner", avatar_url: null };

const NONE: ValidatorTeamCan = {
  invite_administrator: false,
  invite_representative: false,
  remove: { administrator: false, representative: false },
  leave: false,
  set_visibility: false,
};
const OWNER_CAN: ValidatorTeamCan = {
  invite_administrator: true,
  invite_representative: true,
  remove: { administrator: true, representative: true },
  leave: false,
  set_visibility: false,
};
const ADMIN_CAN: ValidatorTeamCan = {
  invite_administrator: false,
  invite_representative: true,
  remove: { administrator: false, representative: true },
  leave: true,
  set_visibility: true,
};
const REP_CAN: ValidatorTeamCan = { ...NONE, leave: true, set_visibility: true };

function member(id: number, user: AdminUserRef, over: Partial<ValidatorTeamMembership> = {}): ValidatorTeamMembership {
  return {
    membership_id: id,
    user,
    role: "representative",
    status: "active",
    added_by: OWNER,
    added_by_staff: false,
    invited_at: "2026-11-10T00:00:00Z",
    expires_at: null,
    accepted_at: "2026-11-11T00:00:00Z",
    show_publicly: false,
    needs_reconfirm: false,
    ...over,
  };
}

const ADA_ADMIN = member(101, ADA, { role: "administrator" });
const LIN_REP = member(102, LIN);
const GRACE_INVITE = member(103, GRACE, {
  role: "administrator",
  status: "pending",
  accepted_at: null,
  expires_at: "2026-12-01T00:00:00Z",
});
const KAI_REP = member(104, KAI, { added_by: null, added_by_staff: true });

const CHANGE: ValidatorTeamRevertable = {
  event_id: 91,
  kind: "team_member_added",
  actor: ADA,
  at: "2026-11-20T10:00:00Z",
  summary: "Ada Lovelace added Kai Moss as a representative.",
};
const CHANGE_2: ValidatorTeamRevertable = {
  event_id: 92,
  kind: "profile_edited",
  actor: ADA,
  at: "2026-11-21T10:00:00Z",
  summary: "Ada Lovelace edited the profile.",
};

function team(over: Partial<ValidatorTeamResponse> = {}): ValidatorTeamResponse {
  return {
    viewer: { role: "owner", membership_id: null, show_publicly: null },
    can: OWNER_CAN,
    requires_password_to_invite: { administrator: true, representative: false },
    items: [ADA_ADMIN, LIN_REP, GRACE_INVITE, KAI_REP],
    revertable: [],
    ...over,
  };
}

const asAdmin = (over: Partial<ValidatorTeamResponse> = {}) =>
  team({
    viewer: { role: "administrator", membership_id: 101, show_publicly: false },
    can: ADMIN_CAN,
    ...over,
  });

const asRep = (over: Partial<ValidatorTeamResponse> = {}) =>
  team({
    viewer: { role: "representative", membership_id: 102, show_publicly: false },
    can: REP_CAN,
    requires_password_to_invite: { administrator: true, representative: true },
    items: [ADA_ADMIN, LIN_REP, KAI_REP],
    ...over,
  });

function apiError(code: string, status: number, data?: Record<string, unknown>) {
  return new BccApiError(code, RAW, status, {
    error: { code, message: RAW, status, ...(data !== undefined ? { data } : {}) },
    _meta: { version: "v1" },
  });
}

function renderScreen(revertEventId: number | null = null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <ValidatorTeamScreen pageId={PAGE_ID} revertEventId={revertEventId} />
    </QueryClientProvider>,
  );
  return { ...view, qc };
}

const members = async () => screen.findByRole("region", { name: MEMBER_COPY.heading });
const inviteForm = () => screen.queryByRole("region", { name: "Invite someone" });
const selfSection = () => screen.queryByRole("region", { name: "YOUR MEMBERSHIP" });
const revertList = () => screen.queryByRole("region", { name: REVERT_COPY.heading });

/** Press a trigger the way a keyboard user would: focus, then activate. */
function press(button: HTMLElement) {
  button.focus();
  fireEvent.click(button);
}

const cacheHolds = (qc: QueryClient, secret: string) =>
  qc.getMutationCache().getAll().some((m) => JSON.stringify(m.state.variables ?? null).includes(secret));

async function pickInvitee(user: AdminUserRef = KAI) {
  api.searchMentions.mockResolvedValue({ items: [{ ...user, avatar_url: "" }] });
  fireEvent.change(screen.getByLabelText("MEMBER"), { target: { value: user.handle } });
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(`@${user.handle}`) }));
}

// ─────────────────────────────────────────────────────────────────────

describe("Members — rendered as sent", () => {
  it("shows name, @handle, role, status with expiry, and who added them", async () => {
    api.getTeam.mockResolvedValue(team());
    renderScreen();
    const list = await members();
    expect(api.getTeam).toHaveBeenCalledWith(PAGE_ID, expect.anything());

    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    expect(within(rows[0] as HTMLElement).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("@ada")).toBeInTheDocument();
    expect(rows[0]?.textContent).toContain("ADMINISTRATOR · ACTIVE");
    expect(rows[0]?.textContent).toContain("Added by @olu");
    expect(rows[2]?.textContent).toMatch(/ADMINISTRATOR · PENDING · EXPIRES/);
    expect(within(rows[2] as HTMLElement).getByText(/2026/).closest("time")).toHaveAttribute(
      "datetime",
      "2026-12-01T00:00:00Z",
    );
    // Staff adds never name the staff member.
    expect(rows[3]?.textContent).toContain(MEMBER_COPY.addedByStaff);
  });

  it("a representative's list is exactly what the server sent (nothing filtered or added)", async () => {
    api.getTeam.mockResolvedValue(asRep({ items: [LIN_REP] }));
    renderScreen();
    const list = await members();
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("Lin Shu")).toBeInTheDocument();
  });
});

describe("Actions render ONLY from can", () => {
  it("owner: remove / cancel on every row, both invite roles, the permissions link and the undo list; no leave or visibility", async () => {
    api.getTeam.mockResolvedValue(team());
    renderScreen();
    const list = await members();
    expect(within(list).getByRole("button", { name: "Remove Ada Lovelace" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Remove Lin Shu" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Cancel the invite to Grace Hopper" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Remove Kai Moss" })).toBeInTheDocument();

    const roles = within(inviteForm() as HTMLElement).getByLabelText("ROLE");
    expect(within(roles).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Choose…",
      "Administrator",
      "Representative",
    ]);
    expect(screen.getByRole("link", { name: /TEAM PERMISSIONS/ })).toHaveAttribute(
      "href",
      "/me/validator-pages/40/team/permissions",
    );
    expect(revertList()).not.toBeNull();
    expect(selfSection()).toBeNull();
    expect(screen.queryByRole("button", { name: "Leave this team" })).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("administrator: removes representatives only, invites representatives only, leave + visibility; no permissions link, no undo list", async () => {
    api.getTeam.mockResolvedValue(asAdmin({ revertable: [CHANGE] }));
    renderScreen();
    const list = await members();
    expect(within(list).queryByRole("button", { name: "Remove Ada Lovelace" })).toBeNull();
    expect(within(list).queryByRole("button", { name: "Cancel the invite to Grace Hopper" })).toBeNull();
    expect(within(list).getByRole("button", { name: "Remove Lin Shu" })).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Remove Kai Moss" })).toBeInTheDocument();

    const roles = within(inviteForm() as HTMLElement).getByLabelText("ROLE");
    expect(within(roles).getAllByRole("option").map((o) => o.textContent)).toEqual(["Representative"]);
    expect(roles).toHaveValue("representative");

    expect(screen.getByRole("button", { name: "Leave this team" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Show me publicly on this team" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /TEAM PERMISSIONS/ })).toBeNull();
    // Even if a server sent revertable rows to a non-owner, no undo list.
    expect(revertList()).toBeNull();
    expect(screen.queryByText(CHANGE.summary)).toBeNull();
  });

  it("representative: no remove, no invite form; leave + visibility only", async () => {
    api.getTeam.mockResolvedValue(asRep());
    renderScreen();
    const list = await members();
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    expect(inviteForm()).toBeNull();
    expect(screen.getByRole("button", { name: "Leave this team" })).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /TEAM PERMISSIONS/ })).toBeNull();
    expect(revertList()).toBeNull();
  });

  it("every key false (e.g. unreadable settings): no action anywhere", async () => {
    api.getTeam.mockResolvedValue(asAdmin({ can: NONE }));
    renderScreen();
    const list = await members();
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    expect(inviteForm()).toBeNull();
    expect(selfSection()).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("a can value that isn't exactly true is no permission", async () => {
    const loose = { ...OWNER_CAN, remove: { administrator: "true", representative: 1 } } as unknown as ValidatorTeamCan;
    api.getTeam.mockResolvedValue(team({ can: { ...loose, invite_administrator: false, invite_representative: false } }));
    renderScreen();
    const list = await members();
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    expect(inviteForm()).toBeNull();
  });
});

describe("Invite", () => {
  it("the password field appears only for a role whose requires_password_to_invite is true", async () => {
    api.getTeam.mockResolvedValue(team());
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    expect(within(form).queryByLabelText("CURRENT PASSWORD")).toBeNull();

    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "administrator" } });
    const pw = within(form).getByLabelText("CURRENT PASSWORD");
    expect(pw).toHaveAttribute("type", "password");
    expect(pw).toHaveAttribute("autocomplete", "current-password");

    fireEvent.change(pw, { target: { value: PASSWORD } });
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "representative" } });
    expect(within(form).queryByLabelText("CURRENT PASSWORD")).toBeNull();
    // Back to administrator: the password typed earlier is gone.
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "administrator" } });
    expect(within(form).getByLabelText("CURRENT PASSWORD")).toHaveValue("");
  });

  it("a representative invite that needs no password sends none", async () => {
    api.getTeam.mockResolvedValue(team());
    api.invite.mockResolvedValue({ membership: member(200, KAI, { status: "pending", expires_at: "2026-12-02T00:00:00Z" }) });
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    await pickInvitee();
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "representative" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(api.invite).toHaveBeenCalledTimes(1));
    const body = api.invite.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).toEqual({ user_id: KAI.user_id, role: "representative" });
    expect("current_password" in body).toBe(false);
    expect(await within(form).findByText(/Invite sent to @kai\. It expires/)).toBeInTheDocument();
    await waitFor(() => expect(api.getTeam).toHaveBeenCalledTimes(2));
  });

  it("an administrator invite sends the viewer's password", async () => {
    api.getTeam.mockResolvedValue(team());
    api.invite.mockResolvedValue({ membership: member(200, KAI, { role: "administrator", status: "pending" }) });
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    await pickInvitee();
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "administrator" } });
    fireEvent.change(within(form).getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));

    await waitFor(() =>
      expect(api.invite).toHaveBeenCalledWith(PAGE_ID, {
        user_id: KAI.user_id,
        role: "administrator",
        current_password: PASSWORD,
      }),
    );
  });

  it("when the server asks for a password on a representative invite, the field shows and it's sent", async () => {
    api.getTeam.mockResolvedValue(asAdmin({ requires_password_to_invite: { administrator: true, representative: true } }));
    api.invite.mockResolvedValue({ membership: member(200, KAI, { status: "pending" }) });
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    await pickInvitee();
    fireEvent.change(within(form).getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));
    await waitFor(() =>
      expect(api.invite).toHaveBeenCalledWith(PAGE_ID, {
        user_id: KAI.user_id,
        role: "representative",
        current_password: PASSWORD,
      }),
    );
  });

  it("no requires_password_to_invite: no field; a 422 on current_password then shows it for that role", async () => {
    const bare = team();
    delete bare.requires_password_to_invite;
    api.getTeam.mockResolvedValue(bare);
    api.invite.mockRejectedValueOnce(apiError("bcc_invalid_request", 422, { field: "current_password" }));
    api.invite.mockResolvedValue({ membership: member(200, KAI, { role: "administrator", status: "pending" }) });
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    await pickInvitee();
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "administrator" } });
    expect(within(form).queryByLabelText("CURRENT PASSWORD")).toBeNull();
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));
    await waitFor(() => expect(api.invite).toHaveBeenCalledWith(PAGE_ID, { user_id: KAI.user_id, role: "administrator" }));

    const pw = await within(form).findByLabelText("CURRENT PASSWORD");
    expect(within(form).getByText(TEAM_ERROR_COPY.passwordRequired)).toBeInTheDocument();
    await waitFor(() => expect(pw).toHaveFocus());
    fireEvent.change(pw, { target: { value: PASSWORD } });
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));
    await waitFor(() =>
      expect(api.invite).toHaveBeenLastCalledWith(PAGE_ID, {
        user_id: KAI.user_id,
        role: "administrator",
        current_password: PASSWORD,
      }),
    );
  });

  it("names the missing fields and sends nothing", async () => {
    api.getTeam.mockResolvedValue(team());
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));
    expect(within(form).getByText("Pick someone to invite.")).toBeInTheDocument();
    expect(within(form).getByText("Pick a role.")).toBeInTheDocument();
    expect(within(form).getByLabelText("MEMBER")).toHaveFocus();
    expect(api.invite).not.toHaveBeenCalled();
  });

  it("a wrong password (403 credential_invalid) says so on the field, empties it, and leaves no password in the cache", async () => {
    api.getTeam.mockResolvedValue(team());
    api.invite.mockRejectedValue(apiError("bcc_forbidden", 403, { reason: "credential_invalid" }));
    const { qc } = renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    await pickInvitee();
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "administrator" } });
    fireEvent.change(within(form).getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));

    expect(await within(form).findByText(TEAM_ERROR_COPY.credentialInvalid)).toBeInTheDocument();
    const pw = within(form).getByLabelText("CURRENT PASSWORD");
    expect(pw).toHaveValue("");
    expect(pw).toHaveFocus();
    expect(screen.queryByText(RAW)).toBeNull();
    await waitFor(() => expect(cacheHolds(qc, PASSWORD)).toBe(false));
  });

  it.each([
    ["invite_not_possible", TEAM_CONFLICT_COPY["invite_not_possible"]],
    ["already_member", "They're already on this team."],
    ["invite_pending", "They already have a pending invite."],
    ["role_not_allowed", "You can't do that for this role."],
    ["is_owner", "That's the page owner."],
  ])("409 %s shows its copy", async (reason, copy) => {
    api.getTeam.mockResolvedValue(team());
    api.invite.mockRejectedValue(apiError("bcc_conflict", 409, { reason }));
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    await pickInvitee();
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "representative" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));

    const line = await within(form).findByText(copy as string);
    expect(line).toHaveAttribute("role", "alert");
    expect(screen.queryByText(RAW)).toBeNull();
    // A 409 means the team changed: it's re-read.
    await waitFor(() => expect(api.getTeam).toHaveBeenCalledTimes(2));
  });

  it.each([
    [{ reason: "invite_not_possible", detail: "blocked" }],
    [{ reason: "invite_not_possible", detail: "suspended" }],
    [{ reason: "invite_not_possible", detail: "no_account", account: "missing" }],
  ])("invite_not_possible is ONE generic line, whatever else the server sends (%o)", async (data) => {
    api.getTeam.mockResolvedValue(team());
    api.invite.mockRejectedValue(apiError("bcc_conflict", 409, data));
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    await pickInvitee();
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "representative" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));

    const line = await within(form).findByRole("alert");
    expect(line.textContent).toBe("This person can't be invited right now.");
    expect(document.body.textContent).not.toMatch(/blocked|suspended|no_account|missing/i);
  });

  it.each([
    [300, "Too many invites for this page right now. Try again in 5 minutes."],
    [45, "Too many invites for this page right now. Try again in 45 seconds."],
  ])("429 with retry_after %i says how long", async (retryAfter, copy) => {
    api.getTeam.mockResolvedValue(team());
    api.invite.mockRejectedValue(apiError("bcc_rate_limited", 429, { retry_after: retryAfter }));
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    await pickInvitee();
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "representative" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));
    expect(await within(form).findByText(copy)).toBeInTheDocument();
  });

  it.each([
    ["503", apiError("bcc_unavailable", 503), TEAM_ERROR_COPY.unavailable],
    ["403 bcc_forbidden", apiError("bcc_forbidden", 403), TEAM_ERROR_COPY.forbidden],
    ["404 bcc_not_found", apiError("bcc_not_found", 404), TEAM_ERROR_COPY.notFound],
    ["404 rest_no_route", apiError("rest_no_route", 404), TEAM_ERROR_COPY.notOnServer],
  ])("a %s on the invite shows its line", async (_label, err, copy) => {
    api.getTeam.mockResolvedValue(team());
    api.invite.mockRejectedValue(err);
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    await pickInvitee();
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "representative" } });
    fireEvent.click(within(form).getByRole("button", { name: "Send invite" }));
    expect(await within(form).findByText(copy)).toBeInTheDocument();
    expect(screen.queryByText(RAW)).toBeNull();
  });

  it("the submit button is aria-disabled + aria-busy while pending, and a repeat press is ignored", async () => {
    api.getTeam.mockResolvedValue(team());
    api.invite.mockReturnValue(new Promise(() => {}));
    renderScreen();
    await members();
    const form = inviteForm() as HTMLElement;
    await pickInvitee();
    fireEvent.change(within(form).getByLabelText("ROLE"), { target: { value: "representative" } });
    const submit = within(form).getByRole("button", { name: "Send invite" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    const busy = await within(form).findByRole("button", { name: "Sending…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).not.toHaveAttribute("disabled");
    fireEvent.click(busy);
    expect(api.invite).toHaveBeenCalledTimes(1);
  });
});

describe("Remove / cancel invite", () => {
  it("removing an ADMINISTRATOR asks for the password and sends current_password", async () => {
    api.getTeam.mockResolvedValue(team());
    api.remove.mockResolvedValue({ removed: true });
    renderScreen();
    const list = await members();
    press(within(list).getByRole("button", { name: "Remove Ada Lovelace" }));

    const dialog = await screen.findByRole("dialog", { name: "Remove administrator" });
    expect(within(dialog).getByLabelText("CURRENT PASSWORD")).toHaveFocus();
    fireEvent.change(within(dialog).getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(api.remove).toHaveBeenCalledWith(PAGE_ID, ADA_ADMIN.membership_id, { current_password: PASSWORD }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByText("Ada Lovelace is off the team.")).toBeInTheDocument();
  });

  it("cancelling a pending ADMINISTRATOR invite also sends the password", async () => {
    api.getTeam.mockResolvedValue(team());
    api.remove.mockResolvedValue({ removed: true });
    renderScreen();
    const list = await members();
    press(within(list).getByRole("button", { name: "Cancel the invite to Grace Hopper" }));
    const dialog = await screen.findByRole("dialog", { name: "Cancel administrator invite" });
    fireEvent.change(within(dialog).getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel invite" }));
    await waitFor(() =>
      expect(api.remove).toHaveBeenCalledWith(PAGE_ID, GRACE_INVITE.membership_id, { current_password: PASSWORD }),
    );
  });

  it("removing a REPRESENTATIVE takes a plain confirm and sends no password", async () => {
    api.getTeam.mockResolvedValue(team());
    api.remove.mockResolvedValue({ removed: true });
    renderScreen();
    const list = await members();
    press(within(list).getByRole("button", { name: "Remove Lin Shu" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove representative" });
    expect(within(dialog).queryByLabelText("CURRENT PASSWORD")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(api.remove).toHaveBeenCalledTimes(1));
    const [pageId, membershipId, body] = api.remove.mock.calls[0] as [number, number, Record<string, unknown>];
    expect([pageId, membershipId]).toEqual([PAGE_ID, LIN_REP.membership_id]);
    expect(body).toEqual({});
    expect("current_password" in body).toBe(false);
  });

  it("after a removal, focus moves to the next row's action", async () => {
    api.getTeam.mockResolvedValue(team());
    api.remove.mockResolvedValue({ removed: true });
    renderScreen();
    const list = await members();
    press(within(list).getByRole("button", { name: "Remove Lin Shu" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(within(list).getByRole("button", { name: "Cancel the invite to Grace Hopper" })).toHaveFocus(),
    );
  });

  it("after removing the last actionable row, focus moves to the list heading", async () => {
    api.getTeam.mockResolvedValue(team());
    api.remove.mockResolvedValue({ removed: true });
    renderScreen();
    const list = await members();
    press(within(list).getByRole("button", { name: "Remove Kai Moss" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(within(list).getByRole("heading", { name: MEMBER_COPY.heading })).toHaveFocus());
  });

  it("a wrong password stays in the dialog, empties the field, and keeps no password in the cache", async () => {
    api.getTeam.mockResolvedValue(team());
    api.remove.mockRejectedValue(apiError("bcc_forbidden", 403, { reason: "credential_invalid" }));
    const { qc } = renderScreen();
    const list = await members();
    press(within(list).getByRole("button", { name: "Remove Ada Lovelace" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await within(dialog).findByText(TEAM_ERROR_COPY.credentialInvalid)).toBeInTheDocument();
    expect(within(dialog).getByLabelText("CURRENT PASSWORD")).toHaveValue("");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(cacheHolds(qc, PASSWORD)).toBe(false));
  });

  it("409 not_pending closes the dialog, says so, and re-reads the team", async () => {
    api.getTeam.mockResolvedValue(team());
    api.remove.mockRejectedValue(apiError("bcc_conflict", 409, { reason: "not_pending" }));
    renderScreen();
    const list = await members();
    press(within(list).getByRole("button", { name: "Remove Lin Shu" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Remove" }));

    const alert = await screen.findByText("That invite isn't pending any more.");
    expect(alert).toHaveAttribute("role", "alert");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(api.getTeam).toHaveBeenCalledTimes(2));
  });

  it("a 503 keeps the plain confirm open with a retryable line", async () => {
    api.getTeam.mockResolvedValue(team());
    api.remove.mockRejectedValue(apiError("bcc_unavailable", 503));
    renderScreen();
    const list = await members();
    press(within(list).getByRole("button", { name: "Remove Lin Shu" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    expect(await within(dialog).findByText(TEAM_ERROR_COPY.unavailable)).toBeInTheDocument();
  });
});

describe("Re-confirm", () => {
  it("a needs_reconfirm member shows the badge and Re-confirm, which sends the viewer's password", async () => {
    const needs = member(105, KAI, { needs_reconfirm: true });
    api.getTeam.mockResolvedValue(team({ items: [needs] }));
    api.reconfirm.mockResolvedValue({ membership: { ...needs, needs_reconfirm: false } });
    renderScreen();
    const list = await members();
    expect(within(list).getByText(MEMBER_COPY.needsYourReconfirm.toUpperCase())).toBeInTheDocument();

    press(within(list).getByRole("button", { name: "Re-confirm Kai Moss" }));
    const dialog = await screen.findByRole("dialog", { name: "Re-confirm member" });
    fireEvent.change(within(dialog).getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Re-confirm" }));

    await waitFor(() =>
      expect(api.reconfirm).toHaveBeenCalledWith(PAGE_ID, 105, { current_password: PASSWORD }),
    );
    expect(await screen.findByText("Kai Moss is re-confirmed.")).toBeInTheDocument();
    await waitFor(() => expect(api.getTeam).toHaveBeenCalledTimes(2));
  });

  it("a viewer who can't manage that role sees the flag but no Re-confirm", async () => {
    api.getTeam.mockResolvedValue(asRep({ items: [member(105, KAI, { needs_reconfirm: true })] }));
    renderScreen();
    const list = await members();
    expect(within(list).getByText(MEMBER_COPY.awaitingReconfirm.toUpperCase())).toBeInTheDocument();
    expect(within(list).queryByText(MEMBER_COPY.needsYourReconfirm.toUpperCase())).toBeNull();
    expect(within(list).queryByRole("button", { name: /Re-confirm/ })).toBeNull();
  });

  it("no badge without needs_reconfirm", async () => {
    api.getTeam.mockResolvedValue(team());
    renderScreen();
    const list = await members();
    expect(within(list).queryByText(/RE-CONFIRMATION/)).toBeNull();
    expect(within(list).queryByRole("button", { name: /Re-confirm/ })).toBeNull();
  });
});

describe("My own membership", () => {
  it("Leave asks first; Stay sends nothing; Leave POSTs and says you've left", async () => {
    api.getTeam.mockResolvedValue(asAdmin());
    api.leave.mockResolvedValue({ left: true });
    renderScreen();
    await members();

    press(screen.getByRole("button", { name: "Leave this team" }));
    let dialog = await screen.findByRole("dialog", { name: "Leave this team" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.leave).not.toHaveBeenCalled();

    press(screen.getByRole("button", { name: "Leave this team" }));
    dialog = await screen.findByRole("dialog", { name: "Leave this team" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave" }));
    expect(await screen.findByText(TEAM_SCREEN_COPY.left)).toBeInTheDocument();
    expect(api.leave).toHaveBeenCalledWith(PAGE_ID);
    expect(screen.getByRole("link", { name: /BACK TO YOUR VALIDATOR PAGES/ })).toHaveAttribute(
      "href",
      "/me/validator-pages",
    );
  });

  it("the switch starts at the server's value (off when null)", async () => {
    api.getTeam.mockResolvedValue(asAdmin({ viewer: { role: "administrator", membership_id: 101, show_publicly: null } }));
    renderScreen();
    await members();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });

  it("the switch never flips while the PATCH is out", async () => {
    api.getTeam.mockResolvedValue(asAdmin());
    api.visibility.mockReturnValue(new Promise(() => {}));
    renderScreen();
    await members();
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute("aria-busy", "true"));
    expect(api.visibility).toHaveBeenCalledWith(PAGE_ID, { show_publicly: true });
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("after the PATCH it shows what the SERVER saved, not what was asked", async () => {
    api.getTeam.mockResolvedValue(asAdmin());
    // Asked for true; the server kept it off.
    api.visibility.mockResolvedValue({ show_publicly: false });
    renderScreen();
    await members();
    const sw = screen.getByRole("switch");
    fireEvent.click(sw);
    await waitFor(() => expect(api.visibility).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sw).toHaveAttribute("aria-busy", "false"));
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("a saved true turns it on, and the team is re-read", async () => {
    api.getTeam.mockResolvedValueOnce(asAdmin());
    api.getTeam.mockResolvedValue(asAdmin({ viewer: { role: "administrator", membership_id: 101, show_publicly: true } }));
    api.visibility.mockResolvedValue({ show_publicly: true });
    renderScreen();
    await members();
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(api.getTeam).toHaveBeenCalledTimes(2));
  });

  it("a refused change leaves it where the server has it, with a line", async () => {
    api.getTeam.mockResolvedValue(asAdmin());
    api.visibility.mockRejectedValue(apiError("bcc_unavailable", 503));
    renderScreen();
    await members();
    fireEvent.click(screen.getByRole("switch"));
    expect(await screen.findByText(TEAM_ERROR_COPY.unavailable)).toBeInTheDocument();
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
  });
});

describe("Owner revert", () => {
  it("lists each change with ONLY its summary, actor and time; Undo POSTs and the team is re-read", async () => {
    api.getTeam.mockResolvedValue(team({ revertable: [CHANGE, CHANGE_2] }));
    api.revert.mockResolvedValue({ reverted: true, event_id: 91 });
    renderScreen();
    await members();
    const section = revertList() as HTMLElement;
    const rows = within(section).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText(CHANGE.summary)).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(rows[0]?.querySelector("time")).toHaveAttribute("datetime", CHANGE.at);
    // The kind is not rendered: the server's summary is the description.
    expect(section.textContent).not.toContain("team_member_added");

    press(within(rows[0] as HTMLElement).getByRole("button", { name: `Undo: ${CHANGE.summary}` }));
    await waitFor(() => expect(api.revert).toHaveBeenCalledWith(PAGE_ID, 91));
    expect(await screen.findByText(REVERT_COPY.undone)).toBeInTheDocument();
    await waitFor(() => expect(api.getTeam).toHaveBeenCalledTimes(2));
    expect(within(section).getByRole("button", { name: `Undo: ${CHANGE_2.summary}` })).toHaveFocus();
  });

  it.each([
    ["revert_stale", "This was changed again since, so it can't be undone here."],
    ["not_revertable", "This can no longer be undone."],
  ])("409 %s shows its copy on the row", async (reason, copy) => {
    api.getTeam.mockResolvedValue(team({ revertable: [CHANGE] }));
    api.revert.mockRejectedValue(apiError("bcc_conflict", 409, { reason }));
    renderScreen();
    await members();
    const section = revertList() as HTMLElement;
    fireEvent.click(within(section).getByRole("button", { name: `Undo: ${CHANGE.summary}` }));
    const line = await within(section).findByText(copy);
    expect(line).toHaveAttribute("role", "alert");
    expect(screen.queryByText(RAW)).toBeNull();
  });

  it("a server that sends no revertable yet: the owner's list is empty and the link says it can't be undone", async () => {
    const bare = team();
    delete bare.revertable;
    api.getTeam.mockResolvedValue(bare);
    renderScreen(91);
    await members();
    expect(within(revertList() as HTMLElement).getByText(REVERT_COPY.empty)).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: REVERT_COPY.confirmHeading });
    expect(within(panel).getByText("This can no longer be undone.")).toBeInTheDocument();
  });

  it("the owner with nothing to undo sees the empty line", async () => {
    api.getTeam.mockResolvedValue(team());
    renderScreen();
    await members();
    expect(within(revertList() as HTMLElement).getByText(REVERT_COPY.empty)).toBeInTheDocument();
  });
});

describe("?revert=<eventId> (the email link)", () => {
  it("shows the change and NEVER POSTs on load; only the click does", async () => {
    api.getTeam.mockResolvedValue(team({ revertable: [CHANGE] }));
    api.revert.mockResolvedValue({ reverted: true, event_id: 91 });
    renderScreen(91);
    const panel = await screen.findByRole("region", { name: REVERT_COPY.confirmHeading });
    expect(within(panel).getByText(CHANGE.summary)).toBeInTheDocument();
    // Let every effect and the post-load refetch window settle.
    await new Promise((r) => setTimeout(r, 50));
    expect(api.revert).not.toHaveBeenCalled();

    fireEvent.click(within(panel).getByRole("button", { name: REVERT_COPY.confirmButton }));
    await waitFor(() => expect(api.revert).toHaveBeenCalledWith(PAGE_ID, 91));
    expect(api.revert).toHaveBeenCalledTimes(1);
    expect(await within(panel).findByText(REVERT_COPY.undone)).toBeInTheDocument();
  });

  it("an event that's no longer revertable says so, with no button", async () => {
    api.getTeam.mockResolvedValue(team({ revertable: [CHANGE_2] }));
    renderScreen(91);
    const panel = await screen.findByRole("region", { name: REVERT_COPY.confirmHeading });
    expect(within(panel).getByText("This can no longer be undone.")).toBeInTheDocument();
    expect(within(panel).queryByRole("button")).toBeNull();
    expect(api.revert).not.toHaveBeenCalled();
  });

  it("a non-owner opening the link gets no undo", async () => {
    api.getTeam.mockResolvedValue(asAdmin({ revertable: [CHANGE] }));
    renderScreen(91);
    const panel = await screen.findByRole("region", { name: REVERT_COPY.confirmHeading });
    expect(within(panel).getByText(REVERT_COPY.ownerOnly)).toBeInTheDocument();
    expect(within(panel).queryByRole("button")).toBeNull();
  });

  it("a stale click shows revert_stale copy in the panel", async () => {
    api.getTeam.mockResolvedValue(team({ revertable: [CHANGE] }));
    api.revert.mockRejectedValue(apiError("bcc_conflict", 409, { reason: "revert_stale" }));
    renderScreen(91);
    const panel = await screen.findByRole("region", { name: REVERT_COPY.confirmHeading });
    fireEvent.click(within(panel).getByRole("button", { name: REVERT_COPY.confirmButton }));
    expect(
      await within(panel).findByText("This was changed again since, so it can't be undone here."),
    ).toBeInTheDocument();
  });
});

describe("Failed reads", () => {
  it.each([
    ["403 bcc_forbidden", apiError("bcc_forbidden", 403), "You don't have access to this team."],
    ["404 bcc_not_found", apiError("bcc_not_found", 404), "This page or team wasn't found."],
    ["404 rest_no_route", apiError("rest_no_route", 404), "This isn't available on the server yet."],
  ])("%s: its line, no Retry", async (_label, err, copy) => {
    api.getTeam.mockRejectedValue(err);
    renderScreen();
    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(screen.queryByText(RAW)).toBeNull();
  });

  it("a 503 offers a real Retry (after the hook's own single retry)", async () => {
    api.getTeam
      .mockRejectedValueOnce(apiError("bcc_unavailable", 503))
      .mockRejectedValueOnce(apiError("bcc_unavailable", 503));
    api.getTeam.mockResolvedValue(team());
    renderScreen();
    const retry = await screen.findByRole("button", { name: /retry/i }, { timeout: 4000 });
    expect(screen.getByText("This team couldn't be read just now. Try again shortly.")).toBeInTheDocument();
    fireEvent.click(retry);
    expect(await members()).toBeInTheDocument();
  });
});

describe("Security — staff-only data never reaches the team screen", () => {
  it("renders no evidence, history or wallet fields, and calls no history endpoint", async () => {
    const leaky = {
      ...team({ revertable: [CHANGE] }),
      items: [
        {
          ...ADA_ADMIN,
          evidence_note: "EVIDENCE-NOTE-SENTINEL",
          evidence_ref: "https://evidence.example/EVIDENCE-REF-SENTINEL",
          history: [{ action: "HISTORY-SENTINEL" }],
          wallet_address: "cosmos1walletsentinelxyz",
        },
      ],
      evidence_note: "PAGE-EVIDENCE-SENTINEL",
      history: [{ id: 1, action: "linked", reason_label: "HISTORY-REASON-SENTINEL" }],
    } as unknown as ValidatorTeamResponse;
    api.getTeam.mockResolvedValue(leaky);
    renderScreen(91);
    await members();
    await screen.findByRole("region", { name: REVERT_COPY.confirmHeading });

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/SENTINEL/);
    expect(text).not.toMatch(/cosmos1/);
    expect(screen.queryByText(/evidence/i)).toBeNull();
    expect(screen.queryByText(/history/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /copy/i })).toBeNull();

    expect(staffOnly.pageHistory).not.toHaveBeenCalled();
    expect(staffOnly.globalHistory).not.toHaveBeenCalled();
    expect(staffOnly.relationships).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    // Route 5 is the only read.
    expect(api.getTeam).toHaveBeenCalledTimes(1);
  });
});
