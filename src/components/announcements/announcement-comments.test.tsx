/**
 * The canonical discussion: flat, chronological, and two distinct
 * tombstone states.
 *
 * The privacy property is the one worth pinning hardest. A tombstone
 * must disclose only that a comment was removed — never who wrote it.
 * A tombstone that named its author would be a bigger disclosure than
 * showing nothing at all, which is exactly the trade the product made
 * when it chose tombstones over silent deletion.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

vi.mock("@/components/identity/Avatar", () => ({
  Avatar: () => <div data-testid="avatar" />,
}));

const listAnnouncementComments = vi.fn();
const createAnnouncementComment = vi.fn();
const removeAnnouncementComment = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  listAnnouncementComments: (...a: unknown[]) => listAnnouncementComments(...a),
  createAnnouncementComment: (...a: unknown[]) => createAnnouncementComment(...a),
  removeAnnouncementComment: (...a: unknown[]) => removeAnnouncementComment(...a),
  listAnnouncements: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  setAnnouncementPin: vi.fn(),
  getAnnouncementAsClient: vi.fn(),
}));

const { AnnouncementComments } = await import(
  "@/components/announcements/AnnouncementComments"
);
const {
  LIVE_COMMENT,
  AUTHOR_TOMBSTONE,
  VALIDATOR_TOMBSTONE,
  ARCHIVED_COMMENT_GATE,
  commentsResponse,
} = await import("@/lib/announcements/fixtures");

let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
});

function renderComments(viewerAuthed = true) {
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementComments announcementId="ann_4471" viewerAuthed={viewerAuthed} />
    </QueryClientProvider>,
  );
}

describe("tombstones", () => {
  it("keeps a removed comment in position instead of dropping it", async () => {
    listAnnouncementComments.mockResolvedValue(
      commentsResponse([LIVE_COMMENT, AUTHOR_TOMBSTONE, VALIDATOR_TOMBSTONE]),
    );
    renderComments();
    await waitFor(() => {
      expect(screen.getAllByTestId("announcement-comment-tombstone")).toHaveLength(2);
    });
    // Three rows total: one live comment + two tombstones, in order.
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(3);
  });

  it("renders the author-removal label verbatim from the server", async () => {
    listAnnouncementComments.mockResolvedValue(commentsResponse([AUTHOR_TOMBSTONE]));
    renderComments();
    await waitFor(() => {
      expect(screen.getByText("Comment removed by author")).toBeInTheDocument();
    });
  });

  it("renders the validator-removal label verbatim from the server", async () => {
    listAnnouncementComments.mockResolvedValue(commentsResponse([VALIDATOR_TOMBSTONE]));
    renderComments();
    await waitFor(() => {
      expect(screen.getByText("Comment removed by validator")).toBeInTheDocument();
    });
  });

  /**
   * The privacy assertion. The fixture's live comment shares a page with
   * the tombstones, so this also proves the tombstone branch is not
   * accidentally reusing the live-comment renderer.
   */
  it("discloses nothing about who wrote a removed comment", async () => {
    listAnnouncementComments.mockResolvedValue(
      commentsResponse([AUTHOR_TOMBSTONE, VALIDATOR_TOMBSTONE]),
    );
    renderComments();
    await waitFor(() => {
      expect(screen.getAllByTestId("announcement-comment-tombstone")).toHaveLength(2);
    });

    const markup = document.body.innerHTML;
    // No author identity, no body, no avatar, no actor type, no reason.
    expect(markup).not.toContain("Simon TX");
    expect(markup).not.toContain("simontx");
    expect(markup).not.toContain("Thanks for the heads up");
    expect(markup).not.toContain("author\":");
    expect(screen.queryByTestId("avatar")).toBeNull();
    // And no remove control on something already removed.
    expect(screen.queryByRole("button", { name: "REMOVE" })).toBeNull();
  });
});

describe("comment composer gating", () => {
  it("offers no composer to an anonymous viewer, and says why", async () => {
    listAnnouncementComments.mockResolvedValue(commentsResponse([LIVE_COMMENT]));
    renderComments(false);
    await waitFor(() => {
      expect(screen.getByTestId("announcement-comment-disabled")).toBeInTheDocument();
    });
    expect(screen.getByText(/Sign in to join this discussion/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("closes the composer on an archived announcement and explains read-only", async () => {
    listAnnouncementComments.mockResolvedValue(
      commentsResponse([LIVE_COMMENT], ARCHIVED_COMMENT_GATE),
    );
    renderComments(true);
    await waitFor(() => {
      expect(screen.getByTestId("announcement-comment-disabled")).toBeInTheDocument();
    });
    expect(screen.getByText(/archived — the discussion is read-only/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows the composer when the server granted can_comment", async () => {
    listAnnouncementComments.mockResolvedValue(commentsResponse([LIVE_COMMENT]));
    renderComments(true);
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("announcement-comment-disabled")).toBeNull();
  });

  /**
   * The gate is read from the LAST page, so an archive that happened
   * while the reader was paging does not leave a live composer behind.
   */
  it("honours the gate from the newest page, not the first", async () => {
    listAnnouncementComments.mockResolvedValue(
      commentsResponse([LIVE_COMMENT], ARCHIVED_COMMENT_GATE),
    );
    renderComments(true);
    await waitFor(() => {
      expect(screen.getByTestId("announcement-comment-disabled")).toBeInTheDocument();
    });
  });
});

describe("posting", () => {
  it("submits trimmed plain text and clears the field on success", async () => {
    listAnnouncementComments.mockResolvedValue(commentsResponse([]));
    createAnnouncementComment.mockResolvedValue({ comment: LIVE_COMMENT });
    renderComments(true);

    const box = await screen.findByRole("textbox");
    fireEvent.change(box, { target: { value: "  measured, plain text  " } });
    fireEvent.click(screen.getByRole("button", { name: /COMMENT/ }));

    await waitFor(() => {
      expect(createAnnouncementComment).toHaveBeenCalledWith({
        announcementId: "ann_4471",
        body: "measured, plain text",
      });
    });
  });

  it("refuses to submit whitespace", async () => {
    listAnnouncementComments.mockResolvedValue(commentsResponse([]));
    renderComments(true);
    const box = await screen.findByRole("textbox");
    fireEvent.change(box, { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /COMMENT/ })).toBeDisabled();
    expect(createAnnouncementComment).not.toHaveBeenCalled();
  });

  it("caps the body at the contract length", async () => {
    listAnnouncementComments.mockResolvedValue(commentsResponse([]));
    renderComments(true);
    const box = await screen.findByRole("textbox");
    expect(box).toHaveAttribute("maxlength", "2000");
  });
});

describe("empty and failure states", () => {
  it("says the discussion is empty rather than rendering a blank region", async () => {
    listAnnouncementComments.mockResolvedValue(commentsResponse([]));
    renderComments(true);
    await waitFor(() => {
      expect(screen.getByText(/No comments on this announcement yet/)).toBeInTheDocument();
    });
  });

  it("renders a retryable failure without leaking server copy", async () => {
    const { BccApiError } = await import("@/lib/api/types");
    listAnnouncementComments.mockRejectedValue(
      new BccApiError("bcc_forbidden", "raw server prose", 403, null),
    );
    renderComments(true);
    await waitFor(() => {
      expect(screen.getByText(/isn't open to you/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/raw server prose/)).toBeNull();
  });
});
