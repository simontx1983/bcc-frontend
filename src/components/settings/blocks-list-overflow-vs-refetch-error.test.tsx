/**
 * BlocksList: the empty-page overflow guard (#222) and the refetch-error
 * split (#223) both branch on an empty page. They must compose. When a
 * page-N refresh FAILS with no rows, the failure shows: it is never
 * hidden behind the overflow skeleton, and never read as "none on file".
 * The overflow guard only acts on a SUCCESSFUL empty page.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const { BccApiError } = await import("@/lib/api/types");

const row = { user_id: 1, handle: "user1", display_name: "User 1", avatar_url: "" };

vi.mock("@/hooks/useBlocks", () => ({
  useMyBlocks: (page: number) => {
    const pagination = { page, per_page: 1, total: 2, total_pages: 2 };
    if (page === 1) {
      return {
        isPending: false, isError: false, isSuccess: true,
        isLoadingError: false, isRefetchError: false,
        error: null, refetch: vi.fn(),
        data: { items: [row], pagination },
      };
    }
    // Page 2: data on hand is empty and the latest refresh failed.
    return {
      isPending: false, isError: true, isSuccess: false,
      isLoadingError: false, isRefetchError: true,
      error: new BccApiError("bcc_unavailable", "raw", 503, null),
      refetch: vi.fn(),
      data: { items: [], pagination },
    };
  },
  useUnblockUser: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { BlocksList } from "@/components/settings/BlocksList";

afterEach(cleanup);

describe("BlocksList — overflow guard vs a failed page-N refresh", () => {
  it("shows the failure on an empty page whose refresh failed, not the skeleton or the empty state", () => {
    render(<BlocksList />);
    fireEvent.click(screen.getByRole("button", { name: /NEXT/ }));

    expect(screen.queryByLabelText("Loading blocks")).toBeNull();
    expect(screen.getByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.queryByText(/none on file/i)).toBeNull();
  });
});
