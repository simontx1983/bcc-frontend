/**
 * The validator page view (validator admin V1, PR B).
 *
 * Real components, real hooks, real QueryClient; only the endpoint module,
 * next/navigation and lib/env are stand-ins. Pinned:
 *   - the owner panel's four states, driven only by route 2 — and the
 *     staff lock is the server's `locked_for_staff`: actions ONLY on an
 *     explicit `false`; true, missing, non-boolean, or a node-key owner
 *     with no flag are locked with no buttons at all (fail closed);
 *   - link: pick → fields → password → code → the exact body, success
 *     copy, and the reads refreshed;
 *   - step-up errors keyed on code + reason, each 409 reason's copy, 422
 *     back on its field, resend waiting out resend_after;
 *   - revoke sends a key from `revoke_reasons`; cancel only when
 *     cancellable, with the restored owner;
 *   - the password and code leave the DOM and the mutation cache on
 *     close; focus moves into each step and returns to the trigger;
 *   - per-page history and the 403 / rest_no_route / bcc_not_found states.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
import type {
  AdminUserRef,
  AdminValidatorPageOwner,
  AdminValidatorPageRelationships,
  ValidatorRelationshipHistoryItem,
  ValidatorRelationshipHistoryResponse,
} from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/validators/40",
  useSearchParams: () => new URLSearchParams(),
}));

const api = vi.hoisted(() => ({
  getPage: vi.fn(),
  getPageHistory: vi.fn(),
  search: vi.fn(),
  start: vi.fn(),
  resend: vi.fn(),
  link: vi.fn(),
  revoke: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("@/lib/api/admin-validator-endpoints", () => ({
  getAdminValidatorDirectory: vi.fn(),
  getValidatorRelationshipHistory: vi.fn(),
  getValidatorRelationshipHealth: vi.fn(),
  getAdminValidatorPageRelationships: (...a: unknown[]) => api.getPage(...a),
  getAdminValidatorPageHistory: (...a: unknown[]) => api.getPageHistory(...a),
  searchAdminUsers: (...a: unknown[]) => api.search(...a),
  startValidatorStepUp: (...a: unknown[]) => api.start(...a),
  resendValidatorStepUp: (...a: unknown[]) => api.resend(...a),
  linkValidatorOwner: (...a: unknown[]) => api.link(...a),
  revokeValidatorOwner: (...a: unknown[]) => api.revoke(...a),
  cancelValidatorOwnerLink: (...a: unknown[]) => api.cancel(...a),
}));

import { ADMIN_ID_NOT_FOUND_COPY } from "@/components/admin/validators/AdminReadFailure";
import { LINK_COPY } from "@/components/admin/validators/LinkOwnerForm";
import { RESTORED_OWNER_COPY } from "@/components/admin/validators/OwnerNotice";
import { OWNER_COPY } from "@/components/admin/validators/OwnerPanel";
import { LOCKED_FOR_STAFF_COPY } from "@/components/admin/validators/StatePill";
import { CONFLICT_COPY, STEP_UP_COPY } from "@/components/admin/validators/StepUpDialog";
import { ValidatorPageAdmin } from "@/components/admin/validators/ValidatorPageAdmin";

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
  api.getPageHistory.mockResolvedValue(historyPage([]));
});

afterEach(cleanup);

const RAW = "raw server text that must never render";
const PAGE_ID = 40;
const LINK_ID = 77;
const PASSWORD = "correct-horse-battery";
const CODE = "481516";

const ADA: AdminUserRef = { user_id: 9, handle: "ada", display_name: "Ada Lovelace", avatar_url: null };
const GRACE: AdminUserRef = { user_id: 3, handle: "grace", display_name: "Grace Hopper", avatar_url: null };
const LIN: AdminUserRef = { user_id: 12, handle: "lin", display_name: "Lin Shu", avatar_url: null };

const REASONS = [
  { key: "linked_in_error", label: "Linked in error" },
  { key: "evidence_withdrawn", label: "Evidence withdrawn" },
];

function staffOwner(over: Partial<AdminValidatorPageOwner> = {}): AdminValidatorPageOwner {
  return {
    link_id: LINK_ID,
    user: ADA,
    verification: {
      kind: "staff",
      method: "staff",
      label: "Staff Verified",
      verified_at: "2026-11-01T00:00:00Z",
    },
    linked_by: GRACE,
    linked_at: "2026-11-01T00:00:00Z",
    evidence_type: "keybase",
    evidence_note: "Signed statement on keybase.io/ada",
    evidence_ref: "https://keybase.io/ada",
    cancellable: false,
    locked_for_staff: false,
    ...over,
  };
}

function walletOwner(over: Partial<AdminValidatorPageOwner> = {}): AdminValidatorPageOwner {
  return staffOwner({
    verification: {
      kind: "wallet",
      method: "wallet",
      label: "Wallet Verified",
      verified_at: "2026-10-01T00:00:00Z",
    },
    linked_by: null,
    evidence_type: null,
    evidence_note: null,
    evidence_ref: null,
    locked_for_staff: true,
    ...over,
  });
}

const NODE_KEY = {
  kind: "node_key",
  method: "solana_identity",
  label: "Node Key Verified",
  verified_at: "2026-10-02T00:00:00Z",
} as const;

/** The owner as a server that sent no `locked_for_staff` would. */
function withoutLockFlag(owner: AdminValidatorPageOwner): AdminValidatorPageOwner {
  const copy = { ...owner };
  delete copy.locked_for_staff;
  return copy;
}

