/**
 * The capability gate — the single most important property in this slice.
 *
 * The backend does not exist. What keeps that from shipping a broken
 * feature is that EVERY announcement surface is gated on a server-supplied
 * capability block, and nothing else: no client flag, no environment
 * variable, no inference from session presence or page authorship.
 *
 * These tests pin that in both directions — absent block hides the tab
 * entirely and fetches nothing, and a present-but-denying block renders
 * the read surface without the owner controls.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const listAnnouncements = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  listAnnouncements: (...a: unknown[]) => listAnnouncements(...a),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  setAnnouncementPin: vi.fn(),
  getAnnouncementAsClient: vi.fn(),
  listAnnouncementComments: vi.fn(),
  createAnnouncementComment: vi.fn(),
  removeAnnouncementComment: vi.fn(),
}));

const { AnnouncementsPanel } = await import(
  "@/components/announcements/AnnouncementsPanel"
);
const { EntityTabs } = await import("@/components/entity/EntityTabs");
const {
  OWNER_CAPABILITIES,
  VISITOR_CAPABILITIES,
  PUBLISHED_ANNOUNCEMENT,
  announcementListResponse,
} = await import("@/lib/announcements/fixtures");

let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // State-aware, because the panel runs TWO queries (active + archived)
  // and a state-blind mock would render the same row in both sections —
  // which is also what caught a duplicate-render false positive here.
  listAnnouncements.mockImplementation((params: unknown) => {
    const state = (params as { state?: string }).state;
    return Promise.resolve(
      state === "archived"
        ? announcementListResponse([])
        : announcementListResponse([PUBLISHED_ANNOUNCEMENT]),
    );
  });
});

afterEach(() => {
  cleanup();
  client.clear();
});

function renderPanel(capabilities: typeof OWNER_CAPABILITIES) {
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementsPanel
        pageId={1842}
        validatorName="Blacksmith Node"
        capabilities={capabilities}
      />
    </QueryClientProvider>,
  );
}

describe("the tab itself is hidden when the server sent no capability block", () => {
  it("renders no Announcements tab when the panel is null", () => {
    render(
      <EntityTabs
        backingPanel={<div />}
        reviewsPanel={<div />}
        activityPanel={<div />}
        watchersPanel={<div />}
        announcementsPanel={null}
      />,
    );
    expect(screen.queryByRole("tab", { name: "Announcements" })).toBeNull();
  });

  it("renders no Announcements tab when the prop is omitted entirely", () => {
    render(
      <EntityTabs
        backingPanel={<div />}
        reviewsPanel={<div />}
        activityPanel={<div />}
        watchersPanel={<div />}
      />,
    );
    expect(screen.queryByRole("tab", { name: "Announcements" })).toBeNull();
  });

  it("renders the tab only once a panel is supplied", () => {
    render(
      <EntityTabs
        backingPanel={<div />}
        reviewsPanel={<div />}
        activityPanel={<div />}
        watchersPanel={<div />}
        announcementsPanel={<div>panel</div>}
      />,
    );
    expect(screen.queryByRole("tab", { name: "Announcements" })).not.toBeNull();
  });

  /**
   * The gate must be structural, not cosmetic. A hidden tab whose panel
   * still mounted would fire announcement requests at a backend that has
   * no such routes — turning an unbuilt feature into a wall of 404s.
   */
  it("fires no announcement request when the tab is absent", () => {
    render(
      <EntityTabs
        backingPanel={<div />}
        reviewsPanel={<div />}
        activityPanel={<div />}
        watchersPanel={<div />}
        announcementsPanel={null}
      />,
    );
    expect(listAnnouncements).not.toHaveBeenCalled();
  });
});

describe("owner controls come only from the capability block", () => {
  it("shows the composer trigger when can_create is granted", async () => {
    renderPanel(OWNER_CAPABILITIES);
    await waitFor(() => {
      expect(screen.getByTestId("announcement-compose")).toBeInTheDocument();
    });
  });

  it("hides the composer trigger when can_create is denied", async () => {
    renderPanel(VISITOR_CAPABILITIES);
    // The list still renders — this viewer reads, they just cannot post.
    await waitFor(() => {
      expect(screen.getByText("Upgrade to v18 complete")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("announcement-compose")).toBeNull();
  });

  it("hides pin controls when can_pin is denied", async () => {
    renderPanel(VISITOR_CAPABILITIES);
    await waitFor(() => {
      expect(screen.getByText("Upgrade to v18 complete")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /UNPIN|^PIN$/ })).toBeNull();
  });

  it("shows the pin control when can_pin is granted", async () => {
    renderPanel(OWNER_CAPABILITIES);
    await waitFor(() => {
      // PUBLISHED_ANNOUNCEMENT is pinned, so the control reads UNPIN.
      expect(screen.getByRole("button", { name: "UNPIN" })).toBeInTheDocument();
    });
  });
});

describe("read states", () => {
  it("renders an empty state, not a blank panel, when there is nothing posted", async () => {
    listAnnouncements.mockResolvedValue(announcementListResponse([]));
    renderPanel(VISITOR_CAPABILITIES);
    await waitFor(() => {
      expect(screen.getByText(/No announcements from Blacksmith Node yet/)).toBeInTheDocument();
    });
  });

  it("renders a retryable failure with copy keyed on the error code", async () => {
    const { BccApiError } = await import("@/lib/api/types");
    listAnnouncements.mockRejectedValue(
      new BccApiError("bcc_rate_limited", "server prose that must not surface", 429, null),
    );
    renderPanel(VISITOR_CAPABILITIES);
    await waitFor(() => {
      expect(screen.getByText(/Loading too fast/)).toBeInTheDocument();
    });
    // §γ — the server's English is never user-visible.
    expect(screen.queryByText(/server prose that must not surface/)).toBeNull();
  });
});
