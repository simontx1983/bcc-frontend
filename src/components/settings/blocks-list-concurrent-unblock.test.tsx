/**
 * F-446: two rows' unblocks in flight at once stay independent.
 *
 * BlocksList called `mutate(id, { onSuccess, onError, onSettled })` and
 * kept one `pendingId` and one `failure` slot. TanStack runs mutate()'s
 * per-call callbacks for the LATEST call only, so with row A and then
 * row B in flight:
 *   - A's failure was never shown (its onError never ran);
 *   - pressing B cleared A's shown failure, and whichever settled first
 *     cleared the other's busy state.
 * Each press now awaits its own mutateAsync promise, and busy and failure
 * state is kept per row.
 *
 * Real hooks and a real QueryClient; each row's request is a deferred
 * the test settles in the order it wants.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type MyBlockEntry, type MyBlocksResponse } from "@/lib/api/types";

const fx = vi.hoisted(() => ({
  getMyBlocks: vi.fn(),
  unblockUser: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/lib/api/blocks-endpoints", () => ({
  getMyBlocks: fx.getMyBlocks,
  unblockUser: fx.unblockUser,
  blockUser: vi.fn(),
}));

import { BlocksList } from "@/components/settings/BlocksList";

function member(user_id: number, handle: string, display_name: string): MyBlockEntry {
  return { user_id, handle, display_name, avatar_url: "", profile_url: `/u/${handle}` };
}
const anvil = member(11, "anvil", "Anvil Smith");
const rivet = member(12, "rivet", "Rivet Jones");

const page = (items: MyBlockEntry[]): MyBlocksResponse => ({
  items,
  pagination: { page: 1, per_page: 20, total: items.length, total_pages: 1 },
});

interface Deferred {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}
/** One pending request per user id, settled by the test. */
let requests: Map<number, Deferred>;

function renderList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BlocksList />
    </QueryClientProvider>,
  );
}

const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;
const button = (name: string) => within(rowOf(name)).getByRole("button");
const rateLimited = () => new BccApiError("bcc_rate_limited", "raw server prose", 429, null);

async function pressBoth() {
  await screen.findByText("Anvil Smith");
  await act(async () => {
    fireEvent.click(button("Anvil Smith"));
  });
  await act(async () => {
    fireEvent.click(button("Rivet Jones"));
  });
  await waitFor(() => expect(requests.size).toBe(2));
}

async function settle(userId: number, outcome: "ok" | "fail") {
  const d = requests.get(userId);
  if (d === undefined) throw new Error(`no request for ${userId}`);
  await act(async () => {
    if (outcome === "ok") d.resolve({ ok: true, user_id: userId, removed: true });
    else d.reject(rateLimited());
  });
}

beforeEach(() => {
  requests = new Map();
  fx.getMyBlocks.mockReset();
  fx.unblockUser.mockReset();
  fx.getMyBlocks.mockResolvedValue(page([anvil, rivet]));
  fx.unblockUser.mockImplementation(
    (userId: number) =>
      new Promise((resolve, reject) => {
        requests.set(userId, { resolve, reject });
      }),
  );
});
afterEach(cleanup);

describe("BlocksList — two unblocks in flight (F-446)", () => {
  it("both rows are busy at once", async () => {
    renderList();
    await pressBoth();

    expect(button("Anvil Smith")).toHaveAccessibleName("Working… unblocking Anvil Smith");
    expect(button("Rivet Jones")).toHaveAccessibleName("Working… unblocking Rivet Jones");
    expect(button("Anvil Smith")).toHaveAttribute("aria-busy", "true");
    expect(button("Rivet Jones")).toHaveAttribute("aria-busy", "true");
  });

  it("the FIRST row's failure shows while the second is still in flight", async () => {
    renderList();
    await pressBoth();
    await settle(anvil.user_id, "fail");

    expect(await within(rowOf("Anvil Smith")).findByRole("alert")).toHaveTextContent(
      "Slow down — too many unblock attempts. Wait a minute.",
    );
    expect(button("Anvil Smith")).toHaveAccessibleName("Unblock Anvil Smith");
    expect(button("Anvil Smith")).not.toHaveAttribute("aria-busy");
    // The other row is untouched: still busy, no failure.
    expect(button("Rivet Jones")).toHaveAccessibleName("Working… unblocking Rivet Jones");
    expect(within(rowOf("Rivet Jones")).queryByRole("alert")).toBeNull();
  });

  it("one row settling does not end the other row's busy state", async () => {
    fx.getMyBlocks.mockResolvedValueOnce(page([anvil, rivet])).mockResolvedValue(page([rivet]));
    renderList();
    await pressBoth();
    await settle(anvil.user_id, "ok");

    await waitFor(() => expect(screen.queryByText("Anvil Smith")).toBeNull());
    expect(button("Rivet Jones")).toHaveAccessibleName("Working… unblocking Rivet Jones");
    expect(button("Rivet Jones")).toHaveAttribute("aria-busy", "true");
  });

  it("pressing another row keeps the first row's failure; each row clears only its own", async () => {
    renderList();
    await screen.findByText("Anvil Smith");
    await act(async () => {
      fireEvent.click(button("Anvil Smith"));
    });
    await waitFor(() => expect(requests.has(anvil.user_id)).toBe(true));
    await settle(anvil.user_id, "fail");
    await within(rowOf("Anvil Smith")).findByRole("alert");

    // Another row's press leaves Anvil's failure in place…
    await act(async () => {
      fireEvent.click(button("Rivet Jones"));
    });
    expect(within(rowOf("Anvil Smith")).getByRole("alert")).toBeInTheDocument();
    // …and its own failure joins it.
    await waitFor(() => expect(requests.has(rivet.user_id)).toBe(true));
    await settle(rivet.user_id, "fail");
    await within(rowOf("Rivet Jones")).findByRole("alert");
    expect(screen.getAllByRole("alert")).toHaveLength(2);

    // Retrying Anvil clears Anvil's failure only.
    requests.delete(anvil.user_id);
    await act(async () => {
      fireEvent.click(button("Anvil Smith"));
    });
    expect(within(rowOf("Anvil Smith")).queryByRole("alert")).toBeNull();
    expect(within(rowOf("Rivet Jones")).getByRole("alert")).toBeInTheDocument();
  });

  it("each row's failure is named on its own button", async () => {
    renderList();
    await pressBoth();
    await settle(rivet.user_id, "fail");
    await settle(anvil.user_id, "fail");

    const anvilAlert = await within(rowOf("Anvil Smith")).findByRole("alert");
    const rivetAlert = within(rowOf("Rivet Jones")).getByRole("alert");
    expect(button("Anvil Smith")).toHaveAttribute("aria-describedby", anvilAlert.id);
    expect(button("Rivet Jones")).toHaveAttribute("aria-describedby", rivetAlert.id);
    expect(anvilAlert.id).not.toBe(rivetAlert.id);
  });
});
