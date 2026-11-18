/**
 * `bcc_announcement_hidden` and `bcc_announcement_restored` (F-307) are
 * bell-only: each gets one bell toggle, and the push section has no row for
 * either. Fixtures only.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationPrefs } from "@/lib/api/types";

const mutate = vi.hoisted(() => vi.fn());

const PREFS: NotificationPrefs = {
  email_digest: false,
  bell: {
    bcc_announcement_hidden: true,
    bcc_announcement_restored: true,
  } as NotificationPrefs["bell"],
  push: { enabled: true, events: {} as NotificationPrefs["push"]["events"] },
  push_available: true,
};

vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => ({
    data: PREFS,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateNotificationPrefs: () => ({ mutate, isPending: false }),
}));
vi.mock("@/hooks/usePushSubscription", () => ({
  usePushSubscription: () => ({
    isSupported: true,
    isReady: true,
    browserSubscribed: true,
    enable: { isPending: false, isError: false, error: null, mutate: vi.fn() },
    disable: { isPending: false, isError: false, error: null, mutate: vi.fn() },
    removeThisDevice: { isPending: false, isError: false, error: null, mutate: vi.fn() },
  }),
}));

import { NotificationPrefsForm } from "@/components/settings/NotificationPrefsForm";

const ROWS = [
  { key: "bcc_announcement_hidden", label: /Announcement hidden by a moderator/ },
  { key: "bcc_announcement_restored", label: /Announcement restored/ },
] as const;

beforeEach(() => mutate.mockReset());
afterEach(cleanup);

describe("announcement moderation notice preferences", () => {
  it("each appears exactly once, with the push section open, so never as a push toggle", () => {
    render(<NotificationPrefsForm />);

    // The push section is rendering its event rows, or this proves nothing.
    expect(screen.getByRole("heading", { name: "Browser push" })).toBeInTheDocument();

    for (const row of ROWS) {
      expect(screen.getAllByText(row.label)).toHaveLength(1);
    }
  });

  it.each(ROWS)("$key saves as a bell preference and nothing else", ({ key, label }) => {
    render(<NotificationPrefsForm />);

    const toggle = screen.getByRole("checkbox", { name: label });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({ bell: { [key]: false } });
  });
});