function rel(over: Partial<AdminValidatorPageRelationships> = {}): AdminValidatorPageRelationships {
  return {
    page: {
      page_id: PAGE_ID,
      title: "Figment",
      slug: "figment",
      chain: { slug: "cosmoshub", name: "Cosmos Hub" },
    },
    state: "unclaimed",
    owner: null,
    conflict_users: [],
    revoke_reasons: REASONS,
    ...over,
  };
}

function entry(id: number, over: Partial<ValidatorRelationshipHistoryItem> = {}): ValidatorRelationshipHistoryItem {
  return {
    id,
    created_at: "2026-11-20T10:00:00Z",
    action: "linked",
    subject: ADA,
    actor: GRACE,
    page: { page_id: PAGE_ID, title: `Entry ${id}` },
    prev: { role: null, status: null, method: null },
    new: { role: "owner", status: "active", method: "keybase" },
    reason: null,
    reason_label: null,
    evidence_note: null,
    evidence_ref: null,
    step_up: "password+code",
    ...over,
  };
}

function historyPage(
  items: ValidatorRelationshipHistoryItem[],
  more: { next_cursor: string | null; has_more: boolean } = { next_cursor: null, has_more: false },
): ValidatorRelationshipHistoryResponse {
  return { items, pagination: more };
}

/** An API error carrying `data`, the way the client builds it from the envelope. */
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
      <ValidatorPageAdmin pageId={PAGE_ID} />
    </QueryClientProvider>,
  );
  return { ...view, qc };
}

const ownership = async () =>
  (await screen.findByRole("heading", { name: "OWNERSHIP" })).closest("section") as HTMLElement;

const dialog = () => screen.getByRole("dialog");

/** Press a trigger the way a keyboard user would: focus, then activate. */
function press(button: HTMLElement) {
  button.focus();
  fireEvent.click(button);
}

function stepUpStarted(over: Partial<{ step_up_id: string; expires_in: number; resend_after: number }> = {}) {
  return { step_up_id: "su-1", expires_in: 600, resend_after: 60, ...over };
}

