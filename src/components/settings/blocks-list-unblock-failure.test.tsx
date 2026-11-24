/**
 * A failed unblock must be visible. The mutation had no onError, so a
 * refused unblock just re-enabled the button and the row sat there as if
 * nothing had been tried. The failure now renders on that row, keyed on
 * err.code, and clears on the next attempt.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const fx = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

const row = (id: number) => ({
  user_id: id,
  handle: `user${id}`,
  display_name: `User ${id}`,
  avatar_url: "",
});

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/hooks/useBlocks", () => ({
  useMyBlocks: (page: number) => ({
    isPending: false,
    isError: false,
    isSuccess: true,
    isLoadingError: false,
    isRefetchError: false,
    error: null,
    refetch: vi.fn(),
    data: {
      items: [row(1), row(2)],
      pagination: { page, per_page: 20, total: 2, total_pages: 1 },
    },
  }),
  useUnblockUser: () => ({ mutateAsync: fx.mutateAsync, isPending: false }),
}));

import { BlocksList } from "@/components/settings/BlocksList";

beforeEach(() => {
  fx.mutateAsync.mockReset();
  // Default: the request never settles (an unblock still in flight).
  fx.mutateAsync.mockImplementation(() => new Promise(() => undefined));
});
afterEach(cleanup);

const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("BlocksList unblock failure", () => {
  it("shows a code-keyed failure on the row that failed, and only that row", async () => {
    fx.mutateAsync.mockRejectedValue(new BccApiError("bcc_rate_limited", "raw server prose", 429, null));
    render(<BlocksList />);

    fireEvent.click(within(rowOf("User 2")).getByRole("button", { name: "Unblock User 2" }));

    const alert = await within(rowOf("User 2")).findByRole("alert");
    expect(alert).toHaveTextContent("Slow down — too many unblock attempts. Wait a minute.");
    expect(alert.className).toContain("text-bcc-text-error");
    expect(within(rowOf("User 1")).queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/raw server prose/)).toBeNull();
    // The button names the failure for assistive tech.
    expect(within(rowOf("User 2")).getByRole("button", { name: "Unblock User 2" })).toHaveAttribute(
      "aria-describedby",
      alert.id,
    );
  });

  it("falls back to generic copy for an unmapped code", async () => {
    fx.mutateAsync.mockRejectedValue(new BccApiError("bcc_internal_error", "raw server prose", 500, null));
    render(<BlocksList />);
    fireEvent.click(within(rowOf("User 1")).getByRole("button", { name: "Unblock User 1" }));
    expect(await within(rowOf("User 1")).findByRole("alert")).toHaveTextContent("Couldn't unblock. Try again.");
  });

  it("clears the failure on retry", async () => {
    fx.mutateAsync.mockImplementationOnce(() => Promise.reject(new BccApiError("bcc_internal_error", "x", 500, null)));
    render(<BlocksList />);
    fireEvent.click(within(rowOf("User 1")).getByRole("button", { name: "Unblock User 1" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    // Retry is in flight (the default never settles).
    fireEvent.click(within(rowOf("User 1")).getByRole("button", { name: "Unblock User 1" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fx.mutateAsync).toHaveBeenCalledTimes(2);
  });
});
