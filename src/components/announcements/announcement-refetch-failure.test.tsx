/**
 * A failed LOAD MORE or REFRESH must not erase the discussion or the bar.
 *
 * Driven through a REAL QueryClient with the endpoints mocked, so the
 * flags under test are the ones TanStack actually produces rather than a
 * hand-built combination: a rejected `fetchNextPage()` or a rejected
 * invalidation-driven refetch sets `isError` while `data.pages` still
 * holds everything that loaded.
 *
 * Measured against the old blanket-`isError` components:
 *   - AnnouncementComments after a failed LOAD MORE → every comment AND
 *     the composer (with whatever the viewer had typed) replaced by an
 *     error;
 *   - AnnouncementBar after a failed refresh → the showing announcement
 *     replaced by an error.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
// Type-only: inline `import()` annotations are banned by the lint config.
import type * as AnnouncementEndpoints from "@/lib/api/announcement-endpoints";

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
vi.mock("@/components/identity/Avatar", () => ({
  Avatar: () => <div data-testid="avatar" />,
}));

const listAnnouncementComments = vi.fn();
const getAnnouncementRotator = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", async (orig) => {
  const actual = await orig<typeof AnnouncementEndpoints>();
  return {
    ...actual,
    listAnnouncementComments: (...a: unknown[]) => listAnnouncementComments(...a),
    getAnnouncementRotator: (...a: unknown[]) => getAnnouncementRotator(...a),
  };
});

const { AnnouncementComments } = await import(
  "@/components/announcements/AnnouncementComments"
);
const { AnnouncementBar } = await import("@/components/announcements/AnnouncementBar");
const { LIVE_COMMENT, PUBLISHED_ANNOUNCEMENT, announcementListResponse, commentsResponse } =
  await import("@/lib/announcements/fixtures");
const LIVE_BODY = LIVE_COMMENT.is_removed ? "" : LIVE_COMMENT.body;

const unavailable = () => new BccApiError("bcc_unavailable", "raw server text", 503, null);
const forbidden = () => new BccApiError("bcc_forbidden", "raw server text", 403, null);

let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
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
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
});

function renderComments() {
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementComments announcementId="ann_4471" viewerAuthed />
    </QueryClientProvider>,
  );
}

/** Refetch every active query, swallowing the rejection the test wants. */
async function refreshAll() {
  await act(async () => {
    await client.refetchQueries().catch(() => undefined);
  });
}

describe("AnnouncementComments", () => {
  async function loadFirstPage() {
    listAnnouncementComments.mockResolvedValueOnce(
      commentsResponse([LIVE_COMMENT], undefined, "cursor-2"),
    );
    renderComments();
    await screen.findByText(LIVE_BODY);
  }

  it("a failed LOAD MORE keeps the comments and the composer — and the draft", async () => {
    await loadFirstPage();
    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "half-written reply" },
    });

    listAnnouncementComments.mockRejectedValueOnce(unavailable());
    fireEvent.click(screen.getByRole("button", { name: "LOAD MORE" }));

    await screen.findByRole("alert");
    expect(screen.getByText(LIVE_BODY)).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toHaveValue("half-written reply");
    // Cursor safety: LOAD MORE is withdrawn while the next page is failed.
    expect(screen.queryByRole("button", { name: "LOAD MORE" })).toBeNull();
  });

  it("the load-more Retry re-requests the SAME cursor, not page 1", async () => {
    await loadFirstPage();
    listAnnouncementComments.mockRejectedValueOnce(unavailable());
    fireEvent.click(screen.getByRole("button", { name: "LOAD MORE" }));
    await screen.findByRole("alert");

    listAnnouncementComments.mockResolvedValueOnce(commentsResponse([]));
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    const last = listAnnouncementComments.mock.calls.at(-1)?.[0] as { cursor?: string };
    expect(last.cursor).toBe("cursor-2");
  });

  it("a failed REFRESH keeps the comments and the composer", async () => {
    await loadFirstPage();
    listAnnouncementComments.mockRejectedValue(unavailable());
    await refreshAll();

    await screen.findByRole("alert");
    expect(screen.getByText(LIVE_BODY)).toBeInTheDocument();
    expect(screen.getByLabelText("Add a comment")).toBeInTheDocument();
  });

  it("a FIRST-load failure still shows the error state", async () => {
    listAnnouncementComments.mockRejectedValue(unavailable());
    renderComments();
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("Add a comment")).toBeNull();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("a REFUSED refresh is not kept: the server said no", async () => {
    await loadFirstPage();
    listAnnouncementComments.mockRejectedValue(forbidden());
    await refreshAll();

    await screen.findByRole("alert");
    expect(screen.queryByText(LIVE_BODY)).toBeNull();
  });
});

describe("AnnouncementBar", () => {
  function renderBar() {
    return render(
      <QueryClientProvider client={client}>
        <AnnouncementBar pageId={1842} featureEnabled />
      </QueryClientProvider>,
    );
  }

  it("a failed REFRESH keeps the showing announcement, quietly", async () => {
    getAnnouncementRotator.mockResolvedValueOnce(announcementListResponse([PUBLISHED_ANNOUNCEMENT]));
    renderBar();
    await screen.findByTestId("announcement-bar");

    getAnnouncementRotator.mockRejectedValue(unavailable());
    await refreshAll();

    expect(screen.getByTestId("announcement-bar")).toBeInTheDocument();
    expect(screen.getByText(PUBLISHED_ANNOUNCEMENT.title)).toBeInTheDocument();
    // Supplementary surface (the DiscoverPanel rule): no alert of its own.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a FIRST-load failure still shows the error state", async () => {
    getAnnouncementRotator.mockRejectedValue(unavailable());
    renderBar();
    await screen.findByRole("alert");
    expect(screen.queryByTestId("announcement-bar")).toBeNull();
  });

  it("a REFUSED refresh is not kept: the server said no", async () => {
    getAnnouncementRotator.mockResolvedValueOnce(announcementListResponse([PUBLISHED_ANNOUNCEMENT]));
    renderBar();
    await screen.findByTestId("announcement-bar");

    getAnnouncementRotator.mockRejectedValue(forbidden());
    await refreshAll();

    await screen.findByRole("alert");
    expect(screen.queryByTestId("announcement-bar")).toBeNull();
  });
});
