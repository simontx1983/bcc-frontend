/**
 * Reporting an announcement.
 *
 * Two properties carry this suite, and both are the kind that a green
 * test can hide rather than prove, so each has a control case:
 *
 *   1. The id on the wire is the BARE INTEGER. The view-model id is
 *      prefixed (`ann_3731`) and `target_id` is a bare numeric BODY field.
 *      A test that only asserts "the mutation was called" would pass with
 *      the prefixed string in it, so these assert the exact body.
 *
 *   2. The control is gated on the server's `allowed` and nothing else.
 *      An absent capability is a denial, not an unknown — which is what
 *      keeps the public list (capability-free for every viewer, by
 *      design) from sprouting a control it has no authority for.
 *
 * It is also asserted NOT to behave like a reaction: no count, no toggle,
 * no persistent "reported" state, and the notice body is untouched by
 * filing one.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "9001", handle: "fixture-a" } },
    status: "authenticated",
  }),
  getSession: async () => ({ user: { id: "9001", handle: "fixture-a" } }),
  signOut: vi.fn(async () => undefined),
}));

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const createContentReport = vi.fn();
vi.mock("@/lib/api/reports-endpoints", () => ({
  createContentReport: (...a: unknown[]) => createContentReport(...a),
}));

const {
  AnnouncementReportControl,
  announcementTargetId,
  canReportAnnouncement,
} = await import("@/components/announcements/AnnouncementReportControl");

import type { AnnouncementCapabilities, CardPermissionEntry } from "@/lib/api/types";

const ALLOW: CardPermissionEntry = { allowed: true, unlock_hint: null, reason_code: null };
const denied = (reason: string): CardPermissionEntry => ({
  allowed: false,
  unlock_hint: null,
  reason_code: reason,
});

function caps(can_report?: CardPermissionEntry): AnnouncementCapabilities {
  return {
    can_edit: ALLOW,
    can_pin: ALLOW,
    can_archive: ALLOW,
    can_manage_comments: ALLOW,
    can_comment: ALLOW,
    ...(can_report === undefined ? {} : { can_report }),
  };
}

const REPORTABLE = {
  id: "ann_3731",
  title: "Upgrade to v18 complete",
  capabilities: caps(ALLOW),
};

beforeAll(() => {
  // Dialog/useId paths touch matchMedia in jsdom, which doesn't ship it.
  if (window.matchMedia === undefined) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  }
});

beforeEach(() => {
  createContentReport.mockReset();
});

afterEach(() => cleanup());

function renderControl(announcement: {
  id: string;
  title: string;
  capabilities?: AnnouncementCapabilities;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementReportControl announcement={announcement} />
    </QueryClientProvider>,
  );
}

const trigger = () => screen.queryByTestId("announcement-report-trigger");

/** Open the modal and choose a reason that needs no comment. */
async function openAndChoose(reason = "Spam") {
  fireEvent.click(trigger()!);
  await screen.findByRole("heading", { name: "Report this announcement" });
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(reason, "i") }));
}

