/**
 * F-345 — review replies. Pins that every control follows a server
 * permission and nothing else, that a double-click cannot send two
 * writes, that a reply has no comment/reaction affordance, and that a
 * pre-#686 row (no `reply`, no `permissions`) renders exactly as before.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://x" } }));

const createReviewReply = vi.fn();
const updateReviewReply = vi.fn();
const deleteReviewReply = vi.fn();
vi.mock("@/lib/api/posts-endpoints", () => ({
  createReviewReply: (...a: unknown[]) => createReviewReply(...a),
  updateReviewReply: (...a: unknown[]) => updateReviewReply(...a),
  deleteReviewReply: (...a: unknown[]) => deleteReviewReply(...a),
}));

import { ReviewReplySection, replyReportTargetId } from "@/components/review/ReviewReplySection";
import { ReviewReplyView } from "@/components/review/ReviewReplyView";
import type { CardPermissionEntry, CardReview, MemberSummary, ReviewReply } from "@/lib/api/types";

const allow: CardPermissionEntry = { allowed: true, unlock_hint: null, reason_code: null };
const deny = (unlock_hint: string | null = null): CardPermissionEntry => ({
  allowed: false,
  unlock_hint,
  reason_code: "not_applicable",
});

const member = (handle: string): MemberSummary =>
  ({ user_id: 7, handle, display_name: handle, avatar_url: "" }) as unknown as MemberSummary;

/** Full reply permissions; anything not named is a structural denial. */
const perms = (p: Partial<ReviewReply["permissions"]> = {}): ReviewReply["permissions"] => ({
  can_edit: deny(),
  can_delete: deny(),
  can_report: deny(),
  ...p,
});

const reply = (over: Partial<ReviewReply> = {}): ReviewReply => ({
  id: 9,
  body: "Thanks — fixed the signing gap.",
  author: member("acme"),
  posted_at: "2026-11-10T12:00:00Z",
  edited_at: null,
  feed_id: "feed_321",
  permissions: perms(),
  ...over,
});

const review = (over: Partial<CardReview> = {}): CardReview => ({
  id: 88,
  grade: "A",
  text: "Reliable validator.",
  posted_at_label: "3 days ago",
  author: member("bob"),
  ...over,
});

let qc: QueryClient;
const renderSection = (r: CardReview) =>
  render(
    <QueryClientProvider client={qc}>
      <ReviewReplySection review={r} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  createReviewReply.mockReset();
  updateReviewReply.mockReset();
  deleteReviewReply.mockReset();
});
afterEach(cleanup);