async function passPassword() {
  await screen.findByRole("heading", { name: STEP_UP_COPY.passwordHeading });
  fireEvent.change(screen.getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByRole("heading", { name: STEP_UP_COPY.codeHeading });
}

async function enterCode(code = CODE) {
  fireEvent.change(screen.getByLabelText("CODE"), { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
}

async function fillLinkForm() {
  api.search.mockResolvedValue({ items: [LIN] });
  fireEvent.change(screen.getByLabelText("MEMBER"), { target: { value: "lin" } });
  fireEvent.click(await screen.findByRole("option", { name: /@lin/ }));
  fireEvent.change(screen.getByLabelText("EVIDENCE TYPE"), { target: { value: "website" } });
  fireEvent.change(screen.getByLabelText("EVIDENCE NOTE"), {
    target: { value: "  DNS TXT record matches  " },
  });
  fireEvent.change(screen.getByLabelText("EVIDENCE REFERENCE"), {
    target: { value: "https://figment.io/.well-known/bcc" },
  });
}

it("rejects a bare evidence ticket before starting confirmation", async () => {
  api.getPage.mockResolvedValue(rel());
  renderPage();
  await ownership();
  await fillLinkForm();
  const input = screen.getByLabelText("EVIDENCE REFERENCE");
  fireEvent.change(input, { target: { value: "TICKET-123" } });
  fireEvent.click(screen.getByRole("button", { name: "Link owner" }));
  expect(await screen.findByText(LINK_COPY.refInvalid)).toBeInTheDocument();
  expect(input).toHaveFocus();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.start).not.toHaveBeenCalled();
});

it("shows a send failure and lets the admin restart confirmation", async () => {
  await openStaffRevokeDialog();
  api.start.mockRejectedValueOnce(apiError("bcc_unavailable", 503, { reason: "mail_unavailable" }));
  fireEvent.change(screen.getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText(STEP_UP_COPY.mailUnavailable)).toBeInTheDocument();
  expect(screen.getByLabelText("CURRENT PASSWORD")).toHaveValue("");
  expect(screen.queryByLabelText("CODE")).toBeNull();
});

async function openRevoke() {
  const section = await ownership();
  fireEvent.change(within(section).getByLabelText("REASON"), { target: { value: "evidence_withdrawn" } });
  press(within(section).getByRole("button", { name: "Revoke owner" }));
}

// ─────────────────────────────────────────────────────────────────────

describe("Page view — header", () => {
  it("shows the title, chain, state pill and page id", async () => {
    api.getPage.mockResolvedValue(rel({ state: "staff_verified", owner: staffOwner() }));
    renderPage();
    expect(await screen.findByRole("heading", { name: "Figment" })).toBeInTheDocument();
    expect(screen.getByText("Cosmos Hub")).toBeInTheDocument();
    expect(screen.getByText("VERIFIED BY BCC")).toBeInTheDocument();
    expect(screen.getByText("#40")).toBeInTheDocument();
    expect(api.getPage).toHaveBeenCalledWith(PAGE_ID, expect.anything());
  });
});

describe("Owner panel — the four states", () => {
  it("no owner: the link form", async () => {
    api.getPage.mockResolvedValue(rel());
    renderPage();
    const section = await ownership();
    expect(within(section).getByRole("heading", { name: LINK_COPY.heading })).toBeInTheDocument();
    expect(within(section).getByLabelText("MEMBER")).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Link owner" })).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Revoke owner" })).toBeNull();
    // The evidence types come from labels.ts.
    const options = within(within(section).getByLabelText("EVIDENCE TYPE")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["Choose…", "Website", "Keybase", "Manual review"]);
  });

  it("locked_for_staff false: details, evidence as text, and Revoke (no Cancel unless cancellable)", async () => {
    api.getPage.mockResolvedValue(rel({ state: "staff_verified", owner: staffOwner() }));
    renderPage();
    const section = await ownership();
    expect(within(section).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(section).getByText("Staff Verified")).toBeInTheDocument();
    expect(within(section).getByText("Keybase")).toBeInTheDocument();
    expect(within(section).getByText("Grace Hopper")).toBeInTheDocument();
    expect(within(section).getByText("Signed statement on keybase.io/ada")).toBeInTheDocument();
    expect(within(section).getByText("https://keybase.io/ada")).toBeInTheDocument();
    expect(section.querySelector("a")).toBeNull();
    expect(within(section).getByRole("button", { name: "Copy evidence reference" })).toBeInTheDocument();
    expect(within(section).getByRole("button", { name: "Revoke owner" })).toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Cancel this link" })).toBeNull();
    expect(within(section).queryByText(LOCKED_FOR_STAFF_COPY)).toBeNull();
  });

  it.each<[string, AdminValidatorPageOwner]>([
    ["true (wallet)", walletOwner({ locked_for_staff: true })],
    ["missing", withoutLockFlag(walletOwner())],
    ["not a boolean", { ...walletOwner(), locked_for_staff: "false" } as unknown as AdminValidatorPageOwner],
    ["missing, on a node-key owner", withoutLockFlag(walletOwner({ verification: NODE_KEY }))],
    ["missing, on a staff-kind owner (never keyed on kind)", withoutLockFlag(staffOwner({ cancellable: true }))],
  ])("locked_for_staff %s: LOCKED, read-only, no buttons at all", async (_label, owner) => {
    api.getPage.mockResolvedValue(rel({ state: "wallet_verified", owner }));
    renderPage();
    const section = await ownership();

    expect(within(section).getByText(LOCKED_FOR_STAFF_COPY)).toBeInTheDocument();
    expect(within(section).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(within(section).queryByLabelText("MEMBER")).toBeNull();
    expect(section.querySelector("form")).toBeNull();
  });

  it("locked owner shows the server's verification label and verified date", async () => {
    api.getPage.mockResolvedValue(rel({ state: "wallet_verified", owner: walletOwner() }));
    renderPage();
    const section = await ownership();
    expect(within(section).getByText("Wallet Verified")).toBeInTheDocument();
    expect(section.querySelector("time")).toHaveAttribute("datetime", "2026-10-01T00:00:00Z");
    // The header carries the Locked marker for a locked owner.
    expect(screen.getByText("LOCKED")).toBeInTheDocument();
  });

  it("conflict: each claimant with their verification, read-only, with the note", async () => {
    api.getPage.mockResolvedValue(
      rel({
        state: "conflict",
        conflict_users: [
          { user: ADA, verification: { kind: "wallet", method: "wallet", label: "Wallet Verified", verified_at: "2026-10-01T00:00:00Z" } },
          { user: LIN, verification: { kind: "node_key", method: "solana_identity", verified_at: "2026-10-02T00:00:00Z" } },
        ],
      }),
    );
    renderPage();
    const section = await ownership();
    expect(within(section).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(section).getByText("WALLET VERIFIED")).toBeInTheDocument();
    expect(within(section).getByText("Lin Shu")).toBeInTheDocument();
    // No server label: the labels.ts fallback.
    expect(within(section).getByText("NODE KEY PROOF")).toBeInTheDocument();
    expect(within(section).getByText(OWNER_COPY.conflictNote)).toBeInTheDocument();
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
  });
});

