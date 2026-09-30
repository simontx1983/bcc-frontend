/**
 * The canonical announcement page.
 *
 * Two product properties get pinned here:
 *
 *  1. **Archiving is not deletion.** An archived announcement keeps its
 *     permalink, its original publication date, its body and its whole
 *     discussion. Only new writes close. A test that merely checked for
 *     an "archived" badge would pass on an implementation that hid the
 *     body, so these assert the content is still there.
 *
 *  2. **An edit does not rewrite history.** `updated_at` surfaces only
 *     when it is materially later than publication — bookkeeping drift
 *     of a few seconds is not an edit worth announcing.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => <div /> }));

// Shiki + react-markdown are heavy and already covered by the blog
// renderer's own tests; here we only care THAT the body is rendered
// through the safe renderer, not how it highlights code.
vi.mock("@/components/blog/markdown/BlogMarkdownRenderer", () => ({
  BlogMarkdownRenderer: ({ body }: { body: string }) => (
    <div data-testid="markdown-body">{body}</div>
  ),
}));

const listAnnouncementComments = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  listAnnouncementComments: (...a: unknown[]) => listAnnouncementComments(...a),
  createAnnouncementComment: vi.fn(),
  removeAnnouncementComment: vi.fn(),
  listAnnouncements: vi.fn(),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  setAnnouncementPin: vi.fn(),
  getAnnouncementAsClient: vi.fn(),
}));

const { AnnouncementDetailView, isMateriallyUpdated } = await import(
  "@/components/announcements/AnnouncementDetailView"
);
const {
  PUBLISHED_ANNOUNCEMENT_DETAIL,
  ARCHIVED_ANNOUNCEMENT_DETAIL,
  EDITED_ANNOUNCEMENT_DETAIL,
  LIVE_COMMENT,
  ARCHIVED_COMMENT_GATE,
  commentsResponse,
} = await import("@/lib/announcements/fixtures");

let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  listAnnouncementComments.mockResolvedValue(commentsResponse([LIVE_COMMENT]));
});

afterEach(() => {
  cleanup();
  client.clear();
});

function renderDetail(announcement: typeof PUBLISHED_ANNOUNCEMENT_DETAIL) {
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementDetailView
        announcement={announcement}
        validatorName="Blacksmith Node"
        viewerAuthed
      />
    </QueryClientProvider>,
  );
}

describe("a published announcement", () => {
  it("renders title, summary and body through the safe Markdown renderer", () => {
    renderDetail(PUBLISHED_ANNOUNCEMENT_DETAIL);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Upgrade to v18 complete",
    );
    expect(screen.getByText(/No missed blocks/)).toBeInTheDocument();
    expect(screen.getByTestId("markdown-body")).toHaveTextContent("The validator now runs v18");
  });

  it("shows no archived notice", () => {
    renderDetail(PUBLISHED_ANNOUNCEMENT_DETAIL);
    expect(screen.queryByTestId("announcement-archived-notice")).toBeNull();
  });
});

describe("archiving is a public record, not a deletion", () => {
  beforeEach(() => {
    listAnnouncementComments.mockResolvedValue(
      commentsResponse([LIVE_COMMENT], ARCHIVED_COMMENT_GATE),
    );
  });

  it("still renders the body — the record survives", () => {
    renderDetail(ARCHIVED_ANNOUNCEMENT_DETAIL);
    expect(screen.getByTestId("markdown-body")).toHaveTextContent("Historical notice body.");
  });

  it("keeps the ORIGINAL publication date, not the archive date, as the timestamp", () => {
    renderDetail(ARCHIVED_ANNOUNCEMENT_DETAIL);
    const published = screen.getByText((_, el) => el?.tagName === "TIME" && el.getAttribute("datetime") === "2026-03-02T08:00:00Z");
    expect(published).toBeInTheDocument();
  });

  it("marks the archived state and names when it was archived", () => {
    renderDetail(ARCHIVED_ANNOUNCEMENT_DETAIL);
    expect(screen.getByTestId("announcement-detail-archived-flag")).toBeInTheDocument();
    expect(screen.getByTestId("announcement-archived-notice")).toHaveTextContent(
      /archived on .*It stays here as a record/s,
    );
  });

  it("keeps the existing discussion readable while closing new comments", async () => {
    renderDetail(ARCHIVED_ANNOUNCEMENT_DETAIL);
    await waitFor(() => {
      expect(screen.getByText("Thanks for the heads up.")).toBeInTheDocument();
    });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByTestId("announcement-comment-disabled")).toHaveTextContent(
      /read-only/,
    );
  });
});

describe("edits do not rewrite history", () => {
  it("surfaces an Updated line when the edit is materially later", () => {
    renderDetail(EDITED_ANNOUNCEMENT_DETAIL);
    expect(screen.getByTestId("announcement-updated-at")).toBeInTheDocument();
  });

  it("hides the Updated line for publish-time bookkeeping drift", () => {
    // Fixture's updated_at is 12s after published_at — not an edit.
    renderDetail(PUBLISHED_ANNOUNCEMENT_DETAIL);
    expect(screen.queryByTestId("announcement-updated-at")).toBeNull();
  });

  it("keeps the original published_at even after an edit", () => {
    renderDetail(EDITED_ANNOUNCEMENT_DETAIL);
    const published = screen.getByText(
      (_, el) => el?.tagName === "TIME" && el.getAttribute("datetime") === "2026-09-28T14:00:00Z",
    );
    expect(published).toBeInTheDocument();
  });
});

describe("isMateriallyUpdated", () => {
  it("is false when either timestamp is missing", () => {
    expect(isMateriallyUpdated(null, "2026-09-30T11:00:00Z")).toBe(false);
    expect(isMateriallyUpdated("2026-09-30T11:00:00Z", null)).toBe(false);
  });

  it("is false at or under the one-minute threshold", () => {
    expect(isMateriallyUpdated("2026-09-28T14:00:00Z", "2026-09-28T14:00:12Z")).toBe(false);
    expect(isMateriallyUpdated("2026-09-28T14:00:00Z", "2026-09-28T14:01:00Z")).toBe(false);
  });

  it("is true once the edit is clearly later", () => {
    expect(isMateriallyUpdated("2026-09-28T14:00:00Z", "2026-09-28T14:01:01Z")).toBe(true);
  });

  it("is false for an unparseable timestamp rather than throwing", () => {
    expect(isMateriallyUpdated("not-a-date", "2026-09-28T14:00:00Z")).toBe(false);
  });
});