describe("F-345 review replies", () => {
  it("a pre-#686 row (no reply, no permissions) renders nothing", () => {
    const { container } = renderSection(review());
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the composer only on can_reply.allowed", () => {
    renderSection(review({ reply: null, permissions: { can_reply: deny() } }));
    expect(screen.queryByRole("button", { name: "REPLY" })).toBeNull();
    cleanup();
    renderSection(review({ reply: null, permissions: { can_reply: allow } }));
    expect(screen.getByRole("button", { name: "REPLY" })).toBeInTheDocument();
  });

  it("submit stays disabled until there is text, and over the 1000-char cap", () => {
    renderSection(review({ reply: null, permissions: { can_reply: allow } }));
    fireEvent.click(screen.getByRole("button", { name: "REPLY" }));
    const post = screen.getByRole("button", { name: "POST REPLY" });
    expect(post).toBeDisabled();
    const box = screen.getByLabelText("Your reply");
    fireEvent.change(box, { target: { value: "   " } });
    expect(post).toBeDisabled();
    fireEvent.change(box, { target: { value: "x".repeat(1001) } });
    expect(post).toBeDisabled();
    fireEvent.change(box, { target: { value: "Thanks for the review." } });
    expect(post).toBeEnabled();
  });

  it("a double-click posts ONE reply, trimmed, and the button disables while in flight", async () => {
    let resolve: (v: unknown) => void = () => {};
    createReviewReply.mockImplementation(() => new Promise((r) => (resolve = r)));
    renderSection(review({ reply: null, permissions: { can_reply: allow } }));
    fireEvent.click(screen.getByRole("button", { name: "REPLY" }));
    fireEvent.change(screen.getByLabelText("Your reply"), { target: { value: "  Thanks.  " } });
    const post = screen.getByRole("button", { name: "POST REPLY" });
    fireEvent.click(post);
    fireEvent.click(post);
    await waitFor(() => expect(screen.getByRole("button", { name: "SAVING…" })).toBeDisabled());
    expect(createReviewReply).toHaveBeenCalledTimes(1);
    expect(createReviewReply).toHaveBeenCalledWith(88, { body: "Thanks." });
    resolve({ reply: reply() });
    await waitFor(() => expect(screen.queryByLabelText("Your reply")).toBeNull());
  });

  it("server error copy is keyed on the code", async () => {
    const { BccApiError } = await import("@/lib/api/types");
    createReviewReply.mockRejectedValue(new BccApiError("bcc_conflict", "RAW_LEAK", 409, null));
    renderSection(review({ reply: null, permissions: { can_reply: allow } }));
    fireEvent.click(screen.getByRole("button", { name: "REPLY" }));
    fireEvent.change(screen.getByLabelText("Your reply"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "POST REPLY" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You’ve already replied to this review.");
  });

  it("Edit / Delete / Report each follow their own reply permission", () => {
    renderSection(
      review({
        reply: reply({ permissions: perms({ can_edit: allow, can_delete: allow, can_report: deny() }) }),
      }),
    );
    expect(screen.getByRole("button", { name: "EDIT" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DELETE" })).toBeInTheDocument();
    // Structural denial (null hint) hides Report entirely.
    expect(screen.queryByRole("button", { name: "Report this reply" })).toBeNull();
  });

  it("change of owner: the old author may delete but not edit", () => {
    renderSection(
      review({ reply: reply({ permissions: perms({ can_edit: deny(), can_delete: allow, can_report: deny() }) }) }),
    );
    expect(screen.queryByRole("button", { name: "EDIT" })).toBeNull();
    expect(screen.getByRole("button", { name: "DELETE" })).toBeInTheDocument();
  });

  it("Report: enabled on can_report; disabled with the hint when the viewer can unlock it", () => {
    renderSection(review({ reply: reply({ permissions: perms({ can_report: allow }) }) }));
    expect(screen.getByRole("button", { name: "Report this reply" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "EDIT" })).toBeNull();
    cleanup();
    renderSection(review({ reply: reply({ permissions: perms({ can_report: { allowed: false, unlock_hint: "Sign in to report.", reason_code: "sign_in_required" } }) }) }));
    expect(screen.getByRole("button", { name: "Report this reply" })).toBeDisabled();
    expect(screen.getByText("Sign in to report.")).toBeInTheDocument();
  });

  it("a reply carries no comment, reaction or reply-to-reply affordance", () => {
    renderSection(
      review({
        reply: reply({ permissions: perms({ can_edit: allow, can_delete: allow, can_report: allow }) }),
        permissions: { can_reply: allow },
      }),
    );
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent);
    expect(names).toEqual(["EDIT", "DELETE", "Report this reply"]);
  });

  it("edit sends PATCH with the new body; Save is disabled while unchanged", async () => {
    updateReviewReply.mockResolvedValue({ reply: reply({ body: "Updated.", edited_at: "2026-11-11T12:00:00Z" }) });
    renderSection(review({ reply: reply({ permissions: perms({ can_edit: allow }) }) }));
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    const save = screen.getByRole("button", { name: "SAVE" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Your reply"), { target: { value: "Updated." } });
    fireEvent.click(save);
    await waitFor(() => expect(updateReviewReply).toHaveBeenCalledWith(88, { body: "Updated." }));
  });

  it("PATCH 403 means you no longer answer for the page", async () => {
    const { BccApiError } = await import("@/lib/api/types");
    updateReviewReply.mockRejectedValue(new BccApiError("bcc_forbidden", "RAW_LEAK", 403, null));
    renderSection(review({ reply: reply({ permissions: perms({ can_edit: allow }) }) }));
    fireEvent.click(screen.getByRole("button", { name: "EDIT" }));
    fireEvent.change(screen.getByLabelText("Your reply"), { target: { value: "Changed." } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You can no longer edit this reply.");
  });

  it("the view shows the replier and marks an edited reply", () => {
    render(<ReviewReplyView reply={reply({ edited_at: "2026-11-11T12:00:00Z" })} surface="paper" />);
    expect(screen.getByText("@ACME")).toBeInTheDocument();
    expect(screen.getByText(/^EDITED /)).toBeInTheDocument();
    expect(screen.getByText("Thanks — fixed the signing gap.")).toBeInTheDocument();
  });

  it("compact view has no links (it sits inside the About row link)", () => {
    const { container } = render(<ReviewReplyView reply={reply()} surface="panel" compact />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("div, p")).toBeNull();
  });

  it("report target is the bare number from feed_<n>", () => {
    expect(replyReportTargetId("feed_321")).toBe(321);
    expect(replyReportTargetId("321")).toBe(0);
    expect(replyReportTargetId("feed_32x")).toBe(0);
    expect(replyReportTargetId("feed_0")).toBe(0);
  });
});
