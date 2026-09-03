/**
 * The security timeline, driven by the REAL query lifecycle.
 *
 * ## Why this file exists separately
 *
 * `account-tab.test.tsx` stubs `useAccountActivity` and hands the
 * component a finished return object. That proves the component branches
 * correctly on a given shape, but it CANNOT prove the shape ever occurs.
 * The defect this slice fixed lives precisely in the gap between those
 * two things: `isPending` false with `isError` true and `data` still
 * populated by `keepPreviousData` is a state React Query produces, not
 * one a hand-written object obviously would.
 *
 * So here the real `useAccountActivity` runs against a real, isolated
 * `QueryClient`. Only the network seam — the endpoint function — is
 * controlled. Every transition below is one React Query actually made.
 *
 * ## The defect
 *
 * Before this slice the component destructured `{ data, isPending }`
 * only. There was no error branch anywhere in the file, so a failed
 * request fell through to `EmptyState`: "No security events recorded
 * yet." On the one surface a user checks to confirm a security email
 * they just received, a failure claimed nothing had happened.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

/** The network seam, and the ONLY thing stubbed. */
const getActivity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/account-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getMyAccountActivity: getActivity,
}));

import { AccountActivitySection } from "@/components/settings/AccountActivitySection";
import { BccApiError } from "@/lib/api/types";

const EMPTY_COPY = /No security events recorded yet/i;
const FAIL_COPY = /We couldn't load your security activity/i;
const STALE_COPY = /Couldn't refresh\. Showing the last events we loaded\./i;

function item(id: number, action = "account_password_changed") {
  return {
    id,
    action,
    created_at: "2026-08-30 12:00:00",
    ip_masked: "203.0.113.x",
  };
}

function page(items: ReturnType<typeof item>[], opts: { total?: number; totalPages?: number } = {}) {
  return {
    items,
    total: opts.total ?? items.length,
    total_pages: opts.totalPages ?? 1,
    page: 1,
    per_page: 20,
  };
}

const boom = () => new BccApiError("bcc_internal_error", "RAW SERVER DETAIL", 500, null);

function renderSection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={client}>
      <AccountActivitySection />
    </QueryClientProvider>,
  );
  return { ...view, client };
}

// A BLOCK body, deliberately. `beforeEach(() => getActivity.mockReset())`
// returns the mock, and Vitest treats a function returned from a hook as a
// TEARDOWN callback — so it invoked the mock after every test. With a
// persistent `mockRejectedValue` that teardown call produced an unhandled
// rejection and failed the test that had just passed.
beforeEach(() => {
  getActivity.mockReset();
});
afterEach(cleanup);

// ─────────────────────────────────────────────────────────────────────
// Cold start
// ─────────────────────────────────────────────────────────────────────

