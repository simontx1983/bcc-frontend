import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The Hide / Dismiss / Restore buttons are `disabled` while a row's
 * resolve is in flight, but the H / D / R shortcuts dispatched straight
 * into `mutation.mutate`, so a held or repeated key stacked a second
 * resolve on the same report. The shortcut path must respect the same
 * `isPending` guard. The control case proves the shortcut still fires
 * when nothing is pending, so the guard is not just "shortcuts dead".
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
const mutationState = { isPending: false };

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
          status: 0,
          status_label: "Pending",
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
          currently_hidden: false,
        },
      ],
      pagination: { page: 1, per_page: 20, total: 1, total_pages: 1 },
    },
  }),
  useResolveAdminReport: () => ({
    mutate,
    isPending: mutationState.isPending,
    isError: false,
    error: null,
  }),
}));

import { ModerationQueue } from "@/components/admin/ModerationQueue";

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

describe("ModerationQueue keyboard shortcuts", () => {
  it("does not dispatch H/D while the focused row's resolve is pending", () => {
    mutationState.isPending = true;
    render(<ModerationQueue />);

    fireEvent.keyDown(window, { key: "h" });
    fireEvent.keyDown(window, { key: "d" });

    expect(mutate).not.toHaveBeenCalled();
  });

  it("control: dispatches H when nothing is pending", () => {
    mutationState.isPending = false;
    render(<ModerationQueue />);

    fireEvent.keyDown(window, { key: "h" });

    expect(mutate).toHaveBeenCalledWith("hide", expect.anything());
  });

  it("two presses in the same tick (isPending still false) dispatch only once", () => {
    // isPending only flips on the next render; the synchronous ref latch
    // must stop the second press.
    mutationState.isPending = false;
    render(<ModerationQueue />);

    fireEvent.keyDown(window, { key: "h" });
    fireEvent.keyDown(window, { key: "d" });

    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
