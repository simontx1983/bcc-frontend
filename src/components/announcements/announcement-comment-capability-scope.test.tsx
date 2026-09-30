/**
 * The comment-capability boundary.
 *
 * `can_comment` must be decided **per announcement**, never per validator
 * page. The distinction is not cosmetic: one announcement may be
 * archived, another may have comments switched off, a third may not be
 * published or due yet. A page-scope "may comment" would authorize
 * commenting on all of them.
 *
 * Two layers enforce it:
 *
 *  1. **Shape** — `AnnouncementFeatureCapabilities` (the validator Card
 *     block) has no `can_comment` field at all, so it cannot be wired to
 *     the composer even by mistake. Asserted here on the typed fixtures.
 *
 *  2. **Behaviour** — the composer renders only when the announcement's
 *     OWN gate says `allowed: true`, and absence fails closed.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnnouncementCommentsResponse, CardPermissionEntry } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => <div /> }));

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

const { AnnouncementComments, deniedCopy } = await import(
  "@/components/announcements/AnnouncementComments"
);
const {
  OWNER_CAPABILITIES,
  VISITOR_CAPABILITIES,
  OWNER_ANNOUNCEMENT_CAPABILITIES,
  LIVE_COMMENT,
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

const deny = (reason: string): CardPermissionEntry => ({
  allowed: false,
  unlock_hint: null,
  reason_code: reason,
});

describe("shape — the page-scope block cannot carry a comment gate", () => {
  it("has no can_comment on the validator-page capabilities", () => {
    expect(OWNER_CAPABILITIES).not.toHaveProperty("can_comment");
    expect(VISITOR_CAPABILITIES).not.toHaveProperty("can_comment");
  });

  it("carries only feature-visibility and operator affordances", () => {
    expect(Object.keys(OWNER_CAPABILITIES).sort()).toEqual(["can_create", "can_manage"]);
  });

  it("keeps can_comment on the announcement-scope block", () => {
    expect(OWNER_ANNOUNCEMENT_CAPABILITIES).toHaveProperty("can_comment");
  });
});

describe("behaviour — the gate is read from the announcement's own response", () => {
  it("opens the composer when this announcement grants it", async () => {
    listAnnouncementComments.mockResolvedValue(commentsResponse([LIVE_COMMENT]));
    renderComments();
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
  });

  /**
   * The load-bearing one. A backend that forgets the field must not be
   * read as permission — absence is a closed door, not an open one.
   */
  it("fails closed when can_comment is absent entirely", async () => {
    const withoutGate = {
      items: [LIVE_COMMENT],
      pagination: { next_cursor: null, has_more: false },
    } as unknown as AnnouncementCommentsResponse;
    listAnnouncementComments.mockResolvedValue(withoutGate);

    renderComments();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-comment-disabled")).toBeInTheDocument();
    });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("fails closed when can_comment is malformed rather than a boolean", async () => {
    const bogus = {
      items: [LIVE_COMMENT],
      pagination: { next_cursor: null, has_more: false },
      can_comment: { allowed: "yes" },
    } as unknown as AnnouncementCommentsResponse;
    listAnnouncementComments.mockResolvedValue(bogus);

    renderComments();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-comment-disabled")).toBeInTheDocument();
    });
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  /**
   * Two announcements, two different answers, same viewer and same
   * validator — which is precisely what a page-scope gate could not
   * express.
   */
  it("can close on one announcement while open on another", async () => {
    listAnnouncementComments.mockResolvedValue(
      commentsResponse([LIVE_COMMENT], deny("comments_disabled")),
    );
    const closed = renderComments();
    await waitFor(() => {
      expect(screen.getByTestId("announcement-comment-disabled")).toBeInTheDocument();
    });
    closed.unmount();
    client.clear();

    listAnnouncementComments.mockResolvedValue(commentsResponse([LIVE_COMMENT]));
    renderComments();
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toBeInTheDocument();
    });
  });
});

describe("every expected denial reason has its own copy", () => {
  const cases: Array<[string, RegExp]> = [
    ["auth_required", /Sign in to join/],
    ["comments_disabled", /turned comments off/],
    ["announcement_archived", /archived — the discussion is read-only/],
    ["announcement_unavailable", /isn't open for comment/],
    ["suspended", /account is suspended/],
    ["fraud_locked", /temporarily restricted/],
    ["feature_disabled", /unavailable right now/],
  ];

  it.each(cases)("renders distinct copy for %s", async (reason, pattern) => {
    listAnnouncementComments.mockResolvedValue(
      commentsResponse([LIVE_COMMENT], deny(reason)),
    );
    renderComments(true);
    await waitFor(() => {
      expect(screen.getByTestId("announcement-comment-disabled")).toHaveTextContent(
        pattern,
      );
    });
  });

  it("gives an anonymous viewer the sign-in instruction whatever the reason says", () => {
    expect(deniedCopy(false, "comments_disabled", null)).toMatch(/Sign in to join/);
  });

  it("falls back to a closed message for an unrecognised reason", () => {
    expect(deniedCopy(true, "something_new_from_the_server", null)).toMatch(
      /Comments are closed/,
    );
  });

  it("prefers a server-authored unlock hint over the generic fallback", () => {
    expect(deniedCopy(true, "something_new", "Reach Apprentice to comment.")).toBe(
      "Reach Apprentice to comment.",
    );
  });
});
