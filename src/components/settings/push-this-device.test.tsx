/**
 * H5 — "Push notifications on this device" is about THIS device.
 *
 * It was bound to the account-wide `push.enabled`: on a second phone it
 * showed ticked while that phone received nothing, and the only way to add
 * the phone was to untick it (which turned push off on EVERY device) and
 * tick it again. Now the box is ticked only when this browser is
 * subscribed, unticking removes only this device, and turning push off
 * everywhere is its own button.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NotificationPrefs } from "@/lib/api/types";

const state = vi.hoisted(() => ({
  accountOn: true,
  browserSubscribed: false,
  // Built once per test: a fresh object on every render would look like a
  // cache update each time and re-seed the form forever.
  prefs: null as unknown,
}));
const enable = vi.hoisted(() => vi.fn());
const disable = vi.hoisted(() => vi.fn());
const removeThisDevice = vi.hoisted(() => vi.fn());

const prefs = (): NotificationPrefs => ({
  email_digest: false,
  bell: {} as NotificationPrefs["bell"],
  push: { enabled: state.accountOn, events: {} as NotificationPrefs["push"]["events"] },
  push_available: true,
});

vi.mock("@/hooks/useNotificationPrefs", () => ({
  useNotificationPrefs: () => ({
    data: state.prefs,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useUpdateNotificationPrefs: () => ({ mutate: vi.fn(), isPending: false }),
}));
const idle = (mutate: () => void) => ({ isPending: false, isError: false, error: null, mutate });
vi.mock("@/hooks/usePushSubscription", () => ({
  usePushSubscription: () => ({
    isSupported: true,
    isReady: true,
    browserSubscribed: state.browserSubscribed,
    enable: idle(enable),
    disable: idle(disable),
    removeThisDevice: idle(removeThisDevice),
  }),
}));
vi.mock("@/hooks/useDirtyRegistration", () => ({ useDirtyRegistration: () => {} }));

const { NotificationPrefsForm } = await import("@/components/settings/NotificationPrefsForm");

const DEVICE = { name: "Push notifications on this device" };
const ELSEWHERE = /this device isn.t receiving it/i;
const EVERYWHERE = { name: "Turn off push on every device" };

function setup(accountOn: boolean, browserSubscribed: boolean) {
  state.accountOn = accountOn;
  state.browserSubscribed = browserSubscribed;
  state.prefs = prefs();
}

beforeEach(() => {
  enable.mockReset();
  disable.mockReset();
  removeThisDevice.mockReset();
});
afterEach(cleanup);

describe("push: this device vs the account", () => {
  it("account on, this browser not subscribed: unticked, says so, and ticking adds this device", () => {
    setup(true, false);
    render(<NotificationPrefsForm />);

    const box = screen.getByRole("checkbox", DEVICE);
    expect(box).not.toBeChecked();
    expect(screen.getByText(ELSEWHERE)).toBeInTheDocument();

    fireEvent.click(box);
    expect(enable).toHaveBeenCalledTimes(1);
    expect(disable).not.toHaveBeenCalled();
  });

  it("account on, this browser subscribed: ticked; unticking removes THIS device only", () => {
    setup(true, true);
    render(<NotificationPrefsForm />);

    const box = screen.getByRole("checkbox", DEVICE);
    expect(box).toBeChecked();
    expect(screen.queryByText(ELSEWHERE)).toBeNull();

    fireEvent.click(box);
    expect(removeThisDevice).toHaveBeenCalledTimes(1);
    expect(disable).not.toHaveBeenCalled();
  });

  it("'Turn off push on every device' is the account-wide switch", () => {
    setup(true, true);
    render(<NotificationPrefsForm />);
    fireEvent.click(screen.getByRole("button", EVERYWHERE));
    expect(disable).toHaveBeenCalledTimes(1);
    expect(removeThisDevice).not.toHaveBeenCalled();
  });

  it("account off: unticked, no 'elsewhere' line, no every-device button", () => {
    setup(false, true); // a stale local subscription
    render(<NotificationPrefsForm />);
    expect(screen.getByRole("checkbox", DEVICE)).not.toBeChecked();
    expect(screen.queryByText(ELSEWHERE)).toBeNull();
    expect(screen.queryByRole("button", EVERYWHERE)).toBeNull();
  });
});
