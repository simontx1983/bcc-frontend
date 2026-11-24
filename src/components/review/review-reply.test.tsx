/**
 * F-345 — review replies. Pins that every control follows a server
 * permission and nothing else, that a double-click cannot send two
 * writes, that a reply has no comment/reaction affordance, and that a
 * pre-#686 row (no `reply`, no `permissions`) renders exactly as before.
 *
 * Also SA5's page-attributed reply (`author_kind: "page"`: the page's
 * name, crest and card link, never person fields) and v1.174's
 * `viewer_stale_reply` (the viewer's own reply after a hand-over).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type InfiniteData } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { pageReplyHref, ReviewReplyView } from "@/components/review/ReviewReplyView";
import { CARD_REVIEWS_QUERY_KEY_ROOT } from "@/hooks/useCardTabs";
import type {
  CardPermissionEntry,
  CardReview,
  CardReviewsResponse,
  MemberSummary,
  ReviewReply,
  ReviewReplyMember,
  ReviewReplyPage,
  ReviewReplyPageAuthor,
} from "@/lib/api/types";

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

const reply = (over: Partial<ReviewReplyMember> = {}): ReviewReplyMember => ({
  id: 9,
  body: "Thanks — fixed the signing gap.",
  author: member("acme"),
  posted_at: "2026-11-10T12:00:00Z",
  edited_at: null,
  feed_id: "feed_321",
  permissions: perms(),
  ...over,
});

const PAGE: ReviewReplyPageAuthor = {
  id: 501,
  card_kind: "validator",
  name: "Acme Validator",
  handle: "acme-validator",
  avatar_url: "",
};

/** SA5's page variant: `page`, and no `author` key at all. */
const pageReply = (over: Partial<ReviewReplyPage> = {}): ReviewReplyPage => ({
  id: 10,
  body: "Thanks for the report. Fixed.",
  author_kind: "page",
  page: PAGE,
  posted_at: "2026-11-10T12:00:00Z",
  edited_at: null,
  feed_id: "feed_322",
  permissions: perms(),
  ...over,
});

const notAuthor: CardPermissionEntry = { allowed: false, unlock_hint: null, reason_code: "not_author" };

/** v1.174: the viewer's own reply after the page changed hands. */
const staleReply = (over: Partial<ReviewReplyMember> = {}): ReviewReplyMember =>
  reply({
    id: 11,
    body: "My old answer.",
    author: member("oldop"),
    permissions: perms({
      can_edit: { allowed: false, unlock_hint: null, reason_code: "page_changed_hands" },
      can_delete: allow,
      can_report: { allowed: false, unlock_hint: null, reason_code: "own_reply" },
    }),
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

// ConfirmDialog (the delete confirm) reads the reduced-motion query.
beforeAll(() => {
  if (typeof window.matchMedia !== "function") {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false, media: query, onchange: null,
        addListener: () => undefined, removeListener: () => undefined,
        addEventListener: () => undefined, removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
});

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

describe("SA5 page-attributed replies", () => {
  it("shows the page as the responder, linked by card_kind + handle, with no person fields", () => {
    const { container } = render(<ReviewReplyView reply={pageReply()} surface="paper" />);
    expect(screen.getByRole("link", { name: "Acme Validator" })).toHaveAttribute("href", "/v/acme-validator");
    expect(container.querySelector('a[href^="/u/"]')).toBeNull();
    expect(container.textContent).not.toContain("@");
    expect(screen.getByText("Thanks for the report. Fixed.")).toBeInTheDocument();
  });

  it("each page kind links to its own card route; an unknown kind renders unlinked", () => {
    expect(pageReplyHref(PAGE)).toBe("/v/acme-validator");
    expect(pageReplyHref({ ...PAGE, card_kind: "project" })).toBe("/p/acme-validator");
    expect(pageReplyHref({ ...PAGE, card_kind: "creator" })).toBe("/c/acme-validator");
    expect(pageReplyHref({ ...PAGE, card_kind: "hall" as never })).toBeNull();
    render(<ReviewReplyView reply={pageReply({ page: { ...PAGE, card_kind: "hall" as never } })} surface="paper" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Acme Validator")).toBeInTheDocument();
  });

  it("shows the page's crest beside its name", () => {
    const { container } = render(
      <ReviewReplyView reply={pageReply({ page: { ...PAGE, avatar_url: "https://cdn.example.test/crest.png" } })} surface="paper" />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(decodeURIComponent(img?.getAttribute("src") ?? "")).toContain("https://cdn.example.test/crest.png");
  });

  it("no author_kind (today's backend) reads as a member reply", () => {
    render(<ReviewReplyView reply={reply()} surface="paper" />);
    expect(screen.getByRole("link", { name: "@ACME" })).toHaveAttribute("href", "/u/acme");
  });

  it("compact page reply has no links either", () => {
    const { container } = render(<ReviewReplyView reply={pageReply()} surface="panel" compact />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("div, p")).toBeNull();
    expect(screen.getByText("Acme Validator")).toBeInTheDocument();
  });

  it("uses the page reply's permissions as sent: Report on, no Edit or Delete", () => {
    renderSection(
      review({ reply: pageReply({ permissions: perms({ can_edit: notAuthor, can_delete: notAuthor, can_report: allow }) }) }),
    );
    expect(screen.getByRole("button", { name: "Report this reply" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "EDIT" })).toBeNull();
    expect(screen.queryByRole("button", { name: "DELETE" })).toBeNull();
  });
});

describe("v1.174 viewer_stale_reply", () => {
  it("shows the viewer's own handed-over reply as not public, with Delete only", () => {
    renderSection(review({ reply: null, viewer_stale_reply: staleReply() }));
    expect(screen.getByText(/YOUR EARLIER REPLY · NO LONGER SHOWN PUBLICLY/)).toBeInTheDocument();
    expect(screen.getByText("My old answer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete your earlier reply" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "EDIT" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Report this reply" })).toBeNull();
  });

  it("Delete follows its can_delete", () => {
    renderSection(review({ reply: null, viewer_stale_reply: staleReply({ permissions: perms() }) }));
    expect(screen.getByText("My old answer.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete your earlier reply" })).toBeNull();
  });

  it("sits beside the page's current reply", () => {
    renderSection(review({ reply: pageReply(), viewer_stale_reply: staleReply() }));
    expect(screen.getAllByTestId("review-reply")).toHaveLength(2);
    expect(screen.getByText("Acme Validator")).toBeInTheDocument();
  });

  it("deleting it clears only viewer_stale_reply; the page's reply stays", async () => {
    deleteReviewReply.mockResolvedValue({ deleted: true });
    const row = review({ reply: pageReply(), viewer_stale_reply: staleReply() });
    const key = [...CARD_REVIEWS_QUERY_KEY_ROOT, "validator_card", 501];
    qc.setQueryData<InfiniteData<CardReviewsResponse>>(key, {
      pages: [{ items: [row], pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 } }],
      pageParams: [1],
    });
    renderSection(row);
    fireEvent.click(screen.getByRole("button", { name: "Delete your earlier reply" }));
    expect(screen.getByRole("dialog", { name: "Delete your earlier reply?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "DELETE" }));
    await waitFor(() => expect(deleteReviewReply).toHaveBeenCalledWith(88));
    await waitFor(() => {
      const cached = qc.getQueryData<InfiniteData<CardReviewsResponse>>(key)?.pages[0]?.items[0];
      expect(cached?.viewer_stale_reply).toBeNull();
      expect(cached?.reply).toEqual(pageReply());
    });
  });
});