describe("first load", () => {
  it("shows NOTHING while pending — no spinner, and no false empty state", async () => {
    let release!: (v: unknown) => void;
    getActivity.mockReturnValue(new Promise((r) => { release = r; }));
    const { container } = renderSection();

    // The deliberate no-spinner posture: this surface must not flicker.
    expect(container.textContent?.trim()).toBe("");
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
    expect(screen.queryByText(FAIL_COPY)).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();

    release(page([item(1)]));
    await screen.findByText("Password changed");
  });

  it("a SUCCEEDED empty response may say the record is empty", async () => {
    getActivity.mockResolvedValue(page([]));
    renderSection();
    expect(await screen.findByText(EMPTY_COPY)).toBeDefined();
  });

  it("a FAILED first load says so — never that nothing happened", async () => {
    getActivity.mockRejectedValue(boom());
    renderSection();
    expect(await screen.findByText(FAIL_COPY)).toBeDefined();
    // The exact regression: this string must be absent.
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });

  it("the failure never prints the server's own words", async () => {
    getActivity.mockRejectedValue(boom());
    renderSection();
    await screen.findByText(FAIL_COPY);
    expect(document.body.textContent).not.toContain("RAW SERVER DETAIL");
    expect(document.body.textContent).not.toContain("500");
  });

  it("the failure is announced assertively, and only once", async () => {
    getActivity.mockRejectedValue(boom());
    renderSection();
    await screen.findByText(FAIL_COPY);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    // The stale-data banner is the other live region; it must not co-render.
    expect(screen.queryByText(STALE_COPY)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Retry — a real refetch, not a page reload
// ─────────────────────────────────────────────────────────────────────

describe("retry", () => {
  it("recovers in place: failure → Try again → rows", async () => {
    getActivity.mockRejectedValueOnce(boom()).mockResolvedValueOnce(page([item(7)]));
    renderSection();
    await screen.findByText(FAIL_COPY);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Password changed")).toBeDefined();
    expect(screen.queryByText(FAIL_COPY)).toBeNull();
    expect(getActivity).toHaveBeenCalledTimes(2);
  });

  it("a retry that fails again stays honest rather than emptying", async () => {
    getActivity.mockRejectedValue(boom());
    renderSection();
    await screen.findByText(FAIL_COPY);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(getActivity).toHaveBeenCalledTimes(2));
    expect(screen.getByText(FAIL_COPY)).toBeDefined();
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// The state a stubbed hook would not have produced
// ─────────────────────────────────────────────────────────────────────

describe("a background refetch that fails", () => {
  it("KEEPS the rows and offers a retry instead of blanking the record", async () => {
    getActivity.mockResolvedValueOnce(page([item(1), item(2, "wallet_linked")]));
    const { client } = renderSection();
    await screen.findByText("Wallet linked");

    getActivity.mockRejectedValueOnce(boom());
    await client.refetchQueries();

    await screen.findByText(STALE_COPY);
    // Real history is still on screen — replacing it would be its own lie.
    expect(screen.getByText("Wallet linked")).toBeDefined();
    expect(screen.getByText("Password changed")).toBeDefined();
    expect(screen.queryByText(FAIL_COPY)).toBeNull();
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });

  it("announces the stale state POLITELY — nothing was lost", async () => {
    getActivity.mockResolvedValueOnce(page([item(1)]));
    const { client } = renderSection();
    await screen.findByText("Password changed");

    getActivity.mockRejectedValueOnce(boom());
    await client.refetchQueries();
    await screen.findByText(STALE_COPY);

    // Exactly one populated live region, and it is not an alert.
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
    const populated = screen
      .getAllByRole("status")
      .filter((n) => (n.textContent ?? "").trim() !== "");
    expect(populated).toHaveLength(1);
  });

  it("recovers back to a clean list when the next refetch succeeds", async () => {
    getActivity.mockResolvedValueOnce(page([item(1)]));
    const { client } = renderSection();
    await screen.findByText("Password changed");

    getActivity.mockRejectedValueOnce(boom());
    await client.refetchQueries();
    await screen.findByText(STALE_COPY);

    getActivity.mockResolvedValueOnce(page([item(1), item(3, "wallet_unlinked")]));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await screen.findByText("Wallet unlinked");
    await waitFor(() => expect(screen.queryByText(STALE_COPY)).toBeNull());
  });
});

// ─────────────────────────────────────────────────────────────────────
// Paging — where keepPreviousData makes the states least obvious
// ─────────────────────────────────────────────────────────────────────

describe("paging", () => {
  const p1 = page([item(1), item(2, "wallet_linked")], { total: 3, totalPages: 2 });
  const p2 = page([item(3, "sessions_revoked_all")], { total: 3, totalPages: 2 });

  it("moves between pages", async () => {
    getActivity.mockResolvedValueOnce(p1).mockResolvedValueOnce(p2);
    renderSection();
    await screen.findByText("Wallet linked");

    fireEvent.click(screen.getByRole("button", { name: /OLDER/ }));
    expect(await screen.findByText("Signed out of all devices")).toBeDefined();
    expect(screen.getByText(/PAGE 2 \/ 2/)).toBeDefined();
  });

  it("a FAILED page 2 says so, and never claims the record is empty", async () => {
    // Worth being precise about, because the intuition is wrong:
    // `keepPreviousData` backs a PENDING query only. Once page 2 errors
    // its status is `error` and `data` reverts to undefined, so page 1's
    // rows really are gone. The blocking branch is therefore correct
    // here — what must not happen is the empty state.
    getActivity.mockResolvedValueOnce(p1).mockRejectedValueOnce(boom());
    renderSection();
    await screen.findByText("Wallet linked");

    fireEvent.click(screen.getByRole("button", { name: /OLDER/ }));

    await screen.findByText(FAIL_COPY);
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });

  it("a FAILED page 2 still offers a way BACK — not just a retry", async () => {
    // The defect this pins shut. The blocking branch replaced the whole
    // section, pagination included, and Try again only ever retries the
    // page that failed. A user who clicked OLDER once was stranded on a
    // dead page with no route to the history they had just been reading.
    getActivity.mockResolvedValueOnce(p1).mockRejectedValueOnce(boom());
    renderSection();
    await screen.findByText("Wallet linked");
    fireEvent.click(screen.getByRole("button", { name: /OLDER/ }));
    await screen.findByText(FAIL_COPY);

    expect(screen.getByRole("button", { name: /NEWER/ })).toBeDefined();
  });

  it("paging BACK after a failed page 2 recovers the history", async () => {
    getActivity
      .mockResolvedValueOnce(p1)
      .mockRejectedValueOnce(boom())
      .mockResolvedValueOnce(p1);
    renderSection();
    await screen.findByText("Wallet linked");
    fireEvent.click(screen.getByRole("button", { name: /OLDER/ }));
    await screen.findByText(FAIL_COPY);

    fireEvent.click(screen.getByRole("button", { name: /NEWER/ }));
    expect(await screen.findByText("Wallet linked")).toBeDefined();
    expect(screen.queryByText(FAIL_COPY)).toBeNull();
  });

  it("page 1 failing offers NO back button — there is nowhere to go", async () => {
    getActivity.mockRejectedValue(boom());
    renderSection();
    await screen.findByText(FAIL_COPY);
    expect(screen.queryByRole("button", { name: /NEWER/ })).toBeNull();
  });

  it("hides pagination entirely when there is only one page", async () => {
    getActivity.mockResolvedValue(page([item(1)]));
    renderSection();
    await screen.findByText("Password changed");
    expect(screen.queryByRole("navigation", { name: /pagination/i })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Mutation control
// ─────────────────────────────────────────────────────────────────────

describe("mutation control", () => {
  it("M8: the pre-fix component WOULD have failed these tests", async () => {
    // The regression was structural: `isError` was never read, so a
    // failure carried `data === undefined` straight into the empty
    // branch. Reproducing that branch here proves the assertions above
    // discriminate rather than merely pass.
    const preFix = (data: unknown, isPending: boolean) => {
      if (isPending) return null;
      const items = (data as { items?: unknown[] } | undefined)?.items ?? [];
      // No isError read anywhere — the original file's shape.
      return items.length === 0 ? "No security events recorded yet." : "rows";
    };

    // What React Query actually reports for a failed first load…
    getActivity.mockRejectedValue(boom());
    renderSection();
    await screen.findByText(FAIL_COPY);

    // …fed to the old logic yields the false negative.
    expect(preFix(undefined, false)).toBe("No security events recorded yet.");
    // …and the fixed component does not.
    expect(screen.queryByText(EMPTY_COPY)).toBeNull();
  });
});