describe("Link an owner — the full flow", () => {
  it("pick → fields → password → code → link with the exact body; success copy; reads refreshed", async () => {
    api.getPage.mockResolvedValueOnce(rel());
    const { qc } = renderPage();
    await ownership();
    // Seed the global history and a directory view so their invalidation is observable.
    const globalHistoryKey = ["admin", "validators", "history", { page_id: null, user_id: null }];
    const directoryKey = ["admin", "validators", "directory", { chain: null, state: null, q: "" }];
    qc.setQueryData(globalHistoryKey, { pages: [], pageParams: [] });
    qc.setQueryData(directoryKey, { pages: [], pageParams: [] });

    await fillLinkForm();
    expect(api.search).toHaveBeenCalledWith("lin", expect.anything());
    expect(screen.getByText("Lin Shu")).toBeInTheDocument();

    api.start.mockResolvedValue(stepUpStarted());
    press(screen.getByRole("button", { name: "Link owner" }));
    expect(await screen.findByRole("dialog", { name: LINK_COPY.heading })).toBeInTheDocument();
    expect(screen.getByLabelText("CURRENT PASSWORD")).toHaveFocus();

    await passPassword();
    expect(api.start).toHaveBeenCalledWith(PAGE_ID, {
      action: "link_owner",
      target_user_id: LIN.user_id,
      current_password: PASSWORD,
    });
    expect(screen.getByText(/We emailed a code to your account address\./)).toBeInTheDocument();
    expect(screen.getByLabelText("CODE")).toHaveFocus();

    api.link.mockResolvedValue({ link_id: 90, owner: staffOwner({ user: LIN, link_id: 90 }) });
    api.getPage.mockResolvedValue(rel({ state: "staff_verified", owner: staffOwner({ user: LIN, link_id: 90 }) }));
    await enterCode();

    expect(await screen.findByText(LINK_COPY.linked)).toBeInTheDocument();
    expect(api.link).toHaveBeenCalledWith(PAGE_ID, {
      user_id: LIN.user_id,
      role: "owner",
      verification_method: "website",
      evidence_note: "DNS TXT record matches",
      evidence_ref: "https://figment.io/.well-known/bcc",
      step_up_id: "su-1",
      code: CODE,
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    // The page and its history were refetched; global history and directory invalidated.
    await waitFor(() => expect(api.getPage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(api.getPageHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Revoke owner" })).toBeInTheDocument();
    expect(qc.getQueryState(globalHistoryKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(directoryKey)?.isInvalidated).toBe(true);
  });

  it("the picker shows avatar, name and @handle; picking moves focus to Change, Change back to search", async () => {
    api.getPage.mockResolvedValue(rel());
    renderPage();
    await ownership();
    api.search.mockResolvedValue({ items: [LIN, GRACE] });
    const box = screen.getByLabelText("MEMBER");
    box.focus();
    fireEvent.change(box, { target: { value: "  hop  " } });

    const listbox = await screen.findByRole("listbox", { name: "Members" });
    await within(listbox).findByText("Grace Hopper");
    expect(api.search).toHaveBeenLastCalledWith("hop", expect.anything());
    expect(within(listbox).getByText("@grace")).toBeInTheDocument();
    expect(box).toHaveAttribute("aria-expanded", "true");

    // Keyboard: ↓ then Enter picks the second result.
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    const change = screen.getByRole("button", { name: "Change member (now @grace)" });
    expect(change).toHaveFocus();
    expect(screen.queryByRole("combobox", { name: "MEMBER" })).toBeNull();

    fireEvent.click(change);
    expect(screen.getByLabelText("MEMBER")).toHaveFocus();
  });

  it("an empty form names every missing field and opens no dialog", async () => {
    api.getPage.mockResolvedValue(rel());
    renderPage();
    await ownership();
    press(screen.getByRole("button", { name: "Link owner" }));

    expect(screen.getByText(LINK_COPY.userRequired)).toBeInTheDocument();
    expect(screen.getByText(LINK_COPY.typeRequired)).toBeInTheDocument();
    expect(screen.getByText(LINK_COPY.noteRequired)).toBeInTheDocument();
    expect(screen.getByText(LINK_COPY.refRequired)).toBeInTheDocument();
    expect(screen.getByLabelText("MEMBER")).toHaveFocus();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.start).not.toHaveBeenCalled();
  });

  it("the evidence note counts toward 2000 and is capped there", async () => {
    api.getPage.mockResolvedValue(rel());
    renderPage();
    await ownership();
    const note = screen.getByLabelText("EVIDENCE NOTE");
    expect(note).toHaveAttribute("maxlength", "2000");
    expect(screen.getByLabelText("EVIDENCE REFERENCE")).toHaveAttribute("maxlength", "500");
    fireEvent.change(note, { target: { value: "abc" } });
    expect(screen.getByText("3 / 2000")).toBeInTheDocument();
  });

  it("a 422 naming a form field closes the dialog and shows it on that field", async () => {
    api.getPage.mockResolvedValue(rel());
    renderPage();
    await ownership();
    await fillLinkForm();
    api.start.mockResolvedValue(stepUpStarted());
    press(screen.getByRole("button", { name: "Link owner" }));
    await passPassword();

    api.link.mockRejectedValue(apiError("bcc_invalid_request", 422, { field: "evidence_ref" }));
    await enterCode();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const ref = screen.getByLabelText("EVIDENCE REFERENCE");
    expect(ref).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(LINK_COPY.rejected)).toBeInTheDocument();
    // The form kept what was typed.
    expect(ref).toHaveValue("https://figment.io/.well-known/bcc");
    expect(screen.queryByText(RAW)).toBeNull();
  });

  it("a 422 target_not_eligible closes the dialog with one plain line, whatever field it names", async () => {
    api.getPage.mockResolvedValue(rel());
    renderPage();
    await ownership();
    await fillLinkForm();
    api.start.mockResolvedValue(stepUpStarted());
    press(screen.getByRole("button", { name: "Link owner" }));
    await passPassword();

    api.link.mockRejectedValue(
      apiError("bcc_invalid_request", 422, { reason: "target_not_eligible", field: "user_id" }),
    );
    await enterCode();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("alert")).toHaveTextContent(STEP_UP_COPY.targetNotEligible);
    // Not the generic rejection, and never the server's words.
    expect(screen.queryByText(LINK_COPY.rejected)).toBeNull();
    expect(screen.queryByText(RAW)).toBeNull();
    // The rest of the form is kept for a different pick.
    expect(screen.getByLabelText("EVIDENCE REFERENCE")).toHaveValue("https://figment.io/.well-known/bcc");
  });

  it("a 422 with any OTHER reason still lands on its field, never the not-eligible line", async () => {
    api.getPage.mockResolvedValue(rel());
    renderPage();
    await ownership();
    await fillLinkForm();
    api.start.mockResolvedValue(stepUpStarted());
    press(screen.getByRole("button", { name: "Link owner" }));
    await passPassword();

    api.link.mockRejectedValue(
      apiError("bcc_invalid_request", 422, { reason: "invalid_evidence", field: "evidence_ref" }),
    );
    await enterCode();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("EVIDENCE REFERENCE")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(LINK_COPY.rejected)).toBeInTheDocument();
    expect(screen.queryByText(STEP_UP_COPY.targetNotEligible)).toBeNull();
  });
});


async function openStaffRevokeDialog() {
  api.getPage.mockResolvedValue(rel({ state: "staff_verified", owner: staffOwner() }));
  const view = renderPage();
  await openRevoke();
  await screen.findByRole("dialog", { name: "Revoke owner" });
  return view;
}

describe("Step-up — errors keyed on code and reason", () => {
  it("a wrong password stays on step 1, says so, and clears the field", async () => {
    await openStaffRevokeDialog();
    api.start.mockRejectedValue(apiError("bcc_step_up_failed", 403, { reason: "password" }));
    fireEvent.change(screen.getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(STEP_UP_COPY.wrongPassword)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: STEP_UP_COPY.passwordHeading })).toBeInTheDocument();
    expect(screen.queryByLabelText("CODE")).toBeNull();
    expect(screen.getByLabelText("CURRENT PASSWORD")).toHaveValue("");
    expect(screen.getByLabelText("CURRENT PASSWORD")).toHaveFocus();
    expect(screen.queryByText(RAW)).toBeNull();
  });

  it("a wrong code stays on step 2, says so, and clears the code", async () => {
    await openStaffRevokeDialog();
    api.start.mockResolvedValue(stepUpStarted());
    await passPassword();
    api.revoke.mockRejectedValue(apiError("bcc_step_up_failed", 403, { reason: "code" }));
    await enterCode();

    expect(await screen.findByText(STEP_UP_COPY.wrongCode)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: STEP_UP_COPY.codeHeading })).toBeInTheDocument();
    expect(screen.getByLabelText("CODE")).toHaveValue("");
    expect(screen.getByLabelText("CODE")).toHaveFocus();
  });

  it.each([
    ["expired", STEP_UP_COPY.expired],
    ["used", STEP_UP_COPY.expired],
    ["mismatch", STEP_UP_COPY.mismatch],
  ])("reason %s returns to step 1 with its copy", async (reason, copy) => {
    await openStaffRevokeDialog();
    api.start.mockResolvedValue(stepUpStarted());
    await passPassword();
    api.revoke.mockRejectedValue(apiError("bcc_step_up_failed", 403, { reason }));
    await enterCode();

    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: STEP_UP_COPY.passwordHeading })).toBeInTheDocument();
    expect(screen.getByLabelText("CURRENT PASSWORD")).toHaveValue("");
    expect(screen.getByLabelText("CURRENT PASSWORD")).toHaveFocus();
  });

  it.each([
    ["429", apiError("bcc_rate_limited", 429), STEP_UP_COPY.rateLimited],
    ["503", apiError("bcc_unavailable", 503), STEP_UP_COPY.unavailable],
    ["403 bcc_forbidden", apiError("bcc_forbidden", 403), STEP_UP_COPY.denied],
    ["403 rest_forbidden", apiError("rest_forbidden", 403), STEP_UP_COPY.denied],
  ])("a %s on the write stays put with its copy", async (_label, err, copy) => {
    await openStaffRevokeDialog();
    api.start.mockResolvedValue(stepUpStarted());
    await passPassword();
    api.revoke.mockRejectedValue(err);
    await enterCode();

    expect(await screen.findByText(copy)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText(RAW)).toBeNull();
  });

  it.each(Object.entries(CONFLICT_COPY))(
    "409 %s: closes the dialog, shows its copy and refreshes the page",
    async (reason, copy) => {
      await openStaffRevokeDialog();
      api.start.mockResolvedValue(stepUpStarted());
      await passPassword();
      api.revoke.mockRejectedValue(apiError("bcc_conflict", 409, { reason }));
      await enterCode();

      const alert = await screen.findByText(copy);
      expect(alert).toHaveAttribute("role", "alert");
      expect(screen.queryByRole("dialog")).toBeNull();
      await waitFor(() => expect(api.getPage).toHaveBeenCalledTimes(2));
      expect(screen.queryByText(RAW)).toBeNull();
    },
  );

  it("the submit button is aria-disabled + aria-busy while pending, and a repeat press is ignored", async () => {
    await openStaffRevokeDialog();
    api.start.mockReturnValue(new Promise(() => {}));
    fireEvent.change(screen.getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    const submit = screen.getByRole("button", { name: "Continue" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    const busy = await screen.findByRole("button", { name: "Checking…" });
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).not.toHaveAttribute("disabled");
    fireEvent.click(busy);
    expect(api.start).toHaveBeenCalledTimes(1);
  });

  it("the code field takes digits only", async () => {
    await openStaffRevokeDialog();
    api.start.mockResolvedValue(stepUpStarted());
    await passPassword();
    const code = screen.getByLabelText("CODE");
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(code, { target: { value: "48-15 16x9" } });
    expect(code).toHaveValue("481516");
  });

  it("the password field asks the browser for the current password", async () => {
    await openStaffRevokeDialog();
    const pw = screen.getByLabelText("CURRENT PASSWORD");
    expect(pw).toHaveAttribute("type", "password");
    expect(pw).toHaveAttribute("autocomplete", "current-password");
  });
});