// ─────────────────────────────────────────────────────────────────────
describe("the id on the wire is the bare integer", () => {
  it("strips the ann_ prefix", () => {
    expect(announcementTargetId("ann_3731")).toBe(3731);
  });

  it("accepts an already-bare numeric string", () => {
    expect(announcementTargetId("3731")).toBe(3731);
  });

  it.each([
    ["ann_", 0],
    ["ann_abc", 0],
    ["ann_3731abc", 0],
    ["acmt_3731", 0],
    ["", 0],
    ["ann_0", 0],
    ["ann_-5", 0],
    ["ann_3731.5", 0],
  ])("refuses %s with 0", (input, expected) => {
    expect(announcementTargetId(input)).toBe(expected);
  });

  it("rejects a non-positive or non-integer number", () => {
    expect(announcementTargetId(0)).toBe(0);
    expect(announcementTargetId(-3)).toBe(0);
    expect(announcementTargetId(3731.5)).toBe(0);
    expect(announcementTargetId(3731)).toBe(3731);
  });

  it("SENDS the bare integer, never the prefixed string", async () => {
    createContentReport.mockResolvedValue({ ok: true, report_id: 55, status: "created" });
    renderControl(REPORTABLE);
    await openAndChoose();
    fireEvent.click(screen.getByRole("button", { name: /^submit report$/i }));

    await waitFor(() => expect(createContentReport).toHaveBeenCalledTimes(1));
    const body = createContentReport.mock.calls[0]![0];
    expect(body).toEqual({
      target_kind: "announcement",
      target_id: 3731,
      reason_code: "spam",
    });
    // The mutation control: a prefixed id must never appear anywhere.
    expect(JSON.stringify(body)).not.toContain("ann_");
    expect(typeof body.target_id).toBe("number");
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("the gate reads `allowed` and nothing else", () => {
  it("renders when the server allows it", () => {
    renderControl(REPORTABLE);
    expect(trigger()).not.toBeNull();
  });

  it("OWN CONTENT: hides the control, and files nothing", () => {
    renderControl({ ...REPORTABLE, capabilities: caps(denied("own_content")) });
    expect(trigger()).toBeNull();
    expect(createContentReport).not.toHaveBeenCalled();
  });

  it("an ABSENT can_report is a denial, not an unknown", () => {
    renderControl({ ...REPORTABLE, capabilities: caps(undefined) });
    expect(trigger()).toBeNull();
  });

  it("a capability-free row — i.e. every public list row — offers nothing", () => {
    renderControl({ id: "ann_3731", title: "Upgrade to v18 complete" });
    expect(trigger()).toBeNull();
  });

  it("ignores reason_code: an unrecognised denial still hides it", () => {
    renderControl({ ...REPORTABLE, capabilities: caps(denied("a_reason_invented_later")) });
    expect(trigger()).toBeNull();
  });

  it("an allowed capability with an unusable id still refuses", () => {
    renderControl({ ...REPORTABLE, id: "ann_not_a_number" });
    expect(trigger()).toBeNull();
  });

  it("canReportAnnouncement agrees with what is rendered", () => {
    expect(canReportAnnouncement(REPORTABLE)).toBe(true);
    expect(canReportAnnouncement({ ...REPORTABLE, capabilities: caps(denied("own_content")) })).toBe(false);
    expect(canReportAnnouncement({ id: "ann_1", title: "t" })).toBe(false);
  });

  /**
   * §N7 / contract §5.1 — the discriminator is the HINT, not the reason.
   *
   * Six of the seven denials carry `unlock_hint: null` and must hide;
   * `auth_required` carries sign-in copy and must render visible-disabled.
   * "Render nothing on every denial" is right 6/7 times, which is exactly
   * why it reads as safe — so the one case that teaches gets its own
   * assertions, including that the hint is VISIBLE and not sr-only.
   */
  describe("§N7 visible-gate rule", () => {
    const anonDenial = {
      allowed: false,
      unlock_hint: "Sign in to report this announcement.",
      reason_code: "auth_required",
    };

    it("auth_required renders a DISABLED control carrying the hint", () => {
      renderControl({ ...REPORTABLE, capabilities: caps(anonDenial) });
      const btn = screen.getByTestId("announcement-report-denied");
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByText("Sign in to report this announcement.")).toBeTruthy();
      // Not the live trigger — it cannot open the modal.
      expect(trigger()).toBeNull();
    });

    it("the hint is VISIBLE, not sr-only", () => {
      renderControl({ ...REPORTABLE, capabilities: caps(anonDenial) });
      const hint = screen.getByText("Sign in to report this announcement.");
      expect(hint.className).not.toContain("sr-only");
    });

    it("the hint is the server's string, never invented here", () => {
      renderControl({
        ...REPORTABLE,
        capabilities: caps({ ...anonDenial, unlock_hint: "Server copy, verbatim." }),
      });
      expect(screen.getByText("Server copy, verbatim.")).toBeTruthy();
    });

    it("a denial with a NULL hint stays hidden — the structurally-impossible carve-out", () => {
      renderControl({ ...REPORTABLE, capabilities: caps(denied("own_content")) });
      expect(screen.queryByTestId("announcement-report-denied")).toBeNull();
      expect(trigger()).toBeNull();
    });

    it("keys on the hint, NOT the reason code: an unknown reason WITH a hint still shows", () => {
      renderControl({
        ...REPORTABLE,
        capabilities: caps({
          allowed: false,
          unlock_hint: "Something you can act on.",
          reason_code: "a_reason_invented_later",
        }),
      });
      expect(screen.getByTestId("announcement-report-denied")).toBeTruthy();
    });

    it("an empty-string hint counts as no hint", () => {
      renderControl({
        ...REPORTABLE,
        capabilities: caps({ allowed: false, unlock_hint: "", reason_code: "auth_required" }),
      });
      expect(screen.queryByTestId("announcement-report-denied")).toBeNull();
    });

    it("a capability-free row shows no disabled control either", () => {
      renderControl({ id: "ann_3731", title: "Upgrade to v18 complete" });
      expect(screen.queryByTestId("announcement-report-denied")).toBeNull();
      expect(trigger()).toBeNull();
    });

    it("the disabled control files nothing", () => {
      renderControl({ ...REPORTABLE, capabilities: caps(anonDenial) });
      fireEvent.click(screen.getByTestId("announcement-report-denied"));
      expect(createContentReport).not.toHaveBeenCalled();
    });
  });

  it("ARCHIVED stays reportable — archival closes authoring, not challenge", () => {
    renderControl({
      ...REPORTABLE,
      capabilities: { ...caps(ALLOW), can_edit: denied("announcement_archived"), can_comment: denied("announcement_archived") },
    });
    expect(trigger()).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("outcomes", () => {
  it("SUCCESS shows the submitted state", async () => {
    createContentReport.mockResolvedValue({ ok: true, report_id: 55, status: "created" });
    renderControl(REPORTABLE);
    await openAndChoose();
    fireEvent.click(screen.getByRole("button", { name: /^submit report$/i }));
    expect(await screen.findByText("REPORT SUBMITTED")).toBeTruthy();
  });

  it("DUPLICATE is reported as already on file, not as a new report", async () => {
    createContentReport.mockResolvedValue({ ok: true, report_id: 0, status: "existing" });
    renderControl(REPORTABLE);
    await openAndChoose();
    fireEvent.click(screen.getByRole("button", { name: /^submit report$/i }));
    expect(await screen.findByText("ALREADY ON FILE")).toBeTruthy();
    expect(screen.queryByText("REPORT SUBMITTED")).toBeNull();
  });

  it("SERVER DENIAL surfaces typed copy and RETAINS the viewer's input", async () => {
    // Must be a real BccApiError: `humanizeCode` keys off `err.code` only
    // for instances, and falls back to generic copy otherwise. A plain
    // object would silently exercise the fallback instead of the mapping.
    const { BccApiError } = await import("@/lib/api/types");
    createContentReport.mockRejectedValue(
      new BccApiError("bcc_forbidden", "raw server string the UI must not show", 403, null),
    );
    renderControl(REPORTABLE);
    fireEvent.click(trigger()!);
    await screen.findByRole("heading", { name: "Report this announcement" });
    fireEvent.click(screen.getByRole("radio", { name: /other/i }));
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "context the viewer typed" } });
    fireEvent.click(screen.getByRole("button", { name: /^submit report$/i }));

    expect(
      await screen.findByText("You can't file a report against this content."),
    ).toBeTruthy();
    // Keyed on err.code, never err.message.
    expect(screen.queryByText(/raw server string/)).toBeNull();
    // The typed comment survives the failure.
    expect((box as HTMLTextAreaElement).value).toBe("context the viewer typed");
  });

  it("INVALID INPUT: `other` cannot be submitted without a comment", async () => {
    renderControl(REPORTABLE);
    fireEvent.click(trigger()!);
    await screen.findByRole("heading", { name: "Report this announcement" });
    fireEvent.click(screen.getByRole("radio", { name: /other/i }));

    const submit = screen.getByRole("button", { name: /^submit report$/i });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    // Whitespace is not a comment.
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "real context" } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    expect(createContentReport).not.toHaveBeenCalled();
  });

  it("INVALID INPUT: an over-cap comment cannot be submitted", async () => {
    renderControl(REPORTABLE);
    fireEvent.click(trigger()!);
    await screen.findByRole("heading", { name: "Report this announcement" });
    fireEvent.click(screen.getByRole("radio", { name: /spam/i }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x".repeat(501) } });
    expect(
      (screen.getByRole("button", { name: /^submit report$/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(createContentReport).not.toHaveBeenCalled();
  });

  it("nothing is filed until the viewer submits", async () => {
    renderControl(REPORTABLE);
    await openAndChoose();
    expect(createContentReport).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("a report is not a reaction", () => {
  it("the trigger carries no count and no pressed state", () => {
    renderControl(REPORTABLE);
    const btn = trigger()!;
    expect(btn.getAttribute("aria-pressed")).toBeNull();
    expect(btn.textContent).toBe("REPORT");
    expect(btn.textContent).not.toMatch(/\d/);
  });

  it("names the notice for screen readers, not just 'REPORT'", () => {
    renderControl(REPORTABLE);
    expect(trigger()!.getAttribute("aria-label")).toBe("Report Upgrade to v18 complete");
  });

  it("filing one leaves no persistent 'reported' badge on the control", async () => {
    createContentReport.mockResolvedValue({ ok: true, report_id: 55, status: "created" });
    renderControl(REPORTABLE);
    await openAndChoose();
    fireEvent.click(screen.getByRole("button", { name: /^submit report$/i }));
    await screen.findByText("REPORT SUBMITTED");

    // The trigger is unchanged — no count, no toggle, no "reported" label.
    const btn = trigger()!;
    expect(btn.textContent).toBe("REPORT");
    expect(btn.getAttribute("aria-pressed")).toBeNull();
  });

  it("the submit control is a 44px target", () => {
    renderControl(REPORTABLE);
    expect(trigger()!.getAttribute("style")).toContain("min-height: 44px");
  });
});
