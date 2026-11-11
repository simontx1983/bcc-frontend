import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Unblocking the only row on page 2+ refetches an empty page. BlocksList
 * rendered that as the "NONE ON FILE" empty state — which also unmounts
 * the pager — so the user was stranded away from page 1 and told they
 * had blocked nobody. It must step back to the last real page instead.
 */

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

interface Row {
  user_id: number;
  handle: string;
  display_name: string;
  avatar_url: string;
}

const row = (id: number): Row => ({
  user_id: id,
  handle: `user${id}`,
  display_name: `User ${id}`,
  avatar_url: "",
});

const store: { pages: Record<number, Row[]>; totalPages: number } = {
  pages: {},
  totalPages: 2,
};

vi.mock("@/hooks/useBlocks", () => ({
  useMyBlocks: (page: number) => {
    const items = store.pages[page] ?? [];
    return {
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn(),
      data: {
        items,
        pagination: {
          page,
          per_page: 1,
          total: store.totalPages,
          total_pages: store.totalPages,
        },
      },
    };
  },
  useUnblockUser: () => ({
    mutate: (_id: number, opts: { onSettled?: () => void }) => {
      // Server accepted the unblock (async, like the real mutation); the
      // trailing page is now empty.
      setTimeout(() => {
        store.pages[2] = [];
        store.totalPages = 1;
        opts.onSettled?.();
      }, 0);
    },
    isPending: false,
  }),
}));

import { BlocksList } from "@/components/settings/BlocksList";

afterEach(() => {
  cleanup();
});

describe("BlocksList page overflow", () => {
  it("steps back to the last real page after unblocking the only row on page 2", async () => {
    store.pages = { 1: [row(1)], 2: [row(2)] };
    store.totalPages = 2;
    const { container } = render(<BlocksList />);
    const view = within(container);

    fireEvent.click(view.getByRole("button", { name: /NEXT/ }));
    expect(view.getByText("User 2")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "UNBLOCK" }));
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    await waitFor(() => expect(view.getByText("User 1")).toBeInTheDocument());
    expect(view.queryByText("NONE ON FILE")).toBeNull();
  });

  it("control: a genuinely empty page 1 still shows the empty state", () => {
    store.pages = { 1: [] };
    store.totalPages = 0;
    const { container } = render(<BlocksList />);

    expect(within(container).getByText("NONE ON FILE")).toBeInTheDocument();
  });
});
