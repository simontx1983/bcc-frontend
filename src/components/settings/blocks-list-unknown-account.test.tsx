/**
 * A blocked id with no member behind it. `POST /me/blocks` accepts any
 * positive user id (bcc-trust #736), and a member can be deleted after
 * being blocked. Since bcc-trust #759 (contract #334), `GET /me/blocks`
 * sends that row, and one whose profile the blocker may not view, with an
 * empty handle, display_name, avatar_url and profile_url (before it, a
 * `member-<id>` fallback). The list would print a lone "@" for an empty
 * row. It now reads "Unknown account", links nowhere, and Unblock still
 * removes it.
 *
 * Real hooks and a real QueryClient against stubbed endpoints, so the
 * Unblock press goes through useUnblockUser and the invalidation re-read.
 * The real Avatar renders too: its `asLink` path is the one place a /u/
 * link could come from.
 *
 * Each row's Unblock is named for its row ("Unblock Anvil Smith",
 * "Unblock Unknown account"): every button used to read just "UNBLOCK",
 * so a screen reader's list of buttons could not tell them apart.
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

import { BlocksList, UNKNOWN_ACCOUNT_COPY } from "@/components/settings/BlocksList";

const PHANTOM_ID = 9001;

const unknown: MyBlockEntry = {
  user_id: PHANTOM_ID,
  handle: "",
  display_name: "",
  avatar_url: "",
  profile_url: "",
};
const named: MyBlockEntry = {
  user_id: 12,
  handle: "anvil",
  display_name: "Anvil Smith",
  avatar_url: "",
  profile_url: "/u/anvil",
};
const handleOnly: MyBlockEntry = {
  user_id: 13,
  handle: "rivet",
  display_name: "",
  avatar_url: "",
  profile_url: "/u/rivet",
};
const nameOnly: MyBlockEntry = {
  user_id: 14,
  handle: "",
  display_name: "Weld Jones",
  avatar_url: "",
  profile_url: "",
};

const page = (items: MyBlockEntry[]): MyBlocksResponse => ({
  items,
  pagination: { page: 1, per_page: 20, total: items.length, total_pages: 1 },
});

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

const rowOf = (text: string) => screen.getByText(text).closest("li") as HTMLElement;
const findRow = async (text: string) =>
  (await screen.findByText(text)).closest("li") as HTMLElement;

beforeEach(() => {
  fx.getMyBlocks.mockReset();
  fx.unblockUser.mockReset();
});
afterEach(cleanup);

describe("BlocksList: a blocked id no member holds", () => {
  it('reads "Unknown account", never a bare "@", and links nowhere', async () => {
    fx.getMyBlocks.mockResolvedValue(page([unknown]));
    renderList();

    const row = await findRow(UNKNOWN_ACCOUNT_COPY);
    expect(within(row).queryByText("@")).toBeNull();
    expect(within(row).queryByText(/^@/)).toBeNull();
    expect(within(row).queryAllByRole("link")).toHaveLength(0);
    expect(row.innerHTML).not.toContain("/u/");
    // The avatar falls back to its "?" monogram rather than empty initials.
    expect(within(row).getByText("?")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: `Unblock ${UNKNOWN_ACCOUNT_COPY}` })).toBeEnabled();
  });

  it("Unblock sends that user id and the row leaves on the re-read", async () => {
    fx.getMyBlocks.mockResolvedValueOnce(page([named, unknown])).mockResolvedValue(page([named]));
    fx.unblockUser.mockResolvedValue({ ok: true, user_id: PHANTOM_ID, removed: true });
    renderList();

    const row = await findRow(UNKNOWN_ACCOUNT_COPY);
    fireEvent.click(within(row).getByRole("button", { name: `Unblock ${UNKNOWN_ACCOUNT_COPY}` }));

    await waitFor(() => expect(screen.queryByText(UNKNOWN_ACCOUNT_COPY)).toBeNull());
    expect(fx.unblockUser).toHaveBeenCalledTimes(1);
    expect(fx.unblockUser).toHaveBeenCalledWith(PHANTOM_ID);
    expect(fx.getMyBlocks).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Anvil Smith")).toBeInTheDocument();
  });

  it("a failed unblock is pinned to the unknown row", async () => {
    fx.getMyBlocks.mockResolvedValue(page([named, unknown]));
    fx.unblockUser.mockRejectedValue(new BccApiError("bcc_rate_limited", "raw server prose", 429, null));
    renderList();

    const row = await findRow(UNKNOWN_ACCOUNT_COPY);
    fireEvent.click(within(row).getByRole("button", { name: `Unblock ${UNKNOWN_ACCOUNT_COPY}` }));

    expect(await within(row).findByRole("alert")).toHaveTextContent(
      "Slow down — too many unblock attempts. Wait a minute.",
    );
    expect(within(rowOf("Anvil Smith")).queryByRole("alert")).toBeNull();
    expect(fx.unblockUser).toHaveBeenCalledWith(PHANTOM_ID);
  });

  // Controls: a row with any name keeps it.
  it("control: a named member still shows the name and the @handle", async () => {
    fx.getMyBlocks.mockResolvedValue(page([named, unknown]));
    renderList();

    const row = await findRow("Anvil Smith");
    expect(within(row).getByText("@anvil")).toBeInTheDocument();
    expect(within(row).queryByText(UNKNOWN_ACCOUNT_COPY)).toBeNull();
    expect(screen.getAllByText(UNKNOWN_ACCOUNT_COPY)).toHaveLength(1);
  });

  it("control: a member with a handle and no display name shows the @handle", async () => {
    fx.getMyBlocks.mockResolvedValue(page([handleOnly]));
    renderList();

    expect(await screen.findAllByText("@rivet")).not.toHaveLength(0);
    expect(screen.queryByText(UNKNOWN_ACCOUNT_COPY)).toBeNull();
  });

  it("control: a member with a display name and no handle shows the name", async () => {
    fx.getMyBlocks.mockResolvedValue(page([nameOnly]));
    renderList();

    expect(await screen.findByText("Weld Jones")).toBeInTheDocument();
    expect(screen.queryByText(UNKNOWN_ACCOUNT_COPY)).toBeNull();
  });
});

describe("BlocksList: each Unblock is named for its row", () => {
  it("names the button after the row: display name, else @handle, else Unknown account", async () => {
    fx.getMyBlocks.mockResolvedValue(page([named, handleOnly, nameOnly, unknown]));
    renderList();
    await screen.findByText("Anvil Smith");

    const expected: Array<[MyBlockEntry, string]> = [
      [named, "Unblock Anvil Smith"],
      [handleOnly, "Unblock @rivet"],
      [nameOnly, "Unblock Weld Jones"],
      [unknown, `Unblock ${UNKNOWN_ACCOUNT_COPY}`],
    ];
    const buttons = screen.getAllByRole("button", { name: /^Unblock / });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(expected.map(([, n]) => n));
    // The visible word stays, and starts the name (label in name).
    for (const b of buttons) expect(b).toHaveTextContent("UNBLOCK");
  });

  it("each name sits on its own row and unblocks that row's id", async () => {
    fx.getMyBlocks.mockResolvedValue(page([named, handleOnly]));
    fx.unblockUser.mockReturnValue(new Promise(() => undefined));
    renderList();

    const button = await screen.findByRole("button", { name: "Unblock @rivet" });
    // "@rivet" is both the row's name and its handle line; either finds the row.
    expect(button.closest("li")).toBe(screen.getAllByText("@rivet")[0]?.closest("li"));
    expect(within(rowOf("Anvil Smith")).queryByRole("button", { name: "Unblock @rivet" })).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(fx.unblockUser).toHaveBeenCalledTimes(1));
    expect(fx.unblockUser).toHaveBeenCalledWith(handleOnly.user_id);
  });

  it("in flight: the name says it is working, the button is busy, the other row is untouched", async () => {
    fx.getMyBlocks.mockResolvedValue(page([named, unknown]));
    fx.unblockUser.mockReturnValue(new Promise(() => undefined));
    renderList();

    const button = await screen.findByRole("button", { name: "Unblock Anvil Smith" });
    await act(async () => {
      fireEvent.click(button);
    });

    // Busy via aria-disabled/aria-busy (blocks-list-busy-focus.test.tsx
    // pins why it is not `disabled`).
    const working = screen.getByRole("button", { name: "Working… unblocking Anvil Smith" });
    expect(working).toHaveAttribute("aria-disabled", "true");
    expect(working).toHaveAttribute("aria-busy", "true");
    expect(working).toHaveTextContent("WORKING…");
    const other = screen.getByRole("button", { name: `Unblock ${UNKNOWN_ACCOUNT_COPY}` });
    expect(other).toBeEnabled();
    expect(other).not.toHaveAttribute("aria-disabled");
  });
});
