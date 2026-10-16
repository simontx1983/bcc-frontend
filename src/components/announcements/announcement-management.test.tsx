/**
 * The drafts and scheduled surface — the route back to work the operator
 * saved and could not previously reach.
 *
 * These rows are UNPUBLISHED. The properties that matter most here are
 * not the happy path but the gates: who can see them, that a failed
 * action keeps the row and says what happened, and that nothing on this
 * surface can destroy a draft.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { OwnerAnnouncementListItem } from "@/lib/api/types";

let sessionUserId = "9001";
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: sessionUserId, handle: "fixture-a" } },
    status: "authenticated",
  }),
  getSession: async () => ({ user: { id: sessionUserId, handle: "fixture-a" } }),
  signOut: vi.fn(async () => undefined),
}));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const listOwnerAnnouncements = vi.fn();
const publishAnnouncement = vi.fn();
const updateAnnouncement = vi.fn();
const getAnnouncementAsClient = vi.fn();
vi.mock("@/lib/api/announcement-endpoints", () => ({
  listOwnerAnnouncements: (...a: unknown[]) => listOwnerAnnouncements(...a),
  publishAnnouncement: (...a: unknown[]) => publishAnnouncement(...a),
  updateAnnouncement: (...a: unknown[]) => updateAnnouncement(...a),
  listAnnouncements: vi.fn(),
  createAnnouncement: vi.fn(),
  archiveAnnouncement: vi.fn(),
  setAnnouncementPin: vi.fn(),
  getAnnouncementAsClient: (...a: unknown[]) => getAnnouncementAsClient(...a),
  listAnnouncementComments: vi.fn(),
  createAnnouncementComment: vi.fn(),
  removeAnnouncementComment: vi.fn(),
}));

const { AnnouncementManagement } = await import(
  "@/components/announcements/AnnouncementManagement"
);
const { BccApiError } = await import("@/lib/api/types");
const { OWNER_ANNOUNCEMENT_CAPABILITIES, PUBLISHED_ANNOUNCEMENT } = await import(
  "@/lib/announcements/fixtures"
);

const PAGE_ID = 77;

const ALLOW = { allowed: true, unlock_hint: null, reason_code: null };
const DENY = (r: string) => ({ allowed: false, unlock_hint: null, reason_code: r });

/** An unpublished row as the owner list really returns one. */
function ownerRow(
  id: string,
  title: string,
  overrides: Partial<OwnerAnnouncementListItem> = {},
): OwnerAnnouncementListItem {
  return {
    ...PUBLISHED_ANNOUNCEMENT,
    id,
    title,
    summary: `${title} summary`,
    is_pinned: false,
    published_at: null,
    capabilities: {
      ...OWNER_ANNOUNCEMENT_CAPABILITIES,
      // The measured shape for an unpublished row.
      can_pin: DENY("announcement_not_published"),
      can_comment: DENY("announcement_unavailable"),
      can_edit: ALLOW,
    },
    ...overrides,
  } as OwnerAnnouncementListItem;
}

const page = (items: OwnerAnnouncementListItem[]) => ({
  items,
  pagination: { next_cursor: null, has_more: false },
});

let client: QueryClient;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.scrollTo = () => {};
});

beforeEach(() => {
  sessionUserId = "9001";
  listOwnerAnnouncements.mockReset();
  publishAnnouncement.mockReset();
  updateAnnouncement.mockReset();
  publishAnnouncement.mockResolvedValue({});
  getAnnouncementAsClient.mockReset();
  // Reopening fetches DETAIL, because only detail carries the body.
  getAnnouncementAsClient.mockImplementation((_pageId: number, id: string) =>
    Promise.resolve({
      ...PUBLISHED_ANNOUNCEMENT,
      id,
      title: "Half-written notice",
      summary: "Half-written notice summary",
      body: "The body only detail carries.",
      status: "draft",
      capabilities: OWNER_ANNOUNCEMENT_CAPABILITIES,
    }),
  );
  updateAnnouncement.mockResolvedValue({});
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
});

