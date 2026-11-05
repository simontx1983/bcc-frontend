/**
 * `bcc_delegator_group_removed` is bell-only: it gets a bell toggle, and the
 * push section has no row for it. Fixtures only.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationPrefs } from "@/lib/api/types";

const mutate = vi.hoisted(() => vi.fn());

const PREFS: NotificationPrefs = {
  email_digest: false,
  bell: { bcc_delegator_group_removed: true } as NotificationPrefs["bell"],
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
  }),
}));

import { NotificationPrefsForm } from "@/components/settings/NotificationPrefsForm";

const LABEL = /Removed from a delegator group/;

beforeEach(() => mutate.mockReset());
afterEach(cleanup);

describe("delegator group removal notice preference", () => {
  it("appears exactly once, with the push section open, so never as a push toggle", () => {
    render(<NotificationPrefsForm />);

    // The push section is rendering its event rows, or this proves nothing.
    expect(screen.getByRole("heading", { name: "Browser push" })).toBeInTheDocument();
    expect(screen.getByText("Push when someone backs you — scarce, high-conviction signal.")).toBeInTheDocument();

    expect(screen.getAllByText(LABEL)).toHaveLength(1);
  });

  it("saves as a bell preference and nothing else", () => {
    render(<NotificationPrefsForm />);

    const toggle = screen.getByRole("checkbox", { name: LABEL });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith({
      bell: { bcc_delegator_group_removed: false },
    });
  });
});
