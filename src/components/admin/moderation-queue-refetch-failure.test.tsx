/**
 * A failed REFRESH must not blank the moderation queue.
 *
 * Every resolve and every undo invalidates ADMIN_REPORTS_QUERY_KEY_ROOT,
 * so the queue refetches constantly while a moderator works it. The old
 * blanket `isError` branch meant one failed refetch replaced every report
 * on screen — and the filters above them — with an error line.
 *
 *   isLoadingError               → the existing QueueError panel
 *   isRefetchError (transient)   → keep the reports, inline Retry
 *   isRefetchError (admin denial)→ QueueError's admin-required panel; the
 *                                  server's latest answer is "no"
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const refetch = vi.fn();
const state = vi.hoisted(() => ({ result: null as unknown }));

vi.mock("@/hooks/useAdminReports", () => ({
  ADMIN_REPORTS_QUERY_KEY_ROOT: ["admin", "reports"],
  DEFAULT_ADMIN_REPORTS_FILTERS: {
    status: "pending",
    reason: null,
    reporterHandle: "",
    postKind: null,
    since: "",
    until: "",
  },
  useAdminReports: () => state.result,
  useResolveAdminReport: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useUndoAdminReport: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ModerationQueue } from "@/components/admin/ModerationQueue";

beforeAll(() => {
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
});

beforeEach(() => {
  refetch.mockClear();
  state.result = null;
});

afterEach(cleanup);

const RAW = "raw server text that must never render";

const QUEUE = {
  items: [
    {
      id: 77,
      status: 0,
      status_label: "Pending",
      reason_code: "spam",
      comment: "Obvious link farm.",
      created_at: "2026-11-01T00:00:00Z",
      reporter: { user_id: 3, handle: "ada", display_name: "Ada", profile_url: "/u/ada" },
      target: {
        target_kind: "feed_item",
        target_id: 501,
        preview: "Buy cheap followers here",
        post_kind: "status",
        post_url: "",
        author_id: 9,
        posted_at: "2026-10-31T00:00:00Z",
      },
      currently_hidden: false,
    },
  ],
  pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
};

function result(branch: "first" | "refetch", code = "bcc_unavailable") {
  return {
    isPending: false,
    isLoading: false,
    isSuccess: false,
    isError: true,
    isLoadingError: branch === "first",
    isRefetchError: branch === "refetch",
    error: new BccApiError(code, RAW, 503, null),
    data: branch === "first" ? undefined : QUEUE,
    refetch,
  };
}

const report = () => screen.queryByText(/Buy cheap followers here/);

describe("ModerationQueue — failed refresh", () => {
  it("keeps the reports on screen when a REFRESH fails", () => {
    state.result = result("refetch");
    render(<ModerationQueue />);
    expect(report()).not.toBeNull();
  });

  it("says so inline, with a Retry that refetches the queue", () => {
    state.result = result("refetch");
    render(<ModerationQueue />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/temporarily unavailable/i);
    expect(alert.textContent ?? "").not.toContain(RAW);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("withholds QUEUE CLEAR when the empty page may be stale", () => {
    state.result = { ...result("refetch"), data: { ...QUEUE, items: [] } };
    render(<ModerationQueue />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/queue clear/i)).toBeNull();
  });

  it("a FIRST-load failure still shows the error state", () => {
    state.result = result("first");
    render(<ModerationQueue />);
    expect(screen.getByRole("alert")).toHaveTextContent(/temporarily unavailable/i);
    expect(report()).toBeNull();
  });

  it.each(["bcc_forbidden", "rest_forbidden"])(
    "a refresh REFUSED with %s shows the admin-required panel, not stale reports",
    (code) => {
      state.result = result("refetch", code);
      render(<ModerationQueue />);
      expect(screen.getByText(/admin access required/i)).toBeInTheDocument();
      expect(report()).toBeNull();
    },
  );
});