/** Drafts and scheduled answered per `status`, as the route does. */
function serve(drafts: OwnerAnnouncementListItem[], scheduled: OwnerAnnouncementListItem[] = []) {
  listOwnerAnnouncements.mockImplementation((params: unknown) => {
    const status = (params as { status?: string }).status;
    if (status === "draft") return Promise.resolve(page(drafts));
    if (status === "scheduled") return Promise.resolve(page(scheduled));
    return Promise.resolve(page([]));
  });
}

function mount(canManage = true) {
  return render(
    <QueryClientProvider client={client}>
      <AnnouncementManagement pageId={PAGE_ID} canManage={canManage} />
    </QueryClientProvider>,
  );
}

describe("operator-only, enforced on the query as well as the render", () => {
  it("renders nothing and asks for nothing without can_manage", async () => {
    serve([ownerRow("ann_1", "Private draft")]);
    mount(false);

    await waitFor(() => expect(listOwnerAnnouncements).not.toHaveBeenCalled());
    expect(screen.queryByTestId("announcement-management")).toBeNull();
    // The private row must not be anywhere in the document.
    expect(screen.queryByText("Private draft")).toBeNull();
  });

  it("asks only for the two unpublished buckets", async () => {
    serve([ownerRow("ann_1", "D")], [ownerRow("ann_2", "S")]);
    mount();

    await waitFor(() => expect(screen.getByText("D")).toBeInTheDocument());
    const statuses = listOwnerAnnouncements.mock.calls.map(
      (c) => (c[0] as { status: string }).status,
    );
    expect(new Set(statuses)).toEqual(new Set(["draft", "scheduled"]));
  });
});

describe("the rows a stranded draft comes back through", () => {
  it("lists drafts and scheduled with their state", async () => {
    serve(
      [ownerRow("ann_1", "A stranded draft")],
      [ownerRow("ann_2", "A scheduled notice", {
        published_at: "2026-12-01T09:00:00Z",
      })],
    );
    mount();

    await waitFor(() => expect(screen.getByText("A stranded draft")).toBeInTheDocument());
    expect(screen.getByTestId("announcement-status-ann_1")).toHaveTextContent("DRAFT");
    expect(screen.getByTestId("announcement-status-ann_2")).toHaveTextContent("SCHEDULED");
    // The scheduled one shows WHEN, which is the point of viewing it.
    expect(screen.getByTestId("announcement-scheduled-for-ann_2")).toBeInTheDocument();
  });

  it("says so plainly when there is nothing unpublished", async () => {
    serve([], []);
    mount();
    await waitFor(() =>
      expect(screen.getByText(/Nothing unpublished/)).toBeInTheDocument(),
    );
  });
});

