import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * F-311 (M6): after the last rows of page 2 are resolved, the server answers
 * page 2 with no items while total_pages drops to 1. The queue used to stay
 * on page 2 showing "QUEUE CLEAR" with no pagination bar to leave it. It now
 * steps back to the last real page.
 */

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => true,
}));
vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const server = { totalPages: 2 };
const pagesRequested: number[] = [];

vi.mock("@/hooks/useAdminReports", () => ({
  DEFAULT_ADMIN_REPORTS_FILTERS: {
    status: "pending",
    reason: null,
    reporterHandle: "",
    postKind: null,
    since: "",
    until: "",
  },
  useAdminReports: (_filters: unknown, page: number) => {
    pagesRequested.push(page);
    return {
      isPending: false,
      isError: false,
      error: null,
      data: {
        items: [],
        pagination: { page, per_page: 20, total: 25, total_pages: server.totalPages },
      },
    };
  },
  useResolveAdminReport: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));

import { ModerationQueue } from "@/components/admin/ModerationQueue";

afterEach(() => {
  cleanup();
  pagesRequested.length = 0;
  server.totalPages = 2;
});

describe("ModerationQueue page clamp", () => {
  it("stays on a page that still exists", () => {
    render(<ModerationQueue />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(pagesRequested.at(-1)).toBe(2);
  });

  it("steps back to the last real page when the current one empties out", () => {
    render(<ModerationQueue />);
    // The admin resolves the last rows of page 2: from now on the server
    // has a single page left.
    server.totalPages = 1;
    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    expect(pagesRequested).toContain(2);
    expect(pagesRequested.at(-1)).toBe(1);
  });
});
