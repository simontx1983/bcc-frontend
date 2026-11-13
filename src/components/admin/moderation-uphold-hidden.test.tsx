import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * F-306: a pending report on a post that is ALREADY hidden (auto-hide, or
 * an earlier admin hide of a sibling report) must offer the Uphold verdict.
 * Before, the queue suppressed Hide whenever `currently_hidden` was true, so
 * the only way to clear such a report was Dismiss, which records it as NOT
 * upheld. Uphold sends the same `hide` action; the server keeps the hide and
 * closes every pending report on the post as upheld.
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

const mutate = vi.fn();
const row = { status: 0, currently_hidden: true };

vi.mock("@/hooks/useAdminReports", () => ({
  DEFAULT_ADMIN_REPORTS_FILTERS: {
    status: "pending",
    reason: null,
    reporterHandle: "",
    postKind: null,
    since: "",
    until: "",
  },
  useAdminReports: () => ({
    isPending: false,
    isError: false,
    error: null,
    data: {
      items: [
        {
          id: 11,
          status: row.status,
          status_label: row.status === 0 ? "Pending" : "Resolved",
          reason_code: "spam",
          comment: "",
          created_at: "2026-11-10T00:00:00Z",
          reporter: { user_id: 3, handle: "anvil", display_name: "Anvil", profile_url: "" },
          target: {
            target_kind: "feed_item",
            target_id: 99,
            preview: "post body",
            post_kind: "status",
            post_url: "",
            author_id: 4,
            posted_at: "2026-11-09T00:00:00Z",
          },
          currently_hidden: row.currently_hidden,
        },
      ],
      pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    },
  }),
  useResolveAdminReport: () => ({
    mutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

import { ModerationQueue } from "@/components/admin/ModerationQueue";

afterEach(() => {
  cleanup();
  mutate.mockReset();
  row.status = 0;
  row.currently_hidden = true;
});

describe("ModerationQueue uphold on an already-hidden post", () => {
  it("offers Uphold, Restore and Dismiss on a pending row whose post is hidden", () => {
    render(<ModerationQueue />);

    expect(screen.getByRole("button", { name: /uphold/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /restore/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^hide/i })).toBeNull();
  });

  it("Uphold sends the hide action", () => {
    render(<ModerationQueue />);

    fireEvent.click(screen.getByRole("button", { name: /uphold/i }));

    expect(mutate).toHaveBeenCalledWith("hide", expect.anything());
  });

  it("the H shortcut upholds the focused hidden row", () => {
    render(<ModerationQueue />);

    fireEvent.keyDown(window, { key: "h" });

    expect(mutate).toHaveBeenCalledWith("hide", expect.anything());
  });

  it("control: a visible pending post still says Hide", () => {
    row.currently_hidden = false;
    render(<ModerationQueue />);

    expect(screen.getByRole("button", { name: /^hide/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /uphold/i })).toBeNull();
  });

  it("control: a closed report offers no Uphold", () => {
    row.status = 1;
    render(<ModerationQueue />);

    expect(screen.queryByRole("button", { name: /uphold/i })).toBeNull();
    fireEvent.keyDown(window, { key: "h" });
    expect(mutate).not.toHaveBeenCalled();
  });
});