describe("publishing a draft", () => {
  it("calls the publish route for that row", async () => {
    serve([ownerRow("ann_9", "Ready to go")]);
    mount();
    await waitFor(() => expect(screen.getByText("Ready to go")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("announcement-publish-ann_9"));
    await waitFor(() => expect(publishAnnouncement).toHaveBeenCalledTimes(1));
    expect(publishAnnouncement.mock.calls[0]?.[1]).toBe("ann_9");
  });

  it("keeps the row and explains when publishing fails", async () => {
    serve([ownerRow("ann_9", "Ready to go")]);
    publishAnnouncement.mockRejectedValue(
      new BccApiError("bcc_forbidden", "RAW SERVER TEXT", 403, null),
    );
    mount();
    await waitFor(() => expect(screen.getByText("Ready to go")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("announcement-publish-ann_9"));

    // Typed copy keyed on the code, never `err.message`, and the row
    // stays — a failed publish must not look like a vanished draft.
    await waitFor(() =>
      expect(screen.getByTestId("announcement-action-error-ann_9")).toHaveTextContent(
        /not the verified operator/i,
      ),
    );
    expect(screen.getByText("Ready to go")).toBeInTheDocument();
    expect(screen.queryByText(/RAW SERVER TEXT/)).toBeNull();
  });

  it("refuses to publish a row whose own capability denies editing", async () => {
    serve([
      ownerRow("ann_9", "Not yours", {
        capabilities: {
          ...OWNER_ANNOUNCEMENT_CAPABILITIES,
          can_edit: DENY("not_claimer"),
        },
      } as Partial<OwnerAnnouncementListItem>),
    ]);
    mount();
    await waitFor(() => expect(screen.getByText("Not yours")).toBeInTheDocument());

    const btn = screen.getByTestId("announcement-publish-ann_9");
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(publishAnnouncement).not.toHaveBeenCalled();
  });
});

/**
 * `can_publish` (bcc-trust #343, contract v1.81) is the server's own
 * answer about publishing. It is not on every deployed backend yet, and
 * `isAllowed` fails closed on a missing key, so reading it
 * unconditionally would hide Publish against a backend that has not
 * shipped it.
 *
 * The rule: the server's answer wins whenever it sent one — including a
 * denial — and the older inference applies only in its absence.
 */
describe("publish permission prefers the server's own answer", () => {
  it("honours can_publish when the server sends it", async () => {
    serve([
      ownerRow("ann_7", "Allowed by the server", {
        capabilities: {
          ...OWNER_ANNOUNCEMENT_CAPABILITIES,
          can_edit: ALLOW,
          can_publish: ALLOW,
        },
      } as Partial<OwnerAnnouncementListItem>),
    ]);
    mount();
    await waitFor(() => expect(screen.getByText("Allowed by the server")).toBeInTheDocument());
    expect(screen.getByTestId("announcement-publish-ann_7")).toBeEnabled();
  });

  it("honours a can_publish DENIAL even where can_edit allows", async () => {
    // The two diverge on exactly the states that matter: a published row
    // is editable and not publishable. Inferring would draw Publish on it.
    serve([
      ownerRow("ann_8", "Editable but not publishable", {
        capabilities: {
          ...OWNER_ANNOUNCEMENT_CAPABILITIES,
          can_edit: ALLOW,
          can_publish: DENY("announcement_already_published"),
        },
      } as Partial<OwnerAnnouncementListItem>),
    ]);
    mount();
    await waitFor(() =>
      expect(screen.getByText("Editable but not publishable")).toBeInTheDocument(),
    );

    const btn = screen.getByTestId("announcement-publish-ann_8");
    expect(btn).toBeDisabled();
    // A new reason code must not arrive as a disabled control with no copy.
    expect(btn).toHaveAttribute("title", "This is already published.");
    fireEvent.click(btn);
    expect(publishAnnouncement).not.toHaveBeenCalled();
  });

  it("carries copy for every reason code the new capability can send", async () => {
    for (const [code, copy] of [
      ["announcement_already_published", "This is already published."],
      ["announcement_archived", "Archived announcements can't be published."],
      ["not_claimer", "You're not the verified operator of this validator."],
    ] as const) {
      cleanup();
      client.clear();
      serve([
        ownerRow(`ann_${code}`, `Row ${code}`, {
          capabilities: {
            ...OWNER_ANNOUNCEMENT_CAPABILITIES,
            can_edit: ALLOW,
            can_publish: DENY(code),
          },
        } as Partial<OwnerAnnouncementListItem>),
      ]);
      mount();
      await waitFor(() => expect(screen.getByText(`Row ${code}`)).toBeInTheDocument());
      expect(screen.getByTestId(`announcement-publish-ann_${code}`)).toHaveAttribute(
        "title",
        copy,
      );
    }
  });

  it("falls back to the older inference only when the key is ABSENT", async () => {
    // A backend without #343 must still be able to publish a draft.
    const caps = { ...OWNER_ANNOUNCEMENT_CAPABILITIES, can_edit: ALLOW } as Record<string, unknown>;
    delete caps["can_publish"];
    serve([
      ownerRow("ann_6", "Older backend", {
        capabilities: caps,
      } as unknown as Partial<OwnerAnnouncementListItem>),
    ]);
    mount();
    await waitFor(() => expect(screen.getByText("Older backend")).toBeInTheDocument());
    expect(screen.getByTestId("announcement-publish-ann_6")).toBeEnabled();
  });
});

describe("reopening and editing", () => {
  it("opens a draft prefilled with what was written", async () => {
    serve([ownerRow("ann_3", "Half-written notice")]);
    mount();
    await waitFor(() => expect(screen.getByText("Half-written notice")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("announcement-edit-ann_3"));
    // The form waits for detail rather than opening with an empty body,
    // which would invite saving over the operator's own words.
    expect(await screen.findByLabelText("TITLE")).toHaveValue("Half-written notice");
    expect(screen.getByLabelText("BODY (MARKDOWN)")).toHaveValue(
      "The body only detail carries.",
    );
    expect(screen.getByLabelText("SUMMARY (REQUIRED)")).toHaveValue(
      "Half-written notice summary",
    );
  });

  it("saves an edit without sending status — PATCH refuses it", async () => {
    serve([ownerRow("ann_3", "Half-written notice")]);
    mount();
    await waitFor(() => expect(screen.getByText("Half-written notice")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("announcement-edit-ann_3"));
    await screen.findByLabelText("TITLE");
    fireEvent.change(screen.getByLabelText("TITLE"), { target: { value: "Reworked" } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE DRAFT" }));

    await waitFor(() => expect(updateAnnouncement).toHaveBeenCalledTimes(1));
    const sent = updateAnnouncement.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(sent).toMatchObject({ title: "Reworked" });
    // `status` on PATCH answers 400 "Nothing to change" and leaves the
    // row where it was, so an edit must never carry it.
    expect(sent).not.toHaveProperty("status");
    expect(sent).not.toHaveProperty("mode");
  });

  it("offers reschedule on a scheduled row and sends publish_at in wire format", async () => {
    serve([], [ownerRow("ann_4", "Scheduled notice", {
      published_at: "2026-12-01T09:00:00Z",
    })]);
    mount();
    await waitFor(() => expect(screen.getByText("Scheduled notice")).toBeInTheDocument());

    expect(screen.getByTestId("announcement-edit-ann_4")).toHaveTextContent(
      "EDIT / RESCHEDULE",
    );
    fireEvent.click(screen.getByTestId("announcement-edit-ann_4"));
    await screen.findByLabelText("PUBLICATION TIME");

    const future = new Date(Date.now() + 3 * 86_400_000);
    const p = (n: number) => String(n).padStart(2, "0");
    fireEvent.change(screen.getByLabelText("PUBLICATION TIME"), {
      target: {
        value:
          `${future.getFullYear()}-${p(future.getMonth() + 1)}-${p(future.getDate())}` +
          `T${p(future.getHours())}:${p(future.getMinutes())}`,
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "SAVE CHANGES" }));

    await waitFor(() => expect(updateAnnouncement).toHaveBeenCalledTimes(1));
    const sent = updateAnnouncement.mock.calls[0]?.[2] as { publish_at?: string };
    // `Y-m-d H:i:s`, not ISO-8601 — the route refuses the other.
    expect(sent.publish_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("nothing here can destroy a draft", () => {
  it("offers no discard or delete control", async () => {
    serve([ownerRow("ann_5", "Fragile draft")]);
    mount();
    await waitFor(() => expect(screen.getByText("Fragile draft")).toBeInTheDocument());

    // ⛔ Archive would 200 on a never-published draft and remove it from
    // EVERY list surface, one-way. There is no DELETE route either. So
    // the surface must not offer an action that loses the draft.
    for (const word of [/discard/i, /delete/i, /archive/i, /remove/i]) {
      expect(screen.queryByRole("button", { name: word })).toBeNull();
    }
  });

  it("tells the operator drafts cannot be deleted rather than staying silent", async () => {
    serve([ownerRow("ann_5", "Fragile draft")]);
    mount();
    await waitFor(() =>
      expect(screen.getByText(/can.t be deleted yet/i)).toBeInTheDocument(),
    );
  });
});

describe("a failed first load is not an empty drafts list", () => {
  it("surfaces the failure with a retry instead of claiming nothing is there", async () => {
    listOwnerAnnouncements.mockRejectedValue(
      new BccApiError("bcc_unavailable", "RAW", 503, null),
    );
    mount();

    await waitFor(() =>
      expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument(),
    );
    // "Nothing unpublished" is a claim about what the server holds, and a
    // failed read does not support it — on this surface especially.
    expect(screen.queryByText(/Nothing unpublished/)).toBeNull();
    expect(screen.getByRole("button", { name: /^retry$/i })).toBeInTheDocument();
  });

  it("offers no retry against a permission boundary", async () => {
    listOwnerAnnouncements.mockRejectedValue(
      new BccApiError("bcc_forbidden", "RAW", 403, null),
    );
    mount();

    await waitFor(() =>
      expect(screen.getByText(/not the verified operator/i)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("button", { name: /^retry$/i })).toBeNull();
  });
});