describe("Step-up — resend", () => {
  it("is disabled with a countdown until resend_after, then resends and restarts the wait", async () => {
    await openStaffRevokeDialog();
    api.start.mockResolvedValue(stepUpStarted({ resend_after: 1 }));
    await passPassword();

    const waiting = screen.getByRole("button", { name: "Resend code in 1s" });
    expect(waiting).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(waiting);
    expect(api.resend).not.toHaveBeenCalled();

    const ready = await screen.findByRole("button", { name: "Resend code" }, { timeout: 3000 });
    expect(ready).toHaveAttribute("aria-disabled", "false");
    api.resend.mockResolvedValue({ expires_in: 600, resend_after: 30 });
    fireEvent.click(ready);

    expect(await screen.findByText(STEP_UP_COPY.resent)).toBeInTheDocument();
    expect(api.resend).toHaveBeenCalledWith("su-1");
    expect(screen.getByRole("button", { name: "Resend code in 30s" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("Revoke", () => {
  it("renders the reasons from the response and sends the chosen key", async () => {
    api.getPage.mockResolvedValue(
      rel({
        state: "staff_verified",
        owner: staffOwner(),
        revoke_reasons: [{ key: "server_only_key", label: "A reason only the server knows" }],
      }),
    );
    renderPage();
    const section = await ownership();
    const select = within(section).getByLabelText("REASON");
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Choose…",
      "A reason only the server knows",
    ]);

    fireEvent.change(select, { target: { value: "server_only_key" } });
    fireEvent.change(within(section).getAllByLabelText(/NOTE/)[0] as HTMLElement, {
      target: { value: " Asked by the team " },
    });
    api.start.mockResolvedValue(stepUpStarted());
    press(within(section).getByRole("button", { name: "Revoke owner" }));
    await passPassword();
    expect(api.start).toHaveBeenCalledWith(PAGE_ID, {
      action: "revoke_owner",
      target_user_id: ADA.user_id,
      current_password: PASSWORD,
    });

    api.revoke.mockResolvedValue({ revoked: true });
    await enterCode();
    expect(await screen.findByText(OWNER_COPY.revoked)).toBeInTheDocument();
    expect(api.revoke).toHaveBeenCalledWith(PAGE_ID, LINK_ID, {
      reason: "server_only_key",
      note: "Asked by the team",
      step_up_id: "su-1",
      code: CODE,
    });
  });

  it("asks for a reason before opening the step-up", async () => {
    api.getPage.mockResolvedValue(rel({ state: "staff_verified", owner: staffOwner() }));
    renderPage();
    const section = await ownership();
    press(within(section).getByRole("button", { name: "Revoke owner" }));
    expect(within(section).getByText(OWNER_COPY.reasonRequired)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Cancel this link", () => {
  it("appears only when cancellable, and shows the restored owner", async () => {
    api.getPage.mockResolvedValue(
      rel({ state: "staff_verified", owner: staffOwner({ cancellable: true }) }),
    );
    renderPage();
    const section = await ownership();
    api.start.mockResolvedValue(stepUpStarted());
    press(within(section).getByRole("button", { name: "Cancel this link" }));
    expect(await screen.findByRole("dialog", { name: "Cancel this link" })).toBeInTheDocument();
    await passPassword();
    expect(api.start).toHaveBeenCalledWith(PAGE_ID, {
      action: "cancel_link",
      target_user_id: ADA.user_id,
      current_password: PASSWORD,
    });

    api.cancel.mockResolvedValue({ cancelled: true, restored_owner: LIN });
    await enterCode();

    expect(await screen.findByText(OWNER_COPY.cancelled)).toBeInTheDocument();
    expect(screen.getByText(RESTORED_OWNER_COPY)).toBeInTheDocument();
    const status = screen.getByText(RESTORED_OWNER_COPY).closest("[role='status']") as HTMLElement;
    expect(within(status).getByText("Lin Shu")).toBeInTheDocument();
    expect(api.cancel).toHaveBeenCalledWith(PAGE_ID, LINK_ID, {
      note: "",
      step_up_id: "su-1",
      code: CODE,
    });
  });

  it("with no previous owner, says only that the link was cancelled", async () => {
    api.getPage.mockResolvedValue(
      rel({ state: "staff_verified", owner: staffOwner({ cancellable: true }) }),
    );
    renderPage();
    const section = await ownership();
    api.start.mockResolvedValue(stepUpStarted());
    press(within(section).getByRole("button", { name: "Cancel this link" }));
    await passPassword();
    api.cancel.mockResolvedValue({ cancelled: true, restored_owner: null });
    await enterCode();

    expect(await screen.findByText(OWNER_COPY.cancelled)).toBeInTheDocument();
    expect(screen.queryByText(RESTORED_OWNER_COPY)).toBeNull();
  });
});

describe("Step-up — secrets and focus", () => {
  it("refreshes a saved write's unavailable result without keeping a retry dialog", async () => {
    const { qc } = await openStaffRevokeDialog();
    api.start.mockResolvedValue(stepUpStarted());
    await passPassword();
    api.revoke.mockRejectedValueOnce(apiError("bcc_unavailable", 503, { reason: "result_unavailable", committed: true }));
    await enterCode();

    expect(await screen.findByText(STEP_UP_COPY.savedResultUnavailable)).toHaveAttribute("role", "alert");
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(api.getPage).toHaveBeenCalledTimes(2));
    expect(api.revoke).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(qc.getMutationCache().getAll().some((m) => JSON.stringify(m.state.variables ?? null).includes(CODE))).toBe(false));
  });

  const cacheHolds = (qc: QueryClient, secret: string) =>
    qc.getMutationCache().getAll().some((m) => JSON.stringify(m.state.variables ?? null).includes(secret));

  it("after a failed step-up start, the mutation cache holds no variables containing the password", async () => {
    const { qc } = await openStaffRevokeDialog();
    api.start.mockRejectedValueOnce(apiError("bcc_step_up_failed", 403, { reason: "password" }));
    fireEvent.change(screen.getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(STEP_UP_COPY.wrongPassword);

    // The dialog is still open: the reset happens on the failure, not on close.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(cacheHolds(qc, PASSWORD)).toBe(false));
  });

  it("after a failed write, the mutation cache holds no variables containing the code", async () => {
    const { qc } = await openStaffRevokeDialog();
    api.start.mockResolvedValue(stepUpStarted());
    await passPassword();
    api.revoke.mockRejectedValueOnce(apiError("bcc_unavailable", 503));
    await enterCode();
    await screen.findByText(STEP_UP_COPY.unavailable);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await waitFor(() => expect(cacheHolds(qc, CODE)).toBe(false));
  });

  it("the password leaves the DOM and the mutation cache when the dialog closes", async () => {
    const { qc } = await openStaffRevokeDialog();
    api.start.mockReturnValueOnce(Promise.reject(apiError("bcc_rate_limited", 429)));
    fireEvent.change(screen.getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(STEP_UP_COPY.rateLimited);
    fireEvent.change(screen.getByLabelText("CURRENT PASSWORD"), { target: { value: PASSWORD } });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByDisplayValue(PASSWORD)).toBeNull();
    await waitFor(() =>
      expect(
        qc.getMutationCache().getAll().some((m) => JSON.stringify(m.state.variables ?? null).includes(PASSWORD)),
      ).toBe(false),
    );

    // Reopening starts empty.
    press(screen.getByRole("button", { name: "Revoke owner" }));
    expect(await screen.findByLabelText("CURRENT PASSWORD")).toHaveValue("");
  });

  it("the code and password leave the DOM and the cache when closed from step 2 (Escape)", async () => {
    const { qc } = await openStaffRevokeDialog();
    api.start.mockResolvedValue(stepUpStarted());
    await passPassword();
    // The password is gone as soon as step 1 succeeds.
    expect(qc.getMutationCache().getAll().some((m) => JSON.stringify(m.state.variables ?? null).includes(PASSWORD))).toBe(false);
    api.revoke.mockRejectedValueOnce(apiError("bcc_unavailable", 503));
    await enterCode();
    await screen.findByText(STEP_UP_COPY.unavailable);
    fireEvent.change(screen.getByLabelText("CODE"), { target: { value: CODE } });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByDisplayValue(CODE)).toBeNull();
    expect(screen.queryByDisplayValue(PASSWORD)).toBeNull();
    await waitFor(() => {
      const leaked = qc
        .getMutationCache()
        .getAll()
        .some((m) => {
          const vars = JSON.stringify(m.state.variables ?? null);
          return vars.includes(CODE) || vars.includes(PASSWORD);
        });
      expect(leaked).toBe(false);
    });

    press(screen.getByRole("button", { name: "Revoke owner" }));
    expect(await screen.findByLabelText("CURRENT PASSWORD")).toHaveValue("");
    expect(screen.queryByLabelText("CODE")).toBeNull();
  });

  it("focus returns to the trigger when the dialog closes", async () => {
    api.getPage.mockResolvedValue(rel({ state: "staff_verified", owner: staffOwner() }));
    renderPage();
    const section = await ownership();
    fireEvent.change(within(section).getByLabelText("REASON"), { target: { value: "linked_in_error" } });
    const trigger = within(section).getByRole("button", { name: "Revoke owner" });
    press(trigger);
    expect(await screen.findByLabelText("CURRENT PASSWORD")).toHaveFocus();

    fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
  });
});

describe("Per-page history", () => {
  it("renders the page's entries and Load more sends the cursor", async () => {
    api.getPage.mockResolvedValue(rel());
    api.getPageHistory.mockReset();
    api.getPageHistory.mockResolvedValueOnce(
      historyPage([entry(1, { evidence_ref: "https://example.com/proof" })], { next_cursor: "h-2", has_more: true }),
    );
    const { container } = renderPage();

    expect(await screen.findByText("Entry 1")).toBeInTheDocument();
    expect(api.getPageHistory).toHaveBeenCalledWith(PAGE_ID, { limit: 25 }, expect.anything());
    // Evidence stays text (D5).
    expect(screen.getByText("https://example.com/proof")).toBeInTheDocument();
    expect(container.querySelector("a[href='https://example.com/proof']")).toBeNull();

    api.getPageHistory.mockResolvedValueOnce(historyPage([entry(2)]));
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(await screen.findByText("Entry 2")).toBeInTheDocument();
    expect(api.getPageHistory).toHaveBeenLastCalledWith(
      PAGE_ID,
      { limit: 25, cursor: "h-2" },
      expect.anything(),
    );
    expect(screen.getByText("Entry 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("an empty history says so", async () => {
    api.getPage.mockResolvedValue(rel());
    renderPage();
    expect(await screen.findByText("No ownership changes yet.")).toBeInTheDocument();
  });
});

describe("Page view — failed reads", () => {
  it.each(["bcc_forbidden", "rest_forbidden"])(
    "a 403 (%s) shows Admin access required, no Retry, no history",
    async (code) => {
      api.getPage.mockRejectedValue(new BccApiError(code, RAW, 403, null));
      renderPage();
      expect(await screen.findByText(/admin access required/i)).toBeInTheDocument();
      expect(screen.getByText(/this validator page is restricted to platform admins/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
      expect(screen.queryByText(RAW)).toBeNull();
      expect(api.getPageHistory).not.toHaveBeenCalled();
      expect(api.getPage).toHaveBeenCalledTimes(1);
    },
  );

  it("a 404 rest_no_route says the tool isn't on the server yet", async () => {
    api.getPage.mockRejectedValue(new BccApiError("rest_no_route", RAW, 404, null));
    renderPage();
    expect(await screen.findByText("This tool isn't available on the server yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(api.getPage).toHaveBeenCalledTimes(1);
  });

  it("a 404 bcc_not_found says no page matches", async () => {
    api.getPage.mockRejectedValue(new BccApiError("bcc_not_found", RAW, 404, null));
    renderPage();
    expect(await screen.findByText(ADMIN_ID_NOT_FOUND_COPY)).toBeInTheDocument();
    expect(screen.queryByText("This tool isn't available on the server yet.")).toBeNull();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });
});
