/**
 * Per-announcement mutation authorization.
 *
 * The validator-page `can_manage` opens the management surface. It must
 * never, by itself, make a mutation actionable against a specific
 * announcement — an archived, draft or scheduled row does not inherit
 * permission from the page it happens to sit on.
 *
 * The distinction only matters in one direction, so that is the
 * direction these tests push: page says YES, row says NO or says
 * nothing. A test that only checked the happy path would pass on an
 * implementation that ignored row capabilities entirely.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Announcement } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const listAnnouncements = vi.fn();
const setAnnouncementPin = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  listAnnouncements: (...a: unknown[]) => listAnnouncements(...a),
  setAnnouncementPin: (...a: unknown[]) => setAnnouncementPin(...a),
  createAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  getAnnouncementAsClient: vi.fn(),
  listAnnouncementComments: vi.fn(),
  createAnnouncementComment: vi.fn(),
  removeAnnouncementComment: vi.fn(),
}));

const { AnnouncementsPanel } = await import(
  "@/components/announcements/AnnouncementsPanel"
);
const { AnnouncementOwnerActions } = await import(
  "@/components/announcements/AnnouncementOwnerActions"
);
const {
  OWNER_CAPABILITIES,
  VISITOR_CAPABILITIES,
  PINNABLE_ITEM,
  UNPINNABLE_ITEM,
  ITEM_WITHOUT_CAPABILITIES,
  ITEM_WITH_MALFORMED_CAPABILITIES,
  announcementListResponse,
} = await import("@/lib/announcements/fixtures");

let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  setAnnouncementPin.mockResolvedValue({});
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
});

/** Render the panel with a chosen set of ACTIVE rows. */
function renderPanel(items: Announcement[], pageCaps = OWNER_CAPABILITIES) {
  listAnnouncements.mockImplementation((params: unknown) =>
    Promise.resolve(
      (params as { state?: string }).state === "archived"
        ? announcementListResponse([])
        : announcementListResponse(items),
    ),
  );
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementsPanel
        pageId={1842}
        validatorName="Blacksmith Node"
        capabilities={pageCaps}
      />
    </QueryClientProvider>,
  );
}

const pinButton = (id: string) => screen.getByTestId(`announcement-pin-${id}`);

// 1 ─────────────────────────────────────────────────────────────────
describe("page can_manage does not authorize a row", () => {
  it("leaves pin disabled when the row carries no capability at all", async () => {
    renderPanel([ITEM_WITHOUT_CAPABILITIES]);
    await waitFor(() => {
      expect(pinButton(ITEM_WITHOUT_CAPABILITIES.id)).toBeInTheDocument();
    });
    expect(pinButton(ITEM_WITHOUT_CAPABILITIES.id)).toBeDisabled();
  });

  it("does not mutate when that disabled control is clicked anyway", async () => {
    renderPanel([ITEM_WITHOUT_CAPABILITIES]);
    await waitFor(() => {
      expect(pinButton(ITEM_WITHOUT_CAPABILITIES.id)).toBeInTheDocument();
    });
    fireEvent.click(pinButton(ITEM_WITHOUT_CAPABILITIES.id));
    expect(setAnnouncementPin).not.toHaveBeenCalled();
  });
});

// 2 ─────────────────────────────────────────────────────────────────
describe("two announcements under one validator can disagree", () => {
  it("enables pin on one row and disables it on the other", async () => {
    renderPanel([PINNABLE_ITEM, UNPINNABLE_ITEM]);
    await waitFor(() => {
      expect(pinButton(PINNABLE_ITEM.id)).toBeInTheDocument();
    });
    // Same validator, same operator, same page capability. Different answers.
    expect(pinButton(PINNABLE_ITEM.id)).toBeEnabled();
    expect(pinButton(UNPINNABLE_ITEM.id)).toBeDisabled();
  });

  it("mutates only the row the server allowed", async () => {
    renderPanel([PINNABLE_ITEM, UNPINNABLE_ITEM]);
    await waitFor(() => {
      expect(pinButton(PINNABLE_ITEM.id)).toBeEnabled();
    });

    fireEvent.click(pinButton(UNPINNABLE_ITEM.id));
    expect(setAnnouncementPin).not.toHaveBeenCalled();

    fireEvent.click(pinButton(PINNABLE_ITEM.id));
    await waitFor(() => {
      expect(setAnnouncementPin).toHaveBeenCalledTimes(1);
    });
    // PINNABLE_ITEM is pinned, so the action is an unpin.
    expect(setAnnouncementPin).toHaveBeenCalledWith(1842, PINNABLE_ITEM.id, false);
  });

  it("explains why the denied row cannot be pinned", async () => {
    renderPanel([UNPINNABLE_ITEM]);
    await waitFor(() => {
      expect(pinButton(UNPINNABLE_ITEM.id)).toBeInTheDocument();
    });
    expect(pinButton(UNPINNABLE_ITEM.id)).toHaveAttribute(
      "title",
      "Only published announcements can be pinned.",
    );
  });
});

