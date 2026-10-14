/**
 * The notifications panel's three failure states, and the one that is
 * not retryable at all.
 *
 * ## What this pins
 *
 * The panel tested a blanket `list.isError` BEFORE reading the rows, and
 * its error branch carried no recovery control of any kind. Measured in a
 * browser against a recording API stub, 8 fixture notifications loaded
 * and then page 2 forced to 500:
 *
 *   rows before LOAD MORE : 8
 *   rows after it failed  : 0        ("Couldn't load notifications.")
 *   retry controls        : 0        — reload was the only way back
 *
 * TanStack keeps the three cases distinct, and they are mutually
 * exclusive (`isLoadingError = isError && !hasData`; for an infinite
 * query `isRefetchError` is narrowed by `&& !isFetchNextPageError &&
 * !isFetchPreviousPageError`), so each fixture below sets exactly one.
 *
 * ## Why the controls are shaped this way
 *
 * "A retry appears" would pass against a version that calls `refetch()`
 * for a failed LOAD MORE — which re-requests every page already loaded
 * instead of resuming the one cursor that failed. So each case asserts
 * WHICH function the control calls, and that the other was not called.
 *
 * "Rows survive" would pass against a version that also leaves LOAD MORE
 * mounted beside a failed cursor, letting the next press advance past —
 * and so silently skip — the page that failed. So the cursor case asserts
 * LOAD MORE is withdrawn, and the refresh case asserts it is NOT, since a
 * failed refresh leaves the retained cursor perfectly coherent.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

import { BccApiError } from "@/lib/api/types";

const refetch = vi.fn();
const fetchNextPage = vi.fn();
const markReadMutate = vi.fn();

const state = vi.hoisted(() => ({ list: null as unknown }));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => state.list,
  useUnreadCount: () => ({ data: { unread_count: 0 } }),
  useMarkReadMutation: () => ({ mutate: markReadMutate, isPending: false }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

const RAW = "raw server text that must never render";
const err = (code: string) => new BccApiError(code, RAW, 503, null);

function note(id: number) {
  return {
    id,
    type: "mention",
    message: "Member " + id + " mentioned you",
    created_at: "2026-10-01T12:00:00Z",
    read: false,
    actor: {
      id: 1000 + id,
      handle: "m" + id,
      display_name: "M" + id,
      avatar_url: "",
    },
    link: null,
  };
}

const listState = (over: Record<string, unknown> = {}) => ({
  isPending: false,
  isLoading: false,
  isError: false,
  isLoadingError: false,
  isRefetchError: false,
  isFetchNextPageError: false,
  isFetching: false,
  isFetchingNextPage: false,
  error: null,
  data: undefined,
  hasNextPage: false,
  fetchNextPage,
  refetch,
  ...over,
});

const TWO_ROWS = { pages: [{ items: [note(1), note(2)] }] };

function ui() {
  return render(<NotificationsPanel enabled open onNavigate={() => {}} />);
}

const rows = (c: HTMLElement) => within(c).queryAllByRole("menuitem").length;
const loadMore = (c: HTMLElement) =>
  within(c).queryByRole("button", { name: /^LOAD MORE$/i });
const retry = (c: HTMLElement) =>
  within(c).queryByRole("button", { name: /retry/i });

beforeEach(() => {
  refetch.mockClear();
  fetchNextPage.mockClear();
});

afterEach(cleanup);

describe("initial failure (isLoadingError)", () => {
  beforeEach(() => {
    state.list = listState({
      isError: true,
      isLoadingError: true,
      error: err("bcc_unavailable"),
    });
  });

  it("shows the failure with a Retry — the old branch had none", () => {
    const { container } = ui();
    expect(retry(container)).not.toBeNull();
    expect(rows(container)).toBe(0);
  });

  it("Retry refetches, and never advances a cursor there is none of", () => {
    const { container } = ui();
    fireEvent.click(retry(container) as HTMLElement);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("invents no LOAD MORE", () => {
    const { container } = ui();
    expect(loadMore(container)).toBeNull();
  });

  it("never renders the raw server message", () => {
    const { container } = ui();
    expect(container.textContent ?? "").not.toContain(RAW);
  });
});

describe("refresh failure (isRefetchError)", () => {
  beforeEach(() => {
    state.list = listState({
      isError: true,
      isRefetchError: true,
      error: err("bcc_unavailable"),
      data: TWO_ROWS,
      hasNextPage: true,
    });
  });

  it("keeps every loaded row on screen", () => {
    const { container } = ui();
    expect(rows(container)).toBe(2);
  });

  it("reports the failure without erasing the rows", () => {
    const { container } = ui();
    expect(retry(container)).not.toBeNull();
    expect(rows(container)).toBe(2);
  });

  it("Retry re-runs the refresh, never the cursor", () => {
    const { container } = ui();
    fireEvent.click(retry(container) as HTMLElement);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("KEEPS LOAD MORE — the retained cursor never failed", () => {
    const { container } = ui();
    expect(loadMore(container)).not.toBeNull();
  });

  it("does not show the empty state over retained rows", () => {
    const { container } = ui();
    expect(within(container).queryByText(/nothing on file/i)).toBeNull();
  });
});

describe("next-page failure (isFetchNextPageError)", () => {
  beforeEach(() => {
    state.list = listState({
      isError: true,
      isFetchNextPageError: true,
      error: err("bcc_unavailable"),
      data: TWO_ROWS,
      hasNextPage: true,
    });
  });

  it("keeps every loaded row on screen", () => {
    const { container } = ui();
    expect(rows(container)).toBe(2);
  });

  it("Retry resumes the FAILED cursor and never restarts the loaded pages", () => {
    const { container } = ui();
    fireEvent.click(retry(container) as HTMLElement);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });

  it("WITHDRAWS LOAD MORE so the failed cursor cannot be skipped", () => {
    const { container } = ui();
    expect(loadMore(container)).toBeNull();
  });
});

describe("a failed refresh is not an empty inbox", () => {
  it("withholds the empty state while the query is in error", () => {
    // "You have no notifications" is a claim about the server. A failed
    // read does not support it.
    state.list = listState({
      isError: true,
      isRefetchError: true,
      error: err("bcc_unavailable"),
      data: { pages: [{ items: [] }] },
    });
    const { container } = ui();
    expect(within(container).queryByText(/nothing on file/i)).toBeNull();
  });

  it("still shows it on a genuine success", () => {
    state.list = listState({ data: { pages: [{ items: [] }] } });
    const { container } = ui();
    expect(within(container).queryByText(/nothing on file/i)).not.toBeNull();
  });
});

describe("a permission denial is not endlessly retryable", () => {
  it.each(["bcc_permission_denied", "bcc_forbidden", "bcc_blocked"])(
    "%s on a first load offers NO retry control",
    (code) => {
      state.list = listState({
        isError: true,
        isLoadingError: true,
        error: err(code),
      });
      const { container } = ui();
      expect(retry(container)).toBeNull();
      // Absent, not disabled: an inert button still tells the viewer
      // that retrying is the shape of the answer here.
      expect(within(container).queryAllByRole("button")).toHaveLength(0);
    },
  );

  it("a denied CURSOR keeps the loaded rows and still offers no retry", () => {
    state.list = listState({
      isError: true,
      isFetchNextPageError: true,
      error: err("bcc_permission_denied"),
      data: TWO_ROWS,
      hasNextPage: true,
    });
    const { container } = ui();
    expect(rows(container)).toBe(2);
    expect(retry(container)).toBeNull();
    expect(loadMore(container)).toBeNull();
  });

  it("a transient failure DOES still offer one", () => {
    // The control that stops the denial rule swallowing every retry.
    state.list = listState({
      isError: true,
      isLoadingError: true,
      error: err("bcc_rate_limited"),
    });
    const { container } = ui();
    expect(retry(container)).not.toBeNull();
  });

  it("an unauthorized read still offers one — auth can recover elsewhere", () => {
    state.list = listState({
      isError: true,
      isLoadingError: true,
      error: err("bcc_unauthorized"),
    });
    const { container } = ui();
    expect(retry(container)).not.toBeNull();
    expect(screen.getByRole("alert").textContent ?? "").toMatch(/sign in/i);
  });
});