// 3 ─────────────────────────────────────────────────────────────────
describe("malformed row capability fails closed", () => {
  it("treats a non-boolean allowed as a refusal", async () => {
    renderPanel([ITEM_WITH_MALFORMED_CAPABILITIES]);
    await waitFor(() => {
      expect(pinButton(ITEM_WITH_MALFORMED_CAPABILITIES.id)).toBeInTheDocument();
    });
    expect(pinButton(ITEM_WITH_MALFORMED_CAPABILITIES.id)).toBeDisabled();

    fireEvent.click(pinButton(ITEM_WITH_MALFORMED_CAPABILITIES.id));
    expect(setAnnouncementPin).not.toHaveBeenCalled();
  });
});

// 4 ─────────────────────────────────────────────────────────────────
describe("page capability cannot move a row's answer", () => {
  it("keeps a denied row denied no matter what the page says", async () => {
    const view = renderPanel([UNPINNABLE_ITEM], OWNER_CAPABILITIES);
    await waitFor(() => {
      expect(pinButton(UNPINNABLE_ITEM.id)).toBeDisabled();
    });
    view.unmount();
    client.clear();

    // Re-render with page management REVOKED. The row is unchanged, so
    // its answer must be unchanged too — only the surface goes away.
    renderPanel([UNPINNABLE_ITEM], VISITOR_CAPABILITIES);
    await waitFor(() => {
      expect(screen.getByText(UNPINNABLE_ITEM.title)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(`announcement-pin-${UNPINNABLE_ITEM.id}`)).toBeNull();
  });

  it("hides the whole management surface without page can_manage", async () => {
    renderPanel([PINNABLE_ITEM], VISITOR_CAPABILITIES);
    await waitFor(() => {
      expect(screen.getByText(PINNABLE_ITEM.title)).toBeInTheDocument();
    });
    // The row WOULD allow pinning; the surface is simply not open.
    expect(screen.queryByTestId(`announcement-pin-${PINNABLE_ITEM.id}`)).toBeNull();
  });
});

// 5 ─────────────────────────────────────────────────────────────────
describe("the handler re-checks rather than trusting button state", () => {
  /**
   * Rendered directly with `pending: false` and the disabled attribute
   * stripped, to simulate a stale render or a devtools click. The gate
   * that actually holds is the one inside the handler.
   */
  it("refuses a click that bypasses the disabled attribute", () => {
    const onPin = vi.fn();
    render(
      <AnnouncementOwnerActions
        announcement={ITEM_WITHOUT_CAPABILITIES}
        onPin={onPin}
        pending={false}
      />,
    );
    const button = screen.getByTestId(`announcement-pin-${ITEM_WITHOUT_CAPABILITIES.id}`);
    button.removeAttribute("disabled");
    fireEvent.click(button);
    expect(onPin).not.toHaveBeenCalled();
  });

  it("refuses a bypassed click on a row the server denied", () => {
    const onPin = vi.fn();
    render(
      <AnnouncementOwnerActions
        announcement={UNPINNABLE_ITEM}
        onPin={onPin}
        pending={false}
      />,
    );
    const button = screen.getByTestId(`announcement-pin-${UNPINNABLE_ITEM.id}`);
    button.removeAttribute("disabled");
    fireEvent.click(button);
    expect(onPin).not.toHaveBeenCalled();
  });

  it("still calls through for a row the server allowed", () => {
    const onPin = vi.fn();
    render(
      <AnnouncementOwnerActions announcement={PINNABLE_ITEM} onPin={onPin} pending={false} />,
    );
    fireEvent.click(screen.getByTestId(`announcement-pin-${PINNABLE_ITEM.id}`));
    expect(onPin).toHaveBeenCalledWith(PINNABLE_ITEM.id, false);
  });
});
